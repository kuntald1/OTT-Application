import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ai_services import get_embedding, cosine_similarity, AIServiceError
from app.config import settings
from app.database import get_db
from app.deps import get_current_user, get_current_user_optional
from app.models import (
    User, Video, VideoStatus, VideoEmbedding, VideoCast, VideoCrew, Person, VideoCategory,
    VideoWatchRecord, VideoLike,
)
from app.routers.videos import _to_out
from app.schemas import VideoOut

router = APIRouter(prefix="/videos", tags=["recommendations"])


def _build_embedding_text(video: Video, db: Session) -> str:
    """What actually gets embedded — title, description, categories,
    and cast/crew names, so similarity captures genre/theme/people
    overlap, not just surface text matching. Categories come from the
    VideoCategory table (up to 3 per video), not a Video.categories
    attribute — that's not how multi-category storage works here (see
    VideoCategory's docstring).
    """
    category_rows = db.query(VideoCategory.category).filter(VideoCategory.video_id == video.id).all()
    categories = [c for (c,) in category_rows]
    parts = [video.title, video.description or "", ", ".join(categories)]
    cast_names = (
        db.query(Person.name)
        .join(VideoCast, VideoCast.person_id == Person.id)
        .filter(VideoCast.video_id == video.id)
        .all()
    )
    crew_names = (
        db.query(Person.name)
        .join(VideoCrew, VideoCrew.person_id == Person.id)
        .filter(VideoCrew.video_id == video.id)
        .all()
    )
    parts.append(", ".join(n for (n,) in cast_names))
    parts.append(", ".join(n for (n,) in crew_names))
    return " | ".join(p for p in parts if p)


def compute_and_store_embedding(video: Video, db: Session) -> bool:
    """Best-effort — called right after a video is published. Never
    raises: a Voyage AI outage or missing API key should never block
    publishing a video, it should just mean that video temporarily has
    no embedding (recommendations involving it degrade gracefully —
    the queries below simply skip videos with no row here). An admin
    can manually retry via POST /admin/videos/{id}/recompute-embedding.
    """
    try:
        text = _build_embedding_text(video, db)
        vector = get_embedding(text)
        existing = db.query(VideoEmbedding).filter(VideoEmbedding.video_id == video.id).first()
        if existing:
            existing.vector_json = json.dumps(vector)
            existing.model = settings.VOYAGE_MODEL
        else:
            db.add(VideoEmbedding(video_id=video.id, vector_json=json.dumps(vector), model=settings.VOYAGE_MODEL))
        db.commit()
        return True
    except Exception:
        db.rollback()
        return False


@router.get("/{video_id}/recommendations", response_model=list[VideoOut])
def get_more_like_this(
    video_id: str,
    limit: int = 8,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """"More like this" — pure content similarity via Voyage AI
    embeddings, cosine-ranked against every other published video.
    Returns an empty list (not an error) if this video has no
    embedding yet (e.g. Voyage AI was down when it was published).
    """
    video = db.query(Video).filter(Video.id == video_id, Video.status == VideoStatus.published).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    source = db.query(VideoEmbedding).filter(VideoEmbedding.video_id == video.id).first()
    if not source:
        return []

    source_vec = json.loads(source.vector_json)
    others = (
        db.query(VideoEmbedding, Video)
        .join(Video, Video.id == VideoEmbedding.video_id)
        .filter(Video.status == VideoStatus.published, Video.id != video.id)
        .all()
    )
    scored = [(cosine_similarity(source_vec, json.loads(emb.vector_json)), v) for emb, v in others]
    scored.sort(key=lambda pair: pair[0], reverse=True)
    top_videos = [v for _, v in scored[:limit]]
    return [_to_out(v, db, current_user) for v in top_videos]


@router.get("/recommendations/for-me", response_model=list[VideoOut])
def get_recommendations_for_me(
    limit: int = 12,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """"Recommended for you" — blends two real signals:
    1. Content similarity to videos this viewer has actually watched
       or liked (average of their embeddings).
    2. A popularity fallback (most-watched videos) fills remaining
       slots for a new viewer with no history yet, or when there
       aren't enough embedded videos to rank meaningfully.
    Never recommends a video the viewer has already watched, or one
    they uploaded themselves.
    """
    watched_ids = {
        r.video_id for r in db.query(VideoWatchRecord.video_id).filter(VideoWatchRecord.user_id == current_user.id).all()
    }
    liked_ids = {
        r.video_id for r in db.query(VideoLike.video_id).filter(VideoLike.user_id == current_user.id).all()
    }
    seed_ids = watched_ids | liked_ids

    all_published = (
        db.query(Video)
        .filter(Video.status == VideoStatus.published, Video.uploaded_by_user_id != current_user.id)
        .all()
    )
    candidate_ids = {v.id for v in all_published} - watched_ids
    if not candidate_ids:
        return []

    relevant_ids = list(candidate_ids) + list(seed_ids)
    embeddings = {
        e.video_id: json.loads(e.vector_json)
        for e in db.query(VideoEmbedding).filter(VideoEmbedding.video_id.in_(relevant_ids)).all()
    }

    seed_vectors = [embeddings[sid] for sid in seed_ids if sid in embeddings]

    ranked_ids = []
    if seed_vectors:
        dims = len(seed_vectors[0])
        avg_vector = [sum(v[i] for v in seed_vectors) / len(seed_vectors) for i in range(dims)]
        scored = [
            (cosine_similarity(avg_vector, embeddings[vid]), vid)
            for vid in candidate_ids if vid in embeddings
        ]
        scored.sort(key=lambda pair: pair[0], reverse=True)
        ranked_ids = [vid for _, vid in scored]

    # Popularity fallback fills remaining slots — most-watched published
    # videos the viewer hasn't already ranked in, for a new viewer with
    # no history, or when there are fewer embedded candidates than `limit`.
    if len(ranked_ids) < limit:
        popularity_rows = (
            db.query(VideoWatchRecord.video_id, func.count(VideoWatchRecord.id).label("watch_count"))
            .filter(VideoWatchRecord.video_id.in_(candidate_ids))
            .group_by(VideoWatchRecord.video_id)
            .order_by(func.count(VideoWatchRecord.id).desc())
            .all()
        )
        for vid, _ in popularity_rows:
            if vid not in ranked_ids:
                ranked_ids.append(vid)
        # Still short? Just append remaining candidates in any order.
        for vid in candidate_ids:
            if vid not in ranked_ids:
                ranked_ids.append(vid)

    video_by_id = {v.id: v for v in all_published}
    top_videos = [video_by_id[vid] for vid in ranked_ids[:limit] if vid in video_by_id]
    return [_to_out(v, db, current_user) for v in top_videos]

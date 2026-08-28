from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User, Video, VideoStatus, WatchProgress
from app.schemas import WatchProgressUpdate, ContinueWatchingOut, WatchHistoryOut

router = APIRouter(prefix="/videos", tags=["watch-progress"])

# Below this many seconds in, a video isn't worth remembering as
# "in progress" at all — avoids cluttering Continue Watching/History
# with someone who opened a video and immediately closed it.
MIN_TRACKED_SECONDS = 5

# A video within this many seconds of its known end is treated as
# finished — matches routers/videos.py's _to_out resume-skip threshold,
# so "would this resume?" and "does History call it complete?" agree.
NEAR_END_THRESHOLD_SECONDS = 15


@router.post("/{video_id}/progress", status_code=status.HTTP_204_NO_CONTENT)
def save_watch_progress(
    video_id: str,
    payload: WatchProgressUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Called periodically by the player (piggybacking the same
    interval as the revenue watch-heartbeat) to remember where this
    viewer last was in this video. Always OVERWRITES to the latest
    position — unlike the revenue engine's high-water-mark, "where did
    I leave off" should move backward too if someone re-watches from
    an earlier point.
    """
    video = db.query(Video).filter(Video.id == video_id, Video.status == VideoStatus.published).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    if payload.position_seconds < MIN_TRACKED_SECONDS:
        return

    progress = (
        db.query(WatchProgress)
        .filter(WatchProgress.user_id == current_user.id, WatchProgress.video_id == video.id)
        .first()
    )
    if progress:
        progress.position_seconds = payload.position_seconds
    else:
        db.add(WatchProgress(
            user_id=current_user.id, video_id=video.id, position_seconds=payload.position_seconds,
        ))
    db.commit()


def _thumbnail_url(video: Video) -> str | None:
    if not video.bunny_video_id:
        return None
    return f"https://{settings.BUNNY_CDN_HOSTNAME}/{video.bunny_video_id}/thumbnail.jpg"


def _trailer_url(video: Video) -> str | None:
    if not video.trailer_bunny_video_id:
        return None
    return f"https://{settings.BUNNY_CDN_HOSTNAME}/{video.trailer_bunny_video_id}/playlist.m3u8"


def _progress_percent(position: int, duration: int | None) -> int | None:
    if not duration or duration <= 0:
        return None
    return max(0, min(100, round(position / duration * 100)))


def _is_finished(position: int, duration: int | None) -> bool:
    return duration is not None and position >= duration - NEAR_END_THRESHOLD_SECONDS


@router.get("/continue-watching/mine", response_model=list[ContinueWatchingOut])
def get_continue_watching(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Videos this viewer has started but not finished, most recently
    watched first — powers the "Continue Watching" row.
    """
    rows = (
        db.query(WatchProgress, Video)
        .join(Video, Video.id == WatchProgress.video_id)
        .filter(WatchProgress.user_id == current_user.id, Video.status == VideoStatus.published)
        .order_by(WatchProgress.updated_at.desc())
        .all()
    )
    out = []
    for progress, video in rows:
        if _is_finished(progress.position_seconds, video.duration_seconds):
            continue
        out.append(ContinueWatchingOut(
            video_id=video.id,
            title=video.title,
            poster_image_url=video.poster_image_url,
            thumbnail_url=_thumbnail_url(video),
            trailer_playback_url=_trailer_url(video),
            duration_seconds=video.duration_seconds,
            position_seconds=progress.position_seconds,
            progress_percent=_progress_percent(progress.position_seconds, video.duration_seconds),
            updated_at=progress.updated_at,
        ))
    return out


@router.get("/history/mine", response_model=list[WatchHistoryOut])
def get_watch_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every video this viewer has ever watched at least
    MIN_TRACKED_SECONDS of, most recently watched first — powers the
    "History" page. Includes finished videos too, unlike Continue
    Watching.
    """
    rows = (
        db.query(WatchProgress, Video)
        .join(Video, Video.id == WatchProgress.video_id)
        .filter(WatchProgress.user_id == current_user.id, Video.status == VideoStatus.published)
        .order_by(WatchProgress.updated_at.desc())
        .all()
    )
    return [
        WatchHistoryOut(
            video_id=video.id,
            title=video.title,
            poster_image_url=video.poster_image_url,
            thumbnail_url=_thumbnail_url(video),
            duration_seconds=video.duration_seconds,
            position_seconds=progress.position_seconds,
            finished=_is_finished(progress.position_seconds, video.duration_seconds),
            updated_at=progress.updated_at,
        )
        for progress, video in rows
    ]

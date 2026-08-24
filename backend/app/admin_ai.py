from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai_services import call_claude, call_claude_json, AIServiceError
from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, Menu
from app.schemas import AIMetadataSuggestRequest, AIMetadataSuggestResponse, AIInsightsResponse

router = APIRouter(prefix="/admin/ai", tags=["admin-ai"])


def _get_live_categories(db: Session) -> list[str]:
    parent = db.query(Menu).filter(Menu.label == "Category", Menu.parent_menu_id.is_(None)).first()
    if not parent:
        return []
    rows = db.query(Menu).filter(Menu.parent_menu_id == parent.id, Menu.is_active == True).all()  # noqa: E712
    return [m.category_param or m.label for m in rows]


@router.post("/suggest-metadata", response_model=AIMetadataSuggestResponse)
def suggest_video_metadata(
    payload: AIMetadataSuggestRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Upload-time content optimization — Claude reviews a draft title/
    description and suggests a tightened version plus which of theomy's
    LIVE categories (see Admin > Categories) actually fit best. Never
    invents categories outside that list, since the video upload form
    can only save categories that exist there.
    """
    categories = _get_live_categories(db)
    if not categories:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="No categories configured yet.")

    system_prompt = (
        "You are a content editor for theomy, a Bengali theatre OTT platform. "
        "Given a draft video title and description, suggest an improved, "
        "engaging version and pick the best-fitting categories from the "
        "provided list ONLY — never invent a category not in that list. "
        "Respond with ONLY a JSON object, no markdown fences, no preamble, "
        'in this exact shape: {"suggested_title": "...", '
        '"suggested_description": "...", "suggested_categories": ["...", "..."], '
        '"reasoning": "one short sentence on why"}. '
        "suggested_categories must have 1-3 entries, all from the allowed list."
    )
    user_prompt = (
        f"Allowed categories: {', '.join(categories)}\n\n"
        f"Draft title: {payload.title}\n"
        f"Draft description: {payload.description or '(none provided)'}"
    )

    try:
        result = call_claude_json(system_prompt, user_prompt, max_tokens=600)
    except AIServiceError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    suggested_categories = [c for c in result.get("suggested_categories", []) if c in categories]
    if not suggested_categories:
        suggested_categories = categories[:1]

    return AIMetadataSuggestResponse(
        suggested_title=result.get("suggested_title", payload.title),
        suggested_description=result.get("suggested_description", payload.description),
        suggested_categories=suggested_categories,
        reasoning=result.get("reasoning", ""),
    )


@router.get("/analytics-insights", response_model=AIInsightsResponse)
def get_analytics_insights(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Content optimization, the analytics-based half — Claude reads
    the same Revenue Summary + per-video performance numbers already
    shown on the admin Revenue page and writes a short, plain-language
    read of what they mean (which content to promote, what's
    underperforming, etc.) — no numbers are invented; Claude only sees
    the real aggregates computed here.
    """
    from app.routers.admin_revenue import get_revenue_summary, get_all_content_performance

    summary = get_revenue_summary(current_admin=current_admin, db=db)
    performance = get_all_content_performance(current_admin=current_admin, db=db)

    if not performance:
        return AIInsightsResponse(insights="Not enough data yet — insights will appear once videos have real views.")

    performance_lines = "\n".join(
        f"- {p.title} (by {p.creator_name}): {p.unique_viewers} viewers, "
        f"{p.total_watch_minutes} watch-minutes, Rs.{p.gross_revenue_rupees} gross, "
        f"Rs.{p.creator_earned_rupees} creator earned"
        for p in performance
    )

    system_prompt = (
        "You are a content strategy analyst for theomy, a Bengali theatre "
        "OTT platform. Given real platform revenue and per-video performance "
        "data, write a short (3-5 sentence) plain-language summary of what "
        "the numbers mean, which content is over or underperforming relative "
        "to its viewer count, and one concrete suggestion. Only use the "
        "numbers given, never invent figures. Write in plain prose, no "
        "markdown headers, no bullet lists, a short paragraph is enough."
    )
    user_prompt = (
        f"Platform totals: Rs.{summary.gross_revenue_rupees} gross revenue, "
        f"{summary.total_viewer_records} viewer records, {summary.total_published_videos} published videos, "
        f"Rs.{summary.avg_revenue_per_1000_minutes_rupees} avg per 1000 minutes watched.\n\n"
        f"Per-video performance:\n{performance_lines}"
    )

    try:
        insights = call_claude(system_prompt, user_prompt, max_tokens=400)
    except AIServiceError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    return AIInsightsResponse(insights=insights.strip())

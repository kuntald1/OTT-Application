from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai_services import call_claude, call_claude_json, AIServiceError
from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.models import AdminUser, Menu, AnalyticsInsightCache, AIConfig
from app.schemas import (
    AIMetadataSuggestRequest, AIMetadataSuggestResponse, AIInsightsResponse, AIConfigOut, AIConfigUpdate,
)

router = APIRouter(prefix="/admin/ai", tags=["admin-ai"])


def _get_insight_cache_hours(db: Session) -> int:
    config = db.query(AIConfig).first()
    return config.insight_cache_hours if config else 6


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
    force: bool = False,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Content optimization, the analytics-based half — Claude reads
    the same Revenue Summary + per-video performance numbers already
    shown on the admin Revenue page and writes a short, plain-language
    read of what they mean. No numbers are invented; Claude only sees
    the real aggregates computed here.

    Cached for however long is set in AIConfig.insight_cache_hours
    (admin-editable — see GET/PUT /admin/ai/config below, default 6) —
    repeatedly opening/refreshing the Analytics tab reuses the same
    cached text instead of triggering a real (paid) Claude call every
    time. Pass force=true to bypass the cache and regenerate
    immediately (an explicit "Regenerate" button on the frontend, not
    something that happens on a normal page load).
    """
    cache = db.query(AnalyticsInsightCache).order_by(AnalyticsInsightCache.generated_at.desc()).first()
    if cache and not force:
        age = datetime.now(timezone.utc) - cache.generated_at.replace(tzinfo=timezone.utc)
        if age < timedelta(hours=_get_insight_cache_hours(db)):
            return AIInsightsResponse(insights=cache.insights, generated_at=cache.generated_at, cached=True)

    from app.routers.admin_revenue import get_revenue_summary, get_all_content_performance

    summary = get_revenue_summary(current_admin=current_admin, db=db)
    performance = get_all_content_performance(current_admin=current_admin, db=db)

    if not performance:
        now = datetime.now(timezone.utc)
        return AIInsightsResponse(
            insights="Not enough data yet — insights will appear once videos have real views.",
            generated_at=now,
            cached=False,
        )

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
        insights_text = call_claude(system_prompt, user_prompt, max_tokens=400).strip()
    except AIServiceError as e:
        # If Claude fails but we have an old cache (even if stale),
        # serve that rather than a hard error — a slightly-outdated
        # insight beats none.
        if cache:
            return AIInsightsResponse(insights=cache.insights, generated_at=cache.generated_at, cached=True)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    now = datetime.now(timezone.utc)
    if cache:
        cache.insights = insights_text
        cache.generated_at = now
    else:
        cache = AnalyticsInsightCache(insights=insights_text, generated_at=now)
        db.add(cache)
    db.commit()

    return AIInsightsResponse(insights=insights_text, generated_at=now, cached=False)


@router.get("/config", response_model=AIConfigOut)
def get_ai_config(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Read-only for any admin — same GET/PUT split as
    /admin/revenue/config, where reading is fine for any admin but
    only a superadmin can change a value that affects real API cost.
    """
    config = db.query(AIConfig).first()
    if not config:
        config = AIConfig()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.put("/config", response_model=AIConfigOut)
def update_ai_config(
    payload: AIConfigUpdate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """The AI Insights cache-duration editor — superadmin only, same
    restriction as the platform revenue rate, since this setting
    directly trades off real Claude API cost against freshness.
    """
    config = db.query(AIConfig).first()
    if not config:
        config = AIConfig()
        db.add(config)
    config.insight_cache_hours = payload.insight_cache_hours
    db.commit()
    db.refresh(config)
    return config

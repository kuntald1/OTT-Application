from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.html_sanitize import sanitize_rich_text
from app.models import User, UserRole, OrganiserProfileSection
from app.schemas import OrganiserProfileSectionOut, OrganiserProfileSectionCreate, OrganiserProfileSectionUpdate

router = APIRouter(prefix="/organiser-profile", tags=["organiser-profile"])


@router.get("/sections", response_model=list[OrganiserProfileSectionOut])
def list_my_sections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(OrganiserProfileSection)
        .filter(OrganiserProfileSection.user_id == current_user.id)
        .order_by(OrganiserProfileSection.display_order)
        .all()
    )


@router.post("/sections", response_model=OrganiserProfileSectionOut, status_code=status.HTTP_201_CREATED)
def create_my_section(
    payload: OrganiserProfileSectionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The "About [Organisation]" editor on Manage Profile — only a
    Plays Organiser has an organisation to describe here.
    """
    if current_user.role != UserRole.plays_organiser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Plays Organiser accounts have an About page.")
    next_order = (
        db.query(func.coalesce(func.max(OrganiserProfileSection.display_order), -1))
        .filter(OrganiserProfileSection.user_id == current_user.id)
        .scalar() or -1
    ) + 1
    section = OrganiserProfileSection(
        user_id=current_user.id,
        title=payload.title,
        content_html=sanitize_rich_text(payload.content_html),
        display_order=next_order,
    )
    db.add(section)
    db.commit()
    db.refresh(section)
    return section


def _get_own_section_or_404(section_id: str, current_user: User, db: Session) -> OrganiserProfileSection:
    section = (
        db.query(OrganiserProfileSection)
        .filter(OrganiserProfileSection.id == section_id, OrganiserProfileSection.user_id == current_user.id)
        .first()
    )
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")
    return section


@router.put("/sections/{section_id}", response_model=OrganiserProfileSectionOut)
def update_my_section(
    section_id: str,
    payload: OrganiserProfileSectionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = _get_own_section_or_404(section_id, current_user, db)
    section.title = payload.title
    section.content_html = sanitize_rich_text(payload.content_html)
    db.commit()
    db.refresh(section)
    return section


@router.delete("/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_section(
    section_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = _get_own_section_or_404(section_id, current_user, db)
    db.delete(section)
    db.commit()

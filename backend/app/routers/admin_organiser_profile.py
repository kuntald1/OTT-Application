from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.html_sanitize import sanitize_rich_text
from app.models import AdminUser, User, OrganiserProfileSection
from app.schemas import OrganiserProfileSectionOut, OrganiserProfileSectionCreate, OrganiserProfileSectionUpdate

router = APIRouter(prefix="/admin/organiser-profile", tags=["admin-organiser-profile"])


@router.get("/{user_id}/sections", response_model=list[OrganiserProfileSectionOut])
def list_sections_admin(
    user_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if not db.query(User).filter(User.id == user_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return (
        db.query(OrganiserProfileSection)
        .filter(OrganiserProfileSection.user_id == user_id)
        .order_by(OrganiserProfileSection.display_order)
        .all()
    )


@router.post("/{user_id}/sections", response_model=OrganiserProfileSectionOut, status_code=status.HTTP_201_CREATED)
def create_section_admin(
    user_id: str,
    payload: OrganiserProfileSectionCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin > User Management's "About Page" management for a Plays
    Organiser — same underlying sections the organiser edits from
    their own Manage Profile, just editable by an admin too (helping
    an organiser who's stuck, or moderating content).
    """
    if not db.query(User).filter(User.id == user_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    next_order = (
        db.query(func.coalesce(func.max(OrganiserProfileSection.display_order), -1))
        .filter(OrganiserProfileSection.user_id == user_id)
        .scalar() or -1
    ) + 1
    section = OrganiserProfileSection(
        user_id=user_id,
        title=payload.title,
        content_html=sanitize_rich_text(payload.content_html),
        display_order=next_order,
    )
    db.add(section)
    db.commit()
    db.refresh(section)
    return section


@router.put("/sections/{section_id}", response_model=OrganiserProfileSectionOut)
def update_section_admin(
    section_id: str,
    payload: OrganiserProfileSectionUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    section = db.query(OrganiserProfileSection).filter(OrganiserProfileSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")
    section.title = payload.title
    section.content_html = sanitize_rich_text(payload.content_html)
    db.commit()
    db.refresh(section)
    return section


@router.delete("/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_section_admin(
    section_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    section = db.query(OrganiserProfileSection).filter(OrganiserProfileSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")
    db.delete(section)
    db.commit()

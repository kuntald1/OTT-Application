from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.models import AdminUser, Menu
from app.schemas import MenuOut, AdminCategoryCreate, AdminCategoryUpdate

router = APIRouter(prefix="/admin/categories", tags=["admin-categories"])


def _get_category_parent(db: Session) -> Menu:
    """The single "Category" top-level Menu row that every category
    sub-item hangs off of (view=None, seeded once in seed_data.py).
    Every function here assumes exactly one such row exists.
    """
    parent = db.query(Menu).filter(Menu.label == "Category", Menu.parent_menu_id.is_(None)).first()
    if not parent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The 'Category' parent menu doesn't exist yet. Run the seed script first.",
        )
    return parent


@router.get("", response_model=list[MenuOut])
def list_categories(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin view of every category — INCLUDING inactive/disabled ones
    (unlike the public GET /menus, which only ever returns active
    rows), so an admin can see and re-enable something they turned off.
    """
    parent = _get_category_parent(db)
    return (
        db.query(Menu)
        .filter(Menu.parent_menu_id == parent.id)
        .order_by(Menu.display_order)
        .all()
    )


@router.post("", response_model=MenuOut, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: AdminCategoryCreate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Adding a category here is the ONE place that changes it
    everywhere: the public nav's Category dropdown (via GET /menus,
    already wired into TopNav.jsx), the Category browse page, AND the
    video upload form's category checkboxes (both Creator and Admin
    upload — see routers/videos.py's ALLOWED_CATEGORIES, which now
    queries this table live instead of a hardcoded list).
    """
    parent = _get_category_parent(db)
    existing = db.query(Menu).filter(Menu.parent_menu_id == parent.id, Menu.label == payload.label).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A category with this name already exists.")

    display_order = payload.display_order
    if display_order is None:
        max_order = db.query(Menu).filter(Menu.parent_menu_id == parent.id).count()
        display_order = max_order

    category = Menu(
        label=payload.label,
        view="category",
        category_param=payload.label,
        parent_menu_id=parent.id,
        display_order=display_order,
        is_active=True,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.put("/{category_id}", response_model=MenuOut)
def update_category(
    category_id: str,
    payload: AdminCategoryUpdate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Renaming keeps label AND category_param in sync — a video
    already tagged with the old name stays tagged with the OLD string
    (categories are stored as plain text on videos, not a foreign key,
    same as the existing single-category backward-compat column), so a
    rename here doesn't retroactively touch existing videos.
    """
    parent = _get_category_parent(db)
    category = db.query(Menu).filter(Menu.id == category_id, Menu.parent_menu_id == parent.id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    if payload.label is not None:
        duplicate = (
            db.query(Menu)
            .filter(Menu.parent_menu_id == parent.id, Menu.label == payload.label, Menu.id != category.id)
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A category with this name already exists.")
        category.label = payload.label
        category.category_param = payload.label
    if payload.display_order is not None:
        category.display_order = payload.display_order
    if payload.is_active is not None:
        category.is_active = payload.is_active

    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: str,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Deletes the category from the nav/upload-form list. Videos
    already tagged with this category keep that tag (stored as plain
    text, see update_category's docstring) — they just won't show up
    under a Category-browse filter for a name that no longer exists in
    the dropdown, and can't be selected for NEW uploads anymore.
    """
    parent = _get_category_parent(db)
    category = db.query(Menu).filter(Menu.id == category_id, Menu.parent_menu_id == parent.id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    db.delete(category)
    db.commit()

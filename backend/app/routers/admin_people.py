from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, Person
from app.schemas import PersonOut, PersonCreate, PersonUpdate

router = APIRouter(prefix="/admin/people", tags=["admin-people"])


@router.get("", response_model=list[PersonOut])
def list_people(q: str = "", db: Session = Depends(get_db), current_admin: AdminUser = Depends(get_current_admin)):
    """The Cast/Crew Master list — every Person profile, searchable by
    name. Unlike GET /people/search (autocomplete, short-query-only,
    capped at 10), this returns the full browsable list for management.
    """
    query = db.query(Person)
    if q.strip():
        query = query.filter(Person.name.ilike(f"%{q.strip()}%"))
    return query.order_by(Person.name.asc()).all()


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
def create_person(
    payload: PersonCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    person = Person(created_by_admin_id=current_admin.id, **payload.model_dump())
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


@router.put("/{person_id}", response_model=PersonOut)
def update_person(
    person_id: str,
    payload: PersonUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(person, field, value)
    db.commit()
    db.refresh(person)
    return person


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_person(
    person_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """No cast/crew-link cleanup check here deliberately raises instead
    of silently orphaning — if this person is currently credited on any
    video, the FK constraint on VideoCast/VideoCrew.person_id will
    reject the delete, which is the right outcome (remove them from
    the video's credits first, then delete the profile).
    """
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    db.delete(person)
    db.commit()

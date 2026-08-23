import os
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, Person
from app.schemas import PersonOut

router = APIRouter(prefix="/people", tags=["people"])

PHOTO_UPLOAD_DIR = Path("uploads/person_photos")
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB


@router.get("/{person_id}", response_model=PersonOut)
def get_person(person_id: str, db: Session = Depends(get_db)):
    # Public — this is the actual bio page a viewer lands on when
    # clicking a cast/crew name, same as the demo card's Pavel Smirnov page.
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    return person


async def _save_person_photo(person: Person, file: UploadFile, db: Session) -> Person:
    if file.content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only JPEG, PNG, or WEBP images are allowed.")
    contents = await file.read()
    if len(contents) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Photo must be smaller than 5MB.")

    PHOTO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    stored_name = f"{uuid_module.uuid4()}{ext}"
    with open(PHOTO_UPLOAD_DIR / stored_name, "wb") as out:
        out.write(contents)

    person.photo_url = f"/api/uploads/person_photos/{stored_name}"
    db.commit()
    db.refresh(person)
    return person


@router.post("/{person_id}/upload-photo", response_model=PersonOut)
async def upload_person_photo(
    person_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    if person.created_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the account that created this profile can update its photo.",
        )
    return await _save_person_photo(person, file, db)

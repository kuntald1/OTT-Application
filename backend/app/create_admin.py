"""
Creates a superadmin account. Run once to bootstrap the very first admin
— after that, superadmins create additional admin accounts through the
admin panel itself (POST /api/admin/auth/admins), not through this
script.

Usage (from inside the backend container):
    docker compose exec theomy-backend python -m app.create_admin "Full Name" email@example.com "StrongPassword123"

The role is always "superadmin" when run this way — this script exists
specifically to create the first account that can then create everyone
else. If an account with that email already exists, it's left alone.
"""
import sys

from app.database import SessionLocal
from app.models import AdminUser, AdminRole
from app.security import hash_password


def main():
    if len(sys.argv) != 4:
        print("Usage: python -m app.create_admin \"Full Name\" email@example.com \"Password123\"")
        sys.exit(1)

    name, email, password = sys.argv[1], sys.argv[2], sys.argv[3]
    if len(password) < 8:
        print("Password must be at least 8 characters.")
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = db.query(AdminUser).filter(AdminUser.email == email).first()
        if existing:
            print(f"An admin account with email {email} already exists — nothing changed.")
            return

        admin = AdminUser(
            name=name,
            email=email,
            hashed_password=hash_password(password),
            role=AdminRole.superadmin,
        )
        db.add(admin)
        db.commit()
        print(f"Superadmin account created: {name} <{email}>")
    finally:
        db.close()


if __name__ == "__main__":
    main()

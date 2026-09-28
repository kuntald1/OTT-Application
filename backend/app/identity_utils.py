"""Email/phone identity normalisation, shared by every place that creates
or looks up a `users` row (registration, login, OTP, forgot-password,
profile update, sub-accounts, social login, Admin > Create organiser).

Why this exists (Sept 2026): duplicate checks compared the raw strings, so
`Org@x.com` and `org@x.com` — and `9732609965` typed with a stray space —
counted as different people, and login only found the exact same casing.

Two halves that must be used together:
  * normalize_*  — applied to INPUT (see the Annotated types in schemas.py),
    so everything new is stored lowercase / without formatting characters;
  * email_equals / phone_equals — used for every LOOKUP, comparing the
    stored column normalised too. This is what keeps rows saved before this
    change (e.g. `Kuntal@Gmail.com`, `97326 09965`) working without a
    migration; a one-off clean-up of those rows is optional.

Deliberately NOT done: country-code handling (`+91…` vs a bare 10-digit
number stay different). Guessing a country code changes stored values and
what WhatsApp/OTP send to, which is a separate decision.
"""
import re
from typing import Optional

from sqlalchemy import func

_PHONE_FORMATTING = re.compile(r"[\s\-().]")
# Same characters, for the SQL side (portable: PostgreSQL and SQLite both
# have replace(), only PostgreSQL has regexp_replace).
_PHONE_FORMATTING_CHARS = (" ", "\t", "-", "(", ")", ".")


def normalize_email(value: str) -> str:
    return value.strip().lower()


def normalize_phone(value: Optional[str]) -> Optional[str]:
    """Strips spaces, dashes, dots and brackets; keeps digits and a leading
    '+'. Blank (or nothing but formatting) becomes None."""
    if value is None:
        return None
    cleaned = _PHONE_FORMATTING.sub("", value)
    return cleaned or None


def email_equals(column, email: str):
    """SQL condition: `column` equals `email`, ignoring case."""
    return func.lower(column) == normalize_email(email)


def phone_equals(column, phone: str):
    """SQL condition: `column` equals `phone`, ignoring formatting
    characters on BOTH sides (so a legacy row saved as '97326 09965' still
    matches '9732609965')."""
    stripped = column
    for ch in _PHONE_FORMATTING_CHARS:
        stripped = func.replace(stripped, ch, "")
    return stripped == normalize_phone(phone)

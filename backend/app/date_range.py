from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status


def parse_date_range(start_date: str | None, end_date: str | None) -> tuple[datetime, datetime]:
    """Shared by Admin > Dashboard, Reports and Analytics, and Revenue
    Sharing Management so "default to the last 1 month" behaves
    identically everywhere. start_date/end_date are "YYYY-MM-DD" from
    an HTML date input; end is treated as END of that day so the
    selected end date's own activity is included, not cut off at
    midnight.
    """
    now = datetime.now(timezone.utc)
    if not end_date:
        end = now
    else:
        try:
            end = datetime.strptime(end_date, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, tzinfo=timezone.utc
            )
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid end_date — expected YYYY-MM-DD.")

    if not start_date:
        start = end - timedelta(days=30)
    else:
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start_date — expected YYYY-MM-DD.")

    if start > end:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_date must be before end_date.")

    return start, end

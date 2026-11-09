from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def end_of_day_ist(moment: datetime) -> datetime:
    """A plan shown as "Expires 09 Nov" must work for the whole of 9 Nov,
    so expiry is stored as 23:59:59 IST on the day the plan runs out,
    not the purchase time-of-day. Returned in UTC for the timestamptz column."""
    local = moment.astimezone(IST)
    end = local.replace(hour=23, minute=59, second=59, microsecond=0)
    return end.astimezone(timezone.utc)

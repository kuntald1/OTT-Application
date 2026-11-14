"""One place that decides what a reward point is worth and how many of
them a payment earns.

Both answers come from the single-row reward_config table, so an admin
changes them from Admin > Reward Points without a deploy:

  * <kind>_reward_percent — how much of the amount paid comes back as
    reward VALUE, per kind of purchase (subscription, auto-renew,
    pay-per-video, pay-per-stream, event ticket).
  * point_value_rupees    — what ONE point is worth in rupees:
        1     -> 1 point  = Rs 1      (how it has always worked)
        0.1   -> 10 points = Rs 1
        0.25  -> 1 point  = Rs 0.25

Points earned = (amount x percent / 100) / point_value_rupees, so the
value handed back is always the percentage the admin set, whatever a
single point happens to be worth.

Nothing here touches the database or the user's balance — the callers
already own that, and they each have their own rule about never failing
a payment that has already gone through.
"""

from decimal import Decimal, ROUND_HALF_UP

# Which column holds the rate for which kind of purchase. The keys are
# what call sites pass; add a new kind here and in the admin page, not
# scattered through the routers.
PERCENT_FIELD_BY_KIND = {
    "subscription": "subscription_reward_percent",
    "autopay": "autopay_reward_percent",
    "video": "video_reward_percent",
    "live_stream": "live_stream_reward_percent",
    "ticket": "ticket_reward_percent",
}


def point_value_rupees(config) -> Decimal:
    """What one reward point is worth, in rupees.

    Falls back to 1 (the historical value) for a missing config row or a
    zero/negative value, so a bad setting can never divide by zero or
    hand out an infinite number of points.
    """
    if config is None:
        return Decimal("1")
    value = getattr(config, "point_value_rupees", None)
    if value is None:
        return Decimal("1")
    value = Decimal(value)
    return value if value > 0 else Decimal("1")


def reward_percent(config, kind: str) -> Decimal:
    """The earn rate for one kind of purchase, as a percentage."""
    if config is None:
        return Decimal("0")
    field = PERCENT_FIELD_BY_KIND.get(kind)
    if field is None:
        return Decimal("0")
    value = getattr(config, field, None)
    return Decimal(value) if value is not None else Decimal("0")


def points_for_amount(config, amount, kind: str) -> int:
    """How many points `amount` earns for this kind of purchase.

    Rounded to a whole number of points, half up — the same rounding the
    four payment routers used before this module existed.
    """
    if config is None:
        return 0
    percent = reward_percent(config, kind)
    if percent <= 0:
        return 0
    value_rupees = Decimal(amount) * percent / Decimal("100")
    points = value_rupees / point_value_rupees(config)
    return int(points.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def rupees_for_points(config, points) -> Decimal:
    """What a number of points is worth in rupees, rounded to whole
    rupees (every amount on a theomy invoice is a whole rupee).
    """
    total = Decimal(points) * point_value_rupees(config)
    return total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def max_points_redeemable(config, amount) -> int:
    """The most points that can be put against `amount` without taking
    the price below zero. Floored, never rounded up, so the discount is
    always worth at most the price itself.
    """
    if amount <= 0:
        return 0
    return int(Decimal(amount) / point_value_rupees(config))

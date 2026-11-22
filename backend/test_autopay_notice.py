"""What a customer is told when an auto-renew charge goes through.

A one-off payment is finished when it is made. An auto-renew charge is a
promise to charge again, and the single thing that stops the next one
arriving as a surprise — and becoming a dispute — is telling the customer
the date, the amount, and how to stop it. So that is what these check.

They test the message text directly rather than driving a Razorpay
charge: the wording IS the protection, and it is the part a later edit is
most likely to quietly break.
"""

import os
from datetime import datetime, timezone

os.environ.setdefault("DB_PASSWORD", "x")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")

import pytest

from app import notifications
from app.config import settings


NEXT = datetime(2026, 12, 17, 9, 30, tzinfo=timezone.utc)


class SentWhatsApp:
    """Captures what Twilio would have been asked to send."""

    def __init__(self):
        self.body = None

    def messages_create(self, from_=None, to=None, body=None):
        self.body = body

    def __call__(self, _sid, _token):
        outer = self

        class _Client:
            messages = type("M", (), {"create": staticmethod(outer.messages_create)})

        return _Client()


@pytest.fixture()
def whatsapp(monkeypatch):
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "sid", raising=False)
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "token", raising=False)
    monkeypatch.setattr(settings, "TWILIO_FROM_NUMBER", "whatsapp:+1", raising=False)
    sender = SentWhatsApp()
    monkeypatch.setattr(notifications, "TwilioClient", sender)
    return sender


@pytest.fixture()
def email(monkeypatch):
    sent = {}
    monkeypatch.setattr(
        notifications, "_send_email",
        lambda to, subject, text, html: sent.update(to=to, subject=subject, text=text, html=html),
    )
    return sent


# ------------------------------------------------------------- WhatsApp

def test_whatsapp_states_the_next_date_and_amount(whatsapp):
    notifications.send_autopay_charge_whatsapp(
        "9876543210", "Contemporary", 12, "1 Month", NEXT, is_first_charge=True,
    )

    body = whatsapp.body
    assert "17 Dec 2026" in body
    # The amount has to appear as the FUTURE charge, not only as what was
    # just paid — "you will be charged ₹12 again" is the whole point.
    assert "charged again" in body
    assert "12" in body


def test_whatsapp_says_where_to_turn_it_off(whatsapp):
    notifications.send_autopay_charge_whatsapp(
        "9876543210", "Contemporary", 12, "1 Month", NEXT, is_first_charge=False,
    )

    # Must name the same place the checkout screen promises, or the
    # promise sends people somewhere that doesn't have the control.
    assert "Manage Profile" in whatsapp.body


def test_whatsapp_distinguishes_a_renewal_from_the_first_charge(whatsapp):
    notifications.send_autopay_charge_whatsapp(
        "9876543210", "Contemporary", 12, "1 Month", NEXT, is_first_charge=True,
    )
    first = whatsapp.body
    notifications.send_autopay_charge_whatsapp(
        "9876543210", "Contemporary", 12, "1 Month", NEXT, is_first_charge=False,
    )
    renewal = whatsapp.body

    assert "is active" in first
    assert "renewed" in renewal
    assert first != renewal


def test_whatsapp_without_a_known_date_still_says_how_often(whatsapp):
    notifications.send_autopay_charge_whatsapp(
        "9876543210", "Contemporary", 12, "1 Month", None, is_first_charge=True,
    )

    assert "every 1 month" in whatsapp.body
    assert "Manage Profile" in whatsapp.body


def test_no_whatsapp_without_a_phone_number(whatsapp):
    notifications.send_autopay_charge_whatsapp(
        "", "Contemporary", 12, "1 Month", NEXT, is_first_charge=True,
    )

    assert whatsapp.body is None


def test_a_twilio_failure_is_swallowed(monkeypatch):
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "sid", raising=False)
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "token", raising=False)
    monkeypatch.setattr(settings, "TWILIO_FROM_NUMBER", "whatsapp:+1", raising=False)

    def boom(*_a, **_k):
        raise RuntimeError("twilio down")

    monkeypatch.setattr(notifications, "TwilioClient", boom)

    # The money has already moved. A notification must never be able to
    # raise out of the charge path.
    notifications.send_autopay_charge_whatsapp(
        "9876543210", "Contemporary", 12, "1 Month", NEXT, is_first_charge=True,
    )


# ----------------------------------------------------------------- email

def test_email_states_the_next_date_and_how_to_stop(email):
    notifications.send_autopay_charge_email(
        "a@b.com", "Contemporary", 12, 2, "1 Month", 1, NEXT, is_first_charge=True,
    )

    for part in (email["text"], email["html"]):
        assert "17 December 2026" in part
        assert "Manage Profile" in part
        assert "auto-renew" in part.lower()


def test_email_promises_access_until_the_paid_period_ends(email):
    notifications.send_autopay_charge_email(
        "a@b.com", "Contemporary", 12, 2, "1 Month", 1, NEXT, is_first_charge=True,
    )

    # Cancelling must not read as "you lose access now", or people delay
    # cancelling, get charged again, and dispute it.
    assert "until the period you have already paid for ends" in email["text"]
    assert "until the period you have already paid for ends" in email["html"]


def test_email_subject_differs_for_a_renewal(email):
    notifications.send_autopay_charge_email(
        "a@b.com", "Contemporary", 12, 2, "1 Month", 1, NEXT, is_first_charge=True,
    )
    first = email["subject"]
    notifications.send_autopay_charge_email(
        "a@b.com", "Contemporary", 12, 2, "1 Month", 1, NEXT, is_first_charge=False,
    )

    assert first == "Your theomy subscription is confirmed"
    assert email["subject"] == "Your theomy Contemporary plan has renewed"


def test_email_html_uses_an_entity_for_the_rupee_sign(email):
    notifications.send_autopay_charge_email(
        "a@b.com", "Contemporary", 12, 2, "1 Month", 1, NEXT, is_first_charge=True,
    )

    # A raw ₹ turns into a black diamond in some older mail clients.
    assert "&#8377;12" in email["html"]


def test_an_smtp_failure_is_swallowed(monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(notifications, "_send_email", boom)

    notifications.send_autopay_charge_email(
        "a@b.com", "Contemporary", 12, 2, "1 Month", 1, NEXT, is_first_charge=True,
    )

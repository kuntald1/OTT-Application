from datetime import timedelta, timezone
from twilio.rest import Client as TwilioClient

from app.config import settings
from app.email_utils import _send_email


# UPI Autopay is India-only, so every date in these messages is read in
# IST. A UTC date can land a day early for an evening charge (19:00 UTC
# is already the next day in Kolkata), and "you said the 22nd" is exactly
# the kind of detail a dispute turns on.
#
# A fixed offset rather than ZoneInfo("Asia/Kolkata"): India has no DST,
# so the offset is always +05:30, and this needs no tzdata package in the
# container.
IST = timezone(timedelta(hours=5, minutes=30))


def _ist_date(dt, fmt: str) -> str | None:
    """Formats a timestamp as the calendar date an Indian customer sees."""
    if not dt:
        return None
    if dt.tzinfo is None:  # defensive: treat a naive timestamp as UTC
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST).strftime(fmt)


def send_payment_whatsapp(to_phone: str, plan_name: str, total_amount, duration_label: str) -> None:
    """Sends a WhatsApp confirmation via Twilio. Silently does nothing if
    Twilio isn't configured or the user has no phone number — this should
    never block or fail the checkout flow itself.
    """
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return

    # Indian numbers stored without country code get one assumed here —
    # adjust if your users' phone numbers are stored differently.
    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"

    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = (
        f"theomy: Your payment of ₹{total_amount} for the {plan_name} plan "
        f"({duration_label}) was successful. Your subscription is now active. "
        f"Thank you for subscribing!"
    )
    try:
        client.messages.create(
            from_=settings.TWILIO_FROM_NUMBER,
            to=f"whatsapp:{to_number}",
            body=body,
        )
    except Exception:
        # Non-fatal — a notification failure should never undo a
        # successful payment. Real deployments should log this.
        pass


def send_payment_email(to_email: str, plan_name: str, total_amount, tax_amount, duration_label: str, screens: int) -> None:
    """Sends a payment/subscription confirmation email. Non-fatal on
    failure, same reasoning as the WhatsApp notification above.
    """
    subject = "Your theomy subscription is confirmed"
    text_body = f"""Hi,

Your payment was successful and your subscription is now active.

Plan: {plan_name}
Duration: {duration_label}
Screens: {screens}
Tax (GST): ₹{tax_amount}
Total paid: ₹{total_amount}

Thank you for subscribing to theomy!
"""
    html_body = f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#0a0104; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0104; padding: 40px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#150307; border:1px solid rgba(212,175,55,0.25); border-radius:16px; overflow:hidden;">
          <tr><td style="background:linear-gradient(135deg,#73001E,#4a0113); padding:28px 32px;">
            <span style="font-size:22px; font-weight:600; color:#f5ebdd;">theomy</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px 0; font-size:20px; color:#f5ebdd;">Subscription confirmed</h1>
            <p style="margin:0 0 20px 0; font-size:14px; line-height:1.6; color:rgba(245,235,221,0.75);">
              Your payment was successful and your subscription is now active.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:rgba(245,235,221,0.8);">
              <tr><td style="padding:6px 0;">Plan</td><td style="padding:6px 0; text-align:right; font-weight:600;">{plan_name}</td></tr>
              <tr><td style="padding:6px 0;">Duration</td><td style="padding:6px 0; text-align:right;">{duration_label}</td></tr>
              <tr><td style="padding:6px 0;">Screens</td><td style="padding:6px 0; text-align:right;">{screens}</td></tr>
              <tr><td style="padding:6px 0;">Tax (GST)</td><td style="padding:6px 0; text-align:right;">₹{tax_amount}</td></tr>
              <tr><td style="padding:10px 0 0 0; border-top:1px solid rgba(245,235,221,0.15); font-weight:700; color:#D4AF37;">Total paid</td><td style="padding:10px 0 0 0; border-top:1px solid rgba(245,235,221,0.15); text-align:right; font-weight:700; color:#D4AF37;">₹{total_amount}</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
"""
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_autopay_charge_whatsapp(
    to_phone: str, plan_name: str, total_amount, duration_label: str,
    next_renewal_at, is_first_charge: bool,
) -> None:
    """The auto-renew version of send_payment_whatsapp.

    A one-off payment is finished when it is made; an auto-renew charge is
    a promise to charge again. So this says the next date and the amount,
    and where to stop it. That is what card networks and Stripe both ask
    for, and it is the single thing that most reduces "I was charged after
    I cancelled" disputes — a customer who was told cannot be surprised.
    """
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return

    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    when = _ist_date(next_renewal_at, "%d %b %Y")
    opening = (
        f"theomy: Your {plan_name} plan is active — ₹{total_amount} paid."
        if is_first_charge
        else f"theomy: Your {plan_name} plan renewed — ₹{total_amount} paid."
    )
    body = (
        f"{opening} Auto-renew is ON, so ₹{total_amount} will be charged again "
        + (f"around {when}" if when else f"every {duration_label.lower()}")
        + ". To stop it, open Manage Profile on theomy.com or in the app and "
        "turn off auto-renew."
    )
    try:
        TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN).messages.create(
            from_=settings.TWILIO_FROM_NUMBER,
            to=f"whatsapp:{to_number}",
            body=body,
        )
    except Exception:
        pass


def send_autopay_charge_email(
    to_email: str, plan_name: str, total_amount, tax_amount, duration_label: str,
    screens: int, next_renewal_at, is_first_charge: bool,
) -> None:
    """The auto-renew version of send_payment_email. See the WhatsApp one
    above for why the next date and the way to stop belong in here.
    """
    when = _ist_date(next_renewal_at, "%d %B %Y")
    next_line = (
        f"₹{total_amount} will be charged again around {when}."
        if when
        else f"₹{total_amount} will be charged again every {duration_label.lower()}."
    )
    subject = (
        "Your theomy subscription is confirmed"
        if is_first_charge
        else f"Your theomy {plan_name} plan has renewed"
    )
    headline = "Subscription confirmed" if is_first_charge else "Subscription renewed"

    text_body = f"""Hi,

Your payment was successful and your {plan_name} plan is active.

Plan: {plan_name}
Duration: {duration_label}
Screens: {screens}
Tax (GST): Rs {tax_amount}
Total paid: Rs {total_amount}

Auto-renew is ON. {next_line}

To stop it, open Manage Profile on theomy.com or in the app and turn off
auto-renew. You keep access until the period you have already paid for ends.

Thank you for subscribing to theomy!
"""
    html_body = f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#0a0104; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0104; padding: 40px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#150307; border:1px solid rgba(212,175,55,0.25); border-radius:16px; overflow:hidden;">
          <tr><td style="background:linear-gradient(135deg,#73001E,#4a0113); padding:28px 32px;">
            <span style="font-size:22px; font-weight:600; color:#f5ebdd;">theomy</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px 0; font-size:20px; color:#f5ebdd;">{headline}</h1>
            <p style="margin:0 0 20px 0; font-size:14px; line-height:1.6; color:rgba(245,235,221,0.75);">
              Your payment was successful and your {plan_name} plan is active.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:rgba(245,235,221,0.8);">
              <tr><td style="padding:6px 0;">Plan</td><td style="padding:6px 0; text-align:right; font-weight:600;">{plan_name}</td></tr>
              <tr><td style="padding:6px 0;">Duration</td><td style="padding:6px 0; text-align:right;">{duration_label}</td></tr>
              <tr><td style="padding:6px 0;">Screens</td><td style="padding:6px 0; text-align:right;">{screens}</td></tr>
              <tr><td style="padding:6px 0;">Tax (GST)</td><td style="padding:6px 0; text-align:right;">&#8377;{tax_amount}</td></tr>
              <tr><td style="padding:10px 0 0 0; border-top:1px solid rgba(245,235,221,0.15); font-weight:700; color:#D4AF37;">Total paid</td><td style="padding:10px 0 0 0; border-top:1px solid rgba(245,235,221,0.15); text-align:right; font-weight:700; color:#D4AF37;">&#8377;{total_amount}</td></tr>
            </table>
            <div style="margin:24px 0 0 0; padding:14px 16px; background:rgba(212,175,55,0.08); border:1px solid rgba(212,175,55,0.3); border-radius:10px;">
              <p style="margin:0 0 6px 0; font-size:13px; font-weight:600; color:#D4AF37;">Auto-renew is on</p>
              <p style="margin:0; font-size:13px; line-height:1.6; color:rgba(245,235,221,0.75);">
                {next_line}<br>
                To stop it, open <strong style="color:#f5ebdd;">Manage Profile</strong> on theomy.com or in
                the app and turn off auto-renew. You keep access until the period you have already paid for ends.
              </p>
            </div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
"""
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_autopay_reminder_whatsapp(
    to_phone: str, plan_name: str, total_amount, renewal_at,
) -> None:
    """Sent a few days BEFORE an auto-renew charge, not after it.

    This is the cheapest dispute prevention there is. Almost every "I was
    charged without permission" claim is really "I forgot I had this",
    and a message that arrives while there is still time to cancel turns
    that into a cancellation instead of a chargeback. The customer's bank
    also warns them 24 hours ahead under the RBI's e-mandate rules; this
    is ours, earlier, and it names the plan rather than just an amount.

    Non-fatal like every other notification here.
    """
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return

    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    when = _ist_date(renewal_at, "%d %b %Y")
    body = (
        f"theomy: Your {plan_name} plan renews on {when} — ₹{total_amount} will be "
        f"charged via UPI Autopay. Nothing to do if you want to keep watching. "
        f"If not, open Manage Profile on theomy.com or in the app and turn off "
        f"auto-renew before then."
    )
    try:
        TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN).messages.create(
            from_=settings.TWILIO_FROM_NUMBER,
            to=f"whatsapp:{to_number}",
            body=body,
        )
    except Exception:
        pass


def send_autopay_reminder_email(
    to_email: str, plan_name: str, total_amount, duration_label: str, renewal_at,
) -> None:
    """The email twin of send_autopay_reminder_whatsapp — see there for
    why this goes out before the charge rather than after.
    """
    when = _ist_date(renewal_at, "%d %B %Y")
    subject = f"Your theomy {plan_name} plan renews on {when}"

    text_body = f"""Hi,

A heads-up before your next payment.

Plan: {plan_name}
Renews on: {when}
Amount: Rs {total_amount}
Paid by: UPI Autopay

If you want to keep watching, there is nothing to do — the payment goes
through on its own and your plan continues.

If you would rather stop, open Manage Profile on theomy.com or in the
app and turn off auto-renew before {when}. You keep access until the
period you have already paid for ends.

— theomy
"""
    html_body = f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#0a0104; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0104; padding: 40px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#150307; border:1px solid rgba(212,175,55,0.25); border-radius:16px; overflow:hidden;">
          <tr><td style="background:linear-gradient(135deg,#73001E,#4a0113); padding:28px 32px;">
            <span style="font-size:22px; font-weight:600; color:#f5ebdd;">theomy</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px 0; font-size:20px; color:#f5ebdd;">Your plan renews on {when}</h1>
            <p style="margin:0 0 20px 0; font-size:14px; line-height:1.6; color:rgba(245,235,221,0.75);">
              A heads-up before your next payment, so nothing arrives as a surprise.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:rgba(245,235,221,0.8);">
              <tr><td style="padding:6px 0;">Plan</td><td style="padding:6px 0; text-align:right; font-weight:600;">{plan_name}</td></tr>
              <tr><td style="padding:6px 0;">Billing cycle</td><td style="padding:6px 0; text-align:right;">{duration_label}</td></tr>
              <tr><td style="padding:6px 0;">Renews on</td><td style="padding:6px 0; text-align:right;">{when}</td></tr>
              <tr><td style="padding:6px 0;">Paid by</td><td style="padding:6px 0; text-align:right;">UPI Autopay</td></tr>
              <tr><td style="padding:10px 0 0 0; border-top:1px solid rgba(245,235,221,0.15); font-weight:700; color:#D4AF37;">Amount</td><td style="padding:10px 0 0 0; border-top:1px solid rgba(245,235,221,0.15); text-align:right; font-weight:700; color:#D4AF37;">&#8377;{total_amount}</td></tr>
            </table>
            <p style="margin:24px 0 0 0; font-size:13px; line-height:1.6; color:rgba(245,235,221,0.75);">
              Want to keep watching? Nothing to do — the payment goes through on its own.
            </p>
            <p style="margin:12px 0 0 0; font-size:13px; line-height:1.6; color:rgba(245,235,221,0.75);">
              Would rather stop? Open <strong style="color:#f5ebdd;">Manage Profile</strong> on theomy.com
              or in the app and turn off auto-renew before {when}. You keep access until the period you
              have already paid for ends.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
"""
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_withdrawal_paid_whatsapp(to_phone: str, amount_rupees) -> None:
    """WhatsApp confirmation once an admin has actually sent a
    withdrawal payment manually (bank transfer/UPI, since RazorpayX
    payout automation isn't wired up yet). Same non-fatal pattern as
    every other notification in this file.
    """
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return

    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"

    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = (
        f"theomy: Your withdrawal of ₹{amount_rupees} has been paid out. "
        f"Please check your bank/UPI account. Thank you for creating on theomy!"
    )
    try:
        client.messages.create(
            from_=settings.TWILIO_FROM_NUMBER,
            to=f"whatsapp:{to_number}",
            body=body,
        )
    except Exception:
        pass


def send_withdrawal_paid_email(to_email: str, creator_name: str, amount_rupees) -> None:
    """Withdrawal-paid confirmation email — same card-style HTML
    template as the rest of this file.
    """
    subject = "Your theomy withdrawal has been paid"
    text_body = f"""Hi {creator_name},

Your withdrawal request of ₹{amount_rupees} has been paid out manually by our team.
Please check your bank account / UPI for the transfer.

Thank you for creating on theomy!
"""
    html_body = f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#0a0104; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0104; padding: 40px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#150307; border:1px solid rgba(212,175,55,0.25); border-radius:16px; overflow:hidden;">
          <tr><td style="background:linear-gradient(135deg,#73001E,#4a0113); padding:28px 32px;">
            <span style="font-size:22px; font-weight:600; color:#f5ebdd;">theomy</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px 0; font-size:20px; color:#f5ebdd;">Withdrawal paid</h1>
            <p style="margin:0 0 20px 0; font-size:14px; line-height:1.6; color:rgba(245,235,221,0.75);">
              Hi {creator_name}, your withdrawal has been paid out manually by our team. Please check your bank account or UPI for the transfer.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:rgba(245,235,221,0.8);">
              <tr><td style="padding:10px 0 0 0; border-top:1px solid rgba(245,235,221,0.15); font-weight:700; color:#D4AF37;">Amount paid</td><td style="padding:10px 0 0 0; border-top:1px solid rgba(245,235,221,0.15); text-align:right; font-weight:700; color:#D4AF37;">₹{amount_rupees}</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
"""
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_withdrawal_rejected_email(to_email: str, creator_name: str, amount_rupees, reason: str) -> None:
    """Withdrawal-rejected notice — the amount is refunded to the
    creator's available balance server-side (see admin_revenue.py); this
    email exists so the creator isn't left wondering why the request
    disappeared from "pending", and knows the balance is still theirs.
    """
    subject = "Your theomy withdrawal request needs attention"
    text_body = f"""Hi {creator_name},

Your withdrawal request of ₹{amount_rupees} was not approved.

Reason: {reason}

The amount has been added back to your available balance, and you're
welcome to submit a new request once resolved.
"""
    html_body = f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#0a0104; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0104; padding: 40px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#150307; border:1px solid rgba(212,175,55,0.25); border-radius:16px; overflow:hidden;">
          <tr><td style="background:linear-gradient(135deg,#73001E,#4a0113); padding:28px 32px;">
            <span style="font-size:22px; font-weight:600; color:#f5ebdd;">theomy</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px 0; font-size:20px; color:#f5ebdd;">Withdrawal request update</h1>
            <p style="margin:0 0 20px 0; font-size:14px; line-height:1.6; color:rgba(245,235,221,0.75);">
              Hi {creator_name}, your withdrawal request of ₹{amount_rupees} wasn't approved. The amount has been added back to your available balance.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:rgba(245,235,221,0.8);">
              <tr><td style="padding:6px 0;">Reason</td><td style="padding:6px 0; text-align:right; font-weight:600;">{reason}</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
"""
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_video_purchase_whatsapp(to_phone: str, video_title: str, amount) -> None:
    """WhatsApp confirmation for a Pay-Per-Video purchase — same
    non-fatal, Twilio-optional pattern as send_payment_whatsapp above.
    """
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return

    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"

    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = (
        f"theomy: Your payment of ₹{amount} for \"{video_title}\" was successful. "
        f"You now have permanent access to watch it anytime. Thank you for your purchase!"
    )
    try:
        client.messages.create(
            from_=settings.TWILIO_FROM_NUMBER,
            to=f"whatsapp:{to_number}",
            body=body,
        )
    except Exception:
        pass


def send_video_purchase_email(to_email: str, video_title: str, amount, points_earned: int = 0) -> None:
    """Pay-Per-Video purchase confirmation email — same card-style HTML
    template as send_payment_email, adapted for a single-video purchase
    instead of a subscription plan.
    """
    subject = f"Your purchase of \"{video_title}\" is confirmed — theomy"
    text_body = f"""Hi,

Your payment was successful and you now have permanent access to watch
"{video_title}" on theomy.

Amount paid: ₹{amount}
{f"Reward points earned: {points_earned}" if points_earned else ""}

Thank you for your purchase!
"""
    html_body = f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#0a0104; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0104; padding: 40px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#150307; border:1px solid rgba(212,175,55,0.25); border-radius:16px; overflow:hidden;">
          <tr><td style="background:linear-gradient(135deg,#73001E,#4a0113); padding:28px 32px;">
            <span style="font-size:22px; font-weight:600; color:#f5ebdd;">theomy</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px 0; font-size:20px; color:#f5ebdd;">Purchase confirmed</h1>
            <p style="margin:0 0 20px 0; font-size:14px; line-height:1.6; color:rgba(245,235,221,0.75);">
              Your payment was successful — you now have permanent access to watch this title anytime.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:rgba(245,235,221,0.8);">
              <tr><td style="padding:6px 0;">Video</td><td style="padding:6px 0; text-align:right; font-weight:600;">{video_title}</td></tr>
              {f'<tr><td style="padding:6px 0;">Reward points earned</td><td style="padding:6px 0; text-align:right;">{points_earned}</td></tr>' if points_earned else ""}
              <tr><td style="padding:10px 0 0 0; border-top:1px solid rgba(245,235,221,0.15); font-weight:700; color:#D4AF37;">Total paid</td><td style="padding:10px 0 0 0; border-top:1px solid rgba(245,235,221,0.15); text-align:right; font-weight:700; color:#D4AF37;">₹{amount}</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
"""
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_event_enquiry_acknowledgement(to_email: str, org_name: str, event_title: str) -> None:
    """Sends the "we received your enquiry" acknowledgement email after a
    successful Event Listing Enquiry submission. Non-fatal on failure —
    the on-screen acknowledgement is the primary confirmation; email is a
    backup, so a delivery failure here should never fail the submission.
    """
    subject = "We've received your event listing enquiry — theomy"
    text_body = f"""Hi,

Thank you for submitting an event listing enquiry to theomy on behalf of {org_name}.

Event: {event_title}

Our team will review your submission and reach out to the contact details
provided if we need any more information. If approved, we'll manually
create the event listing and let you know.

— theomy
"""
    html_body = f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#0a0104; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0104; padding: 40px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#150307; border:1px solid rgba(212,175,55,0.25); border-radius:16px; overflow:hidden;">
          <tr><td style="background:linear-gradient(135deg,#73001E,#4a0113); padding:28px 32px;">
            <span style="font-size:22px; font-weight:600; color:#f5ebdd;">theomy</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px 0; font-size:20px; color:#f5ebdd;">Enquiry received</h1>
            <p style="margin:0 0 20px 0; font-size:14px; line-height:1.6; color:rgba(245,235,221,0.75);">
              Thank you for submitting an event listing enquiry on behalf of <strong style="color:#f5ebdd;">{org_name}</strong>.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:rgba(245,235,221,0.8); margin-bottom:20px;">
              <tr><td style="padding:6px 0;">Event</td><td style="padding:6px 0; text-align:right; font-weight:600;">{event_title}</td></tr>
              <tr><td style="padding:6px 0;">Status</td><td style="padding:6px 0; text-align:right;">Pending review</td></tr>
            </table>
            <p style="margin:0; font-size:13px; line-height:1.6; color:rgba(245,235,221,0.6);">
              Our team will review your submission and reach out to the contact details provided if we need more information. If approved, we'll manually create the event listing and let you know.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
"""
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_otp_whatsapp(phone: str, otp_code: str, expire_minutes: int) -> bool:
    """Sends a WhatsApp OTP code. Unlike the other notification senders in
    this module, this one is India-only by design (the OTP feature only
    applies to India registrations/logins), so it's safe to always prepend
    +91 rather than guessing a country code. Returns True/False so the
    caller can tell the user "OTP sent" vs "couldn't send OTP" — unlike
    the other notifications here, OTP delivery failure genuinely needs to
    be surfaced, since without it the user has no way to complete
    registration or login.
    """
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return False

    to_number = phone if phone.startswith("+") else f"+91{phone}"

    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = (
        f"Your theomy verification code is {otp_code}. "
        f"It expires in {expire_minutes} minutes. Don't share this code with anyone."
    )
    try:
        client.messages.create(
            from_=settings.TWILIO_FROM_NUMBER,
            to=f"whatsapp:{to_number}",
            body=body,
        )
        return True
    except Exception:
        return False


def send_video_approved_whatsapp(to_phone: str, creator_name: str, video_title: str) -> None:
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return
    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = (
        f"theomy: Great news, {creator_name}! Your video \"{video_title}\" has been "
        f"approved and is now live on theomy. Thank you for your submission!"
    )
    try:
        client.messages.create(from_=settings.TWILIO_FROM_NUMBER, to=f"whatsapp:{to_number}", body=body)
    except Exception:
        pass


def send_video_rejected_whatsapp(to_phone: str, creator_name: str, video_title: str, reason: str) -> None:
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return
    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = (
        f"theomy: Hi {creator_name}, your video \"{video_title}\" was not approved. "
        f"Reason: {reason}. You're welcome to make changes and resubmit."
    )
    try:
        client.messages.create(from_=settings.TWILIO_FROM_NUMBER, to=f"whatsapp:{to_number}", body=body)
    except Exception:
        pass


def _video_email_html(heading: str, body_lines: list[str], accent: str) -> str:
    lines_html = "".join(f'<p style="margin:0 0 14px; color:#f5ebdd; font-size:15px; line-height:1.6;">{line}</p>' for line in body_lines)
    return f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#0a0104; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0104; padding: 40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#150307; border:1px solid rgba(212,175,55,0.25); border-radius:16px; overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(135deg,#73001E,#4a0113); padding:28px 32px;">
                <span style="font-size:22px; font-weight:600; letter-spacing:0.5px; color:#f5ebdd;">theomy</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px; color:{accent}; font-size:18px; font-weight:600;">{heading}</p>
                {lines_html}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def send_video_approved_email(to_email: str, creator_name: str, video_title: str) -> None:
    subject = f'Your video "{video_title}" is now live on theomy'
    text_body = (
        f"Hi {creator_name},\n\nGreat news! Your video \"{video_title}\" has been approved "
        f"and is now live on theomy.\n\nThank you for your submission.\n\n— theomy"
    )
    html_body = _video_email_html(
        "Your video is now live! \U0001F389",
        [f'Hi {creator_name},', f'Your video "<b>{video_title}</b>" has been approved and is now live on theomy.', "Thank you for your submission."],
        "#6FCF97",
    )
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_video_rejected_email(to_email: str, creator_name: str, video_title: str, reason: str) -> None:
    subject = f'Update on your video "{video_title}"'
    text_body = (
        f"Hi {creator_name},\n\nYour video \"{video_title}\" was not approved.\n\n"
        f"Reason: {reason}\n\nYou're welcome to make changes and resubmit.\n\n— theomy"
    )
    html_body = _video_email_html(
        "Video not approved",
        [f'Hi {creator_name},', f'Your video "<b>{video_title}</b>" was not approved.',
         f'<b>Reason:</b> {reason}', "You're welcome to make changes and resubmit."],
        "#f87171",
    )
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_enquiry_approved_email(to_email: str, contact_person: str, event_title: str) -> None:
    subject = f'Your event listing "{event_title}" has been approved'
    text_body = (
        f"Hi {contact_person},\n\nGreat news! Your event listing enquiry for "
        f"\"{event_title}\" has been approved.\n\nThank you for submitting to theomy.\n\n— theomy"
    )
    html_body = _video_email_html(
        "Your event listing is approved! \U0001F389",
        [f'Hi {contact_person},', f'Your event listing enquiry for "<b>{event_title}</b>" has been approved.', "Thank you for submitting to theomy."],
        "#6FCF97",
    )
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_enquiry_rejected_email(to_email: str, contact_person: str, event_title: str, reason: str) -> None:
    subject = f'Update on your event listing "{event_title}"'
    text_body = (
        f"Hi {contact_person},\n\nYour event listing enquiry for \"{event_title}\" was not approved.\n\n"
        f"Reason: {reason}\n\nYou're welcome to make changes and resubmit.\n\n— theomy"
    )
    html_body = _video_email_html(
        "Event listing not approved",
        [f'Hi {contact_person},', f'Your event listing enquiry for "<b>{event_title}</b>" was not approved.',
         f'<b>Reason:</b> {reason}', "You're welcome to make changes and resubmit."],
        "#f87171",
    )
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_enquiry_approved_whatsapp(to_phone: str, contact_person: str, event_title: str) -> None:
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return
    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = (
        f"theomy: Great news, {contact_person}! Your event listing enquiry for "
        f"\"{event_title}\" has been approved. Thank you for submitting to theomy!"
    )
    try:
        client.messages.create(from_=settings.TWILIO_FROM_NUMBER, to=f"whatsapp:{to_number}", body=body)
    except Exception:
        pass


def send_enquiry_rejected_whatsapp(to_phone: str, contact_person: str, event_title: str, reason: str) -> None:
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return
    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = (
        f"theomy: Hi {contact_person}, your event listing enquiry for \"{event_title}\" "
        f"was not approved. Reason: {reason}. You're welcome to make changes and resubmit."
    )
    try:
        client.messages.create(from_=settings.TWILIO_FROM_NUMBER, to=f"whatsapp:{to_number}", body=body)
    except Exception:
        pass


def send_organiser_request_approved_email(to_email: str, name: str) -> None:
    subject = "Your Plays Organiser request has been approved"
    text_body = (
        f"Hi {name},\n\nYour request to become a Plays Organiser on theomy has been approved. "
        f"You can now create and manage event listings.\n\n— theomy"
    )
    html_body = _video_email_html(
        "You're now a Plays Organiser! \U0001F389",
        [f"Hi {name},", "Your request to become a Plays Organiser has been approved.", "You can now create and manage event listings."],
        "#6FCF97",
    )
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_organiser_request_rejected_email(to_email: str, name: str, reason: str | None) -> None:
    subject = "Update on your Plays Organiser request"
    reason_line = f"Reason: {reason}\n\n" if reason else ""
    text_body = (
        f"Hi {name},\n\nYour request to become a Plays Organiser on theomy was not approved.\n\n"
        f"{reason_line}You're welcome to submit another request.\n\n— theomy"
    )
    html_body = _video_email_html(
        "Plays Organiser request not approved",
        [f"Hi {name},", "Your request to become a Plays Organiser was not approved."]
        + ([f"<b>Reason:</b> {reason}"] if reason else [])
        + ["You're welcome to submit another request."],
        "#f87171",
    )
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_organiser_request_approved_whatsapp(to_phone: str, name: str) -> None:
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return
    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = (
        f"theomy: Great news, {name}! Your request to become a Plays Organiser has been "
        f"approved. You can now create and manage event listings."
    )
    try:
        client.messages.create(from_=settings.TWILIO_FROM_NUMBER, to=f"whatsapp:{to_number}", body=body)
    except Exception:
        pass


def send_organiser_request_rejected_whatsapp(to_phone: str, name: str, reason: str | None) -> None:
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return
    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    reason_part = f" Reason: {reason}." if reason else ""
    body = (
        f"theomy: Hi {name}, your request to become a Plays Organiser was not approved."
        f"{reason_part} You're welcome to submit another request."
    )
    try:
        client.messages.create(from_=settings.TWILIO_FROM_NUMBER, to=f"whatsapp:{to_number}", body=body)
    except Exception:
        pass


def send_donation_registration_approved_email(to_email: str, name: str, group_name: str) -> None:
    subject = "Your donation registration has been approved"
    text_body = (
        f"Hi {name},\n\nYour donation registration for \"{group_name}\" on theomy has been approved. "
        f"Supporters can now find and donate to you.\n\n— theomy"
    )
    html_body = _video_email_html(
        "Your donation registration is approved! \U0001F389",
        [f"Hi {name},", f"Your donation registration for \"{group_name}\" has been approved.", "Supporters can now find and donate to you."],
        "#6FCF97",
    )
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_donation_registration_rejected_email(to_email: str, name: str, group_name: str, reason: str) -> None:
    subject = "Update on your donation registration"
    text_body = (
        f"Hi {name},\n\nYour donation registration for \"{group_name}\" on theomy was not approved.\n\n"
        f"Reason: {reason}\n\nYou're welcome to submit another registration.\n\n— theomy"
    )
    html_body = _video_email_html(
        "Donation registration not approved",
        [f"Hi {name},", f"Your donation registration for \"{group_name}\" was not approved.", f"<b>Reason:</b> {reason}", "You're welcome to submit another registration."],
        "#f87171",
    )
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_donation_registration_approved_whatsapp(to_phone: str, name: str, group_name: str) -> None:
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return
    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = (
        f"theomy: Great news, {name}! Your donation registration for \"{group_name}\" has been "
        f"approved. Supporters can now find and donate to you."
    )
    try:
        client.messages.create(from_=settings.TWILIO_FROM_NUMBER, to=f"whatsapp:{to_number}", body=body)
    except Exception:
        pass


def send_donation_registration_rejected_whatsapp(to_phone: str, name: str, group_name: str, reason: str) -> None:
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return
    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = (
        f"theomy: Hi {name}, your donation registration for \"{group_name}\" was not approved. "
        f"Reason: {reason}. You're welcome to submit another registration."
    )
    try:
        client.messages.create(from_=settings.TWILIO_FROM_NUMBER, to=f"whatsapp:{to_number}", body=body)
    except Exception:
        pass


def send_live_streaming_enabled_whatsapp(to_phone: str, name: str) -> None:
    """Tells a Content Creator / Plays Organiser their account can now
    broadcast — the actual RTMP URL + Stream Key aren't known yet at
    this point (those only exist once THEY create a live event), so
    this just points them to where to go get those details themselves.
    """
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return
    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = (
        f"theomy: Hi {name}, live streaming has been enabled for your account. "
        f"Log in and go to \"My Live Events\" to create an event and get your RTMP URL + Stream Key "
        f"for broadcasting software like OBS."
    )
    try:
        client.messages.create(from_=settings.TWILIO_FROM_NUMBER, to=f"whatsapp:{to_number}", body=body)
    except Exception:
        pass


def send_live_streaming_enabled_email(to_email: str, name: str) -> None:
    subject = "Live streaming is now enabled on your theomy account"
    text_body = (
        f"Hi {name},\n\nLive streaming has been enabled for your account. Log in and go to "
        f"\"My Live Events\" to create an event — you'll get an RTMP URL and Stream Key there to use with "
        f"broadcasting software like OBS Studio.\n\n— theomy"
    )
    html_body = _video_email_html(
        "Live streaming enabled \U0001F3A5",
        [
            f"Hi {name},",
            "Live streaming has been enabled for your account.",
            'Log in and go to "<b>My Live Events</b>" to create an event — you\'ll get an RTMP URL and '
            "Stream Key there to use with broadcasting software like OBS Studio.",
        ],
        "#D4AF37",
    )
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass


def send_ticket_booking_whatsapp(
    to_phone: str, event_title: str, tier_name: str, quantity: int, amount, reference: str
) -> None:
    """Confirmation for a ticket to a show people physically attend —
    same non-fatal, Twilio-optional pattern as the others above.

    The booking reference goes in the message on purpose: it is what
    someone reads out at the door if their phone is flat and they can't
    show the QR code.
    """
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return

    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"

    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    seats = f"{quantity} ticket" + ("" if quantity == 1 else "s")
    body = (
        f"theomy: Booking confirmed for \"{event_title}\". "
        f"{seats}, {tier_name}, ₹{amount}. "
        f"Your booking number is {reference}. "
        f"Show the QR code in the app or on theomy.com at the venue. See you there!"
    )
    try:
        client.messages.create(
            from_=settings.TWILIO_FROM_NUMBER,
            to=f"whatsapp:{to_number}",
            body=body,
        )
    except Exception:
        pass


def send_ticket_booking_email(
    to_email: str,
    event_title: str,
    tier_name: str,
    quantity: int,
    amount,
    reference: str,
    venue: str = "",
    when: str = "",
) -> None:
    """Emailed booking confirmation. Non-fatal on failure, like every
    other notification here — the payment has already gone through.
    """
    subject = f"Your theomy booking for {event_title}"
    seats = f"{quantity} ticket" + ("" if quantity == 1 else "s")
    where_when = "\n".join(filter(None, [f"Venue: {venue}" if venue else "", f"When: {when}" if when else ""]))

    text_body = f"""Hi,

Your booking is confirmed.

Event: {event_title}
{where_when}
Tickets: {seats} ({tier_name})
Paid: ₹{amount}

Booking number: {reference}

Show the QR code from My Bookings — in the theomy app or on
theomy.com — at the venue. If your phone is flat, the booking number
above is enough.

See you at the show.
theomy
"""

    html_body = f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#0a0104; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0104; padding: 40px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#150307; border:1px solid rgba(212,175,55,0.25); border-radius:16px; overflow:hidden;">
          <tr><td style="background:linear-gradient(135deg,#73001E,#4a0113); padding:28px 32px;">
            <span style="font-size:22px; font-weight:600; color:#f5ebdd;">theomy</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px 0; font-size:20px; color:#f5ebdd;">Booking confirmed</h1>
            <p style="margin:0 0 20px 0; font-size:14px; line-height:1.6; color:rgba(245,235,221,0.75);">
              {event_title}
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:rgba(245,235,221,0.8);">
              <tr><td style="padding:6px 0;">Venue</td><td style="padding:6px 0; text-align:right; font-weight:600;">{venue or "—"}</td></tr>
              <tr><td style="padding:6px 0;">When</td><td style="padding:6px 0; text-align:right;">{when or "—"}</td></tr>
              <tr><td style="padding:6px 0;">Tickets</td><td style="padding:6px 0; text-align:right;">{seats} ({tier_name})</td></tr>
              <tr><td style="padding:6px 0;">Paid</td><td style="padding:6px 0; text-align:right; font-weight:600;">&#8377;{amount}</td></tr>
            </table>
            <p style="margin:24px 0 0 0; padding:16px; background:rgba(212,175,55,0.08); border:1px solid rgba(212,175,55,0.25); border-radius:10px; font-size:18px; letter-spacing:2px; text-align:center; color:#d4af37; font-weight:700;">
              {reference}
            </p>
            <p style="margin:16px 0 0 0; font-size:13px; line-height:1.6; color:rgba(245,235,221,0.6);">
              Show the QR code from My Bookings, in the theomy app or on theomy.com, at the venue.
              If your phone is flat, the booking number above is enough.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
"""
    _send_email(to_email, subject, text_body, html_body)


# ---------------------------------------------------------------------
# Refer & Earn invites
# ---------------------------------------------------------------------
# Both senders RAISE on failure, unlike every other notification in this
# file. The others ride along after something that already succeeded (a
# payment, an approval), so swallowing an SMTP error is the right call
# there. Here, sending IS the action the person asked for — telling them
# "Sent" when nothing went out would be a lie they'd only discover when
# their friend never got it.


def send_referral_invite_email(
    to_email: str, referrer_name: str, code: str, share_url: str,
    reward_points: int, expires_on: str,
) -> None:
    """The invite a customer sends from their Refer & Earn page."""
    subject = f"{referrer_name} has invited you to theomy"

    text_body = (
        f"{referrer_name} thinks you'd enjoy theomy — Bengali theatre, streaming at home.\n\n"
        f"Join with their invite and you'll get {reward_points} reward points "
        f"once you take your first subscription. Points come straight off what you pay next time.\n\n"
        f"Sign up here: {share_url}\n\n"
        f"Or enter this code when you register: {code}\n"
        f"The invite is good until {expires_on}.\n\n"
        f"— theomy"
    )

    html_body = f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#0a0104; font-family:'Segoe UI', Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0104; padding:40px 0;">
      <tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#150307; border:1px solid rgba(212,175,55,0.25); border-radius:18px; overflow:hidden;">

          <tr><td style="background:linear-gradient(135deg,#73001E,#4a0113); padding:30px 36px;">
            <span style="font-size:24px; font-weight:600; letter-spacing:0.5px; color:#f5ebdd;">theomy</span>
            <p style="margin:6px 0 0; font-size:12px; letter-spacing:1.5px; text-transform:uppercase; color:rgba(245,235,221,0.65);">Bengali theatre, at home</p>
          </td></tr>

          <tr><td style="padding:36px 36px 8px;">
            <p style="margin:0 0 6px; font-size:13px; letter-spacing:0.5px; color:#d4af37;">An invitation from {referrer_name}</p>
            <p style="margin:0 0 18px; font-size:26px; line-height:1.25; font-weight:700; color:#f5ebdd;">
              Come and watch with us
            </p>
            <p style="margin:0 0 22px; font-size:15px; line-height:1.65; color:rgba(245,235,221,0.8);">
              {referrer_name} thinks you'd enjoy theomy — full-length Bengali plays, recorded live on stage
              and streamed to your screen, plus tickets to shows you can go and see in person.
            </p>
          </td></tr>

          <tr><td style="padding:0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.08); border:1px solid rgba(212,175,55,0.3); border-radius:14px;">
              <tr><td style="padding:22px; text-align:center;">
                <p style="margin:0 0 10px; font-size:13px; color:rgba(245,235,221,0.7);">Your invite code</p>
                <p style="margin:0 0 4px; font-size:30px; letter-spacing:7px; font-weight:700; color:#d4af37;">{code}</p>
                <p style="margin:12px 0 0; font-size:14px; line-height:1.6; color:#f5ebdd;">
                  Worth <strong style="color:#d4af37;">{reward_points} reward points</strong> once you take your first subscription
                </p>
              </td></tr>
            </table>
          </td></tr>

          <tr><td style="padding:26px 36px 8px; text-align:center;">
            <a href="{share_url}"
               style="display:inline-block; background:#d4af37; color:#0a0104; text-decoration:none;
                      font-size:15px; font-weight:700; padding:14px 38px; border-radius:999px;">
              Create your account
            </a>
            <p style="margin:14px 0 0; font-size:12px; line-height:1.6; color:rgba(245,235,221,0.45);">
              The code is filled in for you when you use the button.<br>
              This invite is good until {expires_on}.
            </p>
          </td></tr>

          <tr><td style="padding:28px 36px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(245,235,221,0.12);">
              <tr><td style="padding-top:18px;">
                <p style="margin:0 0 10px; font-size:13px; font-weight:600; color:#f5ebdd;">How the points work</p>
                <p style="margin:0 0 7px; font-size:13px; line-height:1.6; color:rgba(245,235,221,0.65);">
                  1 &nbsp;Sign up using the code above.
                </p>
                <p style="margin:0 0 7px; font-size:13px; line-height:1.6; color:rgba(245,235,221,0.65);">
                  2 &nbsp;Take your first subscription.
                </p>
                <p style="margin:0; font-size:13px; line-height:1.6; color:rgba(245,235,221,0.65);">
                  3 &nbsp;{reward_points} points land in your account — and {referrer_name} gets some too.
                  Spend them against what you pay next time.
                </p>
              </td></tr>
            </table>
          </td></tr>

          <tr><td style="background:rgba(0,0,0,0.3); padding:16px 36px; text-align:center;">
            <p style="margin:0; font-size:11px; line-height:1.6; color:rgba(245,235,221,0.4);">
              You got this because {referrer_name} entered your address on theomy.
              No account has been made for you, and we won't write again unless you join.
            </p>
          </td></tr>

        </table>
      </td></tr>
    </table>
  </body>
</html>
"""
    _send_email(to_email, subject, text_body, html_body)


def send_referral_invite_whatsapp(
    to_phone: str, referrer_name: str, code: str, share_url: str, reward_points: int,
) -> None:
    """The same invite over WhatsApp. Raises if Twilio isn't configured,
    rather than returning quietly — see the note above.
    """
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        raise RuntimeError("WhatsApp sending isn't set up on this server.")
    if not to_phone:
        raise ValueError("No phone number given.")

    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    body = (
        f"{referrer_name} has invited you to theomy — Bengali theatre, streaming at home.\n\n"
        f"Join with code *{code}* and you'll get {reward_points} reward points once you take "
        f"your first subscription.\n\n{share_url}"
    )

    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    client.messages.create(
        from_=settings.TWILIO_FROM_NUMBER,
        to=f"whatsapp:{to_number}",
        body=body,
    )


# --- Family: a sub-account's minor flag was changed -------------------
#
# Sent to the PARENT, not to the sub-account, and only when a profile
# stops being treated as under-18 — the direction that opens content up.
# The point is that a parent finds out even if somebody else made the
# change from their logged-in browser, so both channels are tried: the
# phone number is optional on non-India accounts (see User.phone), and
# the email address always exists.
#
# Both swallow their errors. A failed notification must never undo the
# change the parent just made, or leave the API returning an error for
# something that did in fact happen.

def send_minor_flag_removed_whatsapp(to_phone: str, parent_name: str, child_name: str) -> None:
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return
    if not to_phone:
        return
    to_number = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
    body = (
        f"theomy: Hi {parent_name}, the family account \"{child_name}\" is no longer marked "
        f"as being for someone under 18. It can now watch age-restricted content, including 18+. "
        f"If you didn't make this change, open Manage Profile on theomy and switch it back, "
        f"then change your password."
    )
    try:
        client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        client.messages.create(from_=settings.TWILIO_FROM_NUMBER, to=f"whatsapp:{to_number}", body=body)
    except Exception:
        pass


def send_minor_flag_removed_email(to_email: str, parent_name: str, child_name: str) -> None:
    subject = f'"{child_name}" is no longer set as an under-18 account'
    text_body = (
        f"Hi {parent_name},\n\n"
        f"The family account \"{child_name}\" on theomy is no longer marked as being for "
        f"someone under 18. It can now watch age-restricted content, including 18+.\n\n"
        f"If you didn't make this change, open Manage Profile on theomy and switch it back, "
        f"then change your password.\n\n— theomy"
    )
    html_body = _video_email_html(
        "An age setting changed on your family",
        [
            f"Hi {parent_name},",
            f'The family account "<b>{child_name}</b>" is no longer marked as being for someone '
            f"under 18. It can now watch age-restricted content, including 18+.",
            "If you didn't make this change, open Manage Profile on theomy and switch it back, "
            "then change your password.",
        ],
        "#D4AF37",
    )
    try:
        _send_email(to_email, subject, text_body, html_body)
    except Exception:
        pass

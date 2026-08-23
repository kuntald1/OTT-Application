from twilio.rest import Client as TwilioClient

from app.config import settings
from app.email_utils import _send_email


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

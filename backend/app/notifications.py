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

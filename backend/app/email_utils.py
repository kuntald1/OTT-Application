import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings


def _build_html_body(reset_link: str) -> str:
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
                <h1 style="margin:0 0 16px 0; font-size:20px; color:#f5ebdd; font-weight:600;">
                  Reset your password
                </h1>
                <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:rgba(245,235,221,0.75);">
                  We received a request to reset the password for your theomy account. Click the button below to choose a new one.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                  <tr>
                    <td style="border-radius:999px; background:linear-gradient(135deg,#D4AF37,#b8912b);">
                      <a href="{reset_link}"
                         style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:600; color:#2a1a00; text-decoration:none; border-radius:999px;">
                        Reset password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px 0; font-size:13px; color:rgba(245,235,221,0.5);">
                  This link expires in {settings.RESET_TOKEN_EXPIRE_MINUTES} minutes.
                </p>
                <p style="margin:0 0 20px 0; font-size:13px; color:rgba(245,235,221,0.5);">
                  If the button doesn't work, copy and paste this link into your browser:<br>
                  <a href="{reset_link}" style="color:#D4AF37; word-break:break-all;">{reset_link}</a>
                </p>
                <p style="margin:20px 0 0 0; font-size:12px; line-height:1.6; color:rgba(245,235,221,0.4); border-top:1px solid rgba(245,235,221,0.1); padding-top:16px;">
                  If you didn't request this, you can safely ignore this email — your password won't be changed.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0 0; font-size:11px; color:rgba(245,235,221,0.3);">
            &copy; theomy
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _build_text_body(reset_link: str) -> str:
    return f"""Hi,

We received a request to reset your theomy password.

Click the link below to choose a new password. This link expires in
{settings.RESET_TOKEN_EXPIRE_MINUTES} minutes:

{reset_link}

If you didn't request this, you can safely ignore this email — your
password won't be changed.

— theomy
"""


def _send_email(to_email: str, subject: str, text_body: str, html_body: str) -> None:
    """Shared low-level sender via Gmail SMTP (App Password). Any module
    that needs to send a themed email (password reset, payment
    confirmation, etc.) builds its own subject/text/html and calls this.
    """
    msg = MIMEMultipart("alternative")
    msg["From"] = f"theomy <{settings.SMTP_EMAIL}>"
    msg["To"] = to_email
    msg["Subject"] = subject

    # Plain text part must be attached FIRST, HTML second — clients pick
    # the LAST part they support, so this order makes HTML the preferred
    # rendering while text stays as the fallback.
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        server.login(settings.SMTP_EMAIL, settings.SMTP_APP_PASSWORD)
        server.sendmail(settings.SMTP_EMAIL, to_email, msg.as_string())


def send_password_reset_email(to_email: str, reset_link: str) -> None:
    """Sends the reset link via Gmail SMTP using an App Password.

    Sends both a plain-text and an HTML version (multipart/alternative) —
    email clients that support HTML show the styled version, everything
    else falls back to plain text automatically.
    """
    _send_email(
        to_email,
        "Reset your theomy password",
        _build_text_body(reset_link),
        _build_html_body(reset_link),
    )

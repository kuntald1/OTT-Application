import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings


def send_password_reset_email(to_email: str, reset_link: str) -> None:
    """Sends the reset link via Gmail SMTP using an App Password.

    Raises on failure — callers should catch and log rather than let a
    broken mail server take down the whole request, but for now we let it
    surface so setup problems are obvious during testing.
    """
    subject = "Reset your theomy password"
    body = f"""Hi,

We received a request to reset your theomy password.

Click the link below to choose a new password. This link expires in
{settings.RESET_TOKEN_EXPIRE_MINUTES} minutes:

{reset_link}

If you didn't request this, you can safely ignore this email — your
password won't be changed.

— theomy
"""

    msg = MIMEMultipart()
    msg["From"] = settings.SMTP_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        server.login(settings.SMTP_EMAIL, settings.SMTP_APP_PASSWORD)
        server.sendmail(settings.SMTP_EMAIL, to_email, msg.as_string())

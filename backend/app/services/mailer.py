"""
Simple SMTP mailer for transactional emails (e.g. temp password delivery).
Uses stdlib smtplib — no extra packages required.
If SMTP_HOST is not configured the send is skipped and a warning is logged.
"""
import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def send_temp_password_email(to_email: str, to_name: str, tmp_pwd: str) -> bool:
    """
    Send the temporary password to the user.
    Returns True if the email was sent, False if SMTP is not configured.
    Raises on SMTP errors so the caller can surface them.
    """
    if not settings.smtp_host:
        logger.warning(
            "SMTP not configured — skipping temp password email to %s. "
            "Set SMTP_HOST in .env to enable automatic delivery.",
            to_email,
        )
        return False

    subject = "MockBank — Your temporary password"
    html_body = f"""\
<html><body style="font-family:sans-serif;color:#1f2328;max-width:480px;margin:0 auto">
  <div style="background:#3b82d4;padding:1.2rem 1.5rem;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:1.2rem">MockBank</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:1.5rem;border-radius:0 0 8px 8px">
    <p>Hi <strong>{to_name}</strong>,</p>
    <p>Your account password has been reset by an administrator.
       Use the temporary password below to log in — you will be required to
       choose a new password immediately.</p>
    <div style="background:#f7f8fa;border:1px solid #e5e7eb;border-radius:6px;
                padding:1rem 1.2rem;font-family:monospace;font-size:1.2rem;
                letter-spacing:0.08em;color:#1f2328;margin:1.2rem 0">
      {tmp_pwd}
    </div>
    <p style="color:#57606a;font-size:0.85rem">
      If you did not expect this, contact your administrator immediately.
    </p>
  </div>
</body></html>"""

    text_body = (
        f"Hi {to_name},\n\n"
        f"Your MockBank password has been reset by an administrator.\n"
        f"Temporary password: {tmp_pwd}\n\n"
        f"Log in and change it immediately.\n"
        f"If you did not expect this, contact your administrator."
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    context = ssl.create_default_context()
    if settings.smtp_use_tls:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls(context=context)
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(settings.smtp_from, to_email, msg.as_string())
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(settings.smtp_from, to_email, msg.as_string())

    logger.info("Temp password email sent to %s", to_email)
    return True

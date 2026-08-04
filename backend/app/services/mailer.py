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
    Send the temporary password to the user (admin-initiated reset).
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
  <div style="background:#f0a500;padding:1.2rem 1.5rem;border-radius:8px 8px 0 0">
    <h2 style="color:#0d1117;margin:0;font-size:1.2rem">MockBank</h2>
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


def send_welcome_email(
    to_email: str,
    to_name: str,
    tmp_pwd: str,
    login_url: str,
) -> bool:
    """
    Send a welcome email to a newly self-registered customer with their
    temporary password.  The user must log in via IBM Verify, change the
    password there, and then proceed to MFA enrolment in MockBank.

    Returns True if sent, False if SMTP is not configured (caller logs a
    warning and the temp password is still shown in the API response for
    demo purposes).
    """
    if not settings.smtp_host:
        logger.warning(
            "SMTP not configured — skipping welcome email to %s. "
            "Set SMTP_HOST in .env to enable automatic delivery.",
            to_email,
        )
        return False

    subject = "Welcome to MockBank — Your temporary password"
    html_body = f"""\
<html>
<body style="font-family:-apple-system,'Segoe UI',sans-serif;color:#1f2328;
             background:#f7f8fa;margin:0;padding:2rem 1rem">
  <div style="max-width:500px;margin:0 auto">

    <!-- Header -->
    <div style="background:#0d1117;border-radius:10px 10px 0 0;
                padding:1.4rem 1.8rem;display:flex;align-items:center;gap:0.75rem">
      <div style="width:36px;height:36px;border-radius:8px;background:#f0a500;
                  display:inline-flex;align-items:center;justify-content:center;
                  font-weight:900;font-size:1.1rem;color:#0d1117">M</div>
      <span style="color:#e6edf3;font-weight:700;font-size:1rem">MockBank</span>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;
                border-radius:0 0 10px 10px;padding:1.8rem">

      <h2 style="margin:0 0 0.75rem;font-size:1.25rem;color:#1f2328">
        Welcome, {to_name}!
      </h2>
      <p style="color:#57606a;line-height:1.6;margin:0 0 1rem">
        Your MockBank account has been created and your identity is registered
        in <strong>IBM Verify</strong>.
      </p>
      <p style="color:#57606a;line-height:1.6;margin:0 0 1.25rem">
        Use the <strong>temporary password</strong> below to sign in for the
        first time. IBM Verify will ask you to choose a new, personal password
        immediately — this ensures only you know your credentials.
      </p>

      <!-- Temp password box -->
      <div style="background:#f7f8fa;border:1px solid #e5e7eb;border-radius:8px;
                  padding:1rem 1.25rem;margin:0 0 1.5rem">
        <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.08em;
                    text-transform:uppercase;color:#57606a;margin-bottom:0.4rem">
          Temporary Password
        </div>
        <div style="font-family:'SF Mono',Menlo,monospace;font-size:1.15rem;
                    letter-spacing:0.06em;color:#1f2328;font-weight:600">
          {tmp_pwd}
        </div>
      </div>

      <!-- Steps -->
      <p style="font-weight:700;color:#1f2328;margin:0 0 0.6rem">
        What to do next:
      </p>
      <ol style="margin:0 0 1.5rem;padding-left:1.25rem;color:#57606a;line-height:1.75">
        <li>Click <strong>Sign in to MockBank</strong> below</li>
        <li>Enter your email and the temporary password above</li>
        <li>IBM Verify will prompt you to set a new personal password</li>
        <li>Once signed in, set up MFA (passkey, TOTP, or push) from the welcome screen</li>
      </ol>

      <a href="{login_url}"
         style="display:block;text-align:center;background:#f0a500;color:#0d1117;
                font-weight:700;font-size:0.95rem;padding:0.85rem;border-radius:8px;
                text-decoration:none;letter-spacing:0.01em">
        Sign in to MockBank →
      </a>

      <p style="font-size:0.75rem;color:#8b949e;margin:1.5rem 0 0;text-align:center;
                line-height:1.5">
        This temporary password expires after your first login.
        If you did not create a MockBank account, please ignore this email.
      </p>
    </div>
  </div>
</body>
</html>"""

    text_body = (
        f"Welcome to MockBank, {to_name}!\n\n"
        f"Your account is registered in IBM Verify.\n\n"
        f"Temporary password: {tmp_pwd}\n\n"
        f"Steps:\n"
        f"1. Visit {login_url}\n"
        f"2. Sign in with your email and the temporary password above\n"
        f"3. IBM Verify will ask you to set a new personal password\n"
        f"4. Set up MFA from the welcome screen\n\n"
        f"If you did not create this account, please ignore this email."
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

    logger.info("Welcome email sent to %s", to_email)
    return True

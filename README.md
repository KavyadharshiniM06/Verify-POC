# MockBank — Passwordless Banking POC

> No passwords. Ever. A mock retail banking app that demonstrates every major passwordless
> authentication method available in IBM Verify SaaS — all running locally with a single
> `docker compose up`.

---

## What this POC demonstrates

MockBank replaces traditional username/password login with five passwordless (or one-time) auth
methods, all backed by **IBM Verify SaaS**:

- **FIDO2 / WebAuthn** — register and authenticate with Face ID, Touch ID, or a hardware security key. The credential never leaves the device; IBM Verify acts as the Relying Party server.
- **TOTP** — enroll an authenticator app (Google Authenticator, Authy) by scanning a QR code; verify with a 6-digit time-based one-time password.
- **Push Notifications** — the IBM Verify mobile app receives a push; the user taps Approve and the browser session is granted automatically (long-poll).
- **Email OTP** — IBM Verify sends a one-time code to the user's registered email address.
- **SSO (OIDC)** — standard OpenID Connect Authorization Code Flow; IBM Verify hosts the login page and issues a signed ID token.

After any successful authentication the user lands on a synthetic banking dashboard showing
accounts, balances, recent transactions, and a fund-transfer form — all running off a local
SQLite database seeded at startup.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Compose                       │
│                                                          │
│  ┌───────────────┐    ┌───────────────┐    ┌─────────┐  │
│  │  React (3000) │───▶│ FastAPI (8000)│───▶│  ngrok  │  │
│  │               │    │               │    │  :4040  │  │
│  └───────────────┘    └───────────────┘    └─────────┘  │
│                               │                          │
└───────────────────────────────│──────────────────────────┘
                                ▼
                    ┌─────────────────────┐
                    │  IBM Verify SaaS    │
                    │  ┌──────────────┐  │
                    │  │ FIDO2/WebAuthn│  │
                    │  │ TOTP          │  │
                    │  │ Push Notif.   │  │
                    │  │ Email OTP     │  │
                    │  │ OIDC (SSO)    │  │
                    │  │ User Mgmt     │  │
                    │  └──────────────┘  │
                    └─────────────────────┘
```

- **React** (Vite, TypeScript) — single-page app served on port 3000.
- **FastAPI** (Python 3.11, async) — REST API on port 8000; owns all IBM Verify interactions.
- **ngrok** — creates an HTTPS tunnel to the FastAPI container. WebAuthn requires a valid HTTPS
  origin, so ngrok is essential for passkey demos on real devices.
- **IBM Verify SaaS** — cloud identity service; handles credential storage, challenge/response,
  push delivery, OIDC token issuance.

---

## Authentication Methods

| Method | Frontend Page(s) | Backend Route(s) | IBM Verify API |
|--------|-----------------|------------------|----------------|
| FIDO2 / WebAuthn | Register / Login | `/auth/fido2/register-options`, `/auth/fido2/register`, `/auth/fido2/login-options`, `/auth/fido2/login` | FIDO2 Relying Party |
| TOTP | TOTPEnrollPage, TOTPVerifyPage | `/auth/totp/enroll`, `/auth/totp/verify` | TOTP Verifications |
| Push Notifications | PushLoginPage | `/auth/push/initiate`, `/auth/push/poll` | Push Verifications |
| Email OTP | EmailOTPPage | `/auth/email-otp/send`, `/auth/email-otp/verify` | Email OTP Verifications |
| SSO (OIDC) | OIDCCallbackPage | `/auth/sso/login`, `/auth/sso/callback` | OIDC Authorization Code Flow |

---

## Prerequisites

- **Docker + Docker Compose** — [install Docker](https://docs.docker.com/get-docker/)
- **ngrok account** (free tier works) — [sign up at ngrok.com](https://ngrok.com) and copy your
  authtoken from the dashboard
- **IBM Verify SaaS tenant** — see [`IBM_VERIFY_SETUP.md`](IBM_VERIFY_SETUP.md) for the full
  step-by-step provisioning guide
- **Node.js 20+** — only needed for local development without Docker
- **Python 3.11+** — only needed for local development without Docker

---

## Quick Start

### 1. Clone the repository

```bash
git clone <repo-url> mockbank
cd mockbank
```

### 2. Provision IBM Verify SaaS

Follow **[`IBM_VERIFY_SETUP.md`](IBM_VERIFY_SETUP.md)** to:
- Create a free IBM Verify SaaS trial tenant
- Register an OIDC application
- Note the Client ID, Client Secret, and tenant URL

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in every value (see [Environment Variables](#environment-variables) below).

### 4. Start the stack

```bash
docker compose up --build
```

All three services start: `backend` (FastAPI), `frontend` (React/Vite), and `ngrok`.

### 5. Get your ngrok public URL

```bash
curl http://localhost:4040/api/tunnels | python3 -m json.tool
```

Look for `"public_url"` — it will be something like `https://abcd1234.ngrok-free.app`.

### 6. Update FIDO2 settings in `.env`

```
FIDO2_RP_ID=abcd1234.ngrok-free.app
FIDO2_RP_ORIGIN=https://abcd1234.ngrok-free.app
```

Restart the backend container to pick up the change:

```bash
docker compose restart backend
```

### 7. Open the app

Navigate to **http://localhost:3000** on your desktop, or open the ngrok HTTPS URL on your phone
to demo Face ID / Touch ID passkeys on a real device.

---

## Demo Walkthrough

```
Demo 1 — Passkey (Face ID / Touch ID)
──────────────────────────────────────
1. Open the ngrok HTTPS URL on your phone
2. Click "Register a passkey"
3. Enter your IBM Verify User ID, email, name
4. Your phone prompts for Face ID / Touch ID
5. Approve → you're redirected to the banking dashboard
6. Click Logout → click "Login with Face ID / Touch ID"
7. Enter User ID → Face ID fires → you're in. No password.

Demo 2 — TOTP
──────────────
1. Click "Login with Authenticator App" → "Enroll TOTP"
2. Scan the QR code in Google Authenticator / Authy
3. Enter the 6-digit code → you're in

Demo 3 — Push Notification
───────────────────────────
1. Install IBM Verify app on your phone, enroll your account
2. Click "Login with IBM Verify App"
3. Enter User ID → push sent to your phone
4. Tap Approve in the IBM Verify app → browser detects approval → you're in

Demo 4 — Email OTP
───────────────────
1. Click "Login with Email OTP"
2. Enter User ID + email → code sent
3. Enter code → you're in

Demo 5 — SSO
─────────────
1. Click "Login with SSO"
2. Redirected to IBM Verify hosted login page
3. Enter credentials → redirected back → you're in
```

---

## Environment Variables

Copy `.env.example` to `.env` and populate all values before starting the stack.

| Variable | Required | Description |
|----------|----------|-------------|
| `VERIFY_TENANT_URL` | ✅ | IBM Verify SaaS tenant base URL — `https://<tenant-id>.verify.ibm.com` |
| `VERIFY_CLIENT_ID` | ✅ | OIDC application Client ID (from IBM Verify admin console) |
| `VERIFY_CLIENT_SECRET` | ✅ | OIDC application Client Secret — treat like a password, never log it |
| `VERIFY_OIDC_ISSUER` | ✅ | OIDC issuer URL, typically `https://<tenant-id>.verify.ibm.com/oidc/endpoint/default` |
| `FIDO2_RP_ID` | ✅ | WebAuthn Relying Party ID — the ngrok subdomain, no protocol, no trailing slash |
| `FIDO2_RP_ORIGIN` | ✅ | WebAuthn allowed origin — full `https://` ngrok URL |
| `JWT_SECRET` | ✅ | HS256 secret for signing session JWTs — minimum 32 random characters |
| `NGROK_AUTHTOKEN` | ✅ | ngrok authtoken from [dashboard.ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken) |

Generate a strong `JWT_SECRET`:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## Project Structure

```
mockbank/
├── docker-compose.yml          # Orchestrates backend, frontend, ngrok
├── .env.example                # Template — copy to .env
├── .gitignore
├── README.md
├── IBM_VERIFY_SETUP.md         # Step-by-step IBM Verify SaaS provisioning guide
├── passwordless-banking-poc-plan.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI app, CORS config, router registration
│       ├── config.py           # Pydantic settings (reads .env)
│       ├── database.py         # SQLite + SQLAlchemy async engine
│       ├── models.py           # ORM models: User, Account, Transaction
│       ├── schemas.py          # Pydantic request/response schemas
│       ├── seed.py             # Synthetic banking data seeder
│       ├── auth/
│       │   └── jwt_handler.py  # JWT creation and validation
│       ├── services/
│       │   └── verify_client.py # IBM Verify SaaS HTTP client
│       └── routers/
│           ├── banking.py      # Accounts, transactions, transfer endpoints
│           ├── fido2.py        # WebAuthn register + login
│           ├── totp.py         # TOTP enroll + verify
│           ├── push.py         # Push initiate + poll
│           ├── email_otp.py    # Email OTP send + verify
│           └── sso.py          # OIDC login redirect + callback
│
└── frontend/
    ├── Dockerfile
    ├── index.html
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── App.tsx             # Route definitions
        ├── main.tsx            # React entry point
        ├── api/axios.ts        # Axios instance (base URL, JWT header)
        ├── auth/fido2.ts       # WebAuthn navigator.credentials helpers
        ├── context/
        │   └── AuthContext.tsx # Global auth state + JWT storage
        ├── components/
        │   ├── Layout.tsx      # Shell with nav bar
        │   └── RequireAuth.tsx # Route guard
        └── pages/
            ├── LoginPage.tsx
            ├── RegisterPage.tsx
            ├── DashboardPage.tsx
            ├── TransactionsPage.tsx
            ├── TransferPage.tsx
            ├── ProfilePage.tsx
            ├── TOTPEnrollPage.tsx
            ├── TOTPVerifyPage.tsx
            ├── PushLoginPage.tsx
            ├── EmailOTPPage.tsx
            └── OIDCCallbackPage.tsx
```

---

## Security Notes

CORS is locked to `http://localhost:3000` and the configured ngrok origin — wildcard `*` origins
are never used. Session JWTs are stored in `sessionStorage` (cleared on tab close) and are signed
with HS256 using a secret of at least 32 random bytes. One-time passwords (TOTP codes, email OTP,
push transaction IDs) are never written to application logs. The OIDC callback validates both the
`state` parameter (CSRF protection) and the `nonce` claim inside the ID token; the ID token
signature is verified against IBM Verify's JWKS endpoint using RS256. All communication with IBM
Verify SaaS uses HTTPS; there is no plaintext HTTP path for credentials.

---

## IBM Verify SaaS Setup

See **[`IBM_VERIFY_SETUP.md`](IBM_VERIFY_SETUP.md)** for the complete guide to provisioning a
free IBM Verify SaaS trial tenant, registering the OIDC application, enabling FIDO2, and
configuring push notifications.

---

<p align="center" style="font-size:12px; color:#57606a; border-top:1px solid #e5e7eb; padding-top:8px; margin-top:32px;">
  Made with IBM Bob
</p>

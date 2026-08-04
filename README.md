# MockBank — IBM Verify SaaS POC

> A mock retail banking + workforce identity app that demonstrates every major IBM Verify SaaS
> capability — passwordless auth, workforce IAM, step-up MFA, lifecycle management, consent,
> and loan approvals — all running locally with a single `docker compose up`.

---

## What this POC demonstrates

MockBank is a multi-portal application with three distinct user personas and an expanding set of
IBM Verify SaaS integration scenarios:

### Authentication & Passwordless Login
- **FIDO2 / WebAuthn** — register and authenticate with Face ID, Touch ID, or a hardware security key. IBM Verify acts as the Relying Party server; credentials never leave the device.
- **TOTP** — enrol an authenticator app (Google Authenticator, Authy) by scanning a QR code; verify with a 6-digit time-based one-time password.
- **Push Notifications** — IBM Verify mobile app receives a push; the user taps Approve and the browser session is granted automatically via long-poll.
- **Email OTP** — IBM Verify sends a one-time code to the user's registered email address.
- **SSO (OIDC)** — standard OpenID Connect Authorization Code Flow; IBM Verify hosts the login page and issues a signed ID token.

### Workforce IAM
- **Role-based portals** — three separate front-end apps (Customer, HR Admin, Credit Analyst) each accessible only to users with the correct IBM Verify role (`Admin`, `Manager`, `SalesforceManager`).
- **Step-Up MFA** — high-value loan approvals (> ₹5,00,000) require a fresh IBM Verify second-factor challenge before the decision is persisted.
- **User Lifecycle Management (Joiner / Mover / Leaver)** — Admin portal lets admins create, update, enable, disable, and delete users with a full audit trail recorded locally.
- **Group Management** — IBM Verify SCIM Groups are exposed to the Admin UI; admins can create and delete groups and manage membership (used to grant Salesforce entitlement).

### Customer Features
- **Self-registration** — public sign-up flow creates an IBM Verify Cloud Directory account with a secure temporary password and sends a welcome email; the user sets their own password on first login.
- **MFA Enrolment Wizard** — post-login `/enroll` flow lets customers choose and enrol a second factor (TOTP, Push, FIDO2, Email OTP).
- **Consent Management** — consents captured at registration; customers can view and revoke optional consents at any time from their profile.
- **Banking Dashboard** — synthetic accounts, balances, recent transactions, and a fund-transfer form backed by local SQLite.
- **Loan Applications** — customers submit loan applications; Managers/SalesforceManagers review and approve/reject them (with step-up for large amounts).

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                          Docker Compose                               │
│                                                                       │
│  ┌──────────────────────────────────────────────┐  ┌──────────────┐  │
│  │             Frontend (Vite / React)           │  │    ngrok     │  │
│  │  port 3000 — Customer (main app)              │  │   :4040      │  │
│  │  port 3001 — HR Admin Portal (dev only)       │  └──────────────┘  │
│  │  port 3002 — Credit Analyst Portal (dev only) │                    │
│  └──────────────────────────────────────────────┘                    │
│                         │                                             │
│  ┌──────────────────────▼──────────────────────┐                     │
│  │            FastAPI Backend (port 8000)       │                     │
│  └──────────────────────┬──────────────────────┘                     │
└─────────────────────────│─────────────────────────────────────────────┘
                          ▼
              ┌─────────────────────┐
              │   IBM Verify SaaS   │
              │  FIDO2 / WebAuthn   │
              │  TOTP               │
              │  Push Notifications │
              │  Email OTP          │
              │  OIDC (SSO)         │
              │  SCIM Users/Groups  │
              │  User Lifecycle     │
              └─────────────────────┘
```

- **React** (Vite, TypeScript) — three independent SPA builds sharing a common `src/` directory:
  - `main.tsx` / `App.tsx` → Customer portal on port 3000
  - `main-admin.tsx` / `AppAdmin.tsx` → HR Admin Portal on port 3001 (dev) / served as `dist-admin`
  - `main-analyst.tsx` / `AppAnalyst.tsx` → Credit Analyst Portal on port 3002 (dev) / served as `dist-analyst`
- **FastAPI** (Python 3.11, async) — single REST API on port 8000; owns all IBM Verify interactions, JWT issuance, and SQLite persistence.
- **ngrok** — creates an HTTPS tunnel to the FastAPI container. WebAuthn requires a valid HTTPS origin, so ngrok is essential for passkey demos on real devices.
- **IBM Verify SaaS** — cloud identity service; handles credential storage, challenge/response, push delivery, OIDC token issuance, SCIM user/group management.

---

## User Roles & Portals

| Role | Login URL | Landing Page | Description |
|------|-----------|--------------|-------------|
| Customer | `http://localhost:3000` | Banking Dashboard | Regular banking user; self-registration, MFA enrolment, consents, transactions |
| Admin | `http://localhost:3000/admin` or port 3001 | `/admin/users` | HR/CIAM administrator; full user lifecycle, group management, audit log |
| Manager | `http://localhost:3000` or port 3002 | `/loans` | Credit analyst; reviews and approves/rejects loan applications |
| SalesforceManager | `http://localhost:3000` or port 3002 | `/loans` + Salesforce launchpad | Manager with Salesforce entitlement via IBM Verify group |

---

## Authentication & API Routes

| Method | Frontend Page(s) | Backend Route(s) | IBM Verify API |
|--------|-----------------|------------------|----------------|
| FIDO2 / WebAuthn | RegisterPage, LoginPage | `/auth/fido2/register-options`, `/auth/fido2/register`, `/auth/fido2/login-options`, `/auth/fido2/login` | FIDO2 Relying Party |
| TOTP | TOTPEnrollPage, TOTPVerifyPage | `/auth/totp/enroll`, `/auth/totp/verify` | TOTP Verifications |
| Push Notifications | PushLoginPage | `/auth/push/initiate`, `/auth/push/poll` | Push Verifications |
| Email OTP | EmailOTPPage | `/auth/email-otp/send`, `/auth/email-otp/verify` | Email OTP Verifications |
| SSO (OIDC) | OIDCCallbackPage | `/auth/sso/login`, `/auth/sso/callback` | OIDC Authorization Code Flow |
| Step-Up MFA | StepUpPage, StepUpCallbackPage, MfaVerifyPage | `/auth/stepup/begin`, `/auth/stepup/poll/{tx_id}`, `/auth/stepup/complete` | Factor Verifications |
| Self-Registration | SignUpPage, ConsentCapturePage | `/registration` | SCIM Cloud Directory |
| MFA Enrolment | EnrollMethodPage | `/auth/totp/enroll`, `/auth/fido2/register`, `/auth/push/initiate`, `/auth/email-otp/send` | Per-factor APIs |

---

## Additional Backend Routes

| Tag | Routes | Description |
|-----|--------|-------------|
| `users` | `GET/POST /users`, `GET/PUT/DELETE /users/{id}`, `POST /users/{id}/enable`, `POST /users/{id}/disable`, `DELETE /users/{id}/factors/{type}`, `GET/PUT/DELETE /users/me` | User CRUD + lifecycle + self-service |
| `groups` | `GET /groups`, `POST /groups`, `DELETE /groups/{id}`, `POST /groups/{id}/members`, `DELETE /groups/{id}/members/{uid}` | IBM Verify SCIM Group management |
| `consents` | `GET /users/me/consents`, `POST /users/me/consents/{purpose}/revoke`, `POST /users/me/consents/{purpose}/restore` | Customer consent management |
| `loans` | `GET /loans`, `POST /loans`, `POST /loans/{id}/approve`, `POST /loans/{id}/reject` | Loan application workflow |
| `banking` | `GET /accounts`, `GET /accounts/{id}/transactions`, `POST /transfer` | Banking dashboard data |

---

## Prerequisites

- **Docker + Docker Compose** — [install Docker](https://docs.docker.com/get-docker/)
- **ngrok account** (free tier works) — [sign up at ngrok.com](https://ngrok.com) and copy your authtoken from the dashboard
- **IBM Verify SaaS tenant** — see [`IBM_VERIFY_SETUP.md`](IBM_VERIFY_SETUP.md) for the full step-by-step provisioning guide
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

All three services start: `backend` (FastAPI on port 8000), `frontend` (React/Vite on port 3000),
and `ngrok`.

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

### 7. Open the portals

| Portal | URL | Notes |
|--------|-----|-------|
| Customer | http://localhost:3000 | Self-registration or SSO login |
| Admin (HR) | http://localhost:3000/admin | Admin role required |
| Analyst (Credit) | http://localhost:3000 → SSO as Manager | Manager / SalesforceManager role |
| ngrok (FIDO2) | `https://<id>.ngrok-free.app` | Required for passkey demos on real devices |

For local development with separate admin/analyst dev servers:

```bash
cd frontend
npm run dev          # port 3000 — Customer
npm run dev:admin    # port 3001 — HR Admin Portal
npm run dev:analyst  # port 3002 — Credit Analyst Portal
```

---

## Demo Walkthroughs

### Demo 1 — Passkey (Face ID / Touch ID)
```
1. Open the ngrok HTTPS URL on your phone
2. Click "Register a passkey"
3. Enter your IBM Verify User ID, email, name
4. Your phone prompts for Face ID / Touch ID
5. Approve → you're redirected to the banking dashboard
6. Click Logout → click "Login with Face ID / Touch ID"
7. Enter User ID → Face ID fires → you're in. No password.
```

### Demo 2 — TOTP
```
1. Click "Login with Authenticator App" → "Enroll TOTP"
2. Scan the QR code in Google Authenticator / Authy
3. Enter the 6-digit code → you're in
```

### Demo 3 — Push Notification
```
1. Install IBM Verify app on your phone and enrol your account
2. Click "Login with IBM Verify App"
3. Enter User ID → push sent to your phone
4. Tap Approve in the IBM Verify app → browser detects approval → you're in
```

### Demo 4 — Email OTP
```
1. Click "Login with Email OTP"
2. Enter User ID + email → code sent
3. Enter code → you're in
```

### Demo 5 — SSO (OIDC)
```
1. Click "Login with SSO" (or use the Admin / Analyst portal login)
2. Redirected to IBM Verify hosted login page
3. Enter credentials → redirected back → you're in
```

### Demo 6 — Step-Up MFA (Loan Approval)
```
1. Log in as a Manager via SSO
2. Navigate to Loan Approvals (/loans)
3. Approve a loan with amount > ₹5,00,000
4. Step-up MFA is triggered: IBM Verify challenges the enrolled second factor
5. Approve the MFA prompt → loan status is updated to "approved"
```

### Demo 7 — User Lifecycle (Joiner / Mover / Leaver)
```
1. Log in as Admin → navigate to /admin/users
2. Create a new user (Joiner) → IBM Verify account created via SCIM
3. Edit the user's role (Mover) → step-up MFA required for sensitive role changes
4. Disable the user (Leaver — soft delete) → IBM Verify account deactivated
5. Delete the user (Leaver — hard delete) → IBM Verify account permanently removed
6. All actions are recorded in the Audit Log
```

### Demo 8 — Customer Self-Registration & Consent
```
1. Navigate to http://localhost:3000 → click "Create Account"
2. Fill in name + email; accept required consents, opt in/out of optional ones
3. IBM Verify account created; welcome email sent with temporary password
4. Log in via SSO → MFA enrolment wizard → choose a second factor
5. Revisit Profile → Consents section to revoke optional consents
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
| `SMTP_HOST` | ⚠️ optional | SMTP server for welcome emails (self-registration flow) |
| `SMTP_PORT` | ⚠️ optional | SMTP port (default: 587) |
| `SMTP_USER` | ⚠️ optional | SMTP username |
| `SMTP_PASSWORD` | ⚠️ optional | SMTP password |
| `FRONTEND_BASE_URL` | ⚠️ optional | Frontend origin for CORS (default: `http://localhost:3000`) |

Generate a strong `JWT_SECRET`:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## Project Structure

```
mockbank/
├── docker-compose.yml              # Orchestrates backend, frontend, ngrok
├── .env.example                    # Template — copy to .env
├── .gitignore
├── README.md
├── IBM_VERIFY_SETUP.md             # Step-by-step IBM Verify SaaS provisioning guide
├── passwordless-banking-poc-plan.md
├── user-lifecycle-plan.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                 # FastAPI app, CORS config, router registration
│       ├── config.py               # Pydantic settings (reads .env)
│       ├── database.py             # SQLite + SQLAlchemy async engine
│       ├── models.py               # ORM models: User, Account, Transaction,
│       │                           #   AuditLog, UserConsent, LoanApplication
│       ├── schemas.py              # Pydantic request/response schemas
│       ├── seed.py                 # Synthetic banking data + consent seeder
│       ├── auth/
│       │   └── jwt_handler.py      # JWT creation, validation, step-up check
│       ├── services/
│       │   ├── verify_client.py    # IBM Verify SaaS HTTP client (all API calls)
│       │   └── mailer.py           # SMTP welcome email sender
│       └── routers/
│           ├── banking.py          # Accounts, transactions, transfer
│           ├── fido2.py            # WebAuthn register + authenticate
│           ├── totp.py             # TOTP enrol + verify
│           ├── push.py             # Push initiate + poll
│           ├── email_otp.py        # Email OTP send + verify
│           ├── sso.py              # OIDC login redirect + callback
│           ├── stepup.py           # Step-up MFA begin / poll / complete
│           ├── registration.py     # Customer self-registration (public)
│           ├── users.py            # User CRUD, lifecycle, self-service, audit
│           ├── groups.py           # IBM Verify SCIM Group management
│           ├── consents.py         # Customer consent view / revoke / restore
│           ├── loans.py            # Loan application workflow
│           └── debug.py            # Debug / health utilities
│
└── frontend/
    ├── Dockerfile
    ├── index.html                  # Customer app entry point
    ├── index-admin.html            # HR Admin app entry point
    ├── index-analyst.html          # Credit Analyst app entry point
    ├── vite.config.ts              # Customer (port 3000 / Docker)
    ├── vite.config.admin.ts        # HR Admin Portal (port 3001, dev only)
    ├── vite.config.analyst.ts      # Credit Analyst Portal (port 3002, dev only)
    ├── tsconfig.json
    └── src/
        ├── App.tsx                 # Customer app routes
        ├── AppAdmin.tsx            # HR Admin app routes
        ├── AppAnalyst.tsx          # Credit Analyst app routes
        ├── main.tsx                # Customer entry point
        ├── main-admin.tsx          # HR Admin entry point
        ├── main-analyst.tsx        # Credit Analyst entry point
        ├── api/axios.ts            # Axios instance (base URL, JWT header)
        ├── auth/fido2.ts           # WebAuthn navigator.credentials helpers
        ├── hooks/
        │   └── useSessionHeartbeat.ts  # IBM Verify /userinfo heartbeat
        ├── context/
        │   └── AuthContext.tsx     # Global auth state + JWT storage
        ├── components/
        │   ├── Layout.tsx          # Shell with role-aware nav bar
        │   └── RequireAuth.tsx     # Route guard
        ├── styles/
        │   └── theme.ts            # Shared design tokens
        └── pages/
            ├── LoginPage.tsx               # Customer login (all auth methods)
            ├── AdminLoginPage.tsx          # Admin SSO login
            ├── AnalystLoginPage.tsx        # Analyst SSO login
            ├── SignUpPage.tsx              # Customer self-registration
            ├── ConsentCapturePage.tsx      # Consent collection at registration
            ├── RegisterPage.tsx            # FIDO2 / passkey registration
            ├── OIDCCallbackPage.tsx        # OIDC callback handler
            ├── TOTPEnrollPage.tsx          # TOTP QR enrolment
            ├── TOTPVerifyPage.tsx          # TOTP verification
            ├── PushLoginPage.tsx           # Push notification login
            ├── EmailOTPPage.tsx            # Email OTP login
            ├── StepUpPage.tsx              # Step-up MFA initiation
            ├── StepUpCallbackPage.tsx      # Step-up OIDC callback
            ├── MfaVerifyPage.tsx           # Unified MFA verification picker
            ├── EnrollMethodPage.tsx        # Post-login MFA enrolment wizard
            ├── DashboardPage.tsx           # Customer banking dashboard
            ├── TransactionsPage.tsx        # Transaction list
            ├── AllTransactionsPage.tsx     # All-accounts transaction view
            ├── TransferPage.tsx            # Fund transfer form
            ├── CardsPage.tsx               # Cards overview
            ├── ProfilePage.tsx             # User profile + consents
            ├── SettingsPage.tsx            # User settings
            ├── NotificationsPage.tsx       # Notification centre
            ├── AdminUsersPage.tsx          # CIAM user management (Admin only)
            ├── AdminSecurityPage.tsx       # Security centre (Admin theme)
            ├── AdminSettingsPage.tsx       # Settings (Admin theme)
            ├── SecurityCenterPage.tsx      # Security centre (light theme)
            ├── AccessDashboardPage.tsx     # Salesforce launchpad
            ├── LoanApprovalPage.tsx        # Loan review + step-up approval
            └── CIAMLifecyclePage.tsx       # CIAM lifecycle diagram / demo
```

---

## Security Notes

- CORS is locked to `http://localhost:3000` and the configured ngrok origin — wildcard `*` origins are never used.
- Session JWTs are stored in `sessionStorage` (cleared on tab close) and signed with HS256 using a secret of at least 32 random bytes.
- A session-validity heartbeat (`useSessionHeartbeat`) calls IBM Verify's `/userinfo` endpoint periodically; if the IBM Verify token is revoked or the session is invalidated server-side, the browser is automatically logged out.
- One-time passwords (TOTP codes, email OTP, push transaction IDs) are never written to application logs.
- The OIDC callback validates both the `state` parameter (CSRF protection) and the `nonce` claim inside the ID token; the ID token signature is verified against IBM Verify's JWKS endpoint using RS256.
- Step-up MFA results are embedded inside the session JWT (`stepup_verified`, `stepup_at`); the backend validates both presence and freshness (5-minute window) before allowing high-value operations.
- All communication with IBM Verify SaaS uses HTTPS; there is no plaintext HTTP path for credentials.
- Role-based access is enforced on every protected route in both the frontend (route guards) and the backend (`_require_admin`, `_require_manager` helpers).

---

## IBM Verify SaaS Setup

See **[`IBM_VERIFY_SETUP.md`](IBM_VERIFY_SETUP.md)** for the complete guide to provisioning a
free IBM Verify SaaS trial tenant, registering the OIDC application, enabling FIDO2, and
configuring push notifications.

---

<p align="center" style="font-size:12px; color:#57606a; border-top:1px solid #e5e7eb; padding-top:8px; margin-top:32px;">
  Made with IBM Bob
</p>

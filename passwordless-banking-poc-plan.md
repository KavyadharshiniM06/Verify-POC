# Passwordless Banking POC — Plan

## Top-Level Overview

Build a fully functional mock banking web application that demonstrates IBM Verify SaaS as the identity
and authentication backbone. The app has **no password fields anywhere** — users authenticate via
FIDO2/WebAuthn passkeys (Face ID / Touch ID / fingerprint), TOTP, Push Notifications, Email OTP,
and SSO (OIDC). IBM Verify SaaS handles all user lifecycle management, credential storage, and
policy enforcement.

**Stack:**
- Frontend: React (Vite) — Port 3000
- Backend: Python FastAPI — Port 8000
- Database: SQLite (synthetic banking data, seeded per user)
- Infrastructure: Docker Compose + ngrok (HTTPS tunnel required for WebAuthn)
- Identity Provider: IBM Verify SaaS

**Auth methods in scope:**
1. FIDO2/WebAuthn — passkeys (Face ID, Touch ID, fingerprint)
2. TOTP — time-based one-time password via authenticator app
3. Push Notifications — IBM Verify mobile app approval
4. Email OTP — one-time code to registered email
5. SSO — OIDC / OpenID Connect federated login

**Banking dashboard scope:**
- Multiple synthetic accounts per user (checking, savings, credit)
- Transaction history with categories
- Charts and graphs (balance trends, spending by category)
- Transfers page (mock fund movement between accounts)

---

## Sub-Tasks

---

### Sub-Task 1 — IBM Verify SaaS Tenant Setup & Application Registration

**Intent:**
Provision and configure the IBM Verify SaaS tenant so that all downstream auth integrations have a
working identity provider to connect to. This sub-task has no code — it is entirely IBM Verify
SaaS admin console configuration. The outputs (client IDs, secrets, tenant URL) become the
environment variables consumed by the backend.

**Expected Outcomes:**
- A working IBM Verify SaaS tenant with an admin login
- An OIDC application registered (Client ID + Client Secret captured)
- FIDO2/WebAuthn policy enabled with the correct Relying Party ID (RP ID) set to the ngrok domain
- TOTP authenticator policy enabled
- Push notification policy enabled (requires IBM Verify mobile app)
- Email OTP policy enabled
- A `.env.example` file listing all required environment variables

**Todo List:**
1. Sign up for IBM Verify SaaS trial at https://www.ibm.com/verify — obtain tenant URL (e.g. `https://<tenant>.verify.ibm.com`)
2. In the admin console → Applications → Add Application → Custom Application (OIDC)
   - Set redirect URI to `http://localhost:3000/callback` and `https://<ngrok-domain>/callback`
   - Grant types: `authorization_code`, `refresh_token`
   - Capture `Client ID` and `Client Secret`
3. Enable FIDO2/WebAuthn: Security → Authentication → FIDO2 → Enable, set RP ID to ngrok public domain
4. Enable TOTP: Security → Authentication → TOTP → Enable, set issuer name to "MockBank"
5. Enable Push Notifications: Security → Authentication → IBM Verify App → Enable
6. Enable Email OTP: Security → Authentication → Email OTP → Enable
7. Create a test user in IBM Verify SaaS directory (Directory → Users → Add User)
8. Create `.env.example` in project root with keys:
   - `VERIFY_TENANT_URL`
   - `VERIFY_CLIENT_ID`
   - `VERIFY_CLIENT_SECRET`
   - `VERIFY_OIDC_ISSUER`
   - `FIDO2_RP_ID`
   - `FIDO2_RP_ORIGIN`
   - `JWT_SECRET`
   - `NGROK_AUTHTOKEN`

**Relevant Context:**
- IBM Verify SaaS docs: https://docs.verify.ibm.com
- FIDO2 RP ID must exactly match the origin domain (ngrok public domain) — this is a WebAuthn hard requirement
- The OIDC discovery endpoint will be at `https://<tenant>.verify.ibm.com/oidc/endpoint/default/.well-known/openid-configuration`

**Status:** [x] done

---

### Sub-Task 2 — Project Scaffolding & Docker Compose Infrastructure

**Intent:**
Create the full monorepo directory structure, Docker Compose configuration, and ngrok tunnel setup.
WebAuthn requires HTTPS — ngrok provides the public HTTPS domain that the browser and IBM Verify
both trust. This sub-task establishes the skeleton that all other sub-tasks build into.

**Expected Outcomes:**
- `docker-compose.yml` with three services: `frontend`, `backend`, `ngrok`
- `frontend/` — Vite React app scaffolded (no auth logic yet)
- `backend/` — FastAPI app scaffolded with health check endpoint
- `.gitignore` covering `.env`, `__pycache__`, `node_modules`, `*.db`
- `docker compose up` brings all services up with hot-reload
- ngrok tunnel URL is visible in ngrok container logs

**Todo List:**
1. Create monorepo structure:
   ```
   /
   ├── frontend/          (Vite + React)
   ├── backend/           (FastAPI)
   ├── docker-compose.yml
   ├── .env.example
   ├── .gitignore
   └── README.md
   ```
2. Scaffold `frontend/` using Vite with React + TypeScript template
   - Install deps: `react-router-dom`, `axios`, `recharts`, `@simplewebauthn/browser`
   - `frontend/Dockerfile` using `registry.redhat.io/ubi9/nodejs-20-minimal:latest`
3. Scaffold `backend/` as a FastAPI app
   - `backend/requirements.txt`: `fastapi`, `uvicorn[standard]`, `python-jose[cryptography]`,
     `httpx`, `python-dotenv`, `sqlalchemy`, `aiosqlite`, `pydantic`, `websockets`
   - `backend/Dockerfile` using `registry.redhat.io/ubi9/python-311-minimal:latest`, non-root user
   - `backend/app/main.py` with a `GET /health` endpoint
4. Write `docker-compose.yml`:
   - `frontend` service: builds `./frontend`, port `3000:3000`, hot-reload volume
   - `backend` service: builds `./backend`, port `8000:8000`, hot-reload via uvicorn `--reload`
   - `ngrok` service: uses `ngrok/ngrok:latest` image, tunnels to `backend:8000`, reads `NGROK_AUTHTOKEN` from env
   - All services read from `.env` file
5. Write `.gitignore` (must include `.env`, `*.db`, `__pycache__`, `node_modules`, `.env.local`)
6. Verify `docker compose up` succeeds and `GET http://localhost:8000/health` returns `{"status":"ok"}`

**Relevant Context:**
- Dockerfiles must use non-root USER per security policy
- Do NOT bind backend to `0.0.0.0` in production; for local Docker Compose, bind to `0.0.0.0` only inside the container network — document this explicitly
- ngrok service image: `ngrok/ngrok:latest` with env var `NGROK_AUTHTOKEN`

**Status:** [x] done

---

### Sub-Task 3 — Synthetic Banking Data Layer

**Intent:**
Create the SQLite database schema and seed script that generates realistic synthetic banking data
per user. Each user gets checking, savings, and credit accounts with transaction history, categories,
and balances. This data is served by FastAPI endpoints and consumed by the React dashboard.

**Expected Outcomes:**
- `backend/app/database.py` — SQLAlchemy async engine + session factory
- `backend/app/models.py` — ORM models: `User`, `Account`, `Transaction`
- `backend/app/seed.py` — seed script that generates synthetic data for a given `user_id`
- `GET /banking/accounts` returns accounts with balances for the authenticated user
- `GET /banking/transactions` returns paginated transaction history with category
- `GET /banking/summary` returns balance trend data and spending-by-category aggregates
- `POST /banking/transfer` records a mock transfer between two of the user's accounts

**Todo List:**
1. Define SQLAlchemy models in `backend/app/models.py`:
   - `User`: `id`, `verify_user_id` (IBM Verify external ID), `email`, `name`, `created_at`
   - `Account`: `id`, `user_id` (FK), `type` (checking/savings/credit), `account_number`, `balance`, `currency`
   - `Transaction`: `id`, `account_id` (FK), `amount`, `description`, `category`, `merchant`, `date`, `type` (debit/credit)
2. Write `backend/app/database.py` with async SQLAlchemy engine pointing to `./mockbank.db`
3. Write `backend/app/seed.py`:
   - Generate 3 accounts per user (checking ~$4,200 balance, savings ~$18,500, credit -$1,200)
   - Generate 60 transactions spread over the last 90 days using Faker-style synthetic data
   - Categories: Food & Dining, Shopping, Transport, Entertainment, Bills & Utilities, Health, Income
4. Write `backend/app/routers/banking.py` with the four endpoints listed above
   - All endpoints require a valid JWT session (dependency injection)
   - Transfer endpoint validates sender owns both accounts before writing
5. Write `backend/app/schemas.py` — Pydantic response models for Account, Transaction, Summary
6. Register the banking router in `main.py` under `/banking` prefix
7. Test with curl that `GET /banking/accounts` returns correctly shaped JSON

**Relevant Context:**
- Use `aiosqlite` driver for async SQLite
- `verify_user_id` is the `sub` claim from IBM Verify's JWT — this is how we link Verify identity to local banking records
- Seed is called once on first login if no accounts exist for that user_id
- Use parameterized queries only — no string interpolation in SQL (security requirement)

**Status:** [x] done

---

### Sub-Task 4 — FIDO2/WebAuthn Authentication (Core Passwordless Flow)

**Intent:**
Implement the core "demo moment" — FIDO2/WebAuthn passkey registration and login. The backend
orchestrates challenge exchange with IBM Verify SaaS, and the React frontend uses the browser's
WebAuthn API to trigger Face ID / Touch ID. This is the centerpiece of the POC.

**Expected Outcomes:**
- `POST /auth/fido2/register/begin` — returns `PublicKeyCredentialCreationOptions` from IBM Verify
- `POST /auth/fido2/register/complete` — forwards attestation to IBM Verify, stores passkey
- `POST /auth/fido2/login/begin` — returns `PublicKeyCredentialRequestOptions` from IBM Verify
- `POST /auth/fido2/login/complete` — verifies assertion with IBM Verify, returns JWT session
- React `<RegisterPasskey />` component: calls begin → invokes browser WebAuthn API → calls complete
- React `<LoginPasskey />` component: calls begin → Face ID fires → calls complete → redirects to dashboard
- End-to-end demo works on a mobile browser (Safari iOS or Chrome Android) via ngrok HTTPS URL

**Todo List:**
1. Create `backend/app/routers/fido2.py`:
   - `begin_registration`: call IBM Verify FIDO2 registration initiation API → return challenge options to client
   - `complete_registration`: forward browser attestation object to IBM Verify verification API
   - `begin_authentication`: call IBM Verify FIDO2 assertion challenge API
   - `complete_authentication`: forward assertion to IBM Verify → on success, issue a signed JWT
2. Create `backend/app/services/verify_client.py`:
   - Async HTTP client (httpx) wrapping IBM Verify REST APIs
   - Methods: `fido2_register_begin()`, `fido2_register_complete()`, `fido2_login_begin()`, `fido2_login_complete()`
   - Obtain IBM Verify API access token using `client_credentials` grant before each call
   - Never log the access token or user credentials
3. Create `backend/app/auth/jwt_handler.py`:
   - `create_session_token(user_id, verify_sub)` → signed JWT (HS256, `JWT_SECRET` from env)
   - `decode_session_token(token)` → raises 401 if invalid/expired
   - Token expiry: 1 hour
4. React: install `@simplewebauthn/browser`
   - `src/auth/fido2.ts`: wrappers around `startRegistration()` and `startAuthentication()` from the library
   - `src/pages/RegisterPage.tsx`: UI with "Register with Face ID / Touch ID" button
   - `src/pages/LoginPage.tsx`: UI with single "Login" button — no password field anywhere
5. Wire up JWT as `Authorization: Bearer <token>` header in all subsequent React API calls (axios interceptor)
6. After successful login, call seed endpoint to initialize banking data for first-time users
7. Test end-to-end on mobile via the ngrok HTTPS URL

**Relevant Context:**
- IBM Verify FIDO2 API reference: https://docs.verify.ibm.com/verify/reference/fido2
- `@simplewebauthn/browser` handles all ArrayBuffer encoding/decoding complexity
- RP ID must exactly match the ngrok public domain set in Sub-Task 1 — mismatch causes immediate WebAuthn failure
- The `FIDO2_RP_ORIGIN` env var must be the full origin: `https://<ngrok-domain>`

**Status:** [x] done

---

### Sub-Task 5 — TOTP Authentication (Authenticator App)

**Intent:**
Add TOTP as a second authentication factor. Users enroll a TOTP authenticator (Google Authenticator,
Authy, IBM Verify app) and are prompted for a 6-digit code on login. IBM Verify SaaS manages
the TOTP secret and validates codes.

**Expected Outcomes:**
- `POST /auth/totp/enroll` — calls IBM Verify to generate TOTP QR code URI, returns to frontend
- `POST /auth/totp/verify` — accepts 6-digit code, calls IBM Verify to validate, returns JWT on success
- React `<TOTPEnrollment />` — shows QR code (using `qrcode.react`) for user to scan in authenticator app
- React `<TOTPVerify />` — 6-digit input screen shown as a step-up after password-less login or SSO
- TOTP appears as an option on the login page alongside passkey

**Todo List:**
1. Add to `backend/app/routers/totp.py`:
   - `POST /auth/totp/enroll`: call IBM Verify TOTP enrollment API → return `otpauth://` URI + QR data
   - `POST /auth/totp/verify`: POST 6-digit code to IBM Verify TOTP validation API → issue JWT on success
2. Add `totp_enroll()` and `totp_verify()` methods to `verify_client.py`
3. React:
   - Install `qrcode.react`
   - `src/pages/TOTPEnrollPage.tsx`: fetch enroll endpoint, render QR code, prompt user to confirm with first code
   - `src/pages/TOTPVerifyPage.tsx`: 6-digit OTP input, submit to `/auth/totp/verify`
4. Add TOTP option to `LoginPage.tsx` ("Login with Authenticator App" button)
5. Test full TOTP enroll + verify flow end-to-end

**Relevant Context:**
- IBM Verify TOTP API: https://docs.verify.ibm.com/verify/reference/totp
- TOTP enrollment produces a `secret` that IBM Verify stores — frontend only sees the `otpauth://` URI for QR display
- TOTP verify should be treated as a step-up auth that upgrades the session, not a standalone login

**Status:** [ ] pending

---

### Sub-Task 6 — Push Notification Authentication (IBM Verify Mobile App)

**Intent:**
Implement push notification-based login using the IBM Verify mobile app. User taps "Login with
Push" on the web app, IBM Verify sends a push to their enrolled mobile device, the user approves,
and the web session completes. This requires long-polling or WebSocket to detect approval.

**Expected Outcomes:**
- `POST /auth/push/initiate` — triggers IBM Verify push to the user's enrolled device
- `GET /auth/push/poll/{transaction_id}` — polls IBM Verify for approval status (approved/pending/denied)
- React `<PushLogin />` — shows "Waiting for approval on your phone..." with a spinner, polls backend every 2 seconds
- On approval: session JWT issued and user redirected to dashboard
- On denial or timeout: error shown, user returned to login page

**Todo List:**
1. Add to `backend/app/routers/push.py`:
   - `POST /auth/push/initiate`: call IBM Verify push initiation API → return `transaction_id`
   - `GET /auth/push/poll/{transaction_id}`: call IBM Verify transaction status API → return `{status: pending|approved|denied}`
2. Add `push_initiate()` and `push_poll()` methods to `verify_client.py`
3. React:
   - `src/pages/PushLoginPage.tsx`: shows waiting UI, polls `/auth/push/poll/{id}` every 2 seconds
   - On `approved` response: call `/auth/push/complete` to exchange for JWT → redirect to dashboard
   - On `denied` or after 60-second timeout: show error and back button
4. Add push option to `LoginPage.tsx` ("Login with IBM Verify App" button)
5. Test with IBM Verify mobile app installed and device enrolled

**Relevant Context:**
- IBM Verify Push API: https://docs.verify.ibm.com/verify/reference/push-notifications
- Push requires the user to have the IBM Verify mobile app installed and their account enrolled
- Use 2-second polling intervals with a 60-second max timeout — do not use infinite polling
- Do not expose IBM Verify transaction IDs to the frontend beyond what is needed for polling

**Status:** [ ] pending

---

### Sub-Task 7 — Email OTP Authentication

**Intent:**
Add email OTP as a fallback authentication method. The user enters their email, IBM Verify sends
a one-time code, and the user enters it to log in. Simple and universally accessible.

**Expected Outcomes:**
- `POST /auth/email-otp/send` — triggers IBM Verify to send OTP email to the given address
- `POST /auth/email-otp/verify` — validates the OTP code via IBM Verify, returns JWT on success
- React `<EmailOTPPage />` — two-step: enter email → enter code → dashboard
- Email OTP option visible on login page

**Todo List:**
1. Add to `backend/app/routers/email_otp.py`:
   - `POST /auth/email-otp/send`: accept `email`, call IBM Verify email OTP API → return `transaction_id`
   - `POST /auth/email-otp/verify`: accept `transaction_id` + `otp_code`, call IBM Verify verify API → issue JWT
2. Add `email_otp_send()` and `email_otp_verify()` methods to `verify_client.py`
3. React:
   - `src/pages/EmailOTPPage.tsx`: step 1 — email input; step 2 — OTP code input
   - On success: redirect to dashboard
4. Add Email OTP option to `LoginPage.tsx`
5. Test full send + verify flow

**Relevant Context:**
- IBM Verify Email OTP API: https://docs.verify.ibm.com/verify/reference/email-otp
- The `transaction_id` from the send step must be passed back to the verify step — store in React component state, not in localStorage
- Do not log the OTP code anywhere server-side

**Status:** [ ] pending

---

### Sub-Task 8 — SSO via OIDC (Federated Login)

**Intent:**
Implement federated SSO login using IBM Verify as the OIDC provider. Clicking "Login with SSO"
redirects the user to IBM Verify's hosted login page, which handles authentication, then redirects
back to the React app with an authorization code that the backend exchanges for an ID token and
issues a local JWT session.

**Expected Outcomes:**
- `GET /auth/sso/login` — returns the IBM Verify OIDC authorization URL (with state + nonce)
- `GET /auth/sso/callback` — receives authorization code, exchanges it for tokens with IBM Verify, issues JWT
- React handles the `/callback` route: extracts code from URL → calls backend callback endpoint → redirects to dashboard
- SSO button visible on login page
- User attributes from IBM Verify ID token (name, email) are synced to local `User` table on first SSO login

**Todo List:**
1. Add to `backend/app/routers/sso.py`:
   - `GET /auth/sso/login`: generate `state` and `nonce` (store in signed cookie or server-side cache), return OIDC auth URL
   - `GET /auth/sso/callback`: validate `state`, POST auth code to IBM Verify token endpoint, validate ID token (verify signature using JWKS), extract user claims, create/update User record, issue JWT
2. Add `oidc_token_exchange()` and `get_jwks()` methods to `verify_client.py`
3. ID token validation must verify: signature (using IBM Verify JWKS), `iss`, `aud`, `exp`, `nonce`
4. React:
   - Add `/callback` route in `App.tsx` handled by `src/pages/OIDCCallbackPage.tsx`
   - `OIDCCallbackPage` extracts `?code=` and `?state=` from URL, POSTs to `/auth/sso/callback`, stores JWT, redirects to `/dashboard`
5. Add "Login with SSO" button to `LoginPage.tsx`
6. Test full SSO redirect → IBM Verify hosted login → callback → dashboard flow

**Relevant Context:**
- OIDC discovery endpoint: `https://<tenant>.verify.ibm.com/oidc/endpoint/default/.well-known/openid-configuration`
- Use `python-jose` for ID token signature validation
- `state` parameter MUST be validated to prevent CSRF — generate cryptographically random value with `secrets.token_urlsafe()`
- Never skip ID token signature validation even in a POC

**Status:** [ ] pending

---

### Sub-Task 9 — Banking Dashboard UI

**Intent:**
Build the full React banking dashboard UI that users see after login. This is the visual centrepiece
of the POC — it must look like a real banking app and clearly demonstrate that the user is
authenticated without having ever typed a password.

**Expected Outcomes:**
- `Dashboard` page with: account cards (checking, savings, credit), recent transactions table, balance trend line chart, spending-by-category doughnut chart
- `Transactions` page: full paginated transaction history with category filter
- `Transfers` page: select source/destination account + amount → triggers mock transfer
- `Profile` page: shows user name, email, enrolled authenticators (passkey, TOTP, push)
- Responsive layout (works on mobile for the demo)
- Navigation sidebar or tab bar
- Logged-in user's name displayed in header
- Logout button that clears JWT

**Todo List:**
1. Install UI dependencies: `recharts` (charts), `react-router-dom` (routing), `axios` (API calls)
2. Create layout: `src/components/Layout.tsx` with sidebar nav + header showing user name
3. Create `src/pages/DashboardPage.tsx`:
   - Fetch `/banking/accounts` and `/banking/summary`
   - Render 3 account cards with balance + account type icon
   - Render `<BalanceTrendChart />` (Recharts LineChart) from summary data
   - Render `<SpendingCategoryChart />` (Recharts PieChart) from summary data
   - Render recent 5 transactions list
4. Create `src/pages/TransactionsPage.tsx`:
   - Fetch `/banking/transactions?page=1&limit=20&account_id=<id>`
   - Render paginated table with columns: date, merchant, category, amount, type
   - Category filter dropdown
5. Create `src/pages/TransferPage.tsx`:
   - From/To account selector + amount input
   - Submit calls `POST /banking/transfer`
   - Show success confirmation
6. Create `src/pages/ProfilePage.tsx`:
   - Display user info from JWT claims
   - List enrolled auth methods (query IBM Verify user enrollments via backend endpoint)
   - Links to enroll TOTP or passkey from profile
7. Protect all dashboard routes with a `<RequireAuth />` wrapper that checks for valid JWT
8. Implement logout: clear JWT from memory + call `DELETE /auth/session`

**Relevant Context:**
- Store JWT in memory (React context / Zustand), not localStorage — XSS mitigation
- Use axios interceptor to attach `Authorization: Bearer <token>` to all API calls
- The dashboard URL should be `/dashboard` — after any successful auth method, redirect here
- For mobile demo: ensure the layout is responsive with CSS flexbox/grid

**Status:** [x] done

---

### Sub-Task 10 — Integration Testing & Demo Polish

**Intent:**
Wire all auth methods together, write a demo script, add a README, and polish the UX so the POC
is ready to present. Validate end-to-end that all six auth flows reach the banking dashboard.

**Expected Outcomes:**
- `README.md` with: architecture diagram, setup instructions (IBM Verify config + env vars), `docker compose up` steps, demo walkthrough script
- All six auth flows tested and working end-to-end
- Login page clearly labels all auth options with icons
- Error states handled gracefully (e.g. push denied, TOTP wrong code, passkey not enrolled)
- `docker compose up` from a clean clone → everything starts → demo is ready

**Todo List:**
1. Write `README.md`:
   - Architecture overview (text description of the diagram)
   - IBM Verify SaaS setup steps (referencing Sub-Task 1)
   - Environment variable reference table
   - `docker compose up` quick-start
   - Demo script: step-by-step walkthrough of each auth method
2. Polish `LoginPage.tsx`:
   - Grouped auth buttons with icons: Face ID icon, Authenticator icon, Push icon, Email icon, SSO icon
   - Tagline: "MockBank — No passwords. Ever."
3. Add a global error boundary in React for graceful API error display
4. Add a loading spinner component used across all auth pages
5. Verify CORS config in FastAPI: allow only `http://localhost:3000` and the ngrok origin
6. Run through each auth flow on both desktop and mobile, fix any issues found
7. Confirm `.gitignore` covers all secrets and generated files

**Relevant Context:**
- CORS must be locked to specific origins — not `*` — per security policy
- The demo moment to highlight: open on phone → tap Login → Face ID fires → banking dashboard appears — no password typed

**Status:** [x] done

---

## Architecture Reference

```
/
├── frontend/
│   ├── src/
│   │   ├── auth/              # fido2.ts, oidc.ts
│   │   ├── pages/             # LoginPage, Dashboard, Transactions, Transfers, Profile, TOTP*, Push*, EmailOTP*, OIDCCallback
│   │   ├── components/        # Layout, AccountCard, TransactionTable, Charts, RequireAuth
│   │   ├── context/           # AuthContext (JWT in memory)
│   │   └── api/               # axios instance with interceptors
│   ├── Dockerfile
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, router registration
│   │   ├── database.py        # SQLAlchemy async engine
│   │   ├── models.py          # User, Account, Transaction ORM models
│   │   ├── schemas.py         # Pydantic response models
│   │   ├── seed.py            # Synthetic data generator
│   │   ├── auth/
│   │   │   └── jwt_handler.py # JWT create/decode
│   │   ├── services/
│   │   │   └── verify_client.py  # IBM Verify SaaS HTTP client
│   │   └── routers/
│   │       ├── fido2.py
│   │       ├── totp.py
│   │       ├── push.py
│   │       ├── email_otp.py
│   │       ├── sso.py
│   │       └── banking.py
│   ├── Dockerfile
│   └── requirements.txt
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Environment Variables Reference

| Variable | Description |
|---|---|
| `VERIFY_TENANT_URL` | IBM Verify SaaS tenant base URL |
| `VERIFY_CLIENT_ID` | OIDC application client ID |
| `VERIFY_CLIENT_SECRET` | OIDC application client secret |
| `VERIFY_OIDC_ISSUER` | OIDC issuer URL (from discovery endpoint) |
| `FIDO2_RP_ID` | WebAuthn Relying Party ID (ngrok domain, no protocol) |
| `FIDO2_RP_ORIGIN` | WebAuthn origin (full https:// ngrok URL) |
| `JWT_SECRET` | Secret key for signing session JWTs (min 32 chars) |
| `NGROK_AUTHTOKEN` | ngrok authentication token |

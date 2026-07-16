# IBM Verify SaaS — Setup Guide for MockBank POC

This guide walks you through provisioning an IBM Verify SaaS tenant and configuring every
authentication policy required by the MockBank passwordless POC.

---

## Table of Contents

1. [Sign Up / Access IBM Verify SaaS](#1-sign-up--access-ibm-verify-saas)
2. [Create an OIDC Application](#2-create-an-oidc-application)
3. [Enable FIDO2 / WebAuthn Policy](#3-enable-fido2--webauthn-policy)
4. [Enable TOTP Policy](#4-enable-totp-policy)
5. [Enable Push Notifications](#5-enable-push-notifications)
6. [Enable Email OTP Policy](#6-enable-email-otp-policy)
7. [Create a Test User](#7-create-a-test-user)
8. [OIDC Discovery Endpoint](#8-oidc-discovery-endpoint)
9. [Environment Variable Checklist](#9-environment-variable-checklist)

---

## 1. Sign Up / Access IBM Verify SaaS

### Option A — Free Trial

1. Navigate to <https://www.ibm.com/verify>.
2. Click **Try IBM Verify** (or **Start free trial**).
3. Sign in with or create an IBMid account.
4. Follow the guided onboarding — IBM provisions a dedicated tenant in a few minutes.
5. Once provisioned, you receive an email with your **Tenant URL** in the form:
   ```
   https://<your-tenant-id>.verify.ibm.com
   ```
6. Bookmark the **Admin Console**:
   ```
   https://<your-tenant-id>.verify.ibm.com/ui/admin
   ```

### Option B — Existing IBM Verify SaaS tenant

Log in at `https://<your-tenant-id>.verify.ibm.com/ui/admin` using your admin credentials.

### Capturing the Tenant URL

Your tenant URL is everything up to (and including) `.verify.ibm.com` — no trailing slash.

```
VERIFY_TENANT_URL=https://yourtenantid.verify.ibm.com
```

---

## 2. Create an OIDC Application

The OIDC application represents the MockBank web app inside IBM Verify. It issues the
authorization code that the backend exchanges for an ID token on SSO login.

### Steps

1. In the Admin Console, go to **Applications** → **Applications**.
2. Click **Add application**.
3. Select **Custom Application** and click **Next**.
4. On the **General** tab:
   - **Application name:** `MockBank POC`
   - **Company:** _(your org name)_
5. Switch to the **Sign-on** tab:
   - **Sign-on method:** OpenID Connect 1.0
   - **Application URL:** `https://<ngrok-domain>` _(your ngrok HTTPS URL — see Section 3 for how to get it)_
6. Under **Grant types**, enable:
   - `Authorization code`
   - `Refresh token`
   - `Client credentials` _(needed for backend service-to-service IBM Verify API calls)_
7. Under **Redirect URIs**, add both:
   ```
   http://localhost:3000/callback
   https://<ngrok-domain>/callback
   ```
   Replace `<ngrok-domain>` with your actual ngrok hostname (e.g. `abcd1234.ngrok-free.app`).
8. Click **Save**.

### Capturing Client ID and Client Secret

After saving, IBM Verify displays the **Client ID** on the General tab.

To view the **Client Secret**:
1. Open the application → **Sign-on** tab.
2. Scroll to **Client secret** → click **Show** (one-time display — copy it immediately).

```
VERIFY_CLIENT_ID=<paste Client ID here>
VERIFY_CLIENT_SECRET=<paste Client Secret here>
```

> **Security note:** The client secret is equivalent to a password. Store it only in your `.env`
> file, which must never be committed to version control.

---

## 3. Enable FIDO2 / WebAuthn Policy

FIDO2 enables passkey authentication (Face ID, Touch ID, fingerprint). The **Relying Party ID**
must exactly match the domain the browser calls WebAuthn from — this is your ngrok domain.

### Before you begin — get your ngrok domain

Start ngrok (or run `docker compose up` from Sub-Task 2) and note the public hostname printed
in the ngrok logs, e.g.:

```
Forwarding  https://abcd1234.ngrok-free.app -> http://backend:8000
```

The **RP ID** is `abcd1234.ngrok-free.app` (no `https://`, no path).
The **RP Origin** is `https://abcd1234.ngrok-free.app` (full URL, no trailing slash).

### Steps

1. Admin Console → **Security** → **Authentication** → **FIDO2**.
2. Click the **Settings** (gear) icon or **Edit**.
3. Set the following:
   | Field | Value |
   |---|---|
   | **Status** | Enabled |
   | **Relying Party ID** | `abcd1234.ngrok-free.app` _(your ngrok domain, no protocol)_ |
   | **Relying Party Name** | `MockBank` |
4. Under **Allowed Origins**, click **Add** and enter:
   ```
   https://abcd1234.ngrok-free.app
   ```
5. Click **Save**.

> **Critical:** The RP ID is a WebAuthn hard requirement. A mismatch between the RP ID configured
> here and the actual origin the browser uses will cause all passkey registrations and logins to
> fail immediately with `SecurityError`.

```
FIDO2_RP_ID=abcd1234.ngrok-free.app
FIDO2_RP_ORIGIN=https://abcd1234.ngrok-free.app
```

---

## 4. Enable TOTP Policy

TOTP (Time-Based One-Time Password) lets users authenticate with Google Authenticator, Authy,
or the IBM Verify mobile app.

### Steps

1. Admin Console → **Security** → **Authentication** → **TOTP**.
2. Click **Edit**.
3. Set the following:
   | Field | Value |
   |---|---|
   | **Status** | Enabled |
   | **Issuer name** | `MockBank` |
   | **Algorithm** | `SHA-1` (default, compatible with all authenticator apps) |
   | **Time step** | `30` seconds (default) |
   | **Code length** | `6` digits (default) |
4. Click **Save**.

> The **Issuer name** is what appears in the authenticator app next to the 6-digit code.
> Using `MockBank` makes the demo entry recognisable.

---

## 5. Enable Push Notifications

Push notification login uses the **IBM Verify mobile app**. When a user triggers push login
on the web, their enrolled phone receives a push notification; approving it completes the login.

### Prerequisites

- A test device (iOS or Android) with the **IBM Verify** app installed.
  - iOS: <https://apps.apple.com/app/ibm-verify/id1085498653>
  - Android: <https://play.google.com/store/apps/details?id=com.ibm.security.verifyapp>

### Steps

1. Admin Console → **Security** → **Authentication** → **IBM Verify App**.
2. Click **Edit**.
3. Set **Status** to **Enabled**.
4. Under **Registration**, configure:
   | Field | Value |
   |---|---|
   | **Allow push notifications** | Enabled |
   | **Transaction timeout** | `60` seconds (matches backend polling timeout) |
5. Click **Save**.

### Enrolling a test device

1. In the IBM Verify app on the test device, tap **Add account**.
2. In the Admin Console or the MockBank POC profile page, trigger enrollment — a QR code appears.
3. Scan the QR code with the IBM Verify app.
4. The device is now enrolled and will receive push notifications for that user.

> **Note:** Push notifications require a network-accessible IBM Verify tenant. The ngrok tunnel
> ensures the backend can reach IBM Verify — no additional configuration is required.

---

## 6. Enable Email OTP Policy

Email OTP sends a one-time code to the user's registered email address — the simplest fallback
authentication method.

### Steps

1. Admin Console → **Security** → **Authentication** → **Email OTP**.
2. Click **Edit**.
3. Set the following:
   | Field | Value |
   |---|---|
   | **Status** | Enabled |
   | **Code length** | `6` digits |
   | **Code expiry** | `300` seconds (5 minutes) |
   | **Email template** | Default (or customise subject line to reference MockBank) |
4. Click **Save**.

> IBM Verify handles email delivery — no SMTP configuration is required on your side.

---

## 7. Create a Test User

A test user is required for SSO login and for testing authentication flows end-to-end.

### Steps

1. Admin Console → **Directory** → **Users**.
2. Click **Add user**.
3. Fill in:
   | Field | Value |
   |---|---|
   | **First name** | _(e.g. Jane)_ |
   | **Last name** | _(e.g. Demo)_ |
   | **Username** | _(e.g. janedemo)_ |
   | **Email address** | A real inbox you can access (needed for Email OTP and notifications) |
   | **Password** | Set a temporary password (used only for IBM Verify hosted SSO login page) |
4. Under **Status**, ensure the account is **Active**.
5. Click **Save**.

> The test user's `sub` (subject) claim from IBM Verify's ID token becomes the `verify_user_id`
> stored in the local SQLite `users` table — this links the IBM Verify identity to the MockBank
> banking records.

---

## 8. OIDC Discovery Endpoint

IBM Verify publishes an OIDC discovery document that advertises all endpoint URLs, supported
scopes, and the JWKS URI. The backend uses this to validate ID tokens.

### Discovery URL format

```
https://<your-tenant-id>.verify.ibm.com/oidc/endpoint/default/.well-known/openid-configuration
```

### Verify it is working

```bash
curl -s https://yourtenantid.verify.ibm.com/oidc/endpoint/default/.well-known/openid-configuration \
  | python3 -m json.tool | head -30
```

Expected output includes:

```json
{
  "issuer": "https://yourtenantid.verify.ibm.com/oidc/endpoint/default",
  "authorization_endpoint": "https://yourtenantid.verify.ibm.com/oidc/endpoint/default/authorize",
  "token_endpoint": "https://yourtenantid.verify.ibm.com/oidc/endpoint/default/token",
  "jwks_uri": "https://yourtenantid.verify.ibm.com/oidc/endpoint/default/jwks",
  ...
}
```

### Capturing the issuer

The `issuer` value from the discovery document maps to the `VERIFY_OIDC_ISSUER` environment variable:

```
VERIFY_OIDC_ISSUER=https://yourtenantid.verify.ibm.com/oidc/endpoint/default
```

---

## 9. Environment Variable Checklist

Use this table to verify every required value has been captured from the IBM Verify admin console
before populating your `.env` file.

| `.env` variable | Where to find it | Example value |
|---|---|---|
| `VERIFY_TENANT_URL` | The base URL of your IBM Verify tenant | `https://yourtenantid.verify.ibm.com` |
| `VERIFY_CLIENT_ID` | Applications → MockBank POC → General tab | `abc123def456...` |
| `VERIFY_CLIENT_SECRET` | Applications → MockBank POC → Sign-on tab → Client secret | `xxxxxxxxxxx` |
| `VERIFY_OIDC_ISSUER` | OIDC discovery doc → `issuer` field (Section 8) | `https://yourtenantid.verify.ibm.com/oidc/endpoint/default` |
| `FIDO2_RP_ID` | Your ngrok public hostname (no `https://`) | `abcd1234.ngrok-free.app` |
| `FIDO2_RP_ORIGIN` | Your ngrok public hostname with `https://` prefix | `https://abcd1234.ngrok-free.app` |
| `JWT_SECRET` | Generate locally — never from IBM Verify | `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `NGROK_AUTHTOKEN` | <https://dashboard.ngrok.com/get-started/your-authtoken> | `2abc...xyz_...` |

### Generating `JWT_SECRET`

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Copy the output into `.env` as the value for `JWT_SECRET`.

---

## Quick Reference — Admin Console Navigation

| Task | Admin Console path |
|---|---|
| View / edit OIDC app | Applications → Applications → MockBank POC |
| FIDO2 settings | Security → Authentication → FIDO2 |
| TOTP settings | Security → Authentication → TOTP |
| Push notification settings | Security → Authentication → IBM Verify App |
| Email OTP settings | Security → Authentication → Email OTP |
| User management | Directory → Users |
| API documentation | Help → API Documentation (top-right menu) |

---

*For full IBM Verify SaaS documentation see <https://docs.verify.ibm.com>.*

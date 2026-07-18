# User Account Lifecycle Management — Plan

## Top-Level Overview

**Goal:** Add complete user account lifecycle management to the MockBank POC, covering three areas:

1. **Missing backend APIs** — list all users (paginated + searchable), enable a disabled user, and unenroll a specific MFA factor on behalf of a user (admin action)
2. **Admin section in the Profile page** — a collapsible panel (visible only to Admin-role users) that lets admins list, create, edit, enable/disable, and delete any user
3. **Self-service features for regular users** — let any authenticated user edit their own profile (name), unenroll a specific MFA factor they own, and delete their own account

**Approach:**
- Extend [`backend/app/routers/users.py`](backend/app/routers/users.py) with new endpoints only; no DB schema changes required
- Extend [`backend/app/services/verify_client.py`](backend/app/services/verify_client.py) with new IBM Verify API calls for factor deletion (unenrollment)
- Extend [`frontend/src/pages/ProfilePage.tsx`](frontend/src/pages/ProfilePage.tsx) with an admin collapsible section and self-service controls
- No new routes in [`frontend/src/App.tsx`](frontend/src/App.tsx) — everything lives on `/profile`

---

## Sub-Task 1 — Backend: List Users & Enable User APIs

**Status:** [ ] pending

### Intent
The admin panel needs to fetch and display all users. The existing backend only has create/update/disable/delete. Two endpoints are missing:
- `GET /users` — list all local users (supports search by name/email, pagination)
- `POST /users/{verify_user_id}/enable` — re-enable a previously disabled user (counterpart to the existing `/disable`)

### Expected Outcomes
- `GET /users?search=alice&page=1&page_size=20` returns a paginated list of users from the local SQLite DB
- `POST /users/{verify_user_id}/enable` sets `is_active=True` in both local DB and IBM Verify
- Both endpoints require Admin role
- Response shape is consistent with existing user CRUD responses

### Todo List
1. Add `GET /users` endpoint in [`backend/app/routers/users.py`](backend/app/routers/users.py):
   - Query params: `search: str = ""`, `page: int = 1`, `page_size: int = 20`
   - SQLAlchemy `select(User).where(User.name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%")).offset(...).limit(...)`
   - Also return `total` count for pagination
   - Requires admin role via `_require_admin()`
2. Add `POST /users/{verify_user_id}/enable` endpoint in [`backend/app/routers/users.py`](backend/app/routers/users.py):
   - Call `verify_client.set_user_active(verify_user_id, True)`
   - Set `user.is_active = True` in local DB
   - Return `{"id": verify_user_id, "is_active": True}`
   - Requires admin role

### Relevant Context
- [`backend/app/routers/users.py`](backend/app/routers/users.py) — `_require_admin()` helper at line 54; `disable_managed_user` at line 122 is the enable counterpart's pattern
- [`backend/app/models.py`](backend/app/models.py:21) — `User` model with `is_active`, `email`, `name` fields
- [`backend/app/services/verify_client.py`](backend/app/services/verify_client.py:207) — `set_user_active(verify_user_id, active)` already exists

---

## Sub-Task 2 — Backend: MFA Factor Unenrollment API

**Status:** [ ] pending

### Intent
Admins need to revoke specific MFA factors from a user (e.g., remove a lost FIDO2 device). Users also need to unenroll their own factors (self-service). IBM Verify provides REST DELETE endpoints for each factor type; we need to expose this through the backend.

### Expected Outcomes
- `DELETE /users/{verify_user_id}/factors/{factor_type}` removes all registrations of the given factor type for the user from IBM Verify
- `factor_type` is one of: `fido2`, `totp`, `push`, `email_otp`
- Admin can unenroll any user's factor; regular user can only unenroll their own (backend enforces this)
- 204 No Content on success

### Todo List
1. Add `unenroll_factor(verify_user_id, factor_type)` method in [`backend/app/services/verify_client.py`](backend/app/services/verify_client.py):
   - **FIDO2**: `GET /v2.0/factors/fido2/relyingparties/{rp_id}/registrations?userId=...` → for each registration id, `DELETE /v2.0/factors/fido2/relyingparties/{rp_id}/registrations/{id}`
   - **TOTP**: `GET /v2.0/factors/totp/registrations?userId=...` → for each id, `DELETE /v2.0/factors/totp/registrations/{id}`
   - **Push**: `GET /v2.0/factors/push/registrations?userId=...` → for each id, `DELETE /v2.0/factors/push/registrations/{id}`
   - **Email OTP**: `GET /v2.0/factors/emailotp?userId=...` → for each id, `DELETE /v2.0/factors/emailotp/{id}`
   - Uses admin headers for FIDO2/TOTP/Push (same as `get_enrolled_factors`), regular headers for email OTP (same as `email_otp_enroll`)
2. Add `DELETE /users/{verify_user_id}/factors/{factor_type}` endpoint in [`backend/app/routers/users.py`](backend/app/routers/users.py):
   - If `current_user.role == "Admin"` → allow for any `verify_user_id`
   - Else → only allow if `verify_user_id == current_user.verify_user_id` (self-service)
   - Validate `factor_type` is one of the four allowed values; return 400 if not
   - Call `verify_client.unenroll_factor(verify_user_id, factor_type)`
   - Return 204 No Content

### Relevant Context
- [`backend/app/services/verify_client.py`](backend/app/services/verify_client.py:221) — `get_enrolled_factors()` shows exact URL patterns for listing each factor type — reuse those to find and then DELETE individual IDs
- [`backend/app/routers/users.py`](backend/app/routers/users.py:141) — `delete_managed_user` shows the 204 response pattern

---

## Sub-Task 3 — Backend: Self-Service Profile Update & Account Deletion

**Status:** [ ] pending

### Intent
Regular users currently have no way to update their own profile or delete their account. Two endpoints are needed:
- `PUT /users/me` — update own name and/or email (synced to IBM Verify)
- `DELETE /users/me` — delete own account from IBM Verify + local DB (irreversible)

### Expected Outcomes
- `PUT /users/me` accepts `{"name": "...", "email": "..."}` and updates both IBM Verify (via SCIM) and local DB; returns the updated user object
- `DELETE /users/me` deletes the user from IBM Verify and local DB; returns 204; the JWT becomes invalid immediately (client must log out)
- Admins cannot abuse `DELETE /users/me` to delete their own record while other admins exist — not required for POC; just delete cleanly

### Todo List
1. Add `PUT /users/me` endpoint in [`backend/app/routers/users.py`](backend/app/routers/users.py):
   - Accept `SelfUpdateRequest` schema with `name: str` and `email: EmailStr` (both optional, at least one required)
   - Call `verify_client.update_user(current_user.verify_user_id, email, name, current_user.role)` to sync to IBM Verify
   - Update local DB user fields
   - Return updated user dict (same shape as `get_me`)
2. Add `DELETE /users/me` endpoint in [`backend/app/routers/users.py`](backend/app/routers/users.py):
   - Call `verify_client.delete_user(current_user.verify_user_id)` to remove from IBM Verify
   - Delete from local DB (cascades to accounts and transactions via ORM relationship)
   - Return 204 No Content

### Relevant Context
- [`backend/app/routers/users.py`](backend/app/routers/users.py:90) — `update_managed_user` at line 90 shows the SCIM update + local DB update pattern
- [`backend/app/routers/users.py`](backend/app/routers/users.py:141) — `delete_managed_user` at line 141 shows the IBM Verify delete + local DB delete pattern
- [`backend/app/models.py`](backend/app/models.py:32) — `accounts` relationship has `cascade="all, delete-orphan"` so deleting the user cascades to accounts and transactions

---

## Sub-Task 4 — Frontend: Self-Service Profile Controls

**Status:** [ ] pending

### Intent
Extend the existing [`ProfilePage.tsx`](frontend/src/pages/ProfilePage.tsx) with self-service controls for all authenticated users:
- Edit own name and email with an inline form (save → `PUT /users/me`)
- Unenroll an enrolled factor (remove button beside enrolled factors → `DELETE /users/{id}/factors/{type}`)
- Delete own account button (with a confirmation prompt → `DELETE /users/me` → logout)

### Expected Outcomes
- Profile page shows an "Edit Profile" button next to the user card; clicking opens an inline edit form (name + email fields) with Save/Cancel
- Each enrolled factor row shows a "Remove" button when `enrolled === true`; clicking removes the factor after a browser `confirm()` dialog
- A "Delete My Account" button appears in a danger zone section at the bottom of the profile; requires typing "DELETE" to confirm before the request is sent
- On successful account deletion, `logout()` is called and user is navigated to `/`

### Todo List
1. Add an `isEditing` state boolean and `editName`/`editEmail` state fields to `ProfilePage.tsx`
2. Render an edit form inline in the user card when `isEditing === true`; on save, call `PUT /users/me` via the `api` axios instance, then update the `AuthContext` user via `login()` with refreshed data
3. Add a `handleUnenroll(factorKey)` function that calls `DELETE /users/{meId}/factors/{factorKey}` and refreshes the enrolled factors state
4. Add a "Remove" button to the factor row when `m.enrolled === true` and the factor supports removal (fido2, totp, push, email_otp)
5. Add a "Danger Zone" section at the bottom of the page with a "Delete My Account" button; use `window.prompt("Type DELETE to confirm")` before calling `DELETE /users/me`, then call `logout()` and `navigate('/')`

### Relevant Context
- [`frontend/src/pages/ProfilePage.tsx`](frontend/src/pages/ProfilePage.tsx:23) — existing component structure; `user` from `useAuth()` provides `name`, `email`, `role`; `api` is the pre-configured axios instance
- [`frontend/src/context/AuthContext.tsx`](frontend/src/context/AuthContext.tsx:28) — `login(token, user)` can be called after profile update to refresh the in-session user data
- [`frontend/src/api/axios.ts`](frontend/src/api/axios.ts) — `api` axios instance with auto-injected JWT

---

## Sub-Task 5 — Frontend: Admin Section in Profile Page

**Status:** [ ] pending

### Intent
Add a collapsible "User Management" admin panel at the bottom of [`ProfilePage.tsx`](frontend/src/pages/ProfilePage.tsx), visible only when `user?.role === "Admin"`. The panel lets admins:
- View a paginated, searchable list of all users (`GET /users`)
- Create a new managed user (`POST /users`)
- Edit any user's name, email, role, and active status (`PUT /users/{id}`)
- Enable (`POST /users/{id}/enable`) or disable (`POST /users/{id}/disable`) a user
- Delete a user (`DELETE /users/{id}`) with a confirmation prompt

### Expected Outcomes
- A collapsible "👑 User Management" section appears at the bottom of Profile page only for Admin-role users
- The section starts collapsed; clicking the header expands it
- Expanded state shows a search bar + "New User" button + a user table
- The table rows include: Name, Email, Role, Status (Active/Disabled), and action buttons (Edit, Enable/Disable, Delete)
- "New User" opens an inline form above the table; "Edit" replaces row content with an editable form
- All destructive actions (delete) require `window.confirm()` before proceeding
- After any mutating action, the user list re-fetches to reflect the updated state

### Todo List
1. Add `isAdminExpanded` boolean state to control the collapsible admin panel
2. Add `userList`, `loadingUsers`, `userSearch`, `userPage` state fields
3. Add `fetchUsers()` async function that calls `GET /users?search=...&page=...&page_size=10` and sets `userList`
4. Add `handleCreateUser(form)` that calls `POST /users` then calls `fetchUsers()`
5. Add `handleUpdateUser(id, form)` that calls `PUT /users/{id}` then calls `fetchUsers()`
6. Add `handleToggleActive(id, currentActive)` that calls `/enable` or `/disable` then calls `fetchUsers()`
7. Add `handleDeleteUser(id)` that calls `DELETE /users/{id}` with `window.confirm()` guard then calls `fetchUsers()`
8. Add `showCreateForm` boolean state and `editingUserId` state to track which row is in edit mode
9. Render the entire admin panel section in JSX at the bottom of the return, behind `user?.role === 'Admin'` guard
10. Style inline using the existing `s` style object pattern from the same file

### Relevant Context
- [`frontend/src/pages/ProfilePage.tsx`](frontend/src/pages/ProfilePage.tsx) — existing inline style object `s` at line 148; matches the existing UI design language
- [`backend/app/routers/users.py`](backend/app/routers/users.py) — all admin endpoints require `Authorization: Bearer <token>` which is auto-injected by the axios instance

---

## Dependency Order

```
Sub-Task 1 → Sub-Task 5 (list/enable APIs needed before admin UI)
Sub-Task 2 → Sub-Task 4 (factor unenroll API needed before self-service unenroll UI)
Sub-Task 3 → Sub-Task 4 (self-service update/delete APIs needed before self-service UI)
Sub-Task 4 and Sub-Task 5 can be done in parallel after their backend dependencies
```

Recommended implementation order: **1 → 2 → 3 → 4 → 5**

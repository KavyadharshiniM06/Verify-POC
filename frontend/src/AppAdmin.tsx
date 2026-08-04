/**
 * AppAdmin — port 3001
 *
 * Fully self-contained Admin (HR Portal) app.
 * URL /  → AdminLoginPage  (if not authenticated)
 * URL /  → redirects to /admin/users (if authenticated as Admin)
 * Includes OIDC callback and all MFA/step-up flows.
 */
import React from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useSessionHeartbeat } from './hooks/useSessionHeartbeat'
import Layout from './components/Layout'

import AdminLoginPage     from './pages/AdminLoginPage'
import OIDCCallbackPage   from './pages/OIDCCallbackPage'
import AdminUsersPage     from './pages/AdminUsersPage'
import SecurityCenterPage from './pages/SecurityCenterPage'
import SettingsPage       from './pages/SettingsPage'
import StepUpPage         from './pages/StepUpPage'
import StepUpCallbackPage from './pages/StepUpCallbackPage'
import EnrollMethodPage   from './pages/EnrollMethodPage'
import MfaVerifyPage      from './pages/MfaVerifyPage'
import TOTPEnrollPage     from './pages/TOTPEnrollPage'
import TOTPVerifyPage     from './pages/TOTPVerifyPage'
import PushLoginPage      from './pages/PushLoginPage'
import EmailOTPPage       from './pages/EmailOTPPage'

function SessionGuard() {
  useSessionHeartbeat()
  return null
}

/** If already logged in as Admin, skip the login page and go straight to the dashboard. */
function AdminRoot() {
  const { isAuthenticated, user } = useAuth()
  if (isAuthenticated && user?.role === 'Admin') {
    return <Navigate to="/admin/users" replace />
  }
  return <AdminLoginPage />
}

/** Guard — must be Admin; otherwise back to login. */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  if (!isAuthenticated) return <Navigate to="/" replace />
  if (user?.role !== 'Admin') return <Navigate to="/" replace />
  return <>{children}</>
}

function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <Layout>{children}</Layout>
    </RequireAdmin>
  )
}

export default function AppAdmin() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SessionGuard />
        <Routes>
          {/* Root — login page or straight to dashboard */}
          <Route path="/"                  element={<AdminRoot />} />

          {/* OIDC / MFA flows */}
          <Route path="/callback"          element={<OIDCCallbackPage />} />
          <Route path="/auth/totp/enroll"  element={<TOTPEnrollPage />} />
          <Route path="/auth/totp/verify"  element={<TOTPVerifyPage />} />
          <Route path="/auth/push"         element={<PushLoginPage />} />
          <Route path="/auth/email-otp"    element={<EmailOTPPage />} />
          <Route path="/stepup"            element={<StepUpPage />} />
          <Route path="/stepup-callback"   element={<StepUpCallbackPage />} />
          <Route path="/enroll"            element={<RequireAdmin><EnrollMethodPage /></RequireAdmin>} />
          <Route path="/mfa"               element={<RequireAdmin><MfaVerifyPage /></RequireAdmin>} />

          {/* Protected Admin pages */}
          <Route path="/dashboard"         element={<RequireAdmin><Navigate to="/admin/users" replace /></RequireAdmin>} />
          <Route path="/admin/users"       element={<AdminLayout><AdminUsersPage /></AdminLayout>} />
          <Route path="/security"          element={<AdminLayout><SecurityCenterPage /></AdminLayout>} />
          <Route path="/settings"          element={<AdminLayout><SettingsPage /></AdminLayout>} />

          {/* Catch-all */}
          <Route path="*"                  element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

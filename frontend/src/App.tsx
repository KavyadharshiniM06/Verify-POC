import React from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useSessionHeartbeat } from './hooks/useSessionHeartbeat'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import AdminUsersPage from './pages/AdminUsersPage'
import AccessDashboardPage from './pages/AccessDashboardPage'
import LoanApprovalPage from './pages/LoanApprovalPage'
import SecurityCenterPage from './pages/SecurityCenterPage'
import AdminSecurityPage from './pages/AdminSecurityPage'
import SettingsPage from './pages/SettingsPage'
import AdminSettingsPage from './pages/AdminSettingsPage'
import LoginPage from './pages/LoginPage'
import AdminLoginPage from './pages/AdminLoginPage'
import AnalystLoginPage from './pages/AnalystLoginPage'
import OIDCCallbackPage from './pages/OIDCCallbackPage'
import RegisterPage from './pages/RegisterPage'
import TOTPEnrollPage from './pages/TOTPEnrollPage'
import TOTPVerifyPage from './pages/TOTPVerifyPage'
import PushLoginPage from './pages/PushLoginPage'
import EmailOTPPage from './pages/EmailOTPPage'
import StepUpPage from './pages/StepUpPage'
import StepUpCallbackPage from './pages/StepUpCallbackPage'
import EnrollMethodPage from './pages/EnrollMethodPage'
import MfaVerifyPage from './pages/MfaVerifyPage'

/**
 * Mounts the session-validity heartbeat. Must be a child of both AuthProvider
 * and BrowserRouter so it has access to auth state and can navigate.
 */
function SessionGuard() {
  useSessionHeartbeat()
  return null
}

/**
 * Guards the generic /dashboard route.
 * Redirects each role to their canonical landing page so bookmarks to /dashboard
 * always land somewhere useful, not on a blank fallback.
 *   Admin             → /admin/users  (CIAM portal)
 *   SalesforceManager → /access-dashboard (Salesforce launchpad)
 *   Manager           → /loans        (loan approvals)
 */
function RoleHome() {
  const { user } = useAuth()
  if (user?.role === 'Admin')             return <Navigate to="/admin/users"       replace />
  if (user?.role === 'SalesforceManager') return <Navigate to="/access-dashboard"  replace />
  return <Navigate to="/loans" replace />
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <Layout>{children}</Layout>
    </RequireAuth>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* SessionGuard must be inside BrowserRouter + AuthProvider */}
        <SessionGuard />
        <Routes>
          {/* ── Public / Auth routes ─────────────────────────────── */}
          <Route path="/"        element={<LoginPage />} />
          <Route path="/admin"   element={<AdminLoginPage />} />
          <Route path="/analyst" element={<AnalystLoginPage />} />
          <Route path="/callback" element={<OIDCCallbackPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/totp/enroll" element={<TOTPEnrollPage />} />
          <Route path="/auth/totp/verify" element={<TOTPVerifyPage />} />
          <Route path="/auth/push" element={<PushLoginPage />} />
          <Route path="/auth/email-otp" element={<EmailOTPPage />} />
          <Route path="/stepup" element={<StepUpPage />} />
          <Route path="/stepup-callback" element={<StepUpCallbackPage />} />
          {/* Enrollment wizard — requires a valid session but no Layout wrapper */}
          <Route path="/enroll" element={<RequireAuth><EnrollMethodPage /></RequireAuth>} />
          {/* Unified MFA verification picker (Email OTP + TOTP + Push) */}
          <Route path="/mfa" element={<RequireAuth><MfaVerifyPage /></RequireAuth>} />

          {/* ── Protected / Workforce routes ─────────────────────── */}

          {/* /dashboard — role-aware redirect to the canonical landing page */}
          <Route
            path="/dashboard"
            element={<RequireAuth><RoleHome /></RequireAuth>}
          />

          {/* ── Admin-only: CIAM source-of-truth portal ─────────── */}
          <Route
            path="/admin/users"
            element={<ProtectedLayout><AdminUsersPage /></ProtectedLayout>}
          />

          {/* ── SalesforceManager: Salesforce launchpad ──────────── */}
          <Route
            path="/access-dashboard"
            element={<ProtectedLayout><AccessDashboardPage /></ProtectedLayout>}
          />

          {/* ── Manager / SalesforceManager: Loan Approvals ──────── */}
          <Route
            path="/loans"
            element={<ProtectedLayout><LoanApprovalPage /></ProtectedLayout>}
          />

          {/* ── Admin-only: Security & Settings (dark theme) ──────── */}
          <Route
            path="/admin/security"
            element={<ProtectedLayout><AdminSecurityPage /></ProtectedLayout>}
          />
          <Route
            path="/admin/settings"
            element={<ProtectedLayout><AdminSettingsPage /></ProtectedLayout>}
          />

          {/* ── Analyst: Security & Settings (light theme) ───────── */}
          <Route
            path="/security"
            element={<ProtectedLayout><SecurityCenterPage /></ProtectedLayout>}
          />
          <Route
            path="/settings"
            element={<ProtectedLayout><SettingsPage /></ProtectedLayout>}
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

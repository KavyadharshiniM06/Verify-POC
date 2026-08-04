/**
 * AppAnalyst — port 3002
 *
 * Fully self-contained Credit Analyst Portal app.
 * URL /  → AnalystLoginPage  (if not authenticated)
 * URL /  → redirects to /loans (if authenticated as Manager/SalesforceManager)
 * Includes OIDC callback and all MFA/step-up flows.
 */
import React from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useSessionHeartbeat } from './hooks/useSessionHeartbeat'
import Layout from './components/Layout'

import AnalystLoginPage   from './pages/AnalystLoginPage'
import OIDCCallbackPage   from './pages/OIDCCallbackPage'
import LoanApprovalPage   from './pages/LoanApprovalPage'
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

const ANALYST_ROLES = ['Manager', 'SalesforceManager']

function SessionGuard() {
  useSessionHeartbeat()
  return null
}

/** If already logged in as an Analyst role, skip the login page and go to /loans. */
function AnalystRoot() {
  const { isAuthenticated, user } = useAuth()
  if (isAuthenticated && ANALYST_ROLES.includes(user?.role ?? '')) {
    return <Navigate to="/loans" replace />
  }
  return <AnalystLoginPage />
}

/** Guard — must be Analyst role; otherwise back to login. */
function RequireAnalyst({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  if (!isAuthenticated) return <Navigate to="/" replace />
  if (!ANALYST_ROLES.includes(user?.role ?? '')) return <Navigate to="/" replace />
  return <>{children}</>
}

function AnalystLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAnalyst>
      <Layout>{children}</Layout>
    </RequireAnalyst>
  )
}

export default function AppAnalyst() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SessionGuard />
        <Routes>
          {/* Root — login page or straight to loans */}
          <Route path="/"                  element={<AnalystRoot />} />

          {/* OIDC / MFA flows */}
          <Route path="/callback"          element={<OIDCCallbackPage />} />
          <Route path="/auth/totp/enroll"  element={<TOTPEnrollPage />} />
          <Route path="/auth/totp/verify"  element={<TOTPVerifyPage />} />
          <Route path="/auth/push"         element={<PushLoginPage />} />
          <Route path="/auth/email-otp"    element={<EmailOTPPage />} />
          <Route path="/stepup"            element={<StepUpPage />} />
          <Route path="/stepup-callback"   element={<StepUpCallbackPage />} />
          <Route path="/enroll"            element={<RequireAnalyst><EnrollMethodPage /></RequireAnalyst>} />
          <Route path="/mfa"               element={<RequireAnalyst><MfaVerifyPage /></RequireAnalyst>} />

          {/* Protected Analyst pages */}
          <Route path="/dashboard"         element={<RequireAnalyst><Navigate to="/loans" replace /></RequireAnalyst>} />
          <Route path="/loans"             element={<AnalystLayout><LoanApprovalPage /></AnalystLayout>} />
          <Route path="/security"          element={<AnalystLayout><SecurityCenterPage /></AnalystLayout>} />
          <Route path="/settings"          element={<AnalystLayout><SettingsPage /></AnalystLayout>} />

          {/* Catch-all */}
          <Route path="*"                  element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

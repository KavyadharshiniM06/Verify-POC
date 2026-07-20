import React from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import AdminUsersPage from './pages/AdminUsersPage'
import AllTransactionsPage from './pages/AllTransactionsPage'
import NotificationsPage from './pages/NotificationsPage'
import SecurityCenterPage from './pages/SecurityCenterPage'
import SettingsPage from './pages/SettingsPage'

import LoginPage from './pages/LoginPage'
import OIDCCallbackPage from './pages/OIDCCallbackPage'
import RegisterPage from './pages/RegisterPage'
import TOTPEnrollPage from './pages/TOTPEnrollPage'
import TOTPVerifyPage from './pages/TOTPVerifyPage'
import PushLoginPage from './pages/PushLoginPage'
import EmailOTPPage from './pages/EmailOTPPage'
import DashboardPage from './pages/DashboardPage'
import TransactionsPage from './pages/TransactionsPage'
import TransferPage from './pages/TransferPage'
import StepUpPage from './pages/StepUpPage'
import StepUpCallbackPage from './pages/StepUpCallbackPage'
import EnrollMethodPage from './pages/EnrollMethodPage'

/** Redirect Manager/Admin away from customer-only pages to their landing page. */
function CustomerOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.role === 'Manager' || user?.role === 'Admin') {
    return <Navigate to="/all-transactions" replace />
  }
  return <>{children}</>
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
        <Routes>
          {/* ── Public / Auth routes ─────────────────────────────── */}
          <Route path="/" element={<LoginPage />} />
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

          {/* ── Protected / Banking routes ───────────────────────── */}
          <Route
            path="/dashboard"
            element={<ProtectedLayout><DashboardPage /></ProtectedLayout>}
          />
          <Route
            path="/transactions"
            element={<ProtectedLayout><CustomerOnly><TransactionsPage /></CustomerOnly></ProtectedLayout>}
          />
          <Route
            path="/transfers"
            element={<ProtectedLayout><CustomerOnly><TransferPage /></CustomerOnly></ProtectedLayout>}
          />
          <Route
            path="/all-transactions"
            element={<ProtectedLayout><AllTransactionsPage /></ProtectedLayout>}
          />
          <Route
            path="/admin/users"
            element={<ProtectedLayout><AdminUsersPage /></ProtectedLayout>}
          />
          <Route
            path="/notifications"
            element={<ProtectedLayout><NotificationsPage /></ProtectedLayout>}
          />
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

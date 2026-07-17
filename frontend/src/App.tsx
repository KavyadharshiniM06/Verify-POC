import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'

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
import ProfilePage from './pages/ProfilePage'

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

          {/* ── Protected / Banking routes ───────────────────────── */}
          <Route
            path="/dashboard"
            element={<ProtectedLayout><DashboardPage /></ProtectedLayout>}
          />
          <Route
            path="/transactions"
            element={<ProtectedLayout><TransactionsPage /></ProtectedLayout>}
          />
          <Route
            path="/transfers"
            element={<ProtectedLayout><TransferPage /></ProtectedLayout>}
          />
          <Route
            path="/profile"
            element={<ProtectedLayout><ProfilePage /></ProtectedLayout>}
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

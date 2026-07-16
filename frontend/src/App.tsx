import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'

// Auth pages
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import TOTPEnrollPage from './pages/TOTPEnrollPage'
import TOTPVerifyPage from './pages/TOTPVerifyPage'
import PushLoginPage from './pages/PushLoginPage'
import EmailOTPPage from './pages/EmailOTPPage'
import OIDCCallbackPage from './pages/OIDCCallbackPage'

// Banking pages
import DashboardPage from './pages/DashboardPage'
import TransactionsPage from './pages/TransactionsPage'
import TransferPage from './pages/TransferPage'
import ProfilePage from './pages/ProfilePage'

/** Wrap a banking page with auth guard + shared sidebar layout. */
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
          {/* ── Public auth routes ── */}
          <Route path="/" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/totp" element={<TOTPVerifyPage />} />
          <Route path="/auth/totp/enroll" element={<TOTPEnrollPage />} />
          <Route path="/auth/push" element={<PushLoginPage />} />
          <Route path="/auth/email-otp" element={<EmailOTPPage />} />
          <Route path="/callback" element={<OIDCCallbackPage />} />

          {/* ── Protected banking routes ── */}
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

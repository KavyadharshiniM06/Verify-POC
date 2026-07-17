import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'

import LoginPage from './pages/LoginPage'
import OIDCCallbackPage from './pages/OIDCCallbackPage'
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
          <Route path="/" element={<LoginPage />} />
          <Route path="/callback" element={<OIDCCallbackPage />} />
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

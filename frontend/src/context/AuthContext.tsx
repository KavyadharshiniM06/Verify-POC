import React, { createContext, useContext, useState } from 'react'

interface AuthUser {
  name: string
  email: string
  role: string
}

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  mfaVerified: boolean
  login: (token: string, user: AuthUser, mfaVerified?: boolean) => void
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('mb_token')
  )
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = sessionStorage.getItem('mb_user')
    return stored ? (JSON.parse(stored) as AuthUser) : null
  })
  const [mfaVerified, setMfaVerified] = useState<boolean>(
    () => sessionStorage.getItem('mb_mfa_verified') === 'true'
  )

  const login = (newToken: string, newUser: AuthUser, newMfaVerified = false) => {
    sessionStorage.setItem('mb_token', newToken)
    sessionStorage.setItem('mb_user', JSON.stringify(newUser))
    sessionStorage.setItem('mb_mfa_verified', String(newMfaVerified))
    setToken(newToken)
    setUser(newUser)
    setMfaVerified(newMfaVerified)
  }

  const logout = () => {
    sessionStorage.removeItem('mb_token')
    sessionStorage.removeItem('mb_user')
    sessionStorage.removeItem('mb_mfa_verified')
    setToken(null)
    setUser(null)
    setMfaVerified(false)
  }

  return (
    <AuthContext.Provider value={{ user, token, mfaVerified, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

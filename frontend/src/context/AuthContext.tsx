import React, { createContext, useContext, useState } from 'react'

interface AuthUser {
  name: string
  email: string
  role: string
}

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  login: (token: string, user: AuthUser) => void
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

  const login = (newToken: string, newUser: AuthUser) => {
    sessionStorage.setItem('mb_token', newToken)
    sessionStorage.setItem('mb_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  const logout = () => {
    sessionStorage.removeItem('mb_token')
    sessionStorage.removeItem('mb_user')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

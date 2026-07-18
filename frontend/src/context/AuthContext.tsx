import React, { createContext, useContext, useState } from 'react'

interface AuthUser {
  name: string
  email: string
  role: string
}

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  /** True when the current JWT contains a non-expired step-up verification. */
  stepupVerified: boolean
  /** ISO-8601 timestamp of when step-up was last completed, or null. */
  stepupTime: string | null
  login: (token: string, user: AuthUser, stepupVerified?: boolean, stepupTime?: string | null) => void
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
  const [stepupVerified, setStepupVerified] = useState<boolean>(
    () => sessionStorage.getItem('mb_stepup_verified') === 'true'
  )
  const [stepupTime, setStepupTime] = useState<string | null>(
    () => sessionStorage.getItem('mb_stepup_time')
  )

  const login = (
    newToken: string,
    newUser: AuthUser,
    newStepupVerified = false,
    newStepupTime: string | null = null,
  ) => {
    sessionStorage.setItem('mb_token', newToken)
    sessionStorage.setItem('mb_user', JSON.stringify(newUser))
    sessionStorage.setItem('mb_stepup_verified', String(newStepupVerified))
    if (newStepupTime) {
      sessionStorage.setItem('mb_stepup_time', newStepupTime)
    } else {
      sessionStorage.removeItem('mb_stepup_time')
    }
    setToken(newToken)
    setUser(newUser)
    setStepupVerified(newStepupVerified)
    setStepupTime(newStepupTime)
  }

  const logout = () => {
    sessionStorage.removeItem('mb_token')
    sessionStorage.removeItem('mb_user')
    sessionStorage.removeItem('mb_stepup_verified')
    sessionStorage.removeItem('mb_stepup_time')
    setToken(null)
    setUser(null)
    setStepupVerified(false)
    setStepupTime(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        stepupVerified,
        stepupTime,
        login,
        logout,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

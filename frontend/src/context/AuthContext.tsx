// @refresh reset
/**
 * AuthContext — auth state, provider, and hook.
 *
 * The `// @refresh reset` directive above tells Vite Fast Refresh to do a
 * full component remount (instead of a hot patch) when this file changes.
 * This is the documented way to handle files that intentionally export both
 * a React component (AuthProvider) and a hook (useAuth) from the same module.
 * See: https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#consistent-components-exports
 */

import React, { createContext, useContext, useState } from 'react'

export interface AuthUser {
  name: string
  email: string
  role: string
}

export interface AuthContextType {
  user: AuthUser | null
  token: string | null
  /** True when the current JWT contains a non-expired step-up verification. */
  stepupVerified: boolean
  /** ISO-8601 timestamp of when step-up was last completed, or null. */
  stepupTime: string | null
  login: (token: string, user: AuthUser, stepupVerified?: boolean, stepupTime?: string | null) => void
  logout: () => void
  /**
   * Immediately terminate the session and carry a consent-revoked message to
   * the login page. Used by the session heartbeat when IBM Verify reports that
   * the access token is no longer active.
   */
  forceLogoutWithError: (message: string) => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

/** Decode a JWT payload without verifying the signature (client-side only). */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return {}
  }
}

/** Check if the JWT's step-up is still within the valid window (mirrors backend logic). */
function isStepupValidInToken(token: string, durationMinutes = 1): boolean {
  const payload = decodeJwtPayload(token)
  if (!payload.stepup_verified) return false
  const stepupTime = payload.stepup_time as string | null
  if (!stepupTime) return false
  try {
    const t = new Date(stepupTime).getTime()
    const windowMs = durationMinutes * 60 * 1000
    return Date.now() - t <= windowMs
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('mb_token')
  )
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = sessionStorage.getItem('mb_user')
    return stored ? (JSON.parse(stored) as AuthUser) : null
  })

  // Derive stepupVerified directly from the JWT — never trust sessionStorage alone.
  const [stepupVerified, setStepupVerified] = useState<boolean>(() => {
    const t = sessionStorage.getItem('mb_token')
    return t ? isStepupValidInToken(t) : false
  })
  const [stepupTime, setStepupTime] = useState<string | null>(() => {
    const t = sessionStorage.getItem('mb_token')
    if (!t) return null
    const payload = decodeJwtPayload(t)
    return (payload.stepup_time as string | null) ?? null
  })

  const login = (
    newToken: string,
    newUser: AuthUser,
    newStepupVerified = false,
    newStepupTime: string | null = null,
  ) => {
    sessionStorage.setItem('mb_token', newToken)
    sessionStorage.setItem('mb_user', JSON.stringify(newUser))
    const derivedStepup = isStepupValidInToken(newToken)
    const derivedTime = (decodeJwtPayload(newToken).stepup_time as string | null) ?? newStepupTime
    setToken(newToken)
    setUser(newUser)
    setStepupVerified(derivedStepup || newStepupVerified)
    setStepupTime(derivedTime)
  }

  const logout = () => {
    sessionStorage.removeItem('mb_token')
    sessionStorage.removeItem('mb_user')
    sessionStorage.removeItem('mb_ibm_id_token')
    sessionStorage.removeItem('mb_ibm_access_token')
    setToken(null)
    setUser(null)
    setStepupVerified(false)
    setStepupTime(null)
  }

  const forceLogoutWithError = (message: string) => {
    logout()
    // window.location.replace clears the history stack so the user cannot
    // press Back into the (now-invalid) session.
    const encoded = encodeURIComponent(message)
    window.location.replace(`/admin?consent_error=${encoded}`)
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
        forceLogoutWithError,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

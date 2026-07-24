/**
 * useSessionHeartbeat
 *
 * Checks POST /auth/sso/session-check while the user is authenticated.
 * The backend calls IBM Verify's /userinfo endpoint with the stored
 * access_token — a 401/403 response means OIDC consent was revoked on
 * the IBM Verify self-service portal, so the session must end immediately.
 *
 * Two triggers:
 *  1. Interval — fires every INTERVAL_MS (15s) while the tab is visible.
 *  2. visibilitychange — fires immediately when the user switches back to
 *     this tab (e.g. after revoking consent on IBM Verify in another tab).
 *
 * Fail-open: network errors / IBM Verify 5xx are treated as "healthy" —
 * we never log users out because of an infrastructure blip.
 *
 * No-op when no ibm_access_token is stored in sessionStorage.
 */

import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

const INTERVAL_MS = 15_000   // check every 15 seconds while tab is visible

interface SessionCheckResponse {
  active: boolean
}

interface ApiError {
  response?: {
    status?: number
    data?: {
      detail?: { code?: string; message?: string } | string
    }
  }
}

function extractConsentError(err: unknown): { isRevoked: boolean; msg?: string } {
  const apiErr = err as ApiError
  const status = apiErr?.response?.status
  const detail = apiErr?.response?.data?.detail
  const code   = typeof detail === 'object' ? detail?.code    : undefined
  const msg    = typeof detail === 'object' ? detail?.message
               : typeof detail === 'string'  ? detail : undefined
  return { isRevoked: status === 401 && code === 'CONSENT_REVOKED', msg }
}

export function useSessionHeartbeat() {
  const { isAuthenticated, forceLogoutWithError } = useAuth()

  // Stable ref so interval/event closures always call the latest version
  const forceLogoutRef = useRef(forceLogoutWithError)
  forceLogoutRef.current = forceLogoutWithError

  // Deduplicate: once we've decided to log out don't fire again
  const terminatedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) return
    terminatedRef.current = false   // reset on re-login

    async function beat() {
      if (terminatedRef.current) return
      if (document.visibilityState === 'hidden') return   // skip hidden tabs

      try {
        // No body needed — backend reads the access_token from its own DB.
        // The MockBank JWT in the Authorization header identifies the user.
        await api.post<SessionCheckResponse>('/auth/sso/session-check', {})
        // 200 → session healthy
      } catch (err: unknown) {
        const { isRevoked, msg } = extractConsentError(err)
        if (isRevoked && !terminatedRef.current) {
          terminatedRef.current = true
          forceLogoutRef.current(
            msg ??
            'Your sign-in permissions for MockBank have been revoked on IBM Verify. ' +
            'Please sign in again and click Allow to restore access.'
          )
        }
        // Any other error → ignore, try again next beat
      }
    }

    // Fire once immediately on mount
    void beat()

    // Fire on interval while tab is visible
    const intervalId = setInterval(() => void beat(), INTERVAL_MS)

    // Fire immediately whenever the user focuses back on this tab —
    // this is the key trigger: user revokes on IBM Verify in another tab,
    // switches back here, and the check fires within milliseconds.
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void beat()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isAuthenticated])
}

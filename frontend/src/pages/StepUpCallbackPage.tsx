/**
 * StepUpCallbackPage — receives the OIDC code+state after IBM Verify MFA challenge,
 * exchanges them for a fresh JWT with stepup_verified=true, then immediately
 * executes any pending transfer before navigating back.
 *
 * The pending transfer is executed HERE (not in TransferPage) so that the new
 * step-up JWT is guaranteed to be in sessionStorage before the API call is made.
 * This avoids the React async state timing issue where TransferPage's auto-retry
 * effect fires before AuthContext has fully propagated the new token.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

const PENDING_TRANSFER_KEY = 'mb_pending_transfer'

interface PendingTransfer {
  from_account_id: number
  to_account_id: number
  amount: number
}

export default function StepUpCallbackPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Completing MFA verification…')
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const complete = async () => {
      const queryParams = new URLSearchParams(window.location.search)
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))

      const code = queryParams.get('code') ?? hashParams.get('code')
      const state = queryParams.get('state') ?? hashParams.get('state')
      const errorParam = queryParams.get('error') ?? hashParams.get('error')
      const errorDescription = queryParams.get('error_description') ?? hashParams.get('error_description')

      if (errorParam) {
        setError(`IBM Verify returned an error: ${errorDescription ?? errorParam}`)
        return
      }

      if (!code || !state) {
        setError('Missing code or state in callback URL.')
        return
      }

      const stepUpToken = sessionStorage.getItem('mb_stepup_token')
      const returnTo = sessionStorage.getItem('mb_stepup_return_to') ?? '/transfers'

      if (!stepUpToken) {
        setError('Step-up token missing. Please try again.')
        return
      }

      // ── 1. Exchange code for a new step-up JWT ─────────────────────────
      let newToken: string
      try {
        const { data } = await api.post('/auth/sso/stepup/complete', {
          code,
          state,
          step_up_token: stepUpToken,
        })
        sessionStorage.removeItem('mb_stepup_token')
        sessionStorage.removeItem('mb_stepup_return_to')
        newToken = data.token
        // Write the new token to sessionStorage NOW — before any other API call.
        sessionStorage.setItem('mb_token', newToken)
        // Refresh the id_token_hint so the NEXT step-up also skips the password screen.
        if (data.ibm_id_token) {
          sessionStorage.setItem('mb_ibm_id_token', data.ibm_id_token)
        }
        login(data.token, data.user, true, null)
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: { code?: string; message?: string } | string } } }
        const detail = err?.response?.data?.detail
        if (detail && typeof detail === 'object' && detail.code === 'STEP_UP_REQUIRED') {
          setError(
            detail.message ??
            'IBM Verify did not perform a fresh MFA challenge. Please enroll a second factor and try again.'
          )
        } else {
          setError('MFA verification failed. Please try again.')
        }
        return
      }

      // ── 2. Execute pending transfer immediately with the new token ──────
      const raw = sessionStorage.getItem(PENDING_TRANSFER_KEY)
      if (raw) {
        setStatus('MFA verified — processing your transfer…')
        sessionStorage.removeItem(PENDING_TRANSFER_KEY)
        const pending: PendingTransfer = JSON.parse(raw)
        try {
          await api.post('/banking/transfer', {
            from_account_id: pending.from_account_id,
            to_account_id: pending.to_account_id,
            amount: pending.amount,
          }, {
            headers: { Authorization: `Bearer ${newToken}` },
          })
          navigate('/transfers?stepup_success=1', { replace: true })
          return
        } catch (txErr: unknown) {
          const e = txErr as { response?: { status?: number; data?: { detail?: unknown } } }
          const detail = e?.response?.data?.detail
          const status = e?.response?.status

          // If backend still returns STEP_UP_REQUIRED, navigate to stepup page
          if (
            status === 403 &&
            detail && typeof detail === 'object' &&
            (detail as { code?: string }).code === 'STEP_UP_REQUIRED'
          ) {
            sessionStorage.setItem('mb_pending_transfer', raw)
            navigate('/stepup?return_to=/transfers', { replace: true })
            return
          }

          const msg = typeof detail === 'string'
            ? detail
            : JSON.stringify(detail) ?? 'Transfer failed. Please try again.'
          setError(`Transfer failed: ${msg}`)
          return
        }
      }

      // ── 3. No pending transfer — just navigate back ────────────────────
      navigate(returnTo, { replace: true })
    }

    void complete()
  }, [login, navigate])

  if (error) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h2 style={{ color: '#dc2626', margin: '0 0 0.5rem' }}>Verification Failed</h2>
          <p style={s.sub}>{error}</p>
          <button style={s.btn} onClick={() => navigate('/transfers')}>← Back to Transfer</button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={s.card}>
        <p style={s.sub}>{status}</p>
        <div style={s.spinner} />
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', background: '#f7f8fa',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  card: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px',
    padding: '2.5rem', textAlign: 'center', minWidth: '300px',
  },
  sub: { color: '#57606a', fontSize: '0.9rem', marginBottom: '1.5rem' },
  spinner: {
    width: '28px', height: '28px', margin: '0 auto',
    border: '3px solid #e5e7eb', borderTopColor: '#3b82d4',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },
  btn: {
    padding: '0.6rem 1.5rem', background: '#3b82d4', color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600,
  },
}

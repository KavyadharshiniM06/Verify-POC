/**
 * StepUpCallbackPage — receives the OIDC code+state after IBM Verify MFA challenge,
 * exchanges them for a fresh JWT with mfa_verified=true, then resumes the user's
 * original action.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function StepUpCallbackPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
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

      try {
        const { data } = await api.post('/auth/sso/stepup/complete', {
          code,
          state,
          step_up_token: stepUpToken,
        })
        // Clear transient step-up state
        sessionStorage.removeItem('mb_stepup_token')
        sessionStorage.removeItem('mb_stepup_return_to')

        login(data.token, data.user, true)
        navigate(data.return_to ?? returnTo, { replace: true })
      } catch {
        setError('MFA verification failed. Please try again.')
      }
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
      <div style={s.card}>
        <p style={s.sub}>Completing MFA verification…</p>
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

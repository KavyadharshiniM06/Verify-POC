/**
 * StepUpPage — MFA re-verification before a sensitive action.
 *
 * Flow:
 *   1. On mount: POST /auth/sso/stepup/initiate  → gets IBM Verify URL + step_up_token
 *   2. Redirect user to IBM Verify (same tab); IBM Verify challenges with MFA
 *   3. IBM Verify redirects back to /stepup-callback?code=…&state=…
 *      (The step_up_token is stored in sessionStorage to survive the redirect)
 *   4. StepUpCallbackPage picks up the code+state+step_up_token and calls
 *      POST /auth/sso/stepup/complete → gets a fresh JWT with mfa_verified=true
 *   5. login() is called with the new token; user is sent to return_to
 */
import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function StepUpPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { isAuthenticated } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const returnTo = params.get('return_to') ?? '/transfers'

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/', { replace: true })
      return
    }

    const initiate = async () => {
      try {
        const { data } = await api.post('/auth/sso/stepup/initiate', { return_to: returnTo })
        // Persist the step-up token across the IBM Verify redirect
        sessionStorage.setItem('mb_stepup_token', data.step_up_token)
        sessionStorage.setItem('mb_stepup_return_to', returnTo)
        window.location.href = data.authorization_url
      } catch {
        setError('Could not initiate MFA verification. Please try again.')
      }
    }

    void initiate()
  }, [isAuthenticated, navigate, returnTo])

  if (error) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h2 style={{ color: '#dc2626', margin: '0 0 0.5rem' }}>MFA Error</h2>
          <p style={s.sub}>{error}</p>
          <button style={s.btn} onClick={() => navigate(returnTo)}>← Go back</button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.shield}>🔐</div>
        <h2 style={s.title}>Verify Your Identity</h2>
        <p style={s.sub}>
          This action requires a second factor.<br />
          Redirecting to IBM Verify…
        </p>
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
  shield: { fontSize: '2.5rem', marginBottom: '0.5rem' },
  title: { margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 700, color: '#1f2328' },
  sub: { color: '#57606a', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 1.5rem' },
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

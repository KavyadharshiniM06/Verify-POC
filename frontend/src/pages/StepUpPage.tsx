/**
 * StepUpPage — initiates IBM Verify OIDC step-up MFA.
 *
 * IBM Verify's factor verification APIs require a user-context token which
 * cannot be obtained server-side (ROPC is blocked by adaptive access, and
 * client_credentials tokens are rejected by all factor send endpoints).
 *
 * The only viable approach is the OIDC step-up redirect:
 *   1. POST /auth/sso/stepup/initiate → get { authorization_url, step_up_token }
 *   2. Save step_up_token + return_to in sessionStorage
 *   3. Redirect browser to authorization_url (IBM Verify hosted MFA page)
 *   4. IBM Verify challenges the user's enrolled second factor (push / TOTP /
 *      email OTP / FIDO2) — no password, because the user has an active session
 *   5. IBM Verify redirects back to /stepup-callback with code+state
 *   6. StepUpCallbackPage exchanges the code for a JWT with stepup_verified=true
 *   7. TransferPage (or whatever triggered step-up) auto-retries the action
 */
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function StepUpPage() {
  const [searchParams] = useSearchParams()
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const returnTo = searchParams.get('return_to') ?? '/transfers'

  const [errorMsg, setErrorMsg] = useState('')
  const calledRef = useRef(false)

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  // Kick off step-up on mount (once)
  useEffect(() => {
    if (!isAuthenticated || calledRef.current) return
    calledRef.current = true
    void initiate()
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  async function initiate() {
    try {
      const { data } = await api.post('/auth/sso/stepup/initiate', {
        return_to: returnTo,
      })

      // Persist the short-lived step-up token so StepUpCallbackPage can use it
      sessionStorage.setItem('mb_stepup_token', data.step_up_token)
      sessionStorage.setItem('mb_stepup_return_to', returnTo)

      // Hand off to IBM Verify's hosted MFA challenge page
      window.location.href = data.authorization_url
    } catch {
      setErrorMsg(
        'Could not start MFA challenge. Please go back and try again.'
      )
    }
  }

  if (errorMsg) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h2 style={s.title}>Verification Required</h2>
          <div style={s.err}>{errorMsg}</div>
          <button style={s.altBtn} onClick={() => navigate(returnTo)}>
            ← Go back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={s.card}>
        <div style={s.shield}>🔐</div>
        <h2 style={s.title}>Verify Your Identity</h2>
        <p style={s.sub}>
          Redirecting to IBM Verify for MFA…<br />
          <span style={s.hint}>You will be prompted for your second factor.</span>
        </p>
        <div style={s.spinner} />
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', background: '#f7f8fa',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
  },
  card: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px',
    padding: '2.5rem 2rem', textAlign: 'center', width: '100%', maxWidth: '360px',
    display: 'flex', flexDirection: 'column', gap: '0.75rem',
  },
  shield: { fontSize: '2.5rem' },
  title: { margin: '0', fontSize: '1.2rem', fontWeight: 700, color: '#1f2328' },
  sub: { color: '#57606a', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 },
  hint: { color: '#9ca3af', fontSize: '0.78rem' },
  spinner: {
    width: '32px', height: '32px', margin: '0.25rem auto',
    border: '3px solid #e5e7eb', borderTopColor: '#3b82d4',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  err: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    borderRadius: '6px', padding: '0.6rem 0.75rem', fontSize: '0.85rem',
  },
  altBtn: {
    width: '100%', background: 'transparent', border: 'none',
    color: '#57606a', cursor: 'pointer', fontSize: '0.82rem', padding: '0.25rem 0',
  },
}

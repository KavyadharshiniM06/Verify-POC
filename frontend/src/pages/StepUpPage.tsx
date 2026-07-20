/**
 * StepUpPage — shows the user's enrolled MFA methods, then redirects
 * to IBM Verify's OIDC step-up flow which challenges the second factor.
 *
 * IBM Verify's factor /verifications API requires a user-context token that
 * cannot be obtained server-side (ROPC is blocked by adaptive access).
 * The only reliable path is the OIDC redirect: IBM Verify challenges the
 * user's enrolled second factor on its own hosted page (or silently via
 * browser WebAuthn for passkeys), then returns a code we exchange for a
 * new JWT with stepup_verified=true.
 *
 * Flow:
 *   1. GET  /auth/stepup/methods         → show enrolled factors to the user
 *   2. User clicks "Continue"
 *   3. POST /auth/sso/stepup/initiate    → get authorization_url
 *   4. Browser redirects to IBM Verify  → second factor challenged
 *   5. IBM Verify redirects → /stepup-callback
 *   6. StepUpCallbackPage exchanges code → new JWT → back to returnTo
 */
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

type Phase = 'loading' | 'ready' | 'redirecting' | 'error'

interface MethodOption {
  method: string
  label: string
  icon: string
  description: string
}

export default function StepUpPage() {
  const [searchParams] = useSearchParams()
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const returnTo = searchParams.get('return_to') ?? '/transfers'

  const [phase, setPhase] = useState<Phase>('loading')
  const [methods, setMethods] = useState<MethodOption[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  const calledRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  useEffect(() => {
    if (!isAuthenticated || calledRef.current) return
    calledRef.current = true
    void fetchMethods()
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMethods() {
    try {
      const { data } = await api.get('/auth/stepup/methods')
      setMethods(data.methods)
      setPhase('ready')
    } catch {
      setErrorMsg('Could not load your MFA methods. Please try again.')
      setPhase('error')
    }
  }

  async function initiateRedirect() {
    setPhase('redirecting')
    try {
      const idTokenHint = sessionStorage.getItem('mb_ibm_id_token') ?? ''
      const { data } = await api.post('/auth/sso/stepup/initiate', {
        return_to: returnTo,
        id_token_hint: idTokenHint,
      })
      sessionStorage.setItem('mb_stepup_token', data.step_up_token)
      sessionStorage.setItem('mb_stepup_return_to', returnTo)
      window.location.href = data.authorization_url
    } catch {
      setErrorMsg('Could not start MFA challenge. Please try again.')
      setPhase('error')
    }
  }

  return (
    <div style={s.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={s.card}>
        <div style={s.lockIcon}>🔐</div>
        <h2 style={s.title}>Additional Verification Required</h2>
        <p style={s.sub}>
          Transfers above $100 require a second factor.
        </p>

        {/* Loading */}
        {phase === 'loading' && (
          <div style={s.centered}>
            <div style={s.spinner} />
            <p style={s.hint}>Checking your enrolled methods…</p>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <>
            <div style={s.err}>{errorMsg}</div>
            <button style={s.primaryBtn} onClick={() => { calledRef.current = false; setPhase('loading'); void fetchMethods() }}>
              Retry
            </button>
          </>
        )}

        {/* Ready — show enrolled methods and a single Continue button */}
        {phase === 'ready' && (
          <>
            <p style={s.sectionLabel}>Your enrolled verification methods:</p>
            <div style={s.methodList}>
              {methods.map(opt => (
                <div key={opt.method} style={s.methodRow}>
                  <span style={s.methodIcon}>{opt.icon}</span>
                  <span style={s.methodText}>
                    <span style={s.methodLabel}>{opt.label}</span>
                    <span style={s.methodDesc}>{opt.description}</span>
                  </span>
                </div>
              ))}
            </div>
            <p style={s.hint}>
              IBM Verify will challenge you with your second factor.
            </p>
            <button style={s.primaryBtn} onClick={initiateRedirect}>
              Continue to Verify →
            </button>
          </>
        )}

        {/* Redirecting */}
        {phase === 'redirecting' && (
          <div style={s.centered}>
            <div style={s.spinner} />
            <p style={s.hint}>Redirecting to IBM Verify…</p>
          </div>
        )}

        <button style={s.cancelBtn} onClick={() => navigate(returnTo)}>
          Cancel
        </button>
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
    padding: '2rem 1.75rem', width: '100%', maxWidth: '400px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem',
  },
  lockIcon: { fontSize: '2rem' },
  title: { margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1f2328', textAlign: 'center' },
  sub: { margin: 0, color: '#57606a', fontSize: '0.85rem', textAlign: 'center' },
  centered: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 0' },
  spinner: {
    width: '26px', height: '26px',
    border: '3px solid #e5e7eb', borderTopColor: '#3b82d4',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  hint: { color: '#9ca3af', fontSize: '0.78rem', margin: 0, textAlign: 'center' },
  err: {
    width: '100%', background: '#fef2f2', border: '1px solid #fecaca',
    color: '#dc2626', borderRadius: '6px', padding: '0.6rem 0.75rem',
    fontSize: '0.83rem', boxSizing: 'border-box' as const, textAlign: 'center',
  },
  sectionLabel: {
    margin: '0.25rem 0 0', alignSelf: 'flex-start',
    color: '#57606a', fontSize: '0.8rem', fontWeight: 600,
  },
  methodList: { width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  methodRow: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.75rem 1rem', background: '#f7f8fa',
    border: '1px solid #e5e7eb', borderRadius: '10px',
  },
  methodIcon: { fontSize: '1.4rem', flexShrink: 0 },
  methodText: { display: 'flex', flexDirection: 'column', gap: '0.1rem' },
  methodLabel: { fontWeight: 600, fontSize: '0.88rem', color: '#1f2328' },
  methodDesc: { fontSize: '0.74rem', color: '#57606a' },
  primaryBtn: {
    width: '100%', padding: '0.75rem', background: '#3b82d4', color: '#fff',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontWeight: 600, fontSize: '0.95rem',
  },
  cancelBtn: {
    background: 'transparent', border: 'none', color: '#9ca3af',
    cursor: 'pointer', fontSize: '0.78rem', marginTop: '0.1rem',
  },
}

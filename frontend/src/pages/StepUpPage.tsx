import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { T } from '../styles/theme'

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
      setErrorMsg('Could not load your verification methods. Please try again.')
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
      setErrorMsg('Could not start verification challenge. Please try again.')
      setPhase('error')
    }
  }

  return (
    <div style={s.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header bar */}
      <div style={s.topBar}>
        <div style={s.brandMark}>
          <div style={s.brandIcon}>M</div>
          <span style={s.brandName}>MockBank</span>
        </div>
        <div style={s.secureTag}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Secure session
        </div>
      </div>

      <div style={s.body}>
        <div style={s.card}>

          {/* Shield icon */}
          <div style={s.shieldWrap}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>

          <h2 style={s.title}>Verify Your Identity</h2>
          <p style={s.sub}>
            For your security, transfers above $100 require an additional verification step before proceeding.
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

          {/* Ready */}
          {phase === 'ready' && (
            <>
              <div style={s.infoBox}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>A second-factor challenge will be required to authorise this transaction.</span>
              </div>

              <button style={s.primaryBtn} onClick={initiateRedirect}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Continue
              </button>
            </>
          )}

          {/* Redirecting */}
          {phase === 'redirecting' && (
            <div style={s.centered}>
              <div style={s.spinner} />
              <p style={s.hint}>Launching secure verification…</p>
            </div>
          )}

          <button style={s.cancelBtn} onClick={() => navigate(returnTo)}>
            Cancel and go back
          </button>

          <div style={s.footer}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.inkLight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>Protected by 256-bit TLS encryption</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', background: T.bg,
    display: 'flex', flexDirection: 'column',
    fontFamily: T.fontFamily,
  },
  topBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1rem 1.75rem', borderBottom: `1px solid ${T.border}`,
    background: T.bgCard,
  },
  brandMark: { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  brandIcon: {
    width: '30px', height: '30px', borderRadius: '7px',
    background: T.amber, color: '#0d1117',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: '0.9rem',
  },
  brandName: { fontSize: '0.95rem', fontWeight: 700, color: T.ink, letterSpacing: '-0.01em' },
  secureTag: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    fontSize: '0.72rem', fontWeight: 600, color: T.green,
    background: T.greenLight, border: `1px solid ${T.greenBorder}`,
    borderRadius: '999px', padding: '0.2rem 0.65rem',
  },

  body: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem',
  },
  card: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '16px', padding: '2.25rem 2rem',
    width: '100%', maxWidth: '420px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
    boxShadow: T.shadowPop,
  },

  shieldWrap: {
    width: '56px', height: '56px', borderRadius: '14px',
    background: T.amberLight, border: `1px solid ${T.amberBorder}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  title: { margin: 0, fontSize: '1.2rem', fontWeight: 800, color: T.ink, textAlign: 'center', letterSpacing: '-0.02em' },
  sub: { margin: 0, color: T.inkSub, fontSize: '0.84rem', textAlign: 'center', lineHeight: 1.55 },

  centered: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', padding: '0.75rem 0' },
  spinner: {
    width: '28px', height: '28px',
    border: `3px solid ${T.border}`, borderTopColor: T.amber,
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  hint: { color: T.inkSub, fontSize: '0.78rem', margin: 0, textAlign: 'center' },

  err: {
    width: '100%', background: T.redLight, border: `1px solid ${T.redBorder}`,
    color: T.red, borderRadius: T.radiusInner, padding: '0.65rem 0.85rem',
    fontSize: '0.83rem', boxSizing: 'border-box' as const, textAlign: 'center',
  },

  infoBox: {
    width: '100%', display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
    padding: '0.7rem 0.85rem', background: T.amberLight,
    border: `1px solid ${T.amberBorder}`, borderRadius: T.radiusInner,
    fontSize: '0.77rem', color: T.amber, lineHeight: 1.5, boxSizing: 'border-box' as const,
  },

  primaryBtn: {
    width: '100%', padding: '0.8rem', background: T.amber, color: '#0d1117',
    border: 'none', borderRadius: T.radiusBtn, cursor: 'pointer',
    fontWeight: 700, fontSize: '0.92rem', fontFamily: T.fontFamily,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
  },
  cancelBtn: {
    background: 'transparent', border: 'none', color: T.inkSub,
    cursor: 'pointer', fontSize: '0.8rem', fontFamily: T.fontFamily,
    marginTop: '-0.25rem',
  },
  footer: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    fontSize: '0.68rem', color: T.inkLight, marginTop: '-0.25rem',
  },
}

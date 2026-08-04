/**
 * StepUpPage — inline MFA step-up challenge.
 *
 * Loads the user's enrolled second factors from /auth/stepup/methods and
 * presents them as tiles.  The user picks one and completes the challenge
 * inline — no redirect to IBM Verify.
 *
 * On success, issues a fresh JWT with stepup_verified=true and navigates
 * back to return_to.
 *
 * Backend routes used:
 *   GET  /auth/stepup/methods          → list enrolled factors
 *   POST /auth/stepup/begin            → initiate chosen factor challenge
 *   GET  /auth/stepup/poll/{tx_id}     → push polling
 *   POST /auth/stepup/complete         → verify + issue step-up JWT
 */
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { T } from '../styles/theme'

// ── Types ──────────────────────────────────────────────────────────────────

type Phase =
  | 'loading'           // fetching enrolled methods
  | 'pick'              // showing method tiles
  | 'push_waiting'      // waiting for push approval
  | 'totp_entry'        // entering TOTP code
  | 'email_entry'       // entering email OTP code
  | 'verifying'         // submitting to /complete
  | 'error'

interface MethodMeta {
  method: string
  label: string
  icon: string
  description: string
}

const POLL_INTERVAL_MS = 2000
const PUSH_TIMEOUT_MS  = 60000

// ── Component ──────────────────────────────────────────────────────────────

export default function StepUpPage() {
  const [searchParams] = useSearchParams()
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const returnTo = searchParams.get('return_to') ?? '/transfers'

  const [phase, setPhase]             = useState<Phase>('loading')
  const [methods, setMethods]         = useState<MethodMeta[]>([])
  const [selected, setSelected]       = useState<MethodMeta | null>(null)
  const [txId, setTxId]               = useState<string>('')
  const [otpCode, setOtpCode]         = useState('')
  const [errorMsg, setErrorMsg]       = useState('')
  const [pushDenied, setPushDenied]   = useState(false)

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const calledRef  = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  useEffect(() => {
    if (!isAuthenticated || calledRef.current) return
    calledRef.current = true
    void loadMethods()
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup poll timers on unmount
  useEffect(() => () => stopPoll(), [])

  // ── Helpers ────────────────────────────────────────────────────────────

  function stopPoll() {
    if (pollRef.current)    clearInterval(pollRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  async function loadMethods() {
    try {
      const { data } = await api.get('/auth/stepup/methods')
      setMethods(data.methods ?? [])
      setPhase('pick')
    } catch {
      setErrorMsg('Could not load your verification methods. Please try again.')
      setPhase('error')
    }
  }

  async function handleSelectMethod(m: MethodMeta) {
    setSelected(m)
    setErrorMsg('')
    setOtpCode('')
    setPushDenied(false)
    try {
      const { data } = await api.post('/auth/stepup/begin', { preferred_method: m.method })
      setTxId(data.transaction_id ?? '')

      if (m.method === 'push') {
        setPhase('push_waiting')
        startPushPoll(data.transaction_id)
      } else if (m.method === 'totp') {
        setPhase('totp_entry')
      } else if (m.method === 'email_otp') {
        setPhase('email_entry')
      } else if (m.method === 'fido2') {
        // fido2 returns WebAuthn assertion options — not handled inline here,
        // fall through to OIDC redirect for passkey challenges
        await initiateOidcRedirect()
      }
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErrorMsg(detail ?? `Could not start ${m.label} challenge. Please try another method.`)
      setPhase('pick')
    }
  }

  function startPushPoll(transactionId: string) {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/auth/stepup/poll/${transactionId}`)
        if (data.status === 'approved') {
          stopPoll()
          await completeStepUp('push', transactionId)
        } else if (data.status === 'denied') {
          stopPoll()
          setPushDenied(true)
        }
      } catch {
        stopPoll()
        setErrorMsg('Connection error while waiting for push. Please try again.')
        setPhase('pick')
      }
    }, POLL_INTERVAL_MS)

    timeoutRef.current = setTimeout(() => {
      stopPoll()
      setErrorMsg('Push request timed out after 60 seconds. Please try again.')
      setPhase('pick')
    }, PUSH_TIMEOUT_MS)
  }

  async function completeStepUp(method: string, transactionId: string, code?: string) {
    setPhase('verifying')
    try {
      const body: Record<string, unknown> = { method, transaction_id: transactionId }
      if (code) body.otp_code = code
      const { data } = await api.post('/auth/stepup/complete', body)
      login(data.token, data.user, true, null)
      navigate(returnTo, { replace: true })
    } catch {
      setErrorMsg('Verification failed. Please check your code and try again.')
      setPhase(method === 'totp' ? 'totp_entry' : method === 'email_otp' ? 'email_entry' : 'pick')
    }
  }

  async function initiateOidcRedirect() {
    setPhase('verifying')
    try {
      const storedHint = sessionStorage.getItem('mb_ibm_id_token') ?? ''
      const body: Record<string, string> = { return_to: returnTo }
      if (storedHint) body.id_token_hint = storedHint
      const { data } = await api.post('/auth/sso/stepup/initiate', body)
      sessionStorage.setItem('mb_stepup_token', data.step_up_token)
      sessionStorage.setItem('mb_stepup_return_to', returnTo)
      window.location.href = data.authorization_url
    } catch {
      setErrorMsg('Could not start verification challenge. Please try again.')
      setPhase('pick')
    }
  }

  function handleBack() {
    stopPoll()
    setSelected(null)
    setTxId('')
    setOtpCode('')
    setErrorMsg('')
    setPushDenied(false)
    setPhase('pick')
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={s.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Top bar */}
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

          {/* Shield icon — shown on all phases */}
          <div style={s.shieldWrap}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>

          {/* ── Loading ──────────────────────────────────────────────── */}
          {phase === 'loading' && (
            <>
              <h2 style={s.title}>Verify Your Identity</h2>
              <div style={s.centered}>
                <div style={s.spinner} />
                <p style={s.hint}>Checking your enrolled methods…</p>
              </div>
            </>
          )}

          {/* ── Error ────────────────────────────────────────────────── */}
          {phase === 'error' && (
            <>
              <h2 style={s.title}>Verify Your Identity</h2>
              <div style={s.err}>{errorMsg}</div>
              <button style={s.primaryBtn} onClick={() => { calledRef.current = false; setPhase('loading'); void loadMethods() }}>
                Retry
              </button>
            </>
          )}

          {/* ── Pick method ──────────────────────────────────────────── */}
          {phase === 'pick' && (
            <>
              <h2 style={s.title}>Verify Your Identity</h2>
              <p style={s.sub}>
                This action requires an additional verification step. Choose your method below.
              </p>

              {errorMsg && <div style={s.err}>{errorMsg}</div>}

              <div style={s.methodList}>
                {methods.map(m => (
                  <button
                    key={m.method}
                    style={s.methodCard}
                    onClick={() => void handleSelectMethod(m)}
                  >
                    <span style={s.methodIcon}>{m.icon}</span>
                    <div style={s.methodText}>
                      <div style={s.methodName}>{m.label}</div>
                      <div style={s.methodDesc}>{m.description}</div>
                    </div>
                    <span style={s.chevron}>›</span>
                  </button>
                ))}
              </div>

              <button style={s.cancelBtn} onClick={() => navigate(returnTo)}>
                Cancel and go back
              </button>
            </>
          )}

          {/* ── Push waiting ─────────────────────────────────────────── */}
          {phase === 'push_waiting' && (
            <>
              <h2 style={s.title}>📱 Check Your Phone</h2>

              {!pushDenied ? (
                <div style={s.centered}>
                  <div style={s.spinner} />
                  <p style={s.pushMsg}>Waiting for approval on your device…</p>
                  <p style={s.sub}>Open IBM Verify and tap <strong>Approve</strong>.</p>
                  <button style={s.ghostBtn} onClick={() => { stopPoll(); handleBack() }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div style={s.err}>Push request was denied on your device.</div>
                  <button style={s.primaryBtn} onClick={handleBack}>
                    Try a different method
                  </button>
                </>
              )}
            </>
          )}

          {/* ── TOTP entry ───────────────────────────────────────────── */}
          {phase === 'totp_entry' && (
            <>
              <button style={s.backBtn} onClick={handleBack}>← Back</button>
              <h2 style={s.title}>🔢 Authenticator Code</h2>
              <p style={s.sub}>
                Enter the 6-digit code from your authenticator app.
              </p>
              {errorMsg && <div style={s.err}>{errorMsg}</div>}
              <input
                style={s.otpInput}
                placeholder="000000"
                maxLength={6}
                autoFocus
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && otpCode.length === 6 && void completeStepUp('totp', txId, otpCode)}
              />
              <button
                style={s.primaryBtn}
                disabled={otpCode.length !== 6}
                onClick={() => void completeStepUp('totp', txId, otpCode)}
              >
                Verify →
              </button>
            </>
          )}

          {/* ── Email OTP entry ──────────────────────────────────────── */}
          {phase === 'email_entry' && (
            <>
              <button style={s.backBtn} onClick={handleBack}>← Back</button>
              <h2 style={s.title}>📧 Email Code</h2>
              <p style={s.sub}>
                A code was sent to your email address. Enter it below.
              </p>
              {errorMsg && <div style={s.err}>{errorMsg}</div>}
              <input
                style={s.otpInput}
                placeholder="······"
                maxLength={8}
                autoFocus
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.trim())}
                onKeyDown={e => e.key === 'Enter' && otpCode.length >= 4 && void completeStepUp('email_otp', txId, otpCode)}
              />
              <button
                style={s.primaryBtn}
                disabled={otpCode.length < 4}
                onClick={() => void completeStepUp('email_otp', txId, otpCode)}
              >
                Verify →
              </button>
              <button style={s.ghostBtn} onClick={() => { setOtpCode(''); void handleSelectMethod(selected!) }}>
                Resend code
              </button>
            </>
          )}

          {/* ── Verifying ────────────────────────────────────────────── */}
          {phase === 'verifying' && (
            <>
              <h2 style={s.title}>Verifying…</h2>
              <div style={s.centered}>
                <div style={s.spinner} />
                <p style={s.hint}>Checking your response with IBM Verify…</p>
              </div>
            </>
          )}

          {/* Footer lock icon — always shown */}
          {phase !== 'loading' && phase !== 'verifying' && (
            <div style={s.footer}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.inkLight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span>Protected by 256-bit TLS encryption</span>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

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
    width: '100%', maxWidth: '440px',
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

  // Method picker
  methodList: { display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' },
  methodCard: {
    display: 'flex', alignItems: 'center', gap: '0.9rem',
    background: T.bgMuted, border: `1px solid ${T.border}`, borderRadius: '10px',
    padding: '0.9rem 1rem', cursor: 'pointer', textAlign: 'left', width: '100%',
    fontFamily: T.fontFamily,
  },
  methodIcon:  { fontSize: '1.4rem', flexShrink: 0 },
  methodText:  { flex: 1 },
  methodName:  { fontSize: '0.92rem', fontWeight: 700, color: T.ink, marginBottom: '0.15rem' },
  methodDesc:  { fontSize: '0.78rem', color: T.inkSub, lineHeight: 1.4 },
  chevron:     { fontSize: '1.2rem', color: T.inkSub, flexShrink: 0 },

  // Buttons
  primaryBtn: {
    width: '100%', padding: '0.8rem', background: T.amber, color: '#0d1117',
    border: 'none', borderRadius: T.radiusBtn, cursor: 'pointer',
    fontWeight: 700, fontSize: '0.92rem', fontFamily: T.fontFamily,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
  },
  ghostBtn: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: T.inkSub, fontSize: '0.82rem', fontFamily: T.fontFamily, padding: '0.3rem 0',
  },
  cancelBtn: {
    background: 'transparent', border: 'none', color: T.inkSub,
    cursor: 'pointer', fontSize: '0.8rem', fontFamily: T.fontFamily,
  },
  backBtn: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: T.inkSub, fontSize: '0.85rem', padding: '0 0 0.5rem', display: 'block',
    alignSelf: 'flex-start', fontFamily: T.fontFamily,
  },

  // OTP input
  otpInput: {
    width: '100%', padding: '0.75rem', borderRadius: T.radiusInput,
    border: `1px solid ${T.border}`, background: T.bgInput, color: T.ink,
    fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.5rem',
    boxSizing: 'border-box' as const, fontFamily: T.fontFamily,
  },

  // Push waiting
  centered: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0' },
  pushMsg:  { fontWeight: 700, color: T.ink, margin: 0, fontSize: '0.95rem', textAlign: 'center' },
  spinner: {
    width: '44px', height: '44px',
    border: `4px solid ${T.border}`, borderTopColor: T.amber,
    borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '0.5rem',
  },
  hint: { color: T.inkSub, fontSize: '0.78rem', margin: 0, textAlign: 'center' },

  err: {
    width: '100%', background: T.redLight, border: `1px solid ${T.redBorder}`,
    color: T.red, borderRadius: T.radiusInner, padding: '0.65rem 0.85rem',
    fontSize: '0.83rem', boxSizing: 'border-box' as const, textAlign: 'center',
  },
  footer: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    fontSize: '0.68rem', color: T.inkLight,
  },
}

/**
 * MfaVerifyPage — unified MFA verification picker.
 *
 * Shows whichever of the three in-app MFA methods the user has enrolled:
 *   • Email OTP      — send code → enter code
 *   • TOTP           — start challenge → enter 6-digit authenticator code
 *   • IBM Verify Push — send push → poll for approval → complete
 *
 * Accessible at /mfa.  Also linked from the standalone EmailOTPPage,
 * TOTPVerifyPage, and PushLoginPage as "Use a different method".
 *
 * All API calls reuse the existing backend routes — no backend changes needed.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { QRCodeSVG } from 'qrcode.react'
import api from '../api/axios'

// ── Types ──────────────────────────────────────────────────────────────────

type MethodKey = 'email_otp' | 'totp' | 'push'
type WizardStep = 'pick' | 'verify' | 'done'

interface MeResponse {
  id: string
  email: string
  name: string
  role: string
  enrolled_factors: {
    fido2: boolean | object[]
    totp: boolean | object[]
    push: boolean | object[]
    email_otp: boolean | object[]
  }
}

// ── Method metadata ────────────────────────────────────────────────────────

const METHODS: Array<{
  key: MethodKey
  icon: string
  name: string
  tagline: string
  hint: string
}> = [
  {
    key: 'email_otp',
    icon: '📧',
    name: 'Email OTP',
    tagline: 'One-time code to your inbox',
    hint: 'We will send a code to your registered email address.',
  },
  {
    key: 'totp',
    icon: '🔢',
    name: 'Authenticator App',
    tagline: 'Google Authenticator · Authy · IBM Verify App',
    hint: 'Open your authenticator app and enter the 6-digit code.',
  },
  {
    key: 'push',
    icon: '📱',
    name: 'IBM Verify Push',
    tagline: 'IBM Verify Mobile App',
    hint: 'A push notification will be sent to your phone — tap Approve.',
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

/** Read the JWT sub (verify_user_id) from sessionStorage without verifying. */
function getSubFromToken(): string | null {
  try {
    const token = sessionStorage.getItem('mb_token')
    if (!token) return null
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    )
    return (payload.sub as string) ?? null
  } catch {
    return null
  }
}

/** Return true if the enrolled_factors entry indicates at least one device. */
function isEnrolled(val: boolean | object[] | undefined): boolean {
  if (Array.isArray(val)) return val.length > 0
  return Boolean(val)
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MfaVerifyPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('return_to') ?? '/dashboard'

  // Seed from JWT immediately so we don't need to wait for /users/me
  const [verifyUserId, setVerifyUserId] = useState<string | null>(() => getSubFromToken())
  const [userEmail, setUserEmail] = useState<string>('')

  const [step, setStep] = useState<WizardStep>('pick')
  const [selected, setSelected] = useState<MethodKey | null>(null)
  const [availableMethods, setAvailableMethods] = useState<MethodKey[]>(['email_otp', 'totp', 'push'])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // ── TOTP state ──────────────────────────────────────────────────────────
  const [totpUri, setTotpUri]         = useState('')
  const [totpSecret, setTotpSecret]   = useState('')
  const [totpTxId, setTotpTxId]       = useState('')
  const [totpCode, setTotpCode]       = useState('')

  // ── Email OTP state ─────────────────────────────────────────────────────
  const [emailTxId, setEmailTxId]     = useState('')
  const [emailCode, setEmailCode]     = useState('')
  const [emailSent, setEmailSent]     = useState(false)

  // ── Push state ──────────────────────────────────────────────────────────
  const [pushStatus, setPushStatus]   = useState<'idle' | 'waiting' | 'denied' | 'timeout'>('idle')
  const pushPollRef                   = useRef<ReturnType<typeof setInterval> | null>(null)
  const pushTimeoutRef                = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Redirect unauthenticated users ────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  // ── Load user details + enrolled factors ──────────────────────────────
  useEffect(() => {
    api.get<MeResponse>('/users/me')
      .then(({ data }) => {
        setVerifyUserId(data.id)
        setUserEmail(data.email)
        const ef = data.enrolled_factors
        const available: MethodKey[] = (
          [
            isEnrolled(ef.email_otp) ? 'email_otp' : null,
            isEnrolled(ef.totp)      ? 'totp'      : null,
            isEnrolled(ef.push)      ? 'push'      : null,
          ] as Array<MethodKey | null>
        ).filter((k): k is MethodKey => k !== null)
        // Always show at least email_otp as a fallback even if IBM Verify
        // doesn't report it yet (email_otp is always available after first login)
        if (available.length === 0) available.push('email_otp')
        setAvailableMethods(available)
      })
      .catch(() => {
        // Non-fatal — fall back to showing all three methods
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup push timers on unmount
  useEffect(() => () => stopPush(), [])

  // ── Helpers ────────────────────────────────────────────────────────────

  function stopPush() {
    if (pushPollRef.current)    clearInterval(pushPollRef.current)
    if (pushTimeoutRef.current) clearTimeout(pushTimeoutRef.current)
  }

  function handleSelectMethod(key: MethodKey) {
    setSelected(key)
    setError(null)
    setStep('verify')
    // Auto-send email OTP and start TOTP challenge when the method is selected
    if (key === 'email_otp') void sendEmailOtp(key)
    if (key === 'totp')      void startTotpChallenge()
  }

  function handleBack() {
    stopPush()
    setSelected(null)
    setStep('pick')
    setError(null)
    setTotpCode('')
    setTotpUri('')
    setTotpSecret('')
    setTotpTxId('')
    setEmailCode('')
    setEmailSent(false)
    setPushStatus('idle')
  }

  function finishVerification(token: string, updatedUser: { name: string; email: string; role: string }) {
    login(token, updatedUser, false, null)
    setStep('done')
  }

  // ── Email OTP ──────────────────────────────────────────────────────────

  async function sendEmailOtp(_key?: MethodKey) {
    if (!verifyUserId) { setError('Session not ready — please wait and try again.'); return }
    setLoading(true); setError(null)
    try {
      const ibmToken = sessionStorage.getItem('mb_ibm_access_token') ?? undefined
      const { data } = await api.post('/auth/email-otp/send', {
        verify_user_id: verifyUserId,
        email: userEmail,
        ibm_access_token: ibmToken,
      })
      setEmailTxId(data.transaction_id)
      setEmailSent(true)
    } catch {
      setError('Failed to send code. Please try again.')
    } finally { setLoading(false) }
  }

  async function verifyEmailOtp() {
    if (emailCode.length < 4) { setError('Enter the code from your email'); return }
    if (!verifyUserId) { setError('Session not ready.'); return }
    setLoading(true); setError(null)
    try {
      const ibmToken = sessionStorage.getItem('mb_ibm_access_token') ?? undefined
      const { data } = await api.post('/auth/email-otp/verify', {
        verify_user_id: verifyUserId,
        transaction_id: emailTxId,
        otp_code: emailCode,
        email: userEmail,
        ibm_access_token: ibmToken,
      })
      finishVerification(data.token, data.user)
    } catch {
      setError('Invalid or expired code. Request a new one.')
    } finally { setLoading(false) }
  }

  // ── TOTP ────────────────────────────────────────────────────────────────

  async function startTotpChallenge() {
    if (!verifyUserId) { setError('Session not ready.'); return }
    setLoading(true); setError(null)
    try {
      const ibmToken = sessionStorage.getItem('mb_ibm_access_token') ?? undefined
      const { data } = await api.post('/auth/totp/enroll', {
        verify_user_id: verifyUserId,
        ibm_access_token: ibmToken,
      })
      setTotpTxId(data.transaction_id)
      // IBM Verify may return an otpauth URI — show QR only when it does
      setTotpUri(data.otp_uri ?? '')
      setTotpSecret(data.secret ?? '')
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Could not start TOTP challenge. Please try again.')
    } finally { setLoading(false) }
  }

  async function confirmTotp() {
    if (totpCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return }
    if (!verifyUserId) { setError('Session not ready.'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/auth/totp/verify', {
        verify_user_id: verifyUserId,
        transaction_id: totpTxId,
        otp_code: totpCode,
      })
      finishVerification(data.token, data.user)
    } catch {
      setError('Invalid code — check the time on your device and try again.')
    } finally { setLoading(false) }
  }

  // ── Push ────────────────────────────────────────────────────────────────

  async function startPush() {
    if (!verifyUserId) { setError('Session not ready.'); return }
    setError(null)
    try {
      const { data } = await api.post('/auth/push/initiate', { verify_user_id: verifyUserId })
      const txId: string = data.transaction_id
      setPushStatus('waiting')

      pushPollRef.current = setInterval(async () => {
        try {
          const { data: poll } = await api.get(`/auth/push/poll/${txId}`)
          if (poll.status === 'approved') {
            stopPush()
            const { data: auth } = await api.post('/auth/push/complete', {
              verify_user_id: verifyUserId,
              transaction_id: txId,
            })
            finishVerification(auth.token, auth.user)
          } else if (poll.status === 'denied') {
            stopPush()
            setPushStatus('denied')
          }
        } catch {
          stopPush()
          setError('Connection error while polling. Please try again.')
          setPushStatus('idle')
        }
      }, 2000)

      pushTimeoutRef.current = setTimeout(() => { stopPush(); setPushStatus('timeout') }, 60000)
    } catch {
      setError('Could not reach your device. Ensure the IBM Verify app is enrolled for this account.')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const visibleMethods = METHODS.filter(m => availableMethods.includes(m.key))

  return (
    <div style={s.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={s.card}>

        {/* ── Step: pick ──────────────────────────────────────────── */}
        {step === 'pick' && (
          <>
            <div style={s.logoRow}>🔐</div>
            <h1 style={s.title}>Verify your identity</h1>
            <p style={s.sub}>
              Choose a verification method to continue.
            </p>

            <div style={s.methodList}>
              {visibleMethods.map(m => (
                <button
                  key={m.key}
                  style={s.methodCard}
                  onClick={() => handleSelectMethod(m.key)}
                >
                  <span style={s.methodIcon}>{m.icon}</span>
                  <div style={s.methodText}>
                    <div style={s.methodName}>{m.name}</div>
                    <div style={s.methodTagline}>{m.tagline}</div>
                    <div style={s.methodHint}>{m.hint}</div>
                  </div>
                  <span style={s.chevron}>›</span>
                </button>
              ))}
            </div>

            <button style={s.cancelBtn} onClick={() => navigate(returnTo)}>
              Cancel
            </button>
          </>
        )}

        {/* ── Step: verify ────────────────────────────────────────── */}
        {step === 'verify' && selected && (() => {
          const method = METHODS.find(m => m.key === selected)!
          return (
            <>
              <button style={s.backBtn} onClick={handleBack}>← Back</button>
              <div style={s.setupIcon}>{method.icon}</div>
              <h2 style={s.setupTitle}>{method.name}</h2>

              {error && <div style={s.err}>{error}</div>}

              {/* ── Email OTP ──────────────────────────────────── */}
              {selected === 'email_otp' && (
                <>
                  {!emailSent ? (
                    <div style={s.centered}>
                      <div style={s.spinner} />
                      <p style={s.sub}>Sending code to <strong>{userEmail || 'your email'}</strong>…</p>
                    </div>
                  ) : (
                    <>
                      <p style={s.sub}>
                        A code was sent to <strong>{userEmail}</strong>. Enter it below.
                      </p>
                      <input
                        style={s.otpInput}
                        placeholder="······"
                        maxLength={8}
                        autoFocus
                        value={emailCode}
                        onChange={e => setEmailCode(e.target.value.trim())}
                        onKeyDown={e => e.key === 'Enter' && void verifyEmailOtp()}
                      />
                      <button
                        style={s.primaryBtn}
                        onClick={() => void verifyEmailOtp()}
                        disabled={loading || emailCode.length < 4}
                      >
                        {loading ? 'Verifying…' : '✓ Confirm code'}
                      </button>
                      <button
                        style={s.ghostBtn}
                        onClick={() => { setEmailCode(''); setEmailSent(false); void sendEmailOtp() }}
                        disabled={loading}
                      >
                        Resend code
                      </button>
                    </>
                  )}
                </>
              )}

              {/* ── TOTP ──────────────────────────────────────────── */}
              {selected === 'totp' && (
                <>
                  {loading && !totpTxId ? (
                    <div style={s.centered}>
                      <div style={s.spinner} />
                      <p style={s.sub}>Loading challenge…</p>
                    </div>
                  ) : totpTxId ? (
                    <>
                      <p style={s.sub}>
                        Open your authenticator app and enter the current 6-digit code.
                      </p>
                      {/* Show QR only when IBM Verify returns an otpauth URI */}
                      {totpUri && (
                        <>
                          <div style={s.qrWrap}>
                            <QRCodeSVG value={totpUri} size={160} />
                          </div>
                          {totpSecret && (
                            <p style={s.secretHint}>
                              Manual key: <code style={s.code}>{totpSecret}</code>
                            </p>
                          )}
                        </>
                      )}
                      <input
                        style={s.otpInput}
                        placeholder="000000"
                        maxLength={6}
                        autoFocus
                        value={totpCode}
                        onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={e => e.key === 'Enter' && void confirmTotp()}
                      />
                      <button
                        style={s.primaryBtn}
                        onClick={() => void confirmTotp()}
                        disabled={loading || totpCode.length !== 6}
                      >
                        {loading ? 'Verifying…' : '✓ Confirm code'}
                      </button>
                      <button
                        style={s.ghostBtn}
                        onClick={() => { setTotpCode(''); setTotpUri(''); setTotpTxId(''); void startTotpChallenge() }}
                        disabled={loading}
                      >
                        Refresh challenge
                      </button>
                    </>
                  ) : (
                    // Challenge failed to start — show retry
                    <button style={s.primaryBtn} onClick={() => void startTotpChallenge()} disabled={loading}>
                      {loading ? 'Loading…' : '🔢 Start challenge'}
                    </button>
                  )}
                </>
              )}

              {/* ── Push ──────────────────────────────────────────── */}
              {selected === 'push' && (
                <>
                  {pushStatus === 'idle' && (
                    <>
                      <p style={s.sub}>
                        Tap below to send a push notification to your IBM Verify app,
                        then tap <strong>Approve</strong> on your phone.
                      </p>
                      <button style={s.primaryBtn} onClick={() => void startPush()}>
                        📱 Send push notification
                      </button>
                    </>
                  )}

                  {pushStatus === 'waiting' && (
                    <div style={s.pushWaiting}>
                      <div style={s.spinner} />
                      <p style={s.pushMsg}>Waiting for approval…</p>
                      <p style={s.sub}>
                        Check your IBM Verify app and tap <strong>Approve</strong>.
                      </p>
                      <button
                        style={s.ghostBtn}
                        onClick={() => { stopPush(); setPushStatus('idle') }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {(pushStatus === 'denied' || pushStatus === 'timeout') && (
                    <>
                      <div style={s.err}>
                        {pushStatus === 'denied'
                          ? 'The push request was denied on your device.'
                          : 'Request timed out after 60 seconds. Please try again.'}
                      </div>
                      <button style={s.primaryBtn} onClick={() => { setPushStatus('idle'); void startPush() }}>
                        Try again
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )
        })()}

        {/* ── Step: done ──────────────────────────────────────────── */}
        {step === 'done' && selected && (() => {
          const method = METHODS.find(m => m.key === selected)!
          return (
            <div style={s.doneWrap}>
              <div style={s.doneCheck}>✓</div>
              <h2 style={s.doneTitle}>Verification successful</h2>
              <p style={s.sub}>
                Identity confirmed via <strong>{method.name}</strong>.
              </p>
              <button
                style={s.primaryBtn}
                onClick={() => navigate(returnTo, { replace: true })}
              >
                Continue →
              </button>
            </div>
          )
        })()}

      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', background: '#f7f8fa',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
    fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif',
  },
  card: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px',
    padding: '2.5rem 2rem', width: '100%', maxWidth: '480px',
  },

  // Pick step
  logoRow: { fontSize: '2rem', textAlign: 'center', marginBottom: '0.5rem' },
  title: { margin: '0 0 0.4rem', fontSize: '1.4rem', fontWeight: 700, color: '#1f2328', textAlign: 'center' },
  sub: { color: '#57606a', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.25rem', textAlign: 'center' },

  methodList: { display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' },
  methodCard: {
    display: 'flex', alignItems: 'flex-start', gap: '0.9rem',
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
    padding: '1rem', cursor: 'pointer', textAlign: 'left', width: '100%',
    fontFamily: 'inherit',
  },
  methodIcon:   { fontSize: '1.5rem', flexShrink: 0, marginTop: '0.1rem' },
  methodText:   { flex: 1 },
  methodName:   { fontSize: '0.95rem', fontWeight: 700, color: '#1f2328', marginBottom: '0.15rem' },
  methodTagline:{ fontSize: '0.75rem', fontWeight: 600, color: '#3b82d4', marginBottom: '0.25rem' },
  methodHint:   { fontSize: '0.8rem', color: '#57606a', lineHeight: 1.5 },
  chevron:      { fontSize: '1.2rem', color: '#57606a', alignSelf: 'center', flexShrink: 0 },

  cancelBtn: {
    width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#57606a', fontSize: '0.82rem', padding: '0.5rem 0', fontFamily: 'inherit',
  },

  // Verify step
  backBtn: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#57606a', fontSize: '0.85rem', padding: '0 0 1rem', display: 'block',
    fontFamily: 'inherit',
  },
  setupIcon:  { fontSize: '2.5rem', textAlign: 'center', marginBottom: '0.5rem' },
  setupTitle: { margin: '0 0 1rem', fontSize: '1.2rem', fontWeight: 700, color: '#1f2328', textAlign: 'center' },

  primaryBtn: {
    width: '100%', padding: '0.8rem', background: '#3b82d4', color: '#fff',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600,
    fontSize: '0.95rem', marginBottom: '0.5rem', fontFamily: 'inherit',
  },
  ghostBtn: {
    width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#57606a', fontSize: '0.82rem', padding: '0.4rem 0', fontFamily: 'inherit',
  },
  otpInput: {
    width: '100%', padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px',
    fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.5rem',
    boxSizing: 'border-box' as const, marginBottom: '0.75rem', fontFamily: 'inherit',
  },
  qrWrap:     { display: 'flex', justifyContent: 'center', margin: '1rem 0' },
  secretHint: { fontSize: '0.75rem', color: '#57606a', textAlign: 'center', marginBottom: '0.75rem', wordBreak: 'break-all' as const },
  code:       { fontFamily: 'monospace', background: '#f7f8fa', padding: '0.1rem 0.3rem', borderRadius: '4px' },
  err: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    borderRadius: '6px', padding: '0.6rem 0.75rem', fontSize: '0.85rem', marginBottom: '0.75rem',
  },
  centered: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.75rem 0' },
  spinner: {
    width: '44px', height: '44px', border: '4px solid #e5e7eb', borderTopColor: '#3b82d4',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '1rem',
  },

  // Push waiting
  pushWaiting: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.5rem 0' },
  pushMsg: { fontWeight: 600, color: '#1f2328', margin: '0 0 0.25rem', fontSize: '0.95rem' },

  // Done step
  doneWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.5rem 0' },
  doneCheck: {
    width: '56px', height: '56px', borderRadius: '50%', background: '#dcfce7',
    color: '#16a34a', fontSize: '1.75rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem',
  },
  doneTitle: { margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700, color: '#1f2328' },
}

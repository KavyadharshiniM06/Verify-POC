/**
 * EnrollMethodPage — post-login authentication method setup wizard.
 *
 * Shown automatically after a user's first SSO login (no method enrolled yet),
 * or reachable any time via /enroll.
 *
 * The user picks ONE method, completes the enrollment flow inline, then lands
 * on /dashboard. They can always add more methods later from the Profile page.
 *
 * All API calls use the authenticated session token — the user is already
 * logged in, so we never ask for a User ID manually.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { registerPasskey } from '../auth/fido2'
import { QRCodeSVG } from 'qrcode.react'
import api from '../api/axios'

// ── Types ──────────────────────────────────────────────────────────────────

type MethodKey = 'passkey' | 'totp' | 'push' | 'email_otp'
type WizardStep = 'pick' | 'setup' | 'done'

interface MeResponse {
  id: string
  email: string
  name: string
  role: string
  enrolled_factors: {
    fido2: boolean
    totp: boolean
    push: boolean
    email_otp: boolean
  }
}

// ── Method definitions ─────────────────────────────────────────────────────

const METHODS: Array<{
  key: MethodKey
  icon: string
  name: string
  tagline: string
  description: string
  requirement: string
}> = [
  {
    key: 'passkey',
    icon: '🪪',
    name: 'Passkey',
    tagline: 'Face ID · Touch ID · Fingerprint',
    description:
      'The fastest and most secure option. Uses your device biometrics — no code to type, no app to open.',
    requirement: 'Requires a device with biometric hardware (iPhone, Mac, Android, Windows Hello).',
  },
  {
    key: 'totp',
    icon: '🔢',
    name: 'Authenticator App',
    tagline: 'Google Authenticator · Authy · IBM Verify App',
    description:
      'Scan a QR code once with your authenticator app. Every login uses a new 6-digit code.',
    requirement: 'Requires any TOTP authenticator app installed on your phone.',
  },
  {
    key: 'push',
    icon: '📱',
    name: 'Push Notification',
    tagline: 'IBM Verify Mobile App',
    description:
      'Tap Approve on your phone when prompted. No codes to type — just one tap.',
    requirement: 'Requires the IBM Verify app installed and this account enrolled.',
  },
  {
    key: 'email_otp',
    icon: '📧',
    name: 'Email OTP',
    tagline: 'One-time code to your inbox',
    description:
      'A one-time code is sent to your registered email address at each login.',
    requirement: 'Always available — no additional setup required.',
  },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function EnrollMethodPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  // Resolved from /users/me on mount — avoids asking the user for their ID
  const [verifyUserId, setVerifyUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string>(user?.email ?? '')
  const [userName, setUserName] = useState<string>(user?.name ?? '')

  const [step, setStep] = useState<WizardStep>('pick')
  const [selected, setSelected] = useState<MethodKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // ── TOTP state ──────────────────────────────────────────────────────────
  const [totpUri, setTotpUri] = useState('')
  const [totpSecret, setTotpSecret] = useState('')
  const [totpTxId, setTotpTxId] = useState('')
  const [totpCode, setTotpCode] = useState('')

  // ── Email OTP state ─────────────────────────────────────────────────────
  const [emailTxId, setEmailTxId] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailStep, setEmailStep] = useState<'send' | 'verify'>('send')

  // ── Push state ──────────────────────────────────────────────────────────
  const [pushStatus, setPushStatus] = useState<'idle' | 'waiting' | 'denied' | 'timeout'>('idle')
  const pushPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetch verify_user_id from /users/me ────────────────────────────────
  useEffect(() => {
    api.get<MeResponse>('/users/me').then(({ data }) => {
      setVerifyUserId(data.id)
      setUserEmail(data.email)
      setUserName(data.name)
    }).catch(() => {
      // If /users/me fails, fall back to AuthContext values
      // The user is still logged in; enrollment will proceed once selected
    })
  }, [])

  // Cleanup push poll timers on unmount
  useEffect(() => () => stopPush(), [])

  // ── Helpers ────────────────────────────────────────────────────────────

  function stopPush() {
    if (pushPollRef.current) clearInterval(pushPollRef.current)
    if (pushTimeoutRef.current) clearTimeout(pushTimeoutRef.current)
  }

  function handleSkip() {
    navigate('/dashboard', { replace: true })
  }

  function handleSelectMethod(key: MethodKey) {
    setSelected(key)
    setError(null)
    setStep('setup')
  }

  function handleBack() {
    stopPush()
    setSelected(null)
    setStep('pick')
    setError(null)
    setTotpCode('')
    setEmailCode('')
    setPushStatus('idle')
    setEmailStep('send')
  }

  function finishEnrollment(token: string, updatedUser: { name: string; email: string; role: string }) {
    // Update the session with the fresh token returned by the enrollment endpoint
    login(token, updatedUser, false, null)
    setStep('done')
  }

  // ── Passkey enrollment ─────────────────────────────────────────────────

  async function enrollPasskey() {
    if (!verifyUserId) { setError('Session not ready — please wait a moment and try again.'); return }
    setLoading(true); setError(null)
    try {
      const result = await registerPasskey(verifyUserId, userEmail, userName, userEmail)
      finishEnrollment(result.token, result.user)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      // DOMException means the browser WebAuthn prompt was dismissed or hardware absent
      const isDom = e instanceof DOMException
      setError(
        isDom
          ? 'Biometric prompt was cancelled or not available on this device. Try a different method.'
          : (detail ?? 'Passkey setup failed. Ensure you are on HTTPS and your device supports biometrics.')
      )
    } finally { setLoading(false) }
  }

  // ── TOTP enrollment ────────────────────────────────────────────────────

  async function startTotpEnroll() {
    if (!verifyUserId) { setError('Session not ready — please wait a moment.'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/auth/totp/enroll', { verify_user_id: verifyUserId })
      setTotpTxId(data.transaction_id)
      setTotpUri(data.otp_uri ?? '')
      setTotpSecret(data.secret ?? '')
    } catch {
      setError('Failed to generate QR code. Please try again.')
    } finally { setLoading(false) }
  }

  async function confirmTotp() {
    if (totpCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return }
    if (!verifyUserId) { setError('Session not ready.'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/auth/totp/enroll/confirm', {
        verify_user_id: verifyUserId,
        transaction_id: totpTxId,
        otp_code: totpCode,
        email: userEmail,
        name: userName,
      })
      finishEnrollment(data.token, data.user)
    } catch {
      setError('Invalid code — check the time on your device and try again.')
    } finally { setLoading(false) }
  }

  // ── Push enrollment (no dedicated enroll — just verify the existing enrollment) ──

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
            finishEnrollment(auth.token, auth.user)
          } else if (poll.status === 'denied') {
            stopPush()
            setPushStatus('denied')
          }
        } catch { stopPush(); setError('Connection error.'); setPushStatus('idle') }
      }, 2000)

      pushTimeoutRef.current = setTimeout(() => { stopPush(); setPushStatus('timeout') }, 60000)
    } catch {
      setError('Could not reach your device. Make sure the IBM Verify app is enrolled for this account.')
    }
  }

  // ── Email OTP enrollment ───────────────────────────────────────────────

  async function sendEmailOtp() {
    if (!verifyUserId) { setError('Session not ready.'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/auth/email-otp/send', {
        verify_user_id: verifyUserId,
        email: userEmail,
      })
      setEmailTxId(data.transaction_id)
      setEmailStep('verify')
    } catch {
      setError('Failed to send code. Please try again.')
    } finally { setLoading(false) }
  }

  async function verifyEmailOtp() {
    if (emailCode.length < 4) { setError('Enter the code from your email'); return }
    if (!verifyUserId) { setError('Session not ready.'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/auth/email-otp/verify', {
        verify_user_id: verifyUserId,
        transaction_id: emailTxId,
        otp_code: emailCode,
        email: userEmail,
        name: userName,
      })
      finishEnrollment(data.token, data.user)
    } catch {
      setError('Invalid or expired code. Request a new one.')
    } finally { setLoading(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={s.container}>
      <div style={s.card}>

        {/* ── Step: pick ──────────────────────────────────────────── */}
        {step === 'pick' && (
          <>
            <div style={s.logoRow}>🏦</div>
            <h1 style={s.title}>Set up your login method</h1>
            <p style={s.sub}>
              Choose how you want to sign in next time. You can add more methods
              later from your profile.
            </p>

            <div style={s.methodList}>
              {METHODS.map(m => (
                <button
                  key={m.key}
                  style={s.methodCard}
                  onClick={() => handleSelectMethod(m.key)}
                >
                  <span style={s.methodIcon}>{m.icon}</span>
                  <div style={s.methodText}>
                    <div style={s.methodName}>{m.name}</div>
                    <div style={s.methodTagline}>{m.tagline}</div>
                    <div style={s.methodDesc}>{m.description}</div>
                  </div>
                  <span style={s.chevron}>›</span>
                </button>
              ))}
            </div>

            <button style={s.skipBtn} onClick={handleSkip}>
              Skip for now — I'll set this up from my profile
            </button>
          </>
        )}

        {/* ── Step: setup ─────────────────────────────────────────── */}
        {step === 'setup' && selected && (() => {
          const method = METHODS.find(m => m.key === selected)!
          return (
            <>
              <button style={s.backBtn} onClick={handleBack}>← Back</button>
              <div style={s.setupIcon}>{method.icon}</div>
              <h2 style={s.setupTitle}>Set up {method.name}</h2>
              <p style={s.setupRequirement}>{method.requirement}</p>

              {error && <div style={s.err}>{error}</div>}

              {/* ── Passkey ─────────────────────────────────── */}
              {selected === 'passkey' && (
                <>
                  <p style={s.sub}>
                    Your browser will prompt for biometric verification. This registers
                    your device as a trusted passkey.
                  </p>
                  <button style={s.primaryBtn} onClick={enrollPasskey} disabled={loading}>
                    {loading ? 'Opening biometric prompt…' : '🪪 Register with Biometric'}
                  </button>
                </>
              )}

              {/* ── TOTP ────────────────────────────────────── */}
              {selected === 'totp' && (
                <>
                  {!totpUri ? (
                    <>
                      <p style={s.sub}>
                        Click below to generate a QR code. Open your authenticator app
                        and scan it to link your account.
                      </p>
                      <button style={s.primaryBtn} onClick={startTotpEnroll} disabled={loading}>
                        {loading ? 'Generating QR code…' : '🔢 Generate QR Code'}
                      </button>
                    </>
                  ) : (
                    <>
                      <p style={s.sub}>
                        Scan this QR code with Google Authenticator, Authy, or the IBM Verify app.
                        Then enter the 6-digit code to confirm.
                      </p>
                      <div style={s.qrWrap}>
                        <QRCodeSVG value={totpUri} size={180} />
                      </div>
                      {totpSecret && (
                        <p style={s.secretHint}>
                          Can't scan? Manual key: <code style={s.code}>{totpSecret}</code>
                        </p>
                      )}
                      <input
                        style={s.otpInput}
                        placeholder="000000"
                        maxLength={6}
                        value={totpCode}
                        onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      />
                      <button style={s.primaryBtn} onClick={confirmTotp} disabled={loading || totpCode.length !== 6}>
                        {loading ? 'Verifying…' : '✓ Confirm code'}
                      </button>
                    </>
                  )}
                </>
              )}

              {/* ── Push ────────────────────────────────────── */}
              {selected === 'push' && (
                <>
                  {pushStatus === 'idle' && (
                    <>
                      <p style={s.sub}>
                        A push notification will be sent to your IBM Verify app.
                        Open the app and tap <strong>Approve</strong> to confirm.
                      </p>
                      <button style={s.primaryBtn} onClick={startPush}>
                        📱 Send push notification
                      </button>
                    </>
                  )}
                  {pushStatus === 'waiting' && (
                    <div style={s.pushWaiting}>
                      <div style={s.spinner} />
                      <p style={s.pushMsg}>Waiting for approval on your phone…</p>
                      <p style={s.sub}>Check your IBM Verify app and tap <strong>Approve</strong>.</p>
                      <button
                        style={{ ...s.primaryBtn, background: '#f7f8fa', color: '#57606a', border: '1px solid #e5e7eb' }}
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
                          : 'Request timed out after 60 seconds.'}
                      </div>
                      <button style={s.primaryBtn} onClick={() => setPushStatus('idle')}>
                        Try again
                      </button>
                    </>
                  )}
                </>
              )}

              {/* ── Email OTP ────────────────────────────────── */}
              {selected === 'email_otp' && (
                <>
                  {emailStep === 'send' && (
                    <>
                      <p style={s.sub}>
                        A one-time code will be sent to <strong>{userEmail}</strong>.
                        Enter it below to confirm your email and complete setup.
                      </p>
                      <button style={s.primaryBtn} onClick={sendEmailOtp} disabled={loading}>
                        {loading ? 'Sending…' : '📧 Send code to my email'}
                      </button>
                    </>
                  )}
                  {emailStep === 'verify' && (
                    <>
                      <p style={s.sub}>
                        Check your inbox at <strong>{userEmail}</strong> and enter
                        the code below.
                      </p>
                      <input
                        style={s.otpInput}
                        placeholder="······"
                        maxLength={8}
                        value={emailCode}
                        onChange={e => setEmailCode(e.target.value.trim())}
                      />
                      <button style={s.primaryBtn} onClick={verifyEmailOtp} disabled={loading}>
                        {loading ? 'Verifying…' : '✓ Confirm code'}
                      </button>
                      <button
                        style={s.skipBtn}
                        onClick={() => { setEmailStep('send'); setEmailCode('') }}
                      >
                        Resend code
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
              <h2 style={s.doneTitle}>{method.name} is set up!</h2>
              <p style={s.sub}>
                You can now sign in using {method.name}. Add more authentication
                methods any time from your profile settings.
              </p>
              <button style={s.primaryBtn} onClick={() => navigate('/dashboard', { replace: true })}>
                Go to dashboard →
              </button>
            </div>
          )
        })()}

      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', background: '#f7f8fa',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
  },
  card: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px',
    padding: '2.5rem 2rem', width: '100%', maxWidth: '480px',
  },
  logoRow: { fontSize: '2rem', textAlign: 'center', marginBottom: '0.5rem' },
  title: { margin: '0 0 0.4rem', fontSize: '1.4rem', fontWeight: 700, color: '#1f2328', textAlign: 'center' },
  sub: { color: '#57606a', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.25rem', textAlign: 'center' },

  // Method picker
  methodList: { display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' },
  methodCard: {
    display: 'flex', alignItems: 'flex-start', gap: '0.9rem',
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
    padding: '1rem', cursor: 'pointer', textAlign: 'left', width: '100%',
    transition: 'border-color 0.15s',
  },
  methodIcon: { fontSize: '1.5rem', flexShrink: 0, marginTop: '0.1rem' },
  methodText: { flex: 1 },
  methodName: { fontSize: '0.95rem', fontWeight: 700, color: '#1f2328', marginBottom: '0.15rem' },
  methodTagline: { fontSize: '0.75rem', fontWeight: 600, color: '#3b82d4', marginBottom: '0.25rem' },
  methodDesc: { fontSize: '0.8rem', color: '#57606a', lineHeight: 1.5 },
  chevron: { fontSize: '1.2rem', color: '#57606a', alignSelf: 'center', flexShrink: 0 },
  skipBtn: {
    width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#57606a', fontSize: '0.82rem', padding: '0.5rem 0',
  },

  // Setup step
  backBtn: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#57606a', fontSize: '0.85rem', padding: '0 0 1rem', display: 'block',
  },
  setupIcon: { fontSize: '2.5rem', textAlign: 'center', marginBottom: '0.5rem' },
  setupTitle: { margin: '0 0 0.25rem', fontSize: '1.2rem', fontWeight: 700, color: '#1f2328', textAlign: 'center' },
  setupRequirement: {
    fontSize: '0.78rem', color: '#57606a', background: '#f7f8fa',
    border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.5rem 0.75rem',
    marginBottom: '1.25rem', textAlign: 'center',
  },
  primaryBtn: {
    width: '100%', padding: '0.8rem', background: '#3b82d4', color: '#fff',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600,
    fontSize: '0.95rem', marginBottom: '0.5rem',
  },
  qrWrap: { display: 'flex', justifyContent: 'center', margin: '1rem 0' },
  secretHint: { fontSize: '0.75rem', color: '#57606a', textAlign: 'center', marginBottom: '0.75rem', wordBreak: 'break-all' },
  code: { fontFamily: 'monospace', background: '#f7f8fa', padding: '0.1rem 0.3rem', borderRadius: '4px' },
  otpInput: {
    width: '100%', padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px',
    fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.5rem',
    boxSizing: 'border-box' as const, marginBottom: '0.75rem',
  },
  err: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    borderRadius: '6px', padding: '0.6rem 0.75rem', fontSize: '0.85rem', marginBottom: '0.75rem',
  },

  // Push waiting
  pushWaiting: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.5rem 0' },
  pushMsg: { fontWeight: 600, color: '#1f2328', margin: '0 0 0.25rem', fontSize: '0.95rem' },
  spinner: {
    width: '44px', height: '44px', border: '4px solid #e5e7eb', borderTopColor: '#3b82d4',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '1rem',
  },

  // Done
  doneWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.5rem 0' },
  doneCheck: {
    width: '56px', height: '56px', borderRadius: '50%', background: '#dcfce7',
    color: '#16a34a', fontSize: '1.75rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem',
  },
  doneTitle: { margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: 700, color: '#1f2328' },
}

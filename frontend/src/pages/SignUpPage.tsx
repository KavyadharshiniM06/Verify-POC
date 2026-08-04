/**
 * SignUpPage — Customer Self-Registration
 *
 * Three-step flow:
 *   Step 1 — Personal details  (name + email — NO password)
 *   Step 2 — Consent & privacy (review what MockBank collects)
 *   Step 3 — "Check your email" confirmation screen
 *
 * On submit:
 *   POST /auth/register  → creates user in IBM Verify + local DB
 *                          returns { email_sent, temp_password_hint, message }
 *                          NO session token is issued here.
 *
 * After step 3 the user must:
 *   1. Open the welcome email (or copy the hint shown on screen in dev mode)
 *   2. Click "Sign in" → IBM Verify OIDC flow
 *   3. IBM Verify prompts them to change the temp password (pwdReset=true)
 *   4. They set their personal password and proceed to MFA enrolment
 */
import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { T } from '../styles/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
interface RegisterResponse {
  email_sent: boolean
  temp_password_hint: string
  message: string
}

type Step = 1 | 2 | 3

// ─── Consent definitions shown in step 2 ─────────────────────────────────────
const CONSENTS = [
  {
    key: 'banking_data',
    label: 'Banking Data Processing',
    desc: 'Processing of your financial data to provide core banking services, fraud detection, and regulatory compliance.',
    required: true,
  },
  {
    key: 'identity',
    label: 'Identity Verification',
    desc: 'Use of your name and email to verify your identity when signing in and accessing account settings.',
    required: true,
  },
  {
    key: 'security',
    label: 'Security & Account Alerts',
    desc: 'Sending you sign-in alerts, MFA verification codes, and account change confirmations via email.',
    required: true,
  },
  {
    key: 'analytics',
    label: 'Account Analytics',
    desc: 'Aggregated spending insights and budgeting summaries to personalise your dashboard.',
    required: false,
  },
  {
    key: 'marketing',
    label: 'Marketing & Promotional Emails',
    desc: 'Newsletters, product announcements, and promotional offers from MockBank Financial Services.',
    required: false,
  },
]

// ─── Mini icons ───────────────────────────────────────────────────────────────
function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  )
}

function MailIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  )
}

// ─── Field component ─────────────────────────────────────────────────────────
function Field({
  label, type = 'text', value, onChange, placeholder, error, autoComplete,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void
  placeholder?: string; error?: string; autoComplete?: string
}) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={s.label}>{label}</label>
      <input
        style={{ ...s.input, borderColor: error ? T.red : T.border }}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      {error && <div style={s.fieldError}>{error}</div>}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SignUpPage() {
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>(1)

  // Step 1 fields
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({})

  // Step 2 consent
  const [optConsents, setOptConsents] = useState<Record<string, boolean>>({
    analytics: true,
    marketing: false,
  })
  const [agreeTerms, setAgreeTerms] = useState(false)

  // Submit / result state
  const [submitting,       setSubmitting]       = useState(false)
  const [apiError,         setApiError]         = useState<string | null>(null)
  const [result,           setResult]           = useState<RegisterResponse | null>(null)
  const [pwdCopied,        setPwdCopied]        = useState(false)

  // ── Step 1 validation ────────────────────────────────────────────────────
  const validateStep1 = (): boolean => {
    const errs: Record<string, string> = {}
    if (firstName.trim().length < 2) errs.firstName = 'First name must be at least 2 characters'
    if (lastName.trim().length  < 2) errs.lastName  = 'Last name must be at least 2 characters'
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = 'Enter a valid email address'
    setFieldErrs(errs)
    return Object.keys(errs).length === 0
  }

  const handleNextStep1 = () => {
    if (validateStep1()) setStep(2)
  }

  // ── Step 2 → submit registration ────────────────────────────────────────
  const handleSubmit = async () => {
    if (!agreeTerms) {
      setApiError('You must accept the Terms of Service and Privacy Policy to continue.')
      return
    }
    setSubmitting(true)
    setApiError(null)
    try {
      const { data } = await api.post<RegisterResponse>('/auth/register', {
        first_name:         firstName.trim(),
        last_name:          lastName.trim(),
        email:              email.trim(),
        marketing_consent:  optConsents.marketing,
      })
      setResult(data)
      setStep(3)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setApiError(detail ?? 'Registration failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopyPwd = () => {
    if (!result?.temp_password_hint) return
    navigator.clipboard.writeText(result.temp_password_hint).then(() => {
      setPwdCopied(true)
      setTimeout(() => setPwdCopied(false), 2000)
    })
  }

  // ── Step labels ──────────────────────────────────────────────────────────
  const STEPS = [
    { n: 1, label: 'Your details' },
    { n: 2, label: 'Privacy' },
    { n: 3, label: 'Done' },
  ]

  return (
    <div style={s.root}>
      {/* Left brand panel */}
      <div style={s.left}>
        <div style={s.leftInner}>
          <div style={s.brand}>
            <div style={s.brandMark}>M</div>
            <div>
              <div style={s.brandName}>MockBank</div>
              <div style={s.brandSub}>Digital Banking · Est. 2024</div>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <h1 style={s.headline}>
            Open your account<br />
            in <span style={{ color: T.amber }}>under 2 minutes.</span>
          </h1>
          <p style={s.tagline}>
            Secure by IBM Verify — your identity is created in IBM's cloud
            directory and protected by enterprise-grade authentication.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
            {[
              'OIDC login — no passwords stored in MockBank',
              'IBM Verify forces a password change on first sign-in',
              'MFA-ready — enrol passkey, TOTP, or push after login',
              'Consent-first — you control your data from day one',
            ].map(item => (
              <div key={item} style={s.trustItem}>
                <span style={{ color: T.green, flexShrink: 0 }}><ShieldIcon /></span>
                <span style={{ fontSize: '0.85rem', color: T.inkSub, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <div style={s.ibvBadge}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Identity managed by IBM Verify SaaS
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div style={s.right}>
        <div style={s.rightInner}>

          {/* Step progress bar (hide on step 3) */}
          {step < 3 && (
            <div style={s.stepBar}>
              {STEPS.map((st, i) => (
                <React.Fragment key={st.n}>
                  {i > 0 && (
                    <div style={{ ...s.stepLine, background: step > st.n - 1 ? T.amber : T.border }} />
                  )}
                  <div style={{
                    ...s.stepDot,
                    background: step >= st.n ? T.amber : T.bgCard,
                    border: `2px solid ${step >= st.n ? T.amber : T.border}`,
                    color: step >= st.n ? '#0d1117' : T.inkSub,
                  }}>
                    {step > st.n ? '✓' : st.n}
                  </div>
                  <div style={{ ...s.stepLabel }}>
                    {st.label}
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* ── Step 1: Personal Details ──────────────────────────────── */}
          {step === 1 && (
            <div>
              <div style={s.formHeader}>
                <h2 style={s.formTitle}>Create your account</h2>
                <p style={s.formSub}>
                  Enter your details. We'll create your identity in IBM Verify and
                  email you a temporary password to get started.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 0.75rem' }}>
                <Field
                  label="First name"
                  value={firstName}
                  onChange={setFirstName}
                  placeholder="Jane"
                  error={fieldErrs.firstName}
                  autoComplete="given-name"
                />
                <Field
                  label="Last name"
                  value={lastName}
                  onChange={setLastName}
                  placeholder="Smith"
                  error={fieldErrs.lastName}
                  autoComplete="family-name"
                />
              </div>

              <Field
                label="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="jane@example.com"
                error={fieldErrs.email}
                autoComplete="email"
              />

              <div style={s.infoBox}>
                <LockIcon />
                <span>
                  We'll generate a secure temporary password and email it to you.
                  IBM Verify will ask you to <strong>choose your own password</strong> on first sign-in.
                  MockBank never stores your password.
                </span>
              </div>

              <button style={s.primaryBtn} onClick={handleNextStep1}>
                Continue →
              </button>

              <p style={s.switchLink}>
                Already have an account?{' '}
                <Link to="/" style={{ color: T.amber, textDecoration: 'none', fontWeight: 600 }}>Sign in</Link>
              </p>
            </div>
          )}

          {/* ── Step 2: Consent & Privacy ─────────────────────────────── */}
          {step === 2 && (
            <div>
              <div style={s.formHeader}>
                <h2 style={s.formTitle}>Privacy &amp; Consent</h2>
                <p style={s.formSub}>
                  Review how MockBank uses your data. Required consents are
                  necessary for the service to work. You can change optional ones
                  at any time in Settings.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
                {CONSENTS.map(c => (
                  <div key={c.key} style={s.consentRow}>
                    <div style={{ flexShrink: 0, paddingTop: '1px' }}>
                      {c.required ? (
                        <div style={{ ...s.checkbox, ...s.checkboxLocked }}>
                          <LockIcon />
                        </div>
                      ) : (
                        <button
                          style={{ ...s.checkbox, ...(optConsents[c.key] ? s.checkboxOn : s.checkboxOff) }}
                          onClick={() => setOptConsents(p => ({ ...p, [c.key]: !p[c.key] }))}
                          type="button"
                        >
                          {optConsents[c.key] && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: T.ink, display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.15rem' }}>
                        {c.label}
                        {c.required && <span style={s.reqTag}>Required</span>}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: T.inkSub, lineHeight: 1.5 }}>{c.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Terms checkbox */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  style={{ ...s.checkbox, ...(agreeTerms ? s.checkboxOn : s.checkboxOff), marginTop: '1px', flexShrink: 0 }}
                  onClick={() => setAgreeTerms(v => !v)}
                >
                  {agreeTerms && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
                <span style={{ fontSize: '0.82rem', color: T.inkSub, lineHeight: 1.55 }}>
                  I have read and agree to the{' '}
                  <span style={{ color: T.amber, fontWeight: 600 }}>Terms of Service</span>{' '}
                  and{' '}
                  <span style={{ color: T.amber, fontWeight: 600 }}>Privacy Policy</span>.
                </span>
              </div>

              {apiError && (
                <div style={s.errorBox}>⚠ {apiError}</div>
              )}

              <button
                style={{ ...s.primaryBtn, opacity: submitting ? 0.7 : 1 }}
                onClick={handleSubmit}
                disabled={submitting}
                type="button"
              >
                {submitting ? (
                  <><span style={s.spinner} /> Creating your account…</>
                ) : (
                  'Create My Account'
                )}
              </button>

              <button
                type="button"
                style={s.backBtn}
                onClick={() => { setApiError(null); setStep(1) }}
              >
                ← Back
              </button>
            </div>
          )}

          {/* ── Step 3: Check Your Email ───────────────────────────────── */}
          {step === 3 && result && (
            <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
              {/* Mail icon */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
                <MailIcon />
              </div>

              <h2 style={{ ...s.formTitle, marginBottom: '0.5rem' }}>
                {result.email_sent ? 'Check your email!' : 'Account created!'}
              </h2>

              {result.email_sent ? (
                <p style={{ fontSize: '0.88rem', color: T.inkSub, lineHeight: 1.7, marginBottom: '1.5rem' }}>
                  We've sent a welcome email to{' '}
                  <strong style={{ color: T.ink }}>{email}</strong>{' '}
                  with your temporary password.
                </p>
              ) : (
                <p style={{ fontSize: '0.88rem', color: T.inkSub, lineHeight: 1.7, marginBottom: '1rem' }}>
                  Your IBM Verify identity has been created for{' '}
                  <strong style={{ color: T.ink }}>{email}</strong>.
                  Email delivery is not configured in this environment — use
                  the temporary password below to sign in.
                </p>
              )}

              {/* Dev-mode: show temp password inline */}
              {!result.email_sent && result.temp_password_hint && (
                <div style={s.pwdHintBox}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.inkSub, marginBottom: '0.5rem' }}>
                    Temporary Password
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }}>
                    <code style={s.pwdCode}>{result.temp_password_hint}</code>
                    <button
                      type="button"
                      style={s.copyBtn}
                      onClick={handleCopyPwd}
                      title="Copy to clipboard"
                    >
                      {pwdCopied
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        : <CopyIcon />
                      }
                    </button>
                  </div>
                  {pwdCopied && (
                    <div style={{ fontSize: '0.72rem', color: T.green, marginTop: '0.4rem' }}>Copied!</div>
                  )}
                </div>
              )}

              {/* Step-by-step instructions */}
              <div style={s.stepsBox}>
                {[
                  { n: '1', text: result.email_sent ? 'Open the welcome email from MockBank' : 'Copy the temporary password above' },
                  { n: '2', text: 'Click "Sign in" below to start the IBM Verify OIDC flow' },
                  { n: '3', text: 'IBM Verify will ask you to choose your own personal password' },
                  { n: '4', text: 'After signing in, set up MFA (passkey, TOTP, or push) in Security Settings' },
                ].map(step => (
                  <div key={step.n} style={s.stepRow}>
                    <div style={s.stepNumBadge}>{step.n}</div>
                    <div style={{ fontSize: '0.82rem', color: T.inkSub, lineHeight: 1.5, textAlign: 'left' }}>{step.text}</div>
                  </div>
                ))}
              </div>

              {/* Primary CTA */}
              <button
                type="button"
                style={{ ...s.primaryBtn, marginTop: '0.25rem' }}
                onClick={() => navigate('/', { replace: true })}
              >
                Sign in now →
              </button>

              <p style={{ fontSize: '0.75rem', color: T.inkLight, marginTop: '0.5rem' }}>
                You'll be redirected to IBM Verify to complete your sign-in.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', minHeight: '100vh',
    background: T.bg, fontFamily: T.fontFamily, color: T.ink,
  },

  // Left brand panel
  left: {
    flex: '0 0 42%', display: 'flex', flexDirection: 'column',
    background: T.bg, borderRight: `1px solid ${T.border}`,
  },
  leftInner: {
    flex: 1, display: 'flex', flexDirection: 'column',
    padding: '2.5rem 3rem',
  },
  brand:     { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  brandMark: {
    width: '40px', height: '40px', borderRadius: '10px',
    background: T.amber, color: '#0d1117',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, fontSize: '1.2rem',
  },
  brandName: { fontSize: '1rem', fontWeight: 700, color: T.ink },
  brandSub:  { fontSize: '0.68rem', color: T.inkSub, marginTop: '0.1rem' },
  headline: {
    fontSize: '2.4rem', fontWeight: 800, lineHeight: 1.15,
    letterSpacing: '-0.03em', margin: '0 0 1rem', color: T.ink,
  },
  tagline: {
    fontSize: '0.88rem', color: T.inkSub, lineHeight: 1.65,
    margin: 0, maxWidth: '340px',
  },
  trustItem: { display: 'flex', alignItems: 'flex-start', gap: '0.6rem' },
  ibvBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    padding: '0.25rem 0.7rem', borderRadius: '999px',
    background: T.amberLight, color: T.amber, border: `1px solid ${T.amberBorder}`,
    width: 'fit-content',
  },

  // Right form panel
  right: {
    flex: 1, display: 'flex', flexDirection: 'column',
    background: T.bgCard, overflow: 'auto',
  },
  rightInner: {
    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
    padding: '3rem 3.5rem',
    maxWidth: '520px', width: '100%', margin: '0 auto',
  },

  // Step bar
  stepBar: { display: 'flex', alignItems: 'center', marginBottom: '2rem' },
  stepDot: {
    width: '28px', height: '28px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.78rem', fontWeight: 800, flexShrink: 0,
    transition: 'background 0.2s, border-color 0.2s',
  },
  stepLine: { flex: 1, height: '2px', transition: 'background 0.2s', margin: '0 0.4rem' },
  stepLabel: {
    fontSize: '0.72rem', fontWeight: 600,
    position: 'absolute' as const,
    width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)',
  },

  // Form header
  formHeader:  { marginBottom: '1.75rem' },
  formTitle: {
    fontSize: '1.65rem', fontWeight: 800, color: T.ink,
    letterSpacing: '-0.03em', margin: '0 0 0.4rem', lineHeight: 1.1,
  },
  formSub: { fontSize: '0.85rem', color: T.inkSub, lineHeight: 1.6, margin: 0 },

  // Fields
  label: {
    display: 'block', fontSize: '0.8rem', fontWeight: 600,
    color: T.inkSub, marginBottom: '0.3rem',
  },
  input: {
    width: '100%', padding: '0.7rem 0.9rem',
    background: T.bgMuted, border: `1px solid ${T.border}`,
    borderRadius: '8px', color: T.ink, fontSize: '0.9rem',
    fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s',
  },
  fieldError: { fontSize: '0.75rem', color: T.red, marginTop: '0.25rem' },

  // Info box
  infoBox: {
    display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
    background: T.bgMuted, border: `1px solid ${T.border}`,
    borderRadius: '8px', padding: '0.75rem 0.9rem',
    fontSize: '0.8rem', color: T.inkSub, lineHeight: 1.55,
    marginBottom: '1.25rem',
  },

  // Consent rows
  consentRow: {
    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
    padding: '0.75rem 0.9rem', background: T.bgMuted,
    border: `1px solid ${T.borderLight}`, borderRadius: '9px',
  },
  checkbox: {
    width: '20px', height: '20px', borderRadius: '5px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', border: 'none', flexShrink: 0,
    transition: 'background 0.12s',
  },
  checkboxLocked: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    color: T.inkLight, cursor: 'default',
  },
  checkboxOn: {
    background: T.amber, border: `1px solid ${T.amber}`,
    color: '#0d1117', cursor: 'pointer',
  },
  checkboxOff: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    color: 'transparent', cursor: 'pointer',
  },
  reqTag: {
    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    padding: '0.12rem 0.4rem', borderRadius: '999px',
    background: T.amberLight, color: T.amber, border: `1px solid ${T.amberBorder}`,
  },

  // Buttons
  primaryBtn: {
    width: '100%', padding: '0.85rem',
    background: T.amber, color: '#0d1117',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontWeight: 700, fontSize: '0.95rem', fontFamily: 'inherit',
    marginBottom: '0.75rem', letterSpacing: '0.01em',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
    transition: 'opacity 0.12s',
  },
  backBtn: {
    display: 'block', width: '100%', textAlign: 'center' as const,
    background: 'none', border: 'none', cursor: 'pointer',
    color: T.inkSub, fontSize: '0.85rem', fontFamily: 'inherit',
    padding: '0.5rem',
  },
  spinner: {
    display: 'inline-block', width: '14px', height: '14px',
    border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },

  // Error box
  errorBox: {
    background: T.redLight, border: `1px solid ${T.redBorder}`, color: T.red,
    borderRadius: '8px', padding: '0.7rem 0.9rem', fontSize: '0.83rem',
    marginBottom: '0.85rem', lineHeight: 1.5,
  },

  switchLink: {
    textAlign: 'center' as const, fontSize: '0.83rem',
    color: T.inkSub, margin: '0.75rem 0 0',
  },

  // Step 3 — temp password hint box
  pwdHintBox: {
    background: T.bgMuted, border: `1px solid ${T.amberBorder}`,
    borderRadius: '10px', padding: '1rem',
    marginBottom: '1.25rem', textAlign: 'center' as const,
  },
  pwdCode: {
    fontFamily: '"SFMono-Regular", "Consolas", monospace',
    fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.12em',
    color: T.amber, background: T.bg,
    padding: '0.3rem 0.75rem', borderRadius: '6px',
    border: `1px solid ${T.border}`,
    userSelect: 'text' as const,
  },
  copyBtn: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '6px', cursor: 'pointer',
    color: T.inkSub, padding: '0.3rem 0.5rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  // Step 3 — what-to-do-next box
  stepsBox: {
    background: T.bgMuted, border: `1px solid ${T.border}`,
    borderRadius: '10px', padding: '1rem 1.1rem',
    marginBottom: '1.5rem', display: 'flex',
    flexDirection: 'column' as const, gap: '0.65rem',
    textAlign: 'left' as const,
  },
  stepRow: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem' },
  stepNumBadge: {
    width: '22px', height: '22px', borderRadius: '50%',
    background: T.amberLight, border: `1px solid ${T.amberBorder}`,
    color: T.amber, fontSize: '0.72rem', fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: '1px',
  },
}

import React, { useState } from 'react'
import api from '../api/axios'

// ── SVG icons ────────────────────────────────────────────────────────────────
function ShieldCheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  )
}

// ── Trust-signal logos (text-based, no external assets) ──────────────────────
const TRUST_LOGOS = [
  'FDIC Insured', 'AES-256 Encrypted', 'SOC 2 Type II', 'PCI DSS Level 1',
  'ISO 27001', 'CCPA Compliant', 'GDPR Ready', 'MFA Protected',
]

const TESTIMONIALS = [
  {
    quote: '"MockBank gives me total confidence in every transfer. The security is second to none — I never worry about my money."',
    name: 'Sarah Mitchell',
    title: 'Small Business Owner',
    initials: 'SM',
  },
  {
    quote: '"The step-up authentication for large transfers is brilliant. It\'s exactly what I needed for peace of mind."',
    name: 'James Okafor',
    title: 'Senior Financial Analyst',
    initials: 'JO',
  },
]

const FEATURES = [
  { icon: '🔒', label: 'Bank-grade encryption' },
  { icon: '🛡', label: 'Fraud monitoring 24/7' },
  { icon: '⚡', label: 'Instant transfers' },
  { icon: '📱', label: 'Multi-factor security' },
]

export default function LoginPage() {
  const [error,       setError]   = useState<string | null>(null)
  const [loading,     setLoading] = useState(false)
  const [testimonial] = useState(() => TESTIMONIALS[Math.floor(Math.random() * TESTIMONIALS.length)])

  const handleLogin = async () => {
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.get('/auth/sso/login')
      window.location.href = data.authorization_url
    } catch {
      setError('Unable to connect. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={s.root}>
      {/* ── Left panel ─────────────────────────────────────────── */}
      <div style={s.left}>
        {/* Brand */}
        <div style={s.brand}>
          <div style={s.brandMark}>M</div>
          <span style={s.brandName}>MockBank</span>
        </div>

        {/* Form area */}
        <div style={s.formWrap}>
          <h1 style={s.heading}>Welcome Back!</h1>
          <p style={s.sub}>Sign in securely to access your accounts and manage your finances.</p>

          {error && (
            <div style={s.errorBox}>
              <span style={{ marginRight: '0.4rem' }}>⚠</span>{error}
            </div>
          )}

          {/* Single sign-in button */}
          <button style={s.signInBtn} onClick={handleLogin} disabled={loading}>
            {loading ? (
              <span style={s.btnRow}>
                <span style={s.spinner} />
                Redirecting…
              </span>
            ) : (
              <span style={s.btnRow}>
                <ShieldCheckIcon />
                Sign In to MockBank
              </span>
            )}
          </button>

          {/* Security note */}
          <div style={s.secNote}>
            <span style={{ color: '#1a2e2a' }}><ShieldCheckIcon /></span>
            <span>Protected by 256-bit encryption and multi-factor authentication</span>
          </div>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────── */}
      <div style={s.right}>
        <div style={s.rightInner}>
          {/* Headline */}
          <div style={s.rightTop}>
            <h2 style={s.rightHeading}>
              Secure Banking for the Modern World
            </h2>

            {/* Feature pills */}
            <div style={s.featureGrid}>
              {FEATURES.map(f => (
                <div key={f.label} style={s.featurePill}>
                  <span>{f.icon}</span>
                  <span>{f.label}</span>
                </div>
              ))}
            </div>

            {/* Testimonial */}
            <div style={s.testimonialBox}>
              <div style={s.quoteIcon}>"</div>
              <p style={s.quoteText}>{testimonial.quote}</p>
              <div style={s.quotePerson}>
                <div style={s.quoteAvatar}>{testimonial.initials}</div>
                <div>
                  <div style={s.quoteName}>{testimonial.name}</div>
                  <div style={s.quoteTitle}>{testimonial.title}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Trust logos */}
          <div style={s.trustSection}>
            <div style={s.trustLabel}>TRUSTED &amp; CERTIFIED</div>
            <div style={s.dividerLine} />
            <div style={s.trustGrid}>
              {TRUST_LOGOS.map(t => (
                <div key={t} style={s.trustBadge}>{t}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const DARK = '#1a2e2a'
const ACCENT = '#4ade80'

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    minHeight: '100vh',
    fontFamily: '-apple-system,"Segoe UI",system-ui,sans-serif',
  },

  // ── Left ──
  left: {
    flex: '0 0 50%',
    display: 'flex',
    flexDirection: 'column',
    padding: '2rem 3rem',
    background: '#fff',
    overflowY: 'auto',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.55rem',
    marginBottom: '2.5rem',
  },
  brandMark: {
    width: '36px', height: '36px', borderRadius: '9px',
    background: DARK, color: ACCENT,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: '1.1rem',
  },
  brandName: {
    fontWeight: 700, fontSize: '1.2rem', color: DARK, letterSpacing: '-0.01em',
  },
  formWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    maxWidth: '400px',
    width: '100%',
  },
  heading: { margin: '0 0 0.4rem', fontSize: '1.9rem', fontWeight: 700, color: '#1f2328', letterSpacing: '-0.02em' },
  sub:     { margin: '0 0 2rem', fontSize: '0.88rem', color: '#57606a', lineHeight: 1.55 },

  form: { display: 'flex', flexDirection: 'column', gap: '0' },

  fieldGroup: { marginBottom: '1.1rem' },
  label:      { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' },
  inputWrap:  { position: 'relative', display: 'flex', alignItems: 'center' },
  inputIcon:  {
    position: 'absolute', left: '0.8rem', color: '#9ca3af',
    display: 'flex', alignItems: 'center', pointerEvents: 'none',
  },
  input: {
    width: '100%', padding: '0.7rem 0.9rem 0.7rem 2.4rem',
    border: '1.5px solid #e5e7eb', borderRadius: '9px',
    fontSize: '0.9rem', color: '#1f2328', outline: 'none',
    boxSizing: 'border-box',
    background: '#fff',
    transition: 'border-color 0.15s',
  },
  eyeBtn: {
    position: 'absolute', right: '0.8rem',
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#9ca3af', display: 'flex', alignItems: 'center', padding: 0,
  },
  forgotRow: { display: 'flex', justifyContent: 'flex-end', marginTop: '0.4rem' },
  forgotBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '0.8rem', color: '#1a2e2a', fontWeight: 600, padding: 0,
  },

  errorBox: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    borderRadius: '8px', padding: '0.65rem 0.85rem',
    fontSize: '0.83rem', marginBottom: '1rem',
    display: 'flex', alignItems: 'center',
  },

  signInBtn: {
    width: '100%', padding: '0.82rem',
    background: DARK, color: '#fff',
    border: 'none', borderRadius: '9px',
    fontWeight: 700, fontSize: '0.95rem',
    cursor: 'pointer', marginBottom: '1.1rem',
    letterSpacing: '0.01em',
  },

  orRow:  { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.1rem' },
  orLine: { flex: 1, height: '1px', background: '#e5e7eb' },
  orText: { fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' },

  ssoBtn: {
    width: '100%', padding: '0.78rem',
    background: '#fff', color: '#1f2328',
    border: '1.5px solid #e5e7eb', borderRadius: '9px',
    fontWeight: 600, fontSize: '0.88rem',
    cursor: 'pointer', marginBottom: '1.5rem',
  },
  btnRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' },
  spinner: {
    display: 'inline-block', width: '14px', height: '14px',
    border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },

  secNote: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    fontSize: '0.75rem', color: '#6b7280',
  },

  // ── Right ──
  right: {
    flex: '0 0 50%',
    background: DARK,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  rightInner: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '3rem 3rem 2.5rem',
  },
  rightTop: {},
  rightHeading: {
    color: '#fff', fontSize: '2.3rem', fontWeight: 700,
    lineHeight: 1.2, letterSpacing: '-0.02em',
    margin: '0 0 2rem',
  },

  featureGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: '0.65rem', marginBottom: '2.5rem',
  },
  featurePill: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px', padding: '0.65rem 0.9rem',
    fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', fontWeight: 500,
  },

  testimonialBox: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '14px',
    padding: '1.5rem 1.6rem',
  },
  quoteIcon: {
    fontSize: '2rem', fontWeight: 900,
    color: ACCENT, lineHeight: 1, marginBottom: '0.5rem',
  },
  quoteText: {
    color: 'rgba(255,255,255,0.88)', fontSize: '0.93rem',
    lineHeight: 1.65, margin: '0 0 1.25rem', fontStyle: 'italic',
  },
  quotePerson: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  quoteAvatar: {
    width: '40px', height: '40px', borderRadius: '50%',
    background: ACCENT, color: DARK,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: '0.9rem', flexShrink: 0,
  },
  quoteName:  { fontSize: '0.87rem', fontWeight: 700, color: '#fff' },
  quoteTitle: { fontSize: '0.76rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.1rem' },

  trustSection: { marginTop: '2.5rem' },
  trustLabel: {
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em',
    color: 'rgba(255,255,255,0.4)', marginBottom: '0.75rem',
  },
  dividerLine: { height: '1px', background: 'rgba(255,255,255,0.1)', marginBottom: '1rem' },
  trustGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '0.5rem',
  },
  trustBadge: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px', padding: '0.45rem 0.5rem',
    fontSize: '0.68rem', fontWeight: 600,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    letterSpacing: '0.01em',
  },
}

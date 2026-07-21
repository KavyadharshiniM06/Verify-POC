import React, { useState } from 'react'
import api from '../api/axios'
import { T } from '../styles/theme'

function ShieldIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  )
}

const STATS = [
  { value: '$4.2B', label: 'Assets managed' },
  { value: '128k',  label: 'Private clients' },
  { value: '99.99%', label: 'Uptime SLA' },
]

const TESTIMONIALS = [
  { quote: 'Total confidence in every transfer. Security second to none.', name: 'Sarah Mitchell', title: 'Business Owner', initials: 'SM' },
  { quote: 'Step-up authentication for large transfers is exactly what I needed.', name: 'James Okafor', title: 'Financial Analyst', initials: 'JO' },
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
        <div style={s.leftInner}>
          {/* Brand */}
          <div style={s.brand}>
            <div style={s.brandMark}>M</div>
            <div>
              <div style={s.brandName}>MockBank</div>
              <div style={s.brandSub}>Digital Banking · Est. 2024</div>
            </div>
          </div>

          <div style={s.leftSpacer} />

          {/* Status pill */}
          <div style={s.statusPill}>
            <span style={s.statusDot} />
            <span>All systems operational</span>
          </div>

          {/* Headline */}
          <h1 style={s.headline}>
            Banking, refined<br />
            for the <span style={s.accentText}>next decade.</span>
          </h1>

          <p style={s.tagline}>
            Accounts, transfers, cards and portfolio —<br />
            orchestrated in one calm interface, protected by<br />
            hardware-grade authentication.
          </p>

          <div style={s.dividerHoriz} />

          {/* Stats row */}
          <div style={s.statsRow}>
            {STATS.map(stat => (
              <div key={stat.label} style={s.statItem}>
                <div style={s.statValue}>{stat.value}</div>
                <div style={s.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={s.leftSpacer} />

          {/* Bottom trust row */}
          <div style={s.trustRow}>
            <span style={s.trustItem}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              FDIC insured to $250,000
            </span>
            <span style={s.trustItem}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              AES-256 · TLS 1.3
            </span>
          </div>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────── */}
      <div style={s.right}>
        <div style={s.rightInner}>
          <div style={s.formHeader}>
            <div style={s.welcomeBack}>Welcome back</div>
            <h2 style={s.signInTitle}>Sign in to your account</h2>
            <p style={s.signInSub}>Sign in securely using your registered credentials.</p>
          </div>

          {error && (
            <div style={s.errorBox}>⚠ {error}</div>
          )}

          {/* Primary CTA */}
          <button style={s.signInBtn} onClick={handleLogin} disabled={loading}>
            {loading ? (
              <span style={s.btnRow}><span style={s.spinner} /> Redirecting…</span>
            ) : (
              <span style={s.btnRow}>
                <ShieldIcon />
                Continue securely →
              </span>
            )}
          </button>

          {/* Testimonial */}
          <div style={s.testimonialBox}>
            <div style={s.testimonialQuote}>&ldquo;{testimonial.quote}&rdquo;</div>
            <div style={s.testimonialPerson}>
              <div style={s.testimonialAvatar}>{testimonial.initials}</div>
              <div>
                <div style={s.testimonialName}>{testimonial.name}</div>
                <div style={s.testimonialTitle}>{testimonial.title}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', minHeight: '100vh', fontFamily: T.fontFamily,
    background: T.bg, color: T.ink,
  },

  // ── Left ──
  left: {
    flex: '0 0 55%', display: 'flex', flexDirection: 'column',
    background: T.bg, padding: 0, position: 'relative' as const,
  },
  leftInner: {
    flex: 1, display: 'flex', flexDirection: 'column',
    padding: '2.5rem 3rem 2rem',
  },
  leftSpacer: { flex: 1 },
  brand: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '3rem' },
  brandMark: {
    width: '40px', height: '40px', borderRadius: '10px',
    background: T.amber, color: '#0d1117',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, fontSize: '1.2rem',
  },
  brandName: { fontSize: '1rem', fontWeight: 700, color: T.ink, letterSpacing: '-0.01em' },
  brandSub: { fontSize: '0.68rem', color: T.inkSub, marginTop: '0.1rem' },

  statusPill: {
    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '999px', padding: '0.3rem 0.85rem',
    fontSize: '0.75rem', color: T.inkSub, marginBottom: '1.5rem',
    width: 'fit-content',
  },
  statusDot: {
    width: '7px', height: '7px', borderRadius: '50%', background: T.green, flexShrink: 0,
  },

  headline: {
    fontSize: '3.2rem', fontWeight: 800, lineHeight: 1.1,
    letterSpacing: '-0.03em', margin: '0 0 1.25rem', color: T.ink,
  },
  accentText: { color: T.amber },
  tagline: {
    fontSize: '1rem', color: T.inkSub, lineHeight: 1.65,
    margin: '0 0 2rem', fontWeight: 400,
  },
  dividerHoriz: { height: '1px', background: T.border, marginBottom: '2rem' },

  statsRow: { display: 'flex', gap: '3rem' },
  statItem: {},
  statValue: { fontSize: '1.6rem', fontWeight: 800, color: T.ink, letterSpacing: '-0.02em' },
  statLabel: { fontSize: '0.75rem', color: T.inkSub, marginTop: '0.15rem' },

  trustRow: { display: 'flex', gap: '1.5rem', flexWrap: 'wrap' as const },
  trustItem: {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    fontSize: '0.72rem', color: T.inkSub,
  },

  // ── Right ──
  right: {
    flex: '0 0 45%', display: 'flex', flexDirection: 'column',
    background: T.bgCard, borderLeft: `1px solid ${T.border}`,
  },
  rightInner: {
    flex: 1, display: 'flex', flexDirection: 'column',
    justifyContent: 'center', padding: '3rem 3rem',
    maxWidth: '420px', margin: '0 auto', width: '100%',
  },
  formHeader: { marginBottom: '2rem' },
  welcomeBack: { fontSize: '0.82rem', color: T.inkSub, marginBottom: '0.4rem' },
  signInTitle: {
    fontSize: '2rem', fontWeight: 800, color: T.ink,
    letterSpacing: '-0.03em', margin: '0 0 0.5rem', lineHeight: 1.1,
  },
  signInSub: { fontSize: '0.85rem', color: T.inkSub, margin: 0, lineHeight: 1.5 },

  errorBox: {
    background: T.redLight, border: `1px solid ${T.redBorder}`, color: T.red,
    borderRadius: '8px', padding: '0.7rem 1rem', fontSize: '0.85rem', marginBottom: '1rem',
  },

  signInBtn: {
    width: '100%', padding: '0.9rem',
    background: T.amber, color: '#0d1117',
    border: 'none', borderRadius: '8px',
    fontWeight: 700, fontSize: '1rem',
    cursor: 'pointer', marginBottom: '2rem',
    letterSpacing: '0.01em',
  },
  btnRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' },
  spinner: {
    display: 'inline-block', width: '14px', height: '14px',
    border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },

  testimonialBox: {
    background: T.bgMuted, border: `1px solid ${T.border}`,
    borderRadius: '10px', padding: '1.25rem',
  },
  testimonialQuote: {
    fontSize: '0.88rem', color: T.inkSub, lineHeight: 1.65,
    marginBottom: '1rem', fontStyle: 'italic',
  },
  testimonialPerson: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  testimonialAvatar: {
    width: '36px', height: '36px', borderRadius: '50%',
    background: T.amber, color: '#0d1117',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: '0.8rem', flexShrink: 0,
  },
  testimonialName:  { fontSize: '0.85rem', fontWeight: 700, color: T.ink },
  testimonialTitle: { fontSize: '0.72rem', color: T.inkSub },
}

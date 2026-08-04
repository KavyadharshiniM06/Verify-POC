import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../api/axios'
import { LT as C } from '../styles/theme'

function useConsentError(): string | null {
  const location = useLocation()
  const fromState = (location.state as { consentError?: string } | null)?.consentError ?? null
  if (fromState) return fromState
  return new URLSearchParams(location.search).get('consent_error')
}

function LoginIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/>
      <polyline points="10 17 15 12 10 7"/>
      <line x1="15" y1="12" x2="3" y2="12"/>
    </svg>
  )
}
function LoanIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
      <line x1="2"  y1="20" x2="22" y2="20"/>
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  )
}

const FEATURES = [
  { icon: LoanIcon,  title: 'Loan Application Review',   desc: 'View and action all pending loan applications with full applicant details in one dashboard.' },
  { icon: ChartIcon, title: 'Real-time Portfolio Stats', desc: 'Live counters for pending, approved, and rejected applications across your portfolio.' },
  { icon: CheckIcon, title: 'Approve with Confidence',   desc: 'High-value loan approvals require an additional verification step to protect the bank.' },
]

const STATS = [
  { value: '₹5L',   label: 'Approval threshold' },
  { value: '100%',  label: 'Secure decisions'   },
  { value: '99.9%', label: 'Uptime SLA'          },
]

export default function AnalystLoginPage() {
  const consentError = useConsentError()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

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
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>

      {/* ── Left panel ──────────────────────────────────────── */}
      <div style={s.left}>
        <div style={s.leftInner}>

          <div style={s.brand}>
            <div style={s.brandMark}>M</div>
            <div>
              <div style={s.brandName}>MockBank</div>
              <div style={s.brandSub}>Credit Analyst Portal</div>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <div style={s.statusPill}>
            <span style={s.statusDot} />
            <span>All systems operational</span>
          </div>

          <h1 style={s.headline}>
            Smarter loan decisions,<br />
            <span style={{ color: C.amber }}>faster approvals.</span>
          </h1>
          <p style={s.tagline}>
            Review loan applications, track your portfolio in real time,
            and approve with confidence — all from your secure MockBank workspace.
          </p>

          <div style={s.statsRow}>
            {STATS.map(stat => (
              <div key={stat.label} style={s.statItem}>
                <div style={s.statValue}>{stat.value}</div>
                <div style={s.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={s.divider} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {FEATURES.map(feat => (
              <div key={feat.title} style={s.featCard}>
                <div style={s.featIcon}><feat.icon /></div>
                <div>
                  <div style={s.featTitle}>{feat.title}</div>
                  <div style={s.featDesc}>{feat.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <div style={s.trustRow}>
            <span style={s.trustItem}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Secure · Encrypted
            </span>
            <span style={s.trustItem}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              99.9% Uptime
            </span>
          </div>
        </div>
      </div>

      {/* ── Right sign-in panel ─────────────────────────────── */}
      <div style={s.right}>
        <div style={s.rightInner}>

          <div style={s.portalTag}>
            <span style={s.portalDot} />
            Credit Analyst Portal
          </div>

          <div style={s.formHeader}>
            <h2 style={s.signInTitle}>Analyst sign-in</h2>
            <p style={s.signInSub}>
              Sign in to access your loan approval workspace.
            </p>
          </div>

          {consentError && (
            <div style={s.alertBox}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.amber}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: C.ink, marginBottom: '0.15rem' }}>Session ended</div>
                <div style={{ fontSize: '0.78rem', color: C.inkSub }}>{consentError}</div>
              </div>
            </div>
          )}

          {error && <div style={s.errorBox}>⚠ {error}</div>}

          <button style={s.signInBtn} onClick={handleLogin} disabled={loading}>
            {loading ? (
              <span style={s.btnRow}><span style={s.spinner} /> Signing in…</span>
            ) : (
              <span style={s.btnRow}><LoginIcon /> Sign in to MockBank →</span>
            )}
          </button>

          <div style={s.infoNote}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.inkLight}
              strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>
              Credit Analyst accounts are provisioned by your HR administrator.
              Contact them if you don't have access yet.
            </span>
          </div>

        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', minHeight: '100vh', fontFamily: C.fontFamily, background: C.bg, color: C.ink },

  left: { flex: '0 0 55%', display: 'flex', flexDirection: 'column', background: '#ffffff', borderRight: `1px solid ${C.border}` },
  leftInner: { flex: 1, display: 'flex', flexDirection: 'column', padding: '2.5rem 3rem 2rem' },

  brand: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '3rem' },
  brandMark: {
    width: '40px', height: '40px', borderRadius: '10px',
    background: '#1d4ed8', color: '#ffffff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, fontSize: '1.2rem',
  },
  brandName: { fontSize: '1rem', fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' },
  brandSub:  { fontSize: '0.68rem', color: C.inkSub, marginTop: '0.1rem' },

  statusPill: { display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: C.bgMuted, border: `1px solid ${C.border}`, borderRadius: '999px', padding: '0.3rem 0.85rem', fontSize: '0.73rem', color: C.inkSub, marginBottom: '1.5rem', width: 'fit-content' },
  statusDot:  { width: '7px', height: '7px', borderRadius: '50%', background: C.green, flexShrink: 0 },

  headline: { fontSize: '2.9rem', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 1.25rem', color: C.ink },
  tagline:  { fontSize: '0.95rem', color: C.inkSub, lineHeight: 1.65, margin: '0 0 2rem', fontWeight: 400 },

  statsRow: { display: 'flex', gap: '2.5rem', marginBottom: '2rem' },
  statItem: {},
  statValue: { fontSize: '1.6rem', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' },
  statLabel: { fontSize: '0.72rem', color: C.inkSub, marginTop: '0.1rem' },

  divider: { height: '1px', background: C.border, marginBottom: '1.75rem' },

  featCard:  { display: 'flex', alignItems: 'flex-start', gap: '0.85rem', background: C.bgMuted, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '0.85rem 1rem' },
  featIcon:  { width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(29,78,216,0.08)', border: '1px solid rgba(29,78,216,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1d4ed8', flexShrink: 0 },
  featTitle: { fontSize: '0.85rem', fontWeight: 700, color: C.ink, marginBottom: '0.2rem' },
  featDesc:  { fontSize: '0.75rem', color: C.inkSub, lineHeight: 1.55 },

  trustRow:  { display: 'flex', gap: '1.5rem', flexWrap: 'wrap' as const, marginTop: '0.5rem' },
  trustItem: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: C.inkLight },

  right: { flex: '0 0 45%', display: 'flex', flexDirection: 'column', background: C.bg },
  rightInner: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '3rem', maxWidth: '420px', margin: '0 auto', width: '100%' },

  portalTag:  { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, background: 'rgba(29,78,216,0.08)', border: '1px solid rgba(29,78,216,0.2)', color: '#1d4ed8', borderRadius: '999px', padding: '0.25rem 0.75rem', marginBottom: '1.5rem', width: 'fit-content' },
  portalDot:  { width: '6px', height: '6px', borderRadius: '50%', background: '#1d4ed8', flexShrink: 0 },

  formHeader:  { marginBottom: '2rem' },
  signInTitle: { fontSize: '1.9rem', fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', margin: '0 0 0.5rem', lineHeight: 1.1 },
  signInSub:   { fontSize: '0.85rem', color: C.inkSub, margin: 0, lineHeight: 1.5 },

  alertBox: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1.2rem' },
  errorBox:  { background: C.redLight, border: `1px solid ${C.redBorder}`, color: C.red, borderRadius: '8px', padding: '0.7rem 1rem', fontSize: '0.85rem', marginBottom: '1rem' },

  signInBtn: { width: '100%', padding: '0.9rem', background: '#1d4ed8', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginBottom: '1.25rem', letterSpacing: '0.01em', fontFamily: C.fontFamily },
  btnRow:    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' },
  spinner:   { display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' },

  infoNote: { display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.78rem', color: C.inkSub, lineHeight: 1.55, background: '#ffffff', border: `1px solid ${C.border}`, borderRadius: '8px', padding: '0.75rem 0.9rem', marginBottom: '1.5rem' },
}

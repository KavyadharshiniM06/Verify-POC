import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../api/axios'
import { T } from '../styles/theme'

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
function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  )
}
function RoleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  )
}
function AuditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )
}

const CAPABILITIES = [
  { icon: UsersIcon, title: 'Employee Onboarding',    desc: 'Register new employees, assign roles, and provision access across all PeopleHub systems from a single portal.' },
  { icon: RoleIcon,  title: 'Role & Access Control',  desc: 'Manage role assignments for all staff. Changes require multi-step approval to maintain security compliance.' },
  { icon: AuditIcon, title: 'Audit & Compliance',     desc: 'Every administrative action is logged with timestamp and actor for full regulatory accountability.' },
]

export default function AdminLoginPage() {
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
            <div style={s.brandMark}>P</div>
            <div>
              <div style={s.brandName}>PeopleHub</div>
              <div style={s.brandSub}>HR Admin Portal</div>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <div style={s.statusPill}>
            <span style={s.statusDot} />
            <span>All systems operational</span>
          </div>

          <h1 style={s.headline}>
            Workforce management,<br />
            <span style={{ color: T.amber }}>all in one place.</span>
          </h1>
          <p style={s.tagline}>
            The secure back-office portal for managing your employees —
            onboard new staff, update roles, and maintain access control
            with a full audit trail on every action.
          </p>

          <div style={s.divider} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {CAPABILITIES.map(cap => (
              <div key={cap.title} style={s.capCard}>
                <div style={s.capIcon}><cap.icon /></div>
                <div>
                  <div style={s.capTitle}>{cap.title}</div>
                  <div style={s.capDesc}>{cap.desc}</div>
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
            HR Admin Portal
          </div>

          <div style={s.formHeader}>
            <h2 style={s.signInTitle}>Admin sign-in</h2>
            <p style={s.signInSub}>
              Access is restricted to authorised PeopleHub administrators.
            </p>
          </div>

          {consentError && (
            <div style={s.alertBox}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.amber}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: T.ink, marginBottom: '0.15rem' }}>Session ended</div>
                <div style={{ fontSize: '0.78rem', color: T.inkSub }}>{consentError}</div>
              </div>
            </div>
          )}

          {error && <div style={s.errorBox}>⚠ {error}</div>}

          <button style={s.signInBtn} onClick={handleLogin} disabled={loading}>
            {loading ? (
              <span style={s.btnRow}><span style={s.spinner} /> Signing in…</span>
            ) : (
              <span style={s.btnRow}><LoginIcon /> Sign in to PeopleHub →</span>
            )}
          </button>

          <div style={s.infoNote}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.inkLight}
              strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>Admin accounts are created by your IT department. Contact them if you need access.</span>
          </div>

        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', minHeight: '100vh', fontFamily: T.fontFamily, background: T.bg, color: T.ink },

  left: { flex: '0 0 55%', display: 'flex', flexDirection: 'column', background: T.bg },
  leftInner: { flex: 1, display: 'flex', flexDirection: 'column', padding: '2.5rem 3rem 2rem' },

  brand: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '3rem' },
  brandMark: {
    width: '40px', height: '40px', borderRadius: '10px',
    background: T.amber, color: '#0d1117',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, fontSize: '1.2rem',
  },
  brandName: { fontSize: '1rem', fontWeight: 700, color: T.ink, letterSpacing: '-0.01em' },
  brandSub:  { fontSize: '0.68rem', color: T.inkSub, marginTop: '0.1rem' },

  statusPill: {
    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '999px', padding: '0.3rem 0.85rem',
    fontSize: '0.73rem', color: T.inkSub, marginBottom: '1.5rem', width: 'fit-content',
  },
  statusDot: { width: '7px', height: '7px', borderRadius: '50%', background: T.green, flexShrink: 0 },

  headline: { fontSize: '3rem', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 1.25rem', color: T.ink },
  tagline:  { fontSize: '0.95rem', color: T.inkSub, lineHeight: 1.65, margin: '0 0 2rem', fontWeight: 400 },
  divider:  { height: '1px', background: T.border, marginBottom: '1.75rem' },

  capCard:  { display: 'flex', alignItems: 'flex-start', gap: '0.85rem', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '0.85rem 1rem' },
  capIcon:  { width: '36px', height: '36px', borderRadius: '8px', background: T.amberLight, border: `1px solid ${T.amberBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.amber, flexShrink: 0 },
  capTitle: { fontSize: '0.85rem', fontWeight: 700, color: T.ink, marginBottom: '0.2rem' },
  capDesc:  { fontSize: '0.75rem', color: T.inkSub, lineHeight: 1.55 },

  trustRow: { display: 'flex', gap: '1.5rem', flexWrap: 'wrap' as const, marginTop: '0.5rem' },
  trustItem: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: T.inkLight },

  right: { flex: '0 0 45%', display: 'flex', flexDirection: 'column', background: T.bgCard, borderLeft: `1px solid ${T.border}` },
  rightInner: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '3rem', maxWidth: '420px', margin: '0 auto', width: '100%' },

  portalTag: { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, background: T.amberLight, border: `1px solid ${T.amberBorder}`, color: T.amber, borderRadius: '999px', padding: '0.25rem 0.75rem', marginBottom: '1.5rem', width: 'fit-content' },
  portalDot: { width: '6px', height: '6px', borderRadius: '50%', background: T.amber, flexShrink: 0 },

  formHeader:  { marginBottom: '2rem' },
  signInTitle: { fontSize: '1.9rem', fontWeight: 800, color: T.ink, letterSpacing: '-0.03em', margin: '0 0 0.5rem', lineHeight: 1.1 },
  signInSub:   { fontSize: '0.85rem', color: T.inkSub, margin: 0, lineHeight: 1.5 },

  alertBox: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: T.amberLight, border: `1px solid ${T.amberBorder}`, borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1.2rem' },
  errorBox:  { background: T.redLight, border: `1px solid ${T.redBorder}`, color: T.red, borderRadius: '8px', padding: '0.7rem 1rem', fontSize: '0.85rem', marginBottom: '1rem' },

  signInBtn: { width: '100%', padding: '0.9rem', background: T.amber, color: '#0d1117', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginBottom: '1.25rem', letterSpacing: '0.01em', fontFamily: T.fontFamily },
  btnRow:    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' },
  spinner:   { display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite' },

  infoNote: { display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.78rem', color: T.inkSub, lineHeight: 1.55, background: T.bgMuted, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '0.75rem 0.9rem', marginBottom: '1.5rem' },
}

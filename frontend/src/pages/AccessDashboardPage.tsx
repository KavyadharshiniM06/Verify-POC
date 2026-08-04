import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { T } from '../styles/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
interface AppLaunchResponse {
  launch_url: string
  has_access: boolean
  role: string
  app_id: string | null
}

interface ApiError {
  response?: { data?: { detail?: { code?: string; message?: string } | string } }
}

const SALESFORCE_ROLES = new Set(['SalesforceManager'])

const ROLE_DISPLAY: Record<string, string> = {
  SalesforceManager: 'Salesforce Admin',
  Manager:           'Manager',
  Admin:             'Administrator',
}

// ─── Salesforce Cloud icon (SVG) ─────────────────────────────────────────────
function SalesforceIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect width="64" height="64" rx="14" fill="#00A1E0" />
      <path d="M26 20c2-4 6-6 10-5 3 1 5 3 6 6 2-1 4-1 6 1 2 2 2 5 0 7h-24c-3-1-4-5-2-7 1-1 2-2 4-2z" fill="white" />
      <rect x="18" y="36" width="28" height="3" rx="1.5" fill="white" opacity="0.85" />
      <rect x="22" y="42" width="20" height="3" rx="1.5" fill="white" opacity="0.65" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  )
}

function LaunchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}

// ─── Access Dashboard page ────────────────────────────────────────────────────
export default function AccessDashboardPage() {
  const { user } = useAuth()
  const hasSalesforce = SALESFORCE_ROLES.has(user?.role ?? '')

  const [launching,    setLaunching]    = useState(false)
  const [launchError,  setLaunchError]  = useState<string | null>(null)
  const [launchUrl,    setLaunchUrl]    = useState<string | null>(null)

  // Pre-fetch the launch URL so the button is instant on click
  useEffect(() => {
    if (!hasSalesforce) return
    api.get<AppLaunchResponse>('/auth/sso/app-launch/salesforce')
      .then(r => setLaunchUrl(r.data.launch_url))
      .catch(() => {/* will retry on click */})
  }, [hasSalesforce])

  const handleLaunch = async () => {
    setLaunchError(null)
    setLaunching(true)
    try {
      let url = launchUrl
      if (!url) {
        const { data } = await api.get<AppLaunchResponse>('/auth/sso/app-launch/salesforce')
        url = data.launch_url
        setLaunchUrl(url)
      }
      // Open in new tab — IBM Verify uses the browser session cookie
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      const apiErr = err as ApiError
      const detail = apiErr?.response?.data?.detail
      const msg = typeof detail === 'object' ? detail?.message : (detail as string | undefined)
      setLaunchError(msg ?? 'Unable to launch Salesforce. Please try again.')
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div style={s.root}>
      {/* ── Page header ── */}
      <div style={s.pageHead}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <h1 style={s.pageTitle}>Access Dashboard</h1>
            <span style={s.idBadge}>IBM Verify</span>
          </div>
          <p style={s.pageSub}>
            Your entitled applications are shown below. Click an application to sign in automatically via IBM Verify Single Sign-On.
          </p>
        </div>
      </div>

      {/* ── Role + entitlement info bar ── */}
      <div style={s.infoBar}>
        <div style={s.infoItem}>
          <span style={s.infoLabel}>Signed in as</span>
          <span style={s.infoValue}>{user?.name}</span>
        </div>
        <div style={s.infoDivider} />
        <div style={s.infoItem}>
          <span style={s.infoLabel}>Role</span>
          <span style={{ ...s.infoValue, color: hasSalesforce ? '#06b6d4' : T.inkSub }}>
            {ROLE_DISPLAY[user?.role ?? ''] ?? user?.role ?? '—'}
          </span>
        </div>
        <div style={s.infoDivider} />
        <div style={s.infoItem}>
          <span style={s.infoLabel}>Identity Provider</span>
          <span style={s.infoValue}>IBM Verify SaaS</span>
        </div>
        <div style={s.infoDivider} />
        <div style={s.infoItem}>
          <span style={s.infoLabel}>Auth Method</span>
          <span style={s.infoValue}>SAML 2.0 SSO</span>
        </div>
      </div>

      {/* ── App tiles grid ── */}
      <div style={s.tilesGrid}>

        {/* ── Salesforce tile ── */}
        <div style={{ ...s.tile, ...(hasSalesforce ? s.tileEnabled : s.tileDisabled) }}>
          <div style={s.tileHeader}>
            <SalesforceIcon size={44} />
            {hasSalesforce ? (
              <span style={s.accessBadge}>Entitled</span>
            ) : (
              <span style={s.noAccessBadge}>No Access</span>
            )}
          </div>

          <div style={s.tileName}>Salesforce CRM</div>
          <div style={s.tileSub}>
            {hasSalesforce
              ? `Access as ${ROLE_DISPLAY[user?.role ?? ''] ?? user?.role}`
              : 'Your role does not include Salesforce access'}
          </div>

          {hasSalesforce && (
            <div style={s.ssoInfo}>
              <div style={s.ssoRow}>
                <span style={s.ssoLabel}>SSO Protocol</span>
                <span style={s.ssoVal}>SAML 2.0</span>
              </div>
              <div style={s.ssoRow}>
                <span style={s.ssoLabel}>Account provisioning</span>
                <span style={s.ssoVal}>Auto (JIT)</span>
              </div>
              <div style={s.ssoRow}>
                <span style={s.ssoLabel}>Identity Source</span>
                <span style={s.ssoVal}>IBM Verify</span>
              </div>
            </div>
          )}

          {launchError && (
            <div style={s.errBox}>⚠ {launchError}</div>
          )}

          {hasSalesforce ? (
            <button
              style={{ ...s.launchBtn, opacity: launching ? 0.7 : 1 }}
              onClick={handleLaunch}
              disabled={launching}
            >
              {launching ? (
                <><span style={s.spinner} /> Connecting…</>
              ) : (
                <><LaunchIcon /> Open in Salesforce</>
              )}
            </button>
          ) : (
            <div style={s.noAccessRow}>
              <LockIcon />
              <span>Contact HR to request Salesforce access</span>
            </div>
          )}
        </div>

        {/* ── Placeholder — future app ── */}
        <div style={{ ...s.tile, ...s.tileDisabled, opacity: 0.45 }}>
          <div style={s.tileHeader}>
            <div style={s.appIconPlaceholder}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.inkSub} strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </div>
            <span style={s.noAccessBadge}>Coming soon</span>
          </div>
          <div style={s.tileName}>ServiceNow</div>
          <div style={s.tileSub}>ITSM — to be configured</div>
        </div>

        {/* ── Placeholder — future app ── */}
        <div style={{ ...s.tile, ...s.tileDisabled, opacity: 0.45 }}>
          <div style={s.tileHeader}>
            <div style={s.appIconPlaceholder}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.inkSub} strokeWidth="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
            </div>
            <span style={s.noAccessBadge}>Coming soon</span>
          </div>
          <div style={s.tileName}>Workday</div>
          <div style={s.tileSub}>HCM — to be configured</div>
        </div>

      </div>

      {/* ── Flow explanation ── */}
      <div style={s.flowCard}>
        <div style={s.flowTitle}>How IBM Verify Workforce SSO works</div>
        <div style={s.flowSteps}>
          {[
            { n: '1', title: 'HR Onboards',     desc: 'HR Portal creates your identity in IBM Verify SaaS with your assigned role.' },
            { n: '2', title: 'Role → Group',    desc: 'Your role is synced to an IBM Verify group (e.g. Salesforce-Administrator) that entitles you to Salesforce.' },
            { n: '3', title: 'You Click Launch', desc: 'Clicking the tile triggers IBM Verify IdP-initiated SAML SSO to Salesforce.' },
            { n: '4', title: 'Auto Account',    desc: 'Salesforce JIT provisioning creates your account automatically on first login using the SAML assertion attributes.' },
          ].map(step => (
            <div key={step.n} style={s.flowStep}>
              <div style={s.flowNum}>{step.n}</div>
              <div>
                <div style={s.flowStepTitle}>{step.title}</div>
                <div style={s.flowStepDesc}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:      { fontFamily: T.fontFamily },
  pageHead:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' },
  pageTitle: { fontSize: '1.55rem', fontWeight: 700, color: T.ink, margin: 0 },
  pageSub:   { fontSize: '0.82rem', color: T.inkSub, marginTop: '0.25rem', maxWidth: '560px' },

  idBadge: {
    display: 'inline-flex', alignItems: 'center',
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    padding: '0.2rem 0.6rem', borderRadius: '999px',
    background: T.amberLight, color: T.amber, border: `1px solid ${T.amberBorder}`,
  },

  infoBar: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const,
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '10px', padding: '0.85rem 1.25rem',
    marginBottom: '1.5rem', gap: '0',
  },
  infoItem:    { display: 'flex', flexDirection: 'column' as const, padding: '0 1.25rem', gap: '0.15rem' },
  infoDivider: { width: '1px', height: '28px', background: T.border, flexShrink: 0 },
  infoLabel:   { fontSize: '0.65rem', fontWeight: 700, color: T.inkLight, letterSpacing: '0.06em', textTransform: 'uppercase' as const },
  infoValue:   { fontSize: '0.85rem', fontWeight: 600, color: T.ink },

  tilesGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1rem', marginBottom: '1.5rem',
  },

  tile: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '12px', padding: '1.5rem',
    display: 'flex', flexDirection: 'column' as const, gap: '0.6rem',
  },
  tileEnabled: { borderColor: 'rgba(6,182,212,0.4)' },
  tileDisabled:{ opacity: 1 },

  tileHeader:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  tileName:    { fontSize: '1rem', fontWeight: 700, color: T.ink, marginTop: '0.25rem' },
  tileSub:     { fontSize: '0.8rem', color: T.inkSub, lineHeight: 1.5 },

  accessBadge: {
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
    padding: '0.2rem 0.6rem', borderRadius: '999px',
    background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)',
  },
  noAccessBadge: {
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
    padding: '0.2rem 0.6rem', borderRadius: '999px',
    background: T.bgMuted, color: T.inkSub, border: `1px solid ${T.border}`,
  },

  ssoInfo: {
    background: T.bgMuted, borderRadius: '8px', padding: '0.65rem 0.85rem',
    display: 'flex', flexDirection: 'column' as const, gap: '0.3rem',
  },
  ssoRow:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  ssoLabel: { fontSize: '0.72rem', color: T.inkSub },
  ssoVal:   { fontSize: '0.72rem', fontWeight: 600, color: T.ink },

  launchBtn: {
    marginTop: '0.5rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
    padding: '0.65rem 1.25rem',
    background: '#00A1E0', color: '#fff',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontWeight: 700, fontSize: '0.88rem', fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  },
  spinner: {
    display: 'inline-block', width: '12px', height: '12px',
    border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },

  noAccessRow: {
    marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
    fontSize: '0.78rem', color: T.inkSub,
  },

  errBox: {
    fontSize: '0.78rem', color: T.red, background: T.redLight,
    border: `1px solid ${T.redBorder}`, borderRadius: '7px', padding: '0.5rem 0.75rem',
  },

  appIconPlaceholder: {
    width: '44px', height: '44px', borderRadius: '10px',
    background: T.bgMuted, border: `1px solid ${T.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  // Flow explanation
  flowCard: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '12px', padding: '1.25rem 1.5rem',
  },
  flowTitle: { fontSize: '0.85rem', fontWeight: 700, color: T.ink, marginBottom: '1rem' },
  flowSteps: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' },
  flowStep:  { display: 'flex', alignItems: 'flex-start', gap: '0.75rem' },
  flowNum:   {
    width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
    background: T.amberLight, color: T.amber, border: `1px solid ${T.amberBorder}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.78rem', fontWeight: 800,
  },
  flowStepTitle: { fontSize: '0.82rem', fontWeight: 700, color: T.ink, marginBottom: '0.2rem' },
  flowStepDesc:  { fontSize: '0.75rem', color: T.inkSub, lineHeight: 1.5 },
}

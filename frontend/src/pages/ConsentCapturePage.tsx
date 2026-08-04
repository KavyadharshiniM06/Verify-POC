/**
 * ConsentCapturePage — shown to first-time users immediately after OIDC login.
 *
 * Displays all consent purposes (loaded from /users/me/consents) and asks the
 * user to explicitly accept the required ones and choose optional ones before
 * proceeding to the dashboard.
 *
 * This fulfils the "Capture" phase of the CIAM lifecycle:
 *   capture → engage → manage → admin
 */
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { T } from '../styles/theme'

interface ConsentRecord {
  id: number
  purpose: string
  label: string
  description: string
  category: string
  is_required: boolean
  is_active: boolean
  granted_at: string | null
  revoked_at: string | null
}

const CATEGORY_ORDER = ['essential', 'functional', 'marketing']
const CATEGORY_LABEL: Record<string, string> = {
  essential: 'Essential — Required for the service',
  functional: 'Functional — Enhance your experience',
  marketing: 'Marketing & Research',
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  )
}

export default function ConsentCapturePage() {
  const navigate = useNavigate()
  const [consents, setConsents] = useState<ConsentRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving,  setSaving]    = useState(false)
  const [error,   setError]     = useState<string | null>(null)
  // Track which optional consents the user accepts
  const [optionalAccepted, setOptionalAccepted] = useState<Record<number, boolean>>({})

  useEffect(() => {
    api.get<ConsentRecord[]>('/users/me/consents')
      .then(r => {
        setConsents(r.data)
        // Pre-accept all optional consents by default (user can uncheck)
        const init: Record<number, boolean> = {}
        r.data.forEach(c => {
          if (!c.is_required) init[c.id] = true
        })
        setOptionalAccepted(init)
      })
      .catch(() => setError('Unable to load consent information. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  const grouped: Record<string, ConsentRecord[]> = {}
  consents.forEach(c => {
    const cat = c.category || 'general'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(c)
  })

  const handleToggle = (id: number) => {
    setOptionalAccepted(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleContinue = async () => {
    setSaving(true)
    setError(null)
    try {
      // Revoke any optional consents the user explicitly unchecked
      const promises: Promise<unknown>[] = []
      consents.forEach(c => {
        if (!c.is_required && !optionalAccepted[c.id]) {
          promises.push(api.put(`/users/me/consents/${c.id}/revoke`).catch(() => {}))
        }
      })
      await Promise.all(promises)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={s.fullPage}>
        <div style={s.loadingCard}>
          <div style={s.spinner} />
          <p style={{ color: T.inkSub, fontSize: '0.9rem', margin: 0 }}>Loading your privacy preferences…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={s.fullPage}>
      <div style={s.card}>

        {/* Header */}
        <div style={s.header}>
          <div style={s.logoRow}>
            <div style={s.brandMark}>M</div>
            <div>
              <div style={s.brandName}>MockBank</div>
              <div style={s.brandSub}>Digital Banking</div>
            </div>
          </div>
          <div style={s.iconCircle}><ShieldIcon /></div>
          <h1 style={s.title}>Welcome to MockBank</h1>
          <p style={s.sub}>
            Before you continue, please review how we use your data. Your privacy matters.
            Required consents ensure the service works correctly; optional ones can be changed
            in <strong>Settings → Privacy</strong> at any time.
          </p>
          <div style={s.ibvBadge}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Identity managed by IBM Verify
          </div>
        </div>

        {/* Consent groups */}
        <div style={s.groups}>
          {CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => (
            <div key={cat} style={s.group}>
              <div style={s.groupLabel}>{CATEGORY_LABEL[cat] ?? cat}</div>
              {grouped[cat].map(c => (
                <div key={c.id} style={s.consentRow}>
                  <div style={s.consentLeft}>
                    {c.is_required ? (
                      <div style={{ ...s.checkbox, ...s.checkboxRequired }}>
                        <LockIcon />
                      </div>
                    ) : (
                      <button
                        style={{ ...s.checkbox, ...(optionalAccepted[c.id] ? s.checkboxChecked : s.checkboxUnchecked) }}
                        onClick={() => handleToggle(c.id)}
                        aria-pressed={optionalAccepted[c.id] ?? false}
                      >
                        {optionalAccepted[c.id] && <CheckIcon />}
                      </button>
                    )}
                  </div>
                  <div style={s.consentBody}>
                    <div style={s.consentLabel}>
                      {c.label}
                      {c.is_required && (
                        <span style={s.requiredTag}>Required</span>
                      )}
                    </div>
                    <div style={s.consentDesc}>{c.description}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {error && (
          <div style={s.errorBox}>⚠ {error}</div>
        )}

        {/* Actions */}
        <div style={s.actions}>
          <button
            style={{ ...s.continueBtn, opacity: saving ? 0.7 : 1 }}
            onClick={handleContinue}
            disabled={saving}
          >
            {saving ? (
              <><span style={s.btnSpinner} /> Saving preferences…</>
            ) : (
              <>
                <CheckIcon />
                Accept &amp; Continue to Dashboard
              </>
            )}
          </button>
          <p style={s.legalNote}>
            By continuing you confirm you have read and understood our Privacy Policy.
            Consents are stored securely and you may manage them at any time in Settings.
          </p>
        </div>

      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  fullPage: {
    minHeight: '100vh',
    background: T.bg,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '2rem 1rem',
    fontFamily: T.fontFamily,
  },
  card: {
    width: '100%',
    maxWidth: '640px',
    background: T.bgCard,
    border: `1px solid ${T.border}`,
    borderRadius: '16px',
    overflow: 'hidden',
  },
  loadingCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    padding: '4rem',
    background: T.bgCard,
    borderRadius: '16px',
    border: `1px solid ${T.border}`,
  },
  spinner: {
    width: '28px',
    height: '28px',
    border: `3px solid ${T.border}`,
    borderTopColor: T.amber,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  header: {
    background: T.bgMuted,
    borderBottom: `1px solid ${T.border}`,
    padding: '2rem 2rem 1.5rem',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.65rem',
    marginBottom: '1.5rem',
  },
  brandMark: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: T.amber,
    color: '#0d1117',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    fontSize: '1.1rem',
    flexShrink: 0,
  },
  brandName: { fontSize: '0.95rem', fontWeight: 700, color: T.ink },
  brandSub:  { fontSize: '0.65rem', color: T.inkSub },
  iconCircle: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: T.amberLight,
    border: `1px solid ${T.amberBorder}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: T.amber,
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 800,
    color: T.ink,
    margin: '0 0 0.5rem',
    letterSpacing: '-0.02em',
  },
  sub: {
    fontSize: '0.85rem',
    color: T.inkSub,
    lineHeight: 1.65,
    margin: '0 0 1rem',
  },
  ibvBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    padding: '0.25rem 0.65rem',
    borderRadius: '999px',
    background: T.amberLight,
    color: T.amber,
    border: `1px solid ${T.amberBorder}`,
  },
  groups: {
    padding: '1.5rem 2rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.5rem',
  },
  group: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  groupLabel: {
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: T.inkLight,
    paddingBottom: '0.35rem',
    borderBottom: `1px solid ${T.border}`,
  },
  consentRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.85rem',
    padding: '0.75rem',
    borderRadius: '10px',
    background: T.bgMuted,
    border: `1px solid ${T.borderLight}`,
  },
  consentLeft: {
    flexShrink: 0,
    paddingTop: '1px',
  },
  consentBody: {
    flex: 1,
    minWidth: 0,
  },
  consentLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.88rem',
    fontWeight: 700,
    color: T.ink,
    marginBottom: '0.25rem',
  },
  requiredTag: {
    fontSize: '0.6rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    padding: '0.15rem 0.45rem',
    borderRadius: '999px',
    background: T.amberLight,
    color: T.amber,
    border: `1px solid ${T.amberBorder}`,
  },
  consentDesc: {
    fontSize: '0.8rem',
    color: T.inkSub,
    lineHeight: 1.55,
  },
  checkbox: {
    width: '22px',
    height: '22px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: 'none',
    flexShrink: 0,
    transition: 'background 0.15s, border-color 0.15s',
  },
  checkboxRequired: {
    background: T.bgCard,
    border: `1px solid ${T.border}`,
    color: T.inkLight,
    cursor: 'default',
  },
  checkboxChecked: {
    background: T.amber,
    border: `1px solid ${T.amber}`,
    color: '#0d1117',
    cursor: 'pointer',
  },
  checkboxUnchecked: {
    background: T.bgCard,
    border: `1px solid ${T.border}`,
    color: 'transparent',
    cursor: 'pointer',
  },
  actions: {
    padding: '1.25rem 2rem 2rem',
    borderTop: `1px solid ${T.border}`,
  },
  continueBtn: {
    width: '100%',
    padding: '0.9rem',
    background: T.amber,
    color: '#0d1117',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: '0.95rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontFamily: 'inherit',
    marginBottom: '1rem',
    letterSpacing: '0.01em',
  },
  btnSpinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid rgba(0,0,0,0.2)',
    borderTopColor: '#000',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  legalNote: {
    fontSize: '0.72rem',
    color: T.inkLight,
    lineHeight: 1.6,
    textAlign: 'center' as const,
    margin: 0,
  },
  errorBox: {
    margin: '0 2rem',
    background: T.redLight,
    border: `1px solid ${T.redBorder}`,
    color: T.red,
    borderRadius: '8px',
    padding: '0.7rem 1rem',
    fontSize: '0.85rem',
    marginBottom: '1rem',
  },
}

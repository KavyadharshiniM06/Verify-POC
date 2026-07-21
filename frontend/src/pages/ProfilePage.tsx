import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { T } from '../styles/theme'

interface EnrolledFactors {
  fido2: boolean
  totp: boolean
  push: boolean
  email_otp: boolean
  sso: boolean
}

interface MeResponse {
  id: string
  email: string
  name: string
  role: string
  is_active: boolean
  enrolled_factors: EnrolledFactors
}

/** Pending high-risk action stored in sessionStorage so it can be resumed after step-up. */
type PendingAction =
  | { type: 'delete_account' }
  | { type: 'unenroll'; factor: string }

const PENDING_ACTION_KEY = 'mb_pending_profile_action'

export default function ProfilePage() {
  const { user, token, stepupVerified, login, logout } = useAuth()
  const navigate = useNavigate()
  const initial = user?.name?.charAt(0)?.toUpperCase() ?? '?'

  const [factors, setFactors] = useState<EnrolledFactors | null>(null)
  const [loadingFactors, setLoadingFactors] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  // ── Inline profile edit ──────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(user?.name ?? '')
  const [editEmail, setEditEmail] = useState(user?.email ?? '')
  const [editSaving, setEditSaving] = useState(false)

  async function handleSaveProfile() {
    setEditSaving(true)
    setActionError(null)
    setActionMsg(null)
    try {
      const { data } = await api.put<MeResponse>('/users/me', {
        name: editName || undefined,
        email: editEmail || undefined,
      })
      // Refresh in-session user so nav/header reflects new name immediately
      login(token!, { name: data.name, email: data.email, role: data.role })
      setIsEditing(false)
      setActionMsg('Profile updated successfully.')
    } catch {
      setActionError('Failed to save profile. Please try again.')
    } finally {
      setEditSaving(false)
    }
  }

  // ── Fetch live enrollment status ────────────────────────────────────────
  const loadFactors = () => {
    api.get<MeResponse>('/users/me')
      .then(({ data }) => setFactors(data.enrolled_factors))
      .catch(() => setFactors(null))
      .finally(() => setLoadingFactors(false))
  }

  useEffect(() => {
    loadFactors()
  }, [])

  // ── Resume a pending action after returning from step-up ────────────────
  useEffect(() => {
    if (!stepupVerified) return
    const raw = sessionStorage.getItem(PENDING_ACTION_KEY)
    if (!raw) return
    const action: PendingAction = JSON.parse(raw)
    sessionStorage.removeItem(PENDING_ACTION_KEY)

    if (action.type === 'delete_account') {
      void executeDeleteAccount()
    } else if (action.type === 'unenroll') {
      void executeUnenroll(action.factor)
    }
  }, [stepupVerified]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step-up redirect helper ─────────────────────────────────────────────
  function requireStepUp(action: PendingAction) {
    sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(action))
    navigate('/stepup?return_to=/profile')
  }

  // ── Delete own account ──────────────────────────────────────────────────
  async function executeDeleteAccount() {
    const confirmed = window.prompt(
      'This is irreversible. Type DELETE to confirm account deletion.'
    )
    if (confirmed !== 'DELETE') {
      setActionError('Account deletion cancelled.')
      return
    }
    try {
      await api.delete('/users/me')
      logout()
      navigate('/', { replace: true })
    } catch {
      setActionError('Account deletion failed. Please try again.')
    }
  }

  function handleDeleteAccount() {
    setActionError(null)
    setActionMsg(null)
    if (!stepupVerified) {
      requireStepUp({ type: 'delete_account' })
      return
    }
    void executeDeleteAccount()
  }

  // ── Unenroll a factor ───────────────────────────────────────────────────
  async function executeUnenroll(factor: string) {
    const id = user ? encodeURIComponent(
      // We need the verify_user_id; read from cached /users/me response or re-fetch.
      sessionStorage.getItem('mb_verify_user_id') ?? ''
    ) : ''
    if (!id) {
      // Fallback: re-fetch /users/me to get the id then unenroll.
      try {
        const { data } = await api.get<MeResponse>('/users/me')
        sessionStorage.setItem('mb_verify_user_id', data.id)
        await api.delete(`/users/${encodeURIComponent(data.id)}/factors/${factor}`)
        setActionMsg(`${factor} has been unenrolled.`)
        loadFactors()
      } catch {
        setActionError(`Failed to unenroll ${factor}. Please try again.`)
      }
      return
    }
    try {
      await api.delete(`/users/${id}/factors/${factor}`)
      setActionMsg(`${factor} has been unenrolled.`)
      loadFactors()
    } catch {
      setActionError(`Failed to unenroll ${factor}. Please try again.`)
    }
  }

  function handleUnenroll(factor: string) {
    setActionError(null)
    setActionMsg(null)
    if (!window.confirm(`Remove your ${factor} authenticator? This cannot be undone without re-enrolling.`)) return
    if (!stepupVerified) {
      requireStepUp({ type: 'unenroll', factor })
      return
    }
    void executeUnenroll(factor)
  }

  // ── Auth methods list ───────────────────────────────────────────────────
  const AUTH_METHODS = [
    {
      key: 'fido2',
      icon: '🪪',
      name: 'Passkey (Face ID / Touch ID / Fingerprint)',
      description: 'FIDO2/WebAuthn biometric authentication',
      enrolled: factors?.fido2 ?? false,
      action: '/register',
      actionLabel: 'Add / manage passkey',
      canUnenroll: true,
    },
    {
      key: 'totp',
      icon: '🔢',
      name: 'TOTP Authenticator App',
      description: 'Google Authenticator, Authy, IBM Verify app',
      enrolled: factors?.totp ?? false,
      action: '/auth/totp/enroll',
      actionLabel: 'Enroll now',
      canUnenroll: true,
    },
    {
      key: 'push',
      icon: '📱',
      name: 'Push Notification',
      description: 'Approve login from your mobile device',
      enrolled: factors?.push ?? false,
      action: null,
      actionLabel: 'Requires mobile app',
      canUnenroll: true,
    },
    {
      key: 'email_otp',
      icon: '📧',
      name: 'Email OTP',
      description: 'One-time code sent to your email',
      enrolled: factors?.email_otp ?? true,
      action: null,
      actionLabel: null,
      canUnenroll: false,  // always available; unenroll not supported
    },
    {
      key: 'sso',
      icon: '🔐',
      name: 'SSO (OIDC)',
      description: 'Federated login via identity provider',
      enrolled: factors?.sso ?? false,
      action: null,
      actionLabel: 'Login with SSO to link',
      canUnenroll: false,
    },
  ]

  return (
    <div>
      <h2 style={s.heading}>Profile</h2>

      {/* User card */}
      <div style={s.userCard}>
        <div style={s.avatar}>{initial}</div>
        {!isEditing ? (
          <div style={{ flex: 1 }}>
            <div style={s.name}>{user?.name}</div>
            <div style={s.email}>{user?.email}</div>
            <div style={{ marginTop: '0.35rem' }}>
              <span style={s.roleBadge}>{user?.role}</span>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input
              style={s.editInput}
              value={editName}
              placeholder="Full name"
              onChange={e => setEditName(e.target.value)}
            />
            <input
              style={s.editInput}
              type="email"
              value={editEmail}
              placeholder="Email address"
              onChange={e => setEditEmail(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button style={s.saveBtn} onClick={handleSaveProfile} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save'}
              </button>
              <button style={s.cancelEditBtn} onClick={() => {
                setIsEditing(false)
                setEditName(user?.name ?? '')
                setEditEmail(user?.email ?? '')
              }}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {!isEditing && (
          <button style={s.editProfileBtn} onClick={() => {
            setIsEditing(true)
            setEditName(user?.name ?? '')
            setEditEmail(user?.email ?? '')
            setActionMsg(null)
            setActionError(null)
          }}>
            Edit Profile
          </button>
        )}
      </div>

      {/* Feedback banner */}
      {actionMsg && <div style={s.okBox}>✓ {actionMsg}</div>}
      {actionError && <div style={s.errBox}>⚠ {actionError}</div>}

      {/* Auth methods */}
      <h3 style={s.subheading}>Enrolled Authentication Methods</h3>
      {loadingFactors ? (
        <div style={{ color: T.inkSub, fontSize: '0.875rem', padding: '0.5rem 0' }}>
          Loading enrollment status…
        </div>
      ) : (
        <div style={s.methodList}>
          {AUTH_METHODS.map(m => (
            <div key={m.name} style={s.method}>
              <span style={s.icon}>{m.icon}</span>
              <div style={s.info}>
                <div style={s.methodName}>{m.name}</div>
                <div style={s.methodDesc}>{m.description}</div>
              </div>
              <div style={s.right}>
                <span style={{
                  ...s.statusBadge,
                  color: m.enrolled ? T.green : T.inkSub,
                  background: m.enrolled ? T.greenLight : T.bgMuted,
                  border: `1px solid ${m.enrolled ? T.greenBorder : T.border}`,
                }}>
                  {m.enrolled ? '✓ Enrolled' : 'Not enrolled'}
                </span>
                {m.action && (
                  <button style={s.actionBtn} onClick={() => navigate(m.action!)}>
                    {m.actionLabel}
                  </button>
                )}
                {!m.action && m.actionLabel && (
                  <span style={s.hint}>{m.actionLabel}</span>
                )}
                {/* Unenroll button — only shown for enrolled factors that support removal */}
                {m.canUnenroll && m.enrolled && (
                  <button
                    style={s.removeBtn}
                    onClick={() => handleUnenroll(m.key)}
                    title="Remove this authenticator (requires MFA verification)"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loadingFactors && factors === null && (
        <div style={s.noteBox}>
          <strong>Note:</strong> Could not fetch live enrollment data.
          Enrollment statuses shown may not reflect the current state.
        </div>
      )}

      {/* ── Danger Zone ──────────────────────────────────────────────── */}
      <h3 style={{ ...s.subheading, marginTop: '2rem', color: T.red }}>Danger Zone</h3>
      <div style={s.dangerCard}>
        <div>
          <div style={s.dangerTitle}>Delete My Account</div>
          <div style={s.dangerDesc}>
            Permanently removes your account and all banking data. This action is irreversible
            and requires MFA verification.
          </div>
        </div>
        <button style={s.dangerBtn} onClick={handleDeleteAccount}>
          Delete account
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 800, color: T.ink, letterSpacing: '-0.02em' },
  userCard: {
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusCard,
    boxShadow: T.shadowCard,
    padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.1rem', marginBottom: '1.5rem',
  },
  avatar: {
    width: '54px', height: '54px', borderRadius: '50%', background: T.amber,
    color: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.4rem', fontWeight: 800, flexShrink: 0,
  },
  name: { fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.15rem', color: T.ink, letterSpacing: '-0.01em' },
  email: { fontSize: '0.875rem', color: T.inkSub },
  roleBadge: {
    display: 'inline-block',
    fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.06em', padding: '0.18rem 0.55rem',
    background: T.amberLight, color: T.amber, border: `1px solid ${T.amberBorder}`,
    borderRadius: '999px',
  },
  okBox: {
    background: T.greenLight, border: `1px solid ${T.greenBorder}`, color: T.green,
    borderRadius: T.radiusInner, padding: '0.75rem 1rem', fontSize: '0.85rem', marginBottom: '1rem',
  },
  errBox: {
    background: T.redLight, border: `1px solid ${T.redBorder}`, color: T.red,
    borderRadius: T.radiusInner, padding: '0.75rem 1rem', fontSize: '0.85rem', marginBottom: '1rem',
  },
  subheading: {
    fontSize: '0.9rem', fontWeight: 700, color: T.ink, marginBottom: '0.75rem',
    letterSpacing: '-0.01em',
  },
  methodList: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' },
  method: {
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusInner,
    padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
    boxShadow: T.shadowCard,
  },
  icon: { fontSize: '1.2rem', width: '1.75rem', textAlign: 'center', flexShrink: 0 },
  info: { flex: 1 },
  methodName: { fontSize: '0.9rem', fontWeight: 600, color: T.ink },
  methodDesc: { fontSize: '0.78rem', color: T.inkSub, marginTop: '0.1rem' },
  right: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' as const },
  statusBadge: {
    fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem',
    borderRadius: '999px', whiteSpace: 'nowrap' as const,
  },
  editProfileBtn: {
    padding: '0.45rem 1rem', background: T.bgMuted, border: `1px solid ${T.border}`,
    borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
    color: T.ink, whiteSpace: 'nowrap' as const, flexShrink: 0,
  },
  actionBtn: {
    padding: '0.35rem 0.65rem', background: T.bgMuted, border: `1px solid ${T.border}`,
    borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.78rem',
    whiteSpace: 'nowrap' as const, color: T.ink, fontWeight: 600,
  },
  removeBtn: {
    padding: '0.3rem 0.6rem', background: T.redLight, border: `1px solid ${T.redBorder}`,
    color: T.red, borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.75rem',
    whiteSpace: 'nowrap' as const, fontWeight: 600,
  },
  hint: { fontSize: '0.75rem', color: T.inkSub, whiteSpace: 'nowrap' as const, fontStyle: 'italic' },
  noteBox: {
    background: T.amberLight, border: `1px solid ${T.amberBorder}`, borderRadius: T.radiusInner,
    padding: '0.75rem 1rem', fontSize: '0.8rem', color: T.amber,
  },
  dangerCard: {
    background: T.bgCard, border: `1px solid ${T.redBorder}`, borderRadius: T.radiusCard,
    padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' as const,
    boxShadow: T.shadowCard,
  },
  dangerTitle: { fontSize: '0.9rem', fontWeight: 700, color: T.red, marginBottom: '0.25rem' },
  dangerDesc: { fontSize: '0.8rem', color: T.inkSub, maxWidth: '480px' },
  dangerBtn: {
    padding: '0.5rem 1.2rem', background: T.red, color: '#fff',
    border: 'none', borderRadius: T.radiusPill, cursor: 'pointer', fontWeight: 700,
    fontSize: '0.85rem', whiteSpace: 'nowrap' as const, flexShrink: 0,
  },
  editInput: {
    padding: '0.45rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: T.radiusInput,
    fontSize: '0.875rem', color: T.ink, outline: 'none', width: '100%', maxWidth: '280px',
    background: T.bgInput,
  },
  saveBtn: {
    padding: '0.4rem 0.85rem', background: T.amber, color: '#0d1117',
    border: 'none', borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
  },
  cancelEditBtn: {
    padding: '0.4rem 0.75rem', background: T.bgMuted, border: `1px solid ${T.border}`,
    borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.82rem', color: T.inkSub,
  },
}

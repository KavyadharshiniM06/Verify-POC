import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

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
  const { user, stepupVerified, logout } = useAuth()
  const navigate = useNavigate()
  const initial = user?.name?.charAt(0)?.toUpperCase() ?? '?'

  const [factors, setFactors] = useState<EnrolledFactors | null>(null)
  const [loadingFactors, setLoadingFactors] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

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
      name: 'IBM Verify Push Notification',
      description: 'Approve login from your mobile device',
      enrolled: factors?.push ?? false,
      action: null,
      actionLabel: 'Requires IBM Verify mobile app',
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
      description: 'Federated login via IBM Verify',
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
        <div>
          <div style={s.name}>{user?.name}</div>
          <div style={s.email}>{user?.email}</div>
          <div style={{ ...s.email, marginTop: '0.2rem' }}>
            <span style={s.roleBadge}>{user?.role}</span>
          </div>
        </div>
      </div>

      {/* Feedback banner */}
      {actionMsg && <div style={s.okBox}>{actionMsg}</div>}
      {actionError && <div style={s.errBox}>{actionError}</div>}

      {/* Auth methods */}
      <h3 style={s.subheading}>Enrolled Authentication Methods</h3>
      {loadingFactors ? (
        <div style={{ color: '#57606a', fontSize: '0.875rem', padding: '0.5rem 0' }}>
          Loading enrollment status from IBM Verify...
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
                  color: m.enrolled ? '#10b981' : '#57606a',
                  background: m.enrolled ? '#f0fdf4' : '#f7f8fa',
                  borderColor: m.enrolled ? '#86efac' : '#e5e7eb',
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
          <strong>Note:</strong> Could not fetch live enrollment data from IBM Verify.
          Enrollment statuses shown may not reflect the current state.
        </div>
      )}

      {/* ── Danger Zone ──────────────────────────────────────────────── */}
      <h3 style={{ ...s.subheading, marginTop: '2rem', color: '#dc2626' }}>Danger Zone</h3>
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
  heading: { margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1f2328' },
  userCard: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
    padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem',
  },
  avatar: {
    width: '52px', height: '52px', borderRadius: '50%', background: '#3b82d4',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.4rem', fontWeight: 700, flexShrink: 0,
  },
  name: { fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.2rem', color: '#1f2328' },
  email: { fontSize: '0.875rem', color: '#57606a' },
  roleBadge: {
    display: 'inline-block',
    fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.05em', padding: '0.15rem 0.5rem',
    background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
    borderRadius: '999px',
  },
  okBox: {
    background: '#f0fdf4', border: '1px solid #86efac', color: '#16a34a',
    borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.85rem', marginBottom: '1rem',
  },
  errBox: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.85rem', marginBottom: '1rem',
  },
  subheading: { fontSize: '1rem', fontWeight: 600, color: '#1f2328', marginBottom: '0.75rem' },
  methodList: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' },
  method: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
    padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
  },
  icon: { fontSize: '1.2rem', width: '1.75rem', textAlign: 'center', flexShrink: 0 },
  info: { flex: 1 },
  methodName: { fontSize: '0.9rem', fontWeight: 600, color: '#1f2328' },
  methodDesc: { fontSize: '0.78rem', color: '#57606a', marginTop: '0.1rem' },
  right: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' as const },
  statusBadge: {
    fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem',
    borderRadius: '999px', border: '1px solid', whiteSpace: 'nowrap' as const,
  },
  actionBtn: {
    padding: '0.35rem 0.6rem', background: '#f7f8fa', border: '1px solid #e5e7eb',
    borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap' as const,
  },
  removeBtn: {
    padding: '0.3rem 0.55rem', background: '#fff', border: '1px solid #fecaca',
    color: '#dc2626', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem',
    whiteSpace: 'nowrap' as const,
  },
  hint: { fontSize: '0.75rem', color: '#57606a', whiteSpace: 'nowrap' as const, fontStyle: 'italic' },
  noteBox: {
    background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px',
    padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#92400e',
  },
  dangerCard: {
    background: '#fff', border: '1px solid #fecaca', borderRadius: '10px',
    padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' as const,
  },
  dangerTitle: { fontSize: '0.9rem', fontWeight: 700, color: '#dc2626', marginBottom: '0.25rem' },
  dangerDesc: { fontSize: '0.8rem', color: '#57606a', maxWidth: '480px' },
  dangerBtn: {
    padding: '0.5rem 1.2rem', background: '#dc2626', color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600,
    fontSize: '0.85rem', whiteSpace: 'nowrap' as const, flexShrink: 0,
  },
}

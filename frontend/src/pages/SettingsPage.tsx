import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { LT as T } from '../styles/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
type Section =
  | 'profile'
  | 'security'
  | 'identity'
  | 'privacy'
  | 'notifications'
  | 'preferences'

interface Toast { msg: string; kind: 'success' | 'error' }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Field({
  label, value, type = 'text', onChange, readonly = false, hint,
}: {
  label: string; value: string; type?: string
  onChange?: (v: string) => void; readonly?: boolean; hint?: string
}) {
  return (
    <div style={f.fieldWrap}>
      <label style={f.label}>{label}</label>
      <input
        type={type}
        value={value}
        readOnly={readonly}
        onChange={e => onChange?.(e.target.value)}
        style={{ ...f.input, ...(readonly ? f.inputReadonly : {}) }}
      />
      {hint && <div style={f.hint}>{hint}</div>}
    </div>
  )
}

function Toggle({ label, sub, checked, onChange, disabled }: {
  label: string; sub?: string; checked: boolean
  onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div style={f.toggleRow}>
      <div style={{ flex: 1 }}>
        <div style={{ ...f.toggleLabel, opacity: disabled ? 0.45 : 1 }}>{label}</div>
        {sub && <div style={{ ...f.toggleSub, opacity: disabled ? 0.45 : 1 }}>{sub}</div>}
      </div>
      <button
        style={{ ...f.track, background: checked ? T.amber : T.bgMuted, opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer' }}
        onClick={() => !disabled && onChange(!checked)}
        aria-pressed={checked}
        disabled={disabled}
      >
        <span style={{ ...f.thumb, left: checked ? '23px' : '3px' }} />
      </button>
    </div>
  )
}

function SectionCard({ title, children, action }: {
  title: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div style={f.card}>
      <div style={f.cardHead}>
        <div style={f.cardTitle}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

function SaveBtn({ onClick, loading, label }: { onClick: () => void; loading?: boolean; label?: string }) {
  return (
    <button style={f.saveBtn} onClick={onClick} disabled={loading}>
      {loading ? 'Saving…' : (label ?? 'Save changes')}
    </button>
  )
}

function CancelBtn({ onClick }: { onClick: () => void }) {
  return <button style={f.cancelBtn} onClick={onClick}>Cancel</button>
}

function Select({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  return (
    <div style={f.fieldWrap}>
      <label style={f.label}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={f.select}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
}

function InfoBanner({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ padding: '0.75rem 1rem', background: T.blueLight, borderRadius: '8px', border: `1px solid ${T.blue}44`, display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.75rem' }}>
      <span style={{ fontSize: '1rem', marginTop: '1px' }}>{icon}</span>
      <span style={{ fontSize: '0.8rem', color: T.blue, lineHeight: 1.5 }}>{text}</span>
    </div>
  )
}

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ALL: { id: Section; label: string; icon: string; roles: string[] }[] = [
  { id: 'profile',       label: 'My Profile',        icon: '👤', roles: ['Manager','SalesforceManager','Admin'] },
  { id: 'security',      label: 'Change Password',    icon: '🔑', roles: ['Manager','SalesforceManager','Admin'] },
  { id: 'identity',      label: 'Auth Methods',       icon: '🪪', roles: ['Manager','SalesforceManager','Admin'] },
  { id: 'privacy',       label: 'Privacy & Consent',  icon: '🛡️', roles: ['Manager','SalesforceManager','Admin'] },
  { id: 'notifications', label: 'Alerts',             icon: '🔔', roles: ['Manager','SalesforceManager','Admin'] },
  { id: 'preferences',   label: 'Appearance',         icon: '🎨', roles: ['Manager','SalesforceManager','Admin'] },
]

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuth()
  const role = user?.role ?? 'Manager'
  const [section, setSection] = useState<Section>('profile')
  const [toast,   setToast]   = useState<Toast | null>(null)

  const nav = NAV_ALL.filter(n => n.roles.includes(role))
  const activeSection = nav.find(n => n.id === section) ? section : nav[0]?.id ?? 'profile'

  const showToast = (msg: string, kind: Toast['kind'] = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3200)
  }

  return (
    <div style={s.root}>
      {toast && (
        <div style={{ ...s.toast, background: toast.kind === 'success' ? '#ffffff' : T.red, color: toast.kind === 'success' ? '#111827' : '#fff', border: toast.kind === 'success' ? '1px solid #e5e7eb' : 'none' }}>
          {toast.kind === 'success' ? '✓' : '✗'}  {toast.msg}
        </div>
      )}

      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Account Settings</h1>
          <p style={s.pageSub}>Manage your personal profile, authentication methods, privacy consents, and display preferences.</p>
        </div>
        <div style={{ ...s.roleBadge, ...s.roleBadgeMgr }}>
          {role === 'Manager' ? 'Credit Analyst' : role}
        </div>
      </div>

      <div style={s.body}>
        <aside style={s.sidebar}>
          <div style={s.navGroup}>MY ACCOUNT</div>
          {nav.map(n => (
            <button key={n.id}
              style={{ ...s.navBtn, ...(activeSection === n.id ? s.navBtnActive : {}) }}
              onClick={() => setSection(n.id)}
            >
              <span style={s.navIcon}>{n.icon}</span>{n.label}
            </button>
          ))}
        </aside>

        <div style={s.content}>
          {activeSection === 'profile'       && <ProfileSection       user={user} role={role} showToast={showToast} />}
          {activeSection === 'security'      && <SecuritySection      role={role} showToast={showToast} />}
          {activeSection === 'identity'      && <IdentitySection      showToast={showToast} />}
          {activeSection === 'privacy'       && <PrivacySection       showToast={showToast} />}
          {activeSection === 'notifications' && <NotificationsSection role={role} showToast={showToast} />}
          {activeSection === 'preferences'   && <PreferencesSection   showToast={showToast} />}
        </div>
      </div>
    </div>
  )
}

// ─── Profile ─────────────────────────────────────────────────────────────────
function ProfileSection({ user, role, showToast }: {
  user: { name: string; email: string; role: string } | null
  role: string
  showToast: (m: string, kind?: 'success' | 'error') => void
}) {
  const { token, login } = useAuth()
  const [name,      setName]      = useState(user?.name  ?? '')
  const [email,     setEmail]     = useState(user?.email ?? '')
  const [phone,     setPhone]     = useState('')
  const [phoneOrig, setPhoneOrig] = useState('')
  const [address,   setAddress]   = useState('742 Evergreen Terrace, Springfield, IL 62701')
  const [jobTitle,  setJobTitle]  = useState(role === 'Admin' ? 'IAM Administrator' : role === 'SalesforceManager' ? 'Salesforce Manager' : 'Credit Analyst')
  const [dept,      setDept]      = useState(role === 'Admin' ? 'IT & Identity Management' : role === 'SalesforceManager' ? 'Sales' : 'Finance & Credit')
  const [saving,    setSaving]    = useState(false)

  // Fetch live phone from IBM Verify via /users/me
  useEffect(() => {
    api.get<{ phone?: string; name: string; email: string; role: string }>('/users/me')
      .then(({ data }) => {
        if (data.phone) { setPhone(data.phone); setPhoneOrig(data.phone) }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true)
    try {
      const payload: { name: string; email: string; phone?: string } = { name, email }
      if (phone !== phoneOrig) payload.phone = phone
      const { data } = await api.put('/users/me', payload)
      setPhoneOrig(phone)
      // Refresh in-session user so nav/header reflects new name immediately
      login(token!, { name: data.name, email: data.email, role: data.role })
      showToast('Profile updated successfully.')
    } catch {
      showToast('Failed to save profile. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SectionCard title="Personal Information">
        <div style={f.grid2}>
          <Field label="Full name"     value={name}  onChange={setName} />
          <Field label="Email address" value={email} onChange={setEmail} type="email" />
          <Field label="Phone number"  value={phone} onChange={setPhone} type="tel" />
          <Field label="Role"
            value={
              user?.role === 'Manager'  ? 'Credit Analyst' :
              user?.role === 'Admin'    ? 'Administrator'  :
              user?.role ?? ''
            }
            readonly hint="Role is managed by your administrator." />
        </div>
        <div style={f.actions}>
          <SaveBtn onClick={save} loading={saving} />
          <CancelBtn onClick={() => { setName(user?.name ?? ''); setEmail(user?.email ?? '') }} />
        </div>
      </SectionCard>

      <SectionCard title="Contact &amp; Address">
        <Field label="Mailing address" value={address} onChange={setAddress} />
        <div style={f.grid2}>
          <Field label="City"    value="Springfield" readonly />
          <Field label="Country" value="United States" readonly />
        </div>
        <div style={f.actions}>
          <SaveBtn onClick={() => showToast('Address saved.')} />
        </div>
      </SectionCard>

      {/* Employment card — all workforce roles */}
      <SectionCard title="Employment">
        <div style={f.grid2}>
          <Field label="Job title"   value={jobTitle} onChange={role === 'Admin' ? setJobTitle : undefined} readonly={role !== 'Admin'} />
          <Field label="Department"  value={dept}     onChange={role === 'Admin' ? setDept     : undefined} readonly={role !== 'Admin'}
            hint={role !== 'Admin' ? 'Contact your administrator to update employment details.' : undefined} />
          <Field label="Employee ID" value="EMP-00412"  readonly />
          <Field label="Start date"  value="2021-03-15" readonly />
        </div>
        {role === 'Admin' && (
          <div style={f.actions}>
            <SaveBtn onClick={() => showToast('Employment details saved.')} />
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ─── Security ─────────────────────────────────────────────────────────────────

// ─── Identity (self-service: enrolled factors + account deletion) ─────────────

/** A single device registration returned by /users/me enrolled_factors. */
interface DeviceReg { id: string; name: string; created_at: string | null }

interface EnrolledFactors {
  fido2:     false | DeviceReg[]
  totp:      false | DeviceReg[]
  push:      false | DeviceReg[]
  email_otp: false | DeviceReg[]
  sso:       true
}
interface MeResponse { id: string; email: string; name: string; role: string; enrolled_factors: EnrolledFactors }
type PendingIdentityAction = { type: 'delete_account' } | { type: 'unenroll'; factor: string }
const PENDING_IDENTITY_KEY = 'mb_pending_identity_action'

/** Map factor keys to human-readable labels and enroll routes.
 *  enrollPath method values must match MethodKey in EnrollMethodPage
 *  (passkey | totp | push | email_otp).
 */
const FACTOR_META: Record<string, { label: string; icon: string; enrollPath: string; canUnenroll: boolean }> = {
  fido2:     { label: 'Passkey (FIDO2 / Biometric)', icon: '🪪', enrollPath: '/enroll?method=passkey',   canUnenroll: true  },
  totp:      { label: 'Authenticator App (TOTP)',     icon: '🔑', enrollPath: '/enroll?method=totp',      canUnenroll: true  },
  push:      { label: 'Push Notification',            icon: '📲', enrollPath: '/enroll?method=push',      canUnenroll: true  },
  email_otp: { label: 'Email OTP',                    icon: '📧', enrollPath: '/enroll?method=email_otp', canUnenroll: false },
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '' }
}

function IdentitySection({ showToast }: { showToast: (m: string, kind?: 'success' | 'error') => void }) {
  const { stepupVerified, logout, user: authUser } = useAuth()
  const navigate = useNavigate()

  const [factors, setFactors]             = useState<EnrolledFactors | null>(null)
  const [loadingFactors, setLoading]      = useState(true)
  const [removingFactor, setRemoving]     = useState<string | null>(null)
  const [verifyTenantUrl, setVerifyTenantUrl] = useState<string>('')
  const [showIbvModal, setShowIbvModal]   = useState(false)

  const loadFactors = () => {
    setLoading(true)
    api.get<MeResponse>('/users/me')
      .then(({ data }) => {
        console.debug('[IdentitySection] /users/me enrolled_factors:', JSON.stringify(data.enrolled_factors))
        setFactors(data.enrolled_factors)
      })
      .catch(() => setFactors(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadFactors()
    // Fetch tenant URL for the IBM Verify enrollment deep-link
    api.get<{ verify_tenant_url: string }>('/auth/sso/config')
      .then(({ data }) => setVerifyTenantUrl(data.verify_tenant_url))
      .catch(() => {/* non-critical */})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Resume a pending action after returning from step-up
  useEffect(() => {
    if (!stepupVerified) return
    const raw = sessionStorage.getItem(PENDING_IDENTITY_KEY)
    if (!raw) return
    const action: PendingIdentityAction = JSON.parse(raw)
    sessionStorage.removeItem(PENDING_IDENTITY_KEY)
    if (action.type === 'delete_account') void executeDeleteAccount()
    else if (action.type === 'unenroll') void executeUnenroll(action.factor)
  }, [stepupVerified]) // eslint-disable-line react-hooks/exhaustive-deps

  function requireStepUp(action: PendingIdentityAction) {
    sessionStorage.setItem(PENDING_IDENTITY_KEY, JSON.stringify(action))
    navigate('/stepup?return_to=/settings')
  }

  async function executeUnenroll(factor: string) {
    setRemoving(factor)
    try {
      await api.delete(`/users/me/factors/${factor}`)
      showToast(`${FACTOR_META[factor]?.label ?? factor} has been unenrolled.`)
      loadFactors()
    } catch {
      showToast(`Failed to unenroll ${factor}. Please try again.`, 'error')
    } finally {
      setRemoving(null)
    }
  }

  function handleUnenroll(factor: string) {
    const label = FACTOR_META[factor]?.label ?? factor
    if (!window.confirm(`Remove your ${label} authenticator?\nThis cannot be undone without re-enrolling.`)) return
    if (!stepupVerified) { requireStepUp({ type: 'unenroll', factor }); return }
    void executeUnenroll(factor)
  }

  async function executeDeleteAccount() {
    const confirmed = window.prompt('This is irreversible. Type DELETE to confirm account deletion.')
    if (confirmed !== 'DELETE') { showToast('Account deletion cancelled.', 'error'); return }
    try {
      await api.delete('/users/me')
      logout()
      navigate('/', { replace: true })
    } catch {
      showToast('Account deletion failed. Please try again.', 'error')
    }
  }

  function handleDeleteAccount() {
    if (!stepupVerified) { requireStepUp({ type: 'delete_account' }); return }
    void executeDeleteAccount()
  }

  const METHODS = (Object.keys(FACTOR_META) as Array<keyof typeof FACTOR_META>).map(key => {
    const raw = factors ? (factors as unknown as Record<string, unknown>)[key] : undefined
    const devices: DeviceReg[] = Array.isArray(raw) ? raw : []
    const enrolled = devices.length > 0
    return { key, ...FACTOR_META[key], enrolled, devices }
  })

  return (
    <div>
      {/* Cross-link to Engage tab — only for non-Customer roles (Admin/Manager) */}
      {authUser?.role !== 'Customer' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 1rem', marginBottom: '1rem', background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: '8px', fontSize: '0.8rem', color: T.inkSub }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
          <span>See your full authentication &amp; security status on the <a href="/ciam" style={{ color: T.amber, fontWeight: 600, textDecoration: 'none' }}>Identity Lifecycle → Engage</a> page.</span>
        </div>
      )}
      <SectionCard title="Authentication Methods"
        action={
          <button style={f.outlineBtn} onClick={loadFactors}>Refresh</button>
        }
      >
        <div style={{ fontSize: '0.78rem', color: T.inkSub, marginBottom: '0.9rem' }}>
          Manage the MFA methods and devices tied to your account. You must verify your identity (step-up) before removing a factor.
        </div>

        {loadingFactors ? (
          <div style={{ color: T.inkSub, fontSize: '0.83rem', padding: '0.5rem 0' }}>Loading enrollment status…</div>
        ) : (
          <>
            {/* Enrolled factors — with device list and remove button */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {METHODS.map(m => {
                const isRemoving = removingFactor === m.key
                return (
                  <div key={m.key} style={{
                    borderRadius: '10px',
                    border: `1px solid ${m.enrolled ? T.greenBorder : T.border}`,
                    overflow: 'hidden',
                  }}>
                    {/* Factor header row */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      background: m.enrolled ? T.greenLight : T.bgMuted,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontSize: '1.1rem' }}>{m.icon}</span>
                        <div>
                          <div style={{ fontSize: '0.87rem', fontWeight: 700, color: T.ink }}>{m.label}</div>
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.4rem',
                            borderRadius: '999px',
                            background: m.enrolled ? T.greenLight : T.bgCard,
                            color: m.enrolled ? T.green : T.inkSub,
                            border: `1px solid ${m.enrolled ? T.greenBorder : T.border}`,
                          }}>
                            {m.enrolled ? `✓ ${m.devices.length} device${m.devices.length !== 1 ? 's' : ''}` : 'Not enrolled'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {/* Remove button — enrolled + removable */}
                        {m.enrolled && m.canUnenroll && (
                          <button
                            style={{ padding: '0.35rem 0.85rem', background: T.redLight, border: `1px solid ${T.redBorder}`, color: T.red, borderRadius: '999px', cursor: isRemoving ? 'default' : 'pointer', fontSize: '0.78rem', fontWeight: 600, opacity: isRemoving ? 0.5 : 1 }}
                            onClick={() => !isRemoving && handleUnenroll(m.key)}
                            disabled={isRemoving}
                          >
                            {isRemoving ? 'Removing…' : 'Remove'}
                          </button>
                        )}
                        {/* Email OTP — always on, no remove */}
                        {m.enrolled && !m.canUnenroll && (
                          <span style={{ fontSize: '0.72rem', color: T.inkSub, fontStyle: 'italic' }}>Always active</span>
                        )}
                      </div>
                    </div>

                    {/* Device list — only for enrolled factors with devices */}
                    {m.enrolled && m.devices.length > 0 && (
                      <div style={{ borderTop: `1px solid ${T.border}` }}>
                        {m.devices.map((dev, idx) => (
                          <div key={dev.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.55rem 1rem',
                            background: idx % 2 === 0 ? T.bgCard : T.bgMuted,
                            borderBottom: idx < m.devices.length - 1 ? `1px solid ${T.borderLight}` : 'none',
                          }}>
                            <div>
                              <div style={{ fontSize: '0.83rem', color: T.ink, fontWeight: 600 }}>{dev.name || 'Device'}</div>
                              {dev.created_at && (
                                <div style={{ fontSize: '0.7rem', color: T.inkSub, marginTop: '0.1rem' }}>
                                  Registered {formatDate(dev.created_at)}
                                </div>
                              )}
                            </div>
                            <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: T.greenLight, color: T.green, border: `1px solid ${T.greenBorder}`, fontWeight: 700 }}>
                              Active
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Single "Add authentication method" button at the bottom */}
            <div style={{ marginTop: '1.1rem', paddingTop: '0.9rem', borderTop: `1px solid ${T.borderLight}` }}>
              <button
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 1.1rem',
                  background: '#1d4ed8', color: '#ffffff',
                  borderRadius: '999px', border: 'none',
                  fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer',
                }}
                onClick={() => verifyTenantUrl ? setShowIbvModal(true) : navigate('/enroll')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                Add authentication method
              </button>
              <div style={{ fontSize: '0.72rem', color: T.inkSub, marginTop: '0.45rem' }}>
                Enrol a passkey, authenticator app, push notification, or email OTP to secure your account.
              </div>
            </div>

            {/* IBM Verify redirect confirmation modal */}
            {showIbvModal && (
              <div
                style={{
                  position: 'fixed' as const, inset: 0,
                  background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 10000,
                }}
                onClick={() => setShowIbvModal(false)}
              >
                <div
                  style={{
                    background: T.bgCard, border: `1px solid ${T.border}`,
                    borderRadius: '14px', padding: '2rem 2rem 1.5rem',
                    width: '100%', maxWidth: '420px',
                    boxShadow: T.shadowPop,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* Icon */}
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '12px',
                    background: T.amberLight, border: `1px solid ${T.amberBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.5rem', marginBottom: '1.1rem',
                  }}>
                    🔐
                  </div>

                  {/* Heading */}
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: T.ink, marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>
                    You're leaving MockBank
                  </div>

                  {/* Body */}
                  <div style={{ fontSize: '0.85rem', color: T.inkSub, lineHeight: 1.65, marginBottom: '1.4rem' }}>
                    You'll be taken to <strong style={{ color: T.ink }}>IBM Verify</strong> to add your
                    authentication method. Enroll your passkey, authenticator app, or push notification there.
                    <br /><br />
                    Once you're done, <strong style={{ color: T.ink }}>come back here and click Refresh</strong> to
                    see your updated methods.
                  </div>

                  {/* Tenant badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.55rem 0.85rem',
                    background: T.bgMuted, border: `1px solid ${T.border}`,
                    borderRadius: '8px', marginBottom: '1.5rem',
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.inkSub} strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <span style={{ fontSize: '0.75rem', color: T.inkSub, fontFamily: 'monospace' }}>
                      {verifyTenantUrl.replace('https://', '')}
                    </span>
                  </div>

                  {/* Buttons */}
                  <div style={{ display: 'flex', gap: '0.65rem' }}>
                    <a
                      href={`${verifyTenantUrl}/usc/settings/security`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                        padding: '0.6rem 0',
                        background: T.amber, color: '#ffffff',
                        borderRadius: '999px', textDecoration: 'none',
                        fontSize: '0.85rem', fontWeight: 700,
                      }}
                      onClick={() => setShowIbvModal(false)}
                    >
                      Go to IBM Verify
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                    <button
                      style={{
                        padding: '0.6rem 1.1rem',
                        background: 'transparent', color: T.inkSub,
                        border: `1px solid ${T.border}`,
                        borderRadius: '999px', cursor: 'pointer',
                        fontSize: '0.85rem', fontWeight: 600,
                      }}
                      onClick={() => setShowIbvModal(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {factors === null && !loadingFactors && (
          <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.9rem', background: T.amberLight, border: `1px solid ${T.amberBorder}`, borderRadius: '8px', fontSize: '0.8rem', color: T.amber }}>
            Could not fetch live enrollment data from IBM Verify. Check your connection and try refreshing.
          </div>
        )}
      </SectionCard>

      <SectionCard title="Danger Zone">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' as const }}>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: T.red, marginBottom: '0.2rem' }}>Delete My Account</div>
            <div style={{ fontSize: '0.8rem', color: T.inkSub, maxWidth: '440px' }}>
              Permanently removes your identity from IBM Verify and all local banking data. This action is irreversible and requires MFA verification.
            </div>
          </div>
          <button
            style={{ padding: '0.5rem 1.2rem', background: T.red, color: '#fff', border: 'none', borderRadius: '999px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}
            onClick={handleDeleteAccount}
          >
            Delete account
          </button>
        </div>
      </SectionCard>
    </div>
  )
}


// ─── Privacy & Consents ────────────────────────────────────────────────────────

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
  session_terminated?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  essential:  'Essential',
  functional: 'Functional',
  marketing:  'Marketing & Communications',
}

function PrivacySection({ showToast }: { showToast: (m: string, kind?: 'success' | 'error') => void }) {
  const { forceLogoutWithError } = useAuth()
  const [consents, setConsents]     = useState<ConsentRecord[]>([])
  const [loading, setLoading]       = useState(true)
  const [toggling, setToggling]     = useState<number | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [verifyTenantUrl, setVerifyTenantUrl] = useState<string>('')
  const [showOidcModal, setShowOidcModal]     = useState(false)

  const loadConsents = () => {
    setLoading(true)
    setFetchError(false)
    api.get<ConsentRecord[]>('/users/me/consents')
      .then(({ data }) => setConsents(data))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadConsents()
    api.get<{ verify_tenant_url: string }>('/auth/sso/config')
      .then(({ data }) => setVerifyTenantUrl(data.verify_tenant_url))
      .catch(() => {/* non-critical */})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(consent: ConsentRecord) {
    if (consent.is_required) return
    setToggling(consent.id)
    try {
      const endpoint = consent.is_active
        ? `/users/me/consents/${consent.id}/revoke`
        : `/users/me/consents/${consent.id}/restore`
      const { data } = await api.put<ConsentRecord>(endpoint)

      if (data.session_terminated) {
        // Consent was revoked — terminate the session immediately so the
        // user must re-login to acknowledge the updated consent state.
        // forceLogoutWithError clears all session storage and navigates to
        // the login page with a clear explanation banner.
        forceLogoutWithError(
          `You revoked the "${consent.label}" consent. Your session has been ended. Please sign in again to continue.`
        )
        return
      }

      // Consent was restored — just update local state
      setConsents(prev => prev.map(c => c.id === data.id ? data : c))
      showToast(`"${consent.label}" consent restored.`)
    } catch {
      showToast(`Failed to update consent. Please try again.`, 'error')
    } finally {
      setToggling(null)
    }
  }

  // Group consents by category for display
  const categories = Array.from(new Set(consents.map(c => c.category)))

  return (
    <div>
      <SectionCard title="Your Consents & Data Preferences"
        action={<button style={f.outlineBtn} onClick={loadConsents}>Refresh</button>}
      >
        <div style={{ fontSize: '0.78rem', color: T.inkSub, marginBottom: '1rem', lineHeight: 1.6 }}>
          These are the permissions you granted when creating your account. Essential consents are required
          for the service to function and cannot be revoked. Optional consents can be changed at any time.
        </div>

        {loading && (
          <div style={{ color: T.inkSub, fontSize: '0.83rem', padding: '0.5rem 0' }}>Loading consent records…</div>
        )}

        {fetchError && !loading && (
          <div style={{ padding: '0.65rem 0.9rem', background: T.redLight, border: `1px solid ${T.redBorder}`, borderRadius: '8px', fontSize: '0.8rem', color: T.red }}>
            Could not load consents. Please try refreshing.
          </div>
        )}

        {!loading && !fetchError && categories.map(cat => (
          <div key={cat} style={{ marginBottom: '1.25rem' }}>
            {/* Category heading */}
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: T.inkLight, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '0.5rem' }}>
              {CATEGORY_LABELS[cat] ?? cat}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {consents.filter(c => c.category === cat).map(c => {
                const isToggling = toggling === c.id
                return (
                  <div key={c.id} style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    border: `1px solid ${c.is_required ? T.border : (c.is_active ? T.greenBorder : T.redBorder)}`,
                    background: c.is_required ? T.bgMuted : (c.is_active ? T.greenLight : T.redLight + '66'),
                    opacity: isToggling ? 0.7 : 1,
                    transition: 'opacity 0.15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' as const }}>
                          <span style={{ fontSize: '0.87rem', fontWeight: 700, color: T.ink }}>{c.label}</span>
                          {c.is_required && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '999px', background: T.amberLight, color: T.amber, border: `1px solid ${T.amberBorder}` }}>
                              Required
                            </span>
                          )}
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '999px',
                            background: c.is_active ? T.greenLight : T.redLight,
                            color: c.is_active ? T.green : T.red,
                            border: `1px solid ${c.is_active ? T.greenBorder : T.redBorder}`,
                          }}>
                            {c.is_active ? 'Active' : 'Revoked'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: T.inkSub, lineHeight: 1.55 }}>{c.description}</div>
                        {c.granted_at && (
                          <div style={{ fontSize: '0.68rem', color: T.inkLight, marginTop: '0.4rem' }}>
                            {c.is_active
                              ? `Granted ${formatDate(c.granted_at)}`
                              : `Revoked ${c.revoked_at ? formatDate(c.revoked_at) : ''} · Originally granted ${formatDate(c.granted_at)}`}
                          </div>
                        )}
                      </div>

                      {/* Toggle button — only for non-required consents */}
                      {!c.is_required && (
                        <button
                          style={{
                            padding: '0.35rem 0.85rem',
                            background: c.is_active ? T.redLight : T.greenLight,
                            color: c.is_active ? T.red : T.green,
                            border: `1px solid ${c.is_active ? T.redBorder : T.greenBorder}`,
                            borderRadius: '999px',
                            cursor: isToggling ? 'default' : 'pointer',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                          onClick={() => !isToggling && handleToggle(c)}
                          disabled={isToggling}
                        >
                          {isToggling ? '…' : (c.is_active ? 'Revoke' : 'Restore')}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Info footer */}
        {!loading && !fetchError && consents.length > 0 && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: T.blueLight, borderRadius: '8px', border: `1px solid ${T.blue}44`, fontSize: '0.77rem', color: T.blue, lineHeight: 1.55 }}>
            Revoking an optional consent will stop that data processing going forward. It will not delete historical data already processed.
            To permanently delete your data, use the Delete Account option in the Identity section.
          </div>
        )}
      </SectionCard>

      {/* ── OIDC Consents layer ─────────────────────────────────────────────── */}
      <SectionCard title="Identity Provider Consents">
        <div style={{ fontSize: '0.78rem', color: T.inkSub, lineHeight: 1.65, marginBottom: '1rem' }}>
          The table above shows <strong style={{ color: T.ink }}>MockBank's own data purposes</strong> —
          what we do with your information inside this app. There is a second, deeper layer below that.
        </div>

        {/* Two-layer explainer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.1rem' }}>
          {[
            {
              icon: '🏦',
              layer: 'Layer 1 — MockBank (this page)',
              title: 'How MockBank uses your data',
              desc: 'Things like analytics, product recommendations, and marketing emails. You can toggle these above.',
              color: T.green, colorLight: T.greenLight, colorBorder: T.greenBorder,
            },
            {
              icon: '🔑',
              layer: 'Layer 2 — IBM Verify (identity provider)',
              title: 'What MockBank is allowed to read about you',
              desc: 'When you first signed in, your browser asked "Allow MockBank to access your email, name, and profile?" — those are OIDC scope consents stored at IBM Verify.',
              color: T.blue, colorLight: T.blueLight, colorBorder: `${T.blue}44`,
            },
          ].map(item => (
            <div key={item.layer} style={{
              display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
              padding: '0.85rem 1rem', borderRadius: '10px',
              background: item.colorLight, border: `1px solid ${item.colorBorder}`,
            }}>
              <span style={{ fontSize: '1.2rem', marginTop: '0.05rem', flexShrink: 0 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: item.color, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '0.2rem' }}>{item.layer}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: T.ink, marginBottom: '0.25rem' }}>{item.title}</div>
                <div style={{ fontSize: '0.77rem', color: T.inkSub, lineHeight: 1.55 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA to IBM Verify privacy page */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '0.75rem' }}>
          <div style={{ fontSize: '0.78rem', color: T.inkSub, lineHeight: 1.55, flex: 1 }}>
            To see or withdraw the sign-in permissions you granted to MockBank POC at the
            identity provider level, view them on IBM Verify.
          </div>
          <button
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
              padding: '0.5rem 1rem',
              background: T.blueLight, color: T.blue,
              border: `1px solid ${T.blue}44`,
              borderRadius: '999px', cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: 700, flexShrink: 0,
            }}
            onClick={() => setShowOidcModal(true)}
          >
            View on IBM Verify
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
        </div>
      </SectionCard>

      {/* ── OIDC consents explainer modal ───────────────────────────────────── */}
      {showOidcModal && (
        <div
          style={{
            position: 'fixed' as const, inset: 0,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, padding: '1rem',
          }}
          onClick={() => setShowOidcModal(false)}
        >
          <div
            style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: '14px', padding: '2rem 2rem 1.5rem',
              width: '100%', maxWidth: '480px',
              boxShadow: T.shadowPop, maxHeight: '90vh', overflowY: 'auto' as const,
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Icon */}
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: T.blueLight, border: `1px solid ${T.blue}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.5rem', marginBottom: '1.1rem',
            }}>
              🔑
            </div>

            {/* Heading */}
            <div style={{ fontSize: '1rem', fontWeight: 800, color: T.ink, marginBottom: '0.4rem', letterSpacing: '-0.01em' }}>
              What are "identity provider consents"?
            </div>
            <div style={{ fontSize: '0.82rem', color: T.inkSub, marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Think of it like a keycard system. IBM Verify is the security desk — MockBank had to ask permission to know who you are.
            </div>

            {/* Step-by-step explanation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.4rem' }}>
              {[
                {
                  step: '1',
                  title: 'You clicked "Sign in with IBM Verify"',
                  body: 'MockBank sent you to IBM Verify and said: "I need to know this person\'s email address, name, and that they\'re who they say they are."',
                },
                {
                  step: '2',
                  title: 'IBM Verify asked for your permission',
                  body: 'A consent screen appeared (or was silently approved) asking: "Allow MockBank POC to access: openid, email, profile." You clicked Allow.',
                },
                {
                  step: '3',
                  title: 'IBM Verify issued a token to MockBank',
                  body: 'IBM Verify gave MockBank a secure, short-lived pass containing only what you approved — your email and basic profile. MockBank cannot see your password or anything else.',
                },
                {
                  step: '4',
                  title: 'Those approvals are recorded at IBM Verify',
                  body: 'IBM Verify keeps a record of exactly what you approved and when. You can see these records — and withdraw them — on the IBM Verify Privacy page.',
                },
              ].map(item => (
                <div key={item.step} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                    background: T.amberLight, border: `1px solid ${T.amberBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.72rem', fontWeight: 800, color: T.amber,
                  }}>
                    {item.step}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: T.ink, marginBottom: '0.2rem' }}>{item.title}</div>
                    <div style={{ fontSize: '0.77rem', color: T.inkSub, lineHeight: 1.55 }}>{item.body}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* What you'll see callout */}
            <div style={{ padding: '0.75rem 1rem', background: T.bgMuted, border: `1px solid ${T.border}`, borderRadius: '8px', marginBottom: '1.4rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: T.ink, marginBottom: '0.3rem' }}>What you'll see on IBM Verify</div>
              <div style={{ fontSize: '0.75rem', color: T.inkSub, lineHeight: 1.6 }}>
                A table showing <strong style={{ color: T.ink }}>MockBank POC</strong> with three rows — <code style={{ fontSize: '0.73rem', color: T.blue }}>openid</code>, <code style={{ fontSize: '0.73rem', color: T.blue }}>email</code>, <code style={{ fontSize: '0.73rem', color: T.blue }}>profile</code> — each showing "Allow" and the date you consented.
                You can withdraw any of these, which will sign you out of MockBank.
              </div>
            </div>

            {/* Tenant badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.55rem 0.85rem',
              background: T.bgMuted, border: `1px solid ${T.border}`,
              borderRadius: '8px', marginBottom: '1.4rem',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.inkSub} strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span style={{ fontSize: '0.75rem', color: T.inkSub, fontFamily: 'monospace' }}>
                {verifyTenantUrl ? verifyTenantUrl.replace('https://', '') : 'kavyad.verify.ibm.com'}
              </span>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <a
                href={verifyTenantUrl ? `${verifyTenantUrl}/usc/settings/privacy` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  padding: '0.6rem 0',
                  background: T.blue, color: '#fff',
                  borderRadius: '999px', textDecoration: 'none',
                  fontSize: '0.85rem', fontWeight: 700,
                }}
                onClick={() => setShowOidcModal(false)}
              >
                View my consents on IBM Verify
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
              <button
                style={{
                  padding: '0.6rem 1.1rem',
                  background: 'transparent', color: T.inkSub,
                  border: `1px solid ${T.border}`,
                  borderRadius: '999px', cursor: 'pointer',
                  fontSize: '0.85rem', fontWeight: 600,
                }}
                onClick={() => setShowOidcModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────

function SecuritySection({ role, showToast }: { role: string; showToast: (m: string, kind?: 'success' | 'error') => void }) {
  const [curPwd,  setCurPwd]  = useState('')
  const [newPwd,  setNewPwd]  = useState('')
  const [confPwd, setConfPwd] = useState('')
  const [mfa,     setMfa]     = useState(true)
  const [loginAlerts, setLoginAlerts] = useState(true)
  const [showSessions, setShowSessions] = useState(false)
  // Admin-only org-wide policy toggles (reserved for future use)
  const [_enforceMfa,    _setEnforceMfa]    = useState(true)
  const [_stepUpEnabled, _setStepUpEnabled] = useState(true)
  const [_riskEngine,    _setRiskEngine]    = useState(true)

  const sessions = [
    { device: 'Chrome on macOS',  ip: '192.168.1.42', location: 'Chennai, IN',   last: 'Active now',  current: true  },
    { device: 'Safari on iPhone', ip: '10.0.0.7',     location: 'Chennai, IN',   last: '2 hours ago', current: false },
    { device: 'Edge on Windows',  ip: '172.16.4.18',  location: 'Bangalore, IN', last: '3 days ago',  current: false },
  ]

  const changePassword = () => {
    if (!curPwd || !newPwd) { showToast('Please fill in all password fields.', 'error'); return }
    if (newPwd !== confPwd) { showToast('New passwords do not match.', 'error'); return }
    if (newPwd.length < 8)  { showToast('Password must be at least 8 characters.', 'error'); return }
    setCurPwd(''); setNewPwd(''); setConfPwd('')
    showToast('Password changed successfully.')
  }

  return (
    <div>
      <SectionCard title="Change Password">
        <div style={f.grid1}>
          <Field label="Current password"     value={curPwd}  onChange={setCurPwd}  type="password" />
          <Field label="New password"         value={newPwd}  onChange={setNewPwd}  type="password" hint="Minimum 8 characters with at least one number and symbol." />
          <Field label="Confirm new password" value={confPwd} onChange={setConfPwd} type="password" />
        </div>
        <div style={f.actions}>
          <button style={f.saveBtn} onClick={changePassword}>Update password</button>
        </div>
      </SectionCard>

      <SectionCard title="Multi-Factor Authentication">
        <Toggle
          label="Require MFA on sign-in"
          sub="When enabled, every sign-in will require a second verification step."
          checked={mfa}
          onChange={v => { setMfa(v); showToast(v ? 'MFA enabled.' : 'MFA disabled.') }}
        />
        <div style={{ marginTop: '1rem', padding: '0.9rem 1rem', background: T.greenLight, borderRadius: '8px', border: `1px solid ${T.greenBorder}` }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: T.green, marginBottom: '0.35rem' }}>Enrolled factors</div>
          {[
            { name: 'Passkey (FIDO2)', status: 'enrolled' },
            { name: 'Email OTP',       status: 'enrolled' },
            { name: 'Authenticator',   status: 'enrolled' },
          ].map(fac => (
            <div key={fac.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: `1px solid ${T.greenBorder}` }}>
              <span style={{ fontSize: '0.84rem', color: T.ink }}>{fac.name}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px',
                background: fac.status === 'enrolled' ? T.greenLight : T.bgMuted,
                color:      fac.status === 'enrolled' ? T.green : T.inkSub,
              }}>
                {fac.status === 'enrolled' ? '✓ Enrolled' : 'Not enrolled'}
              </span>
            </div>
          ))}
        </div>
        <div style={f.actions}>
          <button style={f.outlineBtn} onClick={() => showToast('Redirecting to enrollment wizard…')}>
            Manage factors
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Trusted Devices &amp; Sessions"
        action={
          <button style={f.outlineBtn} onClick={() => setShowSessions(v => !v)}>
            {showSessions ? 'Hide' : 'View'} sessions
          </button>
        }
      >
        <Toggle
          label="Login activity alerts"
          sub="Get notified when a new sign-in is detected from an unrecognised device."
          checked={loginAlerts}
          onChange={v => { setLoginAlerts(v); showToast(v ? 'Login alerts enabled.' : 'Login alerts disabled.') }}
        />
        {showSessions && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {sessions.map((sess, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.75rem', background: T.bgMuted, borderRadius: '8px', border: `1px solid ${T.border}` }}>
                <span style={{ fontSize: '1.4rem' }}>💻</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.87rem', fontWeight: 600, color: T.ink, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {sess.device}
                    {sess.current && <span style={{ fontSize: '0.68rem', background: T.greenLight, color: T.green, padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: 700 }}>Current</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: T.inkSub }}>{sess.ip} · {sess.location} · {sess.last}</div>
                </div>
                {!sess.current && (
                  <button style={{ ...f.dangerBtn, fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}
                    onClick={() => showToast(`Session on ${sess.device} terminated.`)}>
                    Revoke
                  </button>
                )}
              </div>
            ))}
            <button style={{ ...f.dangerBtn, alignSelf: 'flex-start', marginTop: '0.25rem' }}
              onClick={() => showToast('All other sessions have been terminated.')}>
              Sign out all other sessions
            </button>
          </div>
        )}
      </SectionCard>

      {/* Manager — informational team policy banner */}
      {role === 'Manager' && (
        <SectionCard title="Team Security Policy">
          <InfoBanner icon="ℹ️" text="Security policies below are set organisation-wide by your administrator. Contact your admin to request changes." />
          {[
            { label: 'MFA enforced for all staff', sub: 'All employee accounts require a second factor.', checked: true },
            { label: 'Step-up authentication', sub: 'High-value transfers require re-verification.', checked: true },
            { label: 'Risk-based access', sub: 'Anomalous sign-ins are blocked automatically.', checked: true },
          ].map(item => (
            <Toggle key={item.label} label={item.label} sub={item.sub} checked={item.checked} onChange={() => {}} disabled />
          ))}
        </SectionCard>
      )}

      {/* Admin — org-wide policy (read-only informational) */}
      {role === 'Admin' && (
        <SectionCard title="Organisation-Wide Security Policies">
          <InfoBanner icon="🛡️" text="These policies are centrally enforced by the platform and apply to all users. They cannot be overridden at the individual account level." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
            {[
              {
                icon: '🔐',
                label: 'Enforce MFA for all accounts',
                sub: 'All users must enrol and use a second factor at every sign-in.',
                standard: 'NIST SP 800-63B',
                status: 'Enforced',
              },
              {
                icon: '⚡',
                label: 'Step-up authentication',
                sub: 'Users are re-challenged before high-value or sensitive operations.',
                standard: 'PSD2 SCA / PCI DSS 8.3',
                status: 'Enforced',
              },
              {
                icon: '🧠',
                label: 'Adaptive risk engine',
                sub: 'Logins flagged as anomalous by IBM Verify risk scoring are blocked or step-up challenged.',
                standard: 'OWASP ASVS 2.2',
                status: 'Active',
              },
            ].map(policy => (
              <div key={policy.label} style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem',
                padding: '0.85rem 1rem', background: T.bgMuted, borderRadius: '8px', border: `1px solid ${T.border}`,
              }}>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1rem', marginTop: '0.05rem' }}>{policy.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: T.ink, marginBottom: '0.2rem' }}>{policy.label}</div>
                    <div style={{ fontSize: '0.77rem', color: T.inkSub, lineHeight: 1.5 }}>{policy.sub}</div>
                    <div style={{ fontSize: '0.68rem', color: T.inkLight, marginTop: '0.35rem', fontWeight: 600 }}>Standard: {policy.standard}</div>
                  </div>
                </div>
                <span style={{
                  flexShrink: 0, fontSize: '0.68rem', fontWeight: 700,
                  padding: '0.2rem 0.6rem', borderRadius: '999px',
                  background: T.greenLight, color: T.green, border: `1px solid ${T.greenBorder}`,
                }}>
                  ✓ {policy.status}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// ─── Notifications ────────────────────────────────────────────────────────────
function NotificationsSection({ role, showToast }: { role: string; showToast: (m: string, kind?: 'success' | 'error') => void }) {
  const [emailSec,     setEmailSec]     = useState(true)
  const [emailDigest,  setEmailDigest]  = useState(true)
  const [teamDigest,   setTeamDigest]   = useState(true)
  const [systemAlerts, setSystemAlerts] = useState(true)
  const [auditReports, setAuditReports] = useState(true)
  const [pushSec,      setPushSec]      = useState(true)
  const [smsAuth,      setSmsAuth]      = useState(true)

  return (
    <div>
      <SectionCard title="Email Notifications">
        <Toggle label="Security alerts"   sub="Sign-in attempts, password changes and MFA events."   checked={emailSec}    onChange={setEmailSec} />
        <Toggle label="Weekly digest"     sub="A weekly summary of workforce activity and identity events." checked={emailDigest} onChange={setEmailDigest} />
        <Toggle
          label={role === 'Admin' ? 'Admin &amp; audit digest' : 'Team digest'}
          sub={role === 'Admin' ? 'Weekly summary of user lifecycle events, logins and security posture.' : 'Weekly summary of your team\'s access activity.'}
          checked={teamDigest}
          onChange={v => { setTeamDigest(v); showToast(v ? 'Team digest enabled.' : 'Team digest disabled.') }}
        />
        {role === 'Admin' && (
          <>
            <Toggle
              label="System alerts"
              sub="Critical events such as SCIM sync failures or policy violations."
              checked={systemAlerts}
              onChange={v => { setSystemAlerts(v); showToast(v ? 'System alerts enabled.' : 'System alerts disabled.') }}
            />
            <Toggle
              label="Audit reports"
              sub="Receive scheduled compliance and audit log reports."
              checked={auditReports}
              onChange={v => { setAuditReports(v); showToast(v ? 'Audit reports enabled.' : 'Audit reports disabled.') }}
            />
          </>
        )}
        <div style={f.actions}>
          <SaveBtn onClick={() => showToast('Email preferences saved.')} />
        </div>
      </SectionCard>

      <SectionCard title="Push Notifications">
        <Toggle label="Security events"   sub="Immediate push when a new device signs in or MFA changes." checked={pushSec} onChange={setPushSec} />
        {role === 'Admin' && (
          <Toggle
            label="Identity lifecycle events"
            sub="Push when a user is onboarded, suspended, or has their role changed."
            checked={true}
            onChange={() => showToast('Preference saved.')}
          />
        )}
        <div style={f.actions}>
          <SaveBtn onClick={() => showToast('Push preferences saved.')} />
        </div>
      </SectionCard>

      <SectionCard title="SMS">
        <Toggle label="OTP &amp; authentication codes" sub="Receive one-time codes for login and sensitive actions." checked={smsAuth} onChange={setSmsAuth} />
        <Toggle label="Security incident SMS" sub="Immediate SMS on critical security events (account lockout, breach alert)." checked={true} onChange={() => showToast('Preference saved.')} />
        <div style={f.actions}>
          <SaveBtn onClick={() => showToast('SMS preferences saved.')} />
        </div>
      </SectionCard>
    </div>
  )
}

// ─── Preferences ──────────────────────────────────────────────────────────────
function PreferencesSection({ showToast }: { showToast: (m: string) => void }) {
  const [language,      setLanguage]      = useState('English (US)')
  const [timezone,      setTimezone]      = useState('Asia/Kolkata (IST, UTC+5:30)')
  const [dateFormat,    setDateFormat]    = useState('MM/DD/YYYY')
  const [currency,      setCurrency]      = useState('INR — Indian Rupee')
  const [theme,         setTheme]         = useState<'system' | 'light' | 'dark'>('system')
  const [compactMode,   setCompactMode]   = useState(false)
  const [accessibility, setAccessibility] = useState(false)

  return (
    <div>
      <SectionCard title="Language &amp; Region">
        <div style={f.grid2}>
          <Select label="Language"    value={language}   options={['English (US)', 'English (UK)', 'Hindi', 'Tamil', 'French', 'German', 'Spanish']} onChange={setLanguage} />
          <Select label="Timezone"    value={timezone}   options={['Asia/Kolkata (IST, UTC+5:30)', 'America/New_York (EST, UTC-5)', 'Europe/London (GMT, UTC+0)', 'America/Los_Angeles (PST, UTC-8)']} onChange={setTimezone} />
          <Select label="Date format" value={dateFormat} options={['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']} onChange={setDateFormat} />
        </div>
        <div style={f.actions}>
          <SaveBtn onClick={() => showToast('Language & region preferences saved.')} />
        </div>
      </SectionCard>

      <SectionCard title="Currency">
        <Select label="Display currency" value={currency} options={['USD — US Dollar', 'INR — Indian Rupee', 'EUR — Euro', 'GBP — British Pound', 'JPY — Japanese Yen']} onChange={setCurrency} />
        <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: T.inkSub }}>
          Currency affects how amounts are displayed in loan and operations views.
        </div>
        <div style={f.actions}>
          <SaveBtn onClick={() => showToast('Currency preference saved.')} />
        </div>
      </SectionCard>

      <SectionCard title="Theme">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {(['system', 'light', 'dark'] as const).map(t => (
            <button key={t}
              style={{
                  flex: 1, padding: '1rem 0.5rem', border: `2px solid ${theme === t ? T.ink : T.border}`,
                  borderRadius: T.radiusInner, background: theme === t ? T.amberLight : T.bgCard,
                  cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600,
                  color: theme === t ? T.ink : T.inkSub, textTransform: 'capitalize',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
              }}
              onClick={() => { setTheme(t); showToast(`Theme set to ${t}.`) }}
            >
              <span style={{ fontSize: '1.4rem' }}>{t === 'system' ? '⚙️' : t === 'light' ? '☀️' : '🌙'}</span>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <Toggle label="Compact mode"  sub="Reduce padding and font sizes for a denser layout."  checked={compactMode}   onChange={v => { setCompactMode(v);   showToast(v ? 'Compact mode on.' : 'Compact mode off.') }} />
        <Toggle label="Accessibility" sub="High-contrast mode and larger touch targets."         checked={accessibility} onChange={v => { setAccessibility(v); showToast(v ? 'Accessibility mode on.' : 'Accessibility mode off.') }} />
      </SectionCard>
    </div>
  )
}
const s: Record<string, React.CSSProperties> = {
  root:       { fontFamily: T.fontFamily, position: 'relative' },
  pageHeader: { marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle:  { fontSize: '1.5rem', fontWeight: 800, color: T.ink, margin: 0, letterSpacing: '-0.02em' },
  pageSub:    { fontSize: '0.82rem', color: T.inkSub, marginTop: '0.25rem', maxWidth: '520px' },
  body:       { display: 'flex', gap: '1.25rem', alignItems: 'flex-start' },
  sidebar: {
    width: '190px', flexShrink: 0, background: T.bgCard,
    border: `1px solid ${T.border}`, borderRadius: T.radiusCard,
    boxShadow: T.shadowCard,
    padding: '0.65rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '2px',
    position: 'sticky' as const, top: '0',
  },
  navGroup: {
    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
    color: T.inkLight, padding: '0.4rem 0.85rem 0.2rem',
    textTransform: 'uppercase' as const,
  },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    padding: '0.6rem 0.85rem', borderRadius: '10px', border: 'none',
    background: 'transparent', cursor: 'pointer',
    fontSize: '0.87rem', fontWeight: 500, color: T.inkSub,
    width: '100%', textAlign: 'left' as const,
  },
  navBtnActive: { background: T.amberLight, color: T.amber, fontWeight: 700 },
  navIcon:    { fontSize: '1rem' },
  content:    { flex: 1, minWidth: 0 },
  toast: {
    position: 'fixed' as const, bottom: '1.5rem', right: '1.5rem',
    color: '#fff', padding: '0.75rem 1.25rem', borderRadius: T.radiusInner,
    fontSize: '0.84rem', fontWeight: 600, zIndex: 9999,
    boxShadow: T.shadowPop,
  },
  roleBadge: {
    fontSize: '0.72rem', fontWeight: 700, padding: '0.3rem 0.9rem',
    borderRadius: '999px', border: '1px solid', flexShrink: 0, marginTop: '0.2rem',
  },
  roleBadgeCust:  { background: T.blueLight, color: T.blue, borderColor: T.blue + '44' },
  roleBadgeMgr:   { background: '#3b1fa833', color: '#a78bfa', borderColor: '#7c3aed44' },
  roleBadgeAdmin: { background: T.amberLight, color: T.amber, borderColor: T.amberBorder },
}

const f: Record<string, React.CSSProperties> = {
  card: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: T.radiusCard, padding: '1.25rem 1.5rem', marginBottom: '1.25rem',
    boxShadow: T.shadowCard,
  },
  cardHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '1.1rem',
  },
  cardTitle:    { fontSize: '0.92rem', fontWeight: 700, color: T.ink, letterSpacing: '-0.01em' },
  grid2:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' },
  grid1:        { display: 'grid', gridTemplateColumns: '1fr', gap: '0.85rem' },
  fieldWrap:    { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label:        { fontSize: '0.75rem', fontWeight: 600, color: T.inkSub },
  input: {
    padding: '0.55rem 0.75rem', border: `1px solid ${T.border}`,
    borderRadius: T.radiusInput, fontSize: '0.87rem', color: T.ink,
    outline: 'none', width: '100%', boxSizing: 'border-box' as const,
    background: T.bgCard,
  },
  inputReadonly: { background: T.bgMuted, color: T.inkSub, cursor: 'default' },
  hint:          { fontSize: '0.72rem', color: T.inkLight, marginTop: '0.15rem' },
  select: {
    padding: '0.55rem 0.75rem', border: `1px solid ${T.border}`,
    borderRadius: T.radiusInput, fontSize: '0.87rem', color: T.ink,
    background: T.bgCard, width: '100%', boxSizing: 'border-box' as const,
    cursor: 'pointer', outline: 'none',
  },
  actions: {
    display: 'flex', gap: '0.6rem', marginTop: '1.1rem',
    paddingTop: '1rem', borderTop: `1px solid ${T.borderLight}`,
  },
  saveBtn: {
    padding: '0.5rem 1.1rem', background: T.amber, color: '#ffffff',
    border: 'none', borderRadius: T.radiusPill, cursor: 'pointer',
    fontSize: '0.84rem', fontWeight: 700,
  },
  cancelBtn: {
    padding: '0.5rem 1rem', background: 'transparent', color: T.inkSub,
    border: `1px solid ${T.border}`, borderRadius: T.radiusPill, cursor: 'pointer',
    fontSize: '0.84rem', fontWeight: 600,
  },
  outlineBtn: {
    padding: '0.45rem 0.9rem', background: T.bgMuted, color: T.ink,
    border: `1px solid ${T.border}`, borderRadius: T.radiusPill, cursor: 'pointer',
    fontSize: '0.82rem', fontWeight: 600,
  },
  dangerBtn: {
    padding: '0.45rem 0.9rem', background: T.redLight, color: T.red,
    border: `1px solid ${T.redBorder}`, borderRadius: T.radiusPill, cursor: 'pointer',
    fontSize: '0.82rem', fontWeight: 700,
  },
  toggleRow: {
    display: 'flex', alignItems: 'center', gap: '1rem',
    padding: '0.75rem 0', borderBottom: `1px solid ${T.borderLight}`,
  },
  toggleLabel: { fontSize: '0.87rem', fontWeight: 600, color: T.ink },
  toggleSub:   { fontSize: '0.75rem', color: T.inkSub, marginTop: '0.1rem' },
  track: {
    width: '44px', height: '24px', borderRadius: '999px', border: 'none',
    position: 'relative' as const, cursor: 'pointer', transition: 'background 0.2s',
    flexShrink: 0, padding: 0, overflow: 'hidden',
  },
  thumb: {
    position: 'absolute' as const, top: '3px',
    width: '18px', height: '18px', borderRadius: '50%',
    background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
    transition: 'left 0.18s ease',
    display: 'block',
  },
}

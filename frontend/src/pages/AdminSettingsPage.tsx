/**
 * AdminSettingsPage — dark-themed Settings for the HR Admin portal.
 * Uses T (dark) tokens. Shown only to Admin role at /admin/settings.
 */
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { T } from '../styles/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
type Section = 'profile' | 'security' | 'identity' | 'notifications'
interface Toast { msg: string; kind: 'success' | 'error' }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Field({ label, value, type = 'text', onChange, readonly = false, hint }: {
  label: string; value: string; type?: string
  onChange?: (v: string) => void; readonly?: boolean; hint?: string
}) {
  return (
    <div style={f.fieldWrap}>
      <label style={f.label}>{label}</label>
      <input type={type} value={value} readOnly={readonly}
        onChange={e => onChange?.(e.target.value)}
        style={{ ...f.input, ...(readonly ? f.inputReadonly : {}) }} />
      {hint && <div style={f.hint}>{hint}</div>}
    </div>
  )
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
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
  return <button style={f.saveBtn} onClick={onClick} disabled={loading}>{loading ? 'Saving…' : (label ?? 'Save changes')}</button>
}
function CancelBtn({ onClick }: { onClick: () => void }) {
  return <button style={f.cancelBtn} onClick={onClick}>Cancel</button>
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
const NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'profile',       label: 'Admin Profile',   icon: '🏛️' },
  { id: 'security',      label: 'Access & Auth',   icon: '🔐' },
  { id: 'identity',      label: 'MFA Factors',     icon: '🛡️' },
  { id: 'notifications', label: 'System Alerts',   icon: '⚠️' },
]

// ─── Main export ──────────────────────────────────────────────────────────────
export default function AdminSettingsPage() {
  const { user } = useAuth()
  const [section, setSection] = useState<Section>('profile')
  const [toast,   setToast]   = useState<Toast | null>(null)

  const showToast = (msg: string, kind: Toast['kind'] = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3200)
  }

  return (
    <div style={{ fontFamily: T.fontFamily, position: 'relative' }}>
      {toast && (
        <div style={{ ...s.toast, background: toast.kind === 'success' ? T.bgCard : T.red, color: toast.kind === 'success' ? T.ink : '#fff', border: toast.kind === 'success' ? `1px solid ${T.border}` : 'none' }}>
          {toast.kind === 'success' ? '✓' : '✗'}  {toast.msg}
        </div>
      )}

      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Admin Configuration</h1>
          <p style={s.pageSub}>Manage your administrator profile, access credentials, MFA factors, and system alert preferences.</p>
        </div>
        <div style={{ ...s.roleBadge, background: T.amberLight, color: T.amber, border: `1px solid ${T.amberBorder}` }}>
          HR Administrator
        </div>
      </div>

      <div style={s.body}>
        <aside style={s.sidebar}>
          <div style={s.navGroup}>ADMIN PORTAL</div>
          {NAV.map(n => (
            <button key={n.id}
              style={{ ...s.navBtn, ...(section === n.id ? s.navBtnActive : {}) }}
              onClick={() => setSection(n.id)}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </aside>

        <div style={s.content}>
          {section === 'profile'       && <AdminProfileSection       user={user} showToast={showToast} />}
          {section === 'security'      && <AdminSecuritySection      showToast={showToast} />}
          {section === 'identity'      && <AdminIdentitySection      showToast={showToast} />}
          {section === 'notifications' && <AdminNotificationsSection showToast={showToast} />}
        </div>
      </div>
    </div>
  )
}

// ─── Profile ──────────────────────────────────────────────────────────────────
function AdminProfileSection({ user, showToast }: { user: { name: string; email: string; role: string } | null; showToast: (m: string, k?: 'success' | 'error') => void }) {
  const { token, login } = useAuth()
  const [name,    setName]    = useState(user?.name  ?? '')
  const [email,   setEmail]   = useState(user?.email ?? '')
  const [phone,   setPhone]   = useState('')
  const [phoneOrig, setPhoneOrig] = useState('')
  const [jobTitle, setJobTitle] = useState('IAM Administrator')
  const [dept,    setDept]    = useState('IT & Identity Management')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    api.get<{ phone?: string; name: string; email: string; role: string }>('/users/me')
      .then(({ data }) => { if (data.phone) { setPhone(data.phone); setPhoneOrig(data.phone) } })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true)
    try {
      const payload: { name: string; email: string; phone?: string } = { name, email }
      if (phone !== phoneOrig) payload.phone = phone
      const { data } = await api.put('/users/me', payload)
      setPhoneOrig(phone)
      login(token!, { name: data.name, email: data.email, role: data.role })
      showToast('Profile updated successfully.')
    } catch { showToast('Failed to save profile.', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <SectionCard title="Administrator Identity">
        <div style={f.grid2}>
          <Field label="Full name"     value={name}  onChange={setName} />
          <Field label="Admin email"   value={email} onChange={setEmail} type="email" />
          <Field label="Contact number" value={phone} onChange={setPhone} type="tel" />
          <Field label="Access level" value="Super Administrator" readonly hint="Access level is assigned by the system." />
        </div>
        <div style={f.actions}><SaveBtn onClick={save} loading={saving} /><CancelBtn onClick={() => { setName(user?.name ?? ''); setEmail(user?.email ?? '') }} /></div>
      </SectionCard>
      <SectionCard title="Role & Department">
        <div style={f.grid2}>
          <Field label="Job title"   value={jobTitle} onChange={setJobTitle} />
          <Field label="Department"  value={dept}     onChange={setDept} />
          <Field label="Employee ID" value="EMP-00001"  readonly />
          <Field label="Start date"  value="2020-01-01" readonly />
        </div>
        <div style={f.actions}><SaveBtn onClick={() => showToast('Employment details saved.')} /></div>
      </SectionCard>
    </div>
  )
}

// ─── Security ─────────────────────────────────────────────────────────────────
function AdminSecuritySection({ showToast }: { showToast: (m: string, k?: 'success' | 'error') => void }) {
  const [sessions, setSessions] = useState([
    { device: 'MacBook Pro — Chrome', location: 'Mumbai, IN', time: 'Active now',   current: true  },
    { device: 'iPhone 15 — Safari',   location: 'Mumbai, IN', time: '2 hours ago',  current: false },
    { device: 'Windows PC — Edge',    location: 'Delhi, IN',  time: '5 days ago',   current: false },
  ])
  return (
    <div>
      <SectionCard title="Admin Password">
        <div style={{ fontSize: '0.78rem', color: T.inkSub, marginBottom: '0.85rem' }}>
          Admin credentials are held to a higher security standard. Use a strong, unique password not shared with any other account.
        </div>
        <div style={f.grid2}>
          <Field label="Current password"  value="" type="password" onChange={() => {}} />
          <Field label="New password"      value="" type="password" onChange={() => {}} />
          <Field label="Confirm password"  value="" type="password" onChange={() => {}} />
        </div>
        <div style={f.actions}><SaveBtn onClick={() => showToast('Admin password changed.')} label="Update admin password" /></div>
      </SectionCard>
      <SectionCard title="Privileged Sessions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {sessions.map((sess, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 0.9rem', background: T.bgMuted, borderRadius: '8px', border: `1px solid ${T.border}` }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: T.ink }}>{sess.device}</div>
                <div style={{ fontSize: '0.72rem', color: T.inkSub, marginTop: '0.1rem' }}>{sess.location} · {sess.time}</div>
              </div>
              {sess.current
                ? <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', background: T.greenLight, color: T.green, border: `1px solid ${T.greenBorder}`, borderRadius: '999px' }}>Current</span>
                : <button style={f.dangerBtn} onClick={() => { setSessions(prev => prev.filter((_, j) => j !== i)); showToast('Session revoked.') }}>Revoke</button>}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

// ─── Identity — real enrolled factors from /users/me ─────────────────────────
interface AdminDeviceReg { id: string; name: string; created_at: string | null }
interface AdminEnrolledFactors {
  fido2:     false | AdminDeviceReg[]
  totp:      false | AdminDeviceReg[]
  push:      false | AdminDeviceReg[]
  email_otp: false | AdminDeviceReg[]
  sso:       true
}
interface AdminMeResponse { id: string; email: string; name: string; role: string; enrolled_factors: AdminEnrolledFactors }
type AdminPendingAction = { type: 'delete_account' } | { type: 'unenroll'; factor: string }
const ADMIN_PENDING_KEY = 'mb_pending_admin_identity_action'

const ADMIN_FACTOR_META: Record<string, { label: string; icon: string; canUnenroll: boolean }> = {
  fido2:     { label: 'Passkey (FIDO2 / Biometric)', icon: '🪪', canUnenroll: true  },
  totp:      { label: 'Authenticator App (TOTP)',     icon: '🔑', canUnenroll: true  },
  push:      { label: 'Push Notification',            icon: '📲', canUnenroll: true  },
  email_otp: { label: 'Email OTP',                    icon: '📧', canUnenroll: false },
}

function formatAdminDate(iso: string | null): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '' }
}

function AdminIdentitySection({ showToast }: { showToast: (m: string, k?: 'success' | 'error') => void }) {
  const navigate = useNavigate()
  const { stepupVerified, logout } = useAuth()
  const [factors,     setFactors]     = useState<AdminEnrolledFactors | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [removing,    setRemoving]    = useState<string | null>(null)
  const [tenantUrl,   setTenantUrl]   = useState('')
  const [showModal,   setShowModal]   = useState(false)

  const loadFactors = () => {
    setLoading(true)
    api.get<AdminMeResponse>('/users/me')
      .then(({ data }) => setFactors(data.enrolled_factors))
      .catch(() => setFactors(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadFactors()
    api.get<{ verify_tenant_url: string }>('/auth/sso/config')
      .then(({ data }) => setTenantUrl(data.verify_tenant_url))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Resume pending action after step-up return
  useEffect(() => {
    if (!stepupVerified) return
    const raw = sessionStorage.getItem(ADMIN_PENDING_KEY)
    if (!raw) return
    const action: AdminPendingAction = JSON.parse(raw)
    sessionStorage.removeItem(ADMIN_PENDING_KEY)
    if (action.type === 'delete_account') void doDeleteAccount()
    else if (action.type === 'unenroll') void doUnenroll(action.factor)
  }, [stepupVerified]) // eslint-disable-line react-hooks/exhaustive-deps

  async function doUnenroll(factor: string) {
    setRemoving(factor)
    try {
      await api.delete(`/users/me/factors/${factor}`)
      showToast(`${ADMIN_FACTOR_META[factor]?.label ?? factor} unenrolled.`)
      loadFactors()
    } catch { showToast(`Failed to unenroll. Please try again.`, 'error') }
    finally { setRemoving(null) }
  }

  function handleUnenroll(factor: string) {
    const label = ADMIN_FACTOR_META[factor]?.label ?? factor
    if (!window.confirm(`Remove ${label} from your admin account?\nThis cannot be undone without re-enrolling.`)) return
    if (!stepupVerified) {
      sessionStorage.setItem(ADMIN_PENDING_KEY, JSON.stringify({ type: 'unenroll', factor }))
      navigate('/stepup?return_to=/admin/settings')
      return
    }
    void doUnenroll(factor)
  }

  async function doDeleteAccount() {
    const confirmed = window.prompt('This is irreversible. Type DELETE to confirm.')
    if (confirmed !== 'DELETE') { showToast('Cancelled.', 'error'); return }
    try {
      await api.delete('/users/me')
      logout()
      navigate('/admin', { replace: true })
    } catch { showToast('Account deletion failed.', 'error') }
  }

  function handleDeleteAccount() {
    if (!stepupVerified) {
      sessionStorage.setItem(ADMIN_PENDING_KEY, JSON.stringify({ type: 'delete_account' }))
      navigate('/stepup?return_to=/admin/settings')
      return
    }
    void doDeleteAccount()
  }

  const METHODS = (Object.keys(ADMIN_FACTOR_META) as string[]).map(key => {
    const raw = factors ? (factors as unknown as Record<string, unknown>)[key] : undefined
    const devices: AdminDeviceReg[] = Array.isArray(raw) ? raw : []
    return { key, ...ADMIN_FACTOR_META[key], enrolled: devices.length > 0, devices }
  })

  return (
    <div>
      <SectionCard title="Admin MFA Factors"
        action={<button style={f.outlineBtn} onClick={loadFactors}>Refresh</button>}
      >
        <div style={{ fontSize: '0.78rem', color: T.inkSub, marginBottom: '0.9rem' }}>
          Admin accounts require at least one strong second factor. Step-up verification is mandatory before any privileged action.
        </div>

        {loading ? (
          <div style={{ fontSize: '0.83rem', color: T.inkSub, padding: '0.5rem 0' }}>Loading enrolled factors…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {METHODS.map(m => {
              const isRemoving = removing === m.key
              return (
                <div key={m.key} style={{ borderRadius: '10px', border: `1px solid ${m.enrolled ? T.greenBorder : T.border}`, overflow: 'hidden' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: m.enrolled ? T.greenLight : T.bgMuted }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '1.1rem' }}>{m.icon}</span>
                      <div>
                        <div style={{ fontSize: '0.87rem', fontWeight: 700, color: T.ink }}>{m.label}</div>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '999px', background: m.enrolled ? T.greenLight : T.bgCard, color: m.enrolled ? T.green : T.inkSub, border: `1px solid ${m.enrolled ? T.greenBorder : T.border}` }}>
                          {m.enrolled ? `✓ ${m.devices.length} device${m.devices.length !== 1 ? 's' : ''}` : 'Not enrolled'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {m.enrolled && m.canUnenroll && (
                        <button
                          style={{ padding: '0.35rem 0.85rem', background: T.redLight, border: `1px solid ${T.redBorder}`, color: T.red, borderRadius: '999px', cursor: isRemoving ? 'default' : 'pointer', fontSize: '0.78rem', fontWeight: 600, opacity: isRemoving ? 0.5 : 1 }}
                          onClick={() => !isRemoving && handleUnenroll(m.key)}
                          disabled={isRemoving}
                        >
                          {isRemoving ? 'Removing…' : 'Remove'}
                        </button>
                      )}
                      {m.enrolled && !m.canUnenroll && (
                        <span style={{ fontSize: '0.72rem', color: T.inkSub, fontStyle: 'italic' }}>Always active</span>
                      )}
                    </div>
                  </div>
                  {/* Device list */}
                  {m.enrolled && m.devices.length > 0 && (
                    <div style={{ borderTop: `1px solid ${T.border}` }}>
                      {m.devices.map((dev, idx) => (
                        <div key={dev.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 1rem', background: idx % 2 === 0 ? T.bgCard : T.bgMuted, borderBottom: idx < m.devices.length - 1 ? `1px solid ${T.borderLight}` : 'none' }}>
                          <div>
                            <div style={{ fontSize: '0.83rem', color: T.ink, fontWeight: 600 }}>{dev.name || 'Device'}</div>
                            {dev.created_at && <div style={{ fontSize: '0.7rem', color: T.inkSub, marginTop: '0.1rem' }}>Registered {formatAdminDate(dev.created_at)}</div>}
                          </div>
                          <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: T.greenLight, color: T.green, border: `1px solid ${T.greenBorder}`, fontWeight: 700 }}>Active</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Add method button */}
        <div style={{ marginTop: '1.1rem', paddingTop: '0.9rem', borderTop: `1px solid ${T.borderLight}` }}>
          <button
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.1rem', background: T.amber, color: '#ffffff', borderRadius: '999px', border: 'none', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}
            onClick={() => tenantUrl ? setShowModal(true) : navigate('/enroll')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            Add authentication method
          </button>
          <div style={{ fontSize: '0.72rem', color: T.inkSub, marginTop: '0.45rem' }}>
            Enrol a passkey, authenticator app, push notification, or email OTP.
          </div>
        </div>

        {factors === null && !loading && (
          <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.9rem', background: T.amberLight, border: `1px solid ${T.amberBorder}`, borderRadius: '8px', fontSize: '0.8rem', color: T.amber }}>
            Could not fetch enrollment data. Check your connection and refresh.
          </div>
        )}

        {showModal && (
          <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={() => setShowModal(false)}>
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '420px', boxShadow: T.shadowPop }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: T.ink, marginBottom: '0.5rem' }}>Add authentication method</div>
              <div style={{ fontSize: '0.85rem', color: T.inkSub, lineHeight: 1.65, marginBottom: '1.4rem' }}>
                You'll be taken to your identity provider to enrol your passkey, authenticator app, or push notification. Return here and click Refresh once done.
              </div>
              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <a href={`${tenantUrl}/usc/settings/security`} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem 0', background: T.amber, color: '#ffffff', borderRadius: '999px', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700 }}
                  onClick={() => setShowModal(false)}>
                  Continue →
                </a>
                <button style={{ padding: '0.6rem 1.1rem', background: 'transparent', color: T.inkSub, border: `1px solid ${T.border}`, borderRadius: '999px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }} onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Danger Zone">
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: T.red, marginBottom: '0.2rem' }}>Delete My Account</div>
        <div style={{ fontSize: '0.8rem', color: T.inkSub, maxWidth: '440px', marginBottom: '1rem' }}>
          Permanently removes your admin identity. This action is irreversible and requires step-up verification.
        </div>
        <button style={{ padding: '0.5rem 1.2rem', background: T.red, color: '#fff', border: 'none', borderRadius: '999px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
          onClick={handleDeleteAccount}>
          Delete account
        </button>
      </SectionCard>
    </div>
  )
}

// ─── Notifications ────────────────────────────────────────────────────────────
function AdminNotificationsSection({ showToast }: { showToast: (m: string) => void }) {
  const [email,  setEmail]  = useState(true)
  const [audit,  setAudit]  = useState(true)
  const [alerts, setAlerts] = useState(true)

  function Row({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.75rem 0', borderBottom: `1px solid ${T.borderLight}` }}>
        <div>
          <div style={{ fontSize: '0.87rem', fontWeight: 600, color: T.ink }}>{label}</div>
          <div style={{ fontSize: '0.75rem', color: T.inkSub, marginTop: '0.1rem' }}>{sub}</div>
        </div>
        <button
          style={{ width: '44px', height: '24px', borderRadius: '999px', border: 'none', position: 'relative' as const, cursor: 'pointer', background: checked ? T.amber : T.bgMuted, padding: 0, flexShrink: 0, transition: 'background 0.2s', overflow: 'hidden' }}
          onClick={() => onChange(!checked)}>
          <span style={{ position: 'absolute' as const, top: '3px', left: checked ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.18s ease' }} />
        </button>
      </div>
    )
  }

  return (
    <div>
      <SectionCard title="System Alert Configuration">
        <div style={{ fontSize: '0.78rem', color: T.inkSub, marginBottom: '0.85rem' }}>
          Control which system-level events trigger notifications to this admin account.
        </div>
        <Row label="Identity lifecycle digest" sub="Daily email summary of all Joiner, Mover, and Leaver events" checked={email}  onChange={setEmail} />
        <Row label="High-severity audit alerts" sub="Immediate notification on account deletions and privilege escalations" checked={audit}  onChange={setAudit} />
        <Row label="Suspicious sign-in alerts"  sub="Notify when anomalous or blocked sign-in attempts are detected" checked={alerts} onChange={setAlerts} />
        <div style={f.actions}><SaveBtn onClick={() => showToast('System alert preferences saved.')} /></div>
      </SectionCard>
    </div>
  )
}



// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  pageHeader: { marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle:  { fontSize: '1.5rem', fontWeight: 800, color: T.ink, margin: 0, letterSpacing: '-0.02em' },
  pageSub:    { fontSize: '0.82rem', color: T.inkSub, marginTop: '0.25rem', maxWidth: '520px' },
  body:       { display: 'flex', gap: '1.25rem', alignItems: 'flex-start' },
  sidebar:    { width: '190px', flexShrink: 0, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusCard, boxShadow: T.shadowCard, padding: '0.65rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '2px', position: 'sticky' as const, top: '0' },
  navGroup:   { fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: T.inkLight, padding: '0.4rem 0.85rem 0.2rem', textTransform: 'uppercase' as const },
  navBtn:     { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.85rem', borderRadius: '10px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.87rem', fontWeight: 500, color: T.inkSub, width: '100%', textAlign: 'left' as const },
  navBtnActive: { background: T.amberLight, color: T.amber, fontWeight: 700 },
  content:    { flex: 1, minWidth: 0 },
  toast:      { position: 'fixed' as const, bottom: '1.5rem', right: '1.5rem', padding: '0.75rem 1.25rem', borderRadius: T.radiusInner, fontSize: '0.84rem', fontWeight: 600, zIndex: 9999, boxShadow: T.shadowPop },
  roleBadge:  { fontSize: '0.72rem', fontWeight: 700, padding: '0.3rem 0.9rem', borderRadius: '999px', flexShrink: 0, marginTop: '0.2rem' },
}

const f: Record<string, React.CSSProperties> = {
  card:         { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusCard, padding: '1.25rem 1.5rem', marginBottom: '1.25rem', boxShadow: T.shadowCard },
  cardHead:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' },
  cardTitle:    { fontSize: '0.92rem', fontWeight: 700, color: T.ink, letterSpacing: '-0.01em' },
  grid2:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' },
  fieldWrap:    { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label:        { fontSize: '0.75rem', fontWeight: 600, color: T.inkSub },
  input:        { padding: '0.55rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: T.radiusInput, fontSize: '0.87rem', color: T.ink, outline: 'none', width: '100%', boxSizing: 'border-box' as const, background: T.bgInput },
  inputReadonly:{ background: T.bgMuted, color: T.inkSub, cursor: 'default' },
  hint:         { fontSize: '0.72rem', color: T.inkLight, marginTop: '0.15rem' },
  actions:      { display: 'flex', gap: '0.6rem', marginTop: '1.1rem', paddingTop: '1rem', borderTop: `1px solid ${T.borderLight}` },
  saveBtn:      { padding: '0.5rem 1.1rem', background: T.amber, color: '#ffffff', border: 'none', borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.84rem', fontWeight: 700 },
  cancelBtn:    { padding: '0.5rem 1rem', background: 'transparent', color: T.inkSub, border: `1px solid ${T.border}`, borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600 },
  outlineBtn:   { padding: '0.45rem 0.9rem', background: T.bgMuted, color: T.ink, border: `1px solid ${T.border}`, borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 },
  dangerBtn:    { padding: '0.45rem 0.9rem', background: T.redLight, color: T.red, border: `1px solid ${T.redBorder}`, borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 },
}

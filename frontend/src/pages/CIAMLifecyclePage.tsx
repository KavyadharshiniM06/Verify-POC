/**
 * CIAMLifecyclePage — CIAM Identity Hub
 *
 * Two-tab interface (visible based on role):
 *   1. Engage  — Customer security & authentication status (IBM Verify protection view)
 *   2. Admin   — Administrator identity management console (admin-only)
 *
 * Self-service profile management → Settings → Identity
 * Privacy & consent management    → Settings → Privacy
 *
 * IBM Verify is the IdP for everything — all identity operations
 * route through IBM Verify APIs.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { T } from '../styles/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
interface DeviceReg { id: string; name: string; created_at: string | null }
interface EnrolledFactors {
  fido2: false | DeviceReg[]; totp: false | DeviceReg[]
  push: false | DeviceReg[]; email_otp: false | DeviceReg[]; sso: true
}
interface MeResponse { id: string; email: string; name: string; role: string; phone?: string; last_login?: string; enrolled_factors: EnrolledFactors }

interface VerifyGroup { id: string; displayName: string; memberCount: number; members: {id: string; display: string}[] }

interface AuditEntry {
  action: string; actor_name: string; target_email?: string; details: string; created_at: string
}

type Tab = 'engage' | 'admin'

// ─── Mini icons ───────────────────────────────────────────────────────────────
function TabIcon({ tab }: { tab: Tab }) {
  if (tab === 'engage') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  )
  // admin
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  )
}

function XIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}

function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
}

function RefreshIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/><path d="M20.49 15a9 9 0 01-14.85 3.36L1 14"/></svg>
}

const ACTION_LABEL: Record<string, string> = {
  joiner: 'Joiner',
  mover: 'Mover',
  leaver_disable: 'Leaver (Suspended)',
  leaver_reinstate: 'Reinstated',
  leaver_delete: 'Leaver (Deleted)',
}

const ACTION_COLOR: Record<string, string> = {
  joiner: T.green,
  mover: T.blue,
  leaver_disable: T.red,
  leaver_reinstate: T.amber,
  leaver_delete: '#f85149',
}

// ─── Tab content components ───────────────────────────────────────────────────

// ── Engage — Authentication & Security Status ─────────────────────────────────
interface ActivityEvent {
  timestamp?: string; time?: string; created_at?: string
  action?: string; event_type?: string; type?: string
  outcome?: string; result?: string; status?: string
  detail?: string; description?: string; message?: string
  ip_address?: string
}

function EngageTab() {
  const navigate = useNavigate()
  const { stepupVerified, stepupTime } = useAuth()

  const [me, setMe]               = useState<MeResponse | null>(null)
  const [meLoading, setMeLoading] = useState(true)
  const [activity, setActivity]   = useState<ActivityEvent[]>([])
  const [actLoading, setActLoading] = useState(false)
  const [actError, setActError]   = useState<string | null>(null)

  useEffect(() => {
    api.get<MeResponse>('/users/me')
      .then(r => setMe(r.data))
      .catch(() => {})
      .finally(() => setMeLoading(false))

    // Fetch activity independently — never block tab render
    setActLoading(true)
    api.get<{ events: ActivityEvent[]; source: string; error?: string }>('/users/me/activity?limit=10')
      .then(r => setActivity(Array.isArray(r.data.events) ? r.data.events : []))
      .catch(() => setActError('Activity log requires IBM Verify readActivity permission or is unavailable.'))
      .finally(() => setActLoading(false))
  }, [])

  const FACTORS: { key: keyof EnrolledFactors; label: string; desc: string; icon: string; enrollPath?: string }[] = [
    { key: 'sso',       label: 'Single Sign-On',    desc: 'IBM Verify OIDC — always active',              icon: '☁',  enrollPath: undefined },
    { key: 'fido2',     label: 'Passkey / FIDO2',   desc: 'Hardware-grade biometric / passkey auth',      icon: '🪪', enrollPath: '/enroll?method=passkey' },
    { key: 'totp',      label: 'Authenticator App', desc: 'TOTP — Google/Microsoft Authenticator',        icon: '🔑', enrollPath: '/enroll?method=totp' },
    { key: 'push',      label: 'Push Notification', desc: 'IBM Verify mobile app push approval',          icon: '📱', enrollPath: '/enroll?method=push' },
    { key: 'email_otp', label: 'Email OTP',          desc: 'One-time code delivered to your email',       icon: '✉',  enrollPath: '/enroll?method=email_otp' },
  ]

  const factors = me?.enrolled_factors
  const enrolledCount = factors
    ? Object.entries(factors).filter(([, v]) => v !== false).length
    : 0
  const totalCount = FACTORS.length

  const protectionLevel = enrolledCount >= 4 ? 'Strong' : enrolledCount >= 2 ? 'Moderate' : 'Basic'
  const protectionColor = protectionLevel === 'Strong' ? T.green : protectionLevel === 'Moderate' ? T.amber : T.red
  const protectionBg    = protectionLevel === 'Strong' ? T.greenLight : protectionLevel === 'Moderate' ? T.amberLight : T.redLight
  const protectionBorder = protectionLevel === 'Strong' ? T.greenBorder : protectionLevel === 'Moderate' ? T.amberBorder : T.redBorder

  const stepupAgo = stepupTime
    ? (() => {
        const diffMs = Date.now() - new Date(stepupTime).getTime()
        const mins = Math.floor(diffMs / 60000)
        if (mins < 1) return 'just now'
        if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`
        const hrs = Math.floor(mins / 60)
        return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`
      })()
    : null

  if (meLoading) return <div style={ts.loadingMsg}>Loading security status…</div>

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={ts.sectionTitle}>Authentication &amp; Security Status</h2>
        <p style={ts.sectionSub}>
          How is IBM Verify actively protecting this customer? View enrolled factors, recent
          authentication activity, and step-up verification status — all sourced live from IBM Verify.
        </p>
      </div>

      {/* ── 1. Security Status Banner ── */}
      <div style={ts.engageStatusBanner}>
        {/* Identity Strength */}
        <div style={ts.engageStatusCell}>
          <div style={ts.engageStatusVal}>
            <span style={{ color: protectionColor, fontWeight: 800, fontSize: '1.5rem' }}>{enrolledCount}</span>
            <span style={{ color: T.inkSub, fontSize: '1rem' }}>/{totalCount}</span>
          </div>
          <div style={ts.engageStatusKey}>Factors Enrolled</div>
        </div>

        {/* Protection Level */}
        <div style={ts.engageStatusCell}>
          <span style={{
            ...ts.engageProtBadge,
            background: protectionBg,
            color: protectionColor,
            border: `1px solid ${protectionBorder}`,
          }}>
            {protectionLevel === 'Strong' && '🛡 '}
            {protectionLevel === 'Moderate' && '⚠ '}
            {protectionLevel === 'Basic' && '⚡ '}
            {protectionLevel}
          </span>
          <div style={ts.engageStatusKey}>Protection Level</div>
        </div>

        {/* Account status */}
        <div style={ts.engageStatusCell}>
          <span style={{ ...ts.engageProtBadge, background: T.greenLight, color: T.green, border: `1px solid ${T.greenBorder}` }}>
            ● Active
          </span>
          <div style={ts.engageStatusKey}>Account Status</div>
        </div>

        {/* Last login */}
        <div style={ts.engageStatusCell}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: T.ink }}>
            {me?.last_login
              ? new Date(me.last_login).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
              : '—'}
          </div>
          <div style={ts.engageStatusKey}>Last Login (IBM Verify)</div>
        </div>
      </div>

      {/* ── 2. Enrolled MFA Factors grid ── */}
      <div style={ts.engageSectionHead}>Enrolled MFA Factors</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {/* Strength dots */}
        <div style={{ ...ts.strengthCard, marginBottom: 0 }}>
          <div>
            <div style={ts.strengthLabel}>Identity Strength</div>
            <div style={ts.strengthDesc}>{enrolledCount} of {totalCount} factors active</div>
          </div>
          <div style={ts.strengthBar}>
            {FACTORS.map(f => {
              const enrolled = factors ? factors[f.key] !== false : false
              return (
                <div
                  key={f.key}
                  style={{ ...ts.strengthDot, background: enrolled ? T.green : T.border }}
                  title={f.label}
                />
              )
            })}
          </div>
        </div>

        {FACTORS.map(f => {
          const enrolled = factors ? factors[f.key] !== false : false
          const regs: DeviceReg[] = (enrolled && factors && Array.isArray(factors[f.key]))
            ? (factors[f.key] as DeviceReg[])
            : []
          return (
            <div key={f.key} style={ts.factorCard}>
              <div style={ts.factorIcon}>{f.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={ts.factorLabel}>{f.label}</span>
                  <span style={{
                    ...ts.factorStatus,
                    background: enrolled ? T.greenLight : T.bgMuted,
                    color: enrolled ? T.green : T.inkSub,
                    border: `1px solid ${enrolled ? T.greenBorder : T.border}`,
                  }}>
                    {enrolled ? '✓ Enrolled' : 'Not enrolled'}
                  </span>
                </div>
                <div style={ts.factorDesc}>{f.desc}</div>
                {regs.length > 0 && (
                  <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {regs.map(r => (
                      <span key={r.id} style={ts.deviceTag}>
                        {r.name}
                        {r.created_at && (
                          <span style={{ color: T.inkLight, marginLeft: '0.3rem', fontWeight: 400 }}>
                            · {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ flexShrink: 0 }}>
                {f.key === 'sso' ? (
                  <span style={{ ...ts.factorStatus, background: T.greenLight, color: T.green, border: `1px solid ${T.greenBorder}` }}>Always On</span>
                ) : !enrolled ? (
                  <button style={ts.enrollBtn} onClick={() => navigate(f.enrollPath!)}>
                    Enrol via IBM Verify
                  </button>
                ) : (
                  <span style={ts.enrolledCheck}>✓</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 3. Step-Up Authentication Status ── */}
      <div style={ts.engageSectionHead}>Step-Up Authentication</div>
      <div style={{ ...ts.manageSection, marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            {stepupVerified && stepupAgo ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ ...ts.factorStatus, background: T.greenLight, color: T.green, border: `1px solid ${T.greenBorder}`, fontSize: '0.78rem' }}>
                    ✓ Verified this session
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: T.inkSub }}>Step-up completed <strong style={{ color: T.ink }}>{stepupAgo}</strong></div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ ...ts.factorStatus, background: T.bgMuted, color: T.inkSub, border: `1px solid ${T.border}`, fontSize: '0.78rem' }}>
                    Not verified this session
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: T.inkSub }}>
                  High-value operations require a step-up challenge via IBM Verify.
                </div>
              </>
            )}
          </div>
          <button
            style={ts.enrollBtn}
            onClick={() => navigate('/stepup?return_to=/identity-lifecycle')}
          >
            Trigger Step-Up Now →
          </button>
        </div>
      </div>

      {/* ── 4. Recent Authentication Activity ── */}
      <div style={ts.engageSectionHead}>Recent Authentication Activity</div>
      {actLoading ? (
        <div style={ts.loadingMsg}>Fetching activity from IBM Verify…</div>
      ) : actError ? (
        <div style={{ ...ts.ibvNote, marginBottom: '1rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{actError}</span>
        </div>
      ) : activity.length === 0 ? (
        <div style={{ ...ts.emptyState, marginBottom: '1.5rem' }}>
          No recent authentication events found in IBM Verify.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1.5rem' }}>
          {activity.map((ev, i) => {
            const ts_ = ev.timestamp ?? ev.time ?? ev.created_at ?? ''
            const action = ev.action ?? ev.event_type ?? ev.type ?? 'Authentication event'
            const rawOutcome = (ev.outcome ?? ev.result ?? ev.status ?? 'unknown').toLowerCase()
            const success = rawOutcome === 'success' || rawOutcome === 'succeeded' || rawOutcome === 'allow' || rawOutcome === 'true'
            const failed  = rawOutcome === 'failure' || rawOutcome === 'failed' || rawOutcome === 'deny' || rawOutcome === 'false'
            const outcomeColor = success ? T.green : failed ? T.red : T.inkSub
            const outcomeBg    = success ? T.greenLight : failed ? T.redLight : T.bgMuted
            const outcomeBorder = success ? T.greenBorder : failed ? T.redBorder : T.border
            const detail = ev.detail ?? ev.description ?? ev.message ?? ''
            return (
              <div key={i} style={ts.engageActivityRow}>
                <div style={{ ...ts.auditDot, background: outcomeColor, marginTop: '5px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.83rem', fontWeight: 600, color: T.ink }}>{action}</span>
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 700, padding: '0.12rem 0.45rem',
                      borderRadius: '999px', background: outcomeBg, color: outcomeColor, border: `1px solid ${outcomeBorder}`,
                    }}>
                      {rawOutcome}
                    </span>
                  </div>
                  {detail && <div style={{ fontSize: '0.76rem', color: T.inkSub, marginTop: '0.1rem' }}>{detail}</div>}
                  {ev.ip_address && <div style={{ fontSize: '0.72rem', color: T.inkLight, marginTop: '0.1rem' }}>IP: {ev.ip_address}</div>}
                  {ts_ && <div style={{ fontSize: '0.72rem', color: T.inkLight, marginTop: '0.1rem' }}>{new Date(ts_).toLocaleString()}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 5. IBM Verify Info Footer ── */}
      <div style={{ ...ts.ibvNote, marginTop: '0.5rem' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span>All authentication factors are registered and managed by <strong>IBM Verify SaaS</strong>. Factor enrolment and device management are handled directly through IBM Verify APIs.</span>
      </div>
    </div>
  )
}

// ─── Local types for AdminTab ─────────────────────────────────────────────────
interface ManagedUser {
  id: string; email: string; name: string; role: string
  is_active: boolean; created_at: string; offboarded_at: string | null
  last_login: string | null; mfa_enrolled: boolean | null; last_mfa_type: string | null
}

type AdminFormMode = { kind: 'create' } | { kind: 'edit'; user: ManagedUser } | null
type TempPwdModal  = { name: string; email: string; password: string } | null

const ADMIN_ROLES = ['Manager', 'SalesforceManager', 'Admin']
const ROLE_DISPLAY_A: Record<string, string> = {
  Manager: 'Manager', SalesforceManager: 'Salesforce Manager', Admin: 'Administrator',
}
const ROLE_STYLE_A: Record<string, { bg: string; color: string; border: string }> = {
  Manager:          { bg: T.blueLight,             color: T.blue,    border: T.blue + '44'           },
  SalesforceManager:{ bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'rgba(16,185,129,0.30)' },
  Admin:            { bg: T.amberLight,            color: T.amber,   border: T.amberBorder           },
}
const MFA_LABEL_A: Record<string, string> = {
  fido2: 'Passkey', totp: 'TOTP', push: 'Push', emailotp: 'Email OTP', password: 'Password',
}
function avatarColorA(role: string, isActive: boolean) {
  if (!isActive) return T.red
  if (role === 'Admin')             return '#a78bfa'
  if (role === 'SalesforceManager') return '#10b981'
  return T.blue  // Manager
}
function initialsA(name: string) {
  const parts = name.trim().split(' ')
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}
function formatLastLoginA(iso: string | null): string {
  if (!iso) return '—'
  try {
    const diff  = Date.now() - new Date(iso).getTime()
    const mins  = Math.floor(diff / 60_000)
    const hours = Math.floor(diff / 3_600_000)
    const days  = Math.floor(diff / 86_400_000)
    if (mins  <  2) return 'Just now'
    if (mins  < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days  <  2) return 'Yesterday'
    if (days  <  7) return `${days}d ago`
    return new Date(iso).toLocaleDateString()
  } catch { return '—' }
}

// ─── Inline action dropdown for user directory rows ───────────────────────────
function UserActionMenu({
  user, onEdit, onResetPwd, onResetMFA, onDisable, onReinstate, onDelete,
}: {
  user: ManagedUser
  onEdit: () => void; onResetPwd: () => void; onResetMFA: () => void
  onDisable: () => void; onReinstate: () => void; onDelete: () => void
}) {
  const [open,   setOpen]   = useState(false)
  const [flipUp, setFlipUp] = useState(false)
  const ref    = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setFlipUp(rect.bottom + 240 > window.innerHeight)
    }
    setOpen(v => !v)
  }
  const menuPos: React.CSSProperties = flipUp
    ? { bottom: 'calc(100% + 4px)', top: 'auto' }
    : { top: 'calc(100% + 4px)',    bottom: 'auto' }
  const item = (label: string, color: string, onClick: () => void) => (
    <button
      key={label}
      style={{ display: 'block', width: '100%', textAlign: 'left' as const,
               padding: '0.5rem 0.75rem', background: 'transparent', border: 'none',
               borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem',
               fontWeight: 500, color, fontFamily: 'inherit' }}
      onClick={() => { setOpen(false); onClick() }}
    >{label}</button>
  )
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        ref={btnRef}
        style={{ width: '30px', height: '30px', borderRadius: '6px',
                 border: `1px solid ${T.border}`, background: T.bgCard,
                 display: 'flex', alignItems: 'center', justifyContent: 'center',
                 cursor: 'pointer', color: T.inkSub }}
        onClick={toggle} title="Actions"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
        </svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, background: T.bgCard,
                      border: `1px solid ${T.border}`, borderRadius: '10px',
                      boxShadow: T.shadowPop, zIndex: 100, minWidth: '170px',
                      padding: '0.35rem', display: 'flex', flexDirection: 'column',
                      gap: '1px', ...menuPos }}>
          {item('Edit / Mover',         T.ink,    onEdit)}
          {item('Reset Password',       T.ink,    onResetPwd)}
          {item('Reset MFA',            T.amber,  onResetMFA)}
          <div style={{ height: '1px', background: T.borderLight, margin: '0.2rem 0' }} />
          {user.is_active
            ? item('Suspend (Leaver)',    T.orange, onDisable)
            : item('Reinstate',          T.green,  onReinstate)
          }
          {item('Delete (Hard Leaver)', T.red, onDelete)}
        </div>
      )}
    </div>
  )
}

// ─── Create / Edit user modal ─────────────────────────────────────────────────
function AdminUserModal({
  mode, onClose, onSaved, showToast,
}: {
  mode: Exclude<AdminFormMode, null>
  onClose: () => void
  onSaved: () => void
  showToast: (m: string, k?: 'success' | 'error') => void
}) {
  const isEdit   = mode.kind === 'edit'
  const existing = isEdit ? mode.user : null
  const [email,    setEmail]    = useState(existing?.email    ?? '')
  const [name,     setName]     = useState(existing?.name     ?? '')
  const [role,     setRole]     = useState(existing?.role     ?? 'Manager')
  const [isActive, setIsActive] = useState(existing?.is_active ?? true)
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState<string | null>(null)
  const [tempPwd,  setTempPwd]  = useState<string | null>(null)

  const handleSave = async () => {
    if (!email.trim() || !name.trim()) { setErr('Email and name are required'); return }
    setSaving(true); setErr(null)
    try {
      if (isEdit && existing) {
        await api.put(`/users/${existing.id}`, { email, name, role, is_active: isActive })
        showToast('User updated.', 'success')
        onSaved()
      } else {
        const { data } = await api.post<{ temporary_password?: string }>('/users', { email, name, role })
        if (data.temporary_password) {
          setTempPwd(data.temporary_password)
        } else {
          showToast('User created.', 'success')
          onSaved()
        }
      }
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErr(detail ?? 'Save failed.')
    } finally { setSaving(false) }
  }

  if (tempPwd) {
    return (
      <div style={ts.adminOverlay} onClick={onClose}>
        <div style={ts.adminModal} onClick={e => e.stopPropagation()}>
          <div style={ts.adminModalHead}>
            <div>
              <div style={ts.adminModalTitle}>User Created</div>
              <div style={ts.adminModalSub}>{name} · {email}</div>
            </div>
            <button style={ts.adminCloseBtn} onClick={() => onSaved()}><XIcon /></button>
          </div>
          <p style={{ fontSize: '0.85rem', color: T.inkSub, margin: '0 0 0.75rem' }}>
            Share this temporary password securely. The user must change it on next login.
          </p>
          <div style={ts.adminPwdBox}>{tempPwd}</div>
          <p style={{ fontSize: '0.78rem', color: T.amber, margin: '0.5rem 0 1.25rem', display: 'flex', gap: '0.35rem' }}>
            ⚠ This password will not be shown again. Copy it now.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={ts.saveBtn} onClick={() => navigator.clipboard.writeText(tempPwd)}>Copy to clipboard</button>
            <button style={ts.outlineBtn} onClick={() => onSaved()}>Done</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={ts.adminOverlay} onClick={onClose}>
      <div style={ts.adminModal} onClick={e => e.stopPropagation()}>
        <div style={ts.adminModalHead}>
          <div>
            <div style={ts.adminModalTitle}>{isEdit ? 'Edit User (Mover)' : 'Create User (Joiner)'}</div>
            <div style={ts.adminModalSub}>{isEdit ? `Updating ${existing?.name}` : 'New identity in IBM Verify'}</div>
          </div>
          <button style={ts.adminCloseBtn} onClick={onClose}><XIcon /></button>
        </div>
        <div style={{ display: 'grid', gap: '0.85rem', marginBottom: '1rem' }}>
          <div>
            <label style={ts.fieldLabel}>Full Name</label>
            <input style={ts.fieldInput} value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label style={ts.fieldLabel}>Email Address</label>
            <input style={ts.fieldInput} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@mockbank.com" />
          </div>
          <div>
            <label style={ts.fieldLabel}>Role</label>
            <select style={ts.fieldInput} value={role} onChange={e => setRole(e.target.value)}>
              {ADMIN_ROLES.map(r => <option key={r} value={r}>{ROLE_DISPLAY_A[r] ?? r}</option>)}
            </select>
          </div>
          {isEdit && (
            <div>
              <label style={ts.fieldLabel}>Account Status</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {([true, false] as const).map(v => (
                  <button
                    key={String(v)}
                    style={{ flex: 1, padding: '0.5rem',
                             border: `1.5px solid ${isActive === v ? (v ? T.greenBorder : T.redBorder) : T.border}`,
                             borderRadius: '7px', cursor: 'pointer', fontWeight: 600,
                             fontSize: '0.82rem', fontFamily: 'inherit',
                             background: isActive === v ? (v ? T.greenLight : T.redLight) : T.bgInput,
                             color: isActive === v ? (v ? T.green : T.red) : T.inkSub }}
                    onClick={() => setIsActive(v)}
                  >{v ? 'Active' : 'Suspended'}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        {err && <div style={{ ...ts.errorBox, marginBottom: '0.75rem' }}>⚠ {err}</div>}
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button style={ts.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
          </button>
          <button style={ts.outlineBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── 4. Admin — Groups, User Directory, Audit & Activity (admin-only) ──────────
function AdminTab({ showToast }: { showToast: (m: string, k?: 'success' | 'error') => void }) {
  const { user } = useAuth()
  type AdminSection = 'groups' | 'user_directory' | 'audit_activity'
  const [section, setSection] = useState<AdminSection>('groups')

  // ── Groups state ─────────────────────────────────────────────────────────
  const [groups,        setGroups]        = useState<VerifyGroup[]>([])
  const [groupsLoad,    setGroupsLoad]    = useState(true)
  const [groupError,    setGroupError]    = useState<string | null>(null)
  const [newGroupName,  setNewGroupName]  = useState('')
  const [creating,      setCreating]      = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<VerifyGroup | null>(null)
  const [addMemberId,   setAddMemberId]   = useState('')
  const [addingMember,  setAddingMember]  = useState(false)

  // ── User directory state ──────────────────────────────────────────────────
  const [dirUsers,   setDirUsers]   = useState<ManagedUser[]>([])
  const [dirLoad,    setDirLoad]    = useState(false)
  const [dirSearch,  setDirSearch]  = useState('')
  const [dirStatus,  setDirStatus]  = useState<'All' | 'Active' | 'Suspended'>('All')
  const [dirForm,    setDirForm]    = useState<AdminFormMode>(null)
  const [dirTempPwd, setDirTempPwd] = useState<TempPwdModal>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Audit / activity state ────────────────────────────────────────────────
  const [auditSegment, setAuditSegment] = useState<'app' | 'ibm'>('app')
  const [auditLog,     setAuditLog]     = useState<AuditEntry[]>([])
  const [auditLoad,    setAuditLoad]    = useState(false)
  const [ibmEvents,    setIbmEvents]    = useState<unknown[]>([])
  const [ibmLoad,      setIbmLoad]      = useState(false)
  const [ibmError,     setIbmError]     = useState<string | null>(null)

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadGroups = () => {
    setGroupsLoad(true)
    api.get<{ groups: VerifyGroup[] }>('/groups')
      .then(r => setGroups(r.data.groups))
      .catch(() => setGroupError('Failed to load groups from IBM Verify.'))
      .finally(() => setGroupsLoad(false))
  }

  const loadDirectory = (search?: string) => {
    setDirLoad(true)
    const q = search !== undefined ? search : dirSearch
    const params = new URLSearchParams()
    if (q.trim()) params.set('search', q.trim())
    api.get<{ users: ManagedUser[]; total: number }>(`/users?${params}`)
      .then(r => setDirUsers(r.data.users))
      .catch(() => {})
      .finally(() => setDirLoad(false))
  }

  const loadAudit = () => {
    setAuditLoad(true)
    api.get<AuditEntry[]>('/users/audit/recent?limit=100')
      .then(r => setAuditLog(r.data))
      .catch(() => {})
      .finally(() => setAuditLoad(false))
  }

  const loadIbmActivity = () => {
    setIbmLoad(true); setIbmError(null)
    api.get<{ events: unknown[]; error?: string }>('/users/audit/ibm-activity?limit=50')
      .then(r => {
        setIbmEvents(r.data.events)
        if (r.data.error) setIbmError(r.data.error)
      })
      .catch(() => setIbmError('IBM Verify activity log unavailable.'))
      .finally(() => setIbmLoad(false))
  }

  useEffect(() => {
    loadGroups()
    loadDirectory()
    loadAudit()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDirSearch = (val: string) => {
    setDirSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadDirectory(val), 400)
  }

  // ── Group handlers ────────────────────────────────────────────────────────
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return
    setCreating(true)
    try {
      await api.post('/groups', { displayName: newGroupName.trim() })
      setNewGroupName('')
      showToast(`Group "${newGroupName.trim()}" created in IBM Verify.`, 'success')
      loadGroups()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast(msg ?? 'Failed to create group.', 'error')
    } finally { setCreating(false) }
  }

  const handleDeleteGroup = async (g: VerifyGroup) => {
    if (!window.confirm(`Delete group "${g.displayName}" from IBM Verify? This cannot be undone.`)) return
    try {
      await api.delete(`/groups/${g.id}`)
      showToast(`Group "${g.displayName}" deleted.`, 'success')
      if (selectedGroup?.id === g.id) setSelectedGroup(null)
      loadGroups()
    } catch {
      showToast('Failed to delete group.', 'error')
    }
  }

  const refreshSelectedGroup = async () => {
    const r = await api.get<{ groups: VerifyGroup[] }>('/groups')
    setGroups(r.data.groups)
    if (selectedGroup) {
      const updated = r.data.groups.find(g => g.id === selectedGroup.id)
      if (updated) setSelectedGroup(updated)
    }
  }

  const handleAddMember = async () => {
    if (!selectedGroup || !addMemberId.trim()) return
    setAddingMember(true)
    try {
      await api.post(`/groups/${selectedGroup.id}/members`, { user_ids: [addMemberId.trim()] })
      setAddMemberId('')
      showToast('Member added to group.', 'success')
      await refreshSelectedGroup()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast(msg ?? 'Failed to add member.', 'error')
    } finally { setAddingMember(false) }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedGroup) return
    try {
      await api.delete(`/groups/${selectedGroup.id}/members/${memberId}`)
      showToast('Member removed.', 'success')
      await refreshSelectedGroup()
    } catch {
      showToast('Failed to remove member.', 'error')
    }
  }

  // ── User directory handlers ───────────────────────────────────────────────
  const handleDisable = async (u: ManagedUser) => {
    if (!window.confirm(`Suspend access for ${u.name}?`)) return
    try { await api.post(`/users/${u.id}/disable`); loadDirectory(); showToast('User suspended.', 'success') }
    catch { showToast('Failed to suspend user.', 'error') }
  }
  const handleReinstate = async (u: ManagedUser) => {
    try { await api.post(`/users/${u.id}/reinstate`); loadDirectory(); showToast('User reinstated.', 'success') }
    catch { showToast('Failed to reinstate user.', 'error') }
  }
  const handleResetMFA = async (u: ManagedUser) => {
    if (!window.confirm(`Reset all MFA factors for ${u.name}? They will re-enrol on next login.`)) return
    try { await api.delete(`/users/${u.id}/factors`); loadDirectory(); showToast('MFA factors cleared.', 'success') }
    catch { showToast('Failed to reset MFA.', 'error') }
  }
  const handleResetPassword = async (u: ManagedUser) => {
    if (!window.confirm(`Reset password for ${u.name}?`)) return
    try {
      const { data } = await api.post<{ temporary_password: string }>(`/users/${u.id}/reset-password`)
      setDirTempPwd({ name: u.name, email: u.email, password: data.temporary_password })
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast(detail ?? 'Failed to reset password.', 'error')
    }
  }
  const handleDeleteUser = async (u: ManagedUser) => {
    if (!window.confirm(`Permanently delete ${u.name}? This removes them from IBM Verify and cannot be undone.`)) return
    try { await api.delete(`/users/${u.id}`); loadDirectory(); showToast('User deleted.', 'success') }
    catch { showToast('Failed to delete user.', 'error') }
  }

  // ── Filtered directory list ───────────────────────────────────────────────
  const filteredDir = dirUsers.filter(u => {
    if (dirStatus === 'Active'    && !u.is_active)  return false
    if (dirStatus === 'Suspended' &&  u.is_active)  return false
    return true
  })

  if (user?.role !== 'Admin') {
    return <div style={{ padding: '2rem', textAlign: 'center', color: T.inkSub }}>Admin role required to view this section.</div>
  }

  const SUB_TABS: { id: AdminSection; label: string }[] = [
    { id: 'groups',         label: 'IBM Verify Groups' },
    { id: 'user_directory', label: 'User Directory'    },
    { id: 'audit_activity', label: 'Audit & Activity'  },
  ]

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={ts.sectionTitle}>Admin — IBM Verify Identity Operations</h2>
        <p style={ts.sectionSub}>
          Centrally control identities, access and security — manage users and groups in IBM Verify,
          review lifecycle audit logs (Joiner · Mover · Leaver), and inspect real-time platform activity.
        </p>
      </div>

      {/* Sub-tab strip */}
      <div style={ts.subTabBar}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            style={{ ...ts.subTab, ...(section === t.id ? ts.subTabActive : {}) }}
            onClick={() => {
              setSection(t.id)
              if (t.id === 'audit_activity' && auditLog.length === 0 && !auditLoad) loadAudit()
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* ═══════════════ SUB-TAB 1 — IBM Verify Groups ═══════════════ */}
      {section === 'groups' && (
        <div>
          {groupError && <div style={ts.errorBox}>⚠ {groupError}</div>}

          <div style={ts.createGroupBar}>
            <input
              style={{ ...ts.fieldInput, flex: 1 }}
              placeholder="New group display name (e.g. Finance-Team)"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
            />
            <button
              style={{ ...ts.saveBtn, display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem' }}
              onClick={handleCreateGroup}
              disabled={creating || !newGroupName.trim()}
            >
              <PlusIcon /> {creating ? 'Creating…' : 'Create Group'}
            </button>
            <button style={ts.refreshIconBtn} onClick={loadGroups} title="Refresh groups">
              <RefreshIcon />
            </button>
          </div>

          {groupsLoad ? (
            <div style={ts.loadingMsg}>Loading IBM Verify groups…</div>
          ) : groups.length === 0 ? (
            <div style={ts.emptyState}>No groups found in IBM Verify. Create one above.</div>
          ) : (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              {/* Group card list */}
              <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {groups.map(g => (
                  <div
                    key={g.id}
                    style={{ ...ts.groupCard, ...(selectedGroup?.id === g.id ? ts.groupCardActive : {}), cursor: 'pointer' }}
                    onClick={() => setSelectedGroup(selectedGroup?.id === g.id ? null : g)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: T.ink, marginBottom: '0.2rem' }}>
                        {g.displayName}
                      </div>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.45rem',
                                     borderRadius: '999px', background: T.amberLight, color: T.amber,
                                     border: `1px solid ${T.amberBorder}` }}>
                        {g.memberCount} member{g.memberCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <button
                      style={ts.deleteGroupBtn}
                      onClick={e => { e.stopPropagation(); handleDeleteGroup(g) }}
                      title="Delete group"
                    ><XIcon /></button>
                  </div>
                ))}
              </div>

              {/* Group detail / member management */}
              {selectedGroup ? (
                <div style={ts.groupDetail}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: T.ink }}>{selectedGroup.displayName}</div>
                      <div style={{ fontSize: '0.72rem', color: T.inkLight, marginTop: '0.1rem', fontFamily: 'monospace' }}>
                        ID: {selectedGroup.id}
                      </div>
                    </div>
                    <button style={ts.refreshIconBtn} onClick={refreshSelectedGroup} title="Refresh">
                      <RefreshIcon />
                    </button>
                  </div>

                  {/* Add member input */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <input
                      style={{ ...ts.fieldInput, flex: 1, fontSize: '0.82rem' }}
                      placeholder="IBM Verify User ID to add…"
                      value={addMemberId}
                      onChange={e => setAddMemberId(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddMember()}
                    />
                    <button
                      style={{ ...ts.saveBtn, display: 'flex', alignItems: 'center', gap: '0.35rem',
                               padding: '0.5rem 0.85rem', fontSize: '0.82rem',
                               opacity: addingMember ? 0.6 : 1 }}
                      onClick={handleAddMember}
                      disabled={addingMember || !addMemberId.trim()}
                    >
                      <PlusIcon /> {addingMember ? 'Adding…' : 'Add Member'}
                    </button>
                  </div>

                  <div style={ts.manageSectionTitle}>Members ({selectedGroup.members.length})</div>

                  {selectedGroup.members.length === 0 ? (
                    <div style={ts.emptyState}>No members in this group.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {selectedGroup.members.map(m => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center',
                                                  justifyContent: 'space-between', padding: '0.5rem 0.75rem',
                                                  background: T.bgMuted, borderRadius: '7px' }}>
                          <div>
                            <div style={{ fontSize: '0.83rem', fontWeight: 600, color: T.ink }}>
                              {m.display || '(no display name)'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: T.inkLight, fontFamily: 'monospace' }}>{m.id}</div>
                          </div>
                          <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer',
                                     color: T.red, padding: '0.2rem', display: 'flex', alignItems: 'center' }}
                            onClick={() => handleRemoveMember(m.id)}
                            title="Remove from group"
                          ><XIcon /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ ...ts.groupDetail, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: T.inkSub, fontSize: '0.85rem' }}>← Select a group to manage members</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ SUB-TAB 2 — User Directory ═══════════════ */}
      {section === 'user_directory' && (
        <div>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', minWidth: '220px' }}>
              <span style={{ position: 'absolute', left: '0.75rem', color: T.inkSub, display: 'flex', pointerEvents: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </span>
              <input
                style={{ ...ts.fieldInput, paddingLeft: '2.2rem' }}
                placeholder="Search name or email…"
                value={dirSearch}
                onChange={e => handleDirSearch(e.target.value)}
              />
            </div>
            <select
              style={{ ...ts.fieldInput, width: 'auto', cursor: 'pointer' }}
              value={dirStatus}
              onChange={e => setDirStatus(e.target.value as typeof dirStatus)}
            >
              {(['All', 'Active', 'Suspended'] as const).map(v => (
                <option key={v} value={v}>Status: {v}</option>
              ))}
            </select>
            <button style={ts.refreshIconBtn} onClick={() => loadDirectory()} title="Refresh"><RefreshIcon /></button>
            <button
              style={{ ...ts.saveBtn, display: 'flex', alignItems: 'center', gap: '0.4rem',
                       padding: '0.55rem 1rem', fontSize: '0.85rem' }}
              onClick={() => setDirForm({ kind: 'create' })}
            ><PlusIcon /> Create User</button>
          </div>

          {/* Table */}
          <div style={{ background: T.bgMuted, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            {dirLoad ? (
              <div style={ts.loadingMsg}>Loading directory…</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {['User', 'Role', 'Status', 'MFA', 'Last Login', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '0.65rem 0.85rem', textAlign: 'left' as const,
                                           fontSize: '0.72rem', fontWeight: 700, color: T.inkSub,
                                           letterSpacing: '0.05em', textTransform: 'uppercase' as const,
                                           whiteSpace: 'nowrap' as const }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDir.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '3rem', textAlign: 'center' as const,
                                               color: T.inkSub, fontSize: '0.875rem' }}>
                        No users match the current filter.
                      </td>
                    </tr>
                  )}
                  {filteredDir.map((u, idx) => {
                    const bg       = avatarColorA(u.role, u.is_active)
                    const ini      = initialsA(u.name)
                    const mfaLabel = u.last_mfa_type ? (MFA_LABEL_A[u.last_mfa_type] ?? u.last_mfa_type) : null
                    const rst      = ROLE_STYLE_A[u.role] ?? ROLE_STYLE_A.Customer
                    return (
                      <tr key={u.id} style={{ background: idx % 2 === 0 ? T.bgCard : T.bgMuted,
                                              borderBottom: `1px solid ${T.borderLight}` }}>
                        <td style={{ padding: '0.65rem 0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: bg,
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          fontSize: '0.72rem', fontWeight: 800, color: '#0d1117', flexShrink: 0 }}>
                              {ini}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: T.ink }}>{u.name}</div>
                              <div style={{ fontSize: '0.72rem', color: T.inkSub }}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                         fontSize: '0.72rem', fontWeight: 700, padding: '0.18rem 0.55rem',
                                         borderRadius: '999px', border: `1px solid ${rst.border}`,
                                         background: rst.bg, color: rst.color }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%',
                                           background: rst.color, flexShrink: 0 }} />
                            {ROLE_DISPLAY_A[u.role] ?? u.role}
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                         fontSize: '0.72rem', fontWeight: 700, padding: '0.18rem 0.55rem',
                                         borderRadius: '999px',
                                         background: u.is_active ? T.greenLight : T.redLight,
                                         color:      u.is_active ? T.green      : T.red,
                                         border:     `1px solid ${u.is_active ? T.greenBorder : T.redBorder}` }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%',
                                           background: u.is_active ? T.green : T.red }} />
                            {u.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem' }}>
                          {u.mfa_enrolled === null ? (
                            <span style={{ fontSize: '0.78rem', color: T.inkSub }}>—</span>
                          ) : u.mfa_enrolled ? (
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.18rem 0.5rem',
                                           borderRadius: '999px', background: T.greenLight, color: T.green,
                                           border: `1px solid ${T.greenBorder}` }}>
                              {mfaLabel ?? '✓ Enrolled'}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.18rem 0.5rem',
                                           borderRadius: '999px', background: T.amberLight, color: T.amber,
                                           border: `1px solid ${T.amberBorder}` }}>
                              No MFA
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', color: T.inkSub, fontSize: '0.82rem' }}>
                          {formatLastLoginA(u.last_login)}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' as const }}>
                          <UserActionMenu
                            user={u}
                            onEdit={() => setDirForm({ kind: 'edit', user: u })}
                            onResetPwd={() => handleResetPassword(u)}
                            onResetMFA={() => handleResetMFA(u)}
                            onDisable={() => handleDisable(u)}
                            onReinstate={() => handleReinstate(u)}
                            onDelete={() => handleDeleteUser(u)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {!dirLoad && (
              <div style={{ padding: '0.65rem 0.85rem', borderTop: `1px solid ${T.border}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: T.inkSub }}>
                  Showing {filteredDir.length} of {dirUsers.length} users
                </span>
                <span style={{ fontSize: '0.72rem', color: T.inkLight }}>Source: IBM Verify SCIM</span>
              </div>
            )}
          </div>

          {dirForm && (
            <AdminUserModal
              mode={dirForm}
              onClose={() => setDirForm(null)}
              onSaved={() => { setDirForm(null); loadDirectory() }}
              showToast={showToast}
            />
          )}

          {dirTempPwd && (
            <div style={ts.adminOverlay} onClick={() => setDirTempPwd(null)}>
              <div style={ts.adminModal} onClick={e => e.stopPropagation()}>
                <div style={ts.adminModalHead}>
                  <div>
                    <div style={ts.adminModalTitle}>Password Reset</div>
                    <div style={ts.adminModalSub}>{dirTempPwd.name} · {dirTempPwd.email}</div>
                  </div>
                  <button style={ts.adminCloseBtn} onClick={() => setDirTempPwd(null)}><XIcon /></button>
                </div>
                <p style={{ fontSize: '0.85rem', color: T.inkSub, margin: '0 0 0.75rem' }}>
                  Share this temporary password securely. The user must change it on next login.
                </p>
                <div style={ts.adminPwdBox}>{dirTempPwd.password}</div>
                <p style={{ fontSize: '0.78rem', color: T.amber, margin: '0.5rem 0 1.25rem',
                             display: 'flex', gap: '0.35rem' }}>
                  ⚠ This password will not be shown again. Copy it now.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button style={ts.saveBtn}
                    onClick={() => navigator.clipboard.writeText(dirTempPwd.password)}>
                    Copy to clipboard
                  </button>
                  <button style={ts.outlineBtn} onClick={() => setDirTempPwd(null)}>Close</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ SUB-TAB 3 — Audit & Activity ═══════════════ */}
      {section === 'audit_activity' && (
        <div>
          {/* Segment pills + refresh */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', alignItems: 'center' }}>
            {([
              { id: 'app', label: 'App Lifecycle Events' },
              { id: 'ibm', label: 'IBM Verify Activity'  },
            ] as const).map(seg => (
              <button
                key={seg.id}
                style={{ padding: '0.35rem 0.9rem', borderRadius: '999px', fontSize: '0.8rem',
                         fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                         border: `1px solid ${auditSegment === seg.id ? T.amber : T.border}`,
                         background: auditSegment === seg.id ? T.amberLight : 'transparent',
                         color: auditSegment === seg.id ? T.amber : T.inkSub }}
                onClick={() => {
                  setAuditSegment(seg.id)
                  if (seg.id === 'ibm' && ibmEvents.length === 0 && !ibmLoad) loadIbmActivity()
                }}
              >{seg.label}</button>
            ))}
            <div style={{ marginLeft: 'auto' }}>
              {auditSegment === 'app'
                ? <button style={ts.outlineBtn} onClick={loadAudit}><RefreshIcon /> Refresh</button>
                : <button style={ts.outlineBtn} onClick={loadIbmActivity}><RefreshIcon /> Refresh</button>
              }
            </div>
          </div>

          {/* App Lifecycle Events */}
          {auditSegment === 'app' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.55rem',
                               borderRadius: '999px', background: T.greenLight, color: T.green,
                               border: `1px solid ${T.greenBorder}` }}>
                  Source: MockBank DB
                </span>
                <span style={{ fontSize: '0.75rem', color: T.inkSub }}>
                  Joiner · Mover · Leaver events captured by the application
                </span>
              </div>
              {auditLoad ? (
                <div style={ts.loadingMsg}>Loading audit log…</div>
              ) : auditLog.length === 0 ? (
                <div style={ts.emptyState}>No lifecycle events recorded yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {auditLog.map((e, i) => {
                    const color = ACTION_COLOR[e.action] ?? T.inkSub
                    return (
                      <div key={i} style={ts.auditRow}>
                        <div style={{ ...ts.auditDot, background: color }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color }}>
                              {ACTION_LABEL[e.action] ?? e.action}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: T.inkSub }}>by {e.actor_name}</span>
                            {e.target_email && (
                              <span style={{ fontSize: '0.75rem', color: T.ink, fontWeight: 500 }}>→ {e.target_email}</span>
                            )}
                          </div>
                          {e.details && (
                            <div style={{ fontSize: '0.78rem', color: T.inkSub, marginTop: '0.15rem' }}>{e.details}</div>
                          )}
                          <div style={{ fontSize: '0.72rem', color: T.inkLight, marginTop: '0.15rem' }}>
                            {new Date(e.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* IBM Verify Activity */}
          {auditSegment === 'ibm' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.55rem',
                               borderRadius: '999px', background: T.blueLight, color: T.blue,
                               border: `1px solid ${T.blue}44` }}>
                  Source: IBM Verify
                </span>
                <span style={{ fontSize: '0.75rem', color: T.inkSub }}>
                  Real-time authentication and administrative events from the IBM Verify platform
                </span>
              </div>
              {ibmError && (
                <div style={{ ...ts.ibvNote, marginBottom: '0.85rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>{ibmError}</span>
                </div>
              )}
              {ibmLoad ? (
                <div style={ts.loadingMsg}>Fetching IBM Verify activity…</div>
              ) : ibmEvents.length === 0 ? (
                <div style={ts.emptyState}>
                  No IBM Verify activity events returned.{' '}
                  <span style={{ color: T.inkSub }}>
                    IBM Verify activity log requires <code>readActivity</code> scope — may not be enabled on this tenant.
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {ibmEvents.map((ev, i) => {
                    const e      = ev as Record<string, unknown>
                    const ts2    = (e['time'] ?? e['created'] ?? e['timestamp'] ?? '') as string
                    const actor  = ((e['actor'] as Record<string, unknown>)?.['displayName'] ?? e['actorId'] ?? '—') as string
                    const action = (e['action'] ?? e['eventType'] ?? e['type'] ?? 'event') as string
                    const target = ((e['target'] as Record<string, unknown>)?.['displayName'] ?? e['targetId'] ?? '') as string
                    return (
                      <div key={i} style={ts.auditRow}>
                        <div style={{ ...ts.auditDot, background: T.blue }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: T.ink }}>{String(action)}</div>
                          <div style={{ fontSize: '0.75rem', color: T.inkSub, marginTop: '0.1rem' }}>
                            {actor}{target ? ` → ${target}` : ''}
                          </div>
                          {ts2 && (
                            <div style={{ fontSize: '0.72rem', color: T.inkLight, marginTop: '0.1rem' }}>
                              {new Date(ts2).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CIAMLifecyclePage() {
  const { user } = useAuth()
  // Default to 'engage' for all users; admins also see the 'admin' tab.
  const [activeTab, setActiveTab] = useState<Tab>('engage')
  const [toast,     setToast]     = useState<{ msg: string; kind: 'success' | 'error' } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string, kind: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ msg, kind })
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }

  const TABS: { id: Tab; label: string; roleRequired?: string[] }[] = [
    { id: 'engage', label: 'Engage' },
    { id: 'admin',  label: 'Admin', roleRequired: ['Admin'] },
  ]

  return (
    <div style={ts.root}>
      {/* Page header */}
      <div style={ts.pageHead}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.3rem' }}>
            <h1 style={ts.pageTitle}>Identity Lifecycle</h1>
            <span style={ts.ibvBadgePill}>IBM Verify</span>
          </div>
          <p style={ts.pageSub}>
            <strong>Engage</strong> — see how IBM Verify is actively protecting your account.
            {user?.role === 'Admin' && <> &nbsp;·&nbsp; <strong>Admin</strong> — manage identities, groups and audit logs.</>}
            {' '}Self-service profile &amp; consent management lives under{' '}
            <a href="/settings" style={{ color: T.amber, textDecoration: 'none' }}>Settings</a>.
          </p>
        </div>
        {user && (
          <div style={ts.userChip}>
            <div style={ts.userChipAvatar}>
              {(user.name.split(' ').map(w => w[0]).join('').slice(0, 2)).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: T.ink }}>{user.name}</div>
              <div style={{ fontSize: '0.7rem', color: T.inkSub }}>{user.role}</div>
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={ts.tabBar}>
        {TABS.filter(t => !t.roleRequired || t.roleRequired.includes(user?.role ?? '')).map(t => (
          <button
            key={t.id}
            style={{ ...ts.tabBtn, ...(activeTab === t.id ? ts.tabBtnActive : {}) }}
            onClick={() => setActiveTab(t.id)}
          >
            <TabIcon tab={t.id} />
            {t.label}
            {t.id === 'admin' && user?.role === 'Admin' && (
              <span style={ts.adminPip} />
            )}
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          ...ts.toast,
          background: toast.kind === 'success' ? T.greenLight : T.redLight,
          border: `1px solid ${toast.kind === 'success' ? T.greenBorder : T.redBorder}`,
          color: toast.kind === 'success' ? T.green : T.red,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Tab content */}
      <div style={ts.tabContent}>
        {activeTab === 'engage' && <EngageTab />}
        {activeTab === 'admin'  && user?.role === 'Admin' && <AdminTab showToast={showToast} />}
        {activeTab === 'admin'  && user?.role !== 'Admin' && (
          <div style={{ textAlign: 'center', padding: '3rem', color: T.inkSub }}>
            Admin role required.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ts: Record<string, React.CSSProperties> = {
  root: { fontFamily: T.fontFamily, minHeight: '100%' },

  pageHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem',
  },
  pageTitle: { fontSize: '1.55rem', fontWeight: 700, color: T.ink, margin: 0 },
  pageSub:   { fontSize: '0.82rem', color: T.inkSub, margin: '0.25rem 0 0', maxWidth: '620px' },

  ibvBadgePill: {
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
    padding: '0.2rem 0.6rem', borderRadius: '999px',
    background: T.amberLight, color: T.amber, border: `1px solid ${T.amberBorder}`,
    display: 'inline-flex', alignItems: 'center',
  },

  userChip: {
    display: 'flex', alignItems: 'center', gap: '0.65rem',
    padding: '0.5rem 1rem', background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '10px',
  },
  userChipAvatar: {
    width: '34px', height: '34px', borderRadius: '50%',
    background: T.amber, color: '#0d1117',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.75rem', fontWeight: 800, flexShrink: 0,
  },

  tabBar: {
    display: 'flex', gap: '0.25rem',
    borderBottom: `1px solid ${T.border}`,
    marginBottom: '1.5rem',
    paddingBottom: '0',
    overflowX: 'auto' as const,
  },
  tabBtn: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.65rem 1.1rem',
    background: 'transparent', border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer', color: T.inkSub,
    fontSize: '0.88rem', fontWeight: 600, fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
    transition: 'color 0.12s',
    position: 'relative' as const,
  },
  tabBtnActive: {
    color: T.ink,
    borderBottomColor: T.amber,
  },
  adminPip: {
    width: '6px', height: '6px', borderRadius: '50%',
    background: T.amber, marginLeft: '2px',
  },

  tabContent: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '12px', padding: '1.5rem',
    minHeight: '400px',
  },

  loadingMsg: { padding: '3rem', textAlign: 'center', color: T.inkSub, fontSize: '0.875rem' },
  emptyState: { padding: '2rem', textAlign: 'center', color: T.inkSub, fontSize: '0.875rem' },

  errorBox: {
    background: T.redLight, border: `1px solid ${T.redBorder}`, color: T.red,
    borderRadius: '8px', padding: '0.7rem 1rem', fontSize: '0.85rem',
    marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  errClose: { background: 'none', border: 'none', cursor: 'pointer', color: T.red, padding: 0 },

  toast: {
    padding: '0.7rem 1rem',
    borderRadius: '8px',
    fontSize: '0.85rem',
    marginBottom: '1rem',
    fontWeight: 500,
  },

  ibvNote: {
    display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
    background: T.amberLight, border: `1px solid ${T.amberBorder}`,
    borderRadius: '8px', padding: '0.75rem 1rem',
    fontSize: '0.82rem', color: T.inkSub, lineHeight: 1.5,
    marginBottom: '1rem',
  },

  sectionTitle: { fontSize: '1.1rem', fontWeight: 700, color: T.ink, margin: '0 0 0.4rem' },
  sectionSub:   { fontSize: '0.82rem', color: T.inkSub, lineHeight: 1.65, margin: 0 },

  // Capture tab
  catLabel: {
    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
    color: T.inkLight, paddingBottom: '0.35rem', borderBottom: `1px solid ${T.border}`,
    marginBottom: '0.5rem',
  },
  consentCard: {
    display: 'flex', alignItems: 'flex-start', gap: '1rem',
    padding: '0.9rem 1rem', background: T.bgMuted,
    border: `1px solid ${T.borderLight}`, borderRadius: '10px',
  },
  consentLabel: { fontSize: '0.88rem', fontWeight: 700, color: T.ink },
  consentDesc:  { fontSize: '0.8rem', color: T.inkSub, lineHeight: 1.55, marginTop: '0.2rem' },
  consentMeta:  { fontSize: '0.72rem', color: T.inkLight, marginTop: '0.3rem' },
  reqBadge: {
    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const,
    padding: '0.15rem 0.45rem', borderRadius: '999px',
    background: T.amberLight, color: T.amber, border: `1px solid ${T.amberBorder}`,
  },
  optBadge: {
    fontSize: '0.65rem', fontWeight: 700, padding: '0.18rem 0.5rem', borderRadius: '999px',
  },
  lockBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    fontSize: '0.72rem', fontWeight: 600, color: T.inkSub,
    background: T.bgMuted, border: `1px solid ${T.border}`,
    borderRadius: '6px', padding: '0.3rem 0.6rem',
  },
  toggleBtn: {
    padding: '0.35rem 0.9rem', borderRadius: '6px',
    fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
    border: 'none', fontFamily: 'inherit', transition: 'opacity 0.1s',
  },

  // Engage tab
  strengthCard: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1rem 1.25rem', background: T.bgMuted, borderRadius: '10px',
    border: `1px solid ${T.border}`, marginBottom: '1.25rem',
  },
  strengthLabel: { fontSize: '0.88rem', fontWeight: 700, color: T.ink, marginBottom: '0.15rem' },
  strengthDesc:  { fontSize: '0.78rem', color: T.inkSub },
  strengthBar: { display: 'flex', gap: '6px', alignItems: 'center' },
  strengthDot: {
    width: '24px', height: '8px', borderRadius: '4px', transition: 'background 0.2s',
  },
  factorCard: {
    display: 'flex', alignItems: 'center', gap: '0.85rem',
    padding: '0.9rem 1rem', background: T.bgMuted,
    border: `1px solid ${T.borderLight}`, borderRadius: '10px',
  },
  factorIcon:  { fontSize: '1.4rem', flexShrink: 0, width: '32px', textAlign: 'center' as const },
  factorLabel: { fontSize: '0.88rem', fontWeight: 700, color: T.ink },
  factorDesc:  { fontSize: '0.78rem', color: T.inkSub, marginTop: '0.1rem' },
  factorStatus: {
    fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.5rem',
    borderRadius: '999px',
  },
  deviceTag: {
    fontSize: '0.72rem', padding: '0.15rem 0.5rem',
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '5px', color: T.inkSub,
  },
  enrollBtn: {
    padding: '0.4rem 0.9rem', background: T.amber, color: '#0d1117',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit',
  },
  enrolledCheck: { fontSize: '1.1rem', color: T.green, fontWeight: 700 },

  // Manage tab
  manageSection: {
    background: T.bgMuted, border: `1px solid ${T.border}`,
    borderRadius: '10px', padding: '1.25rem',
    marginBottom: '1rem',
  },
  manageSectionTitle: { fontSize: '0.88rem', fontWeight: 700, color: T.ink, marginBottom: '0.85rem' },
  fieldLabel: { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: T.inkSub, marginBottom: '0.3rem' },
  fieldInput: {
    width: '100%', padding: '0.6rem 0.85rem',
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '7px', color: T.ink, fontSize: '0.9rem',
    fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box' as const,
  },
  fieldReadonly: {
    padding: '0.6rem 0.85rem', background: T.bgCard,
    border: `1px solid ${T.border}`, borderRadius: '7px',
    color: T.inkSub, fontSize: '0.9rem',
  },
  saveBtn: {
    padding: '0.6rem 1.25rem', background: T.amber, color: '#0d1117',
    border: 'none', borderRadius: '7px', cursor: 'pointer',
    fontSize: '0.88rem', fontWeight: 700, fontFamily: 'inherit',
    transition: 'opacity 0.1s',
  },
  outlineBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.5rem 1rem',
    background: 'transparent', border: `1px solid ${T.border}`,
    borderRadius: '7px', cursor: 'pointer', color: T.inkSub,
    fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
  },
  dangerBtn: {
    padding: '0.6rem 1.25rem', background: T.redLight, color: T.red,
    border: `1px solid ${T.redBorder}`, borderRadius: '7px', cursor: 'pointer',
    fontSize: '0.88rem', fontWeight: 700, fontFamily: 'inherit',
  },
  manageFactor: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
    padding: '0.85rem 1rem', background: T.bgCard,
    border: `1px solid ${T.borderLight}`, borderRadius: '9px',
  },
  unenrolBtn: {
    padding: '0.35rem 0.85rem', background: T.redLight, color: T.red,
    border: `1px solid ${T.redBorder}`, borderRadius: '6px', cursor: 'pointer',
    fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit', transition: 'opacity 0.1s',
  },

  // Admin tab
  subTabBar: {
    display: 'flex', gap: '0.25rem', marginBottom: '1.25rem',
    borderBottom: `1px solid ${T.border}`,
  },
  subTab: {
    padding: '0.5rem 1rem',
    background: 'transparent', border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer', color: T.inkSub,
    fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
    transition: 'color 0.12s',
  },
  subTabActive: {
    color: T.ink, borderBottomColor: T.amber,
  },

  createGroupBar: {
    display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center',
  },
  refreshIconBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '34px', height: '34px', background: T.bgCard,
    border: `1px solid ${T.border}`, borderRadius: '7px',
    cursor: 'pointer', color: T.inkSub, flexShrink: 0,
  },

  groupCard: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    background: T.bgMuted, border: `1px solid ${T.borderLight}`,
    borderRadius: '9px', transition: 'border-color 0.1s, background 0.1s',
  },
  groupCardActive: {
    borderColor: T.amber, background: T.amberLight,
  },
  deleteGroupBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: T.inkLight, padding: '0.2rem',
    display: 'flex', alignItems: 'center',
  },

  groupDetail: {
    flex: 1, background: T.bgMuted, border: `1px solid ${T.border}`,
    borderRadius: '10px', padding: '1.25rem',
  },

  auditRow: {
    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
    padding: '0.75rem 0.85rem', background: T.bgMuted,
    borderRadius: '8px', border: `1px solid ${T.borderLight}`,
  },
  auditDot: {
    width: '8px', height: '8px', borderRadius: '50%',
    flexShrink: 0, marginTop: '5px',
  },

  // Engage tab — new styles
  engageStatusBanner: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  engageStatusCell: {
    background: T.bgMuted, border: `1px solid ${T.border}`,
    borderRadius: '10px', padding: '1rem 1.25rem',
    display: 'flex', flexDirection: 'column' as const, gap: '0.35rem',
  },
  engageStatusVal: {
    display: 'flex', alignItems: 'baseline', gap: '0.15rem',
  },
  engageStatusKey: {
    fontSize: '0.72rem', fontWeight: 600, color: T.inkLight,
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  },
  engageProtBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
    fontSize: '0.82rem', fontWeight: 700,
    padding: '0.3rem 0.75rem', borderRadius: '999px',
  },
  engageSectionHead: {
    fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase' as const, color: T.inkLight,
    paddingBottom: '0.4rem', borderBottom: `1px solid ${T.border}`,
    marginBottom: '0.75rem',
  },
  engageActivityRow: {
    display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
    padding: '0.65rem 0.85rem', background: T.bgMuted,
    borderRadius: '8px', border: `1px solid ${T.borderLight}`,
  },

  // Admin modals
  adminOverlay: {
    position: 'fixed' as const, inset: 0,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: '1rem',
  },
  adminModal: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '14px', padding: '1.5rem',
    width: '100%', maxWidth: '480px',
    boxShadow: T.shadowPop,
  },
  adminModalHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: '1.25rem',
  },
  adminModalTitle: { fontSize: '1.05rem', fontWeight: 700, color: T.ink },
  adminModalSub:   { fontSize: '0.78rem', color: T.inkSub, marginTop: '0.2rem' },
  adminCloseBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: T.inkSub, padding: '0.2rem',
    display: 'flex', alignItems: 'center',
  },
  adminPwdBox: {
    fontFamily: 'monospace', fontSize: '1.05rem', fontWeight: 700,
    padding: '0.85rem 1rem', background: T.bgMuted,
    border: `1px solid ${T.border}`, borderRadius: '8px',
    color: T.amber, letterSpacing: '0.04em',
    marginBottom: '0.25rem', wordBreak: 'break-all' as const,
  },
}

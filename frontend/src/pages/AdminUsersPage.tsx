import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { T } from '../styles/theme'

// ─── Inline 2FA types (mirrors LoanApprovalPage pattern) ─────────────────────
type Mfa2Phase = 'idle' | 'pick_method' | 'beginning' | 'otp_input' | 'push_polling' | 'verifying' | 'done' | 'error'
interface StepUpBeginResult { method: string; transaction_id: string | null; message: string; otp_hint?: string }
interface StepUpCompleteResult { token: string; user: { name: string; email: string; role: string }; stepup_verified: boolean }
interface MfaMethodMeta { method: string; label: string; icon: string; description: string }

// ─── Types ────────────────────────────────────────────────────────────────────
interface ManagedUser {
  id: string
  email: string
  name: string
  role: string
  is_active: boolean
  created_at: string
  offboarded_at: string | null
  last_login: string | null
  mfa_enrolled: boolean | null
  last_mfa_type: string | null
}

interface AuditEntry {
  action: string
  actor_name: string
  details: string
  created_at: string
}

type FormMode = { kind: 'create' } | { kind: 'edit'; user: ManagedUser } | null
type TempPasswordModal = { name: string; email: string; password: string } | null

// Roles that grant Salesforce entitlement in the launchpad
const SALESFORCE_ROLES = new Set(['SalesforceManager'])

const ROLE_DISPLAY: Record<string, string> = {
  Manager:          'Credit Analyst',
  SalesforceManager:'Salesforce Admin',
  Admin:            'Administrator',
}

const ACTION_LABEL: Record<string, string> = {
  joiner:           'Joiner',
  mover:            'Mover',
  leaver_disable:   'Suspended',
  leaver_reinstate: 'Reinstated',
  leaver_delete:    'Deleted',
}

const ACTION_COLOR: Record<string, string> = {
  joiner:           '#10b981',
  mover:            '#3b82f6',
  leaver_disable:   '#f59e0b',
  leaver_reinstate: '#8b5cf6',
  leaver_delete:    '#ef4444',
}

// ─── Consistent avatar colour ────────────────────────────────────────────────
// Avatar colour matches the legend: role when active, red when suspended
function avatarColor(role: string, isActive: boolean) {
  if (!isActive) return '#ef4444'
  if (role === 'Admin')             return '#a78bfa'
  if (role === 'SalesforceManager') return '#10b981'
  return '#3b82f6'  // Manager
}
function initials(name: string) {
  const parts = name.trim().split(' ')
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

// ─── Deterministic "department" from name (mock) ─────────────────────────────
const DEPARTMENTS = [
  'Retail Banking','Corporate','Risk & Compliance','Engineering',
  'Treasury','Wealth','Operations','Fraud','Technology','Finance',
]
function mockDept(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 17 + name.charCodeAt(i)) >>> 0
  return DEPARTMENTS[h % DEPARTMENTS.length]
}

// ─── Real last-login formatter ────────────────────────────────────────────────
function formatLastLogin(iso: string | null): string {
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

const MFA_LABEL: Record<string, string> = {
  fido2:    'Passkey',
  totp:     'TOTP',
  push:     'Push',
  emailotp: 'Email OTP',
  password: 'Password',
}
// ─── SVG icons ────────────────────────────────────────────────────────────────
function SearchIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
}
function RefreshIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
}
function DotsIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
}
function XIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}

// ─── Role badge ───────────────────────────────────────────────────────────────
const ROLE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Manager:          { bg: T.blueLight,             color: T.blue,    border: T.blue + '44'           },
  SalesforceManager:{ bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'rgba(16,185,129,0.30)' },
  Admin:            { bg: T.amberLight,            color: T.amber,   border: T.amberBorder           },
}
function RoleBadge({ role }: { role: string }) {
  const st = ROLE_STYLE[role] ?? ROLE_STYLE.Manager
  const isSF = SALESFORCE_ROLES.has(role)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      fontSize: '0.72rem', fontWeight: 700, padding: '0.18rem 0.55rem',
      borderRadius: '999px', border: `1px solid ${st.border}`,
      background: st.bg, color: st.color,
    }}>
      {isSF && <span style={{ fontSize: '0.6rem', opacity: 0.85 }}>☁</span>}
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: st.color, flexShrink: 0 }} />
      {ROLE_DISPLAY[role] ?? role}
    </span>
  )
}

// ─── Per-row action dropdown ──────────────────────────────────────────────────
function ActionMenu({
  user,
  onEdit, onHistory, onResetPwd, onResetMFA, onDisable, onReinstate, onDelete,
}: {
  user: ManagedUser
  onEdit: () => void; onHistory: () => void; onResetPwd: () => void
  onResetMFA: () => void
  onDisable: () => void; onReinstate: () => void; onDelete: () => void
}) {
  const [open, setOpen]       = useState(false)
  const [flipUp, setFlipUp]   = useState(false)
  const ref    = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const toggle = () => {
    if (!open && btnRef.current) {
      // Approximate menu height: 7 items × ~34px + padding ≈ 260px
      const MENU_H = 260
      const rect = btnRef.current.getBoundingClientRect()
      setFlipUp(rect.bottom + MENU_H > window.innerHeight)
    }
    setOpen(v => !v)
  }

  const item = (label: string, color: string, onClick: () => void) => (
    <button
      key={label}
      style={{ ...m.menuItem, color }}
      onClick={() => { setOpen(false); onClick() }}
    >
      {label}
    </button>
  )

  const menuPos: React.CSSProperties = flipUp
    ? { bottom: 'calc(100% + 4px)', top: 'auto' }
    : { top: 'calc(100% + 4px)',    bottom: 'auto' }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        ref={btnRef}
        style={m.dotsBtn}
        onClick={toggle}
        title="Actions"
      >
        <DotsIcon />
      </button>
      {open && (
        <div style={{ ...m.menu, ...menuPos }}>
          {item('Edit / Mover',    T.ink,   onEdit)}
          {item('View history',    T.ink,   onHistory)}
          {item('Reset password',  T.ink,   onResetPwd)}
          {item('Reset MFA',       T.amber, onResetMFA)}
          <div style={m.menuDivider} />
          {user.is_active
            ? item('Suspend (Leaver)', T.orange, onDisable)
            : item('Reinstate',        T.green,  onReinstate)
          }
          {item('Delete (Hard Leaver)', T.red, onDelete)}
        </div>
      )}
    </div>
  )
}

const m: Record<string, React.CSSProperties> = {
  dotsBtn: {
    width: '30px', height: '30px', borderRadius: '6px',
    border: `1px solid ${T.border}`, background: T.bgCard,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: T.inkSub,
  },
  menu: {
    position: 'absolute', right: 0, top: 'calc(100% + 4px)',
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '10px', boxShadow: T.shadowPop,
    zIndex: 100, minWidth: '160px', padding: '0.35rem',
    display: 'flex', flexDirection: 'column', gap: '1px',
  },
  menuItem: {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '0.5rem 0.75rem', background: 'transparent',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '0.82rem', fontWeight: 500,
  },
  menuDivider: { height: '1px', background: T.borderLight, margin: '0.2rem 0' },
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [users,        setUsers]        = useState<ManagedUser[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [info,         setInfo]         = useState<string | null>(null)
  const [search,       setSearch]       = useState('')
  const [roleFilter,   setRoleFilter]   = useState<string>('All')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [form,         setForm]         = useState<FormMode>(null)
  const [auditFor,     setAuditFor]     = useState<ManagedUser | null>(null)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [tempPwdModal, setTempPwdModal] = useState<TempPasswordModal>(null)

  const load = () => {
    setLoading(true)
    api.get<{ users: ManagedUser[]; total: number }>('/users')
      .then(r => setUsers(r.data.users))
      .catch(() => setError('Failed to load directory.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  // ── Derived stats ────────────────────────────────────────────────────────
  const total      = users.length
  const active     = users.filter(u => u.is_active).length
  const suspended  = users.filter(u => !u.is_active).length
  const admins     = users.filter(u => u.role === 'Admin').length
  const managers   = users.filter(u => u.role === 'Manager').length
  const sfManagers = users.filter(u => u.role === 'SalesforceManager').length
  const now        = Date.now()
  const joined7d   = users.filter(u => {
    try { return now - new Date(u.created_at).getTime() < 7 * 86_400_000 } catch { return false }
  }).length

  // Each stat can declare a filter it drives. Clicking it toggles that filter on/off.
  const STATS = [
    { label: 'Total Users',       value: total,      color: T.ink,     filter: { kind: 'reset'  as const, value: 'All'              } },
    { label: 'Active',            value: active,     color: T.green,   filter: { kind: 'status' as const, value: 'Active'           } },
    { label: 'Suspended',         value: suspended,  color: T.red,     filter: { kind: 'status' as const, value: 'Suspended'        } },
    { label: 'Administrators',    value: admins,     color: '#a78bfa', filter: { kind: 'role'   as const, value: 'Admin'            } },
    { label: 'Managers',          value: managers,   color: T.blue,    filter: { kind: 'role'   as const, value: 'Manager'          } },
    { label: '☁ SF Managers',     value: sfManagers, color: '#10b981', filter: { kind: 'role'   as const, value: 'SalesforceManager'} },
    { label: 'Joined (7d)',       value: joined7d,   color: '#0ea5e9', filter: null },
  ]

  const handleLegendClick = (stat: typeof STATS[number]) => {
    if (!stat.filter) return
    if (stat.filter.kind === 'reset') {
      setStatusFilter('All'); setRoleFilter('All')
    } else if (stat.filter.kind === 'status') {
      setStatusFilter(prev => prev === stat.filter!.value ? 'All' : stat.filter!.value)
      setRoleFilter('All')
    } else {
      setRoleFilter(prev => prev === stat.filter!.value ? 'All' : stat.filter!.value)
      setStatusFilter('All')
    }
  }

  const isLegendActive = (stat: typeof STATS[number]) => {
    if (!stat.filter) return false
    if (stat.filter.kind === 'reset') return statusFilter === 'All' && roleFilter === 'All'
    return stat.filter.kind === 'status'
      ? statusFilter === stat.filter.value
      : roleFilter   === stat.filter.value
  }

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      mockDept(u.name).toLowerCase().includes(q)
    const matchRole   = roleFilter   === 'All' || u.role === roleFilter
    const matchStatus = statusFilter === 'All' ||
      (statusFilter === 'Active'    &&  u.is_active) ||
      (statusFilter === 'Suspended' && !u.is_active)
    return matchSearch && matchRole && matchStatus
  })

  // ── Row actions ──────────────────────────────────────────────────────────
  const openAudit = async (u: ManagedUser) => {
    setAuditFor(u)
    try {
      const { data } = await api.get<AuditEntry[]>(`/users/${u.id}/audit`)
      setAuditEntries(data)
    } catch { setAuditEntries([]) }
  }
  const handleResetPassword = async (u: ManagedUser) => {
    if (!confirm(`Reset password for ${u.name}?`)) return
    try {
      const { data } = await api.post<{ temporary_password: string }>(`/users/${u.id}/reset-password`)
      setTempPwdModal({ name: u.name, email: u.email, password: data.temporary_password })
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to reset password.')
    }
  }
  const handleDisable = async (u: ManagedUser) => {
    if (!confirm(`Suspend access for ${u.name}?`)) return
    setInfo(null)
    try {
      await api.post(`/users/${u.id}/disable`)
      load()
      if (u.role === 'SalesforceManager') {
        setInfo(`${u.name} suspended. IBM Verify group membership removed — Salesforce account will be suspended via provisioning.`)
      }
    } catch { setError('Failed to suspend user.') }
  }
  const handleReinstate = async (u: ManagedUser) => {
    setInfo(null)
    try {
      await api.post(`/users/${u.id}/reinstate`)
      load()
      if (u.role === 'SalesforceManager') {
        setInfo(`${u.name} reinstated. IBM Verify group membership restored — Salesforce account will be re-activated via provisioning.`)
      }
    } catch { setError('Failed to reinstate user.') }
  }
  const handleResetMFA = async (u: ManagedUser) => {
    if (!confirm(`Reset all MFA factors for ${u.name}? They will be forced to re-enrol on next login.`)) return
    try { await api.delete(`/users/${u.id}/factors`); load() } catch { setError('Failed to reset MFA.') }
  }
  const handleDelete = async (u: ManagedUser) => {
    if (!confirm(`Permanently delete ${u.name}? This removes them from IBM Verify and cannot be undone.`)) return
    try { await api.delete(`/users/${u.id}`); load() } catch { setError('Failed to delete user.') }
  }

  // ── Select all ───────────────────────────────────────────────────────────
  if (me?.role !== 'Admin') {
    return <div style={{ padding: '3rem', textAlign: 'center', color: T.inkSub }}>Admin role required.</div>
  }

  return (
    <div style={s.root}>
      {/* ── Page header ── */}
      <div style={s.pageHead}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <h1 style={s.pageTitle}>Workforce Identity Management</h1>
            <span style={s.hrBadge}>IBM Verify · Source of Truth</span>
          </div>
          <p style={s.pageSub}>
            Onboard and manage workforce identities — Managers, Salesforce Admins, and Administrators.
            IBM Verify is the authoritative identity source. All provisioning flows through this portal.
          </p>
        </div>
        <div style={s.headActions}>
          <button style={s.outlineBtn} onClick={load} title="Refresh"><RefreshIcon /> Refresh</button>
          <button style={s.primaryBtn} onClick={() => setForm({ kind: 'create' })}>
            + Onboard User
          </button>
        </div>
      </div>

      {/* ── Stats legend strip ── */}
      <div style={s.statsRow}>
        <div style={s.statsLegend}>
          {STATS.map((stat, i) => {
            const active = isLegendActive(stat)
            const clickable = !!stat.filter
            return (
              <React.Fragment key={stat.label}>
                {i > 0 && <span style={s.legendDivider} />}
                <div
                  style={{
                    ...s.legendItem,
                    cursor: clickable ? 'pointer' : 'default',
                    borderRadius: '6px',
                    background: active ? stat.color + '18' : 'transparent',
                    border: active ? `1px solid ${stat.color}55` : '1px solid transparent',
                    transition: 'background 0.15s, border 0.15s',
                  }}
                  onClick={() => handleLegendClick(stat)}
                  title={clickable ? `Filter by ${stat.label}` : undefined}
                >
                  <span style={{ ...s.legendDot, background: stat.color }} />
                  <span style={{ ...s.legendLabel, color: active ? stat.color : undefined }}>{stat.label}</span>
                  <span style={{ ...s.legendValue, color: stat.color }}>{stat.value}</span>
                </div>
              </React.Fragment>
            )
          })}
          {/* Clear active filter hint */}
          {(statusFilter !== 'All' || roleFilter !== 'All') && (
            <>
              <span style={s.legendDivider} />
              <div
                style={{ ...s.legendItem, cursor: 'pointer', borderRadius: '6px' }}
                onClick={() => { setStatusFilter('All'); setRoleFilter('All') }}
                title="Clear filter"
              >
                <XIcon />
                <span style={{ ...s.legendLabel, color: T.inkSub }}>Clear</span>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div style={s.errorBox}>
          <span>⚠ {error}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.red }} onClick={() => setError(null)}><XIcon /></button>
        </div>
      )}

      {info && (
        <div style={s.infoBox}>
          <span>ℹ {info}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.blue }} onClick={() => setInfo(null)}><XIcon /></button>
        </div>
      )}

      {/* ── Search + filter bar ── */}
      <div style={s.toolbar}>
        <div style={s.searchWrap}>
          <span style={s.searchIcon}><SearchIcon /></span>
          <input
            style={s.searchInput}
            placeholder="Search name, email, department…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={s.filters}>
          {/* Status filter */}
          <select
            style={s.filterSelect}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            {['All', 'Active', 'Suspended'].map(v => (
              <option key={v}>Status: {v}</option>
            ))}
          </select>
          {/* Role filter */}
          <select
            style={s.filterSelect}
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            {['All', 'Manager', 'SalesforceManager', 'Admin'].map(v => (
              <option key={v} value={v}>Role: {v === 'All' ? 'All' : (ROLE_DISPLAY[v] ?? v)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={s.tableWrap}>
        {loading ? (
          <div style={s.loadingRow}>Loading directory…</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>User</th>
                <th style={s.th}>Role</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>MFA</th>
                <th style={s.th}>Last Login</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...s.td, textAlign: 'center', color: T.inkSub, padding: '3rem' }}>
                    No users match your search.
                  </td>
                </tr>
              )}
              {filtered.map((u, idx) => {
                const bg  = avatarColor(u.role, u.is_active)
                const ini = initials(u.name)
                const mfaLabel = u.last_mfa_type ? (MFA_LABEL[u.last_mfa_type] ?? u.last_mfa_type) : null
                return (
                  <tr
                    key={u.id}
                    style={{ ...s.tr, background: idx % 2 === 0 ? T.bgCard : T.bgMuted }}
                  >
                    {/* User */}
                    <td style={s.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                        <div style={{ ...s.avatar, background: bg }}>
                          {ini}
                        </div>
                        <div>
                          <div style={s.userName}>{u.name}</div>
                          <div style={s.userEmail}>{u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td style={s.td}><RoleBadge role={u.role} /></td>

                    {/* Status */}
                    <td style={s.td}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        fontSize: '0.72rem', fontWeight: 700,
                        padding: '0.18rem 0.55rem', borderRadius: '999px',
                        background: u.is_active ? T.greenLight : T.redLight,
                        color:      u.is_active ? T.green : T.red,
                        border:     `1px solid ${u.is_active ? T.greenBorder : T.redBorder}`,
                      }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: u.is_active ? T.green : T.red }} />
                        {u.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>

                    {/* MFA status (real from IBM Verify SCIM) */}
                    <td style={s.td}>
                      {u.mfa_enrolled === null ? (
                        <span style={{ fontSize: '0.78rem', color: T.inkSub }}>—</span>
                      ) : u.mfa_enrolled ? (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '0.18rem 0.5rem',
                          borderRadius: '999px', background: T.greenLight, color: T.green,
                          border: `1px solid ${T.greenBorder}`,
                        }}>
                          {mfaLabel ?? '✓ Enrolled'}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '0.18rem 0.5rem',
                          borderRadius: '999px', background: T.amberLight, color: T.amber,
                          border: `1px solid ${T.amberBorder}`,
                        }}>
                          No MFA
                        </span>
                      )}
                    </td>

                    {/* Last login (real from IBM Verify SCIM) */}
                    <td style={{ ...s.td, color: T.inkSub, fontSize: '0.82rem' }}>
                      {formatLastLogin(u.last_login)}
                    </td>

                    {/* Actions */}
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <ActionMenu
                        user={u}
                        onEdit={()       => setForm({ kind: 'edit', user: u })}
                        onHistory={()    => openAudit(u)}
                        onResetPwd={()   => handleResetPassword(u)}
                        onResetMFA={()   => handleResetMFA(u)}
                        onDisable={()    => handleDisable(u)}
                        onReinstate={()  => handleReinstate(u)}
                        onDelete={()     => handleDelete(u)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {/* Table footer */}
        {!loading && (
          <div style={s.tableFooter}>
            <span style={{ color: T.inkSub, fontSize: '0.8rem' }}>
              Showing {filtered.length} of {total} users
            </span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button style={s.pageBtn} disabled>‹ Prev</button>
              <button style={{ ...s.pageBtn, ...s.pageBtnActive }}>1</button>
              <button style={s.pageBtn}>Next ›</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Joiner / Edit modal ── */}
      {form && (
        <UserFormModal
          mode={form}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load() }}
        />
      )}

      {/* ── Temp password modal ── */}
      {tempPwdModal && (
        <div style={s.overlay} onClick={() => setTempPwdModal(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHead}>
              <div>
                <div style={s.modalTitle}>Password Reset</div>
                <div style={s.modalSub}>{tempPwdModal.name} · {tempPwdModal.email}</div>
              </div>
              <button style={s.closeBtn} onClick={() => setTempPwdModal(null)}><XIcon /></button>
            </div>
            <p style={{ fontSize: '0.85rem', color: T.inkSub, margin: '0 0 1rem' }}>
              Share this temporary password securely. The user must change it on next login.
            </p>
            <div style={s.pwdBox}>{tempPwdModal.password}</div>
            <p style={{ fontSize: '0.78rem', color: T.amber, margin: '0 0 1.25rem', display: 'flex', gap: '0.35rem' }}>
              ⚠ This password will not be shown again. Copy it now.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button style={s.primaryBtn} onClick={() => navigator.clipboard.writeText(tempPwdModal.password)}>
                Copy to clipboard
              </button>
              <button style={s.outlineBtn} onClick={() => setTempPwdModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Audit / history modal ── */}
      {auditFor && (
        <div style={s.overlay} onClick={() => setAuditFor(null)}>
          <div style={{ ...s.modal, maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div style={s.modalHead}>
              <div>
                <div style={s.modalTitle}>Identity History</div>
                <div style={s.modalSub}>{auditFor.name} · {auditFor.email}</div>
              </div>
              <button style={s.closeBtn} onClick={() => setAuditFor(null)}><XIcon /></button>
            </div>
            {auditEntries.length === 0 ? (
              <p style={{ color: T.inkSub, fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
                No lifecycle events recorded yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '400px', overflowY: 'auto' }}>
                {auditEntries.map((e, i) => {
                  const color = ACTION_COLOR[e.action] ?? T.inkSub
                  return (
                    <div key={i} style={s.auditRow}>
                      <div style={{ ...s.auditDot, background: color }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color }}>
                            {ACTION_LABEL[e.action] ?? e.action}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: T.inkSub }}>
                            by {e.actor_name}
                          </span>
                        </div>
                        {e.details && <div style={{ fontSize: '0.78rem', color: T.inkSub, marginTop: '0.15rem' }}>{e.details}</div>}
                        <div style={{ fontSize: '0.72rem', color: T.inkLight, marginTop: '0.15rem' }}>
                          {new Date(e.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ marginTop: '1.25rem' }}>
              <button style={s.outlineBtn} onClick={() => setAuditFor(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Joiner / Edit modal ──────────────────────────────────────────────────────
function UserFormModal({
  mode, onClose, onSaved,
}: { mode: Exclude<FormMode, null>; onClose: () => void; onSaved: () => void }) {
  const { login } = useAuth()
  const isEdit   = mode.kind === 'edit'
  const existing = isEdit ? mode.user : null

  // Joiner-only identity fields
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [username,  setUsername]  = useState('')

  // Shared fields
  const [email,    setEmail]    = useState(existing?.email ?? '')
  const [role,     setRole]     = useState(existing?.role  ?? 'Manager')
  const [isActive, setIsActive] = useState(existing?.is_active ?? true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Derived full name from first + last (Joiner only)
  const derivedName = isEdit
    ? (existing?.name ?? '')
    : [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')

  // ── Inline 2FA state (for Mover role-change) ──────────────────────────────
  const [mfa2Phase,    setMfa2Phase]   = useState<Mfa2Phase>('idle')
  const [mfa2Methods,  setMfa2Methods] = useState<MfaMethodMeta[]>([])
  const [mfa2Method,   setMfa2Method]  = useState('')
  const [mfa2TxId,     setMfa2TxId]    = useState<string | null>(null)
  const [mfa2Msg,      setMfa2Msg]     = useState('')
  const [mfa2Otp,      setMfa2Otp]     = useState('')
  const [mfa2OtpHint,  setMfa2OtpHint] = useState('')
  const [mfa2Err,      setMfa2Err]     = useState('')
  const pendingPayload = useRef<{ email: string; name: string; role: string; is_active: boolean; id: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const isRoleChange = isEdit && existing !== null && existing.role !== role

  // ── Load available MFA methods and show picker ────────────────────────────
  const begin2FA = async () => {
    setMfa2Phase('beginning'); setMfa2Err('')
    try {
      const { data } = await api.get<{ methods: MfaMethodMeta[] }>('/auth/stepup/methods')
      setMfa2Methods(data.methods ?? [])
      setMfa2Phase('pick_method')
    } catch {
      setMfa2Err('Could not load verification methods. Please try again.')
      setMfa2Phase('error')
    }
  }

  // ── Begin the chosen method's challenge ───────────────────────────────────
  const selectMethod2FA = async (methodKey: string) => {
    setMfa2Method(methodKey)
    setMfa2Phase('beginning'); setMfa2Err('')
    if (pollRef.current) clearInterval(pollRef.current)
    try {
      const { data } = await api.post<StepUpBeginResult>('/auth/stepup/begin', {
        return_to: '/admin/users',
        preferred_method: methodKey,
      })
      setMfa2TxId(data.transaction_id)
      setMfa2Msg(data.message)
      setMfa2OtpHint(data.otp_hint ?? '')
      if (data.method === 'push') {
        setMfa2Phase('push_polling')
        pollRef.current = setInterval(async () => {
          try {
            const { data: poll } = await api.get<{ status: string }>(`/auth/stepup/poll/${data.transaction_id}`)
            if (poll.status === 'approved') {
              clearInterval(pollRef.current!)
              await complete2FA('push', data.transaction_id, undefined)
            } else if (poll.status === 'denied') {
              clearInterval(pollRef.current!)
              setMfa2Err('Push request was denied on your device.')
              setMfa2Phase('error')
            }
          } catch { /* keep polling */ }
        }, 2500)
      } else {
        setMfa2Phase('otp_input')
      }
    } catch {
      setMfa2Err('Could not start verification. Please try another method.')
      setMfa2Phase('pick_method')
    }
  }

  // ── Verify code and save ──────────────────────────────────────────────────
  const complete2FA = async (m: string, tid: string | null, otpCode: string | undefined) => {
    setMfa2Phase('verifying')
    try {
      const body: Record<string, string | null> = { method: m, transaction_id: tid ?? null }
      if (otpCode) body.otp_code = otpCode
      const { data: su } = await api.post<StepUpCompleteResult>('/auth/stepup/complete', body)
      if (pendingPayload.current) {
        const pl = pendingPayload.current
        await api.put(`/users/${pl.id}`,
          { email: pl.email, name: pl.name, role: pl.role, is_active: pl.is_active },
          { headers: { Authorization: `Bearer ${su.token}` } },
        )
        login(su.token, su.user, true)
      }
      setMfa2Phase('done')
      setTimeout(() => onSaved(), 600)
    } catch {
      setMfa2Err('MFA verification failed. Please try again.')
      setMfa2Phase('error')
    }
  }

  const handleSave = async () => {
    if (!email.trim()) { setError('Email address is required'); return }
    if (!isEdit && (!firstName.trim() || !lastName.trim())) { setError('First name and last name are required'); return }
    if (!isEdit && !username.trim()) { setError('Preferred username is required'); return }
    if (!isEdit && !derivedName) { setError('First name and last name are required'); return }
    setSaving(true); setError(null)
    try {
      if (isEdit && existing) {
        // If role is changing, store payload and kick off 2FA first
        if (isRoleChange) {
          pendingPayload.current = { email, name: derivedName, role, is_active: isActive, id: existing.id }
          setSaving(false)
          await begin2FA()
          return
        }
        await api.put(`/users/${existing.id}`, { email, name: derivedName, role, is_active: isActive })
      } else {
        await api.post('/users', {
          email,
          name: derivedName,
          role,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          username: username.trim(),
        })
      }
      onSaved()
    } catch (e: unknown) {
      const rawDetail = (e as { response?: { data?: { detail?: string | { code?: string; message?: string } } } })?.response?.data?.detail
      const msg = typeof rawDetail === 'object' ? (rawDetail as { message?: string })?.message : rawDetail
      setError(msg ?? 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const METHOD_LABEL: Record<string, string> = { push: 'Push Notification', totp: 'Authenticator App', email_otp: 'Email OTP', fido2: 'Passkey' }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHead}>
          <div>
            <div style={s.modalTitle}>{isEdit ? 'Edit User (Mover)' : 'Onboard New User (Joiner)'}</div>
            <div style={s.modalSub}>{isEdit ? `Updating ${existing?.name}` : 'Create a new identity'}</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}><XIcon /></button>
        </div>

        {/* 2FA inline panel — shown when a role change triggers step-up */}
        {mfa2Phase !== 'idle' && (
          <div style={{ margin: '0 1.5rem 0.5rem', background: T.amberLight, border: `1px solid ${T.amberBorder}`, borderRadius: '10px', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <span style={{ color: T.amber, fontWeight: 700, fontSize: '0.82rem' }}>🔒 IBM Verify 2FA Required — Role Change (Mover)</span>
            </div>
            {mfa2Phase === 'beginning' && (
              <div style={{ fontSize: '0.78rem', color: T.inkSub }}>Starting MFA challenge…</div>
            )}
            {mfa2Phase === 'pick_method' && (
              <div>
                <div style={{ fontSize: '0.78rem', color: T.inkSub, marginBottom: '0.6rem' }}>
                  Choose how you want to verify this role change:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {mfa2Methods.map(m => (
                    <button
                      key={m.method}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                        padding: '0.55rem 0.75rem',
                        background: T.bgInput, border: `1.5px solid ${T.border}`,
                        borderRadius: '8px', cursor: 'pointer',
                        textAlign: 'left', color: T.ink,
                        fontSize: '0.82rem', fontFamily: 'inherit', fontWeight: 600,
                        transition: 'border-color 0.15s',
                      }}
                      onClick={() => selectMethod2FA(m.method)}
                    >
                      <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{m.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700 }}>{m.label}</div>
                        <div style={{ fontSize: '0.72rem', color: T.inkSub, fontWeight: 400 }}>{m.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: T.inkSub, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => setMfa2Phase('idle')}
                >
                  ← Cancel
                </button>
              </div>
            )}
            {mfa2Phase === 'push_polling' && (
              <div>
                <div style={{ fontSize: '0.78rem', color: T.inkSub, marginBottom: '0.4rem' }}>
                  📱 Approve the push notification on your device…
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: T.inkLight }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: T.amber, animation: 'pulse 1.2s infinite' }} />
                  Waiting for approval…
                </div>
                <button
                  style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: T.inkSub, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setMfa2Phase('pick_method') }}
                >
                  ← Use a different method
                </button>
              </div>
            )}
            {mfa2Phase === 'otp_input' && (
              <div>
                <div style={{ fontSize: '0.78rem', color: T.inkSub, marginBottom: '0.5rem' }}>{METHOD_LABEL[mfa2Method] ?? mfa2Method} — {mfa2Msg}</div>
                {mfa2OtpHint && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    marginBottom: '0.5rem',
                    padding: '0.25rem 0.55rem',
                    background: T.amberLight, border: `1px solid ${T.amberBorder}`,
                    borderRadius: '5px', fontSize: '0.73rem', color: T.amber,
                  }}>
                    <span style={{ fontWeight: 700 }}>Starts with:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, letterSpacing: '0.06em' }}>{mfa2OtpHint}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    style={{ flex: 1, padding: '0.5rem 0.7rem', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '7px', color: T.ink, fontSize: '1rem', fontFamily: 'monospace', letterSpacing: '0.05em' }}
                    value={mfa2Otp} onChange={e => setMfa2Otp(e.target.value.replace(/\s/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && complete2FA(mfa2Method, mfa2TxId, mfa2Otp.trim())}
                    placeholder="Enter code" autoFocus maxLength={16} inputMode="numeric"
                  />
                  <button style={{ padding: '0.5rem 1rem', background: T.amber, color: '#0d1117', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit' }}
                    onClick={() => complete2FA(mfa2Method, mfa2TxId, mfa2Otp.trim())} disabled={!mfa2Otp.trim()}>
                    Verify
                  </button>
                </div>
                <button
                  style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: T.inkSub, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => { setMfa2Otp(''); setMfa2OtpHint(''); setMfa2Phase('pick_method') }}
                >
                  ← Use a different method
                </button>
              </div>
            )}
            {mfa2Phase === 'verifying' && <div style={{ fontSize: '0.78rem', color: T.inkSub }}>Verifying with IBM Verify…</div>}
            {mfa2Phase === 'done' && <div style={{ fontSize: '0.78rem', color: T.green }}>✓ MFA verified. Saving…</div>}
            {mfa2Phase === 'error' && (
              <div>
                <div style={{ fontSize: '0.78rem', color: T.red, marginBottom: '0.4rem' }}>{mfa2Err}</div>
                <button style={{ fontSize: '0.78rem', color: T.amber, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => { setMfa2OtpHint(''); setMfa2Otp(''); setMfa2Err(''); setMfa2Phase('pick_method') }}>Try again</button>
              </div>
            )}
          </div>
        )}

        <div style={s.formGrid}>
          {/* ── Joiner-only identity fields ── */}
          {!isEdit && (
            <>
              <div style={{ ...s.fieldWrap, gridColumn: '1 / -1' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={s.label}>First Name <span style={{ color: T.red }}>*</span></label>
                    <input style={s.input} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" autoFocus />
                  </div>
                  <div>
                    <label style={s.label}>Last Name <span style={{ color: T.red }}>*</span></label>
                    <input style={s.input} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" />
                  </div>
                </div>
              </div>
              <div style={s.fieldWrap}>
                <label style={s.label}>Preferred Username <span style={{ color: T.red }}>*</span></label>
                <input
                  style={s.input}
                  value={username}
                  onChange={e => setUsername(e.target.value.trim())}
                  placeholder="jsmith"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <div style={{ fontSize: '0.72rem', color: T.inkSub, marginTop: '0.3rem' }}>
                  Used as the IBM Verify login username — entered exactly as typed, no domain added.
                </div>
              </div>
              {derivedName && (
                <div style={{ ...s.fieldWrap, gridColumn: '1 / -1' }}>
                  <label style={s.label}>Full Name (derived)</label>
                  <div style={{ ...s.input, background: T.bgMuted, color: T.inkSub, cursor: 'default', userSelect: 'none' as const }}>
                    {derivedName}
                  </div>
                </div>
              )}
            </>
          )}
          {/* ── Edit mode: show current full name (read-only, can't rename via IBM Verify) ── */}
          {isEdit && (
            <div style={s.fieldWrap}>
              <label style={s.label}>Full Name</label>
              <input style={{ ...s.input, background: T.bgMuted, color: T.inkSub, cursor: 'default' }} value={existing?.name ?? ''} readOnly />
            </div>
          )}
          <div style={s.fieldWrap}>
            <label style={s.label}>Email Address <span style={{ color: T.red }}>*</span></label>
            <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@mockbank.com" />
          </div>
          <div style={s.fieldWrap}>
            <label style={s.label}>Role</label>
            <select style={s.input} value={role} onChange={e => setRole(e.target.value)}>
              <option value="Manager">Credit Analyst — loan approval &amp; financial access</option>
              <option value="SalesforceManager">Salesforce Admin — Salesforce access via SSO</option>
              <option value="Admin">Administrator — full workforce admin access</option>
            </select>
            {SALESFORCE_ROLES.has(role) && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#10b981', display: 'flex', gap: '0.35rem', alignItems: 'flex-start' }}>
                <span>☁</span>
                <span>This role entitles the user to Salesforce access via IBM Verify SAML SSO. Salesforce account is auto-provisioned on first login (JIT).</span>
              </div>
            )}
            {isRoleChange && mfa2Phase === 'idle' && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: T.amber, display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                🔒 <span>Role change requires IBM Verify 2FA (Mover policy)</span>
              </div>
            )}
          </div>
          {isEdit && (
            <div style={s.fieldWrap}>
              <label style={s.label}>Account Status</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[true, false].map(v => (
                  <button
                    key={String(v)}
                    style={{
                      flex: 1, padding: '0.5rem', border: `1.5px solid ${isActive === v ? (v ? T.greenBorder : T.redBorder) : T.border}`,
                      borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
                      background: isActive === v ? (v ? T.greenLight : T.redLight) : T.bgInput,
                      color: isActive === v ? (v ? T.green : T.red) : T.inkSub,
                    }}
                    onClick={() => setIsActive(v)}
                  >
                    {v ? 'Active' : 'Suspended'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <div style={s.errorBox}><span>⚠ {error}</span></div>}

        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem' }}>
          <button style={s.primaryBtn} onClick={handleSave}
            disabled={saving || ['beginning','push_polling','verifying','done'].includes(mfa2Phase)}>
            {saving ? 'Saving…' :
             isRoleChange && mfa2Phase === 'idle' ? '🔒 Save + Verify 2FA' :
             isEdit ? 'Save Changes' : 'Create User'}
          </button>
          <button style={s.outlineBtn} onClick={onClose}>Cancel</button>
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
  headActions:{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },

  // Stats legend strip
  statsRow:      { marginBottom: '1.5rem' },
  statsLegend:   {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const,
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: T.radiusInner, padding: '0.7rem 1.25rem',
    boxShadow: T.shadowCard, gap: '0',
  },
  legendItem:    { display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.3rem 0.85rem' },

  // HR Portal badge
  hrBadge: {
    display: 'inline-flex', alignItems: 'center',
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    padding: '0.2rem 0.6rem', borderRadius: '999px',
    background: 'rgba(6,182,212,0.12)', color: '#06b6d4',
    border: '1px solid rgba(6,182,212,0.35)',
  },
  legendDot:     { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  legendLabel:   { fontSize: '0.72rem', fontWeight: 600, color: T.inkSub, textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  legendValue:   { fontSize: '1rem', fontWeight: 700, lineHeight: 1 },
  legendDivider: { width: '1px', height: '28px', background: T.border, flexShrink: 0 },

  // Toolbar
  toolbar:   { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' },
  searchWrap:{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', minWidth: '240px' },
  searchIcon:{ position: 'absolute', left: '0.85rem', color: T.inkSub, display: 'flex', pointerEvents: 'none' },
  searchInput:{
    width: '100%', padding: '0.6rem 0.9rem 0.6rem 2.4rem',
    border: `1px solid ${T.border}`, borderRadius: T.radiusInput,
    fontSize: '0.85rem', color: T.ink, outline: 'none',
    background: T.bgInput, boxSizing: 'border-box' as const,
  },
  filters:   { display: 'flex', gap: '0.4rem' },
  filterSelect: {
    padding: '0.55rem 0.85rem', border: `1px solid ${T.border}`, borderRadius: T.radiusInput,
    background: T.bgInput, fontSize: '0.82rem', color: T.ink,
    cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit',
  },

  // Table
  tableWrap: { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusCard, overflow: 'hidden', boxShadow: T.shadowCard },
  loadingRow:{ padding: '3rem', textAlign: 'center' as const, color: T.inkSub, fontSize: '0.9rem' },
  table:     { width: '100%', borderCollapse: 'collapse' as const },
  thead:     { background: T.bgMuted },
  th: {
    padding: '0.7rem 0.9rem', textAlign: 'left' as const,
    fontSize: '0.68rem', fontWeight: 700, color: T.inkSub,
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
    borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' as const,
  },
  tr:        { borderBottom: `1px solid ${T.borderLight}`, transition: 'background 0.1s' },
  td:        { padding: '0.75rem 0.9rem', fontSize: '0.85rem', color: T.ink, verticalAlign: 'middle' as const },
  cb:        { cursor: 'pointer', width: '14px', height: '14px', accentColor: T.amber },

  // User cell
  avatar: {
    width: '34px', height: '34px', borderRadius: '50%',
    color: '#0d1117', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
  },
  userName:  { fontSize: '0.87rem', fontWeight: 600, color: T.ink },
  userEmail: { fontSize: '0.74rem', color: T.inkSub, marginTop: '0.1rem' },

  tableFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.75rem 1rem', borderTop: `1px solid ${T.borderLight}`,
  },
  pageBtn:      { padding: '0.35rem 0.65rem', border: `1px solid ${T.border}`, borderRadius: T.radiusPill, background: T.bgMuted, cursor: 'pointer', fontSize: '0.78rem', color: T.inkSub },
  pageBtnActive:{ background: T.amber, color: '#0d1117', borderColor: T.amber },

  // Buttons
  primaryBtn: {
    padding: '0.55rem 1.1rem', background: T.amber, color: '#0d1117',
    border: 'none', borderRadius: T.radiusPill, cursor: 'pointer',
    fontWeight: 700, fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
    fontFamily: 'inherit',
  },
  outlineBtn: {
    padding: '0.5rem 0.9rem', background: T.bgMuted, color: T.ink,
    border: `1px solid ${T.border}`, borderRadius: T.radiusPill, cursor: 'pointer',
    fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
    fontFamily: 'inherit',
  },

  // Notifications
  errorBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: T.redLight, border: `1px solid ${T.redBorder}`, color: T.red,
    borderRadius: T.radiusInner, padding: '0.6rem 0.9rem',
    fontSize: '0.83rem', marginBottom: '1rem',
  },
  infoBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: T.blueLight, border: `1px solid ${T.blue}44`, color: T.blue,
    borderRadius: T.radiusInner, padding: '0.6rem 0.9rem',
    fontSize: '0.83rem', marginBottom: '1rem',
  },
  toastBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: T.greenLight, border: `1px solid ${T.greenBorder}`, color: T.green,
    borderRadius: T.radiusInner, padding: '0.6rem 0.9rem',
    fontSize: '0.83rem', marginBottom: '1rem',
  },

  // Modal
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' },
  modal:     { background: T.bgCard, borderRadius: T.radiusCard, padding: '2.25rem', width: '100%', maxWidth: '640px', boxShadow: T.shadowPop, border: `1px solid ${T.border}` },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  modalTitle:{ fontSize: '1.05rem', fontWeight: 700, color: T.ink },
  modalSub:  { fontSize: '0.78rem', color: T.inkSub, marginTop: '0.2rem' },
  closeBtn:  { background: 'none', border: 'none', cursor: 'pointer', color: T.inkSub, padding: '0.1rem', display: 'flex' },

  pwdBox: {
    background: T.bgMuted, border: `1px solid ${T.border}`, borderRadius: T.radiusInner,
    padding: '0.85rem 1rem', fontFamily: 'monospace', fontSize: '1rem',
    letterSpacing: '0.05em', color: T.green, wordBreak: 'break-all' as const,
    marginBottom: '0.75rem',
  },

  // Form
  formGrid:  { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' },
  fieldWrap: { display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  label:     { fontSize: '0.78rem', fontWeight: 600, color: T.inkSub },
  input: {
    padding: '0.65rem 0.85rem', border: `1px solid ${T.border}`, borderRadius: T.radiusInput,
    fontSize: '0.87rem', color: T.ink, outline: 'none', boxSizing: 'border-box' as const,
    background: T.bgInput, fontFamily: 'inherit',
  },

  // Audit
  auditRow:  { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem', background: T.bgMuted, borderRadius: T.radiusInner },
  auditDot:  { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '4px' },
}

import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ManagedUser {
  id: string
  email: string
  name: string
  role: string
  is_active: boolean
  created_at: string
  offboarded_at: string | null
}

interface AuditEntry {
  action: string
  actor_name: string
  details: string
  created_at: string
}

type FormMode = { kind: 'create' } | { kind: 'edit'; user: ManagedUser } | null
type TempPasswordModal = { name: string; email: string; password: string } | null

const ROLES = ['Customer', 'Manager', 'Admin']

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

// ─── Deterministic avatar colour from name ───────────────────────────────────
const AVATAR_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#8b5cf6','#ef4444','#14b8a6',
  '#f97316','#84cc16',
]
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
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

// ─── Mock "risk score" and "last login" from id ───────────────────────────────
function mockRisk(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 13 + id.charCodeAt(i)) >>> 0
  return (h % 80) + 5        // 5–84
}
function mockLastLogin(id: string) {
  const options = ['Just now','2m ago','15m ago','1h ago','2h ago','3h ago','5h ago','1d ago','2d ago','3d ago']
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 7 + id.charCodeAt(i)) >>> 0
  return options[h % options.length]
}
function mockMfa(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 11 + id.charCodeAt(i)) >>> 0
  return h % 3 !== 0   // ~66% have MFA
}

// ─── SVG icons ────────────────────────────────────────────────────────────────
function SearchIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
}
function RefreshIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
}
function DownloadIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
function UploadIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
}
function ShieldOnIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
}
function ShieldOffIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}
function DotsIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
}
function FilterIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
}
function XIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}

// ─── Role badge ───────────────────────────────────────────────────────────────
const ROLE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Customer: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  Manager:  { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
  Admin:    { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
}
function RoleBadge({ role }: { role: string }) {
  const st = ROLE_STYLE[role] ?? ROLE_STYLE.Customer
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
      fontSize: '0.72rem', fontWeight: 700, padding: '0.18rem 0.55rem',
      borderRadius: '999px', border: `1px solid ${st.border}`,
      background: st.bg, color: st.color,
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: st.color, flexShrink: 0 }} />
      {role}
    </span>
  )
}

// ─── Risk bar ─────────────────────────────────────────────────────────────────
function RiskBar({ score }: { score: number }) {
  const pct = Math.min(score, 100)
  const color = pct < 30 ? '#10b981' : pct < 60 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ width: '72px', height: '5px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '99px' }} />
      </div>
      <span style={{ fontSize: '0.75rem', color: '#57606a', fontWeight: 600, minWidth: '20px' }}>{score}</span>
    </div>
  )
}

// ─── Per-row action dropdown ──────────────────────────────────────────────────
function ActionMenu({
  user,
  onEdit, onHistory, onResetPwd, onDisable, onReinstate, onDelete,
}: {
  user: ManagedUser
  onEdit: () => void; onHistory: () => void; onResetPwd: () => void
  onDisable: () => void; onReinstate: () => void; onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const item = (label: string, color: string, onClick: () => void) => (
    <button
      key={label}
      style={{ ...m.menuItem, color }}
      onClick={() => { setOpen(false); onClick() }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        style={m.dotsBtn}
        onClick={() => setOpen(v => !v)}
        title="Actions"
      >
        <DotsIcon />
      </button>
      {open && (
        <div style={m.menu}>
          {item('Edit user',       '#1f2328', onEdit)}
          {item('View history',    '#1f2328', onHistory)}
          {item('Reset password',  '#7c3aed', onResetPwd)}
          <div style={m.menuDivider} />
          {user.is_active
            ? item('Suspend access', '#f59e0b', onDisable)
            : item('Reinstate',      '#10b981', onReinstate)
          }
          {item('Delete user', '#ef4444', onDelete)}
        </div>
      )}
    </div>
  )
}

const m: Record<string, React.CSSProperties> = {
  dotsBtn: {
    width: '30px', height: '30px', borderRadius: '6px',
    border: '1px solid #e5e7eb', background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#57606a',
  },
  menu: {
    position: 'absolute', right: 0, top: 'calc(100% + 4px)',
    background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
    zIndex: 100, minWidth: '160px', padding: '0.35rem',
    display: 'flex', flexDirection: 'column', gap: '1px',
  },
  menuItem: {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '0.5rem 0.75rem', background: 'transparent',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '0.82rem', fontWeight: 500,
  },
  menuDivider: { height: '1px', background: '#f3f4f6', margin: '0.2rem 0' },
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [users,        setUsers]        = useState<ManagedUser[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [search,       setSearch]       = useState('')
  const [roleFilter,   setRoleFilter]   = useState<string>('All')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [form,         setForm]         = useState<FormMode>(null)
  const [auditFor,     setAuditFor]     = useState<ManagedUser | null>(null)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [tempPwdModal, setTempPwdModal] = useState<TempPasswordModal>(null)
  const [selected,     setSelected]     = useState<Set<string>>(new Set())

  const load = () => {
    setLoading(true)
    api.get<{ users: ManagedUser[]; total: number }>('/users')
      .then(r => setUsers(r.data.users))
      .catch(() => setError('Failed to load directory.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  // ── Derived stats ────────────────────────────────────────────────────────
  const total     = users.length
  const active    = users.filter(u => u.is_active).length
  const suspended = users.filter(u => !u.is_active).length
  const admins    = users.filter(u => u.role === 'Admin').length
  const managers  = users.filter(u => u.role === 'Manager').length
  const customers = users.filter(u => u.role === 'Customer').length
  const now       = Date.now()
  const joined7d  = users.filter(u => {
    try { return now - new Date(u.created_at).getTime() < 7 * 86_400_000 } catch { return false }
  }).length

  const STATS = [
    { label: 'Total Users',   value: total,     color: '#1f2328' },
    { label: 'Active',        value: active,    color: '#10b981' },
    { label: 'Pending',       value: 0,         color: '#f59e0b' },
    { label: 'Suspended',     value: suspended, color: '#ef4444' },
    { label: 'Admins',        value: admins,    color: '#8b5cf6' },
    { label: 'Managers',      value: managers,  color: '#3b82f6' },
    { label: 'Customers',     value: customers, color: '#2563eb' },
    { label: 'Joined (7d)',   value: joined7d,  color: '#0ea5e9' },
  ]

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
    try { await api.post(`/users/${u.id}/disable`); load() } catch { setError('Failed to suspend user.') }
  }
  const handleReinstate = async (u: ManagedUser) => {
    try { await api.post(`/users/${u.id}/reinstate`); load() } catch { setError('Failed to reinstate user.') }
  }
  const handleDelete = async (u: ManagedUser) => {
    if (!confirm(`Permanently delete ${u.name}? This cannot be undone.`)) return
    try { await api.delete(`/users/${u.id}`); load() } catch { setError('Failed to delete user.') }
  }

  // ── Select all ───────────────────────────────────────────────────────────
  const allSelected = filtered.length > 0 && filtered.every(u => selected.has(u.id))
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(filtered.map(u => u.id)))
  const toggleOne   = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  if (me?.role !== 'Admin') {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#57606a' }}>Admin role required.</div>
  }

  return (
    <div style={s.root}>
      {/* ── Page header ── */}
      <div style={s.pageHead}>
        <div>
          <h1 style={s.pageTitle}>Identity Lifecycle</h1>
          <p style={s.pageSub}>Manage the complete employee identity lifecycle across onboarding, access reviews, role changes and offboarding.</p>
        </div>
        <div style={s.headActions}>
          <button style={s.outlineBtn} title="Bulk Import"><UploadIcon /> Bulk Import</button>
          <button style={s.outlineBtn} title="Export"><DownloadIcon /> Export</button>
          <button style={s.outlineBtn} onClick={load} title="Refresh"><RefreshIcon /> Refresh</button>
          <button style={s.primaryBtn} onClick={() => setForm({ kind: 'create' })}>
            + Onboard User
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={s.statsRow}>
        {STATS.map(stat => (
          <div key={stat.label} style={s.statCard}>
            <div style={{ ...s.statLabel, color: stat.color }}>{stat.label}</div>
            <div style={s.statValue}>{stat.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={s.errorBox}>
          <span>⚠ {error}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }} onClick={() => setError(null)}><XIcon /></button>
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
            {['All', 'Customer', 'Manager', 'Admin'].map(v => (
              <option key={v}>Role: {v}</option>
            ))}
          </select>
          <button style={s.filterSelect}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <FilterIcon /> More
            </span>
          </button>
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
                <th style={{ ...s.th, width: '36px' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} style={s.cb} />
                </th>
                <th style={s.th}>User</th>
                <th style={s.th}>Department</th>
                <th style={s.th}>Role</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Manager</th>
                <th style={s.th}>Risk</th>
                <th style={{ ...s.th, textAlign: 'center' }}>MFA</th>
                <th style={s.th}>Last Login</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ ...s.td, textAlign: 'center', color: '#9ca3af', padding: '3rem' }}>
                    No users match your search.
                  </td>
                </tr>
              )}
              {filtered.map((u, idx) => {
                const risk     = mockRisk(u.id)
                const lastLogin = mockLastLogin(u.id)
                const hasMfa   = mockMfa(u.id)
                const dept     = mockDept(u.name)
                const bg       = avatarColor(u.name)
                const ini      = initials(u.name)
                const isSel    = selected.has(u.id)
                return (
                  <tr
                    key={u.id}
                    style={{ ...s.tr, background: isSel ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#fafafa' }}
                  >
                    {/* Checkbox */}
                    <td style={s.td}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleOne(u.id)} style={s.cb} />
                    </td>

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

                    {/* Department */}
                    <td style={{ ...s.td, color: '#57606a', fontSize: '0.83rem' }}>{dept}</td>

                    {/* Role */}
                    <td style={s.td}><RoleBadge role={u.role} /></td>

                    {/* Status */}
                    <td style={s.td}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        fontSize: '0.72rem', fontWeight: 700,
                        padding: '0.18rem 0.55rem', borderRadius: '999px',
                        background: u.is_active ? '#f0fdf4' : '#fef2f2',
                        color:      u.is_active ? '#16a34a' : '#dc2626',
                        border:     `1px solid ${u.is_active ? '#86efac' : '#fecaca'}`,
                      }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: u.is_active ? '#16a34a' : '#dc2626' }} />
                        {u.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>

                    {/* Manager (mock) */}
                    <td style={{ ...s.td, color: '#57606a', fontSize: '0.83rem' }}>
                      {mockDept(u.id).split(' ')[0]} {['Sharma','Reyes','Patel','Zhang','Jones'][mockRisk(u.name) % 5]}
                    </td>

                    {/* Risk bar */}
                    <td style={s.td}><RiskBar score={risk} /></td>

                    {/* MFA */}
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      {hasMfa ? <ShieldOnIcon /> : <ShieldOffIcon />}
                    </td>

                    {/* Last login */}
                    <td style={{ ...s.td, color: '#57606a', fontSize: '0.82rem' }}>{lastLogin}</td>

                    {/* Actions */}
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <ActionMenu
                        user={u}
                        onEdit={()       => setForm({ kind: 'edit', user: u })}
                        onHistory={()    => openAudit(u)}
                        onResetPwd={()   => handleResetPassword(u)}
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
            <span style={{ color: '#57606a', fontSize: '0.8rem' }}>
              Showing {filtered.length} of {total} users
              {selected.size > 0 && ` · ${selected.size} selected`}
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
            <p style={{ fontSize: '0.85rem', color: '#57606a', margin: '0 0 1rem' }}>
              Share this temporary password securely. The user must change it on next login.
            </p>
            <div style={s.pwdBox}>{tempPwdModal.password}</div>
            <p style={{ fontSize: '0.78rem', color: '#d97706', margin: '0 0 1.25rem', display: 'flex', gap: '0.35rem' }}>
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
              <p style={{ color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
                No lifecycle events recorded yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '400px', overflowY: 'auto' }}>
                {auditEntries.map((e, i) => {
                  const color = ACTION_COLOR[e.action] ?? '#57606a'
                  return (
                    <div key={i} style={s.auditRow}>
                      <div style={{ ...s.auditDot, background: color }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color }}>
                            {ACTION_LABEL[e.action] ?? e.action}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                            by {e.actor_name}
                          </span>
                        </div>
                        {e.details && <div style={{ fontSize: '0.78rem', color: '#57606a', marginTop: '0.15rem' }}>{e.details}</div>}
                        <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.15rem' }}>
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
  const isEdit   = mode.kind === 'edit'
  const existing = isEdit ? mode.user : null
  const [email,    setEmail]    = useState(existing?.email    ?? '')
  const [name,     setName]     = useState(existing?.name     ?? '')
  const [role,     setRole]     = useState(existing?.role     ?? 'Customer')
  const [isActive, setIsActive] = useState(existing?.is_active ?? true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const handleSave = async () => {
    if (!email.trim() || !name.trim()) { setError('Email and name are required'); return }
    setSaving(true); setError(null)
    try {
      if (isEdit && existing) {
        await api.put(`/users/${existing.id}`, { email, name, role, is_active: isActive })
      } else {
        await api.post('/users', { email, name, role })
      }
      onSaved()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHead}>
          <div>
            <div style={s.modalTitle}>{isEdit ? 'Edit User (Mover)' : 'Onboard New User (Joiner)'}</div>
            <div style={s.modalSub}>{isEdit ? `Updating ${existing?.name}` : 'Create a new identity in IBM Verify'}</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}><XIcon /></button>
        </div>

        <div style={s.formGrid}>
          <div style={s.fieldWrap}>
            <label style={s.label}>Full Name</label>
            <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div style={s.fieldWrap}>
            <label style={s.label}>Email Address</label>
            <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@mockbank.com" />
          </div>
          <div style={s.fieldWrap}>
            <label style={s.label}>Role</label>
            <select style={s.input} value={role} onChange={e => setRole(e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {isEdit && (
            <div style={s.fieldWrap}>
              <label style={s.label}>Account Status</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[true, false].map(v => (
                  <button
                    key={String(v)}
                    style={{
                      flex: 1, padding: '0.5rem', border: `1.5px solid ${isActive === v ? (v ? '#16a34a' : '#dc2626') : '#e5e7eb'}`,
                      borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
                      background: isActive === v ? (v ? '#f0fdf4' : '#fef2f2') : '#fff',
                      color: isActive === v ? (v ? '#16a34a' : '#dc2626') : '#9ca3af',
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
          <button style={s.primaryBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
          </button>
          <button style={s.outlineBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:      { fontFamily: '-apple-system,"Segoe UI",system-ui,sans-serif' },

  pageHead:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' },
  pageTitle: { fontSize: '1.55rem', fontWeight: 700, color: '#1f2328', margin: 0 },
  pageSub:   { fontSize: '0.82rem', color: '#57606a', marginTop: '0.25rem', maxWidth: '560px' },
  headActions:{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },

  // Stat cards
  statsRow:  { display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: '0.75rem', marginBottom: '1.5rem' },
  statCard:  { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0.9rem 1rem' },
  statLabel: { fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.4rem' },
  statValue: { fontSize: '1.75rem', fontWeight: 700, color: '#1f2328', lineHeight: 1 },

  // Toolbar
  toolbar:   { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' },
  searchWrap:{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', minWidth: '240px' },
  searchIcon:{ position: 'absolute', left: '0.85rem', color: '#9ca3af', display: 'flex', pointerEvents: 'none' },
  searchInput:{
    width: '100%', padding: '0.6rem 0.9rem 0.6rem 2.4rem',
    border: '1px solid #e5e7eb', borderRadius: '8px',
    fontSize: '0.85rem', color: '#1f2328', outline: 'none',
    background: '#fff', boxSizing: 'border-box' as const,
  },
  filters:   { display: 'flex', gap: '0.4rem' },
  filterSelect: {
    padding: '0.55rem 0.85rem', border: '1px solid #e5e7eb', borderRadius: '8px',
    background: '#fff', fontSize: '0.82rem', color: '#374151',
    cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit',
  },

  // Table
  tableWrap: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' },
  loadingRow:{ padding: '3rem', textAlign: 'center' as const, color: '#9ca3af', fontSize: '0.9rem' },
  table:     { width: '100%', borderCollapse: 'collapse' as const },
  thead:     { background: '#f9fafb' },
  th: {
    padding: '0.7rem 0.9rem', textAlign: 'left' as const,
    fontSize: '0.72rem', fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
    borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const,
  },
  tr:        { borderBottom: '1px solid #f3f4f6', transition: 'background 0.1s' },
  td:        { padding: '0.75rem 0.9rem', fontSize: '0.85rem', color: '#1f2328', verticalAlign: 'middle' as const },
  cb:        { cursor: 'pointer', width: '14px', height: '14px', accentColor: '#1a2e2a' },

  // User cell
  avatar: {
    width: '34px', height: '34px', borderRadius: '50%',
    color: '#fff', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
  },
  userName:  { fontSize: '0.87rem', fontWeight: 600, color: '#1f2328' },
  userEmail: { fontSize: '0.74rem', color: '#9ca3af', marginTop: '0.1rem' },

  tableFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.75rem 1rem', borderTop: '1px solid #f3f4f6',
  },
  pageBtn:      { padding: '0.35rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '0.78rem', color: '#57606a' },
  pageBtnActive:{ background: '#1a2e2a', color: '#fff', borderColor: '#1a2e2a' },

  // Buttons
  primaryBtn: {
    padding: '0.55rem 1.1rem', background: '#1a2e2a', color: '#fff',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontWeight: 700, fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
    fontFamily: 'inherit',
  },
  outlineBtn: {
    padding: '0.5rem 0.9rem', background: '#fff', color: '#374151',
    border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer',
    fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
    fontFamily: 'inherit',
  },

  // Error
  errorBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    borderRadius: '8px', padding: '0.6rem 0.9rem',
    fontSize: '0.83rem', marginBottom: '1rem',
  },

  // Modal
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' },
  modal:     { background: '#fff', borderRadius: '14px', padding: '1.75rem', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' },
  modalTitle:{ fontSize: '1.05rem', fontWeight: 700, color: '#1f2328' },
  modalSub:  { fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.2rem' },
  closeBtn:  { background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '0.1rem', display: 'flex' },

  pwdBox: {
    background: '#f7f8fa', border: '1px solid #e5e7eb', borderRadius: '8px',
    padding: '0.85rem 1rem', fontFamily: 'monospace', fontSize: '1rem',
    letterSpacing: '0.05em', color: '#1f2328', wordBreak: 'break-all' as const,
    marginBottom: '0.75rem',
  },

  // Form
  formGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' },
  fieldWrap: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label:     { fontSize: '0.78rem', fontWeight: 600, color: '#57606a' },
  input: {
    padding: '0.55rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '7px',
    fontSize: '0.87rem', color: '#1f2328', outline: 'none', boxSizing: 'border-box' as const,
    background: '#fff', fontFamily: 'inherit',
  },

  // Audit
  auditRow:  { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '8px' },
  auditDot:  { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '4px' },
}

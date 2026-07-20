import React, { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

const CUSTOMER_NAV = [
  { to: '/dashboard',        label: 'Dashboard',     icon: DashIcon },
  { to: '/transactions',     label: 'Transactions',  icon: TxIcon },
  { to: '/transfers',        label: 'Transfers',     icon: TransferIcon },
]

const MANAGER_NAV = [
  { to: '/dashboard',        label: 'Dashboard',            icon: DashIcon },
  { to: '/all-transactions', label: 'Customer Transactions', icon: TxIcon },
]

const ADMIN_EXTRA = [
  { to: '/admin/users',      label: 'Identity Lifecycle',   icon: UsersIcon },
]

const OTHERS_NAV_CUSTOMER = [
  { to: '/security',       label: 'Security',       icon: ShieldIcon },
  { to: '/notifications',  label: 'Notifications',  icon: BellIcon },
  { to: '/settings',       label: 'Settings',       icon: GearIcon },
]

const OTHERS_NAV_ADMIN = [
  { to: '/security',       label: 'Security Center', icon: ShieldIcon },
  { to: '/notifications',  label: 'Notifications',   icon: BellIcon },
  { to: '/settings',       label: 'Settings',        icon: GearIcon },
]

// ── SVG Icons ──────────────────────────────────────────────────────────────────
function DashIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
}
function TxIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
}
function TransferIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
}
function UsersIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
}
function ShieldIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}
function GearIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
}
function BellIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
}
function SearchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
}
function MailIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const mainNav =
    user?.role === 'Customer' ? CUSTOMER_NAV :
    user?.role === 'Manager'  ? MANAGER_NAV  :
    user?.role === 'Admin'    ? MANAGER_NAV  :
    CUSTOMER_NAV

  const [dropOpen, setDropOpen]   = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const dropRef  = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  const initial = user?.name?.charAt(0)?.toUpperCase() ?? '?'

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current  && !dropRef.current.contains(e.target as Node))  setDropOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => {
    logout()
    api.delete('/auth/session').catch(() => {})
    window.location.href = '/'
  }

  // Mock notifications
  const notifications = [
    { id: 1, text: 'Transfer of $250 completed successfully', time: '2m ago', unread: true },
    { id: 2, text: 'Your account balance has been updated', time: '1h ago', unread: true },
    { id: 3, text: 'Monthly statement is ready', time: '1d ago', unread: false },
  ]
  const unreadCount = notifications.filter(n => n.unread).length

  return (
    <div style={s.root}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={s.sidebar}>
        {/* Brand */}
        <div style={s.brand}>
          <div style={s.brandIcon}>M</div>
          <span style={s.brandName}>MockBank</span>
        </div>

        <nav style={s.nav}>
          <div style={s.navSection}>MAIN MENU</div>
          {mainNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}
              style={({ isActive }) => ({ ...s.navLink, ...(isActive ? s.navActive : {}) })}>
              <span style={s.navIcon}><Icon /></span>
              {label}
            </NavLink>
          ))}

          {user?.role === 'Admin' && (
            <>
              <div style={{ ...s.navSection, marginTop: '1.5rem' }}>ADMIN</div>
              {ADMIN_EXTRA.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to}
                  style={({ isActive }) => ({ ...s.navLink, ...(isActive ? s.navActive : {}) })}>
                  <span style={s.navIcon}><Icon /></span>
                  {label}
                </NavLink>
              ))}
            </>
          )}

          <div style={{ ...s.navSection, marginTop: '1.5rem' }}>OTHERS</div>
          {(user?.role === 'Admin' || user?.role === 'Manager' ? OTHERS_NAV_ADMIN : OTHERS_NAV_CUSTOMER).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}
              style={({ isActive }) => ({ ...s.navLink, ...(isActive ? s.navActive : {}) })}>
              <span style={s.navIcon}><Icon /></span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar user card */}
        <div style={s.sidebarUser}>
          <div style={s.sidebarAvatar}>{initial}</div>
          <div style={s.sidebarUserInfo}>
            <div style={s.sidebarName}>{user?.name}</div>
            <div style={s.sidebarRole}>{user?.role}</div>
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div style={s.main}>
        {/* Top bar */}
        <header style={s.header}>
          <div>
            <div style={s.headerTitle}>Welcome, {user?.name?.split(' ')[0]}!</div>
            <div style={s.headerSub}>Manage your finances with real-time insights</div>
          </div>

          <div style={s.headerRight}>
            {/* Search */}
            <button style={s.iconBtn} title="Search">
              <SearchIcon />
            </button>

            {/* Mail */}
            <button style={s.iconBtn} title="Messages">
              <MailIcon />
            </button>

            {/* Notifications */}
            <div style={{ position: 'relative' }} ref={notifRef}>
              <button style={s.iconBtn} onClick={() => setNotifOpen(v => !v)} title="Notifications">
                <BellIcon />
                {unreadCount > 0 && <span style={s.notifBadge}>{unreadCount}</span>}
              </button>
              {notifOpen && (
                <div style={s.dropdown}>
                  <div style={s.dropTitle}>Notifications</div>
                  {notifications.map(n => (
                    <div key={n.id} style={{ ...s.notifItem, background: n.unread ? '#f0fdf4' : '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.82rem', color: '#1f2328', lineHeight: 1.4 }}>{n.text}</span>
                        {n.unread && <span style={s.unreadDot} />}
                      </div>
                      <div style={s.notifTime}>{n.time}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Avatar / profile */}
            <div style={{ position: 'relative' }} ref={dropRef}>
              <button style={s.avatarBtn} onClick={() => setDropOpen(v => !v)}>
                {initial}
              </button>
              {dropOpen && (
                <div style={s.dropdown}>
                  <div style={s.dropHeader}>
                    <div style={s.dropAvatarLg}>{initial}</div>
                    <div>
                      <div style={s.dropName}>{user?.name}</div>
                      <div style={s.dropEmail}>{user?.email}</div>
                      <span style={s.roleBadge}>{user?.role}</span>
                    </div>
                  </div>
                  <div style={s.dropDivider} />
                  <button style={s.dropAction} onClick={() => { setDropOpen(false); navigate('/dashboard') }}>
                    Dashboard
                  </button>
                  <div style={s.dropDivider} />
                  <button style={{ ...s.dropAction, color: '#dc2626' }} onClick={handleLogout}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div style={s.divider} />
        <main style={s.content}>{children}</main>
      </div>
    </div>
  )
}

const SIDEBAR_BG   = '#1a2e2a'
const SIDEBAR_HOVER = '#243d38'
const SIDEBAR_ACTIVE = '#2d5044'
const ACCENT       = '#4ade80'

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', minHeight: '100vh', background: '#f5f6fa', fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif' },

  // Sidebar
  sidebar: {
    width: '230px', background: SIDEBAR_BG, color: '#fff',
    display: 'flex', flexDirection: 'column', flexShrink: 0,
    padding: '0 0 1rem',
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    padding: '1.4rem 1.5rem 1rem',
  },
  brandIcon: {
    width: '32px', height: '32px', borderRadius: '8px',
    background: ACCENT, color: SIDEBAR_BG,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: '1rem',
  },
  brandName: { fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.01em' },
  nav: { flex: 1, padding: '0.5rem 0' },
  navSection: {
    fontSize: '0.68rem', fontWeight: 700, color: '#6b8a82',
    letterSpacing: '0.08em', padding: '0.75rem 1.5rem 0.4rem',
  },
  navLink: {
    display: 'flex', alignItems: 'center', gap: '0.65rem',
    padding: '0.6rem 1.5rem', color: '#9cb8b0',
    textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500,
    borderRadius: '0', transition: 'background 0.15s',
  },
  navActive: {
    background: SIDEBAR_ACTIVE, color: '#fff',
    borderLeft: `3px solid ${ACCENT}`, paddingLeft: 'calc(1.5rem - 3px)',
  },
  navIcon: { display: 'flex', alignItems: 'center', opacity: 0.8 },
  sidebarUser: {
    display: 'flex', alignItems: 'center', gap: '0.65rem',
    padding: '0.85rem 1.25rem', margin: '0.5rem 0.75rem 0',
    background: SIDEBAR_HOVER, borderRadius: '10px',
  },
  sidebarAvatar: {
    width: '34px', height: '34px', borderRadius: '50%',
    background: ACCENT, color: SIDEBAR_BG,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: '0.9rem', flexShrink: 0,
  },
  sidebarUserInfo: { overflow: 'hidden' },
  sidebarName: { fontSize: '0.82rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sidebarRole: { fontSize: '0.72rem', color: '#9cb8b0', marginTop: '0.1rem' },

  // Main
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#f5f6fa' },
  header: {
    background: '#fff', padding: '1.1rem 2rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: '1.2rem', fontWeight: 700, color: '#1a2e2a' },
  headerSub: { fontSize: '0.8rem', color: '#57606a', marginTop: '0.15rem' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  divider: { height: '1px', background: '#e5e7eb' },
  content: { flex: 1, padding: '1.75rem 2rem', overflowY: 'auto' as const },

  iconBtn: {
    position: 'relative' as const,
    width: '38px', height: '38px', borderRadius: '50%',
    background: '#f5f6fa', border: '1px solid #e5e7eb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#57606a',
  },
  notifBadge: {
    position: 'absolute' as const, top: '-2px', right: '-2px',
    width: '16px', height: '16px', borderRadius: '50%',
    background: '#ef4444', color: '#fff',
    fontSize: '0.6rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid #fff',
  },
  avatarBtn: {
    width: '38px', height: '38px', borderRadius: '50%',
    background: SIDEBAR_ACTIVE, color: '#fff', border: '2px solid #e5e7eb',
    cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  // Dropdown (shared for notifications + profile)
  dropdown: {
    position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0,
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.12)', width: '300px', zIndex: 200, overflow: 'hidden',
  },
  dropTitle: {
    padding: '0.85rem 1rem 0.5rem', fontSize: '0.85rem',
    fontWeight: 700, color: '#1f2328', borderBottom: '1px solid #f3f4f6',
  },
  notifItem: { padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' },
  notifTime: { fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.25rem' },
  unreadDot: {
    width: '8px', height: '8px', borderRadius: '50%',
    background: '#10b981', flexShrink: 0, marginTop: '3px',
  },
  dropHeader: {
    padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
    background: '#f7f8fa', borderBottom: '1px solid #e5e7eb',
  },
  dropAvatarLg: {
    width: '42px', height: '42px', borderRadius: '50%',
    background: SIDEBAR_ACTIVE, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.1rem', fontWeight: 700, flexShrink: 0,
  },
  dropName: { fontSize: '0.9rem', fontWeight: 700, color: '#1f2328', marginBottom: '0.1rem' },
  dropEmail: { fontSize: '0.75rem', color: '#57606a', marginBottom: '0.3rem' },
  roleBadge: {
    display: 'inline-block', fontSize: '0.65rem', fontWeight: 700,
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
    padding: '0.1rem 0.45rem', background: '#f0fdf4', color: '#166534',
    border: '1px solid #bbf7d0', borderRadius: '999px',
  },
  dropDivider: { borderTop: '1px solid #f3f4f6' },
  dropAction: {
    display: 'block', width: '100%', textAlign: 'left' as const,
    padding: '0.65rem 1rem', background: 'transparent', border: 'none',
    cursor: 'pointer', fontSize: '0.85rem', color: '#1f2328',
  },
}

import React, { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { T } from '../styles/theme'

const CUSTOMER_NAV = [
  { to: '/dashboard',        label: 'Overview',      icon: OverviewIcon },
  { to: '/transactions',     label: 'Transactions',  icon: TxIcon },
  { to: '/transfers',        label: 'Transfers',     icon: TransferIcon },
  { to: '/profile',          label: 'Cards',         icon: CardIcon },
]

const MANAGER_NAV = [
  { to: '/dashboard',        label: 'Overview',             icon: OverviewIcon },
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
  { to: '/security',       label: 'Security',        icon: ShieldIcon },
  { to: '/notifications',  label: 'Notifications',   icon: BellIcon },
  { to: '/settings',       label: 'Settings',        icon: GearIcon },
]

// ── SVG Icons ──────────────────────────────────────────────────────────────────
function OverviewIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
}
function TxIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
}
function TransferIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
}
function CardIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
}
function UsersIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
}
function ShieldIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}
function GearIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
}
function BellIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
}
function LogoutIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
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

  const initial = (user?.name?.split(' ').map(w => w[0]).join('') ?? '?').slice(0, 2).toUpperCase()

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

  const notifications = [
    { id: 1, icon: '⚠', title: 'Large purchase alert', body: '$1,299 at Apple Store on card ••0044', time: '2h ago', unread: true },
    { id: 2, icon: 'ℹ', title: 'Transfer completed', body: '$2,000 moved to High-Yield Savings', time: '3d ago', unread: false },
    { id: 3, icon: 'ℹ', title: 'New sign-in detected', body: 'Login from MacBook Pro · New York', time: '2d ago', unread: true },
  ]
  const unreadCount = notifications.filter(n => n.unread).length

  return (
    <div style={s.root}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={s.sidebar}>
        {/* Brand */}
        <div style={s.brand}>
          <div style={s.brandIcon}>{initial.charAt(0)}</div>
          <div>
            <div style={s.brandName}>MockBank</div>
            <div style={s.brandSub}>DIGITAL BANKING</div>
          </div>
        </div>

        <nav style={s.nav}>
          <div style={s.navSection}>BANKING</div>
          {mainNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}
              style={({ isActive }) => ({ ...s.navLink, ...(isActive ? s.navActive : {}) })}>
              {({ isActive }) => (
                <>
                  <span style={{ ...s.navIcon, color: isActive ? T.amber : T.inkSub }}><Icon /></span>
                  <span>{label}</span>
                  {isActive && <span style={s.navDot} />}
                </>
              )}
            </NavLink>
          ))}

          {user?.role === 'Admin' && (
            <>
              <div style={{ ...s.navSection, marginTop: '1.5rem' }}>ADMIN</div>
              {ADMIN_EXTRA.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to}
                  style={({ isActive }) => ({ ...s.navLink, ...(isActive ? s.navActive : {}) })}>
                  {({ isActive }) => (
                    <>
                      <span style={{ ...s.navIcon, color: isActive ? T.amber : T.inkSub }}><Icon /></span>
                      <span>{label}</span>
                      {isActive && <span style={s.navDot} />}
                    </>
                  )}
                </NavLink>
              ))}
            </>
          )}

          <div style={{ ...s.navSection, marginTop: '1.5rem' }}>ACCOUNT</div>
          {(user?.role === 'Admin' || user?.role === 'Manager' ? OTHERS_NAV_ADMIN : OTHERS_NAV_CUSTOMER).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}
              style={({ isActive }) => ({ ...s.navLink, ...(isActive ? s.navActive : {}) })}>
              {({ isActive }) => (
                <>
                  <span style={{ ...s.navIcon, color: isActive ? T.amber : T.inkSub }}><Icon /></span>
                  <span>{label}</span>
                  {isActive && <span style={s.navDot} />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom concierge card */}
        <div style={s.conciergeCard}>
          <div style={s.conciergeLine}>Concierge</div>
          <div style={s.conciergeTitle}>Speak to your advisor</div>
          <button style={s.conciergeBtn} onClick={() => navigate('/settings')}>Schedule a call</button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div style={s.main}>
        {/* Top bar */}
        <header style={s.header}>
          <div style={s.headerRight}>
            {/* Notifications */}
            <div style={{ position: 'relative' }} ref={notifRef}>
              <button style={s.iconBtn} onClick={() => setNotifOpen(v => !v)}>
                <BellIcon />
                {unreadCount > 0 && <span style={s.notifBadge}>{unreadCount}</span>}
              </button>
              {notifOpen && (
                <div style={{ ...s.dropdown, background: '#ffffff', border: '1px solid #e5e7eb' }}>
                  <div style={{ ...s.dropTitle, color: '#111827', borderBottom: '1px solid #e5e7eb' }}>Notifications</div>
                  {notifications.map(n => (
                    <div key={n.id} style={{ ...s.notifItem, background: n.unread ? '#f0f4ff' : 'transparent', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ ...s.notifIconCircle, background: '#f3f4f6' }}>{n.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.83rem', fontWeight: 600, color: '#111827' }}>{n.title}</div>
                        <div style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '0.1rem' }}>{n.body}</div>
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.2rem' }}>{n.time}</div>
                      </div>
                      {n.unread && <span style={s.unreadDot} />}
                    </div>
                  ))}
                  <div style={{ padding: '0.6rem 1rem', borderTop: '1px solid #e5e7eb' }}>
                    <button style={s.viewAllBtn} onClick={() => { setNotifOpen(false); navigate('/notifications') }}>
                      View all notifications →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User */}
            <div style={{ position: 'relative' }} ref={dropRef}>
              <button style={s.userBtn} onClick={() => setDropOpen(v => !v)}>
                <div style={s.userBtnInfo}>
                  <div style={s.userBtnName}>{user?.name}</div>
                  <div style={s.userBtnRole}>{user?.role === 'Customer' ? 'Private Client' : user?.role}</div>
                </div>
                <div style={s.avatarCircle}>{initial}</div>
                <span style={{ color: T.inkSub, fontSize: '0.7rem' }}>▾</span>
              </button>
              {dropOpen && (
                <div style={{ ...s.dropdown, width: '240px' }}>
                  <div style={s.dropHeader}>
                    <div style={s.avatarCircleLg}>{initial}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                      <div style={{ fontSize: '0.72rem', color: T.inkSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
                    </div>
                  </div>
                  <div style={s.dropDivider} />
                  <button style={s.dropAction} onClick={() => { setDropOpen(false); navigate('/settings') }}>Settings</button>
                  <div style={s.dropDivider} />
                  <button style={{ ...s.dropAction, color: T.red, display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={handleLogout}>
                    <LogoutIcon /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main style={s.content}>{children}</main>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', minHeight: '100vh',
    background: T.bg, fontFamily: T.fontFamily, color: T.ink,
  },

  // ── Sidebar ──────────────────────────────────────────────────────────────────
  sidebar: {
    width: '220px', background: T.bgSidebar,
    borderRight: `1px solid ${T.border}`,
    display: 'flex', flexDirection: 'column', flexShrink: 0,
    padding: '0',
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: '0.65rem',
    padding: '1.25rem 1.25rem 1rem',
    borderBottom: `1px solid ${T.border}`,
    marginBottom: '0.5rem',
  },
  brandIcon: {
    width: '34px', height: '34px', borderRadius: '8px',
    background: T.amber, color: '#0d1117',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: '1rem', flexShrink: 0,
  },
  brandName: { fontSize: '0.95rem', fontWeight: 700, color: T.ink, letterSpacing: '-0.01em' },
  brandSub: { fontSize: '0.6rem', fontWeight: 700, color: T.inkLight, letterSpacing: '0.12em' },

  nav: { flex: 1, padding: '0.25rem 0.75rem', overflowY: 'auto' as const },
  navSection: {
    fontSize: '0.6rem', fontWeight: 700, color: T.inkLight,
    letterSpacing: '0.1em', padding: '0.75rem 0.5rem 0.35rem',
    textTransform: 'uppercase' as const,
  },
  navLink: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    padding: '0.52rem 0.75rem', color: T.inkSub,
    textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500,
    borderRadius: '8px', transition: 'background 0.12s',
    margin: '1px 0', position: 'relative' as const,
  },
  navActive: {
    background: T.bgCard, color: T.ink, fontWeight: 600,
  },
  navIcon: { display: 'flex', alignItems: 'center', flexShrink: 0 },
  navDot: {
    width: '6px', height: '6px', borderRadius: '50%',
    background: T.amber, marginLeft: 'auto', flexShrink: 0,
  },

  conciergeCard: {
    margin: '0.75rem',
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '10px', padding: '1rem',
  },
  conciergeLine:  { fontSize: '0.62rem', fontWeight: 700, color: T.inkLight, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '0.2rem' },
  conciergeTitle: { fontSize: '0.85rem', fontWeight: 600, color: T.ink, marginBottom: '0.75rem' },
  conciergeBtn: {
    width: '100%', padding: '0.5rem', background: T.amber, color: '#0d1117',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem',
  },

  // ── Main ─────────────────────────────────────────────────────────────────────
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  header: {
    background: T.bg, borderBottom: `1px solid ${T.border}`,
    padding: '0.75rem 1.75rem',
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
    gap: '1rem',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: '0.5rem' },

  iconBtn: {
    position: 'relative' as const,
    width: '34px', height: '34px', borderRadius: '8px',
    background: T.bgCard, border: `1px solid ${T.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: T.inkSub,
  },
  notifBadge: {
    position: 'absolute' as const, top: '-5px', right: '-5px',
    minWidth: '18px', height: '18px', borderRadius: '999px',
    background: T.red, color: '#fff',
    fontSize: '0.65rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `2px solid ${T.bg}`,
    padding: '0 3px',
  },

  userBtn: {
    display: 'flex', alignItems: 'center', gap: '0.65rem',
    padding: '0.4rem 0.75rem 0.4rem 0.5rem',
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '8px', cursor: 'pointer',
  },
  userBtnInfo: { textAlign: 'right' as const },
  userBtnName: { fontSize: '0.82rem', fontWeight: 700, color: T.ink },
  userBtnRole: { fontSize: '0.65rem', color: T.inkSub, marginTop: '0.05rem' },
  avatarCircle: {
    width: '30px', height: '30px', borderRadius: '50%',
    background: T.amber, color: '#0d1117',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: '0.72rem', flexShrink: 0,
  },

  content: { flex: 1, padding: '1.75rem', overflowY: 'auto' as const },

  // Dropdowns
  dropdown: {
    position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0,
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '10px', boxShadow: T.shadowPop,
    width: '320px', zIndex: 200, overflow: 'hidden',
  },
  dropTitle: {
    padding: '0.85rem 1rem 0.6rem', fontSize: '0.82rem',
    fontWeight: 700, color: T.ink, borderBottom: `1px solid ${T.border}`,
  },
  notifItem: {
    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
    padding: '0.75rem 1rem', borderBottom: `1px solid ${T.borderLight}`, cursor: 'pointer',
  },
  notifIconCircle: {
    width: '32px', height: '32px', borderRadius: '8px',
    background: T.bgMuted, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.85rem', flexShrink: 0,
  },
  unreadDot: {
    width: '7px', height: '7px', borderRadius: '50%',
    background: T.amber, flexShrink: 0, marginTop: '5px',
  },
  viewAllBtn: {
    background: 'none', border: 'none', color: T.amber, fontSize: '0.8rem',
    fontWeight: 600, cursor: 'pointer', padding: 0,
  },
  dropHeader: {
    padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
    background: T.bgMuted, borderBottom: `1px solid ${T.border}`,
  },
  avatarCircleLg: {
    width: '40px', height: '40px', borderRadius: '50%',
    background: T.amber, color: '#0d1117',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.9rem', fontWeight: 800, flexShrink: 0,
  },
  dropDivider: { borderTop: `1px solid ${T.borderLight}` },
  dropAction: {
    display: 'block', width: '100%', textAlign: 'left' as const,
    padding: '0.6rem 1rem', background: 'transparent', border: 'none',
    cursor: 'pointer', fontSize: '0.85rem', color: T.ink,
  },
}

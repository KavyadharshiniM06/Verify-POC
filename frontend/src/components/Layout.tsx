import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

const NAV = [
  { to: '/dashboard', label: '🏠 Dashboard' },
  { to: '/transactions', label: '📋 Transactions' },
  { to: '/transfers', label: '↔️ Transfers' },
  { to: '/profile', label: '👤 Profile' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()

  const handleLogout = async () => {
    try {
      const [{ data: logoutData }] = await Promise.all([
        api.get('/auth/sso/logout'),
        api.delete('/auth/session'),
      ])
      logout()
      window.location.href = logoutData.logout_url
    } catch {
      logout()
      window.location.href = '/'
    }
  }

  return (
    <div style={s.root}>
      <aside style={s.sidebar}>
        <div style={s.brand}>MockBank 🏦</div>
        <nav style={s.nav}>
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({ ...s.navLink, ...(isActive ? s.navActive : {}) })}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div style={s.sidebarFooter}>
          <div style={s.sidebarUser}>{user?.email}</div>
          <div style={s.sidebarRole}>{user?.role}</div>
        </div>
      </aside>

      <div style={s.main}>
        <header style={s.header}>
          <span style={s.greeting}>
            Welcome back, <strong>{user?.name}</strong>
          </span>
          <button style={s.logoutBtn} onClick={handleLogout}>
            Logout
          </button>
        </header>
        <main style={s.content}>{children}</main>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', minHeight: '100vh', background: '#f7f8fa' },
  sidebar: {
    width: '220px',
    background: '#1f2328',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  brand: {
    fontSize: '1.15rem',
    fontWeight: 700,
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid #30363d',
    color: '#fff',
    letterSpacing: '-0.01em',
  },
  nav: { display: 'flex', flexDirection: 'column', padding: '0.75rem 0', flex: 1 },
  navLink: {
    padding: '0.65rem 1.5rem',
    color: '#8b949e',
    textDecoration: 'none',
    fontSize: '0.875rem',
    fontWeight: 500,
    display: 'block',
    transition: 'color 0.15s',
  },
  navActive: {
    color: '#fff',
    background: '#30363d',
    borderLeft: '3px solid #3b82d4',
    paddingLeft: 'calc(1.5rem - 3px)',
  },
  sidebarFooter: { padding: '1rem 1.5rem', borderTop: '1px solid #30363d' },
  sidebarUser: { fontSize: '0.75rem', color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sidebarRole: { fontSize: '0.75rem', color: '#8b949e', marginTop: '0.25rem' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  header: {
    background: '#fff',
    borderBottom: '1px solid #e5e7eb',
    padding: '0.875rem 2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: { fontSize: '0.9rem', color: '#57606a' },
  logoutBtn: {
    padding: '0.4rem 0.875rem',
    background: 'transparent',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    color: '#57606a',
  },
  content: { flex: 1, padding: '1.75rem 2rem', overflowY: 'auto' as const },
}

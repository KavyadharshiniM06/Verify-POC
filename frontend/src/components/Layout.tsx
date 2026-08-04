// @refresh reset
import React, { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { T, LT } from '../styles/theme'

// ── SVG Icons (declared first — nav arrays reference them below) ──────────────
function LoanIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/><circle cx="8" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none"/></svg>
}
function UsersIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
}
function AppGridIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
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

// ── Nav arrays (declared AFTER icon functions so all refs are resolved) ───────
// Manager (Credit Analyst) landing = /loans  |  SalesforceManager landing = /access-dashboard
// /dashboard is a redirect-only route — no sidebar link needed.
const MANAGER_NAV = [
  { to: '/loans', label: 'Loan Approvals', icon: LoanIcon },
]

const ADMIN_NAV = [
  { to: '/admin/users',    label: 'Identity Management', icon: UsersIcon },
  { to: '/admin/security', label: 'Security',            icon: ShieldIcon },
  { to: '/admin/settings', label: 'Settings',            icon: GearIcon },
]

const OTHERS_NAV = [
  { to: '/security', label: 'Security', icon: ShieldIcon },
  { to: '/settings', label: 'Settings', icon: GearIcon },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const isAdmin = user?.role === 'Admin'
  const isSFMgr = user?.role === 'SalesforceManager'

  // Select token set: Admin/HR portal uses dark theme; Manager portal uses light theme
  const C = isAdmin ? T : LT

  const [dropOpen,  setDropOpen]  = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const dropRef  = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  const initial = (user?.name?.split(' ').map(w => w[0]).join('') ?? '?').slice(0, 2).toUpperCase()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current  && !dropRef.current.contains(e.target  as Node)) setDropOpen(false)
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
    { id: 1, icon: '⚠', title: 'Large purchase alert',  body: '₹1,299 at Apple Store on card ••0044',    time: '2h ago', unread: true  },
    { id: 2, icon: 'ℹ', title: 'Transfer completed',    body: '₹2,000 moved to High-Yield Savings',       time: '3d ago', unread: false },
    { id: 3, icon: 'ℹ', title: 'New sign-in detected',  body: 'Login from MacBook Pro · New York',        time: '2d ago', unread: true  },
  ]
  const unreadCount = notifications.filter(n => n.unread).length

  // ── Role display label (frontend-only rename: Manager → Credit Analyst) ──
  const roleLabel =
    user?.role === 'Admin'             ? 'Overall Administrator' :
    user?.role === 'SalesforceManager' ? 'Salesforce Admin'      :
    user?.role === 'Manager'           ? 'Credit Analyst'        :
    user?.role ?? ''

  // ── Dynamic styles built from the active token set ───────────────────────
  const sidebar: React.CSSProperties = {
    width: '220px',
    background: C.bgSidebar,
    borderRight: `1px solid ${C.border}`,
    display: 'flex', flexDirection: 'column', flexShrink: 0,
    padding: '0',
    position: 'sticky', top: 0,
    height: '100vh',
    overflowY: 'auto',
    // For the light portal, add a subtle right shadow instead of a hard border
    ...(!isAdmin ? { boxShadow: '2px 0 8px rgba(0,0,0,0.06)' } : {}),
  }

  const brand: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '0.65rem',
    padding: '1.25rem 1.25rem 1rem',
    borderBottom: `1px solid ${C.border}`,
    marginBottom: '0.5rem',
  }

  const brandIconBg = isAdmin ? T.amber : '#1d4ed8'  // amber for admin, indigo for analyst

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: C.fontFamily, color: C.ink }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={sidebar}>
        {/* Brand */}
        <div style={brand}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '8px',
            background: brandIconBg, color: '#ffffff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '1rem', flexShrink: 0,
          }}>{initial.charAt(0)}</div>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{isAdmin ? 'PeopleHub' : 'MockBank'}</div>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: C.inkLight, letterSpacing: '0.12em' }}>
              {isAdmin ? 'HR ADMIN PORTAL' : 'ANALYST PORTAL'}
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '0.25rem 0.75rem', overflowY: 'auto' as const }}>
          {isAdmin ? (
            // ── Admin: Workforce Identity Management portal ───────────────
            <>
              <div style={{
                fontSize: '0.6rem', fontWeight: 700, color: C.inkLight,
                letterSpacing: '0.1em', padding: '0.75rem 0.5rem 0.35rem',
                textTransform: 'uppercase' as const,
              }}>ADMIN</div>
              {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.52rem 0.75rem', color: isActive ? C.ink : C.inkSub,
                    textDecoration: 'none', fontSize: '0.875rem', fontWeight: isActive ? 600 : 500,
                    borderRadius: '8px', transition: 'background 0.12s',
                    margin: '1px 0', position: 'relative' as const,
                    background: isActive ? C.bgCard : 'transparent',
                  })}>
                  {({ isActive }) => (
                    <>
                      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: isActive ? C.amber : C.inkSub }}><Icon /></span>
                      <span>{label}</span>
                      {isActive && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.amber, marginLeft: 'auto', flexShrink: 0 }} />}
                    </>
                  )}
                </NavLink>
              ))}
            </>
          ) : (
            // ── Manager (Credit Analyst) / SalesforceManager: workforce nav ──
            <>
              <div style={{
                fontSize: '0.6rem', fontWeight: 700, color: C.inkLight,
                letterSpacing: '0.1em', padding: '0.75rem 0.5rem 0.35rem',
                textTransform: 'uppercase' as const,
              }}>WORKSPACE</div>
              {MANAGER_NAV.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.52rem 0.75rem', color: isActive ? C.ink : C.inkSub,
                    textDecoration: 'none', fontSize: '0.875rem', fontWeight: isActive ? 600 : 500,
                    borderRadius: '8px', transition: 'background 0.12s',
                    margin: '1px 0', position: 'relative' as const,
                    background: isActive ? C.bgMuted : 'transparent',
                  })}>
                  {({ isActive }) => (
                    <>
                      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: isActive ? C.amber : C.inkSub }}><Icon /></span>
                      <span>{label}</span>
                      {isActive && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.amber, marginLeft: 'auto', flexShrink: 0 }} />}
                    </>
                  )}
                </NavLink>
              ))}

              {/* Salesforce Launchpad — SalesforceManager only */}
              {isSFMgr && (
                <>
                  <div style={{
                    fontSize: '0.6rem', fontWeight: 700, color: C.inkLight,
                    letterSpacing: '0.1em', padding: '0.75rem 0.5rem 0.35rem',
                    textTransform: 'uppercase' as const, marginTop: '1.5rem',
                  }}>MY APPS</div>
                  <NavLink to="/access-dashboard"
                    style={({ isActive }) => ({
                      display: 'flex', alignItems: 'center', gap: '0.6rem',
                      padding: '0.52rem 0.75rem', color: isActive ? C.ink : C.inkSub,
                      textDecoration: 'none', fontSize: '0.875rem', fontWeight: isActive ? 600 : 500,
                      borderRadius: '8px', transition: 'background 0.12s',
                      margin: '1px 0', position: 'relative' as const,
                      background: isActive ? C.bgMuted : 'transparent',
                    })}>
                    {({ isActive }) => (
                      <>
                        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: isActive ? C.amber : C.inkSub }}><AppGridIcon /></span>
                        <span>Salesforce Launchpad</span>
                        {isActive && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.amber, marginLeft: 'auto', flexShrink: 0 }} />}
                        <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: '#10b981', fontWeight: 700 }}>☁</span>
                      </>
                    )}
                  </NavLink>
                </>
              )}

              <div style={{
                fontSize: '0.6rem', fontWeight: 700, color: C.inkLight,
                letterSpacing: '0.1em', padding: '0.75rem 0.5rem 0.35rem',
                textTransform: 'uppercase' as const, marginTop: '1.5rem',
              }}>ACCOUNT</div>
              {OTHERS_NAV.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.52rem 0.75rem', color: isActive ? C.ink : C.inkSub,
                    textDecoration: 'none', fontSize: '0.875rem', fontWeight: isActive ? 600 : 500,
                    borderRadius: '8px', transition: 'background 0.12s',
                    margin: '1px 0', position: 'relative' as const,
                    background: isActive ? C.bgMuted : 'transparent',
                  })}>
                  {({ isActive }) => (
                    <>
                      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: isActive ? C.amber : C.inkSub }}><Icon /></span>
                      <span>{label}</span>
                      {isActive && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.amber, marginLeft: 'auto', flexShrink: 0 }} />}
                    </>
                  )}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Bottom help card */}
        <div style={{
          margin: '0.75rem',
          background: C.bgCard, border: `1px solid ${C.border}`,
          borderRadius: '10px', padding: '1rem',
        }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: C.inkLight, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '0.2rem' }}>Support</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: C.ink, marginBottom: '0.75rem' }}>{isAdmin ? 'PeopleHub Help Centre' : 'MockBank Help Centre'}</div>
          <button
            style={{
              width: '100%', padding: '0.5rem',
              background: isAdmin ? T.amber : '#1d4ed8',
              color: '#ffffff',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem',
            }}
            onClick={() => navigate('/settings')}>Account settings</button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Top bar */}
        <header style={{
          background: C.bgSidebar, borderBottom: `1px solid ${C.border}`,
          padding: '0.75rem 1.75rem',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Notifications bell */}
            <div style={{ position: 'relative' }} ref={notifRef}>
              <button style={{
                position: 'relative' as const,
                width: '34px', height: '34px', borderRadius: '8px',
                background: C.bgCard, border: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: C.inkSub,
              }} onClick={() => setNotifOpen(v => !v)}>
                <BellIcon />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute' as const, top: '-5px', right: '-5px',
                    minWidth: '18px', height: '18px', borderRadius: '999px',
                    background: C.red, color: '#fff',
                    fontSize: '0.65rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `2px solid ${C.bgSidebar}`, padding: '0 3px',
                  }}>{unreadCount}</span>
                )}
              </button>
              {notifOpen && (
                <div style={{
                  position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0,
                  background: '#ffffff', border: '1px solid #e5e7eb',
                  borderRadius: '10px', boxShadow: C.shadowPop,
                  width: '320px', zIndex: 200, overflow: 'hidden',
                }}>
                  <div style={{ padding: '0.85rem 1rem 0.6rem', fontSize: '0.82rem', fontWeight: 700, color: '#111827', borderBottom: '1px solid #e5e7eb' }}>Notifications</div>
                  {notifications.map(n => (
                    <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 1rem', background: n.unread ? '#f0f4ff' : 'transparent', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                      <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 }}>{n.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.83rem', fontWeight: 600, color: '#111827' }}>{n.title}</div>
                        <div style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '0.1rem' }}>{n.body}</div>
                        <div style={{ fontSize: '0.7rem',  color: '#9ca3af', marginTop: '0.2rem' }}>{n.time}</div>
                      </div>
                      {n.unread && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: C.amber, flexShrink: 0, marginTop: '5px' }} />}
                    </div>
                  ))}
                  <div style={{ padding: '0.6rem 1rem', borderTop: '1px solid #e5e7eb' }}>
                    <button style={{ background: 'none', border: 'none', color: C.amber, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: 0 }} onClick={() => { setNotifOpen(false); navigate('/notifications') }}>
                      View all notifications →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User menu */}
            <div style={{ position: 'relative' }} ref={dropRef}>
              <button style={{
                display: 'flex', alignItems: 'center', gap: '0.65rem',
                padding: '0.4rem 0.75rem 0.4rem 0.5rem',
                background: C.bgCard, border: `1px solid ${C.border}`,
                borderRadius: '8px', cursor: 'pointer',
              }} onClick={() => setDropOpen(v => !v)}>
                <div style={{ textAlign: 'right' as const }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: C.ink }}>{user?.name}</div>
                  <div style={{ fontSize: '0.65rem', color: C.inkSub, marginTop: '0.05rem' }}>{roleLabel}</div>
                </div>
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%',
                  background: isAdmin ? T.amber : '#1d4ed8', color: '#ffffff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: '0.72rem', flexShrink: 0,
                }}>{initial}</div>
                <span style={{ color: C.inkSub, fontSize: '0.7rem' }}>▾</span>
              </button>
              {dropOpen && (
                <div style={{
                  position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0,
                  background: '#ffffff', border: '1px solid #e5e7eb',
                  borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                  width: '240px', zIndex: 200, overflow: 'hidden',
                }}>
                  <div style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#f7f8fa', borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      background: isAdmin ? T.amber : '#1d4ed8', color: '#ffffff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.9rem', fontWeight: 800, flexShrink: 0,
                    }}>{initial}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                      <div style={{ fontSize: '0.72rem', color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
                      <span style={{
                        display: 'inline-block', marginTop: '0.3rem',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' as const,
                        letterSpacing: '0.06em', padding: '0.15rem 0.45rem',
                        background: C.amberLight, color: C.amber, border: `1px solid ${C.amberBorder}`,
                        borderRadius: '999px',
                      }}>{roleLabel}</span>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid #f0f0f0' }} />
                  <button style={{ display: 'block', width: '100%', textAlign: 'left' as const, padding: '0.6rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#111827' }} onClick={() => { setDropOpen(false); navigate('/settings') }}>Settings</button>
                  <div style={{ borderTop: '1px solid #f0f0f0' }} />
                  <button style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left' as const, padding: '0.6rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#dc2626' }} onClick={handleLogout}>
                    <LogoutIcon /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '1.75rem', overflowY: 'auto' as const, background: C.bg }}>{children}</main>
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import { T } from '../styles/theme'

type Category = 'All' | 'Unread' | 'Transactions' | 'Security' | 'Transfers' | 'Identity' | 'Approvals'

interface Notification {
  id: number
  category: Exclude<Category, 'All' | 'Unread'>
  title: string
  body: string
  time: string
  unread: boolean
}

const MOCK: Notification[] = [
  { id: 1,  category: 'Transfers',    title: 'Transfer Completed',          body: 'Your transfer of $250.00 to Alice Johnson was successful.',       time: '2 minutes ago',  unread: true  },
  { id: 2,  category: 'Security',     title: 'New Sign-In Detected',        body: 'A sign-in was recorded from Chrome on macOS.',                    time: '1 hour ago',     unread: true  },
  { id: 3,  category: 'Transactions', title: 'Direct Deposit Received',     body: 'A deposit of $3,200.00 has been credited to your account.',        time: '3 hours ago',    unread: false },
  { id: 4,  category: 'Identity',     title: 'Account Activated',           body: 'Your account has been activated by the administrator.',           time: '1 day ago',      unread: false },
  { id: 5,  category: 'Approvals',    title: 'Step-Up Auth Required',       body: 'A transfer over $100 required MFA verification.',                 time: '1 day ago',      unread: false },
  { id: 6,  category: 'Security',     title: 'MFA Method Enrolled',         body: 'A passkey (FIDO2) was successfully enrolled on your account.',    time: '2 days ago',     unread: false },
  { id: 7,  category: 'Transactions', title: 'Transaction Declined',        body: 'A payment of $75.00 was declined due to insufficient funds.',      time: '3 days ago',     unread: false },
  { id: 8,  category: 'Transfers',    title: 'Pending Transfer',            body: 'Transfer of $500.00 to Bob Smith is pending review.',             time: '4 days ago',     unread: false },
]

const CATEGORIES: Category[] = ['All', 'Unread', 'Transactions', 'Security', 'Transfers', 'Identity', 'Approvals']

const CATEGORY_COLORS: Record<Exclude<Category, 'All' | 'Unread'>, string> = {
  Transactions: T.blue,
  Security:     T.red,
  Transfers:    '#7c5cd8',
  Identity:     T.green,
  Approvals:    T.amber,
}

export default function NotificationsPage() {
  const [active, setActive] = useState<Category>('All')
  const [items, setItems]   = useState<Notification[]>(MOCK)

  const filtered = items.filter(n => {
    if (active === 'All')    return true
    if (active === 'Unread') return n.unread
    return n.category === active
  })

  const unreadTotal = items.filter(n => n.unread).length

  const markAllRead = () => setItems(prev => prev.map(n => ({ ...n, unread: false })))
  const markRead    = (id: number) => setItems(prev => prev.map(n => n.id === id ? { ...n, unread: false } : n))

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Notifications</h1>
          <p style={s.pageSub}>{unreadTotal} unread notification{unreadTotal !== 1 ? 's' : ''}</p>
        </div>
        {unreadTotal > 0 && (
          <button style={s.markAllBtn} onClick={markAllRead}>Mark all as read</button>
        )}
      </div>

      <div style={s.body}>
        {/* Sidebar */}
        <aside style={s.sidebar}>
          {CATEGORIES.map(cat => {
            const count = cat === 'All' ? items.length
              : cat === 'Unread' ? unreadTotal
              : items.filter(n => n.category === cat).length
            return (
              <button
                key={cat}
                style={{ ...s.catBtn, ...(active === cat ? s.catBtnActive : {}) }}
                onClick={() => setActive(cat)}
              >
                <span>{cat}</span>
                <span style={{ ...s.catCount, ...(active === cat ? s.catCountActive : {}) }}>{count}</span>
              </button>
            )
          })}
        </aside>

        {/* List */}
        <div style={s.list}>
          {filtered.length === 0 ? (
            <div style={s.empty}>No notifications in this category.</div>
          ) : (
            filtered.map(n => (
              <div
                key={n.id}
                style={{ ...s.item, background: n.unread ? T.bgHighlight : T.bgCard }}
                onClick={() => markRead(n.id)}
              >
                <div style={s.itemTop}>
                  <span style={{
                    ...s.catTag,
                    background: CATEGORY_COLORS[n.category] + '18',
                    color: CATEGORY_COLORS[n.category],
                    border: `1px solid ${CATEGORY_COLORS[n.category]}33`,
                  }}>
                    {n.category}
                  </span>
                  <span style={s.itemTime}>{n.time}</span>
                  {n.unread && <span style={s.unreadDot} />}
                </div>
                <div style={s.itemTitle}>{n.title}</div>
                <div style={s.itemBody}>{n.body}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { fontFamily: T.fontFamily },
  pageHeader:   { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' },
  pageTitle:    { fontSize: '1.5rem', fontWeight: 800, color: T.ink, margin: 0, letterSpacing: '-0.02em' },
  pageSub:      { fontSize: '0.82rem', color: T.inkSub, marginTop: '0.25rem' },
  markAllBtn: {
    padding: '0.45rem 1.1rem', background: T.ink, color: T.bg,
    border: 'none', borderRadius: T.radiusPill, cursor: 'pointer',
    fontSize: '0.82rem', fontWeight: 700,
  },

  body:     { display: 'flex', gap: '1.25rem', alignItems: 'flex-start' },

  sidebar: {
    width: '180px', flexShrink: 0, background: T.bgCard,
    border: `1px solid ${T.border}`, borderRadius: T.radiusCard,
    boxShadow: T.shadowCard,
    padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '2px',
  },
  catBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.55rem 0.75rem', background: 'transparent', border: 'none',
    borderRadius: '10px', cursor: 'pointer', fontSize: '0.84rem', color: T.inkSub,
    fontWeight: 500, width: '100%', textAlign: 'left' as const,
  },
  catBtnActive: { background: T.amberLight, color: T.amber, fontWeight: 700 },
  catCount: {
    fontSize: '0.7rem', background: T.bgMuted, color: T.inkSub,
    padding: '0.1rem 0.45rem', borderRadius: '999px', fontWeight: 700,
  },
  catCountActive: { background: T.amberBorder, color: T.amber },

  list:  { flex: 1, display: 'flex', flexDirection: 'column', gap: '0.65rem' },
  empty: {
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusCard,
    padding: '2.5rem', textAlign: 'center' as const, color: T.inkSub, fontSize: '0.9rem',
    boxShadow: T.shadowCard,
  },

  item: {
    border: `1px solid ${T.border}`, borderRadius: T.radiusInner,
    padding: '1rem 1.25rem', cursor: 'pointer',
    boxShadow: T.shadowCard,
  },
  itemTop:  { display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' },
  catTag: {
    fontSize: '0.66rem', fontWeight: 700, padding: '0.12rem 0.5rem',
    borderRadius: '999px', letterSpacing: '0.04em',
  },
  itemTime:  { fontSize: '0.72rem', color: T.inkLight, marginLeft: 'auto' },
  unreadDot: { width: '7px', height: '7px', borderRadius: '50%', background: T.amber, flexShrink: 0 },
  itemTitle: { fontSize: '0.9rem', fontWeight: 700, color: T.ink, marginBottom: '0.2rem' },
  itemBody:  { fontSize: '0.82rem', color: T.inkSub, lineHeight: 1.55 },
}

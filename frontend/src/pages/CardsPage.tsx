import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { T } from '../styles/theme'

interface Account {
  id: number
  type: string
  account_number: string
  balance: number
  currency: string
}

interface Transaction {
  id: number
  account_id: number
  amount: number
  description: string
  category: string
  merchant: string
  date: string
  type: string
}

// Deterministic card colour per account index
const CARD_GRADIENTS = [
  { from: '#1a1a2e', to: '#16213e', accent: T.amber },
  { from: '#0f2027', to: '#203a43', accent: '#58a6ff' },
  { from: '#1a0533', to: '#2d1b4e', accent: '#a78bfa' },
  { from: '#0a1628', to: '#1e3a5f', accent: '#3fb950' },
]

const CARD_TYPES: Record<string, { label: string; network: string }> = {
  checking:  { label: 'Debit Card',   network: 'Visa'       },
  savings:   { label: 'Savings Card', network: 'Mastercard' },
  credit:    { label: 'Credit Card',  network: 'Visa'       },
  default:   { label: 'Bank Card',    network: 'Visa'       },
}

function maskNumber(acct: string) {
  const last4 = acct.slice(-4)
  return `•••• •••• •••• ${last4}`
}

function getExpiry(id: number) {
  // deterministic fake expiry from account id
  const month = String((id % 12) + 1).padStart(2, '0')
  const year  = 24 + (id % 5)
  return `${month}/${year}`
}

function NetworkLogo({ network }: { network: string }) {
  if (network === 'Mastercard') {
    return (
      <svg width="38" height="24" viewBox="0 0 38 24">
        <circle cx="15" cy="12" r="10" fill="#eb001b" opacity="0.9"/>
        <circle cx="23" cy="12" r="10" fill="#f79e1b" opacity="0.9"/>
        <path d="M19 4.8a10 10 0 0 1 0 14.4A10 10 0 0 1 19 4.8z" fill="#ff5f00" opacity="0.9"/>
      </svg>
    )
  }
  return (
    <svg width="48" height="16" viewBox="0 0 48 16">
      <text x="0" y="13" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="14" fill="white" opacity="0.9" letterSpacing="-0.5">VISA</text>
    </svg>
  )
}

function ChipIcon() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28">
      <rect x="0" y="0" width="36" height="28" rx="4" fill="#d4a843" opacity="0.85"/>
      <rect x="12" y="0" width="12" height="28" fill="#c49a30" opacity="0.5"/>
      <rect x="0" y="8" width="36" height="12" fill="#c49a30" opacity="0.5"/>
      <rect x="12" y="8" width="12" height="12" rx="2" fill="#b8860b" opacity="0.7"/>
    </svg>
  )
}

function CardFace({ account, index, flipped }: { account: Account; index: number; flipped: boolean }) {
  const grad = CARD_GRADIENTS[index % CARD_GRADIENTS.length]
  const meta = CARD_TYPES[account.type] ?? CARD_TYPES.default
  const { user } = useAuth()

  return (
    <div style={{
      width: '100%', height: '200px', borderRadius: '16px',
      background: `linear-gradient(135deg, ${grad.from} 0%, ${grad.to} 100%)`,
      border: `1px solid ${grad.accent}22`,
      boxShadow: `0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 ${grad.accent}22`,
      padding: '1.5rem', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      cursor: 'pointer', userSelect: 'none',
      transition: 'transform 0.15s',
    }}>
      {/* Decorative circles */}
      <div style={{ position: 'absolute', right: '-30px', top: '-30px', width: '140px', height: '140px', borderRadius: '50%', background: grad.accent, opacity: 0.06 }} />
      <div style={{ position: 'absolute', right: '20px', bottom: '-50px', width: '160px', height: '160px', borderRadius: '50%', background: grad.accent, opacity: 0.04 }} />

      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>MockBank</div>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{meta.label}</div>
        </div>
        <ChipIcon />
      </div>

      {/* Card number */}
      {!flipped ? (
        <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.18em', position: 'relative' }}>
          {maskNumber(account.account_number)}
        </div>
      ) : (
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', position: 'relative', display: 'flex', gap: '1rem' }}>
          <div><div style={{ fontSize: '0.58rem', opacity: 0.6, marginBottom: '0.1rem' }}>CVV</div><div style={{ fontWeight: 700, color: 'white', letterSpacing: '0.2em' }}>•••</div></div>
          <div><div style={{ fontSize: '0.58rem', opacity: 0.6, marginBottom: '0.1rem' }}>EXPIRES</div><div style={{ fontWeight: 700, color: 'white' }}>{getExpiry(account.id)}</div></div>
        </div>
      )}

      {/* Bottom row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative' }}>
        <div>
          <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', marginBottom: '0.15rem' }}>CARD HOLDER</div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {user?.name?.toUpperCase() ?? 'ACCOUNT HOLDER'}
          </div>
        </div>
        <NetworkLogo network={meta.network} />
      </div>
    </div>
  )
}

export default function CardsPage() {
  const navigate = useNavigate()
  const [accounts, setAccounts]     = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(0)
  const [flipped, setFlipped]       = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<Account[]>('/banking/accounts'),
      api.get<Transaction[]>('/banking/transactions?limit=8'),
    ])
      .then(([a, t]) => { setAccounts(a.data); setTransactions(t.data) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '3rem', color: T.inkSub }}>Loading…</div>

  const card = accounts[selected]
  const cardTxns = transactions.filter(t => card && t.account_id === card.id)

  const QUICK_ACTIONS = [
    { label: 'Freeze Card',    icon: <FreezeIcon />,   color: T.blue },
    { label: 'Set Limit',      icon: <LimitIcon />,    color: T.amber },
    { label: 'New Transfer',   icon: <SendIcon />,     color: T.green, action: () => navigate('/transfers') },
    { label: 'View Statement', icon: <StmtIcon />,     color: '#a78bfa', action: () => navigate('/transactions') },
  ]

  return (
    <div style={s.root}>
      {/* ── Page header ── */}
      <div style={s.pageHead}>
        <div>
          <h1 style={s.pageTitle}>Cards</h1>
          <p style={s.pageSub}>Manage your MockBank cards, limits, and recent activity.</p>
        </div>
      </div>

      <div style={s.layout}>
        {/* ── Left column ── */}
        <div style={s.leftCol}>

          {/* Card selector tabs */}
          <div style={s.cardTabs}>
            {accounts.map((a, i) => (
              <button
                key={a.id}
                style={{ ...s.cardTab, ...(selected === i ? s.cardTabActive : {}) }}
                onClick={() => { setSelected(i); setFlipped(false) }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {(CARD_TYPES[a.type] ?? CARD_TYPES.default).label}
                </span>
                <span style={{ fontSize: '0.68rem', color: selected === i ? T.amber : T.inkLight }}>
                  ••{a.account_number.slice(-4)}
                </span>
              </button>
            ))}
          </div>

          {/* Card visual */}
          {card && (
            <div onClick={() => setFlipped(v => !v)} title="Click to flip">
              <CardFace account={card} index={selected} flipped={flipped} />
              <div style={s.flipHint}>Click card to {flipped ? 'show front' : 'show details'}</div>
            </div>
          )}

          {/* Balance strip */}
          {card && (
            <div style={s.balanceStrip}>
              <div>
                <div style={s.balanceLabel}>Available Balance</div>
                <div style={s.balanceValue}>
                  {card.balance < 0 ? '-' : ''}${Math.abs(card.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  <span style={s.balanceCcy}>{card.currency ?? 'USD'}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={s.balanceLabel}>Account</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: T.ink }}>
                  {(CARD_TYPES[card.type] ?? CARD_TYPES.default).label}
                </div>
                <div style={{ fontSize: '0.72rem', color: T.inkSub, marginTop: '0.1rem' }}>
                  ••••{card.account_number.slice(-4)}
                </div>
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div style={s.actionsGrid}>
            {QUICK_ACTIONS.map(a => (
              <button key={a.label} style={s.actionBtn} onClick={a.action ?? undefined}>
                <div style={{ ...s.actionIcon, color: a.color, background: a.color + '18' }}>{a.icon}</div>
                <div style={s.actionLabel}>{a.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={s.rightCol}>

          {/* Card details */}
          {card && (
            <div style={s.detailCard}>
              <div style={s.detailTitle}>Card Details</div>
              <div style={s.detailRows}>
                {[
                  { label: 'Card Type',    value: (CARD_TYPES[card.type] ?? CARD_TYPES.default).label },
                  { label: 'Network',      value: (CARD_TYPES[card.type] ?? CARD_TYPES.default).network },
                  { label: 'Card Number',  value: maskNumber(card.account_number) },
                  { label: 'Expires',      value: getExpiry(card.id) },
                  { label: 'Status',       value: 'Active', highlight: T.green },
                  { label: 'Daily Limit',  value: '$5,000.00' },
                  { label: 'Online Txns',  value: 'Enabled', highlight: T.green },
                  { label: 'Contactless',  value: 'Enabled', highlight: T.green },
                ].map(row => (
                  <div key={row.label} style={s.detailRow}>
                    <span style={s.detailLabel}>{row.label}</span>
                    <span style={{ ...s.detailValue, ...(row.highlight ? { color: row.highlight, fontWeight: 700 } : {}) }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent transactions */}
          <div style={s.detailCard}>
            <div style={s.detailTitleRow}>
              <div style={s.detailTitle}>Recent Transactions</div>
              <button style={s.viewAllBtn} onClick={() => navigate('/transactions')}>View all →</button>
            </div>
            {cardTxns.length === 0 ? (
              <div style={{ color: T.inkSub, fontSize: '0.85rem', padding: '0.75rem 0' }}>No recent transactions for this card.</div>
            ) : (
              <div style={s.txnList}>
                {cardTxns.map((tx, i) => {
                  const isCredit = tx.type === 'credit'
                  return (
                    <div key={tx.id} style={{ ...s.txnRow, borderBottom: i < cardTxns.length - 1 ? `1px solid ${T.borderLight}` : 'none' }}>
                      <div style={{ ...s.txnIcon, background: isCredit ? T.greenLight : T.bgMuted, color: isCredit ? T.green : T.inkSub }}>
                        {isCredit ? <ArrowDownIcon /> : <ArrowUpIcon />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.txnMerchant}>{tx.merchant}</div>
                        <div style={s.txnMeta}>
                          {tx.category} · {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      <div style={{ ...s.txnAmt, color: isCredit ? T.green : T.ink }}>
                        {isCredit ? '+' : '-'}${tx.amount.toFixed(2)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Spending this month */}
          <div style={s.detailCard}>
            <div style={s.detailTitle}>Spending Breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
              {[
                { label: 'Groceries',    pct: 38, color: T.green  },
                { label: 'Dining',       pct: 24, color: T.amber  },
                { label: 'Transport',    pct: 18, color: T.blue   },
                { label: 'Shopping',     pct: 12, color: '#a78bfa' },
                { label: 'Other',        pct: 8,  color: T.inkSub },
              ].map(cat => (
                <div key={cat.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.78rem', color: T.inkSub }}>{cat.label}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: T.ink }}>{cat.pct}%</span>
                  </div>
                  <div style={{ height: '5px', background: T.bgMuted, borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${cat.pct}%`, background: cat.color, borderRadius: '99px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Inline SVG icons ───────────────────────────────────────────────────────────
function ArrowUpIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
}
function ArrowDownIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
}
function FreezeIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
}
function LimitIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
}
function SendIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
}
function StmtIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: { fontFamily: T.fontFamily },

  pageHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' },
  pageTitle: { fontSize: '1.55rem', fontWeight: 800, color: T.ink, margin: 0, letterSpacing: '-0.03em' },
  pageSub: { fontSize: '0.82rem', color: T.inkSub, marginTop: '0.25rem' },

  layout: { display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem', alignItems: 'start' },

  leftCol:  { display: 'flex', flexDirection: 'column', gap: '1rem' },
  rightCol: { display: 'flex', flexDirection: 'column', gap: '1rem' },

  cardTabs: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const },
  cardTab: {
    display: 'flex', flexDirection: 'column', gap: '0.15rem',
    padding: '0.5rem 0.85rem', borderRadius: T.radiusInner,
    background: T.bgCard, border: `1px solid ${T.border}`,
    cursor: 'pointer', color: T.inkSub, transition: 'all 0.12s',
    fontFamily: T.fontFamily,
  },
  cardTabActive: {
    background: T.bgHighlight, border: `1px solid ${T.amberBorder}`, color: T.ink,
  },

  flipHint: {
    fontSize: '0.68rem', color: T.inkLight, textAlign: 'center' as const,
    marginTop: '0.5rem', letterSpacing: '0.02em',
  },

  balanceStrip: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: T.radiusCard, padding: '1.1rem 1.25rem',
    boxShadow: T.shadowCard,
  },
  balanceLabel: { fontSize: '0.65rem', fontWeight: 700, color: T.inkLight, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '0.35rem' },
  balanceValue: { fontSize: '1.7rem', fontWeight: 800, color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.1, display: 'flex', alignItems: 'baseline', gap: '0.35rem' },
  balanceCcy: { fontSize: '0.75rem', fontWeight: 600, color: T.inkSub },

  actionsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem' },
  actionBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem',
    padding: '0.85rem 0.4rem', background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: T.radiusInner, cursor: 'pointer', fontFamily: T.fontFamily,
    transition: 'background 0.1s',
  },
  actionIcon: {
    width: '36px', height: '36px', borderRadius: '10px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: '0.68rem', fontWeight: 600, color: T.inkSub, textAlign: 'center' as const, lineHeight: 1.3 },

  detailCard: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: T.radiusCard, padding: '1.25rem 1.4rem',
    boxShadow: T.shadowCard,
  },
  detailTitle: { fontSize: '0.88rem', fontWeight: 700, color: T.ink, marginBottom: '1rem', letterSpacing: '-0.01em' },
  detailTitleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  detailRows: { display: 'flex', flexDirection: 'column', gap: '0' },
  detailRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.6rem 0', borderBottom: `1px solid ${T.borderLight}`,
  },
  detailLabel: { fontSize: '0.8rem', color: T.inkSub },
  detailValue: { fontSize: '0.82rem', color: T.ink, fontWeight: 500 },

  viewAllBtn: {
    background: 'none', border: 'none', color: T.amber,
    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
    padding: 0, fontFamily: T.fontFamily,
  },

  txnList: { display: 'flex', flexDirection: 'column' },
  txnRow: { display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.7rem 0' },
  txnIcon: {
    width: '32px', height: '32px', borderRadius: '8px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  txnMerchant: { fontSize: '0.84rem', fontWeight: 600, color: T.ink },
  txnMeta: { fontSize: '0.72rem', color: T.inkSub, marginTop: '0.1rem' },
  txnAmt: { fontSize: '0.88rem', fontWeight: 700, flexShrink: 0 },
}

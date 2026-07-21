import React, { useEffect, useState } from 'react'
import api from '../api/axios'
import { T } from '../styles/theme'

interface Customer { id: number; name: string; email: string }

interface AllTransaction {
  id: number
  amount: number
  description: string
  category: string
  merchant: string
  date: string
  type: string
  user_name: string
  user_email: string
  account_number: string
  account_type: string
}

const CATEGORIES = [
  'All', 'Food & Dining', 'Shopping', 'Transport',
  'Entertainment', 'Bills & Utilities', 'Health', 'Income', 'Transfer',
]

export default function AllTransactionsPage() {
  const [transactions, setTransactions] = useState<AllTransaction[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load customer list for the filter dropdown
  useEffect(() => {
    api.get<Customer[]>('/banking/customers').then(r => setCustomers(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', '30')
    if (selectedUser !== 'all') params.set('user_id', selectedUser)
    if (selectedCategory !== 'All') params.set('category', selectedCategory)
    api.get<AllTransaction[]>(`/banking/all-transactions?${params.toString()}`)
      .then(r => setTransactions(r.data))
      .catch(() => setError('Failed to load transactions.'))
      .finally(() => setLoading(false))
  }, [page, selectedUser, selectedCategory])

  return (
    <div>
      <h2 style={s.heading}>Customer Transactions</h2>

      <div style={s.filters}>
        <select
          style={s.select}
          value={selectedUser}
          onChange={e => { setSelectedUser(e.target.value); setPage(1) }}
        >
          <option value="all">All Customers</option>
          {customers.map(c => (
            <option key={c.id} value={String(c.id)}>{c.name} — {c.email}</option>
          ))}
        </select>
        <select
          style={s.select}
          value={selectedCategory}
          onChange={e => { setSelectedCategory(e.target.value); setPage(1) }}
        >
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {error && <div style={s.err}>{error}</div>}

      {loading ? (
        <div style={s.loading}>Loading transactions...</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Customer</th>
                <th style={s.th}>Account</th>
                <th style={s.th}>Merchant</th>
                <th style={s.th}>Category</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, idx) => (
                <tr key={tx.id} style={{ ...s.tr, background: idx % 2 === 0 ? T.bgCard : T.bgMuted }}>
                  <td style={{ ...s.td, color: T.inkSub, fontSize: '0.8rem' }}>
                    {new Date(tx.date).toLocaleDateString()}
                  </td>
                  <td style={s.td}>
                    <div style={{ fontWeight: 500 }}>{tx.user_name}</div>
                    <div style={{ fontSize: '0.75rem', color: T.inkSub }}>{tx.user_email}</div>
                  </td>
                  <td style={{ ...s.td, fontSize: '0.8rem', color: T.inkSub }}>
                    {tx.account_type.charAt(0).toUpperCase() + tx.account_type.slice(1)}
                    {' '}•••• {tx.account_number.slice(-4)}
                  </td>
                  <td style={s.td}>{tx.merchant}</td>
                  <td style={s.td}><span style={s.badge}>{tx.category}</span></td>
                  <td style={{
                    ...s.td, textAlign: 'right', fontWeight: 600,
                    color: tx.type === 'credit' ? T.green : T.ink,
                  }}>
                    {tx.type === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <span style={{
                      ...s.badge,
                      color: tx.type === 'credit' ? T.green : T.inkSub,
                    }}>
                      {tx.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <div style={s.empty}>No transactions found for the selected filters.</div>
          )}
        </div>
      )}

      <div style={s.pagination}>
        <button style={s.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
          ← Prev
        </button>
        <span style={{ fontSize: '0.875rem', color: T.inkSub }}>Page {page}</span>
        <button style={s.pageBtn} onClick={() => setPage(p => p + 1)} disabled={transactions.length < 30}>
          Next →
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: T.ink },
  filters: { display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' },
  select: {
    padding: '0.5rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: T.radiusPill,
    fontSize: '0.875rem', background: T.bgCard, cursor: 'pointer', color: T.ink, outline: 'none',
  },
  loading: { padding: '2rem', color: T.inkSub },
  err: {
    background: T.redLight, border: `1px solid ${T.redBorder}`, color: T.red,
    borderRadius: T.radiusInner, padding: '0.6rem', fontSize: '0.85rem', marginBottom: '0.75rem',
  },
  tableWrap: { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusCard, overflow: 'hidden', boxShadow: T.shadowCard },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: {
    padding: '0.75rem', fontSize: '0.68rem', fontWeight: 700, color: T.inkSub,
    textAlign: 'left' as const, borderBottom: `1px solid ${T.border}`, background: T.bgMuted,
    textTransform: 'uppercase' as const, letterSpacing: '0.07em',
  },
  tr: { borderBottom: `1px solid ${T.borderLight}` },
  td: { padding: '0.75rem', fontSize: '0.875rem', color: T.ink },
  badge: {
    background: T.bgMuted, border: `1px solid ${T.border}`, borderRadius: '999px',
    padding: '0.15rem 0.5rem', fontSize: '0.75rem', color: T.inkSub,
  },
  empty: { padding: '2rem', textAlign: 'center' as const, color: T.inkSub },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' },
  pageBtn: {
    padding: '0.4rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: T.radiusPill,
    background: T.bgCard, cursor: 'pointer', fontSize: '0.875rem', color: T.ink,
  },
}

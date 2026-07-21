import React, { useEffect, useState } from 'react'
import api from '../api/axios'
import { T } from '../styles/theme'

interface Account {
  id: number
  type: string
  account_number: string
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

const CATEGORIES = [
  'All', 'Food & Dining', 'Shopping', 'Transport',
  'Entertainment', 'Bills & Utilities', 'Health', 'Income', 'Transfer',
]

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Account[]>('/banking/accounts')
      .then(r => setAccounts(r.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', '20')
    if (selectedAccount !== 'all') params.set('account_id', selectedAccount)
    if (selectedCategory !== 'All') params.set('category', selectedCategory)
    api.get<Transaction[]>(`/banking/transactions?${params.toString()}`)
      .then(r => setTransactions(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, selectedAccount, selectedCategory])

  return (
    <div>
      {/* Page header */}
      <div style={s.pageHeader}>
        <div>
          <h2 style={s.heading}>Transactions</h2>
          <p style={s.sub}>Your complete transaction history across all accounts</p>
        </div>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <div style={s.selectWrap}>
          <select
            style={s.select}
            value={selectedAccount}
            onChange={e => { setSelectedAccount(e.target.value); setPage(1) }}
          >
            <option value="all">All Accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={String(a.id)}>
                {a.type.charAt(0).toUpperCase() + a.type.slice(1)} •••• {a.account_number.slice(-4)}
              </option>
            ))}
          </select>
        </div>
        <div style={s.selectWrap}>
          <select
            style={s.select}
            value={selectedCategory}
            onChange={e => { setSelectedCategory(e.target.value); setPage(1) }}
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={s.loading}>Loading transactions…</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr style={s.headRow}>
                <th style={s.th}>Date</th>
                <th style={s.th}>Merchant</th>
                <th style={s.th}>Description</th>
                <th style={s.th}>Category</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, idx) => (
                <tr key={tx.id} style={{ ...s.tr, background: idx % 2 === 0 ? T.bgCard : T.bgMuted }}>
                  <td style={s.td}>{new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td style={{ ...s.td, fontWeight: 600 }}>{tx.merchant}</td>
                  <td style={{ ...s.td, color: T.inkSub, fontSize: '0.8rem' }}>{tx.description}</td>
                  <td style={s.td}><span style={s.catBadge}>{tx.category}</span></td>
                  <td style={{
                    ...s.td,
                    textAlign: 'right',
                    fontWeight: 700,
                    color: tx.type === 'credit' ? T.green : T.ink,
                  }}>
                    {tx.type === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <span style={{
                      ...s.typeBadge,
                      background: tx.type === 'credit' ? T.greenLight : T.bgMuted,
                      color: tx.type === 'credit' ? T.green : T.inkSub,
                      border: `1px solid ${tx.type === 'credit' ? T.greenBorder : T.border}`,
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

      {/* Pagination */}
      <div style={s.pagination}>
        <button
          style={{ ...s.pageBtn, ...(page === 1 ? s.pageBtnDisabled : {}) }}
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          ← Prev
        </button>
        <span style={{ fontSize: '0.82rem', color: T.inkSub, fontWeight: 600 }}>Page {page}</span>
        <button
          style={{ ...s.pageBtn, ...(transactions.length < 20 ? s.pageBtnDisabled : {}) }}
          onClick={() => setPage(p => p + 1)}
          disabled={transactions.length < 20}
        >
          Next →
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' },
  heading: { margin: '0 0 0.2rem', fontSize: '1.5rem', fontWeight: 800, color: T.ink, letterSpacing: '-0.02em' },
  sub: { margin: 0, fontSize: '0.82rem', color: T.inkSub },

  filters: { display: 'flex', gap: '0.65rem', marginBottom: '1.1rem', flexWrap: 'wrap' },
  selectWrap: { position: 'relative' as const },
  select: {
    padding: '0.55rem 1rem', border: `1px solid ${T.border}`, borderRadius: T.radiusPill,
    fontSize: '0.85rem', background: T.bgCard, cursor: 'pointer', color: T.ink,
    outline: 'none', appearance: 'none' as const, paddingRight: '1.75rem',
    boxShadow: T.shadowCard,
  },
  loading: { padding: '2.5rem 0', color: T.inkSub, fontSize: '0.9rem' },

  tableWrap: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: T.radiusCard, overflow: 'hidden',
    boxShadow: T.shadowCard,
  },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  headRow: { background: T.bgMuted },
  th: {
    padding: '0.7rem 0.85rem', fontSize: '0.68rem', fontWeight: 700, color: T.inkSub,
    textAlign: 'left' as const, borderBottom: `1px solid ${T.border}`,
    letterSpacing: '0.07em', textTransform: 'uppercase' as const,
  },
  tr: { borderBottom: `1px solid ${T.borderLight}` },
  td: { padding: '0.75rem 0.85rem', fontSize: '0.875rem', color: T.ink },
  catBadge: {
    background: T.bgMuted, border: `1px solid ${T.border}`, borderRadius: '999px',
    padding: '0.18rem 0.55rem', fontSize: '0.72rem', color: T.inkSub, fontWeight: 500,
  },
  typeBadge: {
    fontSize: '0.68rem', fontWeight: 700, padding: '0.18rem 0.55rem',
    borderRadius: '999px', letterSpacing: '0.03em',
  },
  empty: { padding: '2.5rem', textAlign: 'center' as const, color: T.inkSub, fontSize: '0.9rem' },

  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem' },
  pageBtn: {
    padding: '0.45rem 1rem', border: `1px solid ${T.border}`, borderRadius: T.radiusPill,
    background: T.bgCard, cursor: 'pointer', fontSize: '0.82rem', color: T.ink, fontWeight: 600,
    boxShadow: T.shadowCard,
  },
  pageBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' as const },
}

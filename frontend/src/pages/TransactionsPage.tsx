import React, { useEffect, useState } from 'react'
import api from '../api/axios'

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
      <h2 style={s.heading}>Transactions</h2>

      {/* Filters */}
      <div style={s.filters}>
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
        <select
          style={s.select}
          value={selectedCategory}
          onChange={e => { setSelectedCategory(e.target.value); setPage(1) }}
        >
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={s.loading}>Loading transactions...</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Merchant</th>
                <th style={s.th}>Description</th>
                <th style={s.th}>Category</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id} style={s.tr}>
                  <td style={s.td}>{new Date(tx.date).toLocaleDateString()}</td>
                  <td style={s.td}>{tx.merchant}</td>
                  <td style={{ ...s.td, color: '#57606a', fontSize: '0.8rem' }}>{tx.description}</td>
                  <td style={s.td}><span style={s.badge}>{tx.category}</span></td>
                  <td style={{
                    ...s.td,
                    textAlign: 'right',
                    fontWeight: 600,
                    color: tx.type === 'credit' ? '#10b981' : '#1f2328',
                  }}>
                    {tx.type === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <span style={{
                      ...s.badge,
                      color: tx.type === 'credit' ? '#10b981' : '#57606a',
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
          style={s.pageBtn}
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          ← Prev
        </button>
        <span style={{ fontSize: '0.875rem', color: '#57606a' }}>Page {page}</span>
        <button
          style={s.pageBtn}
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
  heading: { margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1f2328' },
  filters: { display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' },
  select: {
    padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '6px',
    fontSize: '0.875rem', background: '#fff', cursor: 'pointer',
  },
  loading: { padding: '2rem', color: '#57606a' },
  tableWrap: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '0.75rem', fontSize: '0.8rem', fontWeight: 600, color: '#57606a',
    textAlign: 'left', borderBottom: '1px solid #e5e7eb', background: '#f7f8fa',
  },
  tr: { borderBottom: '1px solid #f7f8fa' },
  td: { padding: '0.75rem', fontSize: '0.875rem', color: '#1f2328' },
  badge: {
    background: '#f7f8fa', border: '1px solid #e5e7eb', borderRadius: '999px',
    padding: '0.15rem 0.5rem', fontSize: '0.75rem', color: '#57606a',
  },
  empty: { padding: '2rem', textAlign: 'center', color: '#57606a' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' },
  pageBtn: {
    padding: '0.4rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '6px',
    background: '#fff', cursor: 'pointer', fontSize: '0.875rem',
  },
}

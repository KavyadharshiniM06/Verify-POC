import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import api from '../api/axios'

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

interface Summary {
  balance_trend: Array<{ date: string; balance: number }>
  spending_by_category: Array<{ category: string; total: number }>
  total_assets: number
  total_credit: number
}

const ACCOUNT_COLORS: Record<string, string> = {
  checking: '#3b82d4',
  savings: '#10b981',
  credit: '#f59e0b',
}

const PIE_COLORS = ['#3b82d4', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16']

function AccountCard({ account }: { account: Account }) {
  const negative = account.balance < 0
  return (
    <div style={{ ...s.card, borderTop: `4px solid ${ACCOUNT_COLORS[account.type] ?? '#3b82d4'}` }}>
      <div style={s.cardType}>{account.type.toUpperCase()}</div>
      <div style={s.cardNum}>•••• {account.account_number.slice(-4)}</div>
      <div style={{ ...s.cardBalance, color: negative ? '#ef4444' : '#1f2328' }}>
        {negative ? '-' : ''}$
        {Math.abs(account.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </div>
      <div style={s.cardCurrency}>{account.currency}</div>
    </div>
  )
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<Account[]>('/banking/accounts'),
      api.get<Summary>('/banking/summary'),
      api.get<Transaction[]>('/banking/transactions?limit=5'),
    ])
      .then(([accRes, sumRes, txRes]) => {
        setAccounts(accRes.data)
        setSummary(sumRes.data)
        setTransactions(txRes.data)
      })
      .catch(() => setError('Failed to load banking data.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={s.loading}>Loading your accounts...</div>
  if (error) return <div style={s.errBox}>{error}</div>

  return (
    <div>
      <h2 style={s.heading}>Overview</h2>

      {/* Account Cards */}
      <div style={s.cardRow}>
        {accounts.map(a => <AccountCard key={a.id} account={a} />)}
      </div>

      {/* Totals */}
      {summary && (
        <div style={s.statRow}>
          <div style={s.stat}>
            <div style={s.statLabel}>Total Assets</div>
            <div style={s.statValue}>
              ${summary.total_assets.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={s.stat}>
            <div style={s.statLabel}>Credit Balance</div>
            <div style={{ ...s.statValue, color: '#ef4444' }}>
              -${Math.abs(summary.total_credit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      {summary && (
        <div style={s.chartRow}>
          <div style={s.chartBox}>
            <h3 style={s.chartTitle}>Balance Trend — Last 30 Days</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={summary.balance_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                />
                <Tooltip
                  formatter={(v: number) => [`$${v.toLocaleString()}`, 'Balance']}
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="#3b82d4"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={s.chartBox}>
            <h3 style={s.chartTitle}>Spending by Category</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={summary.spending_by_category}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name }: { name: string }) => name}
                >
                  {summary.spending_by_category.map((_entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <h3 style={s.chartTitle}>Recent Transactions</h3>
          <Link to="/transactions" style={s.viewAll}>View all →</Link>
        </div>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Date</th>
              <th style={s.th}>Merchant</th>
              <th style={s.th}>Category</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <tr key={tx.id} style={s.tr}>
                <td style={s.td}>{new Date(tx.date).toLocaleDateString()}</td>
                <td style={s.td}>{tx.merchant}</td>
                <td style={s.td}>
                  <span style={s.badge}>{tx.category}</span>
                </td>
                <td style={{
                  ...s.td,
                  textAlign: 'right',
                  fontWeight: 600,
                  color: tx.type === 'credit' ? '#10b981' : '#1f2328',
                }}>
                  {tx.type === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1f2328' },
  loading: { padding: '2rem', color: '#57606a' },
  errBox: { padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626' },
  cardRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1.25rem' },
  cardType: { fontSize: '0.7rem', fontWeight: 700, color: '#57606a', letterSpacing: '0.06em', marginBottom: '0.5rem' },
  cardNum: { fontSize: '0.85rem', color: '#57606a', marginBottom: '0.5rem' },
  cardBalance: { fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.25rem' },
  cardCurrency: { fontSize: '0.75rem', color: '#57606a' },
  statRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' },
  stat: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem 1.5rem' },
  statLabel: { fontSize: '0.8rem', color: '#57606a', marginBottom: '0.25rem' },
  statValue: { fontSize: '1.3rem', fontWeight: 700, color: '#1f2328' },
  chartRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' },
  chartBox: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1.25rem' },
  chartTitle: { margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 600, color: '#1f2328' },
  section: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1.25rem' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  viewAll: { fontSize: '0.85rem', color: '#3b82d4', textDecoration: 'none' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '0.5rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: '#57606a', textAlign: 'left', borderBottom: '1px solid #e5e7eb', background: '#f7f8fa' },
  tr: { borderBottom: '1px solid #f7f8fa' },
  td: { padding: '0.65rem 0.75rem', fontSize: '0.875rem', color: '#1f2328' },
  badge: { background: '#f7f8fa', border: '1px solid #e5e7eb', borderRadius: '999px', padding: '0.15rem 0.5rem', fontSize: '0.75rem', color: '#57606a' },
}

import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

interface Account {
  id: number; type: string; account_number: string; balance: number; currency: string
}
interface Transaction {
  id: number; account_id: number; amount: number; description: string
  category: string; merchant: string; date: string; type: string
}
interface Summary {
  balance_trend: Array<{ date: string; balance: number }>
  spending_by_category: Array<{ category: string; total: number }>
  total_assets: number; total_credit: number
}
interface ManagerSummary {
  total_customers: number; new_customers_30d: number; offboarded_customers: number
  transaction_volume_30d: number; transaction_count_30d: number; total_assets: number
  top_categories: Array<{ category: string; total: number }>
  recent_transactions: Array<{
    id: number; date: string; user_name: string
    merchant: string; category: string; amount: number; type: string
  }>
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CARD_COLORS = ['#1a2e2a', '#2d5044', '#3b7a5a', '#4ade80']
const BAR_COLORS  = ['#b2d8c8','#b2d8c8','#b2d8c8','#b2d8c8','#1a2e2a','#b2d8c8','#b2d8c8']

// ── Credit card visual ────────────────────────────────────────────────────────
function BankCard({ account, active }: { account: Account; active: boolean }) {
  const bg = active ? 'linear-gradient(135deg, #1a2e2a 0%, #2d5044 100%)' : 'linear-gradient(135deg, #2d5044 0%, #3b7a5a 100%)'
  const balance = Math.abs(account.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })
  const masked = `•••• •••• •••• ${account.account_number.slice(-4)}`
  return (
    <div style={{ ...s.bankCard, background: bg }}>
      <div style={s.cardTopRow}>
        <span style={s.cardBrand}>MockBank</span>
        <span style={s.cardType}>{account.type.charAt(0).toUpperCase() + account.type.slice(1)}</span>
      </div>
      <div style={s.cardNumber}>{masked}</div>
      <div style={s.cardBottomRow}>
        <div>
          <div style={s.cardLabel}>Balance</div>
          <div style={s.cardBalanceAmt}>${balance}</div>
        </div>
        <div style={s.cardChip}>
          <div style={s.chipInner} />
        </div>
      </div>
    </div>
  )
}

// ── Customer Dashboard ────────────────────────────────────────────────────────
function CustomerDashboard() {
  const [accounts, setAccounts]         = useState<Account[]>([])
  const [summary, setSummary]           = useState<Summary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [activeCard, setActiveCard]     = useState(0)
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<Account[]>('/banking/accounts'),
      api.get<Summary>('/banking/summary'),
      api.get<Transaction[]>('/banking/transactions?limit=6'),
    ])
      .then(([a, s, t]) => { setAccounts(a.data); setSummary(s.data); setTransactions(t.data) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={s.loading}>Loading…</div>

  const activeAccount = accounts[activeCard]
  const totalAssets   = summary?.total_assets ?? 0
  const totalExpenses = Math.abs(summary?.total_credit ?? 0)

  // Build monthly bar data from balance_trend (group by month)
  const monthlyBars = MONTHS.slice(0, 7).map((m, i) => ({
    month: m,
    value: summary?.balance_trend
      ? Math.round((summary.balance_trend[Math.min(i * 4, summary.balance_trend.length - 1)]?.balance ?? 0))
      : 0,
  }))

  return (
    <div style={s.page}>
      {/* ── Left + Middle ── */}
      <div style={s.leftCol}>

        {/* Card Overview */}
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <div>
              <div style={s.panelTitle}>Card Overview</div>
              <div style={s.panelSub}>Track your balances and recent transactions</div>
            </div>
          </div>

          {/* Card selector tabs */}
          <div style={s.cardTabs}>
            {accounts.map((a, i) => (
              <button key={a.id} style={{ ...s.cardTab, ...(i === activeCard ? s.cardTabActive : {}) }}
                onClick={() => setActiveCard(i)}>
                {a.type.charAt(0).toUpperCase() + a.type.slice(1)}
              </button>
            ))}
          </div>

          <div style={s.cardOverviewRow}>
            {/* Balance box */}
            <div style={s.balanceBox}>
              <div style={s.balanceLabel}>Main Balance</div>
              <div style={s.balanceDate}>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              <div style={s.balanceAmount}>
                ${activeAccount ? Math.abs(activeAccount.balance).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
              </div>
              <div style={s.balanceChange}>
                <span style={{ color: '#10b981' }}>↑ +5.2%</span>
                <span style={{ color: '#9ca3af', marginLeft: '0.4rem' }}>from last month</span>
              </div>
            </div>

            {/* Card visual */}
            {activeAccount && <BankCard account={activeAccount} active />}
          </div>

          {/* Net worth row */}
          <div style={s.netWorthRow}>
            <div style={s.netWorthBox}>
              <div style={s.netWorthLabel}>Current Net Worth</div>
              <div style={s.netWorthValue}>
                ${(totalAssets - totalExpenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div style={s.netWorthSub}>Amount <span style={{ color: '#10b981', marginLeft: '0.5rem' }}>+10%</span></div>
            </div>
            <div style={s.spendBox}>
              <div style={s.spendTitle}>Spending Overview</div>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={monthlyBars} barSize={14}>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'Balance']} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {monthlyBars.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent Transfer Activity */}
        <div style={s.panel}>
          <div style={s.panelHeaderRow}>
            <div style={s.panelTitle}>Recent Transfer Activity</div>
            <Link to="/transactions" style={s.viewAllLink}>View Full Transaction History ↗</Link>
          </div>

          <table style={s.table}>
            <thead>
              <tr>
                {['Date & Time', 'Description', 'Account', 'Amount', ''].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => {
                const acct = accounts.find(a => a.id === tx.account_id)
                return (
                  <tr key={tx.id} style={s.tr}>
                    <td style={s.td}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 500, color: '#1f2328' }}>
                        {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        {new Date(tx.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={s.td}>
                      <div style={s.txAvatar}>{tx.merchant.charAt(0)}</div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{tx.category}</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1f2328' }}>{tx.merchant}</div>
                      </div>
                    </td>
                    <td style={s.td}>
                      <div style={{ fontSize: '0.82rem', color: '#1f2328' }}>
                        {acct ? acct.type.charAt(0).toUpperCase() + acct.type.slice(1) : '—'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        (••••{acct?.account_number.slice(-4) ?? '——'})
                      </div>
                    </td>
                    <td style={{ ...s.td, fontWeight: 600, color: tx.type === 'credit' ? '#10b981' : '#1f2328' }}>
                      {tx.type === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
                    </td>
                    <td style={s.td}>
                      <button style={s.dotBtn}>···</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Right col ── */}
      <div style={s.rightCol}>

        {/* Income */}
        <div style={s.statPanel}>
          <div>
            <div style={s.statPanelLabel}>Total Income</div>
            <div style={s.statPanelValue}>${totalAssets.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <span style={s.pillGreen}>+8.5%</span>
            <div style={s.statPanelSub}>Last Month</div>
          </div>
          <div style={{ position: 'absolute' as const, bottom: '0.85rem', left: '1rem', fontSize: '0.9rem' }}>↑</div>
        </div>

        {/* Expenses */}
        <div style={s.statPanel}>
          <div>
            <div style={s.statPanelLabel}>Total Expenses</div>
            <div style={{ ...s.statPanelValue, color: '#ef4444' }}>
              ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <span style={s.pillRed}>-4.2%</span>
            <div style={s.statPanelSub}>Last Month</div>
          </div>
          <div style={{ position: 'absolute' as const, bottom: '0.85rem', left: '1rem', fontSize: '0.9rem', color: '#ef4444' }}>↓</div>
        </div>

        {/* Quick Actions — Customer */}
        <div style={s.panel}>
          <div style={s.panelHeaderRow}>
            <div style={s.panelTitle}>Quick Actions</div>
          </div>

          <div style={s.quickTransferGrid}>
            {[
              { label: 'Transfer', icon: '↔' },
              { label: 'Top Up',   icon: '＋' },
              { label: 'Pay Bills',icon: '📄' },
              { label: 'Others',   icon: '···' },
            ].map(item => (
              <div key={item.label} style={s.quickIcon}>
                <div style={s.quickIconCircle}>{item.icon}</div>
                <div style={s.quickIconLabel}>{item.label}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div style={s.sectionLabel}>My Accounts</div>
            <div style={s.recentAccounts}>
              {accounts.map(a => (
                <div key={a.id} style={s.recentAcctAvatar} title={a.type}>
                  {a.type.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          </div>

          <Link to="/transfers">
            <button style={s.transferBtn}>Transfer Funds</button>
          </Link>
        </div>

        {/* Spending by category */}
        <div style={s.panel}>
          <div style={s.panelTitle}>Spending by Category</div>
          <div style={{ marginTop: '0.75rem' }}>
            {(summary?.spending_by_category ?? []).slice(0, 5).map((c, i) => {
              const max = Math.max(...(summary?.spending_by_category ?? []).map(x => x.total), 1)
              const pct = Math.round((c.total / max) * 100)
              return (
                <div key={c.category} style={s.catRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#1f2328', fontWeight: 500 }}>{c.category}</span>
                    <span style={{ fontSize: '0.78rem', color: '#57606a' }}>${c.total.toFixed(0)}</span>
                  </div>
                  <div style={s.catBarBg}>
                    <div style={{ ...s.catBarFill, width: `${pct}%`, background: CARD_COLORS[i % CARD_COLORS.length] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Manager / Admin Dashboard ─────────────────────────────────────────────────
function ManagerDashboard({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate()
  const [data, setData]     = useState<ManagerSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<ManagerSummary>('/banking/manager-summary')
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading || !data) return <div style={s.loading}>Loading…</div>

  return (
    <div style={s.page}>
      <div style={s.leftCol}>
        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'Active Customers', value: data.total_customers, sub: `+${data.new_customers_30d} this month`, color: '#1a2e2a' },
            { label: 'Transaction Volume', value: `$${(data.transaction_volume_30d/1000).toFixed(1)}k`, sub: `${data.transaction_count_30d} transactions`, color: '#1a2e2a' },
            { label: 'Total Assets', value: `$${(data.total_assets/1000).toFixed(1)}k`, sub: 'all customer balances', color: '#1a2e2a' },
          ].map(k => (
            <div key={k.label} style={s.kpiCard}>
              <div style={s.kpiLabel}>{k.label}</div>
              <div style={s.kpiValue}>{k.value}</div>
              <div style={s.kpiSub}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Top categories bar */}
        <div style={s.panel}>
          <div style={s.panelTitle}>Top Spending Categories — Last 90 Days</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.top_categories} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v/1000).toFixed(1)}k`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`]} />
              <Bar dataKey="total" fill="#1a2e2a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent transactions */}
        <div style={{ ...s.panel, marginTop: '1rem' }}>
          <div style={s.panelHeaderRow}>
            <div style={s.panelTitle}>Recent Customer Transactions</div>
            <button style={s.viewAllLink} onClick={() => navigate('/all-transactions')}>View all ↗</button>
          </div>
          <table style={s.table}>
            <thead><tr>
              {['Date', 'Customer', 'Merchant', 'Category', 'Amount'].map(h => <th key={h} style={s.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {data.recent_transactions.map(tx => (
                <tr key={tx.id} style={s.tr}>
                  <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.8rem' }}>{new Date(tx.date).toLocaleDateString()}</td>
                  <td style={s.td}>{tx.user_name}</td>
                  <td style={s.td}>{tx.merchant}</td>
                  <td style={s.td}><span style={s.catBadge}>{tx.category}</span></td>
                  <td style={{ ...s.td, fontWeight: 600, color: tx.type === 'credit' ? '#10b981' : '#1f2328' }}>
                    {tx.type === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right col */}
      <div style={s.rightCol}>
        <div style={s.statPanel}>
          <div>
            <div style={s.statPanelLabel}>Active Customers</div>
            <div style={s.statPanelValue}>{data.total_customers}</div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <span style={s.pillGreen}>+{data.new_customers_30d}</span>
            <div style={s.statPanelSub}>This Month</div>
          </div>
        </div>

        <div style={s.statPanel}>
          <div>
            <div style={s.statPanelLabel}>Offboarded</div>
            <div style={{ ...s.statPanelValue, color: data.offboarded_customers > 0 ? '#f59e0b' : '#10b981' }}>
              {data.offboarded_customers}
            </div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <div style={s.statPanelSub}>Total</div>
          </div>
        </div>

        {isAdmin && (
          <div style={s.panel}>
            <div style={s.panelTitle}>Identity Management</div>
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' }}>
              <button style={s.transferBtn} onClick={() => navigate('/admin/users')}>
                Manage Users (JML)
              </button>
              <button style={{ ...s.transferBtn, background: '#f5f6fa', color: '#1a2e2a', border: '1px solid #e5e7eb' }}
                onClick={() => navigate('/all-transactions')}>
                All Customer Transactions
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  if (user?.role === 'Manager') return <ManagerDashboard isAdmin={false} />
  if (user?.role === 'Admin')   return <ManagerDashboard isAdmin={true} />
  return <CustomerDashboard />
}

const s: Record<string, React.CSSProperties> = {
  loading: { padding: '3rem 2rem', color: '#57606a', fontSize: '0.9rem' },
  page: { display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem', alignItems: 'start' },
  leftCol: { display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 },
  rightCol: { display: 'flex', flexDirection: 'column', gap: '1rem' },

  panel: {
    background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb',
    padding: '1.25rem 1.5rem',
  },
  panelHeader: { marginBottom: '1rem' },
  panelHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  panelTitle: { fontSize: '1rem', fontWeight: 700, color: '#1a2e2a' },
  panelSub: { fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.1rem' },

  cardTabs: { display: 'flex', gap: '0.5rem', marginBottom: '1rem' },
  cardTab: {
    padding: '0.3rem 0.75rem', borderRadius: '999px', border: '1px solid #e5e7eb',
    background: '#f5f6fa', color: '#57606a', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 500,
  },
  cardTabActive: { background: '#1a2e2a', color: '#fff', border: '1px solid #1a2e2a' },

  cardOverviewRow: { display: 'flex', gap: '1.25rem', alignItems: 'flex-start', marginBottom: '1rem' },
  balanceBox: { flex: 1 },
  balanceLabel: { fontSize: '0.78rem', color: '#9ca3af', fontWeight: 500 },
  balanceDate: { fontSize: '0.72rem', color: '#9ca3af', marginBottom: '0.4rem' },
  balanceAmount: { fontSize: '2rem', fontWeight: 800, color: '#1a2e2a', letterSpacing: '-0.02em' },
  balanceChange: { fontSize: '0.78rem', marginTop: '0.3rem' },

  bankCard: {
    width: '200px', minWidth: '200px', height: '120px', borderRadius: '14px',
    padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    color: '#fff', flexShrink: 0,
  },
  cardTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardBrand: { fontSize: '0.82rem', fontWeight: 700, letterSpacing: '-0.01em' },
  cardType: { fontSize: '0.68rem', opacity: 0.7, textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  cardNumber: { fontSize: '0.8rem', letterSpacing: '0.18em', opacity: 0.85, fontFamily: 'monospace' },
  cardBottomRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardLabel: { fontSize: '0.6rem', opacity: 0.7, marginBottom: '0.1rem', textTransform: 'uppercase' as const },
  cardBalanceAmt: { fontSize: '0.9rem', fontWeight: 700 },
  cardChip: {
    width: '28px', height: '20px', borderRadius: '4px', background: 'rgba(255,255,255,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  chipInner: { width: '18px', height: '12px', borderRadius: '2px', background: 'rgba(255,255,255,0.5)' },

  netWorthRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' },
  netWorthBox: {},
  netWorthLabel: { fontSize: '0.78rem', color: '#9ca3af', fontWeight: 500 },
  netWorthValue: { fontSize: '1.5rem', fontWeight: 800, color: '#1a2e2a', letterSpacing: '-0.02em', marginTop: '0.2rem' },
  netWorthSub: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.2rem' },
  spendBox: {},
  spendTitle: { fontSize: '0.78rem', color: '#9ca3af', fontWeight: 500, marginBottom: '0.25rem' },

  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textAlign: 'left' as const, borderBottom: '1px solid #f3f4f6' },
  tr: { borderBottom: '1px solid #f9fafb' },
  td: { padding: '0.75rem 0.75rem', fontSize: '0.875rem', color: '#1f2328', display: 'table-cell', verticalAlign: 'middle' as const },
  txAvatar: {
    display: 'inline-flex', width: '30px', height: '30px', borderRadius: '50%',
    background: '#1a2e2a', color: '#fff', fontSize: '0.8rem', fontWeight: 700,
    alignItems: 'center', justifyContent: 'center', marginRight: '0.6rem', flexShrink: 0,
  },
  dotBtn: {
    background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px',
    padding: '0.2rem 0.5rem', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem',
  },
  viewAllLink: {
    fontSize: '0.8rem', color: '#1a2e2a', textDecoration: 'none',
    background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600,
  },

  statPanel: {
    background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb',
    padding: '1.1rem 1.25rem', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', position: 'relative' as const,
  },
  statPanelLabel: { fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.25rem' },
  statPanelValue: { fontSize: '1.6rem', fontWeight: 800, color: '#1a2e2a', letterSpacing: '-0.02em' },
  statPanelSub: { fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.25rem' },
  pillGreen: {
    display: 'inline-block', background: '#dcfce7', color: '#16a34a',
    fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '999px',
  },
  pillRed: {
    display: 'inline-block', background: '#fef2f2', color: '#dc2626',
    fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '999px',
  },

  quickTransferGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginTop: '0.75rem' },
  quickIcon: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '0.3rem' },
  quickIconCircle: {
    width: '42px', height: '42px', borderRadius: '50%', background: '#f5f6fa',
    border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1rem', cursor: 'pointer',
  },
  quickIconLabel: { fontSize: '0.68rem', color: '#57606a', textAlign: 'center' as const },
  sectionLabel: { fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', marginBottom: '0.5rem' },
  recentAccounts: { display: 'flex', gap: '0.4rem' },
  recentAcctAvatar: {
    width: '36px', height: '36px', borderRadius: '50%', background: '#1a2e2a', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
  },
  transferBtn: {
    width: '100%', marginTop: '1rem', padding: '0.7rem', background: '#1a2e2a', color: '#fff',
    border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem',
  },

  catRow: { marginBottom: '0.6rem' },
  catBarBg: { height: '6px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: '999px', transition: 'width 0.3s' },
  catBadge: {
    background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '999px',
    padding: '0.15rem 0.5rem', fontSize: '0.72rem', color: '#57606a',
  },

  kpiCard: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px',
    padding: '1.1rem 1.25rem',
  },
  kpiLabel: { fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.3rem' },
  kpiValue: { fontSize: '1.5rem', fontWeight: 800, color: '#1a2e2a', letterSpacing: '-0.02em' },
  kpiSub: { fontSize: '0.72rem', color: '#10b981', marginTop: '0.2rem' },
}

import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { T } from '../styles/theme'

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
const CAT_COLORS = [T.green, T.amber, T.blue, '#e09433', '#7c5cd8', '#f85149']

function ArrowUpIcon({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
}
function ArrowDownIcon({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
}

// ── Customer Dashboard ─────────────────────────────────────────────────────────
function CustomerDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [accounts, setAccounts]         = useState<Account[]>([])
  const [summary, setSummary]           = useState<Summary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<Account[]>('/banking/accounts'),
      api.get<Summary>('/banking/summary'),
      api.get<Transaction[]>('/banking/transactions?limit=5'),
    ])
      .then(([a, s, t]) => { setAccounts(a.data); setSummary(s.data); setTransactions(t.data) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={s.loading}>Loading…</div>

  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const totalAssets   = summary?.total_assets ?? 0
  const totalExpenses = Math.abs(summary?.total_credit ?? 0)
  const netWorth = totalAssets - totalExpenses

  const trendData = (summary?.balance_trend ?? []).slice(-10).map((d, i) => ({
    name: MONTHS[i % 12],
    value: Math.round(d.balance),
  }))

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div>
      {/* ── Page header ── */}
      <div style={s.pageHeader}>
        <div>
          <div style={s.pageGreeting}>{greeting}, {firstName}</div>
          <h1 style={s.pageTitle}>Overview</h1>
        </div>
        <div style={s.headerActions}>
          <button style={s.btnPrimary} onClick={() => navigate('/transfers')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            New transfer
          </button>
          <button style={s.btnSecondary}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add money
          </button>
        </div>
      </div>

      {/* ── Top row ── */}
      <div style={s.topGrid}>
        {/* Net worth chart card */}
        <div style={s.chartCard}>
          <div style={s.chartCardTop}>
            <div>
              <div style={s.chartCardLabel}>TOTAL NET WORTH · USD</div>
              <div style={s.chartCardValue}>
                ${netWorth.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ ...s.changePill, color: T.green, fontSize: '0.82rem', marginTop: '0.5rem' }}>
                <ArrowUpIcon /> +4.8% MoM
              </div>
              <div style={s.chartCardSub}>
                Across {accounts.length} accounts · Updated moments ago
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={trendData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.amber} stopOpacity={0.25}/>
                  <stop offset="95%" stopColor={T.amber} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.inkSub }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: T.inkSub }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => `$${(v/1000).toFixed(0)}k`} width={45} />
              <Tooltip
                contentStyle={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.ink }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, 'Balance']}
              />
              <Area type="monotone" dataKey="value" stroke={T.amber} strokeWidth={2}
                fill="url(#netGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Spending card */}
        <div style={s.spendCard}>
          <div style={s.spendHeader}>
            <div>
              <div style={s.spendLabel}>SPENDING THIS MONTH</div>
              <div style={s.spendValue}>
                ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div style={s.spendBudget}>Budget $5,000.00 · {Math.round((totalExpenses / 5000) * 100)}% used</div>
            </div>
            <span style={{ ...s.onTrackPill, background: totalExpenses < 4500 ? T.greenLight : T.orangeLight, color: totalExpenses < 4500 ? T.green : T.orange }}>
              {totalExpenses < 4500 ? '✓ On track' : '⚠ Near limit'}
            </span>
          </div>
          {/* Progress bar */}
          <div style={s.progressBg}>
            <div style={{ ...s.progressFill, width: `${Math.min((totalExpenses / 5000) * 100, 100)}%`, background: totalExpenses < 4500 ? T.amber : T.red }} />
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={(summary?.spending_by_category ?? []).slice(0, 6)} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: T.inkSub }} axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.split(' ')[0]} />
              <YAxis tick={{ fontSize: 10, fill: T.inkSub }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`} width={45} />
              <Tooltip
                contentStyle={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.ink }}
                formatter={(v: number) => [`$${v.toFixed(2)}`]}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {(summary?.spending_by_category ?? []).slice(0, 6).map((_, i) => (
                  <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Your accounts ── */}
      <div style={s.sectionHeader}>
        <div style={s.sectionTitle}>Your accounts</div>
        <button style={s.exportBtn}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
        </button>
      </div>
      <div style={s.accountsGrid}>
        {accounts.map((a, i) => {
          const isNeg = a.balance < 0
          return (
            <div key={a.id} style={{ ...s.accountCard, borderColor: isNeg ? T.redBorder : T.border }}>
              <div style={s.accountCardTop}>
                <div>
                  <div style={s.accountType}>{a.type.charAt(0).toUpperCase() + a.type.slice(1)}</div>
                  <div style={s.accountNum}>•• {a.account_number.slice(-4)}</div>
                </div>
                <span style={{ color: isNeg ? T.red : T.green, fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  {isNeg ? <ArrowDownIcon /> : <ArrowUpIcon />}
                  {isNeg ? '-0.3%' : `+${(1.4 + i * 1.2).toFixed(1)}%`}
                </span>
              </div>
              <div style={s.accountBalance}>
                {isNeg ? '-' : ''}${Math.abs(a.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div style={s.accountCurrency}>{a.currency ?? 'USD'}</div>
            </div>
          )
        })}
      </div>

      {/* ── Bottom row ── */}
      <div style={s.bottomGrid}>
        {/* Recent activity */}
        <div style={s.activityCard}>
          <div style={s.activityHeader}>
            <div style={s.sectionTitle}>Recent activity</div>
            <Link to="/transactions" style={s.viewAllLink}>View all</Link>
          </div>
          {transactions.map((tx, idx) => {
            const isCredit = tx.type === 'credit'
            return (
              <div key={tx.id} style={{ ...s.activityRow, borderBottom: idx < transactions.length - 1 ? `1px solid ${T.borderLight}` : 'none' }}>
                <div style={{ ...s.activityIcon, background: isCredit ? T.greenLight : T.bgMuted }}>
                  {isCredit ? <ArrowDownIcon /> : <ArrowUpIcon />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={s.activityMerchant}>{tx.merchant}</div>
                  <div style={s.activityCat}>{tx.category}</div>
                </div>
                <div>
                  <div style={{ ...s.activityAmt, color: isCredit ? T.green : T.ink }}>
                    {isCredit ? '+' : '-'}${tx.amount.toFixed(2)}
                  </div>
                  <div style={s.activityDate}>
                    {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Quick pay */}
        <div style={s.quickPayCard}>
          <div style={s.sectionTitle}>Quick pay</div>
          <div style={s.quickPaySub}>Send to a saved account in seconds.</div>
          <div style={s.quickPayGrid}>
            {accounts.map(a => (
              <div key={a.id} style={s.quickPayItem} onClick={() => navigate('/transfers')}>
                <div style={s.quickPayAvatar}>{a.type.charAt(0).toUpperCase()}</div>
                <div style={s.quickPayAcctName}>{a.type.charAt(0).toUpperCase() + a.type.slice(1)}</div>
                <div style={s.quickPayAcctNum}>•• {a.account_number.slice(-4)}</div>
              </div>
            ))}
          </div>
          <button style={s.transferBigBtn} onClick={() => navigate('/transfers')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            New transfer
          </button>
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
    <div>
      <div style={s.pageHeader}>
        <div>
          <div style={s.pageGreeting}>{isAdmin ? 'Administrator' : 'Manager'}</div>
          <h1 style={s.pageTitle}>Overview</h1>
        </div>
        {isAdmin && (
          <div style={s.headerActions}>
            <button style={s.btnPrimary} onClick={() => navigate('/admin/users')}>Manage Users</button>
            <button style={s.btnSecondary} onClick={() => navigate('/all-transactions')}>All Transactions</button>
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'ACTIVE CUSTOMERS', value: data.total_customers, sub: `+${data.new_customers_30d} this month`, up: true },
          { label: 'TRANSACTION VOLUME', value: `$${(data.transaction_volume_30d/1000).toFixed(1)}k`, sub: `${data.transaction_count_30d} transactions`, up: true },
          { label: 'TOTAL ASSETS', value: `$${(data.total_assets/1000).toFixed(1)}k`, sub: 'all customer balances', up: true },
        ].map(k => (
          <div key={k.label} style={s.kpiCard}>
            <div style={s.kpiLabel}>{k.label}</div>
            <div style={s.kpiValue}>{k.value}</div>
            <div style={s.kpiSub}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Spending categories */}
      <div style={s.chartCard}>
        <div style={s.panelTitle}>Top Spending Categories — Last 90 Days</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.top_categories} layout="vertical" margin={{ left: 0 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: T.ink }} tickFormatter={(v: number) => `$${(v/1000).toFixed(1)}k`} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: T.ink }} width={110} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.ink }} formatter={(v: number) => [`$${v.toFixed(2)}`]} />
            <Bar dataKey="total" radius={[0, 6, 6, 0]}>
              {data.top_categories.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent transactions */}
      <div style={{ ...s.activityCard, marginTop: '1rem' }}>
        <div style={s.activityHeader}>
          <div style={s.sectionTitle}>Recent Customer Transactions</div>
          <button style={s.viewAllLink} onClick={() => navigate('/all-transactions')}>View all</button>
        </div>
        <table style={s.table}>
          <thead><tr>
            {['Date', 'Customer', 'Merchant', 'Category', 'Amount'].map(h => <th key={h} style={s.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {data.recent_transactions.map((tx, idx) => (
              <tr key={tx.id} style={{ background: idx % 2 === 0 ? 'transparent' : T.bgMuted + '40' }}>
                <td style={{ ...s.td, color: T.inkSub }}>{new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                <td style={s.td}>{tx.user_name}</td>
                <td style={s.td}>{tx.merchant}</td>
                <td style={s.td}><span style={s.catTag}>{tx.category}</span></td>
                <td style={{ ...s.td, fontWeight: 700, color: tx.type === 'credit' ? T.green : T.ink }}>
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

export default function DashboardPage() {
  const { user } = useAuth()
  if (user?.role === 'Manager') return <ManagerDashboard isAdmin={false} />
  if (user?.role === 'Admin')   return <ManagerDashboard isAdmin={true} />
  return <CustomerDashboard />
}

const s: Record<string, React.CSSProperties> = {
  loading: { padding: '3rem', color: T.inkSub, fontSize: '0.9rem' },

  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' },
  pageGreeting: { fontSize: '0.82rem', color: T.inkSub, marginBottom: '0.2rem' },
  pageTitle: { fontSize: '2rem', fontWeight: 800, color: T.ink, margin: 0, letterSpacing: '-0.03em' },
  headerActions: { display: 'flex', gap: '0.6rem' },
  btnPrimary: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 1.1rem', background: T.amber, color: '#0d1117',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
  },
  btnSecondary: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 1.1rem', background: T.bgCard, color: T.ink,
    border: `1px solid ${T.border}`, borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
  },

  topGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' },

  chartCard: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '12px', padding: '1.5rem', boxShadow: T.shadowCard,
  },
  chartCardTop: { marginBottom: '0.75rem' },
  chartCardLabel: { fontSize: '0.68rem', fontWeight: 700, color: T.inkSub, letterSpacing: '0.1em', marginBottom: '0.3rem' },
  chartCardValue: { fontSize: '2.4rem', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.1 },
  chartCardSub: { fontSize: '0.75rem', color: T.inkSub, marginTop: '0.35rem' },
  changePill: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 700 },

  spendCard: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '12px', padding: '1.5rem', boxShadow: T.shadowCard,
  },
  spendHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' },
  spendLabel: { fontSize: '0.68rem', fontWeight: 700, color: T.inkSub, letterSpacing: '0.1em', marginBottom: '0.3rem' },
  spendValue: { fontSize: '2rem', fontWeight: 800, color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.1 },
  spendBudget: { fontSize: '0.75rem', color: T.inkSub, marginTop: '0.3rem' },
  onTrackPill: {
    fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem',
    borderRadius: '999px', flexShrink: 0,
  },
  progressBg: { height: '4px', background: T.bgMuted, borderRadius: '99px', marginBottom: '1rem', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: '99px', transition: 'width 0.5s' },

  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' },
  sectionTitle: { fontSize: '1rem', fontWeight: 700, color: T.ink, letterSpacing: '-0.01em' },
  exportBtn: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.4rem 0.75rem', background: 'transparent', border: `1px solid ${T.border}`,
    borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', color: T.inkSub, fontWeight: 600,
  },

  accountsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '1rem', marginBottom: '1.5rem',
  },
  accountCard: {
    background: T.bgCard, border: `1px solid`, borderRadius: '12px',
    padding: '1.25rem', boxShadow: T.shadowCard, cursor: 'pointer',
  },
  accountCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' },
  accountType: { fontSize: '0.88rem', fontWeight: 600, color: T.ink },
  accountNum: { fontSize: '0.72rem', color: T.inkSub, marginTop: '0.1rem' },
  accountBalance: { fontSize: '1.6rem', fontWeight: 800, color: T.ink, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '0.2rem' },
  accountCurrency: { fontSize: '0.72rem', color: T.inkSub, fontWeight: 600 },

  bottomGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },

  activityCard: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '12px', padding: '1.25rem 1.5rem', boxShadow: T.shadowCard,
  },
  activityHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  activityRow: { display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.7rem 0' },
  activityIcon: {
    width: '34px', height: '34px', borderRadius: '8px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: T.ink,
  },
  activityMerchant: { fontSize: '0.85rem', fontWeight: 600, color: T.ink },
  activityCat: { fontSize: '0.72rem', color: T.inkSub, marginTop: '0.1rem' },
  activityAmt: { fontSize: '0.88rem', fontWeight: 700, textAlign: 'right' as const },
  activityDate: { fontSize: '0.7rem', color: T.inkSub, textAlign: 'right' as const, marginTop: '0.1rem' },
  viewAllLink: {
    fontSize: '0.8rem', color: T.amber, textDecoration: 'none',
    background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600,
  },

  quickPayCard: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '12px', padding: '1.25rem 1.5rem', boxShadow: T.shadowCard,
  },
  quickPaySub: { fontSize: '0.78rem', color: T.inkSub, marginTop: '0.2rem', marginBottom: '1.25rem' },
  quickPayGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.6rem', marginBottom: '1.25rem' },
  quickPayItem: {
    background: T.bgMuted, border: `1px solid ${T.border}`,
    borderRadius: '10px', padding: '0.85rem 0.5rem', cursor: 'pointer',
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '0.4rem',
  },
  quickPayAvatar: {
    width: '32px', height: '32px', borderRadius: '50%',
    background: T.bgHighlight, border: `1px solid ${T.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.85rem', fontWeight: 700, color: T.ink,
  },
  quickPayAcctName: { fontSize: '0.72rem', fontWeight: 600, color: T.ink, textAlign: 'center' as const },
  quickPayAcctNum: { fontSize: '0.65rem', color: T.inkSub },

  transferBigBtn: {
    width: '100%', padding: '0.7rem', background: T.amber, color: '#0d1117',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
  },

  panelTitle: { fontSize: '0.9rem', fontWeight: 700, color: T.ink, marginBottom: '1rem', letterSpacing: '-0.01em' },

  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { padding: '0.5rem 0.75rem', fontSize: '0.68rem', fontWeight: 700, color: T.inkSub, textAlign: 'left' as const, borderBottom: `1px solid ${T.border}`, letterSpacing: '0.07em', textTransform: 'uppercase' as const },
  td: { padding: '0.7rem 0.75rem', fontSize: '0.875rem', color: T.ink },
  catTag: { fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '6px', background: T.bgMuted, color: T.inkSub },

  kpiCard: {
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '12px',
    boxShadow: T.shadowCard, padding: '1.25rem',
  },
  kpiLabel: { fontSize: '0.65rem', color: T.inkSub, fontWeight: 700, letterSpacing: '0.1em', marginBottom: '0.4rem' },
  kpiValue: { fontSize: '1.8rem', fontWeight: 800, color: T.ink, letterSpacing: '-0.03em' },
  kpiSub: { fontSize: '0.72rem', color: T.green, marginTop: '0.25rem' },
}

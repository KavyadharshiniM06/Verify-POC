import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

// ─── Shared types ─────────────────────────────────────────────────────────────
interface Alert { level: 'high' | 'medium' | 'low'; title: string; detail: string }
interface SignIn { date: string; device: string; location: string; method: string; status: 'success' | 'failed' }

const LEVEL_COLOR: Record<Alert['level'], string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#3b82f4',
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? '#4ade80' : score >= 45 ? '#f59e0b' : '#ef4444'
  return (
    <div style={s.scoreCard}>
      <div style={s.scoreLabel}>Security Score</div>
      <div style={s.scoreRing}>
        <svg viewBox="0 0 80 80" width="80" height="80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle cx="40" cy="40" r="34" fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 213.6} 213.6`}
            transform="rotate(-90 40 40)" />
        </svg>
        <div style={s.scoreNum}>{score}</div>
      </div>
      <div style={s.scoreStatus}>{score >= 70 ? 'Good' : score >= 45 ? 'Fair' : 'Needs Attention'}</div>
    </div>
  )
}

function AlertsCard({ alerts }: { alerts: Alert[] }) {
  return (
    <div style={{ ...s.card, flex: 1 }}>
      <div style={s.cardTitle}>Risk Alerts</div>
      {alerts.length === 0 ? (
        <div style={s.empty}>No active alerts — your account is well protected.</div>
      ) : alerts.map((a, i) => (
        <div key={i} style={s.alertRow}>
          <span style={{ ...s.alertDot, background: LEVEL_COLOR[a.level] }} />
          <div style={{ flex: 1 }}>
            <div style={s.alertTitle}>{a.title}</div>
            <div style={s.alertDetail}>{a.detail}</div>
          </div>
          <span style={{ ...s.badge, color: LEVEL_COLOR[a.level], background: LEVEL_COLOR[a.level] + '18', border: `1px solid ${LEVEL_COLOR[a.level]}33` }}>
            {a.level}
          </span>
        </div>
      ))}
    </div>
  )
}

function SignInsTable({ rows }: { rows: SignIn[] }) {
  return (
    <div style={s.card}>
      <div style={s.cardTitle}>Recent Sign-Ins</div>
      <table style={s.table}>
        <thead><tr>
          {['Date & Time','Device','Location','Method','Status'].map(h => (
            <th key={h} style={s.th}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f7f8fa' }}>
              <td style={s.td}>{r.date}</td>
              <td style={s.td}>{r.device}</td>
              <td style={s.td}>{r.location}</td>
              <td style={s.td}>{r.method}</td>
              <td style={s.td}>
                <span style={{ ...s.statusBadge,
                  background: r.status === 'success' ? '#f0fdf4' : '#fef2f2',
                  color:      r.status === 'success' ? '#16a34a' : '#dc2626',
                  border:     `1px solid ${r.status === 'success' ? '#bbf7d0' : '#fecaca'}`,
                }}>
                  {r.status === 'success' ? 'Success' : 'Failed'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  CUSTOMER VIEW
//  Focus: personal MFA methods, own devices, own sign-in history, score
// ─────────────────────────────────────────────────────────────────────────────
function CustomerSecurityView() {
  const methods = [
    { name: 'Passkey (FIDO2)',   enrolled: true,  desc: 'Biometric / hardware key — strongest protection' },
    { name: 'Email OTP',         enrolled: true,  desc: 'One-time code delivered to your registered email' },
    { name: 'Authenticator App', enrolled: false, desc: 'Time-based one-time password via authenticator app' },
    { name: 'Push Notification', enrolled: false, desc: 'Approve sign-ins from your mobile device' },
  ]
  const devices = [
    { name: 'MacBook Pro 16"', browser: 'Chrome 124', last: 'Active now',  trusted: true  },
    { name: 'iPhone 15 Pro',   browser: 'Safari 17',  last: '2 days ago',  trusted: true  },
    { name: 'Windows Laptop',  browser: 'Edge 123',   last: '14 days ago', trusted: false },
  ]
  const signins: SignIn[] = [
    { date: 'Today, 09:14',      device: 'Chrome / macOS', location: 'Chennai, IN',   method: 'Passkey',   status: 'success' },
    { date: 'Yesterday, 18:02',  device: 'Safari / iOS',   location: 'Chennai, IN',   method: 'Passkey',   status: 'success' },
    { date: '3 days ago, 11:30', device: 'Edge / Windows', location: 'Bangalore, IN', method: 'Email OTP', status: 'success' },
    { date: '5 days ago, 07:55', device: 'Chrome / macOS', location: 'Chennai, IN',   method: 'Password',  status: 'failed'  },
  ]
  const alerts: Alert[] = [
    { level: 'medium', title: 'Authenticator app not enrolled', detail: 'Enroll a TOTP app for an offline MFA backup.' },
    { level: 'low',    title: 'No trusted device registered',   detail: 'Register a trusted device to simplify future sign-ins.' },
  ]
  const enrolled = methods.filter(m => m.enrolled).length
  const score    = Math.round((enrolled / methods.length) * 100 - 8)

  return (
    <>
      {/* Header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Security Center</h1>
          <p style={s.pageSub}>Monitor your personal account security and manage how you sign in.</p>
        </div>
        <span style={{ ...s.rolePill, ...s.pillCustomer }}>Customer</span>
      </div>

      {/* Score + Alerts */}
      <div style={s.topRow}>
        <ScoreRing score={score} />
        <AlertsCard alerts={alerts} />
      </div>

      {/* MFA Methods */}
      <div style={s.card}>
        <div style={s.cardTitle}>Your Authentication Methods</div>
        <div style={s.methodsGrid}>
          {methods.map((m, i) => (
            <div key={i} style={{ ...s.methodCard, borderColor: m.enrolled ? '#4ade8044' : '#e5e7eb' }}>
              <div style={s.methodTop}>
                <span style={{ ...s.enrolledBadge, ...(m.enrolled ? s.enrolledOn : s.enrolledOff) }}>
                  {m.enrolled ? '✓ Enrolled' : 'Not Enrolled'}
                </span>
              </div>
              <div style={s.methodName}>{m.name}</div>
              <div style={s.methodDesc}>{m.desc}</div>
              {!m.enrolled && (
                <button style={s.enrollBtn}>Enroll</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Trusted devices */}
      <div style={s.card}>
        <div style={s.cardTitle}>My Trusted Devices</div>
        <div style={s.deviceList}>
          {devices.map((d, i) => (
            <div key={i} style={s.deviceRow}>
              <span style={{ fontSize: '1.5rem' }}>
                {d.browser.includes('iOS') || d.browser.includes('Safari') ? '📱' : '💻'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={s.deviceName}>{d.name}</div>
                <div style={s.deviceMeta}>{d.browser} · Last seen: {d.last}</div>
              </div>
              {d.trusted
                ? <span style={s.trustedBadge}>Trusted</span>
                : <span style={s.untrustedBadge}>Untrusted</span>
              }
              {!d.trusted && (
                <button style={s.revokeBtn}>Revoke</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <SignInsTable rows={signins} />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  MANAGER VIEW
//  Focus: own security posture + team/customer security overview
// ─────────────────────────────────────────────────────────────────────────────
function ManagerSecurityView() {
  const myAlerts: Alert[] = [
    { level: 'low', title: 'Push notification not enrolled', detail: 'Enroll push for faster approvals from your mobile device.' },
  ]
  const myScore = 78
  const signins: SignIn[] = [
    { date: 'Today, 08:31',      device: 'Chrome / macOS', location: 'Chennai, IN',   method: 'Passkey',   status: 'success' },
    { date: 'Yesterday, 17:44',  device: 'Safari / iOS',   location: 'Chennai, IN',   method: 'Passkey',   status: 'success' },
    { date: '2 days ago, 10:12', device: 'Chrome / macOS', location: 'Chennai, IN',   method: 'Email OTP', status: 'success' },
  ]

  // Team / customer summary (mock)
  const teamStats = [
    { label: 'Users with MFA',          value: 38, total: 42, color: '#10b981' },
    { label: 'Users without MFA',        value: 4,  total: 42, color: '#ef4444' },
    { label: 'Suspended accounts',       value: 2,  total: 42, color: '#f59e0b' },
    { label: 'Failed logins (24h)',       value: 7,  total: null, color: '#7c5cd8' },
    { label: 'High-risk users',          value: 3,  total: null, color: '#ef4444' },
    { label: 'New joiners (7d)',          value: 6,  total: null, color: '#3b82f6' },
  ]

  const riskUsers = [
    { name: 'Liam Bagchi',  email: 'liam@mockbank.com',  risk: 47, issue: 'No MFA enrolled',         last: '7h ago' },
    { name: 'Rohit Reyes',  email: 'rohit@mockbank.com', risk: 54, issue: 'Multiple failed logins',   last: '8h ago' },
    { name: 'Wei Silva',    email: 'wei@mockbank.com',   risk: 19, issue: 'Untrusted device sign-in', last: '3h ago' },
  ]

  return (
    <>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Security Center</h1>
          <p style={s.pageSub}>Your personal security posture plus a team-level overview for the accounts you oversee.</p>
        </div>
        <span style={{ ...s.rolePill, ...s.pillManager }}>Manager</span>
      </div>

      {/* Own score + alerts */}
      <div style={s.topRow}>
        <ScoreRing score={myScore} />
        <AlertsCard alerts={myAlerts} />
      </div>

      {/* Team security overview */}
      <div style={s.card}>
        <div style={s.cardTitle}>Team Security Overview</div>
        <div style={s.statsGrid}>
          {teamStats.map(stat => (
            <div key={stat.label} style={s.statTile}>
              <div style={{ ...s.statVal, color: stat.color }}>{stat.value}</div>
              {stat.total !== null && (
                <div style={{ height: '4px', background: '#f3f4f6', borderRadius: '99px', margin: '0.35rem 0' }}>
                  <div style={{ height: '100%', width: `${Math.round((stat.value / stat.total) * 100)}%`, background: stat.color, borderRadius: '99px' }} />
                </div>
              )}
              <div style={s.statLbl}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* At-risk users */}
      <div style={s.card}>
        <div style={s.cardTitleRow}>
          <div style={s.cardTitle}>At-Risk Users</div>
          <span style={{ fontSize: '0.75rem', color: '#57606a' }}>Requires action</span>
        </div>
        <table style={s.table}>
          <thead><tr>
            {['User','Risk Score','Issue','Last Login','Action'].map(h => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {riskUsers.map((u, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f7f8fa' }}>
                <td style={s.td}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{u.name}</div>
                  <div style={{ fontSize: '0.74rem', color: '#9ca3af' }}>{u.email}</div>
                </td>
                <td style={s.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '60px', height: '5px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ width: `${u.risk}%`, height: '100%', background: u.risk > 45 ? '#ef4444' : '#f59e0b', borderRadius: '99px' }} />
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#57606a' }}>{u.risk}</span>
                  </div>
                </td>
                <td style={{ ...s.td, fontSize: '0.82rem', color: '#ef4444' }}>{u.issue}</td>
                <td style={{ ...s.td, fontSize: '0.8rem', color: '#9ca3af' }}>{u.last}</td>
                <td style={s.td}>
                  <button style={s.actionBtn}>Review</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SignInsTable rows={signins} />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN VIEW
//  Focus: org-wide security posture, policy controls, audit log, threat intel
// ─────────────────────────────────────────────────────────────────────────────
function AdminSecurityView() {
  const [mfaPolicy,      setMfaPolicy]      = useState(true)
  const [sessionTimeout, setSessionTimeout] = useState(true)
  const [riskEngine,     setRiskEngine]     = useState(true)
  const [stepUpHighRisk, setStepUpHighRisk] = useState(true)

  const orgScore = 74
  const orgAlerts: Alert[] = [
    { level: 'high',   title: '4 users have no MFA enrolled',       detail: 'Enforce MFA policy or suspend access for these accounts.' },
    { level: 'medium', title: '3 high-risk sign-in attempts (24h)', detail: 'Adaptive risk engine flagged anomalous login behaviour.' },
    { level: 'low',    title: 'Password policy not enforced for 2 federated users', detail: 'Review identity provider password settings.' },
  ]

  const orgStats = [
    { label: 'Total Identities',    value: 42,  color: '#1a2e2a' },
    { label: 'Active',              value: 40,  color: '#10b981' },
    { label: 'Suspended',           value: 2,   color: '#ef4444' },
    { label: 'MFA Enrolled',        value: 38,  color: '#3b82f6' },
    { label: 'MFA Not Enrolled',    value: 4,   color: '#f59e0b' },
    { label: 'High-Risk Users',     value: 3,   color: '#ef4444' },
    { label: 'Failed Logins (24h)', value: 7,   color: '#7c5cd8' },
    { label: 'New Joiners (7d)',    value: 6,   color: '#0ea5e9' },
  ]

  const auditLog = [
    { time: 'Today, 09:14',     actor: 'Admin (James Bob)',  action: 'User onboarded',          target: 'alice@mockbank.com',  severity: 'info'    },
    { time: 'Today, 08:45',     actor: 'System',             action: 'High-risk sign-in blocked', target: 'rohit@mockbank.com', severity: 'high'    },
    { time: 'Yesterday, 17:22', actor: 'Admin (James Bob)',  action: 'Role changed to Manager', target: 'bob@mockbank.com',    severity: 'warning' },
    { time: 'Yesterday, 14:10', actor: 'System',             action: 'Failed login (×3)',        target: 'liam@mockbank.com',  severity: 'medium'  },
    { time: '2 days ago, 11:00',actor: 'Admin (James Bob)',  action: 'User suspended',           target: 'old@mockbank.com',   severity: 'warning' },
  ]

  const SEVER_COLOR: Record<string, string> = {
    info: '#3b82f6', warning: '#f59e0b', medium: '#f59e0b', high: '#ef4444',
  }

  function Toggle({ label, sub, checked, onChange }: {
    label: string; sub: string; checked: boolean; onChange: (v: boolean) => void
  }) {
    return (
      <div style={s.policyRow}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.87rem', fontWeight: 600, color: '#1f2328' }}>{label}</div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>{sub}</div>
        </div>
        <button
          style={{ ...s.track, background: checked ? '#1a2e2a' : '#d1d5db' }}
          onClick={() => onChange(!checked)}
        >
          <span style={{ ...s.thumb, transform: checked ? 'translateX(20px)' : 'translateX(2px)' }} />
        </button>
      </div>
    )
  }

  return (
    <>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Security Center</h1>
          <p style={s.pageSub}>Organisation-wide security posture, policy controls, threat intelligence and the full security audit log.</p>
        </div>
        <span style={{ ...s.rolePill, ...s.pillAdmin }}>Admin</span>
      </div>

      {/* Org stats strip */}
      <div style={s.orgStatsRow}>
        {orgStats.map(stat => (
          <div key={stat.label} style={s.orgStatCard}>
            <div style={{ ...s.orgStatVal, color: stat.color }}>{stat.value}</div>
            <div style={s.orgStatLbl}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Org score + alerts */}
      <div style={s.topRow}>
        <ScoreRing score={orgScore} />
        <AlertsCard alerts={orgAlerts} />
      </div>

      {/* Security policy controls */}
      <div style={s.card}>
        <div style={s.cardTitle}>Security Policies</div>
        <Toggle
          label="Enforce MFA for all users"
          sub="Any user without MFA enrolled cannot complete sign-in."
          checked={mfaPolicy} onChange={setMfaPolicy}
        />
        <Toggle
          label="Session timeout (30 min inactivity)"
          sub="Automatically sign out users after 30 minutes of inactivity."
          checked={sessionTimeout} onChange={setSessionTimeout}
        />
        <Toggle
          label="Adaptive risk engine"
          sub="Block or step-up authenticate sign-ins that exceed the risk threshold."
          checked={riskEngine} onChange={setRiskEngine}
        />
        <Toggle
          label="Step-up MFA for high-value transfers"
          sub="Transfers above $100 require a second-factor challenge."
          checked={stepUpHighRisk} onChange={setStepUpHighRisk}
        />
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f3f4f6' }}>
          <button style={s.saveBtn}>Save Policy Changes</button>
        </div>
      </div>

      {/* Tenant SSO / SCIM status */}
      <div style={s.card}>
        <div style={s.cardTitle}>Identity Provider Status</div>
        <div style={s.idpGrid}>
          {[
            { label: 'SSO (OIDC)',        status: 'Active',      color: '#10b981' },
            { label: 'SCIM Provisioning', status: 'Active',      color: '#10b981' },
            { label: 'MFA Enforcement',   status: mfaPolicy ? 'Enforced' : 'Off', color: mfaPolicy ? '#10b981' : '#ef4444' },
            { label: 'Risk Engine',       status: riskEngine ? 'Active' : 'Off',  color: riskEngine ? '#10b981' : '#ef4444' },
          ].map(item => (
            <div key={item.label} style={s.idpCard}>
              <div style={{ ...s.idpDot, background: item.color }} />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1f2328' }}>{item.label}</div>
                <div style={{ fontSize: '0.75rem', color: item.color, fontWeight: 700, marginTop: '0.1rem' }}>{item.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security audit log */}
      <div style={s.card}>
        <div style={s.cardTitleRow}>
          <div style={s.cardTitle}>Security Audit Log</div>
          <button style={s.exportBtn}>Export CSV</button>
        </div>
        <table style={s.table}>
          <thead><tr>
            {['Time','Actor','Action','Target','Severity'].map(h => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {auditLog.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f7f8fa' }}>
                <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.79rem' }}>{row.time}</td>
                <td style={{ ...s.td, fontSize: '0.83rem' }}>{row.actor}</td>
                <td style={{ ...s.td, fontSize: '0.83rem', fontWeight: 500 }}>{row.action}</td>
                <td style={{ ...s.td, fontSize: '0.8rem', color: '#57606a' }}>{row.target}</td>
                <td style={s.td}>
                  <span style={{ ...s.badge,
                    color: SEVER_COLOR[row.severity],
                    background: SEVER_COLOR[row.severity] + '18',
                    border: `1px solid ${SEVER_COLOR[row.severity]}33`,
                  }}>
                    {row.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default function SecurityCenterPage() {
  const { user } = useAuth()
  return (
    <div style={s.root}>
      {user?.role === 'Admin'   && <AdminSecurityView />}
      {user?.role === 'Manager' && <ManagerSecurityView />}
      {(!user?.role || user.role === 'Customer') && <CustomerSecurityView />}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:       { fontFamily: '-apple-system,"Segoe UI",system-ui,sans-serif' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  pageTitle:  { fontSize: '1.4rem', fontWeight: 700, color: '#1a2e2a', margin: 0 },
  pageSub:    { fontSize: '0.82rem', color: '#57606a', marginTop: '0.25rem', maxWidth: '560px' },

  // Role pill
  rolePill:     { fontSize: '0.72rem', fontWeight: 700, padding: '0.3rem 0.9rem', borderRadius: '999px', border: '1px solid', flexShrink: 0, marginTop: '0.2rem' },
  pillCustomer: { background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' },
  pillManager:  { background: '#f5f3ff', color: '#7c3aed', borderColor: '#ddd6fe' },
  pillAdmin:    { background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa' },

  topRow:  { display: 'flex', gap: '1.25rem', marginBottom: '1.25rem', alignItems: 'flex-start' },

  // Score ring
  scoreCard:   { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', minWidth: '170px' },
  scoreLabel:  { fontSize: '0.78rem', fontWeight: 700, color: '#57606a', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '1rem' },
  scoreRing:   { position: 'relative' as const, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  scoreNum:    { position: 'absolute' as const, fontSize: '1.25rem', fontWeight: 800, color: '#1a2e2a' },
  scoreStatus: { marginTop: '0.75rem', fontWeight: 700, fontSize: '0.9rem', color: '#1a2e2a' },

  // Shared card
  card:        { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem 1.5rem', marginBottom: '1.25rem' },
  cardTitle:   { fontSize: '0.9rem', fontWeight: 700, color: '#1a2e2a', marginBottom: '1rem' },
  cardTitleRow:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  empty:       { fontSize: '0.85rem', color: '#57606a', padding: '0.5rem 0' },

  // Alerts
  alertRow:    { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid #f3f4f6' },
  alertDot:    { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '5px' },
  alertTitle:  { fontSize: '0.87rem', fontWeight: 600, color: '#1f2328' },
  alertDetail: { fontSize: '0.78rem', color: '#57606a', marginTop: '0.15rem' },
  badge:       { fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', textTransform: 'capitalize' as const, flexShrink: 0, marginTop: '2px' },

  // Auth methods (Customer)
  methodsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '1rem' },
  methodCard:  { border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  methodTop:   { display: 'flex', justifyContent: 'flex-end' },
  enrolledBadge:{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px' },
  enrolledOn:  { background: '#dcfce7', color: '#16a34a' },
  enrolledOff: { background: '#f3f4f6', color: '#9ca3af' },
  methodName:  { fontSize: '0.88rem', fontWeight: 700, color: '#1f2328' },
  methodDesc:  { fontSize: '0.75rem', color: '#57606a', lineHeight: 1.4, flex: 1 },
  enrollBtn:   { marginTop: '0.5rem', padding: '0.4rem 0.75rem', background: '#1a2e2a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, alignSelf: 'flex-start' as const },

  // Devices
  deviceList:     { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  deviceRow:      { display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.75rem', background: '#f7f8fa', borderRadius: '8px' },
  deviceName:     { fontSize: '0.87rem', fontWeight: 600, color: '#1f2328' },
  deviceMeta:     { fontSize: '0.75rem', color: '#57606a', marginTop: '0.1rem' },
  trustedBadge:   { fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '999px' },
  untrustedBadge: { fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '999px' },
  revokeBtn:      { padding: '0.3rem 0.7rem', background: 'transparent', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 },

  // Manager — team stats
  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.9rem' },
  statTile:    { background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px', padding: '0.85rem' },
  statVal:     { fontSize: '1.6rem', fontWeight: 800, lineHeight: 1 },
  statLbl:     { fontSize: '0.75rem', color: '#57606a', marginTop: '0.4rem', fontWeight: 500 },
  actionBtn:   { padding: '0.3rem 0.65rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontSize: '0.77rem', fontWeight: 600, color: '#1a2e2a' },

  // Admin — org stats strip
  orgStatsRow: { display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: '0.65rem', marginBottom: '1.25rem' },
  orgStatCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0.75rem 1rem' },
  orgStatVal:  { fontSize: '1.55rem', fontWeight: 700, lineHeight: 1 },
  orgStatLbl:  { fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.3rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em' },

  // Admin — policy toggles
  policyRow:  { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.85rem 0', borderBottom: '1px solid #f3f4f6' },
  track:      { width: '44px', height: '24px', borderRadius: '999px', border: 'none', cursor: 'pointer', position: 'relative' as const, padding: 0, flexShrink: 0, transition: 'background 0.2s' },
  thumb:      { position: 'absolute' as const, top: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'transform 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' },
  saveBtn:    { padding: '0.5rem 1.1rem', background: '#1a2e2a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.84rem' },
  exportBtn:  { padding: '0.35rem 0.8rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#57606a' },

  // Admin — IDP status grid
  idpGrid:    { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem' },
  idpCard:    { display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.85rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f3f4f6' },
  idpDot:     { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },

  // Shared table
  table:      { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.83rem' },
  th:         { textAlign: 'left' as const, padding: '0.6rem 0.75rem', color: '#57606a', fontSize: '0.72rem', fontWeight: 700, borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  td:         { padding: '0.7rem 0.75rem', color: '#1f2328', borderBottom: '1px solid #f3f4f6' },
  statusBadge:{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px' },
}

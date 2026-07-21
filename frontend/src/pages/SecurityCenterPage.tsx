import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { T } from '../styles/theme'

// ─── Shared types ─────────────────────────────────────────────────────────────
interface Alert { level: 'high' | 'medium' | 'low'; title: string; detail: string }
interface SignIn { date: string; device: string; location: string; method: string; status: 'success' | 'failed' }

const LEVEL_COLOR: Record<Alert['level'], string> = {
  high: T.red, medium: T.amber, low: T.blue,
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? T.green : score >= 45 ? T.amber : T.red
  return (
    <div style={s.scoreCard}>
      <div style={s.scoreLabel}>Security Score</div>
      <div style={s.scoreRing}>
        <svg viewBox="0 0 80 80" width="80" height="80">
          <circle cx="40" cy="40" r="34" fill="none" stroke={T.borderLight} strokeWidth="8" />
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
            <tr key={i} style={{ background: i % 2 === 0 ? T.bgCard : T.bgMuted }}>
              <td style={s.td}>{r.date}</td>
              <td style={s.td}>{r.device}</td>
              <td style={s.td}>{r.location}</td>
              <td style={s.td}>{r.method}</td>
              <td style={s.td}>
                <span style={{ ...s.statusBadge,
                  background: r.status === 'success' ? T.greenLight : T.redLight,
                  color:      r.status === 'success' ? T.green : T.red,
                  border:     `1px solid ${r.status === 'success' ? T.greenBorder : T.redBorder}`,
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
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Security Center</h1>
          <p style={s.pageSub}>Monitor your personal account security and manage how you sign in.</p>
        </div>
        <span style={{ ...s.rolePill, ...s.pillCustomer }}>Customer</span>
      </div>

      <div style={s.topRow}>
        <ScoreRing score={score} />
        <AlertsCard alerts={alerts} />
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>Your Authentication Methods</div>
        <div style={s.methodsGrid}>
          {methods.map((m, i) => (
            <div key={i} style={{ ...s.methodCard, borderColor: m.enrolled ? T.greenBorder : T.border }}>
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

  const teamStats = [
    { label: 'Users with MFA',          value: 38, total: 42, color: T.green },
    { label: 'Users without MFA',        value: 4,  total: 42, color: T.red },
    { label: 'Suspended accounts',       value: 2,  total: 42, color: T.amber },
    { label: 'Failed logins (24h)',       value: 7,  total: null, color: '#7c5cd8' },
    { label: 'High-risk users',          value: 3,  total: null, color: T.red },
    { label: 'New joiners (7d)',          value: 6,  total: null, color: T.blue },
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

      <div style={s.topRow}>
        <ScoreRing score={myScore} />
        <AlertsCard alerts={myAlerts} />
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>Team Security Overview</div>
        <div style={s.statsGrid}>
          {teamStats.map(stat => (
            <div key={stat.label} style={s.statTile}>
              <div style={{ ...s.statVal, color: stat.color }}>{stat.value}</div>
              {stat.total !== null && (
                <div style={{ height: '4px', background: T.borderLight, borderRadius: '99px', margin: '0.35rem 0' }}>
                  <div style={{ height: '100%', width: `${Math.round((stat.value / stat.total) * 100)}%`, background: stat.color, borderRadius: '99px' }} />
                </div>
              )}
              <div style={s.statLbl}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.card}>
        <div style={s.cardTitleRow}>
          <div style={s.cardTitle}>At-Risk Users</div>
          <span style={{ fontSize: '0.75rem', color: T.inkSub }}>Requires action</span>
        </div>
        <table style={s.table}>
          <thead><tr>
            {['User','Risk Score','Issue','Last Login','Action'].map(h => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {riskUsers.map((u, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? T.bgCard : T.bgMuted }}>
                <td style={s.td}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{u.name}</div>
                  <div style={{ fontSize: '0.74rem', color: T.inkSub }}>{u.email}</div>
                </td>
                <td style={s.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '60px', height: '5px', background: T.bgMuted, borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ width: `${u.risk}%`, height: '100%', background: u.risk > 45 ? T.red : T.amber, borderRadius: '99px' }} />
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: T.inkSub }}>{u.risk}</span>
                  </div>
                </td>
                <td style={{ ...s.td, fontSize: '0.82rem', color: T.red }}>{u.issue}</td>
                <td style={{ ...s.td, fontSize: '0.8rem', color: T.inkSub }}>{u.last}</td>
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
// ─────────────────────────────────────────────────────────────────────────────
function AdminSecurityView() {
  const orgScore = 74
  const orgAlerts: Alert[] = [
    { level: 'high',   title: '4 users have no MFA enrolled',       detail: 'Enforce MFA policy or suspend access for these accounts.' },
    { level: 'medium', title: '3 high-risk sign-in attempts (24h)', detail: 'Adaptive risk engine flagged anomalous login behaviour.' },
    { level: 'low',    title: 'Password policy not enforced for 2 federated users', detail: 'Review identity provider password settings.' },
  ]

  const orgStats = [
    { label: 'Total Identities',    value: 42,  color: T.ink },
    { label: 'Active',              value: 40,  color: T.green },
    { label: 'Suspended',           value: 2,   color: T.red },
    { label: 'MFA Enrolled',        value: 38,  color: T.blue },
    { label: 'MFA Not Enrolled',    value: 4,   color: T.amber },
    { label: 'High-Risk Users',     value: 3,   color: T.red },
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
    info: T.blue, warning: T.amber, medium: T.amber, high: T.red,
  }

  const SECURITY_POLICIES = [
    {
      icon: '🔐',
      title: 'Multi-Factor Authentication (MFA)',
      description: 'All user accounts are required to enrol at least one second factor before completing sign-in. Supported methods include TOTP authenticator apps, push notifications, and hardware security keys.',
      status: 'Enforced',
      statusColor: T.green,
      standard: 'NIST SP 800-63B',
    },
    {
      icon: '⏱',
      title: 'Session Inactivity Timeout',
      description: 'Active sessions are automatically invalidated after 30 minutes of inactivity. Re-authentication is required to resume access, limiting exposure from unattended workstations.',
      status: 'Active',
      statusColor: T.green,
      standard: 'ISO/IEC 27001 A.9.4',
    },
    {
      icon: '🛡',
      title: 'Adaptive Risk Engine',
      description: 'Every sign-in is scored in real time using device fingerprint, geolocation, velocity, and behaviour signals. Sign-ins exceeding the risk threshold are blocked or routed to step-up authentication.',
      status: 'Active',
      statusColor: T.green,
      standard: 'OWASP ASVS 2.2',
    },
    {
      icon: '💸',
      title: 'Step-Up MFA for High-Value Transfers',
      description: 'Transactions above $100 trigger a mandatory second-factor challenge regardless of existing session state, providing an additional control layer against account-takeover fraud.',
      status: 'Enforced',
      statusColor: T.green,
      standard: 'PSD2 SCA / PCI DSS 8.3',
    },
    {
      icon: '🔑',
      title: 'Password Complexity & Rotation',
      description: 'Passwords must be a minimum of 12 characters, include mixed case, digits, and symbols. Passwords that appear in known breach corpuses (HIBP) are rejected at the point of creation.',
      status: 'Enforced',
      statusColor: T.green,
      standard: 'NIST SP 800-63B §5.1',
    },
    {
      icon: '📋',
      title: 'Privileged Access Management (PAM)',
      description: 'Admin and Manager roles are subject to just-in-time access provisioning. All privileged actions require step-up authentication and are immutably recorded in the security audit log.',
      status: 'Enforced',
      statusColor: T.green,
      standard: 'CIS Control 5',
    },
  ]

  return (
    <>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Security Center</h1>
          <p style={s.pageSub}>Organisation-wide security posture, policy controls, threat intelligence and the full security audit log.</p>
        </div>
        <span style={{ ...s.rolePill, ...s.pillAdmin }}>Admin</span>
      </div>

      <div style={s.orgStatsRow}>
        {orgStats.map(stat => (
          <div key={stat.label} style={s.orgStatCard}>
            <div style={{ ...s.orgStatVal, color: stat.color }}>{stat.value}</div>
            <div style={s.orgStatLbl}>{stat.label}</div>
          </div>
        ))}
      </div>

      <div style={s.topRow}>
        <ScoreRing score={orgScore} />
        <AlertsCard alerts={orgAlerts} />
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>Security Policies</div>
        <div style={{ fontSize: '0.8rem', color: T.inkSub, marginBottom: '1.25rem' }}>
          The following policies are centrally enforced by the platform. They apply to all users and cannot be overridden at the individual account level.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
          {SECURITY_POLICIES.map(policy => (
            <div key={policy.title} style={{
              background: T.bgMuted, border: `1px solid ${T.border}`,
              borderRadius: '10px', padding: '1rem 1.1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1rem' }}>{policy.icon}</span>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: T.ink }}>{policy.title}</div>
                </div>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.55rem',
                  borderRadius: '999px', background: policy.statusColor + '18',
                  color: policy.statusColor, border: `1px solid ${policy.statusColor}33`,
                  flexShrink: 0, marginLeft: '0.5rem',
                }}>{policy.status}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: T.inkSub, lineHeight: 1.55, marginBottom: '0.6rem' }}>
                {policy.description}
              </div>
              <div style={{ fontSize: '0.68rem', color: T.inkLight, fontWeight: 600, letterSpacing: '0.03em' }}>
                Standard: {policy.standard}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>Identity Provider Status</div>
        <div style={s.idpGrid}>
          {[
            { label: 'SSO (OIDC)',        status: 'Active',    color: T.green },
            { label: 'SCIM Provisioning', status: 'Active',    color: T.green },
            { label: 'MFA Enforcement',   status: 'Enforced',  color: T.green },
            { label: 'Risk Engine',       status: 'Active',    color: T.green },
          ].map(item => (
            <div key={item.label} style={s.idpCard}>
              <div style={{ ...s.idpDot, background: item.color }} />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: T.ink }}>{item.label}</div>
                <div style={{ fontSize: '0.75rem', color: item.color, fontWeight: 700, marginTop: '0.1rem' }}>{item.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

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
              <tr key={i} style={{ background: i % 2 === 0 ? T.bgCard : T.bgMuted }}>
                <td style={{ ...s.td, color: T.inkSub, fontSize: '0.79rem' }}>{row.time}</td>
                <td style={{ ...s.td, fontSize: '0.83rem' }}>{row.actor}</td>
                <td style={{ ...s.td, fontSize: '0.83rem', fontWeight: 500 }}>{row.action}</td>
                <td style={{ ...s.td, fontSize: '0.8rem', color: T.inkSub }}>{row.target}</td>
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
  root:       { fontFamily: T.fontFamily },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  pageTitle:  { fontSize: '1.5rem', fontWeight: 800, color: T.ink, margin: 0, letterSpacing: '-0.02em' },
  pageSub:    { fontSize: '0.82rem', color: T.inkSub, marginTop: '0.25rem', maxWidth: '560px' },

  // Role pill
  rolePill:     { fontSize: '0.72rem', fontWeight: 700, padding: '0.3rem 0.9rem', borderRadius: '999px', border: '1px solid', flexShrink: 0, marginTop: '0.2rem' },
  pillCustomer: { background: T.blueLight, color: T.blue, borderColor: T.blue + '44' },
  pillManager:  { background: '#3b1fa833', color: '#a78bfa', borderColor: '#7c3aed44' },
  pillAdmin:    { background: T.amberLight, color: T.amber, borderColor: T.amberBorder },

  topRow:  { display: 'flex', gap: '1.25rem', marginBottom: '1.25rem', alignItems: 'flex-start' },

  // Score ring
  scoreCard:   { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusInner, padding: '1.5rem', textAlign: 'center', minWidth: '170px', boxShadow: T.shadowCard },
  scoreLabel:  { fontSize: '0.65rem', fontWeight: 700, color: T.inkSub, textTransform: 'uppercase' as const, letterSpacing: '0.09em', marginBottom: '1rem' },
  scoreRing:   { position: 'relative' as const, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  scoreNum:    { position: 'absolute' as const, fontSize: '1.25rem', fontWeight: 800, color: T.ink },
  scoreStatus: { marginTop: '0.75rem', fontWeight: 700, fontSize: '0.9rem', color: T.ink },

  // Shared card
  card:        { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusCard, padding: '1.25rem 1.5rem', marginBottom: '1.25rem', boxShadow: T.shadowCard },
  cardTitle:   { fontSize: '0.9rem', fontWeight: 700, color: T.ink, marginBottom: '1rem', letterSpacing: '-0.01em' },
  cardTitleRow:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  empty:       { fontSize: '0.85rem', color: T.inkSub, padding: '0.5rem 0' },

  // Alerts
  alertRow:    { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 0', borderBottom: `1px solid ${T.borderLight}` },
  alertDot:    { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '5px' },
  alertTitle:  { fontSize: '0.87rem', fontWeight: 600, color: T.ink },
  alertDetail: { fontSize: '0.78rem', color: T.inkSub, marginTop: '0.15rem' },
  badge:       { fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', textTransform: 'capitalize' as const, flexShrink: 0, marginTop: '2px' },

  // Auth methods (Customer)
  methodsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '1rem' },
  methodCard:  { border: `1px solid ${T.border}`, borderRadius: T.radiusInner, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: T.bgCard },
  methodTop:   { display: 'flex', justifyContent: 'flex-end' },
  enrolledBadge:{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px' },
  enrolledOn:  { background: T.greenLight, color: T.green },
  enrolledOff: { background: T.bgMuted, color: T.inkSub },
  methodName:  { fontSize: '0.88rem', fontWeight: 700, color: T.ink },
  methodDesc:  { fontSize: '0.75rem', color: T.inkSub, lineHeight: 1.4, flex: 1 },
  enrollBtn:   { marginTop: '0.5rem', padding: '0.4rem 0.85rem', background: T.amber, color: '#0d1117', border: 'none', borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, alignSelf: 'flex-start' as const },

  // Devices
  deviceList:     { display: 'flex', flexDirection: 'column', gap: '0.65rem' },
  deviceRow:      { display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.75rem', background: T.bgMuted, borderRadius: '10px', border: `1px solid ${T.border}` },
  deviceName:     { fontSize: '0.87rem', fontWeight: 600, color: T.ink },
  deviceMeta:     { fontSize: '0.75rem', color: T.inkSub, marginTop: '0.1rem' },
  trustedBadge:   { fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', background: T.greenLight, color: T.green, border: `1px solid ${T.greenBorder}`, borderRadius: '999px' },
  untrustedBadge: { fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', background: T.redLight, color: T.red, border: `1px solid ${T.redBorder}`, borderRadius: '999px' },
  revokeBtn:      { padding: '0.3rem 0.7rem', background: T.redLight, border: `1px solid ${T.redBorder}`, color: T.red, borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 },

  // Manager — team stats
  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.9rem' },
  statTile:    { background: T.bgMuted, border: `1px solid ${T.border}`, borderRadius: T.radiusInner, padding: '0.85rem' },
  statVal:     { fontSize: '1.6rem', fontWeight: 800, lineHeight: 1 },
  statLbl:     { fontSize: '0.75rem', color: T.inkSub, marginTop: '0.4rem', fontWeight: 500 },
  actionBtn:   { padding: '0.3rem 0.75rem', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.77rem', fontWeight: 600, color: T.ink },

  // Admin — org stats strip
  orgStatsRow: { display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: '0.65rem', marginBottom: '1.25rem' },
  orgStatCard: { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusInner, padding: '0.75rem 1rem', boxShadow: T.shadowCard },
  orgStatVal:  { fontSize: '1.55rem', fontWeight: 700, lineHeight: 1 },
  orgStatLbl:  { fontSize: '0.65rem', color: T.inkLight, marginTop: '0.3rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em' },

  // Admin — policy toggles
  policyRow:  { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.85rem 0', borderBottom: `1px solid ${T.borderLight}` },
  track:      { width: '44px', height: '24px', borderRadius: '999px', border: 'none', cursor: 'pointer', position: 'relative' as const, padding: 0, flexShrink: 0, transition: 'background 0.2s' },
  thumb:      { position: 'absolute' as const, top: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'transform 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' },
  saveBtn:    { padding: '0.5rem 1.2rem', background: T.ink, color: T.bg, border: 'none', borderRadius: T.radiusPill, cursor: 'pointer', fontWeight: 700, fontSize: '0.84rem' },
  exportBtn:  { padding: '0.35rem 0.8rem', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusPill, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: T.inkSub },

  // Admin — IDP status grid
  idpGrid:    { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem' },
  idpCard:    { display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.85rem', background: T.bgMuted, borderRadius: T.radiusInner, border: `1px solid ${T.border}` },
  idpDot:     { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },

  // Shared table
  table:      { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.83rem' },
  th:         { textAlign: 'left' as const, padding: '0.6rem 0.75rem', color: T.inkSub, fontSize: '0.68rem', fontWeight: 700, borderBottom: `1px solid ${T.border}`, textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  td:         { padding: '0.7rem 0.75rem', color: T.ink, borderBottom: `1px solid ${T.borderLight}` },
  statusBadge:{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px' },
}

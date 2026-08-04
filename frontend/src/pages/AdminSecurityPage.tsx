/**
 * AdminSecurityPage — dark-themed Security Center for the HR Admin portal.
 * Uses T (dark) tokens. Shown only to Admin role at /admin/security.
 */
import React, { useEffect, useState } from 'react'
import api from '../api/axios'
import { T } from '../styles/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Alert { level: 'high' | 'medium' | 'low'; title: string; detail: string }

const LEVEL_COLOR: Record<Alert['level'], string> = {
  high: T.red, medium: T.amber, low: T.blue,
}

// ─── Score ring ───────────────────────────────────────────────────────────────
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

// ─── Alerts card ──────────────────────────────────────────────────────────────
function AlertsCard({ alerts }: { alerts: Alert[] }) {
  return (
    <div style={{ ...s.card, flex: 1 }}>
      <div style={s.cardTitle}>Risk Alerts</div>
      {alerts.length === 0 ? (
        <div style={s.empty}>No active alerts.</div>
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

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface AuditEntry {
  action: string; actor_name: string; target_email: string
  details: string; created_at: string
}
interface DirectoryUser {
  id: string; is_active: boolean
  created_at: string | null; mfa_enrolled: boolean | null
}
interface IbvPlatformEvent {
  time?: string; action?: string; eventType?: string; type?: string
  actorId?: string; targetId?: string; outcome?: string; result?: string
  ipAddress?: string; ip?: string
  actor?: { displayName?: string }
  target?: { displayName?: string }
}

const ACTION_LABEL: Record<string, string> = {
  joiner:           'User onboarded',
  mover:            'Role / profile changed',
  leaver_disable:   'Access suspended',
  leaver_reinstate: 'Access reinstated',
  leaver_delete:    'Identity deleted',
}
const ACTION_SEVERITY: Record<string, string> = {
  joiner: 'info', mover: 'warning',
  leaver_disable: 'warning', leaver_reinstate: 'info', leaver_delete: 'high',
}
const SEVER_COLOR: Record<string, string> = {
  info: T.blue, warning: T.amber, medium: T.amber, high: T.red,
}

function formatRelativeTime(iso: string): string {
  try {
    const diff  = Date.now() - new Date(iso).getTime()
    const mins  = Math.floor(diff / 60_000)
    const hours = Math.floor(diff / 3_600_000)
    const days  = Math.floor(diff / 86_400_000)
    if (mins  <  2) return 'Just now'
    if (mins  < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days  <  2) return 'Yesterday'
    return `${days} days ago`
  } catch { return '—' }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function AdminSecurityPage() {
  const [auditLog,     setAuditLog]     = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [dirUsers,     setDirUsers]     = useState<DirectoryUser[]>([])
  const [dirLoading,   setDirLoading]   = useState(true)
  const [ibvEvents,    setIbvEvents]    = useState<IbvPlatformEvent[]>([])
  const [ibvLoading,   setIbvLoading]   = useState(true)

  useEffect(() => {
    api.get<AuditEntry[]>('/users/audit/recent', { params: { limit: 50 } })
      .then(r => setAuditLog(r.data)).catch(() => setAuditLog([]))
      .finally(() => setAuditLoading(false))
    api.get<{ users: DirectoryUser[]; total: number }>('/users', { params: { page_size: 200 } })
      .then(r => setDirUsers(r.data.users)).catch(() => setDirUsers([]))
      .finally(() => setDirLoading(false))
    api.get<{ events: IbvPlatformEvent[] }>('/users/audit/ibm-activity', { params: { limit: 20 } })
      .then(r => setIbvEvents(r.data.events ?? [])).catch(() => setIbvEvents([]))
      .finally(() => setIbvLoading(false))
  }, [])

  const loading        = auditLoading || dirLoading
  const totalIdentities = dirUsers.length
  const activeCount     = dirUsers.filter(u => u.is_active).length
  const suspendedCount  = dirUsers.filter(u => !u.is_active).length
  const mfaEnrolled     = dirUsers.filter(u => u.mfa_enrolled === true).length
  const mfaNotEnrolled  = dirUsers.filter(u => u.mfa_enrolled === false).length
  const now = Date.now()
  const joined7d = dirUsers.filter(u => {
    try { return u.created_at && now - new Date(u.created_at).getTime() < 7 * 86_400_000 }
    catch { return false }
  }).length
  const suspendEvents = auditLog.filter(e => e.action === 'leaver_disable').length
  const orgScore = loading ? 0 : Math.max(40, Math.round(
    100
    - (suspendedCount  / Math.max(totalIdentities, 1)) * 25
    - (mfaNotEnrolled  / Math.max(totalIdentities, 1)) * 30
    - suspendEvents * 2
  ))

  const orgStats = [
    { label: 'Total Identities', value: loading ? '…' : totalIdentities, color: T.inkSub },
    { label: 'Active',           value: loading ? '…' : activeCount,     color: T.green  },
    { label: 'Suspended',        value: loading ? '…' : suspendedCount,  color: T.red    },
    { label: 'New Joiners (7d)', value: loading ? '…' : joined7d,        color: T.green  },
    { label: 'MFA Enrolled',     value: loading ? '…' : mfaEnrolled,     color: T.blue   },
    { label: 'MFA Not Enrolled', value: loading ? '…' : mfaNotEnrolled,  color: T.amber  },
  ]
  const orgAlerts: Alert[] = [
    ...(mfaNotEnrolled > 0 ? [{ level: 'high' as const,
      title: `${mfaNotEnrolled} user${mfaNotEnrolled > 1 ? 's have' : ' has'} no MFA enrolled`,
      detail: 'Enforce MFA policy or suspend access for these accounts.' }] : []),
    ...(suspendedCount > 0 ? [{ level: 'medium' as const,
      title: `${suspendedCount} account${suspendedCount > 1 ? 's' : ''} currently suspended`,
      detail: 'Review suspended identities and confirm offboarding is complete.' }] : []),
  ]

  const SECURITY_POLICIES = [
    { icon: '🔐', title: 'Multi-Factor Authentication (MFA)',
      description: 'All user accounts are required to enrol at least one second factor. Supported: TOTP authenticator apps, push notifications, and hardware passkeys.',
      status: 'Enforced', statusColor: T.green, standard: 'NIST SP 800-63B' },
    { icon: '⏱', title: 'Session Inactivity Timeout',
      description: 'Active sessions are automatically invalidated after 60 minutes. Re-authentication required to resume access.',
      status: 'Active', statusColor: T.green, standard: 'ISO/IEC 27001 A.9.4' },
    { icon: '🛡', title: 'Adaptive Risk Engine',
      description: 'Every sign-in is scored in real time using device, location, velocity, and behaviour signals.',
      status: 'Active', statusColor: T.green, standard: 'OWASP ASVS 2.2' },
    { icon: '💸', title: 'Step-Up Auth for High-Value Approvals',
      description: 'Loan approvals above ₹5,00,000 trigger a mandatory step-up authentication challenge before the decision is recorded.',
      status: 'Enforced', statusColor: T.green, standard: 'PSD2 SCA / PCI DSS 8.3' },
    { icon: '🔑', title: 'Password Complexity & Reset',
      description: 'Password policy enforced via Cloud Directory. Admin-initiated resets set a temporary credential and force change on next login.',
      status: 'Enforced', statusColor: T.green, standard: 'NIST SP 800-63B §5.1' },
    { icon: '📋', title: 'Privileged Access Management (PAM)',
      description: 'All Mover (role change) operations require step-up authentication. Every identity lifecycle action is immutably recorded in the audit log.',
      status: 'Enforced', statusColor: T.green, standard: 'CIS Control 5' },
  ]

  return (
    <div style={{ fontFamily: T.fontFamily }}>
      {/* Page header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Security Center</h1>
          <p style={s.pageSub}>Organisation-wide security posture, policy controls, and the full identity lifecycle audit log.</p>
        </div>
        <span style={{ ...s.rolePill, background: T.amberLight, color: T.amber, borderColor: T.amberBorder }}>Admin</span>
      </div>

      {/* Identity stats strip */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={s.orgStatsLegend}>
          {orgStats.map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && <span style={s.orgLegendDivider} />}
              <div style={s.orgLegendItem}>
                <span style={{ ...s.orgLegendDot, background: stat.color }} />
                <span style={s.orgLegendLabel}>{stat.label}</span>
                <span style={{ ...s.orgLegendValue, color: stat.color }}>{stat.value}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
        {loading && (
          <div style={{ fontSize: '0.72rem', color: T.inkSub, marginTop: '0.4rem', paddingLeft: '0.5rem' }}>
            Loading live data…
          </div>
        )}
      </div>

      {/* Score + Alerts */}
      <div style={s.topRow}>
        <ScoreRing score={orgScore} />
        <AlertsCard alerts={orgAlerts} />
      </div>

      {/* Security policies */}
      <div style={s.card}>
        <div style={s.cardTitle}>Security Policies</div>
        <div style={{ fontSize: '0.8rem', color: T.inkSub, marginBottom: '1.25rem' }}>
          The following policies are centrally enforced and apply to all workforce identities.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
          {SECURITY_POLICIES.map(policy => (
            <div key={policy.title} style={{ background: T.bgMuted, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '1rem 1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1rem' }}>{policy.icon}</span>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: T.ink }}>{policy.title}</div>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: '999px', background: policy.statusColor + '18', color: policy.statusColor, border: `1px solid ${policy.statusColor}33`, flexShrink: 0, marginLeft: '0.5rem' }}>
                  {policy.status}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: T.inkSub, lineHeight: 1.55, marginBottom: '0.6rem' }}>{policy.description}</div>
              <div style={{ fontSize: '0.68rem', color: T.inkLight, fontWeight: 600, letterSpacing: '0.03em' }}>Standard: {policy.standard}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Identity Provider status */}
      <div style={s.card}>
        <div style={s.cardTitle}>Identity Provider Status</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem' }}>
          {[
            { label: 'SSO (OIDC)',        status: 'Active',   color: T.green },
            { label: 'SCIM Provisioning', status: 'Active',   color: T.green },
            { label: 'MFA Enforcement',   status: 'Enforced', color: T.green },
            { label: 'Risk Engine',       status: 'Active',   color: T.green },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.85rem', background: T.bgMuted, borderRadius: '8px', border: `1px solid ${T.border}` }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: T.ink }}>{item.label}</div>
                <div style={{ fontSize: '0.75rem', color: item.color, fontWeight: 700, marginTop: '0.1rem' }}>{item.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* IBM Verify platform events */}
      <div style={s.card}>
        <div style={s.cardTitleRow}>
          <div style={s.cardTitle}>Authentication Events</div>
          <span style={{ fontSize: '0.73rem', color: T.inkSub }}>
            {ibvLoading ? 'Loading…' : `${ibvEvents.length} event${ibvEvents.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        {ibvLoading ? (
          <div style={{ fontSize: '0.85rem', color: T.inkSub, padding: '1rem 0' }}>Loading…</div>
        ) : ibvEvents.length === 0 ? (
          <div style={{ fontSize: '0.85rem', color: T.inkSub, padding: '1rem 0' }}>
            No authentication events available.
            <div style={{ fontSize: '0.77rem', color: T.inkLight, marginTop: '0.25rem' }}>
              Enable <strong>readActivity</strong> scope on the API client (Applications → API Access → Permissions).
            </div>
          </div>
        ) : (
          <table style={s.table}>
            <thead><tr>
              {['Time', 'Action / Event', 'Actor', 'Target', 'Outcome', 'IP'].map(h => <th key={h} style={s.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {ibvEvents.map((ev, i) => {
                const action  = ev.action || ev.eventType || ev.type || '—'
                const actor   = ev.actor?.displayName || ev.actorId || '—'
                const target  = ev.target?.displayName || ev.targetId || '—'
                const outcome = ev.outcome || ev.result || '—'
                const ip      = ev.ipAddress || ev.ip || '—'
                const timeStr = ev.time ? new Date(ev.time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
                const isOk    = !outcome || outcome.toLowerCase().includes('success') || outcome.toLowerCase().includes('allow')
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? T.bgCard : T.bgMuted }}>
                    <td style={{ ...s.td, color: T.inkSub, fontSize: '0.79rem', whiteSpace: 'nowrap' }}>{timeStr}</td>
                    <td style={{ ...s.td, fontSize: '0.82rem', fontWeight: 500 }}>{action}</td>
                    <td style={{ ...s.td, fontSize: '0.8rem', color: T.inkSub }}>{actor}</td>
                    <td style={{ ...s.td, fontSize: '0.8rem', color: T.inkSub }}>{target}</td>
                    <td style={s.td}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px', background: isOk ? T.greenLight : T.redLight, color: isOk ? T.green : T.red, border: `1px solid ${isOk ? T.greenBorder : T.redBorder}` }}>
                        {outcome}
                      </span>
                    </td>
                    <td style={{ ...s.td, fontSize: '0.78rem', color: T.inkLight }}>{ip}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* JML audit log */}
      <div style={s.card}>
        <div style={s.cardTitleRow}>
          <div style={s.cardTitle}>Identity Lifecycle Audit Log</div>
          <span style={{ fontSize: '0.75rem', color: T.inkSub }}>Joiner · Mover · Leaver events</span>
        </div>
        {auditLoading ? (
          <div style={{ fontSize: '0.85rem', color: T.inkSub, padding: '1rem 0' }}>Loading audit log…</div>
        ) : auditLog.length === 0 ? (
          <div style={{ fontSize: '0.85rem', color: T.inkSub, padding: '1rem 0' }}>No lifecycle events recorded yet.</div>
        ) : (
          <table style={s.table}>
            <thead><tr>
              {['Time', 'Actor', 'Action', 'Target', 'Severity'].map(h => <th key={h} style={s.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {auditLog.map((row, i) => {
                const severity = ACTION_SEVERITY[row.action] ?? 'info'
                const sevColor = SEVER_COLOR[severity] ?? T.blue
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? T.bgCard : T.bgMuted }}>
                    <td style={{ ...s.td, color: T.inkSub, fontSize: '0.79rem' }}>{formatRelativeTime(row.created_at)}</td>
                    <td style={{ ...s.td, fontSize: '0.83rem' }}>{row.actor_name}</td>
                    <td style={{ ...s.td, fontSize: '0.83rem', fontWeight: 500 }}>
                      {ACTION_LABEL[row.action] ?? row.action}
                      {row.details ? <span style={{ fontWeight: 400, color: T.inkSub }}> — {row.details}</span> : null}
                    </td>
                    <td style={{ ...s.td, fontSize: '0.8rem', color: T.inkSub }}>{row.target_email}</td>
                    <td style={s.td}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', textTransform: 'capitalize' as const, color: sevColor, background: sevColor + '18', border: `1px solid ${sevColor}33` }}>
                        {severity}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  pageHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  pageTitle:     { fontSize: '1.5rem', fontWeight: 800, color: T.ink, margin: 0, letterSpacing: '-0.02em' },
  pageSub:       { fontSize: '0.82rem', color: T.inkSub, marginTop: '0.25rem', maxWidth: '560px' },
  rolePill:      { fontSize: '0.72rem', fontWeight: 700, padding: '0.3rem 0.9rem', borderRadius: '999px', border: '1px solid', flexShrink: 0, marginTop: '0.2rem' },
  topRow:        { display: 'flex', gap: '1.25rem', marginBottom: '1.25rem', alignItems: 'flex-start' },

  scoreCard:     { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusInner, padding: '1.5rem', textAlign: 'center', minWidth: '170px', boxShadow: T.shadowCard },
  scoreLabel:    { fontSize: '0.65rem', fontWeight: 700, color: T.inkSub, textTransform: 'uppercase' as const, letterSpacing: '0.09em', marginBottom: '1rem' },
  scoreRing:     { position: 'relative' as const, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  scoreNum:      { position: 'absolute' as const, fontSize: '1.25rem', fontWeight: 800, color: T.ink },
  scoreStatus:   { marginTop: '0.75rem', fontWeight: 700, fontSize: '0.9rem', color: T.ink },

  card:          { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusCard, padding: '1.25rem 1.5rem', marginBottom: '1.25rem', boxShadow: T.shadowCard },
  cardTitle:     { fontSize: '0.9rem', fontWeight: 700, color: T.ink, marginBottom: '1rem', letterSpacing: '-0.01em' },
  cardTitleRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  empty:         { fontSize: '0.85rem', color: T.inkSub, padding: '0.5rem 0' },

  alertRow:      { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 0', borderBottom: `1px solid ${T.borderLight}` },
  alertDot:      { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '5px' },
  alertTitle:    { fontSize: '0.87rem', fontWeight: 600, color: T.ink },
  alertDetail:   { fontSize: '0.78rem', color: T.inkSub, marginTop: '0.15rem' },
  badge:         { fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', textTransform: 'capitalize' as const, flexShrink: 0, marginTop: '2px' },

  orgStatsLegend:   { display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusInner, padding: '0.7rem 1.25rem', boxShadow: T.shadowCard, gap: 0 },
  orgLegendItem:    { display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.3rem 0.85rem' },
  orgLegendDot:     { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  orgLegendLabel:   { fontSize: '0.72rem', fontWeight: 600, color: T.inkSub, textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  orgLegendValue:   { fontSize: '1rem', fontWeight: 700, lineHeight: 1 },
  orgLegendDivider: { width: '1px', height: '28px', background: T.border, flexShrink: 0 },

  table:         { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.83rem' },
  th:            { textAlign: 'left' as const, padding: '0.6rem 0.75rem', color: T.inkSub, fontSize: '0.68rem', fontWeight: 700, borderBottom: `1px solid ${T.border}`, textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  td:            { padding: '0.7rem 0.75rem', color: T.ink, borderBottom: `1px solid ${T.borderLight}` },
}

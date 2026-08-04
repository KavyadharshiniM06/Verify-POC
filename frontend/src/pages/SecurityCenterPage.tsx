/**
 * SecurityCenterPage — light-themed Security Center for the Analyst portal.
 * Uses LT (light) tokens. Shown only to Manager / SalesforceManager roles at /security.
 */
import React, { useEffect, useState } from 'react'
import api from '../api/axios'
import { LT as T } from '../styles/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Alert { level: 'high' | 'medium' | 'low'; title: string; detail: string }
interface SignIn { date: string; device: string; location: string; method: string; status: 'success' | 'failed' }

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

// ─── Sign-ins table ───────────────────────────────────────────────────────────
function SignInsTable({ rows, loading }: { rows: SignIn[]; loading?: boolean }) {
  if (loading) {
    return (
      <div style={s.card}>
        <div style={s.cardTitle}>Recent Sign-Ins</div>
        <div style={{ fontSize: '0.85rem', color: T.inkSub, padding: '1rem 0' }}>Loading sign-in history…</div>
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div style={s.card}>
        <div style={s.cardTitleRow}>
          <div style={s.cardTitle}>Recent Sign-Ins</div>
        </div>
        <div style={{ fontSize: '0.85rem', color: T.inkSub, padding: '1rem 0' }}>No recent authentication events found.</div>
      </div>
    )
  }
  return (
    <div style={s.card}>
      <div style={s.cardTitleRow}>
        <div style={s.cardTitle}>Recent Sign-Ins</div>
        <span style={{ fontSize: '0.73rem', color: T.inkSub }}>Live</span>
      </div>
      <table style={s.table}>
        <thead><tr>
          {['Date & Time', 'IP / Actor', 'Method', 'Action', 'Status'].map(h => (
            <th key={h} style={s.th}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? T.bgCard : T.bgMuted }}>
              <td style={s.td}>{r.date}</td>
              <td style={s.td}>{r.device}</td>
              <td style={s.td}>{r.method}</td>
              <td style={{ ...s.td, color: T.inkSub, fontSize: '0.79rem' }}>{r.location}</td>
              <td style={s.td}>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px',
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

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface IbvEvent {
  time: string; action: string; actor: string
  target: string; outcome: string; ip: string
}
interface MeFactors {
  fido2: boolean | unknown[]; totp: boolean | unknown[]
  push: boolean | unknown[]; email_otp: boolean | unknown[]; sso: boolean
  [key: string]: boolean | unknown[]
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function SecurityCenterPage() {
  const [activity,   setActivity]   = useState<IbvEvent[]>([])
  const [actLoading, setActLoading] = useState(true)
  const [factors,    setFactors]    = useState<MeFactors | null>(null)

  useEffect(() => {
    api.get<{ events: IbvEvent[] }>('/users/me/activity', { params: { limit: 10 } })
      .then(r => setActivity(r.data.events ?? []))
      .catch(() => setActivity([]))
      .finally(() => setActLoading(false))
    api.get<{ enrolled_factors: MeFactors }>('/users/me')
      .then(r => setFactors(r.data.enrolled_factors))
      .catch(() => {})
  }, [])

  const hasMfa = factors ? !!(factors.totp || factors.push || factors.fido2 || factors.email_otp) : null
  const myScore = hasMfa == null ? 0 : (hasMfa ? 85 : 55)

  const myAlerts: Alert[] = [
    ...(hasMfa === false ? [{ level: 'high' as const,
      title: 'No MFA factor enrolled',
      detail: 'Enroll a second factor in Settings → Identity to protect your account.' }] : []),
    ...(hasMfa === true  ? [{ level: 'low' as const,
      title: 'MFA is active on your account',
      detail: 'Your account is protected by a second factor.' }] : []),
  ]

  function ibvToSignIn(ev: IbvEvent): SignIn {
    const ac = (ev.action || '').toLowerCase()
    const oc = (ev.outcome || '').toLowerCase()
    const succeeded = !oc || oc.includes('success') || oc.includes('allow')
    const method =
      ac.includes('fido') ? 'Passkey' : ac.includes('totp') ? 'TOTP' :
      ac.includes('push') ? 'Push'    : ac.includes('email') ? 'Email OTP' :
      ac.includes('password') ? 'Password' : 'SSO'
    const dateStr = ev.time
      ? new Date(ev.time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '—'
    return { date: dateStr, device: ev.ip || '—', location: ev.action || '—', method, status: succeeded ? 'success' : 'failed' }
  }

  const FACTOR_TILES = [
    { label: 'Passkey / FIDO2',      key: 'fido2',     color: '#a78bfa' },
    { label: 'Authenticator (TOTP)', key: 'totp',      color: T.blue   },
    { label: 'Push Notification',    key: 'push',      color: T.amber  },
    { label: 'Email OTP',            key: 'email_otp', color: T.green  },
    { label: 'SSO (OIDC)',           key: 'sso',       color: T.green  },
  ]

  return (
    <div style={{ fontFamily: T.fontFamily }}>
      {/* Page header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Security Center</h1>
          <p style={s.pageSub}>Your personal security posture. Sign-in history and enrolled factor status.</p>
        </div>
        <span style={{ ...s.rolePill, background: '#ede9fe', color: '#7c3aed', border: '1px solid #c4b5fd' }}>
          Credit Analyst
        </span>
      </div>

      {/* Score + Alerts */}
      <div style={s.topRow}>
        <ScoreRing score={myScore} />
        <AlertsCard alerts={myAlerts} />
      </div>

      {/* Enrolled factors */}
      <div style={s.card}>
        <div style={s.cardTitle}>Your Enrolled Factors</div>
        <div style={s.statsGrid}>
          {FACTOR_TILES.map(ft => {
            const enrolled = factors ? !!(factors as Record<string, unknown>)[ft.key] : null
            return (
              <div key={ft.label} style={s.statTile}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                  fontSize: '0.7rem', fontWeight: 700, padding: '0.18rem 0.5rem',
                  borderRadius: '999px', marginBottom: '0.4rem',
                  background: enrolled ? ft.color + '18' : T.bgMuted,
                  color: enrolled ? ft.color : T.inkSub,
                  border: `1px solid ${enrolled ? ft.color + '44' : T.border}`,
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: enrolled ? ft.color : T.inkLight }} />
                  {enrolled == null ? '—' : enrolled ? 'Enrolled' : 'Not enrolled'}
                </span>
                <div style={s.statLbl}>{ft.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sign-in history */}
      <SignInsTable rows={activity.map(ibvToSignIn)} loading={actLoading} />
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  pageHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  pageTitle:   { fontSize: '1.5rem', fontWeight: 800, color: T.ink, margin: 0, letterSpacing: '-0.02em' },
  pageSub:     { fontSize: '0.82rem', color: T.inkSub, marginTop: '0.25rem', maxWidth: '560px' },
  rolePill:    { fontSize: '0.72rem', fontWeight: 700, padding: '0.3rem 0.9rem', borderRadius: '999px', border: '1px solid', flexShrink: 0, marginTop: '0.2rem' },
  topRow:      { display: 'flex', gap: '1.25rem', marginBottom: '1.25rem', alignItems: 'flex-start' },

  scoreCard:   { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusInner, padding: '1.5rem', textAlign: 'center', minWidth: '170px', boxShadow: T.shadowCard },
  scoreLabel:  { fontSize: '0.65rem', fontWeight: 700, color: T.inkSub, textTransform: 'uppercase' as const, letterSpacing: '0.09em', marginBottom: '1rem' },
  scoreRing:   { position: 'relative' as const, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  scoreNum:    { position: 'absolute' as const, fontSize: '1.25rem', fontWeight: 800, color: T.ink },
  scoreStatus: { marginTop: '0.75rem', fontWeight: 700, fontSize: '0.9rem', color: T.ink },

  card:        { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusCard, padding: '1.25rem 1.5rem', marginBottom: '1.25rem', boxShadow: T.shadowCard },
  cardTitle:   { fontSize: '0.9rem', fontWeight: 700, color: T.ink, marginBottom: '1rem', letterSpacing: '-0.01em' },
  cardTitleRow:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  empty:       { fontSize: '0.85rem', color: T.inkSub, padding: '0.5rem 0' },

  alertRow:    { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 0', borderBottom: `1px solid ${T.borderLight}` },
  alertDot:    { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '5px' },
  alertTitle:  { fontSize: '0.87rem', fontWeight: 600, color: T.ink },
  alertDetail: { fontSize: '0.78rem', color: T.inkSub, marginTop: '0.15rem' },
  badge:       { fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', textTransform: 'capitalize' as const, flexShrink: 0, marginTop: '2px' },

  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.9rem' },
  statTile:    { background: T.bgMuted, border: `1px solid ${T.border}`, borderRadius: T.radiusInner, padding: '0.85rem' },
  statLbl:     { fontSize: '0.75rem', color: T.inkSub, marginTop: '0.4rem', fontWeight: 500 },

  table:       { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.83rem' },
  th:          { textAlign: 'left' as const, padding: '0.6rem 0.75rem', color: T.inkSub, fontSize: '0.68rem', fontWeight: 700, borderBottom: `1px solid ${T.border}`, textTransform: 'uppercase' as const, letterSpacing: '0.07em' },
  td:          { padding: '0.7rem 0.75rem', color: T.ink, borderBottom: `1px solid ${T.borderLight}` },
}

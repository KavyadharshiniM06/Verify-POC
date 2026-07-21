import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { T } from '../styles/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
type Section =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'preferences'
  | 'organization'
  | 'developers'

interface Toast { msg: string; kind: 'success' | 'error' }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Field({
  label, value, type = 'text', onChange, readonly = false, hint,
}: {
  label: string; value: string; type?: string
  onChange?: (v: string) => void; readonly?: boolean; hint?: string
}) {
  return (
    <div style={f.fieldWrap}>
      <label style={f.label}>{label}</label>
      <input
        type={type}
        value={value}
        readOnly={readonly}
        onChange={e => onChange?.(e.target.value)}
        style={{ ...f.input, ...(readonly ? f.inputReadonly : {}) }}
      />
      {hint && <div style={f.hint}>{hint}</div>}
    </div>
  )
}

function Toggle({ label, sub, checked, onChange, disabled }: {
  label: string; sub?: string; checked: boolean
  onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div style={f.toggleRow}>
      <div style={{ flex: 1 }}>
        <div style={{ ...f.toggleLabel, opacity: disabled ? 0.45 : 1 }}>{label}</div>
        {sub && <div style={{ ...f.toggleSub, opacity: disabled ? 0.45 : 1 }}>{sub}</div>}
      </div>
      <button
            style={{ ...f.track, background: checked ? T.amber : T.borderLight, opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer' }}
        onClick={() => !disabled && onChange(!checked)}
        aria-pressed={checked}
        disabled={disabled}
      >
        <span style={{ ...f.thumb, transform: checked ? 'translateX(20px)' : 'translateX(2px)' }} />
      </button>
    </div>
  )
}

function SectionCard({ title, children, action }: {
  title: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div style={f.card}>
      <div style={f.cardHead}>
        <div style={f.cardTitle}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

function SaveBtn({ onClick, loading, label }: { onClick: () => void; loading?: boolean; label?: string }) {
  return (
    <button style={f.saveBtn} onClick={onClick} disabled={loading}>
      {loading ? 'Saving…' : (label ?? 'Save changes')}
    </button>
  )
}

function CancelBtn({ onClick }: { onClick: () => void }) {
  return <button style={f.cancelBtn} onClick={onClick}>Cancel</button>
}

function Select({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  return (
    <div style={f.fieldWrap}>
      <label style={f.label}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={f.select}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
}

function InfoBanner({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ padding: '0.75rem 1rem', background: T.blueLight, borderRadius: '8px', border: `1px solid ${T.blue}44`, display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.75rem' }}>
      <span style={{ fontSize: '1rem', marginTop: '1px' }}>{icon}</span>
      <span style={{ fontSize: '0.8rem', color: T.blue, lineHeight: 1.5 }}>{text}</span>
    </div>
  )
}

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ALL: { id: Section; label: string; icon: string; roles: string[] }[] = [
  { id: 'profile',       label: 'Profile',       icon: '👤', roles: ['Customer','Manager','Admin'] },
  { id: 'security',      label: 'Security',       icon: '🔒', roles: ['Customer','Manager','Admin'] },
  { id: 'notifications', label: 'Notifications',  icon: '🔔', roles: ['Customer','Manager','Admin'] },
  { id: 'preferences',   label: 'Preferences',    icon: '🎛', roles: ['Customer','Manager','Admin'] },
  { id: 'organization',  label: 'Organization',   icon: '🏢', roles: ['Manager','Admin'] },
  { id: 'developers',    label: 'Developers',     icon: '⚙️', roles: ['Manager','Admin'] },
]

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuth()
  const role = user?.role ?? 'Customer'
  const [section, setSection] = useState<Section>('profile')
  const [toast,   setToast]   = useState<Toast | null>(null)

  const nav = NAV_ALL.filter(n => n.roles.includes(role))
  const activeSection = nav.find(n => n.id === section) ? section : nav[0]?.id ?? 'profile'

  const showToast = (msg: string, kind: Toast['kind'] = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3200)
  }

  return (
    <div style={s.root}>
      {toast && (
        <div style={{ ...s.toast, background: toast.kind === 'success' ? '#ffffff' : T.red, color: toast.kind === 'success' ? '#111827' : '#fff', border: toast.kind === 'success' ? '1px solid #e5e7eb' : 'none' }}>
          {toast.kind === 'success' ? '✓' : '✗'}  {toast.msg}
        </div>
      )}

      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Settings</h1>
          <p style={s.pageSub}>
            {role === 'Customer'
              ? 'Manage your account preferences, security settings and notification options.'
              : role === 'Manager'
              ? 'Manage your profile, security settings, organisation details and integrations.'
              : 'Manage system-wide configuration, developer access, organisation settings and your profile.'}
          </p>
        </div>
        <div style={{ ...s.roleBadge, ...(role === 'Admin' ? s.roleBadgeAdmin : role === 'Manager' ? s.roleBadgeMgr : s.roleBadgeCust) }}>
          {role}
        </div>
      </div>

      <div style={s.body}>
        <aside style={s.sidebar}>
          <div style={s.navGroup}>ACCOUNT</div>
          {nav.filter(n => ['profile','security','notifications','preferences'].includes(n.id)).map(n => (
            <button key={n.id}
              style={{ ...s.navBtn, ...(activeSection === n.id ? s.navBtnActive : {}) }}
              onClick={() => setSection(n.id)}
            >
              <span style={s.navIcon}>{n.icon}</span>{n.label}
            </button>
          ))}

          {nav.some(n => ['organization','developers'].includes(n.id)) && (
            <>
              <div style={{ ...s.navGroup, marginTop: '1rem' }}>WORKSPACE</div>
              {nav.filter(n => ['organization','developers'].includes(n.id)).map(n => (
                <button key={n.id}
                  style={{ ...s.navBtn, ...(activeSection === n.id ? s.navBtnActive : {}) }}
                  onClick={() => setSection(n.id)}
                >
                  <span style={s.navIcon}>{n.icon}</span>{n.label}
                </button>
              ))}
            </>
          )}
        </aside>

        <div style={s.content}>
          {activeSection === 'profile'       && <ProfileSection       user={user} role={role} showToast={showToast} />}
          {activeSection === 'security'      && <SecuritySection      role={role} showToast={showToast} />}
          {activeSection === 'notifications' && <NotificationsSection role={role} showToast={showToast} />}
          {activeSection === 'preferences'   && <PreferencesSection   showToast={showToast} />}
          {activeSection === 'organization'  && <OrganizationSection  role={role} showToast={showToast} />}
          {activeSection === 'developers'    && <DevelopersSection    role={role} showToast={showToast} />}
        </div>
      </div>
    </div>
  )
}

// ─── Profile ─────────────────────────────────────────────────────────────────
function ProfileSection({ user, role, showToast }: {
  user: { name: string; email: string; role: string } | null
  role: string
  showToast: (m: string) => void
}) {
  const [name,     setName]     = useState(user?.name  ?? '')
  const [email,    setEmail]    = useState(user?.email ?? '')
  const [phone,    setPhone]    = useState('+1 (555) 012-3456')
  const [address,  setAddress]  = useState('742 Evergreen Terrace, Springfield, IL 62701')
  const [jobTitle, setJobTitle] = useState(role === 'Admin' ? 'IAM Administrator' : role === 'Manager' ? 'Branch Manager' : 'Account Holder')
  const [dept,     setDept]     = useState(role === 'Admin' ? 'IT & Identity Management' : role === 'Manager' ? 'Retail Banking' : '')
  const [saving,   setSaving]   = useState(false)

  const save = () => {
    setSaving(true)
    setTimeout(() => { setSaving(false); showToast('Profile updated successfully.') }, 800)
  }

  return (
    <div>
      <SectionCard title="Personal Information">
        <div style={f.grid2}>
          <Field label="Full name"     value={name}  onChange={setName} />
          <Field label="Email address" value={email} onChange={setEmail} type="email" />
          <Field label="Phone number"  value={phone} onChange={setPhone} type="tel" />
          <Field label="Role"          value={user?.role ?? 'Customer'} readonly hint="Role is managed by your administrator." />
        </div>
        <div style={f.actions}>
          <SaveBtn onClick={save} loading={saving} />
          <CancelBtn onClick={() => { setName(user?.name ?? ''); setEmail(user?.email ?? '') }} />
        </div>
      </SectionCard>

      <SectionCard title="Contact &amp; Address">
        <Field label="Mailing address" value={address} onChange={setAddress} />
        <div style={f.grid2}>
          <Field label="City"    value="Springfield" readonly />
          <Field label="Country" value="United States" readonly />
        </div>
        <div style={f.actions}>
          <SaveBtn onClick={() => showToast('Address saved.')} />
        </div>
      </SectionCard>

      {/* Employment card — hidden for Customer */}
      {role !== 'Customer' && (
        <SectionCard title="Employment">
          <div style={f.grid2}>
            <Field label="Job title"   value={jobTitle} onChange={role === 'Admin' ? setJobTitle : undefined} readonly={role !== 'Admin'} />
            <Field label="Department"  value={dept}     onChange={role === 'Admin' ? setDept     : undefined} readonly={role !== 'Admin'}
              hint={role === 'Manager' ? 'Contact your admin to update employment details.' : undefined} />
            <Field label="Employee ID" value="EMP-00412"  readonly />
            <Field label="Start date"  value="2021-03-15" readonly />
          </div>
          {role === 'Admin' && (
            <div style={f.actions}>
              <SaveBtn onClick={() => showToast('Employment details saved.')} />
            </div>
          )}
        </SectionCard>
      )}

      {/* Linked accounts — Customer only */}
      {role === 'Customer' && (
        <SectionCard title="Linked Accounts">
          {[
            { label: 'MockBank Savings',  sub: 'Primary account ending ••••4821', icon: '🏦' },
            { label: 'External Bank',     sub: 'Not linked',                       icon: '🔗' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.75rem 0', borderBottom: i === 0 ? `1px solid ${T.borderLight}` : 'none' }}>
              <span style={{ fontSize: '1.4rem' }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.87rem', fontWeight: 600, color: T.ink }}>{item.label}</div>
                <div style={{ fontSize: '0.75rem', color: T.inkSub }}>{item.sub}</div>
              </div>
              <button style={f.outlineBtn} onClick={() => showToast('Account linking is managed through the mobile app.')}>
                {i === 0 ? 'Manage' : 'Link'}
              </button>
            </div>
          ))}
        </SectionCard>
      )}
    </div>
  )
}

// ─── Security ─────────────────────────────────────────────────────────────────
function SecuritySection({ role, showToast }: { role: string; showToast: (m: string, kind?: 'success' | 'error') => void }) {
  const [curPwd,  setCurPwd]  = useState('')
  const [newPwd,  setNewPwd]  = useState('')
  const [confPwd, setConfPwd] = useState('')
  const [mfa,     setMfa]     = useState(true)
  const [loginAlerts, setLoginAlerts] = useState(true)
  const [showSessions, setShowSessions] = useState(false)
  // Admin-only org-wide policy toggles
  const [enforceMfa,    setEnforceMfa]    = useState(true)
  const [stepUpEnabled, setStepUpEnabled] = useState(true)
  const [riskEngine,    setRiskEngine]    = useState(true)

  const sessions = [
    { device: 'Chrome on macOS',  ip: '192.168.1.42', location: 'Chennai, IN',   last: 'Active now',  current: true  },
    { device: 'Safari on iPhone', ip: '10.0.0.7',     location: 'Chennai, IN',   last: '2 hours ago', current: false },
    { device: 'Edge on Windows',  ip: '172.16.4.18',  location: 'Bangalore, IN', last: '3 days ago',  current: false },
  ]

  const changePassword = () => {
    if (!curPwd || !newPwd) { showToast('Please fill in all password fields.', 'error'); return }
    if (newPwd !== confPwd) { showToast('New passwords do not match.', 'error'); return }
    if (newPwd.length < 8)  { showToast('Password must be at least 8 characters.', 'error'); return }
    setCurPwd(''); setNewPwd(''); setConfPwd('')
    showToast('Password changed successfully.')
  }

  return (
    <div>
      <SectionCard title="Change Password">
        <div style={f.grid1}>
          <Field label="Current password"     value={curPwd}  onChange={setCurPwd}  type="password" />
          <Field label="New password"         value={newPwd}  onChange={setNewPwd}  type="password" hint="Minimum 8 characters with at least one number and symbol." />
          <Field label="Confirm new password" value={confPwd} onChange={setConfPwd} type="password" />
        </div>
        <div style={f.actions}>
          <button style={f.saveBtn} onClick={changePassword}>Update password</button>
        </div>
      </SectionCard>

      <SectionCard title="Multi-Factor Authentication">
        <Toggle
          label="Require MFA on sign-in"
          sub="When enabled, every sign-in will require a second verification step."
          checked={mfa}
          onChange={v => { setMfa(v); showToast(v ? 'MFA enabled.' : 'MFA disabled.') }}
        />
        <div style={{ marginTop: '1rem', padding: '0.9rem 1rem', background: T.greenLight, borderRadius: '8px', border: `1px solid ${T.greenBorder}` }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: T.green, marginBottom: '0.35rem' }}>Enrolled factors</div>
          {[
            { name: 'Passkey (FIDO2)', status: 'enrolled' },
            { name: 'Email OTP',       status: 'enrolled' },
            { name: 'Authenticator',   status: 'enrolled' },
          ].map(fac => (
            <div key={fac.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: `1px solid ${T.greenBorder}` }}>
              <span style={{ fontSize: '0.84rem', color: T.ink }}>{fac.name}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px',
                background: fac.status === 'enrolled' ? T.greenLight : T.bgMuted,
                color:      fac.status === 'enrolled' ? T.green : T.inkSub,
              }}>
                {fac.status === 'enrolled' ? '✓ Enrolled' : 'Not enrolled'}
              </span>
            </div>
          ))}
        </div>
        <div style={f.actions}>
          <button style={f.outlineBtn} onClick={() => showToast('Redirecting to enrollment wizard…')}>
            Manage factors
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Trusted Devices &amp; Sessions"
        action={
          <button style={f.outlineBtn} onClick={() => setShowSessions(v => !v)}>
            {showSessions ? 'Hide' : 'View'} sessions
          </button>
        }
      >
        <Toggle
          label="Login activity alerts"
          sub="Get notified when a new sign-in is detected from an unrecognised device."
          checked={loginAlerts}
          onChange={v => { setLoginAlerts(v); showToast(v ? 'Login alerts enabled.' : 'Login alerts disabled.') }}
        />
        {showSessions && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {sessions.map((sess, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.75rem', background: T.bgMuted, borderRadius: '8px', border: `1px solid ${T.border}` }}>
                <span style={{ fontSize: '1.4rem' }}>💻</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.87rem', fontWeight: 600, color: T.ink, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {sess.device}
                    {sess.current && <span style={{ fontSize: '0.68rem', background: T.greenLight, color: T.green, padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: 700 }}>Current</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: T.inkSub }}>{sess.ip} · {sess.location} · {sess.last}</div>
                </div>
                {!sess.current && (
                  <button style={{ ...f.dangerBtn, fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}
                    onClick={() => showToast(`Session on ${sess.device} terminated.`)}>
                    Revoke
                  </button>
                )}
              </div>
            ))}
            <button style={{ ...f.dangerBtn, alignSelf: 'flex-start', marginTop: '0.25rem' }}
              onClick={() => showToast('All other sessions have been terminated.')}>
              Sign out all other sessions
            </button>
          </div>
        )}
      </SectionCard>

      {/* Manager — informational team policy banner */}
      {role === 'Manager' && (
        <SectionCard title="Team Security Policy">
          <InfoBanner icon="ℹ️" text="Security policies below are set organisation-wide by your administrator. Contact your admin to request changes." />
          {[
            { label: 'MFA enforced for all staff', sub: 'All employee accounts require a second factor.', checked: true },
            { label: 'Step-up authentication', sub: 'High-value transfers require re-verification.', checked: true },
            { label: 'Risk-based access', sub: 'Anomalous sign-ins are blocked automatically.', checked: true },
          ].map(item => (
            <Toggle key={item.label} label={item.label} sub={item.sub} checked={item.checked} onChange={() => {}} disabled />
          ))}
        </SectionCard>
      )}

      {/* Admin — org-wide policy (read-only informational) */}
      {role === 'Admin' && (
        <SectionCard title="Organisation-Wide Security Policies">
          <InfoBanner icon="🛡️" text="These policies are centrally enforced by the platform and apply to all users. They cannot be overridden at the individual account level." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
            {[
              {
                icon: '🔐',
                label: 'Enforce MFA for all accounts',
                sub: 'All users must enrol and use a second factor at every sign-in.',
                standard: 'NIST SP 800-63B',
                status: 'Enforced',
              },
              {
                icon: '⚡',
                label: 'Step-up authentication',
                sub: 'Users are re-challenged before high-value or sensitive operations.',
                standard: 'PSD2 SCA / PCI DSS 8.3',
                status: 'Enforced',
              },
              {
                icon: '🧠',
                label: 'Adaptive risk engine',
                sub: 'Logins flagged as anomalous by IBM Verify risk scoring are blocked or step-up challenged.',
                standard: 'OWASP ASVS 2.2',
                status: 'Active',
              },
            ].map(policy => (
              <div key={policy.label} style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem',
                padding: '0.85rem 1rem', background: T.bgMuted, borderRadius: '8px', border: `1px solid ${T.border}`,
              }}>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1rem', marginTop: '0.05rem' }}>{policy.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: T.ink, marginBottom: '0.2rem' }}>{policy.label}</div>
                    <div style={{ fontSize: '0.77rem', color: T.inkSub, lineHeight: 1.5 }}>{policy.sub}</div>
                    <div style={{ fontSize: '0.68rem', color: T.inkLight, marginTop: '0.35rem', fontWeight: 600 }}>Standard: {policy.standard}</div>
                  </div>
                </div>
                <span style={{
                  flexShrink: 0, fontSize: '0.68rem', fontWeight: 700,
                  padding: '0.2rem 0.6rem', borderRadius: '999px',
                  background: T.greenLight, color: T.green, border: `1px solid ${T.greenBorder}`,
                }}>
                  ✓ {policy.status}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// ─── Notifications ────────────────────────────────────────────────────────────
function NotificationsSection({ role, showToast }: { role: string; showToast: (m: string, kind?: 'success' | 'error') => void }) {
  const [emailTx,     setEmailTx]     = useState(true)
  const [emailSec,    setEmailSec]    = useState(true)
  const [emailMkt,    setEmailMkt]    = useState(false)
  const [emailDigest, setEmailDigest] = useState(true)
  const [pushTx,      setPushTx]      = useState(true)
  const [pushSec,     setPushSec]     = useState(true)
  const [smsAuth,     setSmsAuth]     = useState(false)
  const [smsAlerts,   setSmsAlerts]   = useState(false)
  // Manager/Admin extras
  const [teamDigest,   setTeamDigest]   = useState(role !== 'Customer')
  // Admin-only
  const [systemAlerts, setSystemAlerts] = useState(true)
  const [auditReports, setAuditReports] = useState(true)

  return (
    <div>
      <SectionCard title="Email Notifications">
        <Toggle label="Transaction alerts"     sub="Notify me about debits, credits and transfers."       checked={emailTx}     onChange={setEmailTx} />
        <Toggle label="Security alerts"        sub="Sign-in attempts, password changes and MFA events."   checked={emailSec}    onChange={setEmailSec} />
        {role === 'Customer' && (
          <Toggle label="Marketing &amp; offers" sub="Promotional offers and product announcements."       checked={emailMkt}    onChange={setEmailMkt} />
        )}
        <Toggle label="Weekly digest"          sub="A summary of your account activity every Monday."     checked={emailDigest} onChange={setEmailDigest} />
        {role !== 'Customer' && (
          <Toggle
            label={role === 'Admin' ? 'Team &amp; admin digest' : 'Team digest'}
            sub={role === 'Admin' ? 'Weekly summary of user activity, lifecycle events and security posture.' : 'Weekly summary of your team\'s transactions and activity.'}
            checked={teamDigest}
            onChange={v => { setTeamDigest(v); showToast(v ? 'Team digest enabled.' : 'Team digest disabled.') }}
          />
        )}
        {role === 'Admin' && (
          <>
            <Toggle
              label="System alerts"
              sub="Critical events such as SCIM sync failures or policy violations."
              checked={systemAlerts}
              onChange={v => { setSystemAlerts(v); showToast(v ? 'System alerts enabled.' : 'System alerts disabled.') }}
            />
            <Toggle
              label="Audit reports"
              sub="Receive scheduled compliance and audit log reports."
              checked={auditReports}
              onChange={v => { setAuditReports(v); showToast(v ? 'Audit reports enabled.' : 'Audit reports disabled.') }}
            />
          </>
        )}
        <div style={f.actions}>
          <SaveBtn onClick={() => showToast('Email preferences saved.')} />
        </div>
      </SectionCard>

      <SectionCard title="Push Notifications">
        <Toggle label="Transaction activity" sub="Real-time push for every payment and transfer."  checked={pushTx}  onChange={setPushTx} />
        <Toggle label="Security events"      sub="Immediate push when a new device signs in."      checked={pushSec} onChange={setPushSec} />
        {role === 'Admin' && (
          <Toggle
            label="Identity lifecycle events"
            sub="Push when a user is created, suspended, or has their role changed."
            checked={true}
            onChange={() => showToast('Preference saved.')}
          />
        )}
        <div style={f.actions}>
          <SaveBtn onClick={() => showToast('Push preferences saved.')} />
        </div>
      </SectionCard>

      <SectionCard title="SMS">
        <Toggle label="OTP &amp; authentication codes" sub="Receive one-time codes for login and transfers." checked={smsAuth}   onChange={setSmsAuth} />
        {role === 'Customer' && (
          <Toggle label="Balance alerts" sub="Get a text when your balance drops below $500." checked={smsAlerts} onChange={setSmsAlerts} />
        )}
        {role !== 'Customer' && (
          <Toggle label="Security incident SMS" sub="Immediate SMS on critical security events (account lockout, breach alert)." checked={true} onChange={() => showToast('Preference saved.')} />
        )}
        <div style={f.actions}>
          <SaveBtn onClick={() => showToast('SMS preferences saved.')} />
        </div>
      </SectionCard>
    </div>
  )
}

// ─── Preferences ──────────────────────────────────────────────────────────────
function PreferencesSection({ showToast }: { showToast: (m: string) => void }) {
  const [language,      setLanguage]      = useState('English (US)')
  const [timezone,      setTimezone]      = useState('Asia/Kolkata (IST, UTC+5:30)')
  const [dateFormat,    setDateFormat]    = useState('MM/DD/YYYY')
  const [currency,      setCurrency]      = useState('USD — US Dollar')
  const [theme,         setTheme]         = useState<'system' | 'light' | 'dark'>('system')
  const [compactMode,   setCompactMode]   = useState(false)
  const [accessibility, setAccessibility] = useState(false)

  return (
    <div>
      <SectionCard title="Language &amp; Region">
        <div style={f.grid2}>
          <Select label="Language"    value={language}   options={['English (US)', 'English (UK)', 'Hindi', 'Tamil', 'French', 'German', 'Spanish']} onChange={setLanguage} />
          <Select label="Timezone"    value={timezone}   options={['Asia/Kolkata (IST, UTC+5:30)', 'America/New_York (EST, UTC-5)', 'Europe/London (GMT, UTC+0)', 'America/Los_Angeles (PST, UTC-8)']} onChange={setTimezone} />
          <Select label="Date format" value={dateFormat} options={['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']} onChange={setDateFormat} />
        </div>
        <div style={f.actions}>
          <SaveBtn onClick={() => showToast('Language & region preferences saved.')} />
        </div>
      </SectionCard>

      <SectionCard title="Currency">
        <Select label="Display currency" value={currency} options={['USD — US Dollar', 'INR — Indian Rupee', 'EUR — Euro', 'GBP — British Pound', 'JPY — Japanese Yen']} onChange={setCurrency} />
        <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: T.inkSub }}>
          Currency affects how balances and transaction amounts are displayed throughout the app.
        </div>
        <div style={f.actions}>
          <SaveBtn onClick={() => showToast('Currency preference saved.')} />
        </div>
      </SectionCard>

      <SectionCard title="Theme">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {(['system', 'light', 'dark'] as const).map(t => (
            <button key={t}
              style={{
                  flex: 1, padding: '1rem 0.5rem', border: `2px solid ${theme === t ? T.ink : T.border}`,
                  borderRadius: T.radiusInner, background: theme === t ? T.amberLight : T.bgCard,
                  cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600,
                  color: theme === t ? T.ink : T.inkSub, textTransform: 'capitalize',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
              }}
              onClick={() => { setTheme(t); showToast(`Theme set to ${t}.`) }}
            >
              <span style={{ fontSize: '1.4rem' }}>{t === 'system' ? '⚙️' : t === 'light' ? '☀️' : '🌙'}</span>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <Toggle label="Compact mode"  sub="Reduce padding and font sizes for a denser layout."  checked={compactMode}   onChange={v => { setCompactMode(v);   showToast(v ? 'Compact mode on.' : 'Compact mode off.') }} />
        <Toggle label="Accessibility" sub="High-contrast mode and larger touch targets."         checked={accessibility} onChange={v => { setAccessibility(v); showToast(v ? 'Accessibility mode on.' : 'Accessibility mode off.') }} />
      </SectionCard>
    </div>
  )
}

// ─── Organization ─────────────────────────────────────────────────────────────
function OrganizationSection({ role, showToast }: { role: string; showToast: (m: string) => void }) {
  const isAdmin = role === 'Admin'
  const [orgName,      setOrgName]      = useState('MockBank Financial Services')
  const [domain,       setDomain]       = useState('mockbank.internal')
  const [billingEmail, setBillingEmail] = useState('billing@mockbank.internal')
  const [ssoEnabled,   setSsoEnabled]   = useState(true)
  const [scimEnabled,  setScimEnabled]  = useState(true)

  const members = [
    { name: 'Alice Johnson',  email: 'alice@mockbank.internal',  role: 'Admin',    status: 'Active'   },
    { name: 'Bob Smith',      email: 'bob@mockbank.internal',    role: 'Manager',  status: 'Active'   },
    { name: 'Carol Williams', email: 'carol@mockbank.internal',  role: 'Customer', status: 'Active'   },
    { name: 'David Lee',      email: 'david@mockbank.internal',  role: 'Customer', status: 'Inactive' },
  ]

  return (
    <div>
      {!isAdmin && (
        <InfoBanner icon="ℹ️" text="Organisation details are managed by your administrator. Contact your admin to request changes." />
      )}

      <SectionCard title="Organisation Details">
        <div style={f.grid2}>
          <Field label="Organisation name" value={orgName}      onChange={isAdmin ? setOrgName      : undefined} readonly={!isAdmin} />
          <Field label="Primary domain"    value={domain}       onChange={isAdmin ? setDomain       : undefined} readonly={!isAdmin} />
          <Field label="Billing email"     value={billingEmail} onChange={isAdmin ? setBillingEmail : undefined} readonly={!isAdmin} type="email" />
          <Field label="Plan"              value="Enterprise" readonly hint="Contact support to change your plan." />
        </div>
        {isAdmin && (
          <div style={f.actions}>
            <SaveBtn onClick={() => showToast('Organisation details saved.')} />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Members"
        action={isAdmin ? (
          <button style={f.saveBtn} onClick={() => showToast('Invite sent — check the admin console.')}>
            + Invite member
          </button>
        ) : undefined}
      >
        {!isAdmin && <div style={{ fontSize: '0.78rem', color: T.inkSub, marginBottom: '0.75rem' }}>Showing active members visible to your role.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {members.filter(m => isAdmin || m.status === 'Active').map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.75rem', background: T.bgMuted, borderRadius: '8px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: T.amber, color: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>
                {m.name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.87rem', fontWeight: 600, color: T.ink }}>{m.name}</div>
                <div style={{ fontSize: '0.75rem', color: T.inkSub }}>{m.email}</div>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: '999px',
                background: m.status === 'Active' ? T.greenLight : T.bgMuted,
                color:      m.status === 'Active' ? T.green : T.inkSub,
                border:     m.status === 'Active' ? `1px solid ${T.greenBorder}` : `1px solid ${T.border}`,
              }}>{m.status}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: '999px', background: T.blueLight, color: T.blue, border: `1px solid ${T.blue}44` }}>
                {m.role}
              </span>
              {isAdmin && (
                <button style={{ ...f.outlineBtn, fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                  onClick={() => showToast(`Manage ${m.name} — redirecting to Identity Lifecycle.`)}>
                  Manage
                </button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* SSO / SCIM — Admin only */}
      {isAdmin && (
        <SectionCard title="SSO / SAML &amp; SCIM">
          <Toggle
            label="Single Sign-On (SSO)"
            sub="Members authenticate via IBM Verify (SAML 2.0 / OIDC)."
            checked={ssoEnabled}
            onChange={v => { setSsoEnabled(v); showToast(v ? 'SSO enabled.' : 'SSO disabled.') }}
          />
          <Toggle
            label="SCIM Provisioning"
            sub="Automatically sync users and groups from your identity provider."
            checked={scimEnabled}
            onChange={v => { setScimEnabled(v); showToast(v ? 'SCIM enabled.' : 'SCIM disabled.') }}
          />
          <div style={{ marginTop: '0.9rem', padding: '0.85rem 1rem', background: T.bgMuted, borderRadius: '8px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: T.inkSub, marginBottom: '0.4rem' }}>SCIM Base URL</div>
            <code style={{ fontSize: '0.78rem', color: T.ink, wordBreak: 'break-all' as const }}>
              https://kavyad.verify.ibm.com/v2.0/scim
            </code>
          </div>
          <div style={f.actions}>
            <SaveBtn onClick={() => showToast('SSO / SCIM settings saved.')} />
          </div>
        </SectionCard>
      )}

      {/* Manager — read-only SSO status */}
      {!isAdmin && (
        <SectionCard title="Identity Provider Status">
          {[
            { label: 'Single Sign-On (OIDC)', status: 'Active' },
            { label: 'SCIM Provisioning',     status: 'Active' },
            { label: 'MFA Enforcement',        status: 'Enabled' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0', borderBottom: `1px solid ${T.borderLight}` }}>
              <span style={{ fontSize: '0.87rem', color: T.ink, fontWeight: 500 }}>{item.label}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.6rem', borderRadius: '999px', background: T.greenLight, color: T.green, border: `1px solid ${T.greenBorder}` }}>
                {item.status}
              </span>
            </div>
          ))}
        </SectionCard>
      )}
    </div>
  )
}

// ─── Developers ───────────────────────────────────────────────────────────────
function DevelopersSection({ role, showToast }: { role: string; showToast: (m: string) => void }) {
  const isAdmin = role === 'Admin'
  const [keys, setKeys] = useState([
    { name: 'Production API Key', key: 'mb_live_••••••••••••••••••••3f8a', created: '2024-01-12', last: '2 minutes ago', active: true  },
    { name: 'Development Key',    key: 'mb_test_••••••••••••••••••••9b1c', created: '2024-03-05', last: '5 days ago',    active: true  },
    { name: 'Legacy Key (v1)',    key: 'mb_live_••••••••••••••••••••2d4e', created: '2023-07-20', last: '90+ days ago',  active: false },
  ])
  const [webhookUrl,    setWebhookUrl]    = useState('https://api.mockbank.internal/hooks/verify')
  const [webhookActive, setWebhookActive] = useState(true)

  const revokeKey = (name: string) => {
    setKeys(prev => prev.map(k => k.name === name ? { ...k, active: false } : k))
    showToast(`Key "${name}" revoked.`)
  }

  return (
    <div>
      {!isAdmin && (
        <InfoBanner icon="ℹ️" text="API key management is restricted to administrators. Contact your admin to request a new key or revoke an existing one." />
      )}

      <SectionCard title="API Keys"
        action={isAdmin ? (
          <button style={f.saveBtn} onClick={() => showToast('New API key generated — save it securely, it will not be shown again.')}>
            + Generate new key
          </button>
        ) : undefined}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {keys.map((k, i) => (
            <div key={i} style={{ padding: '0.85rem 1rem', background: T.bgMuted, borderRadius: '8px', border: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.87rem', color: T.ink, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {k.name}
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '999px',
                    background: k.active ? T.greenLight : T.bgMuted,
                    color:      k.active ? T.green : T.inkSub,
                  }}>{k.active ? 'Active' : 'Revoked'}</span>
                </div>
                {isAdmin && k.active && (
                  <button style={{ ...f.dangerBtn, fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
                    onClick={() => revokeKey(k.name)}>
                    Revoke
                  </button>
                )}
              </div>
              <code style={{ fontSize: '0.78rem', color: T.inkSub, display: 'block', marginBottom: '0.3rem' }}>{k.key}</code>
              <div style={{ fontSize: '0.73rem', color: T.inkLight }}>
                Created {k.created} · Last used {k.last}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Webhooks">
        <Field
          label="Endpoint URL"
          value={webhookUrl}
          onChange={isAdmin ? setWebhookUrl : undefined}
          readonly={!isAdmin}
          hint={isAdmin ? "MockBank will POST signed event payloads to this URL." : "Webhook endpoint is managed by your administrator."}
        />
        <Toggle
          label="Webhook active"
          sub="Disable to pause event delivery without removing the configuration."
          checked={webhookActive}
          onChange={isAdmin ? v => { setWebhookActive(v); showToast(v ? 'Webhook enabled.' : 'Webhook paused.') } : () => {}}
          disabled={!isAdmin}
        />
        <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' as const }}>
          {['transaction.created', 'transfer.completed', 'user.created', 'user.suspended', 'mfa.enrolled'].map(ev => (
            <span key={ev} style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', background: T.blueLight, color: T.blue, border: `1px solid ${T.blue}44`, borderRadius: '999px', fontWeight: 600 }}>
              {ev}
            </span>
          ))}
        </div>
        {isAdmin && (
          <div style={f.actions}>
            <SaveBtn onClick={() => showToast('Webhook configuration saved.')} />
            <button style={f.outlineBtn} onClick={() => showToast('Test event delivered — check your endpoint logs.')}>
              Send test event
            </button>
          </div>
        )}
      </SectionCard>

      {/* Rate limits — Admin only */}
      {isAdmin && (
        <SectionCard title="Rate Limits">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[
              { label: 'Read operations',  limit: '1,000 / min', used: 342, total: 1000 },
              { label: 'Write operations', limit: '200 / min',   used: 47,  total: 200  },
              { label: 'Auth requests',    limit: '50 / min',    used: 12,  total: 50   },
            ].map(r => (
              <div key={r.label} style={{ padding: '0.85rem 1rem', background: T.bgMuted, borderRadius: '8px', border: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: 600, color: T.ink }}>{r.label}</span>
                  <span style={{ fontSize: '0.78rem', color: T.inkSub }}>{r.used} / {r.limit}</span>
                </div>
                <div style={{ height: '6px', background: T.border, borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(r.used / r.total) * 100}%`, background: r.used / r.total > 0.8 ? T.red : T.ink, borderRadius: '99px' }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Manager — API usage summary (read-only) */}
      {!isAdmin && (
        <SectionCard title="API Usage (This Month)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[
              { label: 'Read operations',  used: 342,  total: 1000, limit: '1,000 / min' },
              { label: 'Write operations', used: 47,   total: 200,  limit: '200 / min'   },
            ].map(r => (
              <div key={r.label} style={{ padding: '0.85rem 1rem', background: T.bgMuted, borderRadius: '8px', border: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: 600, color: T.ink }}>{r.label}</span>
                  <span style={{ fontSize: '0.78rem', color: T.inkSub }}>{r.used} / {r.limit}</span>
                </div>
                <div style={{ height: '6px', background: T.border, borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(r.used / r.total) * 100}%`, background: T.ink, borderRadius: '99px' }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:       { fontFamily: T.fontFamily, position: 'relative' },
  pageHeader: { marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle:  { fontSize: '1.5rem', fontWeight: 800, color: T.ink, margin: 0, letterSpacing: '-0.02em' },
  pageSub:    { fontSize: '0.82rem', color: T.inkSub, marginTop: '0.25rem', maxWidth: '520px' },
  body:       { display: 'flex', gap: '1.25rem', alignItems: 'flex-start' },
  sidebar: {
    width: '190px', flexShrink: 0, background: T.bgCard,
    border: `1px solid ${T.border}`, borderRadius: T.radiusCard,
    boxShadow: T.shadowCard,
    padding: '0.65rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '2px',
    position: 'sticky' as const, top: '0',
  },
  navGroup: {
    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
    color: T.inkLight, padding: '0.4rem 0.85rem 0.2rem',
    textTransform: 'uppercase' as const,
  },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    padding: '0.6rem 0.85rem', borderRadius: '10px', border: 'none',
    background: 'transparent', cursor: 'pointer',
    fontSize: '0.87rem', fontWeight: 500, color: T.inkSub,
    width: '100%', textAlign: 'left' as const,
  },
  navBtnActive: { background: T.amberLight, color: T.amber, fontWeight: 700 },
  navIcon:    { fontSize: '1rem' },
  content:    { flex: 1, minWidth: 0 },
  toast: {
    position: 'fixed' as const, bottom: '1.5rem', right: '1.5rem',
    color: '#fff', padding: '0.75rem 1.25rem', borderRadius: T.radiusInner,
    fontSize: '0.84rem', fontWeight: 600, zIndex: 9999,
    boxShadow: T.shadowPop,
  },
  roleBadge: {
    fontSize: '0.72rem', fontWeight: 700, padding: '0.3rem 0.9rem',
    borderRadius: '999px', border: '1px solid', flexShrink: 0, marginTop: '0.2rem',
  },
  roleBadgeCust:  { background: T.blueLight, color: T.blue, borderColor: T.blue + '44' },
  roleBadgeMgr:   { background: '#3b1fa833', color: '#a78bfa', borderColor: '#7c3aed44' },
  roleBadgeAdmin: { background: T.amberLight, color: T.amber, borderColor: T.amberBorder },
}

const f: Record<string, React.CSSProperties> = {
  card: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: T.radiusCard, padding: '1.25rem 1.5rem', marginBottom: '1.25rem',
    boxShadow: T.shadowCard,
  },
  cardHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '1.1rem',
  },
  cardTitle:    { fontSize: '0.92rem', fontWeight: 700, color: T.ink, letterSpacing: '-0.01em' },
  grid2:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' },
  grid1:        { display: 'grid', gridTemplateColumns: '1fr', gap: '0.85rem' },
  fieldWrap:    { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label:        { fontSize: '0.75rem', fontWeight: 600, color: T.inkSub },
  input: {
    padding: '0.55rem 0.75rem', border: `1px solid ${T.border}`,
    borderRadius: T.radiusInput, fontSize: '0.87rem', color: T.ink,
    outline: 'none', width: '100%', boxSizing: 'border-box' as const,
    background: T.bgCard,
  },
  inputReadonly: { background: T.bgMuted, color: T.inkSub, cursor: 'default' },
  hint:          { fontSize: '0.72rem', color: T.inkLight, marginTop: '0.15rem' },
  select: {
    padding: '0.55rem 0.75rem', border: `1px solid ${T.border}`,
    borderRadius: T.radiusInput, fontSize: '0.87rem', color: T.ink,
    background: T.bgCard, width: '100%', boxSizing: 'border-box' as const,
    cursor: 'pointer', outline: 'none',
  },
  actions: {
    display: 'flex', gap: '0.6rem', marginTop: '1.1rem',
    paddingTop: '1rem', borderTop: `1px solid ${T.borderLight}`,
  },
  saveBtn: {
    padding: '0.5rem 1.1rem', background: T.amber, color: '#0d1117',
    border: 'none', borderRadius: T.radiusPill, cursor: 'pointer',
    fontSize: '0.84rem', fontWeight: 700,
  },
  cancelBtn: {
    padding: '0.5rem 1rem', background: 'transparent', color: T.inkSub,
    border: `1px solid ${T.border}`, borderRadius: T.radiusPill, cursor: 'pointer',
    fontSize: '0.84rem', fontWeight: 600,
  },
  outlineBtn: {
    padding: '0.45rem 0.9rem', background: T.bgMuted, color: T.ink,
    border: `1px solid ${T.border}`, borderRadius: T.radiusPill, cursor: 'pointer',
    fontSize: '0.82rem', fontWeight: 600,
  },
  dangerBtn: {
    padding: '0.45rem 0.9rem', background: T.redLight, color: T.red,
    border: `1px solid ${T.redBorder}`, borderRadius: T.radiusPill, cursor: 'pointer',
    fontSize: '0.82rem', fontWeight: 700,
  },
  toggleRow: {
    display: 'flex', alignItems: 'center', gap: '1rem',
    padding: '0.75rem 0', borderBottom: `1px solid ${T.borderLight}`,
  },
  toggleLabel: { fontSize: '0.87rem', fontWeight: 600, color: T.ink },
  toggleSub:   { fontSize: '0.75rem', color: T.inkSub, marginTop: '0.1rem' },
  track: {
    width: '44px', height: '24px', borderRadius: '999px', border: 'none',
    position: 'relative' as const, cursor: 'pointer', transition: 'background 0.2s',
    flexShrink: 0, padding: 0,
  },
  thumb: {
    position: 'absolute' as const, top: '3px',
    width: '18px', height: '18px', borderRadius: '50%',
    background: '#fff', transition: 'transform 0.2s',
    display: 'block',
  },
}

import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { LT as T } from '../styles/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
interface LoanOut {
  id: number
  applicant_name: string
  applicant_email: string
  purpose: string
  amount: number
  term_months: number
  status: 'pending' | 'approved' | 'rejected'
  reviewer_name: string | null
  reviewer_note: string | null
  created_at: string
  reviewed_at: string | null
  stepup_verified: boolean
  requires_stepup: boolean
}

interface StepUpBeginResult {
  method: string
  transaction_id: string | null
  message: string
  otp_hint?: string  // correlation prefix shown in the email — displayed for user confirmation only
}

interface StepUpCompleteResult {
  token: string
  user: { name: string; email: string; role: string }
  stepup_verified: boolean
}

interface ApiStepUpError {
  response?: {
    status?: number
    data?: {
      detail?: {
        code?: string
        step_up_reason?: string
        message?: string
        threshold?: number
        amount?: number
      } | string
    }
  }
}

const HIGH_VALUE = 500_000  // 5 Lakhs

const STATUS_COLOR: Record<string, string> = {
  pending:  T.amber,
  approved: T.green,
  rejected: T.red,
}
const STATUS_BG: Record<string, string> = {
  pending:  T.amberLight,
  approved: T.greenLight,
  rejected: T.redLight,
}
const STATUS_BORDER: Record<string, string> = {
  pending:  T.amberBorder,
  approved: T.greenBorder,
  rejected: T.redBorder,
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
function ShieldIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
}
function RefreshIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
}
function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function XIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}
function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmt(n: number) {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}k`
  return `₹${n.toFixed(0)}`
}

// ─── Inline 2FA Modal ─────────────────────────────────────────────────────────
type Phase2FA = 'idle' | 'beginning' | 'otp_input' | 'push_polling' | 'verifying' | 'done' | 'error'

interface TwoFAModalProps {
  loanId: number
  loanAmount: number
  decision: 'approved' | 'rejected'
  note: string
  onSuccess: (updatedLoan: LoanOut) => void
  onClose: () => void
}

function TwoFAModal({ loanId, loanAmount, decision, note, onSuccess, onClose }: TwoFAModalProps) {
  const { login, user } = useAuth()
  const [phase,   setPhase]   = useState<Phase2FA>('idle')
  const [method,  setMethod]  = useState('')
  const [txId,    setTxId]    = useState<string | null>(null)
  const [otp,     setOtp]     = useState('')
  const [otpHint, setOtpHint] = useState('')  // display-only correlation prefix shown to user
  const [msg,     setMsg]     = useState('')
  const [err,     setErr]     = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const begin = async () => {
    setPhase('beginning'); setErr('')
    try {
      const { data } = await api.post<StepUpBeginResult>('/auth/stepup/begin', { return_to: '/loans' })
      setMethod(data.method)
      setTxId(data.transaction_id)
      setMsg(data.message)
      setOtpHint(data.otp_hint ?? '')
      if (data.method === 'push') {
        setPhase('push_polling')
        startPushPoll(data.transaction_id!)
      } else {
        setPhase('otp_input')
      }
    } catch {
      setErr('Could not start step-up challenge. Please try again.')
      setPhase('error')
    }
  }

  const startPushPoll = (transactionId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get<{ status: string }>(`/auth/stepup/poll/${transactionId}`)
        if (data.status === 'approved') {
          clearInterval(pollRef.current!)
          await completeAndDecide('push', transactionId, undefined)
        } else if (data.status === 'denied') {
          clearInterval(pollRef.current!)
          setErr('Push notification was denied. Please try again.')
          setPhase('error')
        }
      } catch {
        // network blip — keep polling
      }
    }, 2500)
  }

  const completeAndDecide = async (m: string, tid: string | null, otpCode: string | undefined) => {
    setPhase('verifying')
    try {
      // Step 1: complete step-up verification → get step-up JWT
      const body: Record<string, string | null> = { method: m, transaction_id: tid ?? null }
      if (otpCode) body.otp_code = otpCode
      const { data: su } = await api.post<StepUpCompleteResult>('/auth/stepup/complete', body)

      // Step 2: store the new step-up token in session context
      if (user) login(su.token, su.user, true)

      // Step 3: re-submit the loan decision using the new token
      const { data: loan } = await api.post<LoanOut>(
        `/loans/${loanId}/decide`,
        { decision, note: note || undefined },
        { headers: { Authorization: `Bearer ${su.token}` } },
      )
      setPhase('done')
      setTimeout(() => onSuccess(loan), 600)
    } catch {
      setErr('Step-up verification failed. Please try again.')
      setPhase('error')
    }
  }

  const handleOtpSubmit = () => {
    if (!otp.trim()) return
    completeAndDecide(method, txId, otp.trim())
  }

  const methodLabel: Record<string, string> = {
    push:      'Push Notification',
    totp:      'Authenticator App',
    email_otp: 'Email OTP',
    fido2:     'Passkey',
  }

  return (
    <div style={s2.overlay} onClick={onClose}>
      <div style={s2.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={s2.head}>
          <div style={s2.headIcon}><ShieldIcon /></div>
          <div>
            <div style={s2.headTitle}>Step-Up Verification Required</div>
            <div style={s2.headSub}>
              Approving {fmt(loanAmount)} requires additional verification
            </div>
          </div>
          <button style={s2.closeBtn} onClick={onClose}><XIcon /></button>
        </div>

        {/* Info strip */}
        <div style={s2.infoStrip}>
          <span style={{ color: T.amber }}>⚠</span>
          <span>
            Loans above <strong>₹10,00,000 (10 Lakhs)</strong> require a verified
            second factor before approval can be recorded.
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem' }}>
          {(phase === 'idle' || phase === 'beginning') && (
            <div style={{ textAlign: 'center', paddingBottom: '0.5rem' }}>
              <p style={s2.bodyText}>
                Click below to initiate your enrolled authentication method.
              </p>
              <button
                style={{ ...s2.primaryBtn, opacity: phase === 'beginning' ? 0.7 : 1 }}
                onClick={begin}
                disabled={phase === 'beginning'}
              >
                {phase === 'beginning' ? (
                  <><span style={s2.spinner} /> Starting…</>
                ) : (
                  <><ShieldIcon /> Start Verification</>
                )}
              </button>
            </div>
          )}

          {phase === 'push_polling' && (
            <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
              <div style={s2.spinner2} />
              <p style={s2.bodyText}>
                <strong>Push Notification</strong> — approve the notification on your enrolled device.
              </p>
              <p style={{ fontSize: '0.73rem', color: T.inkSub }}>{msg}</p>
            </div>
          )}

          {phase === 'otp_input' && (
            <div>
              <p style={s2.bodyText}>
                <strong>{methodLabel[method] ?? method}</strong> — {msg}
              </p>
              {/* Correlation hint — display only, so user can confirm the right email */}
              {otpHint && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  marginBottom: '0.65rem',
                  padding: '0.3rem 0.65rem',
                  background: T.amberLight, border: `1px solid ${T.amberBorder}`,
                  borderRadius: '6px', fontSize: '0.78rem', color: T.amber,
                }}>
                  <span style={{ fontWeight: 700 }}>Look for code starting with:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, letterSpacing: '0.08em', fontSize: '0.88rem' }}>{otpHint}</span>
                </div>
              )}
              <input
                style={s2.otpInput}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\s/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleOtpSubmit()}
                placeholder="Enter the full code from your email"
                autoFocus
                maxLength={16}
                inputMode="numeric"
              />
              <button style={s2.primaryBtn} onClick={handleOtpSubmit} disabled={!otp.trim()}>
                Verify &amp; Approve
              </button>
            </div>
          )}

          {phase === 'verifying' && (
            <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
              <div style={s2.spinner2} />
              <p style={s2.bodyText}>Verifying your identity…</p>
            </div>
          )}

          {phase === 'done' && (
            <div style={{ textAlign: 'center', padding: '0.5rem 0', color: T.green }}>
              <p style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>✓</p>
              <p style={s2.bodyText}>Verified. Loan approved.</p>
            </div>
          )}

          {phase === 'error' && (
            <div>
              <div style={s2.errBox}>{err}</div>
              <button style={{ ...s2.primaryBtn, marginTop: '0.75rem' }} onClick={() => { setPhase('idle'); setErr(''); setOtp(''); setOtpHint('') }}>
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const s2: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.7)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '14px', width: '100%', maxWidth: '440px',
    boxShadow: T.shadowPop, overflow: 'hidden',
  },
  head: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '1rem 1.25rem', background: T.bgMuted,
    borderBottom: `1px solid ${T.border}`,
  },
  headIcon: {
    width: '36px', height: '36px', borderRadius: '8px',
    background: T.amberLight, border: `1px solid ${T.amberBorder}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: T.amber, flexShrink: 0,
  },
  headTitle: { fontSize: '0.95rem', fontWeight: 700, color: T.ink },
  headSub:   { fontSize: '0.75rem', color: T.inkSub, marginTop: '0.1rem' },
  closeBtn: {
    marginLeft: 'auto', background: 'none', border: 'none',
    cursor: 'pointer', color: T.inkSub, flexShrink: 0,
  },
  infoStrip: {
    display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
    padding: '0.65rem 1.25rem',
    background: T.amberLight, borderBottom: `1px solid ${T.amberBorder}`,
    fontSize: '0.78rem', color: T.ink, lineHeight: 1.5,
  },
  bodyText: { fontSize: '0.85rem', color: T.inkSub, marginBottom: '1rem', lineHeight: 1.6 },
  primaryBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
    width: '100%', padding: '0.7rem', background: T.amber, color: '#ffffff',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontWeight: 700, fontSize: '0.88rem', fontFamily: 'inherit',
  },
  otpInput: {
    width: '100%', boxSizing: 'border-box' as const,
    padding: '0.65rem 0.85rem', marginBottom: '0.75rem',
    background: T.bgInput, border: `1px solid ${T.border}`,
    borderRadius: '8px', color: T.ink, fontSize: '1.1rem',
    fontFamily: 'monospace', letterSpacing: '0.12em',
  },
  errBox: {
    padding: '0.65rem 0.85rem',
    background: T.redLight, border: `1px solid ${T.redBorder}`,
    borderRadius: '8px', fontSize: '0.82rem', color: T.red,
  },
  spinner: {
    display: 'inline-block', width: '12px', height: '12px',
    border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#ffffff',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },
  spinner2: {
    width: '32px', height: '32px', margin: '0 auto 0.75rem',
    border: `3px solid ${T.border}`, borderTopColor: T.amber,
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },
}

// ─── Create Loan Modal ────────────────────────────────────────────────────────
interface CreateModalProps { onClose: () => void; onCreated: (l: LoanOut) => void }

function CreateLoanModal({ onClose, onCreated }: CreateModalProps) {
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [purpose, setPurpose] = useState('')
  const [amount,  setAmount]  = useState('')
  const [term,    setTerm]    = useState('12')
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  const submit = async () => {
    if (!name || !email || !purpose || !amount) { setErr('All fields required'); return }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setErr('Enter a valid amount'); return }
    const termInt = parseInt(term, 10)
    if (isNaN(termInt) || termInt <= 0) { setErr('Select a valid term'); return }
    setSaving(true); setErr('')
    try {
      const { data } = await api.post<LoanOut>('/loans', {
        applicant_name: name, applicant_email: email,
        purpose, amount: amt, term_months: termInt,
      })
      onCreated(data)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErr(detail ?? 'Failed to create loan.')
    } finally { setSaving(false) }
  }

  return (
    <div style={s2.overlay} onClick={onClose}>
      <div style={{ ...s2.modal, maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
        <div style={s2.head}>
          <div style={s2.headIcon}><PlusIcon /></div>
          <div>
            <div style={s2.headTitle}>New Loan Application</div>
            <div style={s2.headSub}>Submit on behalf of applicant</div>
          </div>
          <button style={s2.closeBtn} onClick={onClose}><XIcon /></button>
        </div>
        <div style={{ padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
          {[
            { label: 'Applicant Name', val: name, set: setName, ph: 'Riya Sharma' },
            { label: 'Email',          val: email, set: setEmail, ph: 'riya@example.com', type: 'email' },
            { label: 'Purpose',        val: purpose, set: setPurpose, ph: 'Home Renovation, Business Expansion…' },
            { label: 'Amount (₹)',     val: amount, set: setAmount, ph: '1000000', type: 'number' },
          ].map(f => (
            <div key={f.label}>
              <label style={sf.label}>{f.label}</label>
              <input style={sf.input} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} type={f.type ?? 'text'} />
            </div>
          ))}
          <div>
            <label style={sf.label}>Term (months)</label>
            <select style={sf.input} value={term} onChange={e => setTerm(e.target.value)}>
              {[6,12,18,24,36,48,60,72,84].map(t => <option key={t} value={t}>{t} months</option>)}
            </select>
          </div>
          {err && <div style={s2.errBox}>{err}</div>}
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button style={s2.primaryBtn} onClick={submit} disabled={saving}>
              {saving ? 'Submitting…' : 'Submit Application'}
            </button>
            <button style={{ ...s2.primaryBtn, background: T.bgMuted, color: T.ink }} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const sf: Record<string, React.CSSProperties> = {
  label: { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: T.inkSub, marginBottom: '0.35rem', letterSpacing: '0.04em', textTransform: 'uppercase' as const },
  input: { width: '100%', boxSizing: 'border-box' as const, padding: '0.6rem 0.75rem', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.ink, fontSize: '0.88rem', fontFamily: 'inherit' },
}

// ─── Note / Reject modal ──────────────────────────────────────────────────────
interface DecideModalProps {
  loan: LoanOut
  decision: 'approved' | 'rejected'
  onConfirm: (note: string) => void
  onClose: () => void
}
function DecideModal({ loan, decision, onConfirm, onClose }: DecideModalProps) {
  const [note, setNote] = useState('')
  const isApprove = decision === 'approved'
  return (
    <div style={s2.overlay} onClick={onClose}>
      <div style={{ ...s2.modal, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
        <div style={{ ...s2.head, background: isApprove ? T.greenLight : T.redLight, borderColor: isApprove ? T.greenBorder : T.redBorder }}>
          <div style={{ ...s2.headIcon, background: isApprove ? T.greenLight : T.redLight, border: `1px solid ${isApprove ? T.greenBorder : T.redBorder}`, color: isApprove ? T.green : T.red }}>
            {isApprove ? <CheckIcon /> : <XIcon />}
          </div>
          <div>
            <div style={s2.headTitle}>{isApprove ? 'Approve' : 'Reject'} Loan</div>
            <div style={s2.headSub}>{loan.applicant_name} — {fmt(loan.amount)}</div>
          </div>
          <button style={s2.closeBtn} onClick={onClose}><XIcon /></button>
        </div>
        <div style={{ padding: '1.25rem' }}>
          {loan.requires_stepup && isApprove && (
            <div style={{ ...s2.infoStrip, marginBottom: '1rem', borderRadius: '8px', border: `1px solid ${T.amberBorder}` }}>
              <span style={{ color: T.amber }}>🔒</span>
              <span>This loan exceeds ₹10 Lakhs — you will be prompted for <strong>step-up verification</strong> after confirming.</span>
            </div>
          )}
          <label style={sf.label}>Note (optional)</label>
          <textarea
            style={{ ...sf.input, height: '80px', resize: 'vertical' as const }}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={isApprove ? 'Approval remarks…' : 'Reason for rejection…'}
          />
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
            <button
              style={{ ...s2.primaryBtn, background: isApprove ? T.green : T.red, color: '#fff' }}
              onClick={() => onConfirm(note)}
            >
              {isApprove ? 'Confirm Approval' : 'Confirm Rejection'}
            </button>
            <button style={{ ...s2.primaryBtn, background: T.bgMuted, color: T.ink }} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type FilterTab = 'all' | 'pending' | 'approved' | 'rejected'

export default function LoanApprovalPage() {
  const { user } = useAuth()
  const [loans,       setLoans]      = useState<LoanOut[]>([])
  const [loading,     setLoading]    = useState(true)
  const [tab,         setTab]        = useState<FilterTab>('all')
  const [toast,       setToast]      = useState<{ msg: string; kind: 'success' | 'error' } | null>(null)
  const [showCreate,  setShowCreate] = useState(false)

  // decide flow
  const [decideTarget, setDecideTarget] = useState<{ loan: LoanOut; decision: 'approved' | 'rejected' } | null>(null)
  const [mfaTarget,    setMfaTarget]    = useState<{ loan: LoanOut; decision: 'approved' | 'rejected'; note: string } | null>(null)

  const showToast = (msg: string, kind: 'success' | 'error' = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const load = () => {
    setLoading(true)
    api.get<LoanOut[]>('/loans')
      .then(r => setLoans(r.data))
      .catch(() => showToast('Failed to load loans.', 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const filtered = loans.filter(l => tab === 'all' || l.status === tab)

  const STATS = [
    { label: 'Total',    value: loans.length,                                color: T.ink    },
    { label: 'Pending',  value: loans.filter(l => l.status === 'pending').length,  color: T.amber  },
    { label: 'Approved', value: loans.filter(l => l.status === 'approved').length, color: T.green  },
    { label: 'Rejected', value: loans.filter(l => l.status === 'rejected').length, color: T.red    },
    { label: '🔒 Needs 2FA', value: loans.filter(l => l.requires_stepup).length,   color: '#a78bfa' },
  ]

  // ── Handle decision flow ──────────────────────────────────────────────────
  const handleDecisionConfirm = async (note: string) => {
    if (!decideTarget) return
    const { loan, decision } = decideTarget
    setDecideTarget(null)

    // High-value approval → go through 2FA modal
    if (decision === 'approved' && loan.requires_stepup) {
      setMfaTarget({ loan, decision, note })
      return
    }

    // Low-value or rejection → directly call API
    try {
      const { data } = await api.post<LoanOut>(`/loans/${loan.id}/decide`, {
        decision, note: note || undefined,
      })
      setLoans(prev => prev.map(l => l.id === data.id ? data : l))
      showToast(`Loan ${decision === 'approved' ? 'approved' : 'rejected'} successfully.`)
    } catch (e: unknown) {
      const apiErr = e as ApiStepUpError
      const detail = apiErr?.response?.data?.detail
      const msg = typeof detail === 'object' ? detail?.message : (detail as string | undefined)
      showToast(msg ?? 'Action failed.', 'error')
    }
  }

  const handleMfaSuccess = (updatedLoan: LoanOut) => {
    setMfaTarget(null)
    setLoans(prev => prev.map(l => l.id === updatedLoan.id ? updatedLoan : l))
    showToast('Loan approved with step-up verification.')
  }

  if (user?.role !== 'Manager' && user?.role !== 'SalesforceManager' && user?.role !== 'Admin') {
    return <div style={{ padding: '3rem', textAlign: 'center', color: T.inkSub }}>Manager role required.</div>
  }

  return (
    <div style={{ fontFamily: T.fontFamily }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 2000,
          padding: '0.75rem 1.25rem', borderRadius: '10px', fontWeight: 600,
          fontSize: '0.85rem', boxShadow: T.shadowPop,
          background: toast.kind === 'success' ? T.green : T.red, color: '#fff',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div style={s.pageHead}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <h1 style={s.pageTitle}>Loan Approvals</h1>
            <span style={s.badge}>Step-Up Auth · High-Value</span>
          </div>
          <p style={s.pageSub}>
            Review and approve / reject loan applications. Approvals above{' '}
            <strong style={{ color: T.amber }}>₹5,00,000 (5 Lakhs)</strong> trigger
            a step-up authentication challenge before the decision is recorded.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const, alignItems: 'center' }}>
          <button style={s.outlineBtn} onClick={load}><RefreshIcon /> Refresh</button>
          <button style={s.primaryBtn} onClick={() => setShowCreate(true)}><PlusIcon /> New Application</button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={s.statsRow}>
        {STATS.map((st, i) => (
          <React.Fragment key={st.label}>
            {i > 0 && <div style={s.divider} />}
            <div style={s.statItem}>
              <div style={{ ...s.statValue, color: st.color }}>{st.value}</div>
              <div style={s.statLabel}>{st.label}</div>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* 2FA info banner */}
      <div style={s.infoBanner}>
        <ShieldIcon />
        <div>
          <strong style={{ color: T.amber }}>Step-Up Auth Policy Active</strong>
          {' '}— Any loan approval exceeding ₹5,00,000 automatically triggers a step-up
          authentication challenge. The approval is only recorded after the Credit Analyst
          successfully completes the verification.
        </div>
      </div>

      {/* Filter tabs */}
      <div style={s.tabs}>
        {(['all', 'pending', 'approved', 'rejected'] as FilterTab[]).map(t => (
          <button
            key={t}
            style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            <span style={{ ...s.tabCount, ...(tab === t ? { background: T.amber, color: '#0d1117' } : {}) }}>
              {t === 'all' ? loans.length : loans.filter(l => l.status === t).length}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: T.inkSub }}>Loading loans…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: T.inkSub }}>No applications found.</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Applicant', 'Purpose', 'Amount', 'Term', 'Status', 'Reviewed By', 'Created', 'Actions'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((loan, idx) => (
                <tr key={loan.id} style={{ background: idx % 2 === 0 ? 'transparent' : T.bgMuted + '30' }}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600, color: T.ink }}>{loan.applicant_name}</div>
                    <div style={{ fontSize: '0.72rem', color: T.inkSub }}>{loan.applicant_email}</div>
                  </td>
                  <td style={{ ...s.td, maxWidth: '180px', color: T.inkSub, fontSize: '0.82rem' }}>{loan.purpose}</td>
                  <td style={s.td}>
                    <div style={{ fontWeight: 700, color: loan.amount > HIGH_VALUE ? T.amber : T.ink }}>
                      {fmt(loan.amount)}
                    </div>
                    {loan.amount > HIGH_VALUE && (
                      <div style={{ fontSize: '0.62rem', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        🔒 2FA required
                      </div>
                    )}
                  </td>
                  <td style={{ ...s.td, color: T.inkSub, fontSize: '0.82rem' }}>{loan.term_months}m</td>
                  <td style={s.td}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' as const,
                      letterSpacing: '0.05em', padding: '0.2rem 0.6rem', borderRadius: '999px',
                      background: STATUS_BG[loan.status], color: STATUS_COLOR[loan.status],
                      border: `1px solid ${STATUS_BORDER[loan.status]}`,
                    }}>
                      {loan.status}
                    </span>
                    {loan.stepup_verified && (
                      <div style={{ fontSize: '0.62rem', color: T.green, marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        ✓ 2FA verified
                      </div>
                    )}
                  </td>
                  <td style={{ ...s.td, fontSize: '0.78rem', color: T.inkSub }}>
                    {loan.reviewer_name ?? '—'}
                    {loan.reviewer_note && (
                      <div style={{ fontSize: '0.7rem', color: T.inkLight, marginTop: '0.1rem', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        {loan.reviewer_note}
                      </div>
                    )}
                  </td>
                  <td style={{ ...s.td, fontSize: '0.75rem', color: T.inkSub }}>
                    {new Date(loan.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' as const }}>
                    {loan.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          style={s.approveBtn}
                          onClick={() => setDecideTarget({ loan, decision: 'approved' })}
                        >
                          <CheckIcon />
                          {loan.requires_stepup ? 'Approve 🔒' : 'Approve'}
                        </button>
                        <button
                          style={s.rejectBtn}
                          onClick={() => setDecideTarget({ loan, decision: 'rejected' })}
                        >
                          <XIcon /> Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: T.inkLight }}>Decided</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateLoanModal
          onClose={() => setShowCreate(false)}
          onCreated={loan => { setLoans(prev => [loan, ...prev]); setShowCreate(false); showToast('Loan application created.') }}
        />
      )}
      {decideTarget && (
        <DecideModal
          loan={decideTarget.loan}
          decision={decideTarget.decision}
          onConfirm={handleDecisionConfirm}
          onClose={() => setDecideTarget(null)}
        />
      )}
      {mfaTarget && (
        <TwoFAModal
          loanId={mfaTarget.loan.id}
          loanAmount={mfaTarget.loan.amount}
          decision={mfaTarget.decision}
          note={mfaTarget.note}
          onSuccess={handleMfaSuccess}
          onClose={() => setMfaTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  pageHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' },
  pageTitle: { fontSize: '1.55rem', fontWeight: 700, color: T.ink, margin: 0 },
  pageSub:   { fontSize: '0.82rem', color: T.inkSub, marginTop: '0.25rem', maxWidth: '580px' },

  badge: {
    display: 'inline-flex', alignItems: 'center',
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
    padding: '0.2rem 0.6rem', borderRadius: '999px',
    background: T.amberLight, color: T.amber, border: `1px solid ${T.amberBorder}`,
  },

  statsRow: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const,
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '10px', padding: '0.75rem 1.25rem',
    marginBottom: '1rem', gap: '0',
  },
  statItem:  { display: 'flex', flexDirection: 'column' as const, padding: '0 1.1rem', gap: '0.1rem' },
  statValue: { fontSize: '1.3rem', fontWeight: 800 },
  statLabel: { fontSize: '0.65rem', fontWeight: 600, color: T.inkSub, textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
  divider:   { width: '1px', height: '32px', background: T.border, flexShrink: 0 },

  infoBanner: {
    display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
    background: T.amberLight, border: `1px solid ${T.amberBorder}`,
    borderRadius: '10px', padding: '0.75rem 1rem',
    marginBottom: '1.25rem', fontSize: '0.82rem', color: T.ink, lineHeight: 1.6,
  },

  tabs: { display: 'flex', gap: '0.25rem', marginBottom: '1rem', flexWrap: 'wrap' as const },
  tab: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.4rem 0.85rem', borderRadius: '8px',
    border: `1px solid ${T.border}`, background: T.bgCard,
    cursor: 'pointer', fontSize: '0.82rem', color: T.inkSub, fontWeight: 500,
    fontFamily: 'inherit',
  },
  tabActive: { background: T.bgMuted, color: T.ink, borderColor: T.border, fontWeight: 700 },
  tabCount: {
    fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.45rem',
    borderRadius: '999px', background: T.bgMuted, color: T.inkSub,
  },

  tableWrap: {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: '12px', overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: {
    padding: '0.65rem 0.85rem', textAlign: 'left' as const,
    fontSize: '0.68rem', fontWeight: 700, color: T.inkSub,
    textTransform: 'uppercase' as const, letterSpacing: '0.06em',
    background: T.bgMuted, borderBottom: `1px solid ${T.border}`,
  },
  td: { padding: '0.75rem 0.85rem', borderBottom: `1px solid ${T.borderLight}`, fontSize: '0.85rem', color: T.ink, verticalAlign: 'top' as const },

  approveBtn: {
    display: 'flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.35rem 0.7rem', background: T.greenLight,
    border: `1px solid ${T.greenBorder}`, borderRadius: '6px',
    cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
    color: T.green, fontFamily: 'inherit',
  },
  rejectBtn: {
    display: 'flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.35rem 0.7rem', background: T.redLight,
    border: `1px solid ${T.redBorder}`, borderRadius: '6px',
    cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
    color: T.red, fontFamily: 'inherit',
  },

  primaryBtn: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.55rem 1rem', background: T.amber, color: '#ffffff',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit',
  },
  outlineBtn: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.55rem 1rem', background: T.bgCard,
    border: `1px solid ${T.border}`, borderRadius: '8px',
    cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
    color: T.ink, fontFamily: 'inherit',
  },
}

import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

interface Account {
  id: number
  type: string
  account_number: string
  balance: number
  currency: string
}

/** Shape of the structured error the backend returns when step-up is required. */
interface StepUpRequiredDetail {
  code: 'STEP_UP_REQUIRED'
  step_up_reason: string
  message: string
}

/** Pending transfer saved to sessionStorage so it can be retried after step-up. */
interface PendingTransfer {
  from_account_id: number
  to_account_id: number
  amount: number
}

const PENDING_TRANSFER_KEY = 'mb_pending_transfer'

export default function TransferPage() {
  const { stepupVerified } = useAuth()
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Track whether we've already attempted the pending-transfer retry this mount.
  const retryAttempted = useRef(false)

  // ── Load accounts ──────────────────────────────────────────────────────
  useEffect(() => {
    api.get<Account[]>('/banking/accounts')
      .then(r => setAccounts(r.data))
      .catch(() => {})
  }, [])

  // ── Auto-retry a pending transfer after returning from step-up ─────────
  // Only fire once per mount. If stepupVerified is already true before this
  // page loads (e.g. user navigated away and back), we still only retry if
  // there's a pending transfer in sessionStorage — and only one time.
  useEffect(() => {
    if (retryAttempted.current) return
    if (!stepupVerified) return
    const raw = sessionStorage.getItem(PENDING_TRANSFER_KEY)
    if (!raw) return

    retryAttempted.current = true
    const pending: PendingTransfer = JSON.parse(raw)
    sessionStorage.removeItem(PENDING_TRANSFER_KEY)

    // Pre-populate the form fields so the user can see what was retried.
    setFromId(String(pending.from_account_id))
    setToId(String(pending.to_account_id))
    setAmount(String(pending.amount))

    void submitTransfer(pending.from_account_id, pending.to_account_id, pending.amount)
  }, [stepupVerified]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core transfer logic ────────────────────────────────────────────────
  async function submitTransfer(
    fromAccountId: number,
    toAccountId: number,
    amt: number,
  ) {
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const { data } = await api.post<{ message: string }>('/banking/transfer', {
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: amt,
      })
      setSuccess(data.message)
      setAmount('')
      // Refresh balances after a successful transfer.
      const { data: fresh } = await api.get<Account[]>('/banking/accounts')
      setAccounts(fresh)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: StepUpRequiredDetail | string } } }
      const detail = err?.response?.data?.detail

      // Backend signalled that step-up MFA is required for this transfer amount.
      if (detail && typeof detail === 'object' && detail.code === 'STEP_UP_REQUIRED') {
        // Save the pending transfer so we can retry it after step-up completes.
        const pending: PendingTransfer = {
          from_account_id: fromAccountId,
          to_account_id: toAccountId,
          amount: amt,
        }
        sessionStorage.setItem(PENDING_TRANSFER_KEY, JSON.stringify(pending))
        navigate('/stepup?return_to=/transfers')
        return
      }

      const message = typeof detail === 'string' ? detail : 'Transfer failed'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  // ── Form submit handler ────────────────────────────────────────────────
  const handleTransfer = async () => {
    const amt = parseFloat(amount)
    if (!fromId || !toId) { setError('Select both accounts'); return }
    if (fromId === toId) { setError('Source and destination must differ'); return }
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount'); return }
    await submitTransfer(parseInt(fromId), parseInt(toId), amt)
  }

  const accountLabel = (a: Account) =>
    `${a.type.charAt(0).toUpperCase() + a.type.slice(1)} •••• ${a.account_number.slice(-4)}  ($${a.balance.toFixed(2)})`

  return (
    <div>
      <h2 style={s.heading}>Transfer Funds</h2>
      <div style={s.card}>
        <p style={s.sub}>Move funds between your accounts instantly.</p>

        <div style={s.group}>
          <label style={s.label}>From Account</label>
          <select style={s.select} value={fromId} onChange={e => setFromId(e.target.value)}>
            <option value="">Select account…</option>
            {accounts.map(a => (
              <option key={a.id} value={String(a.id)}>{accountLabel(a)}</option>
            ))}
          </select>
        </div>

        <div style={s.group}>
          <label style={s.label}>To Account</label>
          <select style={s.select} value={toId} onChange={e => setToId(e.target.value)}>
            <option value="">Select account…</option>
            {accounts
              .filter(a => String(a.id) !== fromId)
              .map(a => (
                <option key={a.id} value={String(a.id)}>{accountLabel(a)}</option>
              ))}
          </select>
        </div>

        <div style={s.group}>
          <label style={s.label}>Amount (USD)</label>
          <input
            style={s.input}
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>

        {error && <div style={s.err}>{error}</div>}
        {success && <div style={s.ok}>✓ {success}</div>}

        <button style={s.btn} onClick={handleTransfer} disabled={loading}>
          {loading ? 'Transferring…' : '↔ Transfer Funds'}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1f2328' },
  card: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
    padding: '2rem', maxWidth: '480px',
  },
  sub: { color: '#57606a', fontSize: '0.875rem', marginBottom: '1.5rem', marginTop: 0 },
  group: { marginBottom: '1rem' },
  label: { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#57606a', marginBottom: '0.35rem' },
  select: {
    width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #e5e7eb',
    borderRadius: '6px', fontSize: '0.9rem', background: '#fff',
    boxSizing: 'border-box' as const,
  },
  input: {
    width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #e5e7eb',
    borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' as const,
  },
  err: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    borderRadius: '6px', padding: '0.6rem', fontSize: '0.85rem', marginBottom: '0.75rem',
  },
  ok: {
    background: '#f0fdf4', border: '1px solid #86efac', color: '#16a34a',
    borderRadius: '6px', padding: '0.6rem', fontSize: '0.85rem', marginBottom: '0.75rem',
  },
  btn: {
    width: '100%', padding: '0.75rem', background: '#3b82d4', color: '#fff',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
  },
}

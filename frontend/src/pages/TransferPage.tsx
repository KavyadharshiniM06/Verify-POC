import React, { useEffect, useState } from 'react'
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

export default function TransferPage() {
  const { mfaVerified } = useAuth()
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<Account[]>('/banking/accounts')
      .then(r => setAccounts(r.data))
      .catch(() => {})
  }, [])

  const handleTransfer = async () => {
    const amt = parseFloat(amount)
    if (!fromId || !toId) { setError('Select both accounts'); return }
    if (fromId === toId) { setError('Source and destination must differ'); return }
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount'); return }

    // Step-up: if the current JWT was not issued with MFA, redirect to re-verify.
    if (!mfaVerified) {
      navigate('/stepup?return_to=/transfers')
      return
    }

    setLoading(true); setError(null); setSuccess(null)
    try {
      const { data } = await api.post<{ message: string }>('/banking/transfer', {
        from_account_id: parseInt(fromId),
        to_account_id: parseInt(toId),
        amount: amt,
      })
      setSuccess(data.message)
      setAmount('')
      // Refresh balances
      const { data: fresh } = await api.get<Account[]>('/banking/accounts')
      setAccounts(fresh)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail ?? 'Transfer failed')
    } finally {
      setLoading(false)
    }
  }

  const accountLabel = (a: Account) =>
    `${a.type.charAt(0).toUpperCase() + a.type.slice(1)} •••• ${a.account_number.slice(-4)}  ($${a.balance.toFixed(2)})`

  return (
    <div>
      <h2 style={s.heading}>Transfer Funds</h2>
      {!mfaVerified && (
        <div style={s.mfaWarning}>
          🔐 <strong>MFA required.</strong> You will be redirected to verify your identity before the transfer is processed.
        </div>
      )}
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
          {loading ? 'Transferring...' : '↔️ Transfer Funds'}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  heading: { margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1f2328' },
  mfaWarning: {
    background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px',
    padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#92400e', marginBottom: '1rem',
  },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '2rem', maxWidth: '480px' },
  sub: { color: '#57606a', fontSize: '0.875rem', marginBottom: '1.5rem', marginTop: 0 },
  group: { marginBottom: '1rem' },
  label: { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#57606a', marginBottom: '0.35rem' },
  select: {
    width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #e5e7eb',
    borderRadius: '6px', fontSize: '0.9rem', background: '#fff', boxSizing: 'border-box' as const,
  },
  input: {
    width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #e5e7eb',
    borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' as const,
  },
  err: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '6px', padding: '0.6rem', fontSize: '0.85rem', marginBottom: '0.75rem' },
  ok: { background: '#f0fdf4', border: '1px solid #86efac', color: '#16a34a', borderRadius: '6px', padding: '0.6rem', fontSize: '0.85rem', marginBottom: '0.75rem' },
  btn: {
    width: '100%', padding: '0.75rem', background: '#3b82d4', color: '#fff',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
  },
}

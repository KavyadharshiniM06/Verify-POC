import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/axios'

interface Account {
  id: number; type: string; account_number: string; balance: number; currency: string
}

interface StepUpDetail { code: 'STEP_UP_REQUIRED'; step_up_reason: string; message: string }
interface PendingTransfer { from_account_id: number; to_account_id: number; amount: number }

const PENDING_KEY = 'mb_pending_transfer'

export default function TransferPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [fromId,   setFromId]   = useState('')
  const [toId,     setToId]     = useState('')
  const [amount,   setAmount]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [success,  setSuccess]  = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    api.get<Account[]>('/banking/accounts').then(r => {
      setAccounts(r.data)
      if (r.data.length > 0) setFromId(String(r.data[0].id))
      if (r.data.length > 1) setToId(String(r.data[1].id))
    }).catch(() => {})
  }, [])

  // Success return from StepUpCallbackPage
  useEffect(() => {
    if (searchParams.get('stepup_success') === '1') {
      setSuccess('Transfer completed successfully.')
      setSearchParams({}, { replace: true })
      api.get<Account[]>('/banking/accounts').then(r => setAccounts(r.data)).catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fromAccount = accounts.find(a => String(a.id) === fromId)
  const amt = parseFloat(amount)
  const needsMfa = !isNaN(amt) && amt > 100

  const accountLabel = (a: Account) =>
    `${a.type.charAt(0).toUpperCase() + a.type.slice(1)} ••${a.account_number.slice(-4)} — $${a.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

  async function handleTransfer() {
    if (!fromId || !toId) { setError('Select both accounts'); return }
    if (fromId === toId) { setError('Source and destination must differ'); return }
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return }
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const { data } = await api.post<{ message: string }>('/banking/transfer', {
        from_account_id: parseInt(fromId), to_account_id: parseInt(toId), amount: amt,
      })
      setSuccess(data.message)
      setAmount('')
      const { data: fresh } = await api.get<Account[]>('/banking/accounts')
      setAccounts(fresh)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: StepUpDetail | string } } }
      const detail = err?.response?.data?.detail
      if (detail && typeof detail === 'object' && detail.code === 'STEP_UP_REQUIRED') {
        const pending: PendingTransfer = { from_account_id: parseInt(fromId), to_account_id: parseInt(toId), amount: amt }
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
        navigate('/stepup?return_to=/transfers')
        return
      }
      setError(typeof detail === 'string' ? detail : 'Transfer failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <h2 style={s.title}>Transfer Funds</h2>
          <p style={s.sub}>Move money between your accounts securely</p>
        </div>
      </div>

      <div style={s.layout}>
        {/* ── Transfer form ── */}
        <div style={s.formPanel}>
          <div style={s.formTitle}>
            <span style={s.formTitleIcon}>↑</span> New Transfer
          </div>

          <div style={s.divider} />

          {/* From */}
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>FROM ACCOUNT</label>
            <div style={s.selectWrapper}>
              <select style={s.select} value={fromId} onChange={e => setFromId(e.target.value)}>
                {accounts.map(a => (
                  <option key={a.id} value={String(a.id)}>{accountLabel(a)}</option>
                ))}
              </select>
              <span style={s.selectArrow}>⌄</span>
            </div>
            {fromAccount && (
              <div style={s.available}>
                Available: <strong style={{ color: '#1a2e2a' }}>${fromAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
              </div>
            )}
          </div>

          {/* Swap icon */}
          <div style={s.swapRow}>
            <div style={s.swapLine} />
            <div style={s.swapCircle}>⇅</div>
            <div style={s.swapLine} />
          </div>

          {/* To */}
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>TO ACCOUNT</label>
            <div style={s.selectWrapper}>
              <select style={s.select} value={toId} onChange={e => setToId(e.target.value)}>
                {accounts.filter(a => String(a.id) !== fromId).map(a => (
                  <option key={a.id} value={String(a.id)}>{accountLabel(a)}</option>
                ))}
              </select>
              <span style={s.selectArrow}>⌄</span>
            </div>
          </div>

          {/* Amount */}
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>AMOUNT (USD)</label>
            <div style={s.amountWrapper}>
              <span style={s.amountPrefix}>$</span>
              <input
                style={s.amountInput}
                type="number" min="0.01" step="0.01" placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)}
              />
            </div>
            {needsMfa && (
              <div style={s.mfaHint}>🔐 Transfers over $100 require MFA verification</div>
            )}
          </div>

          {error   && <div style={s.errBox}>{error}</div>}
          {success && <div style={s.successBox}>✓ {success}</div>}

          <button style={s.transferBtn} onClick={handleTransfer} disabled={loading}>
            {loading ? 'Processing…' : <><span>↑</span> Transfer Funds</>}
          </button>
        </div>

        {/* ── Right panel ── */}
        <div style={s.rightCol}>
          {/* Transfer info */}
          <div style={s.infoPanel}>
            <div style={s.infoPanelTitle}>Transfer Info</div>
            {[
              { icon: '⚡', title: 'Instant transfers', sub: 'Between your own accounts' },
              { icon: '🔐', title: 'Step-up MFA', sub: 'Required for amounts over $100' },
              { icon: '📋', title: 'Full history', sub: 'All transfers are logged' },
            ].map(item => (
              <div key={item.title} style={s.infoRow}>
                <span style={s.infoIcon}>{item.icon}</span>
                <div>
                  <div style={s.infoTitle}>{item.title}</div>
                  <div style={s.infoSub}>{item.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Balances */}
          <div style={s.infoPanel}>
            <div style={s.infoPanelTitle}>Your Balances</div>
            {accounts.map(a => (
              <div key={a.id} style={s.balanceRow}>
                <div style={s.balanceAcct}>
                  {a.type.charAt(0).toUpperCase() + a.type.slice(1)} ••{a.account_number.slice(-4)}
                </div>
                <div style={{ ...s.balanceAmt, color: a.balance < 0 ? '#dc2626' : '#1a2e2a' }}>
                  {a.balance < 0 ? '-' : ''}${Math.abs(a.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  title: { margin: '0 0 0.25rem', fontSize: '1.5rem', fontWeight: 700, color: '#1a2e2a' },
  sub: { margin: 0, color: '#9ca3af', fontSize: '0.85rem' },

  layout: { display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.25rem', alignItems: 'start' },

  formPanel: {
    background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb',
    padding: '1.75rem 2rem',
  },
  formTitle: {
    fontSize: '1rem', fontWeight: 700, color: '#1a2e2a',
    display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem',
  },
  formTitleIcon: {
    width: '28px', height: '28px', borderRadius: '6px', background: '#f0fdf4',
    color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.9rem', fontWeight: 700,
  },
  divider: { height: '1px', background: '#f3f4f6', marginBottom: '1.5rem' },

  fieldGroup: { marginBottom: '1.25rem' },
  fieldLabel: {
    display: 'block', fontSize: '0.68rem', fontWeight: 700,
    letterSpacing: '0.07em', color: '#9ca3af', marginBottom: '0.5rem',
  },
  selectWrapper: { position: 'relative' as const },
  select: {
    width: '100%', padding: '0.75rem 2.5rem 0.75rem 1rem',
    border: '1px solid #e5e7eb', borderRadius: '10px',
    fontSize: '0.9rem', color: '#1a2e2a', background: '#fff',
    appearance: 'none' as const, cursor: 'pointer',
    boxSizing: 'border-box' as const,
  },
  selectArrow: {
    position: 'absolute' as const, right: '1rem', top: '50%',
    transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' as const,
  },
  available: { marginTop: '0.4rem', fontSize: '0.8rem', color: '#57606a' },

  swapRow: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    margin: '0.5rem 0 1.25rem',
  },
  swapLine: { flex: 1, height: '1px', background: '#f3f4f6' },
  swapCircle: {
    width: '36px', height: '36px', borderRadius: '50%',
    border: '1px solid #e5e7eb', background: '#fff', color: '#9ca3af',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1rem', flexShrink: 0,
  },

  amountWrapper: { position: 'relative' as const },
  amountPrefix: {
    position: 'absolute' as const, left: '1rem', top: '50%',
    transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '0.9rem',
  },
  amountInput: {
    width: '100%', padding: '0.75rem 1rem 0.75rem 2rem',
    border: '1px solid #e5e7eb', borderRadius: '10px',
    fontSize: '0.9rem', color: '#1a2e2a',
    boxSizing: 'border-box' as const, outline: 'none',
  },
  mfaHint: {
    marginTop: '0.4rem', fontSize: '0.78rem', color: '#d97706',
    display: 'flex', alignItems: 'center', gap: '0.3rem',
  },

  errBox: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    borderRadius: '8px', padding: '0.65rem 1rem', fontSize: '0.83rem', marginBottom: '1rem',
  },
  successBox: {
    background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a',
    borderRadius: '8px', padding: '0.65rem 1rem', fontSize: '0.83rem', marginBottom: '1rem',
  },

  transferBtn: {
    width: '100%', padding: '0.85rem', background: '#1a2e2a', color: '#fff',
    border: 'none', borderRadius: '10px', cursor: 'pointer',
    fontWeight: 700, fontSize: '0.95rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
  },

  rightCol: { display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
  infoPanel: {
    background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb',
    padding: '1.25rem 1.5rem',
  },
  infoPanelTitle: { fontSize: '0.875rem', fontWeight: 700, color: '#1a2e2a', marginBottom: '0.85rem' },
  infoRow: {
    display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
    padding: '0.5rem 0', borderBottom: '1px solid #f3f4f6',
  },
  infoIcon: { fontSize: '1rem', flexShrink: 0, marginTop: '0.05rem' },
  infoTitle: { fontSize: '0.83rem', fontWeight: 600, color: '#1a2e2a' },
  infoSub: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' },

  balanceRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.55rem 0', borderBottom: '1px solid #f3f4f6',
  },
  balanceAcct: { fontSize: '0.82rem', color: '#57606a' },
  balanceAmt: { fontSize: '0.875rem', fontWeight: 700 },
}

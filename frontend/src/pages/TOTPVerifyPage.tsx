import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function TOTPVerifyPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [verifyUserId, setVerifyUserId] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [step, setStep] = useState<'id' | 'code'>('id')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleGetCode = async () => {
    if (!verifyUserId.trim()) { setError('IBM Verify User ID is required'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/auth/totp/enroll', { verify_user_id: verifyUserId.trim() })
      setTransactionId(data.transaction_id)
      setStep('code')
    } catch {
      setError('Could not start TOTP verification. Are you enrolled?')
    } finally { setLoading(false) }
  }

  const handleVerify = async () => {
    if (otpCode.length !== 6) { setError('Enter the 6-digit code'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/auth/totp/verify', {
        verify_user_id: verifyUserId,
        transaction_id: transactionId,
        otp_code: otpCode,
      })
      login(data.token, data.user)
      navigate('/dashboard')
    } catch {
      setError('Invalid code. Check your authenticator app.')
    } finally { setLoading(false) }
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <h1 style={s.title}>🔢 Authenticator Login</h1>

        {step === 'id' && (
          <>
            <p style={s.sub}>Enter your IBM Verify User ID.</p>
            <div style={s.group}>
              <label style={s.label}>IBM Verify User ID</label>
              <input
                style={s.input}
                placeholder="640005P8HK"
                value={verifyUserId}
                onChange={e => setVerifyUserId(e.target.value)}
              />
            </div>
            {error && <div style={s.err}>{error}</div>}
            <button style={s.btn} onClick={handleGetCode} disabled={loading}>
              {loading ? 'Loading...' : 'Continue →'}
            </button>
            <p style={{ fontSize: '0.8rem', color: '#57606a', marginTop: '0.5rem' }}>
              New?{' '}
              <span style={{ color: '#3b82d4', cursor: 'pointer' }} onClick={() => navigate('/auth/totp/enroll')}>
                Enroll TOTP
              </span>
            </p>
          </>
        )}

        {step === 'code' && (
          <>
            <p style={s.sub}>Enter the 6-digit code from your authenticator app.</p>
            <input
              style={{ ...s.input, textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem' }}
              maxLength={6}
              placeholder="000000"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
            />
            {error && <div style={s.err}>{error}</div>}
            <button style={s.btn} onClick={handleVerify} disabled={loading}>
              {loading ? 'Verifying...' : '→ Login'}
            </button>
          </>
        )}

        <button style={s.back} onClick={() => navigate('/')}>← Back to Login</button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: '#f7f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2.5rem', width: '100%', maxWidth: '400px', textAlign: 'center' },
  title: { margin: '0 0 0.25rem', fontSize: '1.5rem', fontWeight: 700 },
  sub: { color: '#57606a', fontSize: '0.875rem', marginBottom: '1rem' },
  group: { textAlign: 'left', marginBottom: '0.75rem' },
  label: { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#57606a', marginBottom: '0.3rem' },
  input: { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' as const },
  err: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '6px', padding: '0.6rem', fontSize: '0.85rem', marginBottom: '0.75rem' },
  btn: { width: '100%', padding: '0.75rem', background: '#3b82d4', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.95rem' },
  back: { background: 'transparent', border: 'none', color: '#57606a', cursor: 'pointer', fontSize: '0.85rem' },
}

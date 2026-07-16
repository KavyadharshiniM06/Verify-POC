import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function EmailOTPPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [verifyUserId, setVerifyUserId] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!verifyUserId.trim() || !email.trim()) { setError('User ID and email are required'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/auth/email-otp/send', {
        verify_user_id: verifyUserId.trim(),
        email: email.trim(),
      })
      setTransactionId(data.transaction_id)
      setStep('code')
    } catch {
      setError('Failed to send code. Check your User ID and email.')
    } finally { setLoading(false) }
  }

  const handleVerify = async () => {
    if (otpCode.length < 4) { setError('Enter the code from your email'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/auth/email-otp/verify', {
        verify_user_id: verifyUserId,
        transaction_id: transactionId,
        otp_code: otpCode,
        email,
        name: name || 'MockBank User',
      })
      login(data.token, data.user)
      navigate('/dashboard')
    } catch {
      setError('Invalid or expired code. Request a new one.')
    } finally { setLoading(false) }
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <h1 style={s.title}>📧 Email Login</h1>

        {step === 'email' && (
          <>
            <p style={s.sub}>We'll send a one-time code to your email.</p>
            {(
              [
                ['IBM Verify User ID', verifyUserId, setVerifyUserId, '640005P8HK', 'text'],
                ['Email Address', email, setEmail, 'you@example.com', 'email'],
                ['Your Name (optional)', name, setName, 'Jane Smith', 'text'],
              ] as Array<[string, string, (v: string) => void, string, string]>
            ).map(([lbl, val, set, ph, type]) => (
              <div key={lbl} style={s.group}>
                <label style={s.label}>{lbl}</label>
                <input style={s.input} type={type} placeholder={ph} value={val} onChange={e => set(e.target.value)} />
              </div>
            ))}
            {error && <div style={s.err}>{error}</div>}
            <button style={s.btn} onClick={handleSend} disabled={loading}>
              {loading ? 'Sending...' : 'Send Code →'}
            </button>
          </>
        )}

        {step === 'code' && (
          <>
            <p style={s.sub}>Check your email and enter the code below.</p>
            <input
              style={{ ...s.input, textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem', marginBottom: '0.75rem' }}
              placeholder="······"
              value={otpCode}
              maxLength={8}
              onChange={e => setOtpCode(e.target.value.trim())}
            />
            {error && <div style={s.err}>{error}</div>}
            <button style={s.btn} onClick={handleVerify} disabled={loading}>
              {loading ? 'Verifying...' : '→ Login'}
            </button>
            <button
              style={{ ...s.btn, background: 'transparent', color: '#3b82d4', border: 'none' }}
              onClick={() => { setStep('email'); setOtpCode('') }}
            >
              Resend code
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

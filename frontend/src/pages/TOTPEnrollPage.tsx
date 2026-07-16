import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { QRCodeSVG } from 'qrcode.react'
import api from '../api/axios'

type Step = 'input' | 'scan'

export default function TOTPEnrollPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [step, setStep] = useState<Step>('input')
  const [verifyUserId, setVerifyUserId] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [otpUri, setOtpUri] = useState('')
  const [secret, setSecret] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleEnroll = async () => {
    if (!verifyUserId.trim()) { setError('IBM Verify User ID is required'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/auth/totp/enroll', { verify_user_id: verifyUserId.trim() })
      setTransactionId(data.transaction_id)
      setOtpUri(data.otp_uri ?? '')
      setSecret(data.secret ?? '')
      setStep('scan')
    } catch {
      setError('Enrollment failed. Check your User ID.')
    } finally { setLoading(false) }
  }

  const handleConfirm = async () => {
    if (otpCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/auth/totp/enroll/confirm', {
        verify_user_id: verifyUserId,
        transaction_id: transactionId,
        otp_code: otpCode,
        email,
        name,
      })
      login(data.token, data.user)
      navigate('/dashboard')
    } catch {
      setError('Invalid code. Try again.')
    } finally { setLoading(false) }
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <h1 style={s.title}>🔢 Setup Authenticator</h1>

        {step === 'input' && (
          <>
            <p style={s.sub}>Enter your details to get a QR code.</p>
            {(
              [
                ['IBM Verify User ID', verifyUserId, setVerifyUserId, '640005P8HK'],
                ['Email', email, setEmail, 'you@example.com'],
                ['Full Name', name, setName, 'Jane Smith'],
              ] as Array<[string, string, (v: string) => void, string]>
            ).map(([lbl, val, set, ph]) => (
              <div key={lbl} style={s.group}>
                <label style={s.label}>{lbl}</label>
                <input style={s.input} value={val} placeholder={ph} onChange={e => set(e.target.value)} />
              </div>
            ))}
            {error && <div style={s.err}>{error}</div>}
            <button style={s.btn} onClick={handleEnroll} disabled={loading}>
              {loading ? 'Loading...' : 'Get QR Code →'}
            </button>
          </>
        )}

        {step === 'scan' && (
          <>
            <p style={s.sub}>Scan with Google Authenticator, Authy, or IBM Verify app.</p>
            {otpUri && <div style={s.qr}><QRCodeSVG value={otpUri} size={180} /></div>}
            {secret && <p style={s.secret}>Manual key: <code>{secret}</code></p>}
            <p style={s.sub}>Enter the 6-digit code to confirm:</p>
            <input
              style={{ ...s.input, textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem' }}
              maxLength={6}
              placeholder="000000"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
            />
            {error && <div style={s.err}>{error}</div>}
            <button style={s.btn} onClick={handleConfirm} disabled={loading}>
              {loading ? 'Verifying...' : '✓ Confirm & Login'}
            </button>
          </>
        )}

        <button style={s.back} onClick={() => navigate('/')}>← Back</button>
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
  qr: { display: 'flex', justifyContent: 'center', margin: '1rem 0' },
  secret: { fontSize: '0.75rem', color: '#57606a', wordBreak: 'break-all' as const, marginBottom: '1rem' },
  err: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '6px', padding: '0.6rem', fontSize: '0.85rem', marginBottom: '0.75rem' },
  btn: { width: '100%', padding: '0.75rem', background: '#3b82d4', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.95rem' },
  back: { background: 'transparent', border: 'none', color: '#57606a', cursor: 'pointer', fontSize: '0.85rem' },
}

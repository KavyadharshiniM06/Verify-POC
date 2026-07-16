import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { loginWithPasskey } from '../auth/fido2'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [verifyUserId, setVerifyUserId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handlePasskeyLogin = async () => {
    if (!verifyUserId.trim()) {
      setError('Please enter your IBM Verify User ID')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await loginWithPasskey(verifyUserId.trim())
      login(result.token, result.user)
      navigate('/dashboard')
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Passkey login failed. Is your device enrolled?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🏦</div>
        <h1 style={styles.title}>MockBank</h1>
        <p style={styles.tagline}>No passwords. Ever.</p>

        <div style={styles.inputGroup}>
          <label style={styles.label}>IBM Verify User ID</label>
          <input
            style={styles.input}
            type="text"
            placeholder="e.g. 640005P8HK"
            value={verifyUserId}
            onChange={(e) => setVerifyUserId(e.target.value)}
          />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          style={{ ...styles.btn, ...styles.btnPrimary }}
          onClick={handlePasskeyLogin}
          disabled={loading}
        >
          {loading ? 'Waiting for biometric...' : '🪪 Login with Face ID / Touch ID'}
        </button>

        <div style={styles.divider}><span>or</span></div>

        <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => navigate('/auth/totp')}>
          🔢 Login with Authenticator App
        </button>
        <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => navigate('/auth/push')}>
          📱 Login with IBM Verify App
        </button>
        <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => navigate('/auth/email-otp')}>
          📧 Login with Email OTP
        </button>
        <button
          style={{ ...styles.btn, ...styles.btnSecondary }}
          onClick={() => { window.location.href = '/api/auth/sso/login' }}
        >
          🔐 Login with SSO
        </button>

        <p style={styles.registerLink}>
          New user?{' '}
          <span style={styles.link} onClick={() => navigate('/register')}>
            Register a passkey
          </span>
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: '#f7f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2.5rem', width: '100%', maxWidth: '400px', textAlign: 'center' },
  logo: { fontSize: '3rem', marginBottom: '0.5rem' },
  title: { margin: '0 0 0.25rem', fontSize: '1.75rem', fontWeight: 700, color: '#1f2328' },
  tagline: { color: '#57606a', fontSize: '0.9rem', marginBottom: '1.5rem' },
  inputGroup: { textAlign: 'left', marginBottom: '1rem' },
  label: { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#57606a', marginBottom: '0.35rem' },
  input: { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' },
  error: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '6px', padding: '0.6rem', fontSize: '0.85rem', marginBottom: '0.75rem' },
  btn: { width: '100%', padding: '0.75rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' },
  btnPrimary: { background: '#3b82d4', color: '#fff' },
  btnSecondary: { background: '#f7f8fa', color: '#1f2328', border: '1px solid #e5e7eb' },
  divider: { color: '#57606a', fontSize: '0.8rem', margin: '0.5rem 0', position: 'relative' },
  registerLink: { marginTop: '1.5rem', fontSize: '0.85rem', color: '#57606a' },
  link: { color: '#3b82d4', cursor: 'pointer', fontWeight: 600 },
}

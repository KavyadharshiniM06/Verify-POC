import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { registerPasskey } from '../auth/fido2'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({ verifyUserId: '', username: '', displayName: '', email: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!form.verifyUserId || !form.username || !form.displayName || !form.email) {
      setError('All fields are required')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await registerPasskey(form.verifyUserId, form.username, form.displayName, form.email)
      login(result.token, result.user)
      navigate('/dashboard')
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Registration failed. Check your IBM Verify User ID.')
    } finally {
      setLoading(false)
    }
  }

  const fields: Array<{ key: keyof typeof form; label: string; placeholder: string; type?: string }> = [
    { key: 'verifyUserId', label: 'IBM Verify User ID', placeholder: '640005P8HK' },
    { key: 'email', label: 'Email', placeholder: 'you@example.com', type: 'email' },
    { key: 'displayName', label: 'Full Name', placeholder: 'Jane Smith' },
    { key: 'username', label: 'Username', placeholder: 'jsmith' },
  ]

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🪪</div>
        <h1 style={styles.title}>Register Passkey</h1>
        <p style={styles.sub}>Your device will prompt for Face ID, Touch ID, or fingerprint.</p>

        {fields.map(f => (
          <div key={f.key} style={styles.inputGroup}>
            <label style={styles.label}>{f.label}</label>
            <input
              style={styles.input}
              type={f.type ?? 'text'}
              placeholder={f.placeholder}
              value={form[f.key]}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
            />
          </div>
        ))}

        {error && <div style={styles.error}>{error}</div>}

        <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleRegister} disabled={loading}>
          {loading ? 'Setting up passkey...' : '🪪 Register with Biometric'}
        </button>
        <button style={{ ...styles.btn, ...styles.btnBack }} onClick={() => navigate('/')}>
          ← Back to Login
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: '#f7f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2.5rem', width: '100%', maxWidth: '400px', textAlign: 'center' },
  logo: { fontSize: '2.5rem', marginBottom: '0.5rem' },
  title: { margin: '0 0 0.25rem', fontSize: '1.5rem', fontWeight: 700 },
  sub: { color: '#57606a', fontSize: '0.85rem', marginBottom: '1.5rem' },
  inputGroup: { textAlign: 'left', marginBottom: '0.75rem' },
  label: { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#57606a', marginBottom: '0.3rem' },
  input: { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' },
  error: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '6px', padding: '0.6rem', fontSize: '0.85rem', marginBottom: '0.75rem' },
  btn: { width: '100%', padding: '0.75rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' },
  btnPrimary: { background: '#3b82d4', color: '#fff' },
  btnBack: { background: 'transparent', color: '#57606a', border: 'none' },
}

import React, { useState } from 'react'
import api from '../api/axios'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/auth/sso/login')
      window.location.href = data.authorization_url
    } catch {
      setError('Unable to start IBM Verify login. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🏦</div>
        <h1 style={styles.title}>MockBank</h1>
        <p style={styles.tagline}>Sign in with IBM Verify SaaS</p>
        <p style={styles.description}>
          Authentication and user lifecycle management are handled by IBM Verify.
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <button
          style={{ ...styles.btn, ...styles.btnPrimary }}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Redirecting...' : 'Login with IBM Verify'}
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: '#f7f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2.5rem', width: '100%', maxWidth: '420px', textAlign: 'center' },
  logo: { fontSize: '3rem', marginBottom: '0.5rem' },
  title: { margin: '0 0 0.25rem', fontSize: '1.75rem', fontWeight: 700, color: '#1f2328' },
  tagline: { color: '#57606a', fontSize: '1rem', marginBottom: '0.5rem' },
  description: { color: '#57606a', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 },
  error: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '6px', padding: '0.6rem', fontSize: '0.85rem', marginBottom: '0.75rem' },
  btn: { width: '100%', padding: '0.85rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600 },
  btnPrimary: { background: '#3b82d4', color: '#fff' },
}

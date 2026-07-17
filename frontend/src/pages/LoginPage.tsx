import React, { useState } from 'react'
import api from '../api/axios'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.get('/auth/sso/login')
      window.location.href = data.authorization_url
    } catch {
      setError('Unable to connect to IBM Verify. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.logo}>🏦</div>
        <h1 style={s.title}>MockBank</h1>
        <p style={s.tagline}>Powered by IBM Verify SaaS</p>

        <div style={s.divider} />

        <p style={s.description}>
          Sign in using IBM Verify. On the next page you can choose your
          preferred authentication method — password, TOTP, email OTP, push
          notification, or passkey.
        </p>

        {error && <div style={s.error}>{error}</div>}

        <button style={s.ssoBtn} onClick={handleLogin} disabled={loading}>
          {loading ? (
            <span style={s.btnInner}>
              <span style={s.spinner} /> Redirecting to IBM Verify…
            </span>
          ) : (
            <span style={s.btnInner}>
              <span style={s.ibmIcon}>
                <svg width="20" height="20" viewBox="0 0 32 32" fill="currentColor">
                  <path d="M0 6h32v2H0zm4 4h24v2H4zm-4 4h32v2H0zm4 4h24v2H4zm-4 4h32v2H0zm4 4h24v2H4zm-4 4h32v2H0z"/>
                </svg>
              </span>
              Sign in with IBM Verify
            </span>
          )}
        </button>

        <div style={s.methodsHint}>
          <p style={s.hintTitle}>Available authentication methods</p>
          <div style={s.methodGrid}>
            {[
              { icon: '🔑', label: 'Username & Password' },
              { icon: '🔢', label: 'TOTP Authenticator' },
              { icon: '📧', label: 'Email OTP' },
              { icon: '📱', label: 'Push Notification' },
              { icon: '🪪', label: 'Passkey / FIDO2' },
            ].map(m => (
              <div key={m.label} style={s.methodChip}>
                <span>{m.icon}</span>
                <span style={s.chipLabel}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#f7f8fa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: '420px',
    textAlign: 'center',
  },
  logo: { fontSize: '3rem', marginBottom: '0.5rem' },
  title: { margin: '0 0 0.25rem', fontSize: '1.75rem', fontWeight: 700, color: '#1f2328' },
  tagline: { color: '#57606a', fontSize: '0.9rem', margin: '0 0 1.25rem' },
  divider: { height: '1px', background: '#e5e7eb', margin: '0 0 1.25rem' },
  description: {
    color: '#57606a',
    fontSize: '0.85rem',
    lineHeight: 1.6,
    marginBottom: '1.5rem',
  },
  error: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    borderRadius: '6px',
    padding: '0.6rem',
    fontSize: '0.85rem',
    marginBottom: '1rem',
  },
  ssoBtn: {
    width: '100%',
    padding: '0.85rem 1rem',
    background: '#1f2328',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.95rem',
    marginBottom: '1.5rem',
  },
  btnInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
  },
  ibmIcon: { display: 'flex', alignItems: 'center' },
  spinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  methodsHint: {
    background: '#f7f8fa',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '0.875rem',
  },
  hintTitle: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#57606a',
    marginBottom: '0.6rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  methodGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.4rem',
    justifyContent: 'center',
  },
  methodChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '999px',
    padding: '0.2rem 0.6rem',
    fontSize: '0.75rem',
    color: '#1f2328',
  },
  chipLabel: { fontWeight: 500 },
}

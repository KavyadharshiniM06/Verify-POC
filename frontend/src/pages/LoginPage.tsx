import React, { useState } from 'react'
import api from '../api/axios'

type Method = 'sso' | 'totp' | 'push' | 'email' | 'passkey'

const AUTH_METHODS: Array<{
  id: Method
  icon: string
  label: string
  description: string
  acr?: string   // IBM Verify acr_values to request this specific factor
}> = [
  {
    id: 'sso',
    icon: '🔐',
    label: 'Login with IBM Verify (SSO)',
    description: 'Federated login — IBM Verify handles authentication',
  },
  {
    id: 'totp',
    icon: '🔢',
    label: 'Authenticator App (TOTP)',
    description: 'Google Authenticator, Authy, or IBM Verify app',
    acr: 'urn:ibm:security:authentication:asf:mechanism:totp',
  },
  {
    id: 'email',
    icon: '📧',
    label: 'Email One-Time Code',
    description: 'IBM Verify sends a code to your registered email',
    acr: 'urn:ibm:security:authentication:asf:mechanism:emailotp',
  },
  {
    id: 'push',
    icon: '📱',
    label: 'IBM Verify Push Notification',
    description: 'Approve a push notification on your enrolled device',
    acr: 'urn:ibm:security:authentication:asf:mechanism:push',
  },
  {
    id: 'passkey',
    icon: '🪪',
    label: 'Passkey (Face ID / Touch ID)',
    description: 'Biometric login via WebAuthn — requires ngrok setup',
    acr: 'urn:ibm:security:authentication:asf:mechanism:fido2',
  },
]

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<Method | null>(null)

  const handleSelect = async (method: Method, acr?: string) => {
    setError(null)
    setLoading(method)
    try {
      const params = acr ? `?acr_values=${encodeURIComponent(acr)}` : ''
      const { data } = await api.get(`/auth/sso/login${params}`)
      window.location.href = data.authorization_url
    } catch {
      setError('Unable to connect to IBM Verify. Please try again.')
      setLoading(null)
    }
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.logo}>🏦</div>
        <h1 style={s.title}>MockBank</h1>
        <p style={s.tagline}>Powered by IBM Verify SaaS</p>
        <p style={s.description}>
          Choose how you'd like to authenticate. All methods are handled by IBM Verify.
        </p>

        {error && <div style={s.error}>{error}</div>}

        <div style={s.methodList}>
          {AUTH_METHODS.map(m => (
            <button
              key={m.id}
              style={{
                ...s.methodBtn,
                opacity: loading && loading !== m.id ? 0.5 : 1,
              }}
              onClick={() => handleSelect(m.id, m.acr)}
              disabled={loading !== null}
            >
              <span style={s.methodIcon}>{m.icon}</span>
              <span style={s.methodText}>
                <span style={s.methodLabel}>{m.label}</span>
                <span style={s.methodDesc}>{m.description}</span>
              </span>
              <span style={s.arrow}>
                {loading === m.id ? '…' : '›'}
              </span>
            </button>
          ))}
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
    maxWidth: '440px',
    textAlign: 'center',
  },
  logo: { fontSize: '3rem', marginBottom: '0.5rem' },
  title: { margin: '0 0 0.25rem', fontSize: '1.75rem', fontWeight: 700, color: '#1f2328' },
  tagline: { color: '#57606a', fontSize: '0.95rem', marginBottom: '0.4rem' },
  description: {
    color: '#57606a',
    fontSize: '0.85rem',
    marginBottom: '1.5rem',
    lineHeight: 1.5,
  },
  error: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    borderRadius: '6px',
    padding: '0.6rem',
    fontSize: '0.85rem',
    marginBottom: '0.75rem',
  },
  methodList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  methodBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    padding: '0.85rem 1rem',
    background: '#f7f8fa',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s',
  },
  methodIcon: { fontSize: '1.3rem', flexShrink: 0, width: '1.75rem', textAlign: 'center' },
  methodText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.1rem',
  },
  methodLabel: { fontSize: '0.875rem', fontWeight: 600, color: '#1f2328' },
  methodDesc: { fontSize: '0.75rem', color: '#57606a' },
  arrow: { fontSize: '1.1rem', color: '#57606a', flexShrink: 0 },
}

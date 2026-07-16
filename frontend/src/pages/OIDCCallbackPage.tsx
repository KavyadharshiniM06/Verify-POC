import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function OIDCCallbackPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')

    if (!code || !state) {
      setError('Missing code or state in callback URL.')
      return
    }

    api
      .post('/auth/sso/callback', { code, state })
      .then(({ data }) => {
        login(data.token, data.user)
        navigate('/dashboard', { replace: true })
      })
      .catch(() => setError('SSO login failed. Please try again.'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h2 style={{ color: '#dc2626', margin: '0 0 0.5rem' }}>SSO Error</h2>
          <p style={s.sub}>{error}</p>
          <button style={s.btn} onClick={() => navigate('/')}>← Back to Login</button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.spinner} />
        <p style={s.sub}>Completing SSO login...</p>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: '#f7f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2.5rem', textAlign: 'center', minWidth: '300px' },
  sub: { color: '#57606a', fontSize: '0.9rem' },
  spinner: { width: '40px', height: '40px', border: '4px solid #e5e7eb', borderTop: '4px solid #3b82d4', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' },
  btn: { padding: '0.6rem 1.5rem', background: '#3b82d4', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 },
}

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function OIDCCallbackPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const completeLogin = async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const state = params.get('state')

      if (!code || !state) {
        setError('Missing code or state in callback URL.')
        return
      }

      try {
        const { data } = await api.post('/auth/sso/callback', { code, state })
        login(data.token, data.user)
        navigate('/dashboard', { replace: true })
      } catch {
        setError('IBM Verify login failed. Please try again.')
      }
    }

    void completeLogin()
  }, [login, navigate])

  if (error) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h2 style={{ color: '#dc2626', margin: '0 0 0.5rem' }}>Login Error</h2>
          <p style={s.sub}>{error}</p>
          <button style={s.btn} onClick={() => navigate('/')}>← Back to Login</button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <p style={s.sub}>Completing IBM Verify login...</p>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: '#f7f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2.5rem', textAlign: 'center', minWidth: '300px' },
  sub: { color: '#57606a', fontSize: '0.9rem' },
  btn: { padding: '0.6rem 1.5rem', background: '#3b82d4', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 },
}

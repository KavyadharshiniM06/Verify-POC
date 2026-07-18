import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function OIDCCallbackPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  // Guard against React StrictMode double-invocation — the auth code is single-use.
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const completeLogin = async () => {
      // IBM Verify may deliver code+state as query params (?code=…) or hash fragment (#code=…)
      // depending on the response_mode configured on the application.
      // We check query string first, then fall back to the hash fragment.
      const queryParams = new URLSearchParams(window.location.search)
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))

      const code = queryParams.get('code') ?? hashParams.get('code')
      const state = queryParams.get('state') ?? hashParams.get('state')

      // IBM Verify may also return an error param (e.g. access_denied)
      const error = queryParams.get('error') ?? hashParams.get('error')
      const errorDescription = queryParams.get('error_description') ?? hashParams.get('error_description')

      if (error) {
        setError(`IBM Verify returned an error: ${errorDescription ?? error}`)
        return
      }

      if (!code || !state) {
        console.error('[OIDC Callback] Missing params. URL:', window.location.href)
        setError(`Missing code or state in callback URL. Received: ${window.location.href}`)
        return
      }

      try {
        const { data } = await api.post('/auth/sso/callback', { code, state })
        // IBM Verify handled the full authentication experience — registration,
        // factor enrollment, and login are all managed on the Verify hosted pages.
        login(data.token, data.user, false, null)
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

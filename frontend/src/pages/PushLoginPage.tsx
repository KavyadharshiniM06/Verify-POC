import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

type Status = 'idle' | 'waiting' | 'denied' | 'timeout'

const POLL_MS = 2000
const MAX_MS = 60000

export default function PushLoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [verifyUserId, setVerifyUserId] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  useEffect(() => () => stop(), [])

  const handleInitiate = async () => {
    if (!verifyUserId.trim()) { setError('IBM Verify User ID is required'); return }
    setError(null)
    try {
      const { data } = await api.post('/auth/push/initiate', { verify_user_id: verifyUserId.trim() })
      const txId: string = data.transaction_id
      setStatus('waiting')

      pollRef.current = setInterval(async () => {
        try {
          const { data: p } = await api.get(`/auth/push/poll/${txId}`)
          if (p.status === 'approved') {
            stop()
            const { data: auth } = await api.post('/auth/push/complete', {
              verify_user_id: verifyUserId.trim(),
              transaction_id: txId,
            })
            login(auth.token, auth.user)
            navigate('/dashboard')
          } else if (p.status === 'denied') {
            stop()
            setStatus('denied')
          }
        } catch {
          stop()
          setError('Connection error.')
          setStatus('idle')
        }
      }, POLL_MS)

      timeoutRef.current = setTimeout(() => { stop(); setStatus('timeout') }, MAX_MS)
    } catch {
      setError('Failed to send push. Is your device enrolled?')
    }
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <h1 style={s.title}>📱 IBM Verify App</h1>

        {status === 'idle' && (
          <>
            <p style={s.sub}>A push notification will be sent to your enrolled device.</p>
            <div style={s.group}>
              <label style={s.label}>IBM Verify User ID</label>
              <input
                style={s.input}
                placeholder="640005P8HK"
                value={verifyUserId}
                onChange={e => setVerifyUserId(e.target.value)}
              />
            </div>
            {error && <div style={s.err}>{error}</div>}
            <button style={s.btn} onClick={handleInitiate}>Send Push Notification</button>
          </>
        )}

        {status === 'waiting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem 0' }}>
            <div style={s.spinner} />
            <p style={{ fontWeight: 600, margin: '0 0 0.5rem', color: '#1f2328' }}>
              Waiting for approval on your phone...
            </p>
            <p style={s.sub}>Check your IBM Verify app and tap <strong>Approve</strong>.</p>
            <button
              style={{ ...s.btn, background: '#f7f8fa', color: '#57606a', border: '1px solid #e5e7eb' }}
              onClick={() => { stop(); setStatus('idle') }}
            >
              Cancel
            </button>
          </div>
        )}

        {(status === 'denied' || status === 'timeout') && (
          <>
            <div style={s.errBox}>
              {status === 'denied' ? '❌ Request was denied.' : '⏱ Request timed out after 60 seconds.'}
            </div>
            <button style={s.btn} onClick={() => setStatus('idle')}>Try Again</button>
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
  errBox: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' },
  btn: { width: '100%', padding: '0.75rem', background: '#3b82d4', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.95rem' },
  back: { background: 'transparent', border: 'none', color: '#57606a', cursor: 'pointer', fontSize: '0.85rem' },
  spinner: { width: '48px', height: '48px', border: '4px solid #e5e7eb', borderTop: '4px solid #3b82d4', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1rem' },
}

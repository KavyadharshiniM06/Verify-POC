import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: false,
})

// Attach JWT to every request.
// NOTE: sessionStorage is used here (cleared on tab close) rather than localStorage
// (which persists across browser sessions). This is a reasonable trade-off for a POC.
// In production, prefer an in-memory React context to avoid XSS token exposure entirely.
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('mb_token')
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

export default api

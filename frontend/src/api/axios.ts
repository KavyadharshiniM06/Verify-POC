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
  // Only inject the stored session token if the caller has not already set
  // an explicit Authorization header (e.g. a one-off step-up token override).
  if (!config.headers['Authorization']) {
    const token = sessionStorage.getItem('mb_token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
  }
  return config
})

export default api

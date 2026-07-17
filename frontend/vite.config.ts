import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 0.0.0.0 required so the Vite dev server is reachable inside Docker
    host: '0.0.0.0',
    port: 3000,
    // Required for React Router: all non-asset paths must return index.html
    // so client-side routes like /callback, /dashboard etc. work on hard refresh.
    historyApiFallback: true,
    proxy: {
      '/api': {
        // Local dev — backend running on 127.0.0.1:8000
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})

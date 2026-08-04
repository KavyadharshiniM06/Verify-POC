/**
 * Vite config — HR Admin Portal
 * Dev server: http://localhost:3001
 *
 * Strategy: transform index.html at serve-time to point to main-admin.tsx
 * so @vitejs/plugin-react injects its preamble correctly.
 */
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/** Rewrites the <script src> in index.html to load main-admin.tsx. */
function useAdminEntry(): Plugin {
  return {
    name: 'use-admin-entry',
    transformIndexHtml(html) {
      return html.replace(
        /src="\/src\/main\.tsx"/,
        'src="/src/main-admin.tsx"'
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname), ['VITE_'])
  const apiTarget = env.VITE_API_URL ?? 'http://localhost:8000'

  return {
    plugins: [
      react(),
      useAdminEntry(),
    ],
    root: path.resolve(__dirname),
    build: {
      outDir: path.resolve(__dirname, 'dist-admin'),
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 3001,
      cors: true,
      headers: { 'Access-Control-Allow-Origin': '*' },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/api/, ''),
        },
        '/auth': { target: apiTarget, changeOrigin: true },
      },
    },
  }
})

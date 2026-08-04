/**
 * Vite config — Credit Analyst Portal
 * Dev server: http://localhost:3002
 *
 * Strategy: transform index.html at serve-time to point to main-analyst.tsx
 * so @vitejs/plugin-react injects its preamble correctly.
 */
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/** Rewrites the <script src> in index.html to load main-analyst.tsx. */
function useAnalystEntry(): Plugin {
  return {
    name: 'use-analyst-entry',
    transformIndexHtml(html) {
      return html.replace(
        /src="\/src\/main\.tsx"/,
        'src="/src/main-analyst.tsx"'
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
      useAnalystEntry(),
    ],
    root: path.resolve(__dirname),
    build: {
      outDir: path.resolve(__dirname, 'dist-analyst'),
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 3002,
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

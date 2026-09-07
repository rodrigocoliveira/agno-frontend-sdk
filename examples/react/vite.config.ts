import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const pkg = (name: string) => fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@rodrigocoliveira/agno-hooks': pkg('agno-hooks'),
      '@rodrigocoliveira/agno-api': pkg('agno-api'),
    },
  },
  server: {
    proxy: {
      '/agno': {
        target: process.env.AGNO_URL ?? 'http://localhost:7778',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agno/, ''),
      },
    },
  },
})

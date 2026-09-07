import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Point the packages at their sources so edits in packages/* hot-reload here.
// Note: tsc still resolves these packages via dist/ (no matching tsconfig `paths`), so
// `typecheck` won't catch an unbuilt source change — rebuild before typechecking if you've
// edited packages/*/src.
const pkg = (name: string) => fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@rodrigocoliveira/agno-hooks': pkg('agno-hooks'),
      '@rodrigocoliveira/agno-api': pkg('agno-api'),
    },
  },
})

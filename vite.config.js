import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  // yahoo-finance2 is Node.js-only (used in api/). Prevent Vite from
  // trying to bundle it or its Deno test helpers for the browser.
  optimizeDeps: {
    exclude: ['yahoo-finance2'],
    esbuildOptions: {
      external: [
        '@std/testing/mock',
        '@std/testing/bdd',
        '@gadicc/fetch-mock-cache/runtimes/deno.ts',
        '@gadicc/fetch-mock-cache/stores/fs.ts',
      ],
    },
  },
  build: {
    rollupOptions: {
      external: (id) => id === 'yahoo-finance2' || id.startsWith('yahoo-finance2/'),
    },
  },
})

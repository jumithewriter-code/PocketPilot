/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The coach runs in server/ so the API key never reaches the browser.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    // The UI journey tests type into real forms; allow for a slow or busy machine.
    testTimeout: 20_000,
  },
})

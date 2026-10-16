import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Recharts measures its container; jsdom has no layout engine or ResizeObserver.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (RO as unknown as typeof ResizeObserver)
window.scrollTo = () => {}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

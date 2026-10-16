import { describe, expect, it } from 'vitest'
import handler from './coach.ts'

function call(method: string, body: unknown, headers: Record<string, string> = {}) {
  const out: { status: number; json: unknown; headers: Record<string, string> } = { status: 0, json: null, headers: {} }
  const res = {
    status(c: number) { out.status = c; return res },
    setHeader(k: string, v: string) { out.headers[k] = v },
    json(b: unknown) { out.json = b },
  }
  return handler({ method, body, headers }, res).then(() => out)
}

describe('serverless coach endpoint', () => {
  it('rejects non-POST requests', async () => {
    expect((await call('GET', undefined)).status).toBe(405)
  })

  it('answers 503 no_api_key when the host has no key, so the app falls back', async () => {
    const saved = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      const r = await call('POST', { facts: {} }, { 'x-forwarded-for': '9.9.9.9' })
      expect(r.status).toBe(503)
      expect(r.json).toEqual({ error: 'no_api_key' })
      expect(r.headers['cache-control']).toBe('no-store')
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved
    }
  })

  it('validates the body when a key is present, before any model call', async () => {
    const saved = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    try {
      expect((await call('POST', { facts: {} })).status).toBe(400)
      expect((await call('POST', 'not json')).status).toBe(400)
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = saved
    }
  })
})

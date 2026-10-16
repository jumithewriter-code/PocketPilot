/**
 * Serverless entry for hosts such as Vercel: POST /api/coach.
 * Same logic as server/index.ts; the key comes from the host's environment
 * variables and is never sent to the browser. Without a key it answers 503 and
 * the app shows its built-in explainer.
 */
import { DEFAULT_MODEL, handleCoach, makeRateLimiter } from '../server/coach.ts'

interface Req {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string }
}
interface Res {
  status(code: number): Res
  setHeader(name: string, value: string): void
  json(body: unknown): void
}

const rateLimit = makeRateLimiter()

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  const forwarded = req.headers['x-forwarded-for']
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})
  const reply = await handleCoach(raw, ip, {
    apiKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
    model: process.env.COACH_MODEL?.trim() || DEFAULT_MODEL,
    rateLimit,
  })
  res.status(reply.status).json(reply.body)
}

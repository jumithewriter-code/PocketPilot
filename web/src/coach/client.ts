/**
 * Asks the server-side coach for an explanation. The dashboard never depends on
 * this: any failure, timeout, unconfigured key or unverifiable answer produces
 * the clearly labelled built-in explanation instead.
 */
import { buildFallbackResponse } from './fallback'
import { buildExpectedImpact } from './facts'
import type { CoachFacts, CoachResponse, CoachResult } from './types'
import { verifyCoachResponse } from './verify'

const TIMEOUT_MS = 30_000

function builtIn(facts: CoachFacts, notice: string, question = ''): CoachResult {
  const extra = question ? ' It cannot read your question, so this is a general explanation of your numbers.' : ''
  return { source: 'built-in', response: buildFallbackResponse(facts), expectedImpact: buildExpectedImpact(facts), verified: true, notice: notice + extra }
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

export function isCoachResponse(v: unknown): v is CoachResponse {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.summary === 'string' && (['observations', 'risks', 'recommendations', 'assumptions', 'next_steps', 'questions'] as const).every((k) => isStringArray(r[k]))
}

export async function askCoach(facts: CoachFacts, fetchImpl: typeof fetch = fetch, rawQuestion = ''): Promise<CoachResult> {
  const question = rawQuestion.trim().slice(0, 300)
  let res: Response
  try {
    res = await fetchImpl('/api/coach', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(question ? { facts, question } : { facts }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === 'TimeoutError'
    return builtIn(facts, timedOut ? 'The AI service took too long to answer, so this is the built-in explanation.' : 'The AI service could not be reached, so this is the built-in explanation.', question)
  }
  if (!res.ok) {
    const code = await res.json().then((j: { error?: string }) => j.error).catch(() => undefined)
    const why =
      code === 'no_api_key' ? 'The AI coach is not set up on this server (no API key), so this is the built-in explanation.'
      : res.status === 429 ? 'The AI service is busy right now (rate limit), so this is the built-in explanation.'
      : 'The AI service had a problem, so this is the built-in explanation.'
    return builtIn(facts, why, question)
  }
  let body: { model?: string; response?: unknown }
  try {
    body = await res.json()
  } catch {
    return builtIn(facts, 'The AI service sent an unreadable answer, so this is the built-in explanation.', question)
  }
  if (!isCoachResponse(body.response)) return builtIn(facts, 'The AI answer was not in the expected format, so this is the built-in explanation.', question)
  const check = verifyCoachResponse(body.response, facts, question)
  if (!check.ok) return builtIn(facts, 'The AI answer included figures or wording that PocketPilot could not verify against your data, so this is the built-in explanation instead.', question)
  return { source: 'ai', model: body.model, response: body.response, expectedImpact: buildExpectedImpact(facts), verified: true }
}

/**
 * Guardrails applied to any AI-written text before it is shown.
 *
 * 1. Figures: every ₦ amount and every percentage must match a number the
 *    engine supplied (within rounding). The model is told not to calculate, so
 *    an unmatched figure means it invented or derived a number.
 * 2. Language: no guarantees, and no loans/investments/crypto suggestions.
 */
import type { CoachFacts, CoachResponse } from './types'

/** Every number in the facts: numeric leaves plus numbers inside string leaves. */
export function allowedNumbers(facts: CoachFacts): number[] {
  const out: number[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) out.push(Math.abs(v))
    else if (typeof v === 'string') {
      for (const m of v.matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.push(Number(m[0].replace(/,/g, '')))
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(facts)
  return out
}

const UNIT: Record<string, number> = { k: 1_000, m: 1_000_000 }

export function extractAmounts(text: string): number[] {
  return [...text.matchAll(/₦\s?(\d[\d,]*(?:\.\d+)?)\s?([kKmM])?\b/g)].map((m) => Number(m[1].replace(/,/g, '')) * (m[2] ? UNIT[m[2].toLowerCase()] : 1))
}

export function extractPercents(text: string): number[] {
  return [...text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map((m) => Number(m[1]))
}

const BANNED: [RegExp, string][] = [
  [/(?<!\bno\s)(?<!\bnot\s)\bguarantee[sd]?\b/i, 'promises a guaranteed outcome'],
  [/\b(?:definitely|certainly|surely)\s+(?:will|reach|achieve|hit)\b|\byou will (?:definitely|certainly)\b/i, 'states an outcome as certain'],
  [/\brisk[- ]free\b/i, 'claims something is risk-free'],
  [/\b(?:take (?:out )?a loan|borrow(?:ing)? (?:money|from)|payday|loan app|invest(?:ing|ment)?\b|crypto(?:currency)?|forex|stock market|mutual fund)/i, 'suggests a loan or investment'],
]

export interface Verification {
  ok: boolean
  problems: string[]
}

function texts(r: CoachResponse): string[] {
  return [r.summary, ...r.observations, ...r.risks, ...r.recommendations, ...r.assumptions, ...r.next_steps, ...r.questions]
}

/** Numbers the user typed in their own question may be repeated back. */
function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, '')))
}

/** "I can't suggest loans" mentions a loan without recommending one. */
const REFUSAL = /(?:\b(?:not|no|never|cannot|avoid|unable|without)\b|n't\b)[^.!?]{0,80}$/i

export function verifyCoachResponse(r: CoachResponse, facts: CoachFacts, question = ''): Verification {
  const allowed = [...allowedNumbers(facts), ...numbersIn(question)]
  const problems: string[] = []
  for (const t of texts(r)) {
    for (const a of extractAmounts(t)) {
      // ₦0 is always a fair thing to say (for example "below ₦0").
      if (a !== 0 && !allowed.some((f) => Math.abs(a - f) <= Math.max(1, f * 0.005))) problems.push(`Amount ₦${a.toLocaleString('en-NG')} does not match any calculated figure`)
    }
    for (const p of extractPercents(t)) {
      if (!allowed.some((f) => Math.abs(p - f) <= 1)) problems.push(`Percentage ${p}% does not match any calculated figure`)
    }
    for (const [re, why] of BANNED) {
      const hit = re.exec(t)
      if (!hit) continue
      // A refusal ("I can't suggest loans") is fine; only recommendations are blocked.
      if (why === 'suggests a loan or investment' && REFUSAL.test(t.slice(0, hit.index))) continue
      problems.push(`Text ${why}: "${t.slice(0, 60)}"`)
    }
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)] }
}

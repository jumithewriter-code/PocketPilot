import { describe, expect, it } from 'vitest'
import { askCoach } from './client'
import { buildExpectedImpact, buildCoachFacts, inferFocus } from './facts'
import { buildFallbackResponse } from './fallback'
import { allowedNumbers, extractAmounts, extractPercents, verifyCoachResponse } from './verify'
import { addDays } from '../engine/dates'
import { projectBalance, recordedBalance } from '../engine/finance'
import { buildBlankData, buildDemoData } from '../engine/seed'
import { EMPTY_CHANGES, type AppData, type ScenarioChanges } from '../engine/types'
import type { CoachFacts, CoachFocus, CoachResponse } from './types'

const TODAY = '2026-10-15'
const demo = () => buildDemoData(TODAY)
const facts = (data: AppData, over: { changes?: ScenarioChanges; focus?: CoachFocus; income?: boolean } = {}) =>
  buildCoachFacts({ data, asOf: TODAY, includeExpectedIncome: over.income ?? true, changes: over.changes ?? EMPTY_CHANGES, focus: over.focus ?? 'overview' })

const scenario: ScenarioChanges = { categoryCutPct: { 'Entertainment and leisure': 50 }, plannedChanges: { 'pe-4': { removed: true } }, extraSavingsPerWeek: 0 }
const withGoal = (d: AppData): AppData => ({ ...d, goal: { id: 'g', description: 'Laptop', targetAmount: 60_000, savedAmount: 10_000, targetDate: addDays(TODAY, 30) } })

describe('facts sent to the coach', () => {
  it('contains only calculated figures, no names and no transaction text', () => {
    const d = demo()
    const json = JSON.stringify(facts(d))
    expect(json).not.toContain('Ada')
    const planned = d.profile.plannedExpenses.map((p) => p.label) // planned-expense names are sent on purpose
    for (const t of d.transactions.filter((x) => !planned.includes(x.description)).slice(0, 60)) expect(json).not.toContain(t.description)
    expect(json).not.toContain('Monthly allowance from Dad')
    expect(JSON.stringify(facts(withGoal(d)))).toContain('Laptop') // a goal name the user chose is included deliberately
  })

  it('uses the engine for every number', () => {
    const d = demo()
    const f = facts(d)
    expect(f.balance).toBe(Math.round(recordedBalance(d.profile, d.transactions, TODAY)))
    const p = projectBalance(d, { asOf: TODAY, endDate: addDays(TODAY, 30), includeExpectedIncome: true })
    expect(f.forecast.endBalance).toBe(Math.round(p.endBalance))
    expect(f.forecast.shortfallDate).toBe(p.shortfallDate ?? null)
    expect(f.scenario).toBeNull()
  })

  it('describes a scenario only when something was changed', () => {
    const d = demo()
    const f = facts(d, { changes: scenario, focus: 'scenario' })
    expect(f.scenario).not.toBeNull()
    expect(f.scenario!.changes).toHaveLength(2)
    expect(f.scenario!.endBalanceChange).toBeGreaterThan(0)
    expect(f.scenario!.endBalance - f.forecast.endBalance).toBeCloseTo(f.scenario!.endBalanceChange, -1)
  })

  it('does not invent a goal', () => {
    expect(facts(demo()).goal).toBeNull()
    expect(facts(withGoal(demo())).goal?.verdictAdjusted).toBe('short')
  })

  it('computes the expected impact in the engine, not the model', () => {
    const lines = buildExpectedImpact(facts(demo(), { changes: scenario, focus: 'scenario' }))
    expect(lines.map((l) => l.label).join('|')).toMatch(/Adjusted scenario: balance/)
    expect(lines.length).toBeGreaterThanOrEqual(6)
  })
})

describe('verification of AI text', () => {
  const f = facts(demo())
  const ok: CoachResponse = {
    summary: `Your balance is ${'₦' + f.balance.toLocaleString('en-NG')} today.`,
    observations: [`${f.topCategories[0].category} was ${f.topCategories[0].sharePct}% of your spending.`],
    risks: [], recommendations: [], assumptions: [], next_steps: [], questions: [],
  }

  it('extracts amounts and percentages, including k/m suffixes', () => {
    expect(extractAmounts('Spend ₦8,500 or ₦12k or ₦1.5m')).toEqual([8500, 12000, 1_500_000])
    expect(extractPercents('about 48% and 7.5 %')).toEqual([48, 7.5])
    expect(allowedNumbers(f)).toContain(f.balance)
  })

  it('accepts text that quotes the supplied figures', () => {
    expect(verifyCoachResponse(ok, f).ok).toBe(true)
  })

  it('rejects an invented amount and an invented percentage', () => {
    const bad = { ...ok, summary: 'You could save ₦123,457 a month.' }
    expect(verifyCoachResponse(bad, f).problems[0]).toMatch(/does not match/)
    expect(verifyCoachResponse({ ...ok, risks: ['Cut food by 63%.'] }, { ...f, scenario: null }).ok).toBe(false)
  })

  it('rejects guarantees and loan/investment suggestions', () => {
    for (const t of ['This is guaranteed to work.', 'You will definitely reach it.', 'It is risk-free.', 'Consider a loan app.', 'Try investing in crypto.']) {
      expect(verifyCoachResponse({ ...ok, recommendations: [t] }, f).ok, t).toBe(false)
    }
    expect(verifyCoachResponse({ ...ok, recommendations: ['There is no guarantee this will work.'] }, f).ok).toBe(true)
  })
})

describe('built-in explainer', () => {
  const cases: [string, AppData, ScenarioChanges, CoachFocus][] = [
    ['demo overview', demo(), EMPTY_CHANGES, 'overview'],
    ['demo scenario', demo(), scenario, 'scenario'],
    ['demo goal short', withGoal(demo()), scenario, 'goal'],
    ['demo with essentials cut', demo(), { ...EMPTY_CHANGES, categoryCutPct: { 'Food and groceries': 30 } }, 'scenario'],
    ['blank profile', buildBlankData({ displayName: '', startingBalance: 5000, priorities: [] }), EMPTY_CHANGES, 'overview'],
  ]
  for (const [name, d, ch, focus] of cases) {
    it(`passes its own verification and fills every section: ${name}`, () => {
      const f = facts(d, { changes: ch, focus })
      const r = buildFallbackResponse(f)
      expect(r.summary.length).toBeGreaterThan(20)
      expect(r.recommendations.length).toBeGreaterThan(0)
      expect(r.assumptions.length).toBeGreaterThan(0)
      expect(verifyCoachResponse(r, f).problems).toEqual([])
    })
  }

  it('flags thin history and asks for clarification instead of guessing', () => {
    const f = facts(buildBlankData({ displayName: '', startingBalance: 5000, priorities: [] }))
    const r = buildFallbackResponse(f)
    expect(r.summary).toMatch(/not enough history/i)
    expect(r.questions.length).toBeGreaterThan(0)
  })

  it('does not mention a goal unless the user has one or chose that priority', () => {
    const r = buildFallbackResponse(facts(demo()))
    expect(JSON.stringify(r).toLowerCase()).not.toContain('goal')
  })

  it('warns when a scenario cuts essentials', () => {
    const f = facts(demo(), { changes: { ...EMPTY_CHANGES, categoryCutPct: { 'Food and groceries': 30 } }, focus: 'scenario' })
    expect(buildFallbackResponse(f).risks.join(' ')).toMatch(/essential/i)
  })

  it('adapts to priorities', () => {
    const d = demo()
    const understand = buildFallbackResponse(facts({ ...d, profile: { ...d.profile, priorities: ['understand'] } }))
    const runOut = buildFallbackResponse(facts({ ...d, profile: { ...d.profile, priorities: ['not-run-out'] } }))
    expect(understand.summary).toMatch(/Most of your recent spending/)
    expect(runOut.summary).toMatch(/left for flexible spending/)
  })
})

describe('askCoach', () => {
  const f: CoachFacts = facts(demo())
  const json = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
  const good: CoachResponse = {
    summary: `You have ₦${f.balance.toLocaleString('en-NG')} now.`,
    observations: ['Food is your biggest category.'], risks: [], recommendations: ['Keep recording transactions.'],
    assumptions: ['Spending continues at the recent pace.'], next_steps: ['Open Planning.'], questions: [],
  }

  it('uses the AI answer when it verifies, and keeps engine-calculated impact', async () => {
    const r = await askCoach(f, json(200, { model: 'claude-opus-5-5', response: good }))
    expect(r.source).toBe('ai')
    expect(r.model).toBe('claude-opus-5-5')
    expect(r.expectedImpact.length).toBeGreaterThan(0)
  })

  it('falls back with a reason when there is no API key', async () => {
    const r = await askCoach(f, json(503, { error: 'no_api_key' }))
    expect(r.source).toBe('built-in')
    expect(r.notice).toMatch(/no API key/i)
  })

  it('falls back on rate limits, server errors, network failure and timeouts', async () => {
    expect((await askCoach(f, json(429, { error: 'rate_limited' }))).notice).toMatch(/busy/i)
    expect((await askCoach(f, json(500, {}))).source).toBe('built-in')
    const down = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    expect((await askCoach(f, down)).notice).toMatch(/could not be reached/i)
    const slow = (async () => { throw new DOMException('t', 'TimeoutError') }) as unknown as typeof fetch
    expect((await askCoach(f, slow)).notice).toMatch(/too long/i)
  })

  it('rejects malformed or unverifiable AI answers and shows the built-in one instead', async () => {
    expect((await askCoach(f, json(200, { response: { summary: 'x' } }))).notice).toMatch(/expected format/i)
    const invented = { ...good, summary: 'You will have ₦987,654 by Friday.' }
    const r = await askCoach(f, json(200, { model: 'm', response: invented }))
    expect(r.source).toBe('built-in')
    expect(r.notice).toMatch(/could not verify/i)
    expect(JSON.stringify(r.response)).not.toContain('987,654')
  })

  it('never throws, whatever the server does', async () => {
    const garbage = (async () => new Response('<html>oops', { status: 200 })) as unknown as typeof fetch
    await expect(askCoach(f, garbage)).resolves.toMatchObject({ source: 'built-in' })
  })
})

describe('one-off expenses in the coach', () => {
  const marked = (): AppData => {
    const d = demo()
    return { ...d, transactions: [...d.transactions, { id: 'big', date: TODAY, description: 'Wedding aso ebi', amount: 15_000, type: 'expense', category: 'Shopping', categoryConfirmed: true, oneOff: true }] }
  }

  it('tells the coach what was left out of the pace, with the engine total', () => {
    const f = facts(marked())
    expect(f.oneOffsExcluded).toEqual({ count: 1, total: 15_000 })
    expect(facts(demo()).oneOffsExcluded).toEqual({ count: 0, total: 0 })
  })

  it('never sends the one-off description to the model', () => {
    expect(JSON.stringify(facts(marked()))).not.toContain('aso ebi')
  })

  it('built-in explainer states it as an assumption and still passes verification', () => {
    const f = facts(marked())
    const r = buildFallbackResponse(f)
    expect(r.assumptions.join(' ')).toContain('1 one-off expense (₦15,000) you marked is not assumed to repeat.')
    expect(verifyCoachResponse(r, f).problems).toEqual([])
  })
})

describe('questions to the coach', () => {
  const f = facts(demo())
  const captured = () => {
    const calls: { body: Record<string, unknown> }[] = []
    const impl = (async (_u: unknown, init: { body: string }) => {
      calls.push({ body: JSON.parse(init.body) })
      return new Response(JSON.stringify({ error: 'no_api_key' }), { status: 503 })
    }) as unknown as typeof fetch
    return { calls, impl }
  }
  const ok: CoachResponse = { summary: 'x', observations: [], risks: [], recommendations: [], assumptions: [], next_steps: [], questions: [] }

  it('sends a trimmed, capped question, and omits it when blank', async () => {
    const a = captured()
    await askCoach(f, a.impl, '  Why might I run short?  ')
    expect(a.calls[0].body.question).toBe('Why might I run short?')
    await askCoach(f, a.impl, '   ')
    expect('question' in a.calls[1].body).toBe(false)
    await askCoach(f, a.impl, 'x'.repeat(500))
    expect((a.calls[2].body.question as string).length).toBe(300)
  })

  it('lets the answer repeat a number the person typed, but not invent one', () => {
    const q = 'What if I save ₦7,531 a week?'
    const echoed = { ...ok, summary: 'Saving ₦7,531 a week would be a big change.' }
    expect(verifyCoachResponse(echoed, f, q).ok).toBe(true)
    expect(verifyCoachResponse(echoed, f).ok).toBe(false) // without the question that number is unexplained
    expect(verifyCoachResponse({ ...ok, summary: 'That would leave ₦8,642.' }, f, q).ok).toBe(false)
  })

  it('accepts a polite refusal that names loans or investments, but not a recommendation', () => {
    expect(verifyCoachResponse({ ...ok, summary: "I can't suggest loans or investments, but here is what your numbers show." }, f).ok).toBe(true)
    expect(verifyCoachResponse({ ...ok, summary: 'I would not recommend investing in crypto or taking a loan.' }, f).ok).toBe(true)
    expect(verifyCoachResponse({ ...ok, summary: 'You should consider investing in crypto.' }, f).ok).toBe(false)
    expect(verifyCoachResponse({ ...ok, summary: 'Try a loan app to cover the gap.' }, f).ok).toBe(false)
  })

  it('picks a focus from the question', () => {
    const o = { scenarioActive: false, hasGoal: false }
    expect(inferFocus('', o)).toBe('overview')
    expect(inferFocus('Where does my money go?', o)).toBe('overview')
    expect(inferFocus('Will I run short before the end of the month?', o)).toBe('forecast')
    expect(inferFocus('Am I on track for my goal?', o)).toBe('overview') // no goal exists
    expect(inferFocus('Am I on track for my goal?', { ...o, hasGoal: true })).toBe('goal')
    expect(inferFocus('anything', { ...o, scenarioActive: true })).toBe('scenario')
  })
})

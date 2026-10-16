import { describe, expect, it } from 'vitest'
import { buildDemoData } from './seed'
import { compareScenarios, projectBalance, recordedBalance, runRate, summarise } from './finance'
import { addDays } from './dates'

const TODAY = '2026-10-15'

describe('demo seed', () => {
  const d = buildDemoData(TODAY)

  it('is deterministic and ends on the intended balance', () => {
    expect(buildDemoData(TODAY)).toEqual(d)
    expect(recordedBalance(d.profile, d.transactions, TODAY)).toBeCloseTo(24_500)
  })

  it('has several months of history across the categories', () => {
    expect(d.transactions.length).toBeGreaterThan(150)
    const cats = new Set(d.transactions.map((t) => t.category))
    expect(cats.size).toBeGreaterThanOrEqual(9)
    expect(d.transactions.every((t) => t.date <= TODAY && t.amount > 0)).toBe(true)
  })

  it('has usable history, upcoming events and a sensible daily run-rate', () => {
    const rr = runRate(d.transactions, TODAY)
    expect(rr.sufficient).toBe(true)
    expect(rr.totalPerDay).toBeGreaterThan(1_200)
    expect(rr.totalPerDay).toBeLessThan(3_000)
    expect(d.profile.expectedIncome[0].date).toBe(addDays(TODAY, 4))
    expect(d.profile.startingBalance).toBeGreaterThan(-1_000_000)
  })

  it('tells a story on any day of the week: a shortfall within 30 days that a flexible-spend cut can fix', () => {
    for (let i = 0; i < 14; i++) {
      const today = addDays(TODAY, i)
      const data = buildDemoData(today)
      const o = { asOf: today, endDate: addDays(today, 30), includeExpectedIncome: true }
      const base = projectBalance(data, o)
      const ctx = JSON.stringify({ today, end: base.endBalance, low: base.lowestBalance })
      expect(base.shortfallDate, ctx).toBeDefined()
      const cmp = compareScenarios(data, o, {
        categoryCutPct: { 'Entertainment and leisure': 100, Shopping: 100 }, // flexible categories only
        plannedChanges: { 'pe-4': { removed: true } },
        extraSavingsPerWeek: 0,
      })
      expect(cmp.shortfallResolved, ctx).toBe(true)
    }
  })

  it('income summary over the last 28 days is non-trivial', () => {
    const s = summarise(d.transactions, addDays(TODAY, -27), TODAY)
    expect(s.expenses).toBeGreaterThan(30_000)
  })
})

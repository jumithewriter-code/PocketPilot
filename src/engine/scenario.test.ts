import { describe, expect, it } from 'vitest'
import { applyScenario, goalAlternatives, goalProgressSeries, isEmptyScenario } from './scenario'
import { goalFeasibility } from './finance'
import { DEFAULT_CLASSIFICATION, EMPTY_CHANGES, type AppData, type Transaction } from './types'

const ASOF = '2026-03-15'
let n = 0
const tx = (date: string, type: 'income' | 'expense', amount: number, category: Transaction['category']): Transaction => ({
  id: `t${++n}`,
  date,
  description: 'x',
  amount,
  type,
  category,
  categoryConfirmed: true,
})

// Balance 49,000 at ASOF; run-rate Food 200/day + Transport 200/day; planned 4,000 on 18 Mar; income 20,000 on 20 Mar.
const base = (over: Partial<AppData['budget']> = {}, income = [{ id: 'i1', label: 'A', date: '2026-03-20', amount: 20_000 }]): AppData => ({
  profile: {
    displayName: 't',
    currency: 'NGN',
    startingBalance: 10_000,
    expectedIncome: income,
    plannedExpenses: [{ id: 'p1', label: 'Fees', date: '2026-03-18', amount: 4_000, category: 'Education and school expenses' }],
    priorities: [],
    isDemo: false,
  },
  transactions: [
    tx('2026-03-01', 'income', 50_000, 'Income'),
    tx('2026-03-02', 'expense', 2_000, 'Food and groceries'),
    tx('2026-03-05', 'expense', 3_000, 'Transport'),
    tx('2026-03-10', 'expense', 5_000, 'Savings and transfers'),
    tx('2026-03-12', 'expense', 1_000, 'Food and groceries'),
  ],
  budget: { id: 'b', categoryLimits: {}, classification: { ...DEFAULT_CLASSIFICATION }, ...over },
})
const opts = { asOf: ASOF, includeExpectedIncome: true }
const goal = (target: number, date: string) => ({ id: 'g', description: 'G', targetAmount: target, savedAmount: 10_000, targetDate: date })

describe('applyScenario', () => {
  const changes = {
    categoryCutPct: { 'Food and groceries': 50 },
    plannedChanges: { p1: { amount: 1_000 } },
    extraSavingsPerWeek: 500,
  }

  it('applies only what the user accepts, leaving the rest of the plan untouched', () => {
    const d = base()
    const before = JSON.stringify(d)
    const none = applyScenario(d, changes, { categories: [], planned: [], savings: false }, ASOF)
    expect(none.budget.categoryLimits).toEqual({})
    expect(none.plannedExpenses[0].amount).toBe(4_000)
    expect(none.budget.plannedSavingsPerWeek).toBeUndefined()

    const all = applyScenario(d, changes, { categories: ['Food and groceries'], planned: ['p1'], savings: true }, ASOF)
    // Food pace 200/day x 30 = 6,000; 50% cut -> 3,000
    expect(all.budget.categoryLimits['Food and groceries']).toBe(3_000)
    expect(all.plannedExpenses[0].amount).toBe(1_000)
    expect(all.budget.plannedSavingsPerWeek).toBe(500)
    expect(JSON.stringify(d)).toBe(before) // inputs never mutated
  })

  it('removes and moves planned expenses when accepted', () => {
    const removed = applyScenario(base(), { ...EMPTY_CHANGES, plannedChanges: { p1: { removed: true } } }, { categories: [], planned: ['p1'], savings: false }, ASOF)
    expect(removed.plannedExpenses).toHaveLength(0)
    const moved = applyScenario(base(), { ...EMPTY_CHANGES, plannedChanges: { p1: { date: '2026-04-01' } } }, { categories: [], planned: ['p1'], savings: false }, ASOF)
    expect(moved.plannedExpenses[0].date).toBe('2026-04-01')
  })

  it('detects an empty scenario', () => {
    expect(isEmptyScenario(EMPTY_CHANGES)).toBe(true)
    expect(isEmptyScenario({ ...EMPTY_CHANGES, categoryCutPct: { Shopping: 0 } })).toBe(true)
    expect(isEmptyScenario({ ...EMPTY_CHANGES, extraSavingsPerWeek: 1 })).toBe(false)
  })
})

describe('goal progress and alternatives', () => {
  it('progress series ends at the feasibility projection: 10,000 + 13,200 = 23,200', () => {
    const d = base()
    const g = goal(30_000, '2026-03-22')
    const series = goalProgressSeries(d, g, opts)
    expect(series).toHaveLength(8)
    expect(series[0].progress).toBe(10_000)
    expect(series[7].progress).toBeCloseTo(goalFeasibility(d, g, opts).projectedSavings)
    expect(series[7].progress).toBeCloseTo(23_200)
  })

  it('gap 1,000 with food flexible (1,400 over 7 days) -> 71.4% flexible cut, reachable target 23,200', () => {
    const d = base({ classification: { ...DEFAULT_CLASSIFICATION, 'Food and groceries': 'flexible' } })
    const alt = goalAlternatives(d, goal(24_200, '2026-03-22'), opts)
    expect(alt.flexibleCutPctNeeded).toBeCloseTo((1_000 / 1_400) * 100)
    expect(alt.reachableTarget).toBeCloseTo(23_200)
    expect(alt.extraPerWeekNeeded).toBeCloseTo(1_000) // 7 days = 1 week
    expect(alt.laterDate).toBeNull() // waiting only drains the balance
  })

  it('cannot close a gap with flexible cuts when essentials make up the spend', () => {
    expect(goalAlternatives(base(), goal(30_000, '2026-03-22'), opts).flexibleCutPctNeeded).toBeNull()
  })

  it('finds a later date when more income is on the way: 30,000 on 30 Mar', () => {
    const d = base({}, [{ id: 'i2', label: 'Later', date: '2026-03-30', amount: 30_000 }])
    const g = goal(30_000, '2026-03-25')
    expect(goalFeasibility(d, g, opts).status).toBe('short')
    // 30 Mar: 49,000 - 15x400 - 4,000 + 30,000 = 69,000 -> surplus 20,000 -> 30,000 (>= target); 29 Mar: no income yet
    expect(goalAlternatives(d, g, opts).laterDate).toBe('2026-03-30')
  })
})

import { describe, expect, it } from 'vitest'
import {
  budgetStatus,
  categoryTotals,
  compareScenarios,
  filterTransactions,
  goalFeasibility,
  incomePattern,
  likelyOneOff,
  projectBalance,
  recordedBalance,
  runRate,
  spendingRoom,
  summarise,
  upcomingEvents,
} from './finance'
import {
  DEFAULT_CLASSIFICATION,
  type AppData,
  type Budget,
  type FinancialProfile,
  type Transaction,
} from './types'

// All hand-computed. Worked examples are in the comments.
const ASOF = '2026-03-15'

let n = 0
const tx = (
  date: string,
  type: 'income' | 'expense',
  amount: number,
  category: Transaction['category'],
  description = 'test',
): Transaction => ({ id: `t${++n}`, date, description, amount, type, category, categoryConfirmed: true })

const profile = (over: Partial<FinancialProfile> = {}): FinancialProfile => ({
  displayName: 'Test',
  currency: 'NGN',
  startingBalance: 10_000,
  expectedIncome: [{ id: 'i1', label: 'Allowance', date: '2026-03-20', amount: 20_000 }],
  plannedExpenses: [{ id: 'p1', label: 'Fees', date: '2026-03-18', amount: 4_000, category: 'Education and school expenses' }],
  priorities: [],
  isDemo: false,
  ...over,
})

const budget = (over: Partial<Budget> = {}): Budget => ({
  id: 'b',
  categoryLimits: {},
  classification: { ...DEFAULT_CLASSIFICATION },
  ...over,
})

const txs = (): Transaction[] => [
  tx('2026-03-01', 'income', 50_000, 'Income', 'Allowance'),
  tx('2026-03-02', 'expense', 2_000, 'Food and groceries'),
  tx('2026-03-05', 'expense', 3_000, 'Transport'),
  tx('2026-03-10', 'expense', 5_000, 'Savings and transfers'),
  tx('2026-03-12', 'expense', 1_000, 'Food and groceries'),
  tx('2026-03-20', 'expense', 9_999, 'Food and groceries'), // future-dated: ignored as of 15 Mar
]

const data = (over: Partial<AppData> = {}): AppData => ({
  profile: profile(),
  transactions: txs(),
  budget: budget(),
  ...over,
})

describe('balances and summaries', () => {
  it('reconciles the recorded balance: 10,000 + 50,000 − 2,000 − 3,000 − 5,000 − 1,000 = 49,000', () => {
    expect(recordedBalance(profile(), txs(), ASOF)).toBe(49_000)
  })

  it('income raises and expenses lower the balance', () => {
    const base = recordedBalance(profile(), txs(), ASOF)
    expect(recordedBalance(profile(), [...txs(), tx('2026-03-14', 'income', 700, 'Income')], ASOF)).toBe(base + 700)
    expect(recordedBalance(profile(), [...txs(), tx('2026-03-14', 'expense', 700, 'Other')], ASOF)).toBe(base - 700)
  })

  it('treats own-account transfers as outflow but not as consumption', () => {
    const s = summarise(txs(), '2026-03-01', ASOF)
    expect(s.income).toBe(50_000)
    expect(s.expenses).toBe(6_000) // 2,000 + 3,000 + 1,000, transfer excluded
    expect(s.transfers).toBe(5_000)
    expect(s.netCashFlow).toBe(39_000)
    expect(s.savingsRate).toBeCloseTo(0.88, 10) // (50,000 − 6,000) / 50,000
  })

  it('has no savings rate when no income was received', () => {
    expect(summarise(txs(), '2026-03-02', ASOF).savingsRate).toBeNull()
  })

  it('category totals match the underlying transactions', () => {
    const totals = categoryTotals(txs(), '2026-03-01', ASOF)
    expect(totals.map((t) => [t.category, t.total])).toEqual([
      ['Food and groceries', 3_000],
      ['Transport', 3_000],
    ])
    expect(totals[0].share).toBeCloseTo(0.5)
    expect(totals.some((t) => t.category === 'Savings and transfers')).toBe(false)
  })

  it('filters by period, category and search text', () => {
    expect(filterTransactions(txs(), { from: '2026-03-05', to: '2026-03-12' })).toHaveLength(3)
    expect(filterTransactions(txs(), { category: 'Transport' })).toHaveLength(1)
    expect(filterTransactions(txs(), { search: 'ALLOW' })).toHaveLength(1)
  })
})

describe('budget', () => {
  it('flags near, over and ok states', () => {
    const b = budget({
      overallLimit: 10_000,
      categoryLimits: { 'Food and groceries': 3_500, Transport: 2_000, Shopping: 1_000 },
    })
    const s = budgetStatus(txs(), b, ASOF)
    const line = (c: string) => s.lines.find((l) => l.category === c)!
    expect(line('Food and groceries').state).toBe('near') // 3,000 / 3,500 = 0.857
    expect(line('Transport').state).toBe('over') // 3,000 / 2,000
    expect(line('Shopping').state).toBe('ok') // 0 / 1,000
    expect(line('Other').state).toBe('unbudgeted')
    expect(s.spentTotal).toBe(6_000) // the future-dated 9,999 row is not spent yet
    expect(s.overallState).toBe('ok') // 6,000 / 10,000
  })
})

describe('upcoming events and run-rate', () => {
  it('lists future events in date order within the horizon', () => {
    const u = upcomingEvents(profile(), ASOF, 10)
    expect(u.map((i) => [i.date, i.kind])).toEqual([
      ['2026-03-18', 'expense'],
      ['2026-03-20', 'income'],
    ])
    expect(upcomingEvents(profile(), ASOF, 4)).toHaveLength(1)
  })

  it('averages spend over the days of available history: (2,000+1,000)/15 and 3,000/15', () => {
    const rr = runRate(txs(), ASOF)
    expect(rr.basisDays).toBe(15)
    expect(rr.perDay['Food and groceries']).toBeCloseTo(200)
    expect(rr.perDay.Transport).toBeCloseTo(200)
    expect(rr.totalPerDay).toBeCloseTo(400)
    expect(rr.sufficient).toBe(true)
  })

  it('reports insufficient history', () => {
    const rr = runRate([tx('2026-03-14', 'expense', 500, 'Food and groceries')], ASOF)
    expect(rr.basisDays).toBe(2)
    expect(rr.sufficient).toBe(false)
  })
})

describe('projection', () => {
  const opts = { asOf: ASOF, endDate: '2026-03-22', includeExpectedIncome: true }

  it('end = 49,000 − 7×400 − 4,000 + 20,000 = 62,200 with expected income', () => {
    const p = projectBalance(data(), opts)
    expect(p.startBalance).toBe(49_000)
    expect(p.endBalance).toBeCloseTo(62_200)
    expect(p.points).toHaveLength(8)
    expect(p.totalExpectedIncome).toBe(20_000)
  })

  it('excludes expected income when asked: 42,200', () => {
    const p = projectBalance(data(), { ...opts, includeExpectedIncome: false })
    expect(p.endBalance).toBeCloseTo(42_200)
    expect(p.totalExpectedIncome).toBe(0)
  })

  it('does not count expected income dated on or before asOf', () => {
    const d = data({ profile: profile({ expectedIncome: [{ id: 'x', label: 'old', date: ASOF, amount: 99_000 }] }) })
    expect(projectBalance(d, opts).totalExpectedIncome).toBe(0)
  })

  it('applies category cuts: food 50% → daily 300 → 62,900', () => {
    const p = projectBalance(data(), { ...opts, changes: { categoryCutPct: { 'Food and groceries': 50 }, plannedChanges: {}, extraSavingsPerWeek: 0 } })
    expect(p.endBalance).toBeCloseTo(62_900)
    expect(p.essentialCuts).toEqual(['Food and groceries'])
  })

  it('applies planned-expense edits and weekly savings, and never mutates inputs', () => {
    const d = data()
    const before = JSON.stringify(d)
    const removed = projectBalance(d, { ...opts, changes: { categoryCutPct: {}, plannedChanges: { p1: { removed: true } }, extraSavingsPerWeek: 0 } })
    expect(removed.endBalance).toBeCloseTo(66_200) // +4,000
    const moved = projectBalance(d, { ...opts, changes: { categoryCutPct: {}, plannedChanges: { p1: { date: '2026-03-30' } }, extraSavingsPerWeek: 0 } })
    expect(moved.endBalance).toBeCloseTo(66_200) // outside the window
    const saving = projectBalance(d, { ...opts, changes: { categoryCutPct: {}, plannedChanges: {}, extraSavingsPerWeek: 1_000 } })
    expect(saving.endBalance).toBeCloseTo(61_200) // one weekly transfer within 7 days
    expect(saving.totalExtraSavings).toBe(1_000)
    expect(JSON.stringify(d)).toBe(before)
  })

  it('detects a shortfall: 5,000 balance, 1,000/day → negative on day 6', () => {
    const d = data({
      profile: profile({ startingBalance: 20_000, expectedIncome: [], plannedExpenses: [] }),
      transactions: [tx('2026-03-01', 'expense', 15_000, 'Food and groceries')],
    })
    const o = { asOf: ASOF, endDate: '2026-03-22', includeExpectedIncome: true }
    const p = projectBalance(d, o)
    expect(p.shortfallDate).toBe('2026-03-21')
    expect(p.lowestBalance).toBeCloseTo(-2_000)
    const cmp = compareScenarios(d, o, { categoryCutPct: { 'Food and groceries': 50 }, plannedChanges: {}, extraSavingsPerWeek: 0 })
    expect(cmp.adjusted.endBalance).toBeCloseTo(1_500) // 5,000 − 7×500
    expect(cmp.shortfallResolved).toBe(true)
    expect(cmp.endBalanceDelta).toBeCloseTo(3_500)
  })
})

describe('goal feasibility', () => {
  const goal = { id: 'g', description: 'Laptop', targetAmount: 30_000, savedAmount: 10_000, targetDate: '2026-03-22' }
  const base = { asOf: ASOF, includeExpectedIncome: true }

  it('computes remaining, required per week and a short gap', () => {
    const g = goalFeasibility(data(), goal, base)
    expect(g.remaining).toBe(20_000)
    expect(g.daysLeft).toBe(7)
    expect(g.requiredPerWeek).toBeCloseTo(20_000)
    // end 62,200 − start 49,000 = 13,200 surplus → 10,000 + 13,200 = 23,200
    expect(g.projectedSavings).toBeCloseTo(23_200)
    expect(g.gap).toBeCloseTo(6_800)
    expect(g.status).toBe('short')
  })

  it('without expected income the surplus is zero (wallet shrinks)', () => {
    const g = goalFeasibility(data(), goal, { ...base, includeExpectedIncome: false })
    expect(g.uncommittedSurplus).toBe(0)
    expect(g.projectedSavings).toBe(10_000)
  })

  it('is on track only when savings reach the target and the wallet stays positive', () => {
    expect(goalFeasibility(data(), { ...goal, targetAmount: 20_000 }, base).status).toBe('on-track')
  })

  it('weekly contributions move money into the goal without inventing savings', () => {
    const g = goalFeasibility(data(), goal, {
      ...base,
      changes: { categoryCutPct: {}, plannedChanges: {}, extraSavingsPerWeek: 1_000 },
    })
    expect(g.contributions).toBe(1_000)
    expect(g.projectedSavings).toBeCloseTo(23_200)
  })

  it('reports achieved and past-due goals', () => {
    expect(goalFeasibility(data(), { ...goal, savedAmount: 30_000 }, base).status).toBe('achieved')
    expect(goalFeasibility(data(), { ...goal, targetDate: '2026-03-10' }, base).status).toBe('past-due')
  })
})

describe('spending room', () => {
  const END = '2026-03-22'

  it('puts obligations and essentials ahead of flexible spending: 49,000 + 20,000 − 4,000 − 7×400 = 62,200', () => {
    const r = spendingRoom(data(), ASOF, END, true)
    expect(r.days).toBe(7)
    expect(r.essentialSpend).toBeCloseTo(2_800)
    expect(r.room).toBeCloseTo(62_200)
    expect(r.flexibleSpendAtCurrentPace).toBeCloseTo(0)
  })

  it('excludes expected income when asked: 42,200', () => {
    expect(spendingRoom(data(), ASOF, END, false).room).toBeCloseTo(42_200)
  })

  it('counts only essential categories as committed: food flexible → 63,600', () => {
    const b = budget({ classification: { ...DEFAULT_CLASSIFICATION, 'Food and groceries': 'flexible' } })
    const r = spendingRoom(data({ budget: b }), ASOF, END, true)
    expect(r.essentialSpend).toBeCloseTo(1_400)
    expect(r.room).toBeCloseTo(63_600)
    expect(r.flexibleSpendAtCurrentPace).toBeCloseTo(1_400)
  })

  it('planned weekly savings reduce both the room and the projection by the same amount', () => {
    const d = data({ budget: budget({ plannedSavingsPerWeek: 1_000 }) })
    expect(spendingRoom(d, ASOF, END, true).room).toBeCloseTo(61_200)
    expect(projectBalance(d, { asOf: ASOF, endDate: END, includeExpectedIncome: true }).endBalance).toBeCloseTo(61_200)
  })
})

describe('income pattern', () => {
  const inc = (d: string) => tx(d, 'income', 1_000, 'Income')
  it('classifies none, single, regular and irregular income', () => {
    expect(incomePattern([], ASOF).kind).toBe('none')
    expect(incomePattern([inc('2026-03-01')], ASOF).kind).toBe('single')
    const regular = incomePattern([inc('2026-01-01'), inc('2026-01-29'), inc('2026-02-26')], ASOF)
    expect(regular.kind).toBe('regular')
    expect(regular.averageGapDays).toBe(28)
    expect(incomePattern([inc('2026-03-01'), inc('2026-03-04'), inc('2026-03-30')], '2026-04-01').kind).toBe('irregular')
  })
})

describe('one-off expenses', () => {
  const END = '2026-03-22'
  const withBig = (oneOff?: boolean) =>
    data({ transactions: [...txs(), { ...tx('2026-03-12', 'expense', 6_000, 'Shopping'), oneOff }] })

  it('still reduces the recorded balance: 49,000 − 6,000 = 43,000', () => {
    expect(recordedBalance(profile(), withBig(true).transactions, ASOF)).toBe(43_000)
    expect(recordedBalance(profile(), withBig(false).transactions, ASOF)).toBe(43_000)
  })

  it('is left out of the daily pace when marked: 400/day stays 400, and it is reported', () => {
    const rr = runRate(withBig(true).transactions, ASOF)
    expect(rr.totalPerDay).toBeCloseTo(400)
    expect(rr.perDay.Shopping).toBeUndefined()
    expect(rr.oneOffs).toEqual({ count: 1, total: 6_000 })
  })

  it('is spread over the window when not marked: 400 + 6,000/15 = 800/day', () => {
    const rr = runRate(withBig(false).transactions, ASOF)
    expect(rr.totalPerDay).toBeCloseTo(800)
    expect(rr.oneOffs.count).toBe(0)
  })

  it('changes the forecast accordingly: 56,200 marked vs 53,400 not marked', () => {
    const o = { asOf: ASOF, endDate: END, includeExpectedIncome: true }
    // marked: 43,000 − 7×400 − 4,000 + 20,000
    expect(projectBalance(withBig(true), o).endBalance).toBeCloseTo(56_200)
    // unmarked: 43,000 − 7×800 − 4,000 + 20,000
    expect(projectBalance(withBig(false), o).endBalance).toBeCloseTo(53_400)
  })

  it('says in the assumptions what was left out', () => {
    const a = projectBalance(withBig(true), { asOf: ASOF, endDate: END, includeExpectedIncome: true }).assumptions.join(' ')
    expect(a).toContain('1 one-off expense (₦6,000) you marked is not assumed to repeat.')
    expect(projectBalance(withBig(false), { asOf: ASOF, endDate: END, includeExpectedIncome: true }).assumptions.join(' ')).not.toMatch(/one-off/)
  })

  it('ignores one-offs outside the pace window and never touches income', () => {
    const old = data({ transactions: [...txs(), { ...tx('2026-01-01', 'expense', 9_000, 'Shopping'), oneOff: true }] })
    expect(runRate(old.transactions, ASOF).oneOffs.count).toBe(0)
  })
})

describe('likelyOneOff hint', () => {
  const food = (d: string, amount: number) => tx(d, 'expense', amount, 'Food and groceries')
  const hist = ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07', '2026-03-09'].map((d) => food(d, 1_000))
  const cand = (amount: number) => ({ date: '2026-03-12', amount, category: 'Food and groceries' })

  it('flags an amount at least 3x the usual (median 1,000): 3,000 yes, 2,999 no', () => {
    expect(likelyOneOff(hist, cand(3_000))).toBe(true)
    expect(likelyOneOff(hist, cand(2_999))).toBe(false)
  })

  it('needs enough history to know what is usual: 4 items is not enough', () => {
    expect(likelyOneOff(hist.slice(0, 4), cand(50_000))).toBe(false)
  })

  it('compares within the same category only, and ignores marked one-offs in the history', () => {
    expect(likelyOneOff(hist, { ...cand(5_000), category: 'Shopping' })).toBe(false)
    const polluted = [...hist.slice(0, 4), { ...food('2026-03-09', 1_000), oneOff: true }]
    expect(likelyOneOff(polluted, cand(5_000))).toBe(false) // only 4 usable items remain
  })

  it('never uses transfers or income as the usual amount', () => {
    const transfers = ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07', '2026-03-09'].map((d) => tx(d, 'expense', 500, 'Savings and transfers'))
    expect(likelyOneOff(transfers, { date: '2026-03-12', amount: 9_000, category: 'Savings and transfers' })).toBe(false)
  })
})

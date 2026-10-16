/**
 * PocketPilot financial engine.
 *
 * Pure, deterministic functions. This module is the single source of truth for
 * every number shown in the app or sent to the AI coach. It has no UI imports.
 *
 * Cash-flow equation used by projections:
 *   balance(t) = recordedBalance(asOf)
 *              + Σ expected income dated in (asOf, t]        (only if enabled)
 *              − Σ planned expenses dated in (asOf, t]
 *              − Σ run-rate spending per day for each day in (asOf, t]
 *              − Σ weekly savings transfers made by t (planned + scenario)
 */
import { addDays, diffDays, inRange, monthRange } from './dates'
import { formatNaira } from './format'
import {
  CATEGORIES,
  TRANSFER_CATEGORY,
  type AppData,
  type Budget,
  type Category,
  type FinancialProfile,
  type Goal,
  type ISODate,
  type ScenarioChanges,
  type Transaction,
} from './types'

export const EPS = 0.005

const isTransfer = (t: Transaction) => t.type === 'expense' && t.category === TRANSFER_CATEGORY
const isConsumption = (t: Transaction) => t.type === 'expense' && t.category !== TRANSFER_CATEGORY

// ---------------------------------------------------------------- balances

/** Recorded balance on `asOf`: starting balance + income − all outflows dated ≤ asOf. */
export function recordedBalance(profile: FinancialProfile, txs: Transaction[], asOf: ISODate): number {
  let b = profile.startingBalance
  for (const t of txs) {
    if (t.date > asOf) continue
    b += t.type === 'income' ? t.amount : -t.amount
  }
  return b
}

export interface PeriodSummary {
  from: ISODate
  to: ISODate
  income: number
  /** Consumption expenses (excludes own-account transfers). */
  expenses: number
  /** Money moved to savings / own accounts. */
  transfers: number
  /** income − expenses − transfers: the change in the wallet over the period. */
  netCashFlow: number
  /** (income − expenses) / income, or null when no income was received. */
  savingsRate: number | null
  count: number
}

export function summarise(txs: Transaction[], from: ISODate, to: ISODate): PeriodSummary {
  let income = 0
  let expenses = 0
  let transfers = 0
  let count = 0
  for (const t of txs) {
    if (!inRange(t.date, from, to)) continue
    count++
    if (t.type === 'income') income += t.amount
    else if (isTransfer(t)) transfers += t.amount
    else expenses += t.amount
  }
  return {
    from,
    to,
    income,
    expenses,
    transfers,
    netCashFlow: income - expenses - transfers,
    savingsRate: income > EPS ? (income - expenses) / income : null,
    count,
  }
}

export interface CategoryTotal {
  category: Category
  total: number
  count: number
  /** Share of consumption expenses in the period, 0-1. */
  share: number
}

/** Consumption spending by category (transfers excluded), largest first. */
export function categoryTotals(txs: Transaction[], from: ISODate, to: ISODate): CategoryTotal[] {
  const totals = new Map<Category, { total: number; count: number }>()
  let all = 0
  for (const t of txs) {
    if (!inRange(t.date, from, to) || !isConsumption(t)) continue
    const c = t.category as Category
    const cur = totals.get(c) ?? { total: 0, count: 0 }
    cur.total += t.amount
    cur.count++
    totals.set(c, cur)
    all += t.amount
  }
  return CATEGORIES.filter((c) => totals.has(c))
    .map((category) => {
      const v = totals.get(category)!
      return { category, total: v.total, count: v.count, share: all > 0 ? v.total / all : 0 }
    })
    .sort((a, b) => b.total - a.total)
}

export interface TxFilter {
  from?: ISODate
  to?: ISODate
  category?: Category | 'Income'
  type?: 'income' | 'expense'
  search?: string
}

export function filterTransactions(txs: Transaction[], f: TxFilter): Transaction[] {
  const q = f.search?.trim().toLowerCase()
  return txs
    .filter((t) => (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to))
    .filter((t) => !f.category || t.category === f.category)
    .filter((t) => !f.type || t.type === f.type)
    .filter((t) => !q || t.description.toLowerCase().includes(q))
    .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)))
}

// ------------------------------------------------------------------ budget

export type BudgetState = 'ok' | 'near' | 'over' | 'unbudgeted'

export interface BudgetLine {
  category: Category
  spent: number
  limit?: number
  /** spent / limit, or null when there is no limit. */
  utilisation: number | null
  state: BudgetState
  classification: 'essential' | 'flexible'
}

export interface BudgetStatus {
  from: ISODate
  to: ISODate
  spentTotal: number
  overallLimit?: number
  overallUtilisation: number | null
  overallState: BudgetState
  lines: BudgetLine[]
  /** Sum of category limits, for comparing against the overall limit. */
  categoryLimitSum: number
}

export const NEAR_THRESHOLD = 0.8

function stateFor(spent: number, limit?: number): BudgetState {
  if (limit === undefined || limit <= 0) return 'unbudgeted'
  const u = spent / limit
  if (u > 1 + 1e-9) return 'over'
  if (u >= NEAR_THRESHOLD) return 'near'
  return 'ok'
}

/** Budget vs actual for the calendar month containing `asOf`. */
export function budgetStatus(txs: Transaction[], budget: Budget, asOf: ISODate): BudgetStatus {
  const { from, to } = monthRange(asOf)
  // Only money already spent counts; future-dated rows are not "spent" yet.
  const totals = categoryTotals(txs, from, asOf < to ? asOf : to)
  const spentBy = new Map(totals.map((t) => [t.category, t.total]))
  const lines: BudgetLine[] = CATEGORIES.filter((c) => c !== TRANSFER_CATEGORY).map((category) => {
    const spent = spentBy.get(category) ?? 0
    const limit = budget.categoryLimits[category]
    return {
      category,
      spent,
      limit,
      utilisation: limit && limit > 0 ? spent / limit : null,
      state: stateFor(spent, limit),
      classification: budget.classification[category],
    }
  })
  const spentTotal = totals.reduce((s, t) => s + t.total, 0)
  return {
    from,
    to,
    spentTotal,
    overallLimit: budget.overallLimit,
    overallUtilisation: budget.overallLimit ? spentTotal / budget.overallLimit : null,
    overallState: stateFor(spentTotal, budget.overallLimit),
    lines,
    categoryLimitSum: Object.values(budget.categoryLimits).reduce((s, v) => s + (v ?? 0), 0),
  }
}

// ----------------------------------------------------------------- upcoming

export interface UpcomingItem {
  id: string
  label: string
  date: ISODate
  amount: number
  kind: 'income' | 'expense'
  category?: Category
}

/** Known future events in (asOf, asOf + horizonDays]. Expected income is flagged as such. */
export function upcomingEvents(profile: FinancialProfile, asOf: ISODate, horizonDays: number): UpcomingItem[] {
  const to = addDays(asOf, horizonDays)
  const items: UpcomingItem[] = [
    ...profile.expectedIncome.map((e) => ({ ...e, kind: 'income' as const })),
    ...profile.plannedExpenses.map((e) => ({ ...e, kind: 'expense' as const })),
  ]
  return items
    .filter((i) => i.date > asOf && i.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ----------------------------------------------------------------- run-rate

export interface RunRate {
  /** Mean consumption spend per day, by category. */
  perDay: Partial<Record<Category, number>>
  totalPerDay: number
  /** Days of history the average is based on. */
  basisDays: number
  /** False when too little history exists for a reliable pattern. */
  sufficient: boolean
  /** Expenses in the window that the user marked as one-offs and so are left out of the pace. */
  oneOffs: { count: number; total: number }
}

export const MIN_HISTORY_DAYS = 14

/**
 * Average daily spend per category over the last `lookbackDays` days that have
 * history, leaving out expenses the user marked as one-offs. Known upcoming
 * expenses are NOT part of this; they are added separately in projections.
 */
export function runRate(txs: Transaction[], asOf: ISODate, lookbackDays = 28): RunRate {
  const past = txs.filter((t) => t.date <= asOf)
  if (past.length === 0) return { perDay: {}, totalPerDay: 0, basisDays: 0, sufficient: false, oneOffs: { count: 0, total: 0 } }
  const first = past.reduce((m, t) => (t.date < m ? t.date : m), past[0].date)
  const basisDays = Math.max(1, Math.min(lookbackDays, diffDays(first, asOf) + 1))
  const from = addDays(asOf, -basisDays + 1)
  const perDay: Partial<Record<Category, number>> = {}
  let total = 0
  const oneOffs = { count: 0, total: 0 }
  for (const t of past) {
    if (!isConsumption(t) || t.date < from) continue
    if (t.oneOff) {
      oneOffs.count++
      oneOffs.total += t.amount
      continue
    }
    const c = t.category as Category
    perDay[c] = (perDay[c] ?? 0) + t.amount / basisDays
    total += t.amount / basisDays
  }
  return { perDay, totalPerDay: total, basisDays, sufficient: basisDays >= MIN_HISTORY_DAYS, oneOffs }
}

/** How much larger than a category's usual amount counts as "much larger". */
export const ONE_OFF_FACTOR = 3
/** Items of history needed in a category before "usual" means anything. */
export const ONE_OFF_MIN_HISTORY = 5

/**
 * Conservative hint that a new expense may be a one-off: it is at least
 * ONE_OFF_FACTOR times the median amount the user has spent in the same
 * category over the previous 84 days, and there are at least
 * ONE_OFF_MIN_HISTORY such past items. It only ever prompts the user.
 */
export function likelyOneOff(history: Transaction[], tx: { date: ISODate; amount: number; category: string; id?: string }): boolean {
  const from = addDays(tx.date, -84)
  const amounts = history
    .filter((t) => isConsumption(t) && t.category === tx.category && t.id !== tx.id && !t.oneOff && t.date >= from && t.date <= tx.date)
    .map((t) => t.amount)
    .sort((a, b) => a - b)
  if (amounts.length < ONE_OFF_MIN_HISTORY) return false
  const mid = Math.floor(amounts.length / 2)
  const median = amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2
  return median > 0 && tx.amount >= ONE_OFF_FACTOR * median
}

// -------------------------------------------------------------- projection

export interface ProjectionOptions {
  asOf: ISODate
  /** Last day of the projection (inclusive). */
  endDate: ISODate
  includeExpectedIncome: boolean
  changes?: ScenarioChanges
  lookbackDays?: number
}

export interface ProjectionPoint {
  date: ISODate
  balance: number
}

export interface Projection {
  points: ProjectionPoint[]
  startBalance: number
  endBalance: number
  lowestBalance: number
  lowestDate: ISODate
  /** First day the balance falls below zero, if any. */
  shortfallDate?: ISODate
  totalExpectedIncome: number
  totalPlannedExpenses: number
  totalRunRateSpend: number
  totalExtraSavings: number
  runRate: RunRate
  assumptions: string[]
  /** Essential categories the scenario cuts; surfaced so the UI can warn. */
  essentialCuts: Category[]
}

export function projectBalance(data: AppData, opts: ProjectionOptions): Projection {
  const { profile, transactions, budget } = data
  const { asOf, endDate } = opts
  const changes = opts.changes
  const rr = runRate(transactions, asOf, opts.lookbackDays)
  const startBalance = recordedBalance(profile, transactions, asOf)

  const cutPct = changes?.categoryCutPct ?? {}
  let dailyRunRate = 0
  for (const c of CATEGORIES) {
    const base = rr.perDay[c] ?? 0
    const cut = Math.min(100, Math.max(0, cutPct[c] ?? 0))
    dailyRunRate += base * (1 - cut / 100)
  }
  const essentialCuts = CATEGORIES.filter(
    (c) => (cutPct[c] ?? 0) > 0 && budget.classification[c] === 'essential' && (rr.perDay[c] ?? 0) > 0,
  )

  const incomeByDate = new Map<ISODate, number>()
  if (opts.includeExpectedIncome) {
    for (const e of profile.expectedIncome) {
      if (e.date > asOf && e.date <= endDate) incomeByDate.set(e.date, (incomeByDate.get(e.date) ?? 0) + e.amount)
    }
  }
  const plannedByDate = new Map<ISODate, number>()
  for (const p of profile.plannedExpenses) {
    const edit = changes?.plannedChanges[p.id]
    if (edit?.removed) continue
    const date = edit?.date ?? p.date
    const amount = edit?.amount ?? p.amount
    if (date > asOf && date <= endDate) plannedByDate.set(date, (plannedByDate.get(date) ?? 0) + amount)
  }
  // Planned weekly savings from the budget, plus any extra from a what-if scenario.
  const weeklySave = Math.max(0, budget.plannedSavingsPerWeek ?? 0) + Math.max(0, changes?.extraSavingsPerWeek ?? 0)

  const points: ProjectionPoint[] = [{ date: asOf, balance: startBalance }]
  let balance = startBalance
  let lowest = startBalance
  let lowestDate = asOf
  let shortfallDate: ISODate | undefined = startBalance < -EPS ? asOf : undefined
  let income = 0
  let planned = 0
  let spend = 0
  let saved = 0
  const days = Math.max(0, diffDays(asOf, endDate))
  for (let i = 1; i <= days; i++) {
    const date = addDays(asOf, i)
    const inc = incomeByDate.get(date) ?? 0
    const pl = plannedByDate.get(date) ?? 0
    const sv = weeklySave > 0 && i % 7 === 0 ? weeklySave : 0
    balance += inc - pl - dailyRunRate - sv
    income += inc
    planned += pl
    spend += dailyRunRate
    saved += sv
    points.push({ date, balance })
    if (balance < lowest) {
      lowest = balance
      lowestDate = date
    }
    if (shortfallDate === undefined && balance < -EPS) shortfallDate = date
  }

  const assumptions = [
    `Everyday spending continues at your average of the last ${rr.basisDays} day${rr.basisDays === 1 ? '' : 's'} of recorded history.`,
    'Planned expenses are extra to that everyday spending (assumed not already included in it).',
    ...(rr.oneOffs.count > 0
      ? [`${rr.oneOffs.count} one-off expense${rr.oneOffs.count === 1 ? '' : 's'} (${formatNaira(rr.oneOffs.total)}) you marked is not assumed to repeat.`]
      : []),
    opts.includeExpectedIncome
      ? 'Expected income arrives on the dates you entered. If it is late or smaller, the projection will be too optimistic.'
      : 'Expected income is excluded: only money you already have is counted.',
  ]
  if (!rr.sufficient) {
    assumptions.push(
      `Only ${rr.basisDays} day(s) of history are recorded, which is not enough for a reliable spending pattern.`,
    )
  }
  if (profile.expectedIncome.length === 0) {
    assumptions.push('No expected income has been entered, so none is assumed.')
  }

  return {
    points,
    startBalance,
    endBalance: balance,
    lowestBalance: lowest,
    lowestDate,
    shortfallDate,
    totalExpectedIncome: income,
    totalPlannedExpenses: planned,
    totalRunRateSpend: spend,
    totalExtraSavings: saved,
    runRate: rr,
    assumptions,
    essentialCuts,
  }
}

// ------------------------------------------------------- room to spend

export interface SpendingRoom {
  endDate: ISODate
  days: number
  balance: number
  expectedIncome: number
  plannedExpenses: number
  /** Everyday essential spending expected over the period, at the recent pace. */
  essentialSpend: number
  plannedSavings: number
  /** What is left for flexible spending after obligations. Negative = already over-committed. */
  room: number
  /** Flexible spending expected at the recent pace; compare with room. */
  flexibleSpendAtCurrentPace: number
  essentialCategories: Category[]
}

/**
 * How much is genuinely free for flexible spending: the balance is NOT all
 * discretionary. Known obligations and essentials come off first.
 */
export function spendingRoom(data: AppData, asOf: ISODate, endDate: ISODate, includeExpectedIncome: boolean): SpendingRoom {
  const proj = projectBalance(data, { asOf, endDate, includeExpectedIncome })
  const days = Math.max(0, diffDays(asOf, endDate))
  const essentialCategories = CATEGORIES.filter((c) => data.budget.classification[c] === 'essential' && c !== TRANSFER_CATEGORY)
  const essentialPerDay = essentialCategories.reduce((s, c) => s + (proj.runRate.perDay[c] ?? 0), 0)
  const flexiblePerDay = proj.runRate.totalPerDay - essentialPerDay
  const essentialSpend = essentialPerDay * days
  return {
    endDate,
    days,
    balance: proj.startBalance,
    expectedIncome: proj.totalExpectedIncome,
    plannedExpenses: proj.totalPlannedExpenses,
    essentialSpend,
    plannedSavings: proj.totalExtraSavings,
    room: proj.startBalance + proj.totalExpectedIncome - proj.totalPlannedExpenses - essentialSpend - proj.totalExtraSavings,
    flexibleSpendAtCurrentPace: flexiblePerDay * days,
    essentialCategories,
  }
}

// ---------------------------------------------------------- income pattern

export interface IncomePattern {
  count: number
  /** Mean days between income transactions, when there are at least two. */
  averageGapDays: number | null
  kind: 'none' | 'single' | 'regular' | 'irregular'
}

/** Is income predictable enough to plan around? Gaps with a spread above 40% of their mean count as irregular. */
export function incomePattern(txs: Transaction[], asOf: ISODate): IncomePattern {
  const dates = txs.filter((t) => t.type === 'income' && t.date <= asOf).map((t) => t.date).sort()
  if (dates.length === 0) return { count: 0, averageGapDays: null, kind: 'none' }
  if (dates.length === 1) return { count: 1, averageGapDays: null, kind: 'single' }
  const gaps = dates.slice(1).map((d, i) => diffDays(dates[i], d)).filter((g) => g > 0)
  if (gaps.length === 0) return { count: dates.length, averageGapDays: null, kind: 'irregular' }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length)
  return { count: dates.length, averageGapDays: mean, kind: sd / mean > 0.4 ? 'irregular' : 'regular' }
}

// -------------------------------------------------------------------- goal

export type GoalStatus = 'achieved' | 'on-track' | 'short' | 'at-risk' | 'past-due'

export interface GoalFeasibility {
  remaining: number
  daysLeft: number
  weeksLeft: number
  /** Saving needed each week from now to hit the target on time. */
  requiredPerWeek: number
  /** Contributions to the goal made through the scenario's weekly savings. */
  contributions: number
  /** Wallet growth over the horizon that is still unspent (never negative). */
  uncommittedSurplus: number
  /** saved + contributions + uncommittedSurplus */
  projectedSavings: number
  /** target − projectedSavings (positive = still short). */
  gap: number
  status: GoalStatus
  projection: Projection
}

/**
 * Goal feasibility under a plan. "On track" requires both that projected
 * savings reach the target and that the wallet never goes below zero.
 */
export function goalFeasibility(
  data: AppData,
  goal: Goal,
  opts: Omit<ProjectionOptions, 'endDate'>,
): GoalFeasibility {
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount)
  const daysLeft = diffDays(opts.asOf, goal.targetDate)
  const weeksLeft = Math.max(0, daysLeft) / 7
  const projection = projectBalance(data, { ...opts, endDate: goal.targetDate })
  const contributions = projection.totalExtraSavings
  const uncommittedSurplus = Math.max(0, projection.endBalance - projection.startBalance)
  const projectedSavings = goal.savedAmount + contributions + uncommittedSurplus
  const gap = goal.targetAmount - projectedSavings
  let status: GoalStatus
  if (remaining <= EPS) status = 'achieved'
  else if (daysLeft <= 0) status = 'past-due'
  else if (gap <= EPS) status = projection.shortfallDate ? 'at-risk' : 'on-track'
  else status = 'short'
  return {
    remaining,
    daysLeft,
    weeksLeft,
    requiredPerWeek: weeksLeft > 0 ? remaining / weeksLeft : remaining,
    contributions,
    uncommittedSurplus,
    projectedSavings,
    gap,
    status,
    projection,
  }
}

// -------------------------------------------------------------- comparison

export interface ScenarioComparison {
  base: Projection
  adjusted: Projection
  endBalanceDelta: number
  lowestBalanceDelta: number
  shortfallResolved: boolean
  shortfallIntroduced: boolean
}

export function compareScenarios(
  data: AppData,
  opts: Omit<ProjectionOptions, 'changes'>,
  changes: ScenarioChanges,
): ScenarioComparison {
  const base = projectBalance(data, opts)
  const adjusted = projectBalance(data, { ...opts, changes })
  return {
    base,
    adjusted,
    endBalanceDelta: adjusted.endBalance - base.endBalance,
    lowestBalanceDelta: adjusted.lowestBalance - base.lowestBalance,
    shortfallResolved: base.shortfallDate !== undefined && adjusted.shortfallDate === undefined,
    shortfallIntroduced: base.shortfallDate === undefined && adjusted.shortfallDate !== undefined,
  }
}

/**
 * Scenario helpers built on the finance engine. Scenarios are what-ifs: nothing
 * here mutates the stored plan except `applyScenario`, which returns new values
 * only for the parts the user chose to accept.
 */
import { addDays, diffDays } from './dates'
import { goalFeasibility, projectBalance, runRate, type ProjectionOptions } from './finance'
import {
  CATEGORIES,
  TRANSFER_CATEGORY,
  type AppData,
  type Budget,
  type Category,
  type Goal,
  type ISODate,
  type PlannedExpense,
  type ScenarioChanges,
} from './types'

export function isEmptyScenario(c: ScenarioChanges): boolean {
  return (
    Object.values(c.categoryCutPct).every((v) => !v) &&
    Object.keys(c.plannedChanges).length === 0 &&
    !(c.extraSavingsPerWeek > 0)
  )
}

export interface Acceptance {
  categories: Category[]
  planned: string[]
  savings: boolean
}

/**
 * Turn accepted scenario changes into plan updates:
 *  - category cut  -> monthly category limit = recent monthly pace x (1 - cut)
 *  - planned edits -> the planned expense is changed, moved or removed
 *  - extra savings -> added to the planned weekly savings
 */
export function applyScenario(
  data: AppData,
  changes: ScenarioChanges,
  accept: Acceptance,
  asOf: ISODate,
): { budget: Budget; plannedExpenses: PlannedExpense[] } {
  const rr = runRate(data.transactions, asOf)
  const limits = { ...data.budget.categoryLimits }
  for (const c of accept.categories) {
    const cut = changes.categoryCutPct[c] ?? 0
    const monthly = (rr.perDay[c] ?? 0) * 30
    if (cut > 0 && monthly > 0) limits[c] = Math.round((monthly * (1 - cut / 100)) / 50) * 50
  }
  const planned: PlannedExpense[] = []
  for (const p of data.profile.plannedExpenses) {
    const edit = changes.plannedChanges[p.id]
    if (!edit || !accept.planned.includes(p.id)) planned.push(p)
    else if (edit.removed) continue
    else planned.push({ ...p, amount: edit.amount ?? p.amount, date: edit.date ?? p.date })
  }
  const budget: Budget = {
    ...data.budget,
    categoryLimits: limits,
    plannedSavingsPerWeek: accept.savings
      ? (data.budget.plannedSavingsPerWeek ?? 0) + Math.max(0, changes.extraSavingsPerWeek)
      : data.budget.plannedSavingsPerWeek,
  }
  return { budget, plannedExpenses: planned }
}

export interface GoalProgressPoint {
  date: ISODate
  /** saved + contributions so far + unspent wallet growth so far (never negative). */
  progress: number
}

/** Progress towards a goal over time, using the same definition as `goalFeasibility`. */
export function goalProgressSeries(data: AppData, goal: Goal, opts: Omit<ProjectionOptions, 'endDate'>): GoalProgressPoint[] {
  const proj = projectBalance(data, { ...opts, endDate: goal.targetDate })
  const weekly = Math.max(0, data.budget.plannedSavingsPerWeek ?? 0) + Math.max(0, opts.changes?.extraSavingsPerWeek ?? 0)
  return proj.points.map((p, i) => ({
    date: p.date,
    progress: goal.savedAmount + weekly * Math.floor(i / 7) + Math.max(0, p.balance - proj.startBalance),
  }))
}

export interface GoalAlternatives {
  /** Weekly improvement in spare money needed to close the gap by the target date. */
  extraPerWeekNeeded: number
  /** Percent cut to flexible spending that would close the gap, or null if flexible spending alone cannot. */
  flexibleCutPctNeeded: number | null
  /** Target amount reachable by the current target date under these assumptions. */
  reachableTarget: number
  /** A later date on which the target is met under these assumptions (searched up to one year on), or null. */
  laterDate: ISODate | null
}

/**
 * Options to consider when a goal is short. These are suggestions only: they
 * never change the goal or the plan on their own.
 */
export function goalAlternatives(data: AppData, goal: Goal, opts: Omit<ProjectionOptions, 'endDate'>): GoalAlternatives {
  const base = goalFeasibility(data, goal, opts)
  const gap = Math.max(0, base.gap)
  const rr = base.projection.runRate
  const flexPerDay = CATEGORIES.filter((c) => data.budget.classification[c] === 'flexible' && c !== TRANSFER_CATEGORY).reduce(
    (s, c) => s + (rr.perDay[c] ?? 0),
    0,
  )
  const flexOverHorizon = flexPerDay * Math.max(0, base.daysLeft)
  let laterDate: ISODate | null = null
  if (gap > 0) {
    for (let i = 1; i <= 365; i++) {
      const d = addDays(goal.targetDate, i)
      const g = goalFeasibility(data, { ...goal, targetDate: d }, opts)
      if (g.status === 'on-track') {
        laterDate = d
        break
      }
    }
  }
  return {
    extraPerWeekNeeded: base.weeksLeft > 0 ? gap / base.weeksLeft : gap,
    flexibleCutPctNeeded: gap > 0 && flexOverHorizon > 0 && gap <= flexOverHorizon ? (gap / flexOverHorizon) * 100 : null,
    reachableTarget: Math.max(0, base.projectedSavings),
    laterDate,
  }
}

/** Days between today and a date, never negative. Handy for UI labels. */
export function daysUntil(asOf: ISODate, d: ISODate): number {
  return Math.max(0, diffDays(asOf, d))
}

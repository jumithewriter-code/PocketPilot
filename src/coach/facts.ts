/**
 * Builds the structured, minimal facts the coach receives. Everything numeric
 * comes from the finance engine. Transaction descriptions, names and any free
 * text the user typed are deliberately left out.
 */
import { addDays } from '../engine/dates'
import {
  budgetStatus,
  categoryTotals,
  compareScenarios,
  goalFeasibility,
  incomePattern,
  projectBalance,
  runRate,
  spendingRoom,
  summarise,
  upcomingEvents,
} from '../engine/finance'
import { formatDay, formatNaira } from '../engine/format'
import { buildInsights } from '../engine/insights'
import { goalAlternatives, isEmptyScenario } from '../engine/scenario'
import { CATEGORIES, type AppData, type Category, type ISODate, type Priority, type ScenarioChanges } from '../engine/types'
import type { CoachFacts, CoachFocus, ImpactLine } from './types'

const PRIORITY_WORDS: Record<Priority, string> = {
  understand: 'understand where my money goes',
  habits: 'improve my spending habits',
  'not-run-out': 'stop running out of money',
  budget: 'create or maintain a budget',
  'save-consistently': 'save more consistently',
  'emergency-fund': 'build an emergency fund',
  'specific-goal': 'save towards a specific goal',
  control: 'improve my overall financial control',
}

const round = (n: number) => Math.round(n)

export function describeChanges(data: AppData, changes: ScenarioChanges): string[] {
  const out: string[] = []
  for (const c of CATEGORIES) {
    const pct = changes.categoryCutPct[c]
    if (pct && pct > 0) out.push(`Cut ${c} spending by ${pct}%`)
  }
  for (const [id, e] of Object.entries(changes.plannedChanges)) {
    const p = data.profile.plannedExpenses.find((x) => x.id === id)
    if (!p) continue
    if (e.removed) out.push(`Skip planned expense "${p.label}" (${formatNaira(p.amount)})`)
    else {
      const bits = []
      if (e.amount !== undefined) bits.push(`amount ${formatNaira(e.amount)} instead of ${formatNaira(p.amount)}`)
      if (e.date) bits.push(`moved to ${formatDay(e.date)}`)
      out.push(`Change planned expense "${p.label}": ${bits.join(', ')}`)
    }
  }
  if (changes.extraSavingsPerWeek > 0) out.push(`Set aside an extra ${formatNaira(changes.extraSavingsPerWeek)} each week`)
  return out
}

export function buildCoachFacts(args: {
  data: AppData
  asOf: ISODate
  includeExpectedIncome: boolean
  changes: ScenarioChanges
  focus: CoachFocus
  horizonDays?: number
}): CoachFacts {
  const { data, asOf, includeExpectedIncome, changes, focus } = args
  const horizonDays = args.horizonDays ?? 30
  const { transactions: txs, profile, budget } = data
  const endDate = addDays(asOf, horizonDays)

  const rr = runRate(txs, asOf)
  const last28 = summarise(txs, addDays(asOf, -27), asOf)
  const cats = categoryTotals(txs, addDays(asOf, -27), asOf).slice(0, 6)
  const bs = budgetStatus(txs, budget, asOf)
  const pattern = incomePattern(txs, asOf)
  const base = { asOf, endDate, includeExpectedIncome }
  const proj = projectBalance(data, base)
  const room = spendingRoom(data, asOf, endDate, includeExpectedIncome)
  const scenarioActive = !isEmptyScenario(changes)
  const cmp = scenarioActive ? compareScenarios(data, base, changes) : null
  const past = txs.filter((t) => t.date <= asOf)

  let goal: CoachFacts['goal'] = null
  if (data.goal) {
    const opts = { asOf, includeExpectedIncome }
    const baseG = goalFeasibility(data, data.goal, opts)
    const adjG = scenarioActive ? goalFeasibility(data, data.goal, { ...opts, changes }) : baseG
    const alt = goalAlternatives(data, data.goal, { ...opts, changes: scenarioActive ? changes : undefined })
    goal = {
      description: data.goal.description,
      targetAmount: round(data.goal.targetAmount),
      savedAmount: round(data.goal.savedAmount),
      targetDate: data.goal.targetDate,
      remaining: round(baseG.remaining),
      daysLeft: baseG.daysLeft,
      requiredPerWeek: round(baseG.requiredPerWeek),
      projectedSavingsCurrentPlan: round(baseG.projectedSavings),
      projectedSavingsAdjusted: round(adjG.projectedSavings),
      gapAdjusted: round(adjG.gap),
      verdictAdjusted: adjG.status,
      flexibleCutPctNeeded: alt.flexibleCutPctNeeded === null ? null : Math.ceil(alt.flexibleCutPctNeeded),
      laterDateThatWorks: alt.laterDate,
    }
  }

  return {
    focus,
    asOf,
    currency: 'NGN',
    syntheticData: profile.isDemo,
    priorities: profile.priorities.map((p) => PRIORITY_WORDS[p]),
    history: { days: rr.basisDays, sufficient: rr.sufficient, transactionCount: past.length },
    balance: round(proj.startBalance),
    dailySpendAverage: round(rr.totalPerDay),
    oneOffsExcluded: { count: rr.oneOffs.count, total: round(rr.oneOffs.total) },
    last28Days: {
      income: round(last28.income),
      expenses: round(last28.expenses),
      movedToSavings: round(last28.transfers),
      keptPct: last28.savingsRate === null ? null : Math.round(last28.savingsRate * 100),
    },
    topCategories: cats.map((c) => ({
      category: c.category,
      type: budget.classification[c.category as Category],
      total: round(c.total),
      sharePct: Math.round(c.share * 100),
    })),
    budget: {
      overallLimit: budget.overallLimit ?? null,
      spentThisMonth: round(bs.spentTotal),
      overallState: bs.overallState,
      overBudget: bs.lines.filter((l) => l.state === 'over').map((l) => l.category),
      nearLimit: bs.lines.filter((l) => l.state === 'near').map((l) => l.category),
    },
    income: { pattern: pattern.kind, expectedIncludedInForecast: includeExpectedIncome },
    upcoming: upcomingEvents(profile, asOf, horizonDays).map((u) => ({ label: u.kind === 'income' ? 'Expected income' : u.label, date: u.date, amount: round(u.amount), kind: u.kind })),
    forecast: {
      horizonDays,
      endDate,
      endBalance: round(proj.endBalance),
      lowestBalance: round(proj.lowestBalance),
      lowestDate: proj.lowestDate,
      shortfallDate: proj.shortfallDate ?? null,
    },
    roomForFlexibleSpending: round(room.room),
    scenario: cmp
      ? {
          changes: describeChanges(data, changes),
          endBalance: round(cmp.adjusted.endBalance),
          lowestBalance: round(cmp.adjusted.lowestBalance),
          shortfallDate: cmp.adjusted.shortfallDate ?? null,
          endBalanceChange: round(cmp.endBalanceDelta),
          shortfallResolved: cmp.shortfallResolved,
          shortfallIntroduced: cmp.shortfallIntroduced,
          essentialCutsTested: cmp.adjusted.essentialCuts,
        }
      : null,
    goal,
    engineInsights: buildInsights(data, asOf, includeExpectedIncome)
      .slice(0, 8)
      .map((i) => ({ kind: i.kind, title: i.title, detail: i.detail })),
  }
}

/** The "what could change" lines come from the engine, not from the model. */
export function buildExpectedImpact(f: CoachFacts): ImpactLine[] {
  const out: ImpactLine[] = []
  const end = formatDay(f.forecast.endDate)
  out.push({ label: `Current plan: balance on ${end}`, value: formatNaira(f.forecast.endBalance) })
  out.push({ label: 'Current plan: lowest balance', value: `${formatNaira(f.forecast.lowestBalance)} on ${formatDay(f.forecast.lowestDate)}` })
  out.push({ label: 'Current plan: runs short?', value: f.forecast.shortfallDate ? `Yes, from ${formatDay(f.forecast.shortfallDate)}` : 'No' })
  if (f.scenario) {
    out.push({ label: `Adjusted scenario: balance on ${end}`, value: `${formatNaira(f.scenario.endBalance)} (${f.scenario.endBalanceChange >= 0 ? '+' : ''}${formatNaira(f.scenario.endBalanceChange)})` })
    out.push({ label: 'Adjusted scenario: lowest balance', value: formatNaira(f.scenario.lowestBalance) })
    out.push({ label: 'Adjusted scenario: runs short?', value: f.scenario.shortfallDate ? `Yes, from ${formatDay(f.scenario.shortfallDate)}` : 'No' })
  }
  if (f.goal) {
    out.push({ label: `Goal "${f.goal.description}": projected savings by ${formatDay(f.goal.targetDate)}`, value: `${formatNaira(f.goal.projectedSavingsAdjusted)} of ${formatNaira(f.goal.targetAmount)}` })
  }
  return out
}

/**
 * Chooses what the coach should concentrate on from the person's own words.
 * The question is still answered first; this only picks which calculated
 * section of the facts to emphasise.
 */
export function inferFocus(question: string, o: { scenarioActive: boolean; hasGoal: boolean }): CoachFocus {
  const q = question.toLowerCase()
  if (o.hasGoal && /\b(goal|target|saving for|save up|afford)\b/.test(q)) return 'goal'
  if (o.scenarioActive) return 'scenario'
  if (/\b(run short|run out|shortfall|forecast|balance|broke|end of (the )?month|next (week|month)|will i have)\b/.test(q)) return 'forecast'
  return 'overview'
}

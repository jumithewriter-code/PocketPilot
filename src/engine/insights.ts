/**
 * Deterministic insights. Every claim carries the evidence it was computed from,
 * and is labelled as an observation (from recorded data), a risk, or an estimate
 * (depends on assumptions). The AI coach explains these; it does not create them.
 */
import { addDays } from './dates'
import { budgetStatus, categoryTotals, projectBalance, runRate, summarise } from './finance'
import { formatNaira, formatDay } from './format'
import type { AppData, ISODate } from './types'

export type InsightKind = 'observation' | 'risk' | 'estimate'

export interface Insight {
  id: string
  kind: InsightKind
  title: string
  detail: string
  /** The recorded figures behind the claim, in plain words. */
  evidence: string
}

export function buildInsights(data: AppData, asOf: ISODate, includeExpectedIncome: boolean): Insight[] {
  const out: Insight[] = []
  const { transactions: txs, profile, budget } = data
  const past = txs.filter((t) => t.date <= asOf)
  if (past.length === 0) return out

  const rr = runRate(txs, asOf)
  if (!rr.sufficient) {
    out.push({
      id: 'thin-history',
      kind: 'observation',
      title: 'Not enough history yet for reliable patterns',
      detail: 'Add a couple of weeks of transactions and PocketPilot can spot trends and forecast more reliably.',
      evidence: `${rr.basisDays} day(s) of history recorded; at least 14 are needed.`,
    })
  }

  const last28 = addDays(asOf, -27)
  const cats = categoryTotals(txs, last28, asOf)
  const spent28 = cats.reduce((s, c) => s + c.total, 0)
  if (cats.length > 0 && spent28 > 0) {
    const top = cats[0]
    out.push({
      id: 'top-category',
      kind: 'observation',
      title: `${top.category} is your biggest spending area`,
      detail: `${Math.round(top.share * 100)}% of what you spent in the last 28 days went here.`,
      evidence: `${formatNaira(top.total)} of ${formatNaira(spent28)} across ${top.count} transaction${top.count === 1 ? '' : 's'}.`,
    })
  }

  // Trend: last 14 days vs the 14 before, when both windows have history.
  const recent = summarise(txs, addDays(asOf, -13), asOf).expenses
  const prior = summarise(txs, addDays(asOf, -27), addDays(asOf, -14)).expenses
  if (rr.basisDays >= 28 && prior > 0) {
    const change = (recent - prior) / prior
    if (Math.abs(change) >= 0.15) {
      out.push({
        id: 'trend',
        kind: 'observation',
        title: change > 0 ? 'Your spending has picked up recently' : 'Your spending has eased recently',
        detail: `The last 14 days are ${Math.abs(Math.round(change * 100))}% ${change > 0 ? 'higher' : 'lower'} than the 14 days before.`,
        evidence: `${formatNaira(recent)} vs ${formatNaira(prior)}.`,
      })
    }
  }

  // Budget pressure this month.
  const bs = budgetStatus(txs, budget, asOf)
  const over = bs.lines.filter((l) => l.state === 'over')
  const near = bs.lines.filter((l) => l.state === 'near')
  for (const l of over) {
    out.push({
      id: `over-${l.category}`,
      kind: 'risk',
      title: `${l.category} is over budget this month`,
      detail: `You have spent ${formatNaira(l.spent - (l.limit ?? 0))} more than the limit you set.`,
      evidence: `${formatNaira(l.spent)} spent against a ${formatNaira(l.limit ?? 0)} limit.`,
    })
  }
  for (const l of near) {
    out.push({
      id: `near-${l.category}`,
      kind: 'risk',
      title: `${l.category} is close to its budget`,
      detail: `${Math.round((l.utilisation ?? 0) * 100)}% of the monthly limit is already used.`,
      evidence: `${formatNaira(l.spent)} of ${formatNaira(l.limit ?? 0)}.`,
    })
  }
  if (bs.overallState === 'over' || bs.overallState === 'near') {
    out.push({
      id: 'overall-budget',
      kind: 'risk',
      title: bs.overallState === 'over' ? 'Over your overall budget this month' : 'Close to your overall budget',
      detail: `${Math.round((bs.overallUtilisation ?? 0) * 100)}% of the monthly limit is used.`,
      evidence: `${formatNaira(bs.spentTotal)} of ${formatNaira(bs.overallLimit ?? 0)}.`,
    })
  }

  // Forecast risk.
  const end = addDays(asOf, 30)
  const proj = projectBalance(data, { asOf, endDate: end, includeExpectedIncome })
  if (proj.shortfallDate) {
    out.push({
      id: 'shortfall',
      kind: 'estimate',
      title: `You may run short around ${formatDay(proj.shortfallDate)}`,
      detail: includeExpectedIncome
        ? 'If you keep spending at your recent pace and income arrives as expected, the balance is projected to go below zero.'
        : 'Counting only money you already have, the balance is projected to go below zero.',
      evidence: `Lowest projected balance ${formatNaira(proj.lowestBalance)} on ${formatDay(proj.lowestDate)}. Estimate based on ${rr.basisDays} days of history and ${profile.plannedExpenses.length} planned expense(s).`,
    })
  } else if (rr.sufficient) {
    out.push({
      id: 'no-shortfall',
      kind: 'estimate',
      title: 'No shortfall projected in the next 30 days',
      detail: 'At your recent pace the balance stays above zero. This is an estimate, not a promise.',
      evidence: `Lowest projected balance ${formatNaira(proj.lowestBalance)} on ${formatDay(proj.lowestDate)}.`,
    })
  }

  // Savings rate over the last 28 days, only when income was received.
  const s28 = summarise(txs, last28, asOf)
  if (s28.savingsRate !== null) {
    out.push({
      id: 'savings-rate',
      kind: 'observation',
      title: s28.savingsRate >= 0 ? `You kept ${Math.round(s28.savingsRate * 100)}% of what came in` : 'You spent more than you received',
      detail: 'Measured over the last 28 days, before any transfers to savings.',
      evidence: `${formatNaira(s28.income)} received, ${formatNaira(s28.expenses)} spent.`,
    })
  }
  return out
}

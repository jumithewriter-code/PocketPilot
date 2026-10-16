/**
 * Built-in explainer used when the AI service is unavailable, not configured,
 * or returns something that fails verification. It is rule-based text built
 * from the engine's facts. It is NOT generative AI, and the UI says so.
 * It only restates numbers that are already in the facts.
 */
import { formatDay, formatNaira } from '../engine/format'
import type { CoachFacts, CoachResponse } from './types'

const list = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const has = (f: CoachFacts, word: string) => f.priorities.some((p) => p.includes(word))

export function buildFallbackResponse(f: CoachFacts): CoachResponse {
  const end = formatDay(f.forecast.endDate)
  const flexible = f.topCategories.filter((c) => c.type === 'flexible').map((c) => c.category)
  const top = f.topCategories[0]

  // ---- summary: lead with what matters for the focus and the user's priorities
  let summary: string
  if (!f.history.sufficient) {
    summary = `There is not enough history yet for reliable patterns: ${f.history.days} day${f.history.days === 1 ? '' : 's'} of spending are recorded. What follows is a rough picture, not a trend.`
  } else if (f.focus === 'scenario' && f.scenario) {
    summary = `With these changes your balance on ${end} would be ${formatNaira(f.scenario.endBalance)} instead of ${formatNaira(f.forecast.endBalance)}, a difference of ${formatNaira(f.scenario.endBalanceChange)}. ${
      f.scenario.shortfallResolved
        ? 'It also avoids the projected shortfall.'
        : f.scenario.shortfallIntroduced
          ? 'It would create a shortfall that the current plan does not have.'
          : f.scenario.shortfallDate
            ? `A shortfall would still appear around ${formatDay(f.scenario.shortfallDate)}.`
            : 'No shortfall is projected either way.'
    }`
  } else if (f.focus === 'goal' && f.goal) {
    summary =
      f.goal.verdictAdjusted === 'achieved'
        ? `Your goal "${f.goal.description}" has already been reached.`
        : f.goal.verdictAdjusted === 'on-track'
          ? `Under these assumptions the goal "${f.goal.description}" looks feasible: projected savings of ${formatNaira(f.goal.projectedSavingsAdjusted)} against a target of ${formatNaira(f.goal.targetAmount)}. This is an estimate, not a promise.`
          : `The goal "${f.goal.description}" does not look feasible under the current assumptions: projected savings of ${formatNaira(f.goal.projectedSavingsAdjusted)} against a target of ${formatNaira(f.goal.targetAmount)}.`
  } else if (f.forecast.shortfallDate) {
    summary = `At your recent spending pace your balance is projected to go below ₦0 around ${formatDay(f.forecast.shortfallDate)}. Your lowest projected point is ${formatNaira(f.forecast.lowestBalance)}. This is an estimate based on ${f.history.days} days of history.`
  } else {
    summary = `At your recent spending pace your balance is projected to stay above ₦0 until ${end}, finishing at ${formatNaira(f.forecast.endBalance)}. This is an estimate, not a promise.`
  }
  if (has(f, 'understand') && top) summary += ` Most of your recent spending, ${top.sharePct}%, went on ${top.category}.`
  else if (has(f, 'running out')) summary += ` After known bills and essentials, about ${formatNaira(f.roomForFlexibleSpending)} is left for flexible spending in the next ${f.forecast.horizonDays} days.`
  else if (has(f, 'budget') && f.budget.overallLimit !== null) summary += ` This month you have spent ${formatNaira(f.budget.spentThisMonth)} against your ${formatNaira(f.budget.overallLimit)} limit.`

  // ---- observations and risks come straight from the engine's own insights
  const reassuring = (i: CoachFacts['engineInsights'][number]) => i.kind === 'observation' || i.title.startsWith('No shortfall')
  const observations = f.engineInsights.filter(reassuring).map((i) => `${i.title}. ${i.detail}`)
  if (f.last28Days.income > 0 || f.last28Days.expenses > 0) {
    observations.push(`In the last 28 days ${formatNaira(f.last28Days.income)} came in and ${formatNaira(f.last28Days.expenses)} went out on everyday spending.`)
  }
  const risks = f.engineInsights.filter((i) => !reassuring(i)).map((i) => `${i.title}. ${i.detail}`)
  if (f.scenario && f.scenario.essentialCutsTested.length > 0) {
    risks.push(`This scenario cuts essential spending (${list(f.scenario.essentialCutsTested)}). The numbers work, but consider what you would actually go without.`)
  }
  if (f.income.pattern === 'irregular') risks.push('Your income arrives at uneven intervals, so any forecast that relies on it is less certain.')
  if (f.goal && f.goal.verdictAdjusted === 'at-risk') risks.push('The goal is reached on paper, but your balance dips below ₦0 on the way.')

  // ---- recommendations: qualitative, and only reusing numbers already supplied
  const recommendations: string[] = []
  if (f.forecast.shortfallDate && flexible.length > 0) {
    recommendations.push(`Flexible spending (${list(flexible)}) is the gentlest place to adjust. Try the sliders in Planning to see how much difference it makes.`)
  } else if (f.forecast.shortfallDate) {
    recommendations.push('Most of your spending is on essentials, so cutting it is risky. Look at the timing of planned bills, or at ways to bring in a little extra, before trimming essentials.')
  }
  if (f.budget.overBudget.length > 0) recommendations.push(`Check ${list(f.budget.overBudget)}: you have gone past the limit you set there this month.`)
  if ((has(f, 'save more') || has(f, 'emergency fund')) && f.roomForFlexibleSpending > 0) {
    recommendations.push(`After obligations you have about ${formatNaira(f.roomForFlexibleSpending)} of room. Deciding a small amount to set aside first, before flexible spending, makes saving easier to keep up.`)
  }
  if (has(f, 'habits') && flexible.length > 0) recommendations.push(`For better habits, start with one flexible category, such as ${flexible[0]}, rather than changing everything at once.`)
  if (f.goal && ['short', 'at-risk', 'past-due'].includes(f.goal.verdictAdjusted)) {
    const g = `For your goal "${f.goal.description}": `
    if (f.goal.flexibleCutPctNeeded !== null) recommendations.push(`${g}trimming flexible spending by about ${f.goal.flexibleCutPctNeeded}% until ${formatDay(f.goal.targetDate)} would close the gap.`)
    if (f.goal.laterDateThatWorks) recommendations.push(`${g}moving the date to ${formatDay(f.goal.laterDateThatWorks)} would let the target be met under these assumptions.`)
    if (f.goal.flexibleCutPctNeeded === null && !f.goal.laterDateThatWorks) recommendations.push(`${g}flexible spending alone cannot close the gap, so the target or the date would need to change. That is your decision, and nothing has been changed for you.`)
  }
  if (!f.goal && has(f, 'specific goal')) recommendations.push('You chose saving for a specific goal. You can add one in Planning to see whether it looks feasible.')
  if (recommendations.length === 0) recommendations.push('Nothing needs urgent attention. Keep recording transactions so the picture stays accurate.')

  // ---- assumptions
  const assumptions = [
    `Everyday spending continues at your average of the last ${f.history.days} day${f.history.days === 1 ? '' : 's'}, about ${formatNaira(f.dailySpendAverage)} a day.`,
    f.income.expectedIncludedInForecast
      ? 'Expected income arrives on the dates you entered. If it is late or smaller, the forecast is too optimistic.'
      : 'Expected income is left out: only money you already have is counted.',
  ]
  if (f.oneOffsExcluded.count > 0) assumptions.push(`${f.oneOffsExcluded.count} one-off expense${f.oneOffsExcluded.count === 1 ? '' : 's'} (${formatNaira(f.oneOffsExcluded.total)}) you marked ${f.oneOffsExcluded.count === 1 ? 'is' : 'are'} not assumed to repeat.`)
  if (f.income.pattern !== 'regular') assumptions.push(`Income pattern: ${f.income.pattern === 'none' ? 'no income recorded' : f.income.pattern === 'single' ? 'only one payment recorded' : 'uneven timing'}, so it is hard to rely on.`)
  if (f.syntheticData) assumptions.push('This is a fictional student profile with synthetic data.')

  // ---- next steps and questions
  const next_steps = ['Open Planning and try one small change to see its effect.', 'Re-check the forecast after your next income or big expense.']
  if (f.budget.overBudget.length > 0) next_steps.unshift('Review the category limits in Budget.')
  const questions: string[] = []
  if (!f.history.sufficient) questions.push('Can you add the last few weeks of income and spending?')
  if (f.upcoming.every((u) => u.kind !== 'income')) questions.push('Do you expect any money in the next few weeks?')
  if (f.priorities.length === 0) questions.push('What matters most to you right now: understanding spending, avoiding running out, or saving?')

  return { summary, observations, risks, recommendations, assumptions, next_steps, questions }
}

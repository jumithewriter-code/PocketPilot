/**
 * Shapes shared by the facts builder, the built-in explainer, the verifier and the UI.
 * The server (web/server/schema.ts) mirrors CoachFacts and CoachResponse with zod.
 */

export type CoachFocus = 'overview' | 'forecast' | 'scenario' | 'goal'

/** Everything the coach is allowed to know. All numbers are calculated by the engine. */
export interface CoachFacts {
  focus: CoachFocus
  asOf: string
  currency: 'NGN'
  /** True when the data is the fictional demo profile. */
  syntheticData: boolean
  /** The user's chosen priorities, in words. Empty is valid. */
  priorities: string[]
  history: { days: number; sufficient: boolean; transactionCount: number }
  balance: number
  dailySpendAverage: number
  /** Expenses the user marked as one-offs; left out of the daily average. */
  oneOffsExcluded: { count: number; total: number }
  last28Days: { income: number; expenses: number; movedToSavings: number; keptPct: number | null }
  topCategories: { category: string; type: 'essential' | 'flexible'; total: number; sharePct: number }[]
  budget: { overallLimit: number | null; spentThisMonth: number; overallState: string; overBudget: string[]; nearLimit: string[] }
  income: { pattern: 'none' | 'single' | 'regular' | 'irregular'; expectedIncludedInForecast: boolean }
  upcoming: { label: string; date: string; amount: number; kind: 'income' | 'expense' }[]
  forecast: { horizonDays: number; endDate: string; endBalance: number; lowestBalance: number; lowestDate: string; shortfallDate: string | null }
  roomForFlexibleSpending: number
  scenario: null | {
    changes: string[]
    endBalance: number
    lowestBalance: number
    shortfallDate: string | null
    endBalanceChange: number
    shortfallResolved: boolean
    shortfallIntroduced: boolean
    essentialCutsTested: string[]
  }
  goal: null | {
    description: string
    targetAmount: number
    savedAmount: number
    targetDate: string
    remaining: number
    daysLeft: number
    requiredPerWeek: number
    projectedSavingsCurrentPlan: number
    projectedSavingsAdjusted: number
    gapAdjusted: number
    verdictAdjusted: string
    flexibleCutPctNeeded: number | null
    laterDateThatWorks: string | null
  }
  /** Observations, risks and estimates already computed from the user's data. */
  engineInsights: { kind: 'observation' | 'risk' | 'estimate'; title: string; detail: string }[]
}

/** What the language model (or the built-in explainer) writes. No new numbers belong here. */
export interface CoachResponse {
  summary: string
  observations: string[]
  risks: string[]
  recommendations: string[]
  assumptions: string[]
  next_steps: string[]
  /** Questions to ask when essential information is missing. May be empty. */
  questions: string[]
}

export interface ImpactLine {
  label: string
  value: string
}

export interface CoachResult {
  source: 'ai' | 'built-in'
  model?: string
  response: CoachResponse
  /** Calculated by the finance engine, never by the model. */
  expectedImpact: ImpactLine[]
  /** True when every ₦ amount and % in an AI response matched the engine's numbers. */
  verified: boolean
  /** Why the built-in explainer was used, when it was. */
  notice?: string
}

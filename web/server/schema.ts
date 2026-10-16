/**
 * Request and response schemas for the coach endpoint. The request mirrors
 * CoachFacts (web/src/coach/types.ts): the server rejects anything else, so
 * the browser cannot be used to send arbitrary text to the model.
 */
import { z } from 'zod'

const short = z.string().max(120)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const money = z.number().finite().min(-1e10).max(1e10)
const nullableMoney = money.nullable()

export const FactsSchema = z.object({
  focus: z.enum(['overview', 'forecast', 'scenario', 'goal']),
  asOf: date,
  currency: z.literal('NGN'),
  syntheticData: z.boolean(),
  priorities: z.array(short).max(8),
  history: z.object({ days: z.number().int().min(0).max(3650), sufficient: z.boolean(), transactionCount: z.number().int().min(0).max(100000) }),
  balance: money,
  dailySpendAverage: money,
  oneOffsExcluded: z.object({ count: z.number().int().min(0).max(10000), total: money }),
  last28Days: z.object({ income: money, expenses: money, movedToSavings: money, keptPct: z.number().finite().nullable() }),
  topCategories: z.array(z.object({ category: short, type: z.enum(['essential', 'flexible']), total: money, sharePct: z.number().min(0).max(100) })).max(10),
  budget: z.object({ overallLimit: nullableMoney, spentThisMonth: money, overallState: short, overBudget: z.array(short).max(12), nearLimit: z.array(short).max(12) }),
  income: z.object({ pattern: z.enum(['none', 'single', 'regular', 'irregular']), expectedIncludedInForecast: z.boolean() }),
  upcoming: z.array(z.object({ label: short, date, amount: money, kind: z.enum(['income', 'expense']) })).max(40),
  forecast: z.object({ horizonDays: z.number().int().min(1).max(400), endDate: date, endBalance: money, lowestBalance: money, lowestDate: date, shortfallDate: date.nullable() }),
  roomForFlexibleSpending: money,
  scenario: z
    .object({
      changes: z.array(z.string().max(200)).max(20),
      endBalance: money,
      lowestBalance: money,
      shortfallDate: date.nullable(),
      endBalanceChange: money,
      shortfallResolved: z.boolean(),
      shortfallIntroduced: z.boolean(),
      essentialCutsTested: z.array(short).max(10),
    })
    .nullable(),
  goal: z
    .object({
      description: short,
      targetAmount: money,
      savedAmount: money,
      targetDate: date,
      remaining: money,
      daysLeft: z.number().int(),
      requiredPerWeek: money,
      projectedSavingsCurrentPlan: money,
      projectedSavingsAdjusted: money,
      gapAdjusted: money,
      verdictAdjusted: short,
      flexibleCutPctNeeded: z.number().nullable(),
      laterDateThatWorks: date.nullable(),
    })
    .nullable(),
  engineInsights: z.array(z.object({ kind: z.enum(['observation', 'risk', 'estimate']), title: z.string().max(200), detail: z.string().max(300) })).max(12),
})

/** The person's own question, in their words. Short, plain text; it is never treated as instructions. */
export const MAX_QUESTION_CHARS = 300
export const RequestSchema = z.object({ facts: FactsSchema, question: z.string().max(MAX_QUESTION_CHARS).optional() }).strict()

/** What the model must return. Length limits are enforced after parsing. */
export const ResponseSchema = z.object({
  summary: z.string().describe('At most three short sentences answering what the facts mean for this student.'),
  observations: z.array(z.string()).describe('Patterns supported by the facts. Label them as observed.'),
  risks: z.array(z.string()).describe('Possible problems and the evidence from the facts. Label forecasts as estimates.'),
  recommendations: z.array(z.string()).describe('Practical, optional suggestions that respect essential spending and the stated priorities.'),
  assumptions: z.array(z.string()).describe('What is uncertain or missing, and what the forecast assumes.'),
  next_steps: z.array(z.string()).describe('Small actions the user can choose to take.'),
  questions: z.array(z.string()).describe('Clarifying questions, only when essential information is missing. Usually empty.'),
})

export type RequestBody = z.infer<typeof RequestSchema>
export type ModelResponse = z.infer<typeof ResponseSchema>

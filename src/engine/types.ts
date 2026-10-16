export const CATEGORIES = [
  'Food and groceries',
  'Transport',
  'Education and school expenses',
  'Accommodation and utilities',
  'Airtime and data',
  'Health and personal care',
  'Entertainment and leisure',
  'Shopping',
  'Savings and transfers',
  'Other',
] as const

export type Category = (typeof CATEGORIES)[number]
export type TxCategory = Category | 'Income'
export type TxType = 'income' | 'expense'
export type Classification = 'essential' | 'flexible'

/** Own-account transfers: leave the wallet but are not consumption. */
export const TRANSFER_CATEGORY: Category = 'Savings and transfers'

export const DEFAULT_CLASSIFICATION: Record<Category, Classification> = {
  'Food and groceries': 'essential',
  Transport: 'essential',
  'Education and school expenses': 'essential',
  'Accommodation and utilities': 'essential',
  'Airtime and data': 'essential',
  'Health and personal care': 'essential',
  'Entertainment and leisure': 'flexible',
  Shopping: 'flexible',
  'Savings and transfers': 'flexible',
  Other: 'flexible',
}

/** ISO date, YYYY-MM-DD */
export type ISODate = string

export interface Transaction {
  id: string
  date: ISODate
  description: string
  /** Always positive, in naira. Direction comes from `type`. */
  amount: number
  type: TxType
  category: TxCategory
  /** Model confidence (0-1) when the category came from the classifier. */
  categoryConfidence?: number
  /** True once the user has accepted or corrected the category. */
  categoryConfirmed: boolean
  /**
   * The user marked this expense as a one-off. It still counts in the recorded
   * balance, but forecasts do not assume it will repeat.
   */
  oneOff?: boolean
}

export interface IncomeEvent {
  id: string
  label: string
  date: ISODate
  amount: number
}

export interface PlannedExpense {
  id: string
  label: string
  date: ISODate
  amount: number
  category: Category
}

export type Priority =
  | 'understand'
  | 'habits'
  | 'not-run-out'
  | 'budget'
  | 'save-consistently'
  | 'emergency-fund'
  | 'specific-goal'
  | 'control'

export interface FinancialProfile {
  displayName: string
  currency: 'NGN'
  /** Balance before the first recorded transaction. */
  startingBalance: number
  expectedIncome: IncomeEvent[]
  plannedExpenses: PlannedExpense[]
  priorities: Priority[]
  isDemo: boolean
}

export interface Budget {
  id: string
  /** Monthly budget; period is the calendar month of the reference date. */
  overallLimit?: number
  /** Savings the user plans to move out of the wallet each week. */
  plannedSavingsPerWeek?: number
  categoryLimits: Partial<Record<Category, number>>
  classification: Record<Category, Classification>
}

export interface Goal {
  id: string
  description: string
  targetAmount: number
  savedAmount: number
  targetDate: ISODate
  priority?: 'low' | 'medium' | 'high'
}

export interface ScenarioChanges {
  /** Percent (0-100) to reduce the run-rate of each category by. */
  categoryCutPct: Partial<Record<Category, number>>
  /** Per planned-expense edits; the stored plan is never mutated. */
  plannedChanges: Record<string, { removed?: boolean; amount?: number; date?: ISODate }>
  /** Extra savings moved out of the wallet each week. */
  extraSavingsPerWeek: number
}

export interface Scenario {
  id: string
  name: string
  changes: ScenarioChanges
}

export interface AppData {
  profile: FinancialProfile
  transactions: Transaction[]
  budget: Budget
  goal?: Goal
}

export const EMPTY_CHANGES: ScenarioChanges = {
  categoryCutPct: {},
  plannedChanges: {},
  extraSavingsPerWeek: 0,
}

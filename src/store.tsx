/**
 * App state: one persisted source of truth (`data`). Every total, chart and
 * projection is derived from it by the engine; nothing derived is stored.
 */
import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import { todayISO } from './engine/dates'
import { buildBlankData, buildDemoData } from './engine/seed'
import { EMPTY_CHANGES, type AppData, type Budget, type Goal, type IncomeEvent, type PlannedExpense, type Priority, type ScenarioChanges, type Transaction } from './engine/types'

const KEY = 'pocketpilot.v1'

interface State {
  data: AppData | null
  /** Whether projections count expected (not yet received) income. */
  includeExpectedIncome: boolean
}

export type Action =
  | { type: 'startDemo' }
  | { type: 'startBlank'; payload: Parameters<typeof buildBlankData>[0] }
  | { type: 'exit' }
  | { type: 'addTx'; tx: Transaction }
  | { type: 'updateTx'; tx: Transaction }
  | { type: 'deleteTx'; id: string }
  | { type: 'setPriorities'; priorities: Priority[] }
  | { type: 'setBudget'; budget: Budget }
  | { type: 'setGoal'; goal?: Goal }
  | { type: 'setPlanned'; plannedExpenses: PlannedExpense[] }
  | { type: 'setExpectedIncome'; expectedIncome: IncomeEvent[] }
  | { type: 'setIncludeIncome'; value: boolean }

function reducer(state: State, a: Action): State {
  if (a.type === 'startDemo') return { ...state, data: buildDemoData(todayISO()) }
  if (a.type === 'startBlank') return { ...state, data: buildBlankData(a.payload) }
  if (a.type === 'exit') return { ...state, data: null }
  if (a.type === 'setIncludeIncome') return { ...state, includeExpectedIncome: a.value }
  const d = state.data
  if (!d) return state
  switch (a.type) {
    case 'addTx':
      return { ...state, data: { ...d, transactions: [...d.transactions, a.tx] } }
    case 'updateTx':
      return { ...state, data: { ...d, transactions: d.transactions.map((t) => (t.id === a.tx.id ? a.tx : t)) } }
    case 'deleteTx':
      return { ...state, data: { ...d, transactions: d.transactions.filter((t) => t.id !== a.id) } }
    case 'setPriorities':
      return { ...state, data: { ...d, profile: { ...d.profile, priorities: a.priorities } } }
    case 'setBudget':
      return { ...state, data: { ...d, budget: a.budget } }
    case 'setGoal':
      return { ...state, data: { ...d, goal: a.goal } }
    case 'setPlanned':
      return { ...state, data: { ...d, profile: { ...d.profile, plannedExpenses: a.plannedExpenses } } }
    case 'setExpectedIncome':
      return { ...state, data: { ...d, profile: { ...d.profile, expectedIncome: a.expectedIncome } } }
    default:
      return state
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as State
      if (s && typeof s === 'object' && 'includeExpectedIncome' in s) return s
    }
  } catch {
    /* corrupted or unavailable storage: start fresh */
  }
  return { data: null, includeExpectedIncome: true }
}

interface Ctx {
  state: State
  dispatch: (a: Action) => void
  today: string
}

const Store = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* storage full or blocked: the app still works for this session */
    }
  }, [state])
  const today = todayISO()
  const value = useMemo(() => ({ state, dispatch, today }), [state, today])
  const [changes, setChanges] = useState<ScenarioChanges>(EMPTY_CHANGES)
  const scenario = useMemo(() => ({ changes, setChanges, reset: () => setChanges(EMPTY_CHANGES) }), [changes])
  return (
    <Store.Provider value={value}>
      <ScenarioCtx.Provider value={scenario}>{children}</ScenarioCtx.Provider>
    </Store.Provider>
  )
}

/** The what-if being explored. Lives only in memory: exploring never alters saved data. */
interface ScenarioValue {
  changes: ScenarioChanges
  setChanges: (c: ScenarioChanges) => void
  reset: () => void
}
const ScenarioCtx = createContext<ScenarioValue | null>(null)

export function useScenario() {
  const c = useContext(ScenarioCtx)
  if (!c) throw new Error('useScenario outside StoreProvider')
  return c
}

export function useStore() {
  const c = useContext(Store)
  if (!c) throw new Error('useStore outside StoreProvider')
  return c
}

export function newId(prefix = 'id'): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${rand}`
}

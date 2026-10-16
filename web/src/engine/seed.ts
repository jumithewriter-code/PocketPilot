/**
 * Synthetic demo profile: "Ada", a fictional university student.
 * Everything here is invented. Dates are generated relative to `today` so the
 * demo always has recent history and upcoming events.
 */
import { addDays, dayOfWeek } from './dates'
import { recordedBalance } from './finance'
import {
  DEFAULT_CLASSIFICATION,
  type AppData,
  type Category,
  type ISODate,
  type Transaction,
} from './types'

/** Small deterministic PRNG so the demo is identical on every reset. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HISTORY_DAYS = 84
const DESIRED_BALANCE_TODAY = 24_500

type Pool = { d: string; lo: number; hi: number }

const pools: Record<string, Pool[]> = {
  'Food and groceries': [
    { d: 'Lunch at campus cafeteria', lo: 500, hi: 800 },
    { d: 'Jollof rice and chicken', lo: 600, hi: 1000 },
    { d: 'Suya at night', lo: 500, hi: 1000 },
    { d: 'Bread and akara breakfast', lo: 300, hi: 500 },
    { d: 'Shawarma after lectures', lo: 900, hi: 1400 },
  ],
  Transport: [
    { d: 'Bus fare to university', lo: 300, hi: 500 },
    { d: 'Keke ride to campus', lo: 200, hi: 500 },
    { d: 'Bolt ride home', lo: 800, hi: 1400 },
  ],
}

export function buildDemoData(today: ISODate): AppData {
  const rand = mulberry32(2026)
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) / 50) * 50
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  let n = 0
  const txs: Transaction[] = []
  const add = (date: ISODate, type: 'income' | 'expense', amount: number, category: Transaction['category'], description: string) =>
    txs.push({ id: `demo-${++n}`, date, description, amount, type, category, categoryConfirmed: true })

  for (let off = -HISTORY_DAYS + 1; off <= 0; off++) {
    const date = addDays(today, off)
    const dow = dayOfWeek(date) // 0 = Sunday
    const weekday = dow >= 1 && dow <= 5
    const dayIndex = off + HISTORY_DAYS

    // Food: most days one or two purchases; weekends a bit pricier.
    {
      const p = pick(pools['Food and groceries'])
      add(date, 'expense', between(p.lo, p.hi), 'Food and groceries', p.d)
    }
    if (rand() < 0.2) {
      const p = pick(pools['Food and groceries'])
      add(date, 'expense', between(p.lo, p.hi), 'Food and groceries', p.d)
    }
    if (dow === 6 && rand() < 0.5) add(date, 'expense', between(3000, 4500), 'Food and groceries', 'Weekly groceries at the market')

    // Transport on school days.
    if (weekday) {
      const p = pick(pools.Transport)
      add(date, 'expense', between(p.lo, p.hi), 'Transport', p.d)
    }
    // Weekly small items.
    if (dow === 1) add(date, 'expense', between(1000, 1500), 'Airtime and data', 'MTN airtime')
    if (dayIndex % 28 === 3) add(date, 'expense', 3_500, 'Airtime and data', 'Mobile data subscription')
    if (dayIndex % 28 === 10) add(date, 'expense', between(3500, 5000), 'Accommodation and utilities', 'Electricity token')
    if (weekday && rand() < 0.2) add(date, 'expense', between(500, 1800), 'Education and school expenses', pick(['Photocopy of lecture notes', 'Handout for chemistry', 'Printing assignment']))
    if (rand() < 0.05) add(date, 'expense', between(1500, 3500), 'Health and personal care', pick(['Pharmacy drugs', 'Haircut at the barber', 'Body cream and soap']))
    if (dow === 5 || dow === 6) {
      if (rand() < 0.4) add(date, 'expense', between(2000, 5000), 'Entertainment and leisure', pick(['Cinema ticket', 'Football viewing centre', 'Hangout at the lounge', 'Birthday party contribution']))
    }
    if (rand() < 0.02) add(date, 'expense', between(3000, 6000), 'Shopping', pick(['New sneakers', 'T shirt and jeans', 'Phone case and screen guard']))
    if (dow === 5 && dayIndex % 14 < 7) add(date, 'expense', 3_000, 'Savings and transfers', 'Transfer to PiggyVest savings')
  }

  // Money in: a monthly allowance from "Dad" every 28 days, plus a small side income.
  for (const off of [-80, -52, -24]) add(addDays(today, off), 'income', 80_000, 'Income', 'Monthly allowance from Dad')
  add(addDays(today, -37), 'income', 8_000, 'Income', 'Tutoring payment')
  add(addDays(today, -9), 'income', 5_000, 'Income', 'Gift from aunty')
  // One-off larger costs inside history.
  add(addDays(today, -60), 'expense', 20_000, 'Accommodation and utilities', 'Hostel maintenance levy')
  add(addDays(today, -41), 'expense', 12_000, 'Education and school expenses', 'Textbook for economics')

  const profile = {
    displayName: 'Ada (demo student)',
    currency: 'NGN' as const,
    startingBalance: 0,
    expectedIncome: [{ id: 'inc-1', label: 'Monthly allowance from Dad', date: addDays(today, 4), amount: 80_000 }],
    plannedExpenses: [
      { id: 'pe-1', label: 'Data bundle renewal', date: addDays(today, 3), amount: 3_500, category: 'Airtime and data' as Category },
      { id: 'pe-2', label: 'Electricity token', date: addDays(today, 6), amount: 4_000, category: 'Accommodation and utilities' as Category },
      { id: 'pe-3', label: 'Course registration fee', date: addDays(today, 9), amount: 15_000, category: 'Education and school expenses' as Category },
      { id: 'pe-4', label: "Friend's birthday party", date: addDays(today, 12), amount: 6_000, category: 'Entertainment and leisure' as Category },
      { id: 'pe-5', label: 'Course textbook', date: addDays(today, 15), amount: 7_000, category: 'Education and school expenses' as Category },
    ],
    priorities: ['understand', 'not-run-out', 'budget'] as AppData['profile']['priorities'],
    isDemo: true,
  }
  // Choose the opening balance so that today's recorded balance is the intended figure.
  profile.startingBalance = DESIRED_BALANCE_TODAY - recordedBalance(profile, txs, today)

  return {
    profile,
    transactions: txs,
    budget: {
      id: 'budget-1',
      overallLimit: 75_000,
      categoryLimits: {
        'Food and groceries': 30_000,
        Transport: 10_000,
        'Airtime and data': 6_000,
        'Entertainment and leisure': 8_000,
        Shopping: 6_000,
      },
      classification: { ...DEFAULT_CLASSIFICATION },
    },
  }
}

/** Blank profile for users who start from scratch. */
export function buildBlankData(opts: {
  displayName: string
  startingBalance: number
  priorities: AppData['profile']['priorities']
  expectedIncome?: { label: string; date: ISODate; amount: number }
}): AppData {
  return {
    profile: {
      displayName: opts.displayName || 'You',
      currency: 'NGN',
      startingBalance: opts.startingBalance,
      expectedIncome: opts.expectedIncome ? [{ id: 'inc-1', ...opts.expectedIncome }] : [],
      plannedExpenses: [],
      priorities: opts.priorities,
      isDemo: false,
    },
    transactions: [],
    budget: { id: 'budget-1', categoryLimits: {}, classification: { ...DEFAULT_CLASSIFICATION } },
  }
}

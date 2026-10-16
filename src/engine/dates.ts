import type { ISODate } from './types'

const MS_PER_DAY = 86_400_000

export function parseISO(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

export function toISO(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(d: ISODate, n: number): ISODate {
  return toISO(parseISO(d) + n * MS_PER_DAY)
}

/** Whole days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b) - parseISO(a)) / MS_PER_DAY)
}

export function todayISO(): ISODate {
  const n = new Date()
  const m = String(n.getMonth() + 1).padStart(2, '0')
  const d = String(n.getDate()).padStart(2, '0')
  return `${n.getFullYear()}-${m}-${d}`
}

export function isValidISO(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && toISO(parseISO(d)) === d
}

/** First and last day of the calendar month containing d. */
export function monthRange(d: ISODate): { from: ISODate; to: ISODate } {
  const [y, m] = d.split('-').map(Number)
  const from = toISO(Date.UTC(y, m - 1, 1))
  const to = toISO(Date.UTC(y, m, 0))
  return { from, to }
}

export function inRange(d: ISODate, from: ISODate, to: ISODate): boolean {
  return d >= from && d <= to
}

export function dayOfWeek(d: ISODate): number {
  return new Date(parseISO(d)).getUTCDay()
}

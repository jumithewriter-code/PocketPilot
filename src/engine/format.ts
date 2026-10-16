import { parseISO } from './dates'
import type { ISODate } from './types'

const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
})

/** ₦12,500 — negative values render as -₦12,500. */
export function formatNaira(n: number): string {
  const rounded = Math.round(n)
  return naira.format(Object.is(rounded, -0) ? 0 : rounded)
}

export function formatPct(x: number): string {
  return `${Math.round(x * 100)}%`
}


export function formatDay(d: ISODate): string {
  return new Date(parseISO(d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function formatDayLong(d: ISODate): string {
  return new Date(parseISO(d)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

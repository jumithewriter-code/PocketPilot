import type { ReactNode } from 'react'
import { formatNaira } from './engine/format'
import type { Priority } from './engine/types'

export const PRIORITY_LABELS: Record<Priority, string> = {
  understand: 'Understand where my money goes',
  habits: 'Improve my spending habits',
  'not-run-out': 'Stop running out of money',
  budget: 'Create or maintain a budget',
  'save-consistently': 'Save more consistently',
  'emergency-fund': 'Build an emergency fund',
  'specific-goal': 'Save towards a specific purchase or goal',
  control: 'Improve my overall financial control',
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className={`value num ${tone ?? ''}`}>{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Money({ n, signed }: { n: number; signed?: boolean }) {
  const tone = signed ? (n > 0 ? 'pos' : n < 0 ? 'neg' : '') : ''
  return <span className={`num ${tone}`}>{signed && n > 0 ? '+' : ''}{formatNaira(n)}</span>
}

export function SyntheticBanner() {
  return (
    <div className="banner" role="note">
      <strong>Demo data.</strong> This is a fictional student profile with synthetic transactions. No real bank account is connected.
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p className="small">{children}</p>
    </div>
  )
}

export function ProgressBar({ value, state }: { value: number; state?: 'ok' | 'near' | 'over' | 'unbudgeted' }) {
  const cls = state === 'over' ? 'over' : state === 'near' ? 'warn' : ''
  return (
    <div className={`bar ${cls}`} role="progressbar" aria-valuenow={Math.round(Math.min(1, value) * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  )
}

export const CATEGORY_COLORS: Record<string, string> = {
  'Food and groceries': '#33503a',
  Transport: '#6f8f5e',
  'Education and school expenses': '#b85a32',
  'Accommodation and utilities': '#8a6d3b',
  'Airtime and data': '#4e7f87',
  'Health and personal care': '#a8667a',
  'Entertainment and leisure': '#d08a3c',
  Shopping: '#7b6aa3',
  'Savings and transfers': '#5b6b73',
  Other: '#9a9684',
}

export const COLORS = { base: '#8a6d3b', adjusted: '#33503a', goal: '#b85a32' }

/** Recharts animates by default; skip it for people who ask for reduced motion. */
export const ANIMATE_CHARTS = typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

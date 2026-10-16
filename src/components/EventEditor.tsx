import { useState } from 'react'
import { isValidISO } from '../engine/dates'
import { formatDayLong, formatNaira } from '../engine/format'
import { CATEGORIES, type Category } from '../engine/types'
import { newId } from '../store'
import { Empty } from '../ui'

export interface EventItem {
  id: string
  label: string
  date: string
  amount: number
  category?: Category
}

interface Props {
  kind: 'income' | 'expense'
  items: EventItem[]
  today: string
  onChange: (items: EventItem[]) => void
}

/** Add, edit and remove dated future events (expected income or planned expenses). */
export function EventEditor({ kind, items, today, onChange }: Props) {
  const [editing, setEditing] = useState<EventItem | 'new' | null>(null)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState<Category>('Other')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const isIncome = kind === 'income'

  function open(item: EventItem | 'new') {
    setEditing(item)
    setErrors({})
    if (item === 'new') {
      setLabel('')
      setAmount('')
      setDate('')
      setCategory('Other')
    } else {
      setLabel(item.label)
      setAmount(String(item.amount))
      setDate(item.date)
      setCategory(item.category ?? 'Other')
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const amt = Number(amount)
    if (!label.trim()) errs.label = 'Give it a short name.'
    if (!amount.trim() || !Number.isFinite(amt) || amt <= 0) errs.amount = 'Enter an amount above ₦0.'
    if (!isValidISO(date)) errs.date = 'Choose a valid date.'
    else if (date <= today) errs.date = 'Use a date after today. Money that has already moved belongs in Transactions.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    const item: EventItem = {
      id: editing === 'new' || editing === null ? newId(isIncome ? 'inc' : 'pe') : editing.id,
      label: label.trim(),
      amount: Math.round(amt * 100) / 100,
      date,
      ...(isIncome ? {} : { category }),
    }
    onChange(editing === 'new' ? [...items, item] : items.map((i) => (i.id === item.id ? item : i)))
    setEditing(null)
  }

  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div>
      {sorted.length === 0 && editing === null && (
        <Empty title={isIncome ? 'No expected income entered' : 'No planned expenses'}>
          {isIncome
            ? 'If your income is uncertain, leave this empty: forecasts will then count only money you already have.'
            : 'Add known bills or purchases so forecasts account for them.'}
        </Empty>
      )}
      {sorted.map((i) => (
        <div className="tx" key={i.id}>
          <div>{i.label}</div>
          <div className={`amt num ${isIncome ? 'pos' : ''}`}>{isIncome ? '+' : '−'}{formatNaira(i.amount)}</div>
          <div className="meta">
            <span className={`pill ${isIncome ? 'warn' : 'terra'}`}>{isIncome ? 'Expected, not received' : i.category}</span>
            <span className="small muted">{formatDayLong(i.date)}</span>
            {i.date <= today && <span className="pill bad">Date has passed: not counted</span>}
            <span className="row" style={{ marginLeft: 'auto', gap: 6 }}>
              <button className="btn ghost sm" onClick={() => open(i)} aria-label={`Edit ${i.label}`}>Edit</button>
              <button className="btn danger sm" onClick={() => onChange(items.filter((x) => x.id !== i.id))} aria-label={`Remove ${i.label}`}>Remove</button>
            </span>
          </div>
        </div>
      ))}

      {editing === null ? (
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => open('new')}>
          + {isIncome ? 'Add expected income' : 'Add planned expense'}
        </button>
      ) : (
        <form onSubmit={submit} noValidate style={{ marginTop: 12 }} aria-label={isIncome ? 'Expected income' : 'Planned expense'}>
          <div className="form-grid">
            <label>
              Name
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={50} placeholder={isIncome ? 'e.g. Allowance' : 'e.g. Course registration'} aria-invalid={!!errors.label} />
              {errors.label && <span className="field-err" role="alert">{errors.label}</span>}
            </label>
            <label>
              Amount (₦)
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount} />
              {errors.amount && <span className="field-err" role="alert">{errors.amount}</span>}
            </label>
            <label>
              Date
              <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} />
              {errors.date && <span className="field-err" role="alert">{errors.date}</span>}
            </label>
            {!isIncome && (
              <label>
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm" type="submit">{editing === 'new' ? 'Add' : 'Save'}</button>
            <button className="btn ghost sm" type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

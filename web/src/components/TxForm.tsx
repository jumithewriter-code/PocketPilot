import { useMemo, useState } from 'react'
import { isValidISO } from '../engine/dates'
import { likelyOneOff } from '../engine/finance'
import { formatNaira } from '../engine/format'
import { CATEGORIES, TRANSFER_CATEGORY, type Category, type Transaction, type TxType } from '../engine/types'
import { classifyDescription } from '../ml/classifier'
import { newId } from '../store'

interface Props {
  today: string
  /** Existing transactions, used only to spot unusually large amounts. */
  history: Transaction[]
  initial?: Transaction
  onSave: (tx: Transaction) => void
  onCancel: () => void
}

export function TxForm({ today, history, initial, onSave, onCancel }: Props) {
  const [type, setType] = useState<TxType>(initial?.type ?? 'expense')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [date, setDate] = useState(initial?.date ?? today)
  /** Set once the user picks a category themselves; stops the model overwriting it. */
  const [picked, setPicked] = useState<Category | null>(
    initial && initial.type === 'expense' && initial.categoryConfirmed ? (initial.category as Category) : null,
  )
  const [oneOff, setOneOff] = useState(initial?.oneOff ?? false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const suggestion = useMemo(() => (type === 'expense' ? classifyDescription(description) : null), [type, description])
  const category: Category | null = type === 'expense' ? picked ?? suggestion?.category ?? 'Other' : null
  const usingModel = type === 'expense' && picked === null && suggestion?.method === 'model'
  const countsInPace = type === 'expense' && category !== TRANSFER_CATEGORY
  const amountNum = Number(amount)
  const looksOneOff =
    countsInPace && !oneOff && Number.isFinite(amountNum) && amountNum > 0 && isValidISO(date) &&
    likelyOneOff(history, { date, amount: amountNum, category: category as Category, id: initial?.id })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const amt = Number(amount)
    if (!description.trim()) errs.description = 'Add a short description.'
    if (!amount.trim() || !Number.isFinite(amt) || amt <= 0) errs.amount = 'Enter an amount above ₦0.'
    if (!isValidISO(date)) errs.date = 'Choose a valid date.'
    else if (date > today) errs.date = 'Recorded transactions cannot be in the future. Add upcoming items in the planner instead.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    const tx: Transaction = {
      id: initial?.id ?? newId('tx'),
      date,
      description: description.trim(),
      amount: Math.round(amt * 100) / 100,
      type,
      category: type === 'income' ? 'Income' : (category as Category),
      categoryConfidence: usingModel ? suggestion!.confidence : undefined,
      categoryConfirmed: true,
      ...(countsInPace && oneOff ? { oneOff: true } : {}),
    }
    onSave(tx)
  }

  return (
    <form className="card" onSubmit={submit} noValidate aria-label={initial ? 'Edit transaction' : 'Add transaction'}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h2>{initial ? 'Edit transaction' : 'Add a transaction'}</h2>
        <div className="seg" role="group" aria-label="Transaction type">
          <button type="button" aria-pressed={type === 'expense'} onClick={() => setType('expense')}>Expense</button>
          <button type="button" aria-pressed={type === 'income'} onClick={() => setType('income')}>Income</button>
        </div>
      </div>
      <div className="form-grid">
        <label style={{ gridColumn: '1 / -1' }}>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === 'expense' ? 'e.g. Lunch at campus cafeteria' : 'e.g. Monthly allowance'} maxLength={80} aria-invalid={!!errors.description} />
          {errors.description && <span className="field-err" role="alert">{errors.description}</span>}
        </label>
        <label>
          Amount (₦)
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 1500" aria-invalid={!!errors.amount} />
          {errors.amount && <span className="field-err" role="alert">{errors.amount}</span>}
        </label>
        <label>
          Date
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} />
          {errors.date && <span className="field-err" role="alert">{errors.date}</span>}
        </label>
        {type === 'expense' && (
          <label>
            Category
            <select value={category ?? 'Other'} onChange={(e) => setPicked(e.target.value as Category)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        )}
      </div>

      {type === 'expense' && suggestion && description.trim() && (
        <div className={`suggest ${suggestion.needsReview ? 'review' : ''}`} style={{ marginTop: 12 }} aria-live="polite">
          {suggestion.method === 'model' && (
            <>
              <strong>Model suggestion: {suggestion.category}</strong>
              {suggestion.topTerms.length > 0 && (
                <div className="small muted">Because of: {suggestion.topTerms.map((t) => `“${t.term}”`).join(', ')}</div>
              )}
              {suggestion.needsReview && <div className="small"><strong>Not very sure.</strong> Please check the category before saving.</div>}
              {picked && picked !== suggestion.category && <div className="small">You chose <strong>{picked}</strong> instead. That is fine: your choice is saved.</div>}
              {suggestion.alternatives.some((a) => a.probability >= 0.02) && (
                <div className="chips" style={{ marginTop: 6 }} aria-label="Other likely categories">
                  <span className="small muted">Also possible:</span>
                  {suggestion.alternatives.filter((a) => a.probability >= 0.02).map((a) => (
                    <button type="button" className="chip" key={a.category} onClick={() => setPicked(a.category)}>{a.category}</button>
                  ))}
                </div>
              )}
            </>
          )}
          {suggestion.method !== 'model' && <span>{suggestion.note ?? 'Choose a category.'}</span>}
        </div>
      )}

      {type === 'expense' && category === 'Savings and transfers' && (
        <p className="small" style={{ marginTop: 8 }} role="note">
          <strong>Heads up:</strong> “Savings and transfers” means moving your own money (for example into savings). It is not counted as spending. If this was a payment to someone else, choose another category such as Other.
        </p>
      )}

      {countsInPace && (
        <div style={{ marginTop: 10 }}>
          {looksOneOff && (
            <div className="suggest review" role="note" style={{ marginBottom: 8 }}>
              <strong>{formatNaira(amountNum)} is much larger than your usual {category} spending.</strong>{' '}
              <span className="small">Is it a one-off? If not, forecasts will assume you keep spending like this.</span>{' '}
              <button type="button" className="chip" onClick={() => setOneOff(true)}>Yes, it is a one-off</button>
            </div>
          )}
          <label className="row" style={{ fontWeight: 500 }}>
            <input type="checkbox" checked={oneOff} onChange={(e) => setOneOff(e.target.checked)} />
            One-off: do not assume I will spend like this again
          </label>
          <p className="small muted">It still comes off your balance. It is only left out when forecasting your everyday pace.</p>
        </div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" type="submit">{initial ? 'Save changes' : 'Add transaction'}</button>
        <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

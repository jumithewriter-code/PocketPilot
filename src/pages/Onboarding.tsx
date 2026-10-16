import { useState } from 'react'
import { addDays } from '../engine/dates'
import type { Priority } from '../engine/types'
import { useStore } from '../store'
import { PRIORITY_LABELS } from '../ui'

export function Onboarding() {
  const { dispatch, today } = useStore()
  const [name, setName] = useState('')
  const [balance, setBalance] = useState('')
  const [incomeAmt, setIncomeAmt] = useState('')
  const [incomeDate, setIncomeDate] = useState(addDays(today, 7))
  const [priorities, setPriorities] = useState<Priority[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  function toggle(p: Priority) {
    setPriorities((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const bal = balance.trim() === '' ? 0 : Number(balance)
    if (!Number.isFinite(bal) || bal < 0) errs.balance = 'Enter your balance as a number, 0 or more.'
    const inc = incomeAmt.trim() === '' ? 0 : Number(incomeAmt)
    if (!Number.isFinite(inc) || inc < 0) errs.income = 'Enter the expected amount as a number, 0 or more.'
    if (inc > 0 && incomeDate <= today) errs.incomeDate = 'Expected income should be dated after today.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    dispatch({
      type: 'startBlank',
      payload: {
        displayName: name.trim(),
        startingBalance: bal,
        priorities,
        expectedIncome: inc > 0 ? { label: 'Expected income', date: incomeDate, amount: inc } : undefined,
      },
    })
  }

  return (
    <div className="main" style={{ paddingBottom: 48 }}>
      <div className="brand" style={{ marginBottom: 20 }}>
        <span className="brand-mark" aria-hidden>P</span> PocketPilot
      </div>
      <h1>Understand your money. Take control.</h1>
      <p className="muted" style={{ marginTop: 6, maxWidth: 620 }}>
        PocketPilot reads your spending, forecasts where your balance is heading, and lets you test changes before you make them.
        No bank login, BVN or PIN is ever needed.
      </p>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Just want to look around?</h2>
        <p className="muted small" style={{ margin: '4px 0 12px' }}>
          Open a fictional student profile with 12 weeks of synthetic transactions, upcoming bills and an expected allowance.
        </p>
        <button className="btn accent" onClick={() => dispatch({ type: 'startDemo' })}>Explore the demo student profile</button>
      </div>

      <form className="card" style={{ marginTop: 14 }} onSubmit={submit} noValidate>
        <h2>Or start with your own numbers</h2>
        <p className="muted small" style={{ margin: '4px 0 12px' }}>Everything stays on this device. All fields are optional.</p>
        <div className="form-grid">
          <label>
            Nickname
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="e.g. Tola" />
          </label>
          <label>
            Money you have now (₦)
            <input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="e.g. 15000" aria-invalid={!!errors.balance} />
            {errors.balance && <span className="field-err" role="alert">{errors.balance}</span>}
          </label>
          <label>
            Expected income (₦)
            <input inputMode="decimal" value={incomeAmt} onChange={(e) => setIncomeAmt(e.target.value)} placeholder="e.g. 50000 allowance" aria-invalid={!!errors.income} />
            {errors.income && <span className="field-err" role="alert">{errors.income}</span>}
          </label>
          <label>
            Expected on
            <input type="date" value={incomeDate} onChange={(e) => setIncomeDate(e.target.value)} />
            {errors.incomeDate && <span className="field-err" role="alert">{errors.incomeDate}</span>}
          </label>
          <label>
            Currency
            <select value="NGN" disabled aria-label="Currency"><option value="NGN">Nigerian naira (₦)</option></select>
          </label>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: '16px 0 0' }}>
          <legend style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>What matters most right now? (optional, pick any)</legend>
          <div className="form-grid">
            {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
              <label key={p} className="prio">
                <input type="checkbox" checked={priorities.includes(p)} onChange={() => toggle(p)} />
                <span>{PRIORITY_LABELS[p]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div style={{ marginTop: 16 }}>
          <button className="btn" type="submit">Start with my details</button>
        </div>
      </form>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { EventEditor } from '../components/EventEditor'
import { Priorities } from '../components/Priorities'
import { addDays } from '../engine/dates'
import { budgetStatus, incomePattern, spendingRoom, type BudgetState } from '../engine/finance'
import { formatDay, formatNaira, formatPct } from '../engine/format'
import { TRANSFER_CATEGORY, type Budget as BudgetT, type Category, type Classification } from '../engine/types'
import { useStore } from '../store'
import { Money, ProgressBar } from '../ui'

const STATE_PILL: Record<BudgetState, { cls: string; text: string }> = {
  ok: { cls: '', text: 'On track' },
  near: { cls: 'warn', text: 'Close to limit' },
  over: { cls: 'bad', text: 'Over budget' },
  unbudgeted: { cls: 'sand', text: 'No limit set' },
}

/** A naira field that commits on blur or Enter. Empty means "no limit". */
function AmountField({ value, label, onCommit }: { value: number | undefined; label: string; onCommit: (v: number | undefined) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const shown = draft ?? (value === undefined ? '' : String(value))
  function commit() {
    if (draft === null) return
    const t = draft.trim()
    if (t === '') {
      setErr('')
      onCommit(undefined)
    } else {
      const n = Number(t)
      if (!Number.isFinite(n) || n < 0) {
        setErr('Enter a number, 0 or more')
        return
      }
      setErr('')
      onCommit(n)
    }
    setDraft(null)
  }
  return (
    <span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={shown}
        placeholder="none"
        aria-invalid={!!err}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        style={{ width: 120 }}
      />
      {err && <span className="field-err" role="alert" style={{ display: 'block' }}>{err}</span>}
    </span>
  )
}

export function Budget() {
  const { state, dispatch, today } = useStore()
  const data = state.data!
  const { budget, profile } = data
  const setBudget = (b: BudgetT) => dispatch({ type: 'setBudget', budget: b })
  const status = useMemo(() => budgetStatus(data.transactions, budget, today), [data.transactions, budget, today])
  const horizon = addDays(today, 30)
  const room = useMemo(() => spendingRoom(data, today, horizon, state.includeExpectedIncome), [data, today, horizon, state.includeExpectedIncome])
  const pattern = useMemo(() => incomePattern(data.transactions, today), [data.transactions, today])

  const setLimit = (c: Category, v: number | undefined) => {
    const limits = { ...budget.categoryLimits }
    if (v === undefined) delete limits[c]
    else limits[c] = v
    setBudget({ ...budget, categoryLimits: limits })
  }
  const setClass = (c: Category, v: Classification) => setBudget({ ...budget, classification: { ...budget.classification, [c]: v } })
  const overCommitted = status.overallLimit !== undefined && status.categoryLimitSum > status.overallLimit

  return (
    <div className="stack">
      <div>
        <h1>Budget</h1>
        <p className="muted small">Month of {formatDay(status.from)} to {formatDay(status.to)}. Spending counts only what has already been recorded.</p>
      </div>

      {(pattern.kind === 'none' || pattern.kind === 'single' || pattern.kind === 'irregular' || profile.expectedIncome.length === 0) && (
        <div className="banner info" role="note">
          <strong>About your income.</strong>{' '}
          {pattern.kind === 'none' && 'No income is recorded yet, so PocketPilot cannot tell how steady it is. '}
          {pattern.kind === 'single' && 'Only one income payment is recorded, which is too few to see a pattern. '}
          {pattern.kind === 'irregular' && `Your recorded income arrives at uneven intervals (${pattern.count} payments), so forecasts that rely on it are less certain. `}
          {profile.expectedIncome.length === 0 && 'No expected income is entered, so forecasts count only money you already have. '}
          You can switch expected income off in any forecast.
        </div>
      )}

      <div className="card">
        <div className="row between">
          <div>
            <h2>How much is really free to spend?</h2>
            <p className="muted small">Your balance is not all spending money. Over the next 30 days (to {formatDay(horizon)}), obligations and essentials come first. This is an estimate based on your recent pace.</p>
          </div>
          <label className="row" style={{ fontWeight: 500 }}>
            <input type="checkbox" checked={state.includeExpectedIncome} onChange={(e) => dispatch({ type: 'setIncludeIncome', value: e.target.checked })} />
            Count expected income
          </label>
        </div>
        <table className="ledger">
          <tbody>
            <tr><td>Balance now (recorded)</td><td><Money n={room.balance} /></td></tr>
            <tr><td>+ Expected income {state.includeExpectedIncome ? '(not yet received)' : '(switched off)'}</td><td><Money n={room.expectedIncome} /></td></tr>
            <tr><td>− Planned expenses</td><td><Money n={-room.plannedExpenses} /></td></tr>
            <tr><td>− Everyday essentials at your recent pace</td><td><Money n={-room.essentialSpend} /></td></tr>
            {room.plannedSavings > 0 && <tr><td>− Planned savings</td><td><Money n={-room.plannedSavings} /></td></tr>}
            <tr className="total"><td><strong>Room for flexible spending</strong></td><td><strong className={room.room < 0 ? 'neg' : ''}>{formatNaira(room.room)}</strong></td></tr>
          </tbody>
        </table>
        <p className="small" style={{ marginTop: 8 }}>
          {room.room < 0
            ? <><span className="pill bad">Over-committed</span> Known obligations and essentials already exceed what you have by {formatNaira(-room.room)}. Flexible spending would add to this.</>
            : <>At your recent pace you would spend about {formatNaira(room.flexibleSpendAtCurrentPace)} on flexible things in this period, against {formatNaira(room.room)} of room{room.flexibleSpendAtCurrentPace > room.room ? ', so something would have to give.' : '.'}</>}
        </p>
      </div>

      <div className="card">
        <div className="row between">
          <h2>Spending against your budget</h2>
          <span className={`pill ${STATE_PILL[status.overallState].cls}`}>{status.overallLimit === undefined ? 'No overall limit' : STATE_PILL[status.overallState].text}</span>
        </div>
        <div className="form-grid" style={{ margin: '10px 0' }}>
          <label>
            Overall monthly limit (₦)
            <AmountField label="Overall monthly limit" value={budget.overallLimit} onCommit={(v) => setBudget({ ...budget, overallLimit: v })} />
          </label>
          <div>
            <div className="small muted">Spent so far this month</div>
            <strong className="num">{formatNaira(status.spentTotal)}</strong>
            {status.overallUtilisation !== null && <span className="small muted"> · {formatPct(status.overallUtilisation)} of limit</span>}
            {status.overallUtilisation !== null && <ProgressBar value={status.overallUtilisation} state={status.overallState} />}
          </div>
        </div>
        {overCommitted && (
          <div className="banner" role="alert" style={{ marginBottom: 10 }}>
            Your category limits add up to {formatNaira(status.categoryLimitSum)}, which is more than your overall limit of {formatNaira(status.overallLimit ?? 0)}.
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="ledger wide">
            <thead>
              <tr><th>Category</th><th>Type</th><th>Monthly limit (₦)</th><th>Spent</th><th>Status</th></tr>
            </thead>
            <tbody>
              {status.lines.map((l) => (
                <tr key={l.category}>
                  <td>{l.category}</td>
                  <td>
                    <select aria-label={`${l.category} type`} value={l.classification} onChange={(e) => setClass(l.category, e.target.value as Classification)} style={{ minHeight: 34, padding: '4px 8px', width: 112 }}>
                      <option value="essential">Essential</option>
                      <option value="flexible">Flexible</option>
                    </select>
                  </td>
                  <td><AmountField label={`${l.category} monthly limit`} value={l.limit} onCommit={(v) => setLimit(l.category, v)} /></td>
                  <td className="num">
                    {formatNaira(l.spent)}
                    {l.utilisation !== null && <ProgressBar value={l.utilisation} state={l.state} />}
                  </td>
                  <td><span className={`pill ${STATE_PILL[l.state].cls}`}>{STATE_PILL[l.state].text}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          “Essential” spending is protected: PocketPilot warns before suggesting cuts there. {TRANSFER_CATEGORY} is not spending, so it has no limit.
        </p>
      </div>

      <div className="card">
        <h2>Savings contribution (optional)</h2>
        <p className="muted small" style={{ margin: '4px 0 10px' }}>If you want to set money aside regularly, forecasts will take it out of your balance every 7 days. Leave blank for none.</p>
        <label style={{ maxWidth: 260 }}>
          Per week (₦)
          <AmountField label="Planned savings per week" value={budget.plannedSavingsPerWeek} onCommit={(v) => setBudget({ ...budget, plannedSavingsPerWeek: v })} />
        </label>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Expected income</h2>
          <p className="muted small" style={{ margin: '4px 0 8px' }}>Money you expect but have not received. It is never treated as income already received.</p>
          <EventEditor kind="income" items={profile.expectedIncome} today={today} onChange={(items) => dispatch({ type: 'setExpectedIncome', expectedIncome: items })} />
        </div>
        <div className="card">
          <h2>Planned expenses</h2>
          <p className="muted small" style={{ margin: '4px 0 8px' }}>Known upcoming bills and purchases, counted on top of your everyday spending.</p>
          <EventEditor
            kind="expense"
            items={profile.plannedExpenses}
            today={today}
            onChange={(items) => dispatch({ type: 'setPlanned', plannedExpenses: items.map((i) => ({ id: i.id, label: i.label, date: i.date, amount: i.amount, category: i.category ?? 'Other' })) })}
          />
        </div>
      </div>

      <div className="card">
        <h2>Your priorities</h2>
        <p className="muted small" style={{ margin: '4px 0 10px' }}>Choose any, or none. These shape the guidance you see. A savings goal is never required.</p>
        <Priorities />
        <PriorityTips />
      </div>
    </div>
  )
}

/** Plain pointers tied to the chosen priorities. Not AI: fixed text from the engine's own numbers. */
function PriorityTips() {
  const { state } = useStore()
  const p = state.data!.profile.priorities
  const tips: string[] = []
  if (p.includes('understand')) tips.push('Overview and Transactions show where your money goes; check the category chart.')
  if (p.includes('not-run-out')) tips.push('Watch the “Room for flexible spending” figure above and the balance forecast.')
  if (p.includes('budget')) tips.push('Set category limits in the table above; PocketPilot flags any at 80% or over.')
  if (p.includes('habits')) tips.push('Look at your flexible categories first: they are the easiest to adjust without hurting essentials.')
  if (p.includes('save-consistently') || p.includes('emergency-fund')) tips.push('Set a small weekly savings contribution above and see its effect on the forecast.')
  if (p.includes('specific-goal')) tips.push('You can add a goal in Planning and check whether it is feasible.')
  if (p.includes('control')) tips.push('Review this page and the forecast weekly; small regular check-ins matter most.')
  if (tips.length === 0) return null
  return (
    <ul className="small" style={{ paddingLeft: 18, marginTop: 12 }}>
      {tips.map((t) => <li key={t}>{t}</li>)}
    </ul>
  )
}

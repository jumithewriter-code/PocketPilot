import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { isValidISO } from '../engine/dates'
import { goalFeasibility, type GoalStatus } from '../engine/finance'
import { formatDay, formatNaira } from '../engine/format'
import { goalAlternatives, goalProgressSeries } from '../engine/scenario'
import type { Goal, ScenarioChanges } from '../engine/types'
import { newId, useStore } from '../store'
import { ANIMATE_CHARTS, COLORS, Money, ProgressBar } from '../ui'

const STATUS: Record<GoalStatus, { cls: string; text: string }> = {
  achieved: { cls: '', text: 'Already reached' },
  'on-track': { cls: '', text: 'Looks feasible under these assumptions' },
  short: { cls: 'bad', text: 'Falls short of the target' },
  'at-risk': { cls: 'warn', text: 'Reaches the target, but the balance dips below ₦0 on the way' },
  'past-due': { cls: 'bad', text: 'Target date has passed' },
}

export function GoalPanel({ changes, empty }: { changes: ScenarioChanges; empty: boolean }) {
  const { state, dispatch, today } = useStore()
  const data = state.data!
  const goal = data.goal
  const [editing, setEditing] = useState(false)

  const baseOpts = { asOf: today, includeExpectedIncome: state.includeExpectedIncome }
  const adjOpts = { ...baseOpts, changes }
  const calc = useMemo(() => {
    if (!goal) return null
    return {
      base: goalFeasibility(data, goal, baseOpts),
      adj: goalFeasibility(data, goal, adjOpts),
      alt: goalAlternatives(data, goal, adjOpts),
      baseSeries: goalProgressSeries(data, goal, baseOpts),
      adjSeries: goalProgressSeries(data, goal, adjOpts),
    }
  }, [data, goal, state.includeExpectedIncome, changes]) // eslint-disable-line react-hooks/exhaustive-deps

  if (editing || !goal) {
    return (
      <div className="card">
        <h2>5. A specific goal (optional)</h2>
        {!editing ? (
          <>
            <p className="muted small" style={{ margin: '4px 0 10px' }}>You do not need a goal to use PocketPilot. If you have one, add it and see whether it looks feasible.</p>
            <button className="btn ghost" onClick={() => setEditing(true)}>+ Add a goal</button>
          </>
        ) : (
          <GoalForm today={today} initial={goal} onSave={(g) => { dispatch({ type: 'setGoal', goal: g }); setEditing(false) }} onCancel={() => setEditing(false)} />
        )}
      </div>
    )
  }

  const { base, adj, alt, baseSeries, adjSeries } = calc!
  const pct = goal.targetAmount > 0 ? goal.savedAmount / goal.targetAmount : 0
  const chart = baseSeries.map((p, i) => ({ label: formatDay(p.date), base: Math.round(p.progress), adjusted: Math.round(adjSeries[i].progress), target: goal.targetAmount }))
  const short = adj.status === 'short' || adj.status === 'at-risk' || adj.status === 'past-due'

  return (
    <div className="card">
      <div className="row between">
        <h2>5. Goal: {goal.description}</h2>
        <div className="row">
          <button className="btn ghost sm" onClick={() => setEditing(true)}>Edit goal</button>
          <button className="btn danger sm" onClick={() => dispatch({ type: 'setGoal', goal: undefined })}>Remove goal</button>
        </div>
      </div>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>
        {formatNaira(goal.savedAmount)} saved of {formatNaira(goal.targetAmount)}, by {formatDay(goal.targetDate)}
        {goal.priority ? ` · ${goal.priority} priority` : ''}
      </p>
      <ProgressBar value={pct} />

      <div className="scroll-x" style={{ marginTop: 12 }}><table className="ledger">
        <thead><tr><th></th><th style={{ textAlign: 'right' }}>Current plan</th><th style={{ textAlign: 'right' }}>Adjusted</th></tr></thead>
        <tbody>
          <tr><td>Still to save</td><td className="num" style={{ textAlign: 'right' }}>{formatNaira(base.remaining)}</td><td className="num" style={{ textAlign: 'right' }}>{formatNaira(adj.remaining)}</td></tr>
          <tr><td>Time left</td><td className="num" style={{ textAlign: 'right' }}>{Math.max(0, base.daysLeft)} days</td><td className="num" style={{ textAlign: 'right' }}>{Math.max(0, adj.daysLeft)} days</td></tr>
          <tr><td>Needed per week to hit it</td><td className="num" style={{ textAlign: 'right' }}>{formatNaira(base.requiredPerWeek)}</td><td className="num" style={{ textAlign: 'right' }}>{formatNaira(adj.requiredPerWeek)}</td></tr>
          <tr><td>Projected savings by the date</td><td className="num" style={{ textAlign: 'right' }}>{formatNaira(base.projectedSavings)}</td><td className="num" style={{ textAlign: 'right' }}><strong>{formatNaira(adj.projectedSavings)}</strong></td></tr>
          <tr><td>Versus target (minus = short)</td><td style={{ textAlign: 'right' }}><Money n={-base.gap} signed /></td><td style={{ textAlign: 'right' }}><strong><Money n={-adj.gap} signed /></strong></td></tr>
          <tr><td>Verdict</td><td style={{ textAlign: 'right' }}><span className={`pill ${STATUS[base.status].cls}`}>{STATUS[base.status].text}</span></td><td style={{ textAlign: 'right' }}><span className={`pill ${STATUS[adj.status].cls}`}>{STATUS[adj.status].text}</span></td></tr>
        </tbody>
      </table></div>
      <p className="small muted" style={{ marginTop: 6 }}>
        “Projected savings” = what you have saved + money you set aside + wallet money left unspent by the date. It is an estimate from your recent pace, not a promise.
        {empty ? ' Change something above to see the adjusted column move.' : ''}
      </p>

      <div className="chart-box" style={{ height: 230, marginTop: 10 }} role="img" aria-label={`Projected progress towards ${goal.description}. Target ${formatNaira(goal.targetAmount)}. By ${formatDay(goal.targetDate)} the current plan reaches ${formatNaira(base.projectedSavings)} and the adjusted scenario ${formatNaira(adj.projectedSavings)}.`}>
        <ResponsiveContainer>
          <LineChart data={chart} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e3dbc7" vertical={false} />
            <XAxis dataKey="label" interval={Math.max(0, Math.floor(chart.length / 6) - 1)} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={42} domain={[0, (max: number) => Math.max(max, goal.targetAmount) * 1.05]} />
            <Tooltip formatter={(v) => formatNaira(Number(v))} />
            <Legend verticalAlign="top" height={28} />
            <ReferenceLine y={goal.targetAmount} stroke={COLORS.goal} strokeDasharray="5 4" label={{ value: 'Target', fontSize: 11, fill: COLORS.goal, position: 'insideTopLeft' }} />
            <Line isAnimationActive={ANIMATE_CHARTS} name="Current plan" type="monotone" dataKey="base" stroke={COLORS.base} strokeWidth={2.2} strokeDasharray="6 4" dot={false} />
            <Line isAnimationActive={ANIMATE_CHARTS} name="Adjusted scenario" type="monotone" dataKey="adjusted" stroke={COLORS.adjusted} strokeWidth={2.8} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {short && (
        <div className="suggest review" style={{ marginTop: 12 }}>
          <strong>If this falls short, you could consider (nothing is changed for you):</strong>
          <ul className="small" style={{ paddingLeft: 18, margin: '6px 0 0' }}>
            {adj.status !== 'past-due' && alt.flexibleCutPctNeeded !== null && (
              <li>Trimming flexible spending by about {Math.ceil(alt.flexibleCutPctNeeded)}% until {formatDay(goal.targetDate)} would close the gap (use the sliders to test it).</li>
            )}
            {adj.status !== 'past-due' && alt.flexibleCutPctNeeded === null && adj.gap > 0 && (
              <li>Flexible spending alone cannot close the {formatNaira(adj.gap)} gap, so the date or the target would also need to change.</li>
            )}
            {alt.laterDate && <li>Moving the date to {formatDay(alt.laterDate)} would let the target be met under these assumptions.</li>}
            {!alt.laterDate && adj.status !== 'at-risk' && <li>No date within a year makes this work with the income you have entered.</li>}
            {adj.gap > 0 && alt.reachableTarget > goal.savedAmount && <li>Lowering the target to about {formatNaira(Math.floor(alt.reachableTarget / 100) * 100)} would fit what is projected.</li>}
            {adj.status === 'at-risk' && <li>Your balance would drop below ₦0 along the way, so check the balance chart before relying on this.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

function GoalForm({ today, initial, onSave, onCancel }: { today: string; initial?: Goal; onSave: (g: Goal) => void; onCancel: () => void }) {
  const [description, setDescription] = useState(initial?.description ?? '')
  const [target, setTarget] = useState(initial ? String(initial.targetAmount) : '')
  const [saved, setSaved] = useState(initial ? String(initial.savedAmount) : '0')
  const [date, setDate] = useState(initial?.targetDate ?? '')
  const [priority, setPriority] = useState<Goal['priority'] | ''>(initial?.priority ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const t = Number(target)
    const s = saved.trim() === '' ? 0 : Number(saved)
    if (!description.trim()) errs.description = 'Say what you are saving for.'
    if (!target.trim() || !Number.isFinite(t) || t <= 0) errs.target = 'Enter a target above ₦0.'
    if (!Number.isFinite(s) || s < 0) errs.saved = 'Enter 0 or more.'
    if (!isValidISO(date)) errs.date = 'Choose a valid date.'
    else if (date <= today) errs.date = 'Choose a date after today.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    onSave({ id: initial?.id ?? newId('goal'), description: description.trim(), targetAmount: t, savedAmount: s, targetDate: date, priority: priority || undefined })
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Goal">
      <div className="form-grid" style={{ marginTop: 8 }}>
        <label>What for?<input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={60} placeholder="e.g. Laptop" aria-invalid={!!errors.description} />{errors.description && <span className="field-err" role="alert">{errors.description}</span>}</label>
        <label>Target (₦)<input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} aria-invalid={!!errors.target} />{errors.target && <span className="field-err" role="alert">{errors.target}</span>}</label>
        <label>Already saved (₦)<input inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} aria-invalid={!!errors.saved} />{errors.saved && <span className="field-err" role="alert">{errors.saved}</span>}</label>
        <label>Want it by<input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} />{errors.date && <span className="field-err" role="alert">{errors.date}</span>}</label>
        <label>Priority (optional)
          <select value={priority} onChange={(e) => setPriority(e.target.value as Goal['priority'] | '')}>
            <option value="">Not set</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </label>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" type="submit">Save goal</button>
        <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

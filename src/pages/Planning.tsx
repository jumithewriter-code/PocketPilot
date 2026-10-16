import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { GoalPanel } from '../components/GoalPanel'
import { addDays, isValidISO } from '../engine/dates'
import { compareScenarios } from '../engine/finance'
import { formatDay, formatNaira } from '../engine/format'
import { applyScenario, isEmptyScenario } from '../engine/scenario'
import { CATEGORIES, TRANSFER_CATEGORY, type Category, type PlannedExpense, type ScenarioChanges } from '../engine/types'
import { useScenario, useStore } from '../store'
import { ANIMATE_CHARTS, COLORS, Money } from '../ui'

type Horizon = '14' | '30' | '60' | 'goal'

export function Planning() {
  const { state, dispatch, today } = useStore()
  const { changes, setChanges, reset } = useScenario()
  const data = state.data!
  const { profile, budget, goal } = data
  const [horizon, setHorizon] = useState<Horizon>('30')
  const [showEssentials, setShowEssentials] = useState(false)
  const [notice, setNotice] = useState('')
  const [accept, setAccept] = useState<{ categories: Category[]; planned: string[]; savings: boolean } | null>(null)

  const goalActive = goal !== undefined && goal.targetDate > today
  const endDate = horizon === 'goal' && goalActive ? goal!.targetDate : addDays(today, horizon === 'goal' ? 30 : Number(horizon))
  const base = { asOf: today, endDate, includeExpectedIncome: state.includeExpectedIncome }
  const cmp = useMemo(() => compareScenarios(data, base, changes), [data, base.endDate, base.includeExpectedIncome, changes]) // eslint-disable-line react-hooks/exhaustive-deps
  const days = cmp.base.points.length - 1
  const empty = isEmptyScenario(changes)
  const rr = cmp.base.runRate

  const upcoming = profile.plannedExpenses.filter((p) => p.date > today).sort((a, b) => a.date.localeCompare(b.date))
  const flexible = CATEGORIES.filter((c) => c !== TRANSFER_CATEGORY && budget.classification[c] === 'flexible' && (rr.perDay[c] ?? 0) > 0)
  const essential = CATEGORIES.filter((c) => c !== TRANSFER_CATEGORY && budget.classification[c] === 'essential' && (rr.perDay[c] ?? 0) > 0)

  const update = (patch: Partial<ScenarioChanges>) => {
    setNotice('')
    setAccept(null)
    setChanges({ ...changes, ...patch })
  }
  const setCut = (c: Category, v: number) => {
    const cuts = { ...changes.categoryCutPct }
    if (v > 0) cuts[c] = v
    else delete cuts[c]
    update({ categoryCutPct: cuts })
  }
  const setPlanned = (p: PlannedExpense, patch: { removed?: boolean; amount?: number | undefined; date?: string | undefined }) => {
    const cur = { ...(changes.plannedChanges[p.id] ?? {}), ...patch }
    if (!cur.removed) delete cur.removed
    if (cur.amount === undefined || cur.amount === p.amount) delete cur.amount
    if (cur.date === undefined || cur.date === p.date) delete cur.date
    const all = { ...changes.plannedChanges }
    if (Object.keys(cur).length === 0) delete all[p.id]
    else all[p.id] = cur
    update({ plannedChanges: all })
  }

  // Everything the user could accept, described in plain words.
  const accepted = accept ?? { categories: [], planned: [], savings: false }
  const cutCats = (Object.keys(changes.categoryCutPct) as Category[]).filter((c) => (changes.categoryCutPct[c] ?? 0) > 0)
  const plannedEdits = Object.keys(changes.plannedChanges)
  const savingsOn = changes.extraSavingsPerWeek > 0

  function doAccept() {
    if (!accept) return
    const out = applyScenario(data, changes, accept, today)
    dispatch({ type: 'setBudget', budget: out.budget })
    dispatch({ type: 'setPlanned', plannedExpenses: out.plannedExpenses })
    const n = accept.categories.length + accept.planned.length + (accept.savings ? 1 : 0)
    reset()
    setAccept(null)
    setNotice(`Added ${n} change${n === 1 ? '' : 's'} to your plan. The simulator has been reset to match.`)
  }

  const chart = cmp.base.points.map((p, i) => ({ label: formatDay(p.date), base: Math.round(p.balance), adjusted: Math.round(cmp.adjusted.points[i].balance) }))

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>Planning and scenarios</h1>
          <p className="muted small">Try changes without touching your real plan. Nothing is saved until you accept it.</p>
        </div>
        <div className="row">
          <label style={{ minWidth: 160 }}>
            Look ahead
            <select value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)}>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              {goalActive && <option value="goal">Until goal date</option>}
            </select>
          </label>
          <label className="row" style={{ fontWeight: 500, alignSelf: 'flex-end', minHeight: 40 }}>
            <input type="checkbox" checked={state.includeExpectedIncome} onChange={(e) => dispatch({ type: 'setIncludeIncome', value: e.target.checked })} />
            Count expected income
          </label>
        </div>
      </div>
      {notice && <div className="banner info" role="status">{notice}</div>}

      <div className="grid cols-2">
        <div className="card">
          <div className="row between">
            <h2>1. Adjust your spending</h2>
            <button className="btn ghost sm" onClick={() => { reset(); setAccept(null); setNotice('') }} disabled={empty}>Reset simulation</button>
          </div>
          <p className="muted small" style={{ margin: '4px 0 10px' }}>Everyday spending is based on your last {rr.basisDays} days. Slide to cut a flexible category.</p>
          {!rr.sufficient && <div className="banner" style={{ marginBottom: 10 }}>Only {rr.basisDays} day(s) of history: these paces are rough.</div>}
          {flexible.length === 0 && <p className="small muted">No flexible spending found in your history.</p>}
          {flexible.map((c) => (
            <CutSlider key={c} category={c} perDay={rr.perDay[c] ?? 0} days={days} value={changes.categoryCutPct[c] ?? 0} onChange={(v) => setCut(c, v)} />
          ))}
          {essential.length > 0 && (
            <details open={showEssentials} onToggle={(e) => setShowEssentials((e.target as HTMLDetailsElement).open)} style={{ marginTop: 10 }}>
              <summary>Essentials (protected). Only open to test a tight month</summary>
              <p className="small muted" style={{ margin: '6px 0' }}>Cutting food, transport, data or utilities has real consequences: skipped meals, missed lectures, no connectivity. Treat these as last resorts.</p>
              {essential.map((c) => (
                <CutSlider key={c} category={c} perDay={rr.perDay[c] ?? 0} days={days} value={changes.categoryCutPct[c] ?? 0} onChange={(v) => setCut(c, v)} />
              ))}
            </details>
          )}
        </div>

        <div className="card">
          <h2>2. Change planned items</h2>
          <p className="muted small" style={{ margin: '4px 0 10px' }}>Edit amounts, move dates or drop a planned expense to see the effect.</p>
          {upcoming.length === 0 && <p className="small muted">No planned expenses. Add some in Budget.</p>}
          {upcoming.map((p) => (
            <PlannedRow key={p.id} p={p} today={today} edit={changes.plannedChanges[p.id]} onChange={(patch) => setPlanned(p, patch)} />
          ))}
          <h2 style={{ marginTop: 16 }}>3. Set money aside</h2>
          <label style={{ maxWidth: 260, marginTop: 8 }}>
            Extra savings per week (₦)
            <SavingsField value={changes.extraSavingsPerWeek} onChange={(v) => update({ extraSavingsPerWeek: v })} />
          </label>
          {(budget.plannedSavingsPerWeek ?? 0) > 0 && <p className="small muted">On top of the {formatNaira(budget.plannedSavingsPerWeek ?? 0)} per week already in your budget.</p>}
        </div>
      </div>

      <div className="card">
        <h2>Your balance: current plan vs adjusted</h2>
        <p className="muted small">Projections, not recorded money. {state.includeExpectedIncome ? 'Includes expected income on the dates you entered.' : 'Excludes expected income.'}</p>
        {cmp.adjusted.essentialCuts.length > 0 && (
          <div className="banner" role="alert" style={{ margin: '8px 0' }}>
            <strong>You are testing cuts to essentials</strong> ({cmp.adjusted.essentialCuts.join(', ')}). The numbers work, but think about what you would actually go without.
          </div>
        )}
        <div className="chart-box" role="img" aria-label={`Projected balance, current plan versus adjusted scenario. On ${formatDay(endDate)} the current plan ends at ${formatNaira(cmp.base.endBalance)} and the adjusted scenario at ${formatNaira(cmp.adjusted.endBalance)}.`}>
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#e3dbc7" vertical={false} />
              <XAxis dataKey="label" interval={Math.max(0, Math.floor(chart.length / 6) - 1)} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={42} />
              <Tooltip formatter={(v) => formatNaira(Number(v))} />
              <Legend verticalAlign="top" height={28} />
              <ReferenceLine y={0} stroke="#a8402f" strokeDasharray="4 3" />
              <Line isAnimationActive={ANIMATE_CHARTS} name="Current plan" type="monotone" dataKey="base" stroke={COLORS.base} strokeWidth={2.2} strokeDasharray="6 4" dot={false} />
              <Line isAnimationActive={ANIMATE_CHARTS} name="Adjusted scenario" type="monotone" dataKey="adjusted" stroke={COLORS.adjusted} strokeWidth={2.8} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="scroll-x" style={{ marginTop: 10 }}><table className="ledger">
          <thead><tr><th></th><th style={{ textAlign: 'right' }}>Current plan</th><th style={{ textAlign: 'right' }}>Adjusted</th><th>Change</th></tr></thead>
          <tbody>
            <tr><td>Balance on {formatDay(endDate)}</td><td className="num" style={{ textAlign: 'right' }}>{formatNaira(cmp.base.endBalance)}</td><td className="num" style={{ textAlign: 'right' }}><strong>{formatNaira(cmp.adjusted.endBalance)}</strong></td><td><Money n={cmp.endBalanceDelta} signed /></td></tr>
            <tr><td>Lowest balance</td><td className="num" style={{ textAlign: 'right' }}>{formatNaira(cmp.base.lowestBalance)}</td><td className="num" style={{ textAlign: 'right' }}><strong>{formatNaira(cmp.adjusted.lowestBalance)}</strong></td><td><Money n={cmp.lowestBalanceDelta} signed /></td></tr>
            <tr><td>Runs short?</td><td style={{ textAlign: 'right' }}>{cmp.base.shortfallDate ? <span className="pill bad">from {formatDay(cmp.base.shortfallDate)}</span> : <span className="pill">No</span>}</td><td style={{ textAlign: 'right' }}>{cmp.adjusted.shortfallDate ? <span className="pill bad">from {formatDay(cmp.adjusted.shortfallDate)}</span> : <span className="pill">No</span>}</td><td className="small">{cmp.shortfallResolved ? 'Shortfall avoided' : cmp.shortfallIntroduced ? 'New shortfall' : ''}</td></tr>
          </tbody>
        </table></div>
        {empty && <p className="small muted" style={{ marginTop: 8 }}>The two lines match because nothing has been changed yet. Move a slider above.</p>}
        <details style={{ marginTop: 10 }}>
          <summary>Assumptions behind these numbers</summary>
          <ul className="small" style={{ paddingLeft: 18 }}>{cmp.adjusted.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </details>
      </div>

      <div className="card">
        <h2>4. Keep what you like</h2>
        {empty ? (
          <p className="small muted">Make a change above, then choose which parts to add to your real plan.</p>
        ) : accept === null ? (
          <div className="row">
            <button className="btn" onClick={() => setAccept({ categories: cutCats, planned: plannedEdits, savings: savingsOn })}>Review changes to accept…</button>
            <span className="small muted">Your plan stays as it is until you confirm.</span>
          </div>
        ) : (
          <div>
            <p className="small muted" style={{ marginBottom: 8 }}>Tick what to add to your plan.</p>
            {cutCats.map((c) => (
              <label key={c} className="prio" style={{ marginBottom: 6 }}>
                <input type="checkbox" checked={accepted.categories.includes(c)} onChange={(e) => setAccept({ ...accepted, categories: e.target.checked ? [...accepted.categories, c] : accepted.categories.filter((x) => x !== c) })} />
                <span>Set the {c} budget about {changes.categoryCutPct[c]}% below your recent pace (≈ {formatNaira(Math.round(((rr.perDay[c] ?? 0) * 30 * (1 - (changes.categoryCutPct[c] ?? 0) / 100)) / 50) * 50)} a month)</span>
              </label>
            ))}
            {plannedEdits.map((id) => {
              const p = profile.plannedExpenses.find((x) => x.id === id)
              if (!p) return null
              const e = changes.plannedChanges[id]
              return (
                <label key={id} className="prio" style={{ marginBottom: 6 }}>
                  <input type="checkbox" checked={accepted.planned.includes(id)} onChange={(ev) => setAccept({ ...accepted, planned: ev.target.checked ? [...accepted.planned, id] : accepted.planned.filter((x) => x !== id) })} />
                  <span>{e.removed ? `Remove “${p.label}”` : `Change “${p.label}”${e.amount !== undefined ? ` to ${formatNaira(e.amount)}` : ''}${e.date ? ` on ${formatDay(e.date)}` : ''}`}</span>
                </label>
              )
            })}
            {savingsOn && (
              <label className="prio" style={{ marginBottom: 6 }}>
                <input type="checkbox" checked={accepted.savings} onChange={(e) => setAccept({ ...accepted, savings: e.target.checked })} />
                <span>Save an extra {formatNaira(changes.extraSavingsPerWeek)} every week</span>
              </label>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={doAccept} disabled={accepted.categories.length + accepted.planned.length + (accepted.savings ? 1 : 0) === 0}>Add selected to my plan</button>
              <button className="btn ghost" onClick={() => setAccept(null)}>Not now</button>
            </div>
          </div>
        )}
      </div>

      <GoalPanel changes={changes} empty={empty} />
    </div>
  )
}

function CutSlider({ category, perDay, days, value, onChange }: { category: Category; perDay: number; days: number; value: number; onChange: (v: number) => void }) {
  const monthly = perDay * 30
  const saved = perDay * days * (value / 100)
  return (
    <div style={{ margin: '10px 0' }}>
      <div className="row between small">
        <strong>{category}</strong>
        <span className="muted">≈ {formatNaira(monthly)} a month now</span>
      </div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={`Cut ${category} by percent`} style={{ padding: 0, minHeight: 36, accentColor: '#33503a' }} />
        <span className="num small" style={{ minWidth: 48, textAlign: 'right' }}>{value > 0 ? `−${value}%` : '0%'}</span>
      </div>
      <div className="small muted">{value > 0 ? `Saves about ${formatNaira(saved)} over these ${days} days.` : 'No change.'}</div>
    </div>
  )
}

function PlannedRow({ p, today, edit, onChange }: { p: PlannedExpense; today: string; edit?: { removed?: boolean; amount?: number; date?: string }; onChange: (patch: { removed?: boolean; amount?: number; date?: string }) => void }) {
  const [amt, setAmt] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const removed = edit?.removed === true
  function commitAmount() {
    if (amt === null) return
    const n = Number(amt)
    if (!amt.trim() || !Number.isFinite(n) || n < 0) {
      setErr('Enter a number, 0 or more')
      return
    }
    setErr('')
    onChange({ amount: n })
    setAmt(null)
  }
  return (
    <div className="tx" style={{ opacity: removed ? 0.55 : 1 }}>
      <div>
        <strong>{p.label}</strong> <span className="small muted">· {p.category}</span>
      </div>
      <label className="row small" style={{ fontWeight: 500 }}>
        <input type="checkbox" checked={removed} onChange={(e) => onChange({ removed: e.target.checked })} /> Skip it
      </label>
      <div className="meta">
        <label className="small">
          Amount (₦)
          <input inputMode="decimal" style={{ width: 120 }} value={amt ?? String(edit?.amount ?? p.amount)} disabled={removed}
            onChange={(e) => setAmt(e.target.value)} onBlur={commitAmount} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          {err && <span className="field-err" role="alert">{err}</span>}
        </label>
        <label className="small">
          Date
          <input type="date" min={addDays(today, 1)} style={{ width: 150 }} value={edit?.date ?? p.date} disabled={removed}
            onChange={(e) => isValidISO(e.target.value) && e.target.value > today && onChange({ date: e.target.value })} />
        </label>
        {(edit?.amount !== undefined || edit?.date !== undefined) && <span className="pill warn">changed from {formatNaira(p.amount)} on {formatDay(p.date)}</span>}
      </div>
    </div>
  )
}

function SavingsField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [err, setErr] = useState('')
  function commit() {
    if (draft === null) return
    const t = draft.trim()
    const n = t === '' ? 0 : Number(t)
    if (!Number.isFinite(n) || n < 0) return setErr('Enter a number, 0 or more')
    setErr('')
    onChange(n)
    setDraft(null)
  }
  return (
    <span>
      <input inputMode="decimal" aria-label="Extra savings per week" value={draft ?? (value ? String(value) : '')} placeholder="0" aria-invalid={!!err}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      {err && <span className="field-err" role="alert">{err}</span>}
    </span>
  )
}

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TxList } from '../components/TxList'
import { addDays, isValidISO, monthRange } from '../engine/dates'
import { categoryTotals, projectBalance, recordedBalance, summarise, upcomingEvents } from '../engine/finance'
import { formatDay, formatDayLong, formatNaira, formatPct } from '../engine/format'
import { buildInsights } from '../engine/insights'
import { useStore } from '../store'
import { ANIMATE_CHARTS, CATEGORY_COLORS, Empty, Money, ProgressBar, Stat } from '../ui'

type Period = 'month' | '7' | '30' | 'custom'

export function Overview({ go }: { go: (page: string) => void }) {
  const { state, today } = useStore()
  const data = state.data!
  const [period, setPeriod] = useState<Period>('30')
  const [customFrom, setCustomFrom] = useState(addDays(today, -29))
  const [customTo, setCustomTo] = useState(today)
  const customError =
    period !== 'custom' ? '' : !isValidISO(customFrom) || !isValidISO(customTo) ? 'Choose both dates.' : customFrom > customTo ? 'The start date must be on or before the end date.' : ''
  const last30 = { from: addDays(today, -29), to: today }
  // While the custom dates are invalid, keep showing the last 30 days and say so.
  const range =
    period === 'month' ? monthRange(today) : period === '7' ? { from: addDays(today, -6), to: today } : period === 'custom' && !customError ? { from: customFrom, to: customTo } : last30
  const to = range.to > today ? today : range.to

  const balance = recordedBalance(data.profile, data.transactions, today)
  const sum = useMemo(() => summarise(data.transactions, range.from, to), [data.transactions, range.from, to])
  const cats = useMemo(() => categoryTotals(data.transactions, range.from, to), [data.transactions, range.from, to])
  const upcoming = useMemo(() => upcomingEvents(data.profile, today, 30), [data.profile, today])
  const insights = useMemo(() => buildInsights(data, today, state.includeExpectedIncome), [data, today, state.includeExpectedIncome])
  const proj = useMemo(
    () => projectBalance(data, { asOf: today, endDate: addDays(today, 30), includeExpectedIncome: state.includeExpectedIncome }),
    [data, today, state.includeExpectedIncome],
  )
  const recent = useMemo(() => [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 6), [data.transactions])
  const expectedIncome = upcoming.filter((u) => u.kind === 'income')
  const planned = upcoming.filter((u) => u.kind === 'expense')
  const empty = data.transactions.length === 0

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>Hi {data.profile.displayName.split(' ')[0]}</h1>
          <p className="muted small">Your recorded position as of {formatDayLong(today)}.</p>
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label style={{ minWidth: 150 }}>
            Period
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="30">Last 30 days</option>
              <option value="7">Last 7 days</option>
              <option value="month">This month</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          {period === 'custom' && (
            <>
              <label>
                From
                <input type="date" value={customFrom} max={today} onChange={(e) => setCustomFrom(e.target.value)} aria-invalid={!!customError} />
              </label>
              <label>
                To
                <input type="date" value={customTo} max={today} onChange={(e) => setCustomTo(e.target.value)} aria-invalid={!!customError} />
              </label>
            </>
          )}
        </div>
      </div>
      <p className="small muted" style={{ marginTop: -4 }} aria-live="polite">
        {customError
          ? <span className="field-err" role="alert">{customError} Showing the last 30 days until it is fixed.</span>
          : <>Showing {formatDay(range.from)} to {formatDay(to)}.</>}
      </p>

      <div className="grid stats">
        <Stat label="Recorded balance" value={formatNaira(balance)} hint="Money you have now" tone={balance < 0 ? 'neg' : undefined} />
        <Stat label="Money in" value={formatNaira(sum.income)} hint="Received in this period" />
        <Stat label="Spent" value={formatNaira(sum.expenses)} hint={sum.transfers ? `plus ${formatNaira(sum.transfers)} moved to savings` : 'Everyday spending'} />
        <div className="card stat">
          <div className="label">Net cash flow</div>
          <div className="value"><Money n={sum.netCashFlow} signed /></div>
          <div className="hint">{sum.savingsRate === null ? 'No income received in this period' : sum.savingsRate < 0 ? 'Spent more than came in this period' : `Kept ${formatPct(sum.savingsRate)} of income before savings`}</div>
        </div>
      </div>

      {empty ? (
        <div className="card"><Empty title="Nothing recorded yet">Add your first income or expense in Transactions and your dashboard will come alive.</Empty>
          <div style={{ textAlign: 'center' }}><button className="btn" onClick={() => go('transactions')}>Add a transaction</button></div></div>
      ) : (
        <>
          <div className="card">
            <div className="row between">
              <div>
                <h2>Where your balance is heading</h2>
                <p className="muted small">A projection, not recorded money. Next 30 days at your recent spending pace{state.includeExpectedIncome ? ', with expected income' : ', excluding expected income'}.</p>
              </div>
              <button className="btn ghost sm" onClick={() => go('planning')}>Try changes →</button>
            </div>
            <div className="chart-box" style={{ height: 220 }} role="img" aria-label={`Projected balance for the next 30 days. Ends at ${formatNaira(proj.endBalance)}, lowest ${formatNaira(proj.lowestBalance)} on ${formatDay(proj.lowestDate)}. ${proj.shortfallDate ? `Goes below zero around ${formatDay(proj.shortfallDate)}.` : 'Stays above zero.'}`}>
              <ResponsiveContainer>
                <LineChart data={proj.points.map((p) => ({ ...p, label: formatDay(p.date) }))} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#e3dbc7" vertical={false} />
                  <XAxis dataKey="label" interval={6} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={42} />
                  <Tooltip formatter={(v) => [formatNaira(Number(v)), 'Projected balance']} />
                  <ReferenceLine y={0} stroke="#a8402f" strokeDasharray="4 3" />
                  <Line isAnimationActive={ANIMATE_CHARTS} type="monotone" dataKey="balance" stroke="#33503a" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="small" style={{ marginTop: 6 }}>
              {proj.shortfallDate
                ? <><span className="pill bad">Shortfall</span> Projected to go below ₦0 around {formatDay(proj.shortfallDate)}. Lowest point {formatNaira(proj.lowestBalance)}.</>
                : <><span className="pill">No shortfall</span> Projected end of period: {formatNaira(proj.endBalance)}.</>}
            </p>
          </div>

          <div className="grid cols-2">
            <div className="card">
              <h2>Spending by category</h2>
              <p className="muted small">Actual recorded spending. Transfers to savings are not included.</p>
              {cats.length === 0 ? (
                <Empty title="No spending in this period">Try a longer period.</Empty>
              ) : (
                <div className="chart-box" style={{ height: Math.max(180, cats.length * 38) }} role="img" aria-label={`Spending by category: ${cats.map((c) => `${c.category} ${formatNaira(c.total)}`).join(', ')}`}>
                  <ResponsiveContainer>
                    <BarChart data={cats} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="category" width={118} tick={{ fontSize: 11 }} tickFormatter={(c: string) => (c.length > 18 ? `${c.slice(0, 17)}…` : c)} />
                      <Tooltip formatter={(v) => formatNaira(Number(v))} />
                      <Bar isAnimationActive={ANIMATE_CHARTS} dataKey="total" radius={[0, 6, 6, 0]}>
                        {cats.map((c) => <Cell key={c.category} fill={CATEGORY_COLORS[c.category]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="card">
              <h2>Coming up</h2>
              <p className="muted small">Known events in the next 30 days. Expected income has not arrived yet.</p>
              {upcoming.length === 0 ? (
                <Empty title="Nothing planned">Add expected income and bills in Budget.</Empty>
              ) : (
                <div>
                  {upcoming.map((u) => (
                    <div className="tx" key={u.id}>
                      <div>{u.label}</div>
                      <div className={`amt num ${u.kind === 'income' ? 'pos' : ''}`}>{u.kind === 'income' ? '+' : '−'}{formatNaira(u.amount)}</div>
                      <div className="meta">
                        <span className={`pill ${u.kind === 'income' ? 'warn' : 'terra'}`}>{u.kind === 'income' ? 'Expected income, not received' : 'Planned expense'}</span>
                        <span className="small muted">{formatDayLong(u.date)}</span>
                      </div>
                    </div>
                  ))}
                  <p className="small muted" style={{ marginTop: 8 }}>
                    {expectedIncome.length} expected income, {planned.length} planned expense{planned.length === 1 ? '' : 's'}.
                  </p>
                </div>
              )}
            </div>
          </div>

          {data.goal && <GoalCard go={go} />}

          <div className="grid cols-2">
            <div className="card">
              <div className="row between"><h2>What stands out</h2><span className="pill sand">calculated from your data</span></div>
              {insights.length === 0 ? <Empty title="No insights yet">Record more transactions to unlock patterns.</Empty> : insights.slice(0, 5).map((i) => (
                <div className="insight" key={i.id}>
                  <div className="row"><strong>{i.title}</strong><span className={`pill ${i.kind === 'risk' ? 'bad' : i.kind === 'estimate' ? 'warn' : ''}`}>{i.kind}</span></div>
                  <div className="small">{i.detail}</div>
                  <details><summary>Why am I seeing this?</summary><div className="ev">{i.evidence}</div></details>
                </div>
              ))}
              <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => go('insights')}>See all insights and coach →</button>
            </div>
            <div className="card">
              <div className="row between"><h2>Recent transactions</h2><button className="btn ghost sm" onClick={() => go('transactions')}>View all →</button></div>
              <TxList txs={recent} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function GoalCard({ go }: { go: (p: string) => void }) {
  const { state } = useStore()
  const g = state.data!.goal!
  const pct = g.targetAmount > 0 ? g.savedAmount / g.targetAmount : 0
  return (
    <div className="card">
      <div className="row between"><h2>Goal: {g.description}</h2><button className="btn ghost sm" onClick={() => go('planning')}>Check feasibility →</button></div>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>{formatNaira(g.savedAmount)} saved of {formatNaira(g.targetAmount)}, aiming for {formatDay(g.targetDate)}</p>
      <ProgressBar value={pct} />
    </div>
  )
}

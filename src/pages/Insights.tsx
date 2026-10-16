import { useMemo } from 'react'
import { CoachPanel } from '../components/CoachPanel'
import { buildInsights } from '../engine/insights'
import { useStore } from '../store'
import { Empty } from '../ui'

const KIND_NOTE = {
  observation: 'Observed: counted directly from your recorded transactions.',
  risk: 'Risk: something that may cause a problem, with the evidence for it.',
  estimate: 'Estimate: a forecast that depends on the assumptions listed in Planning.',
} as const

export function Insights() {
  const { state, today } = useStore()
  const data = state.data!
  const insights = useMemo(() => buildInsights(data, today, state.includeExpectedIncome), [data, today, state.includeExpectedIncome])
  return (
    <div className="stack">
      <div>
        <h1>Insights</h1>
        <p className="muted small">Patterns found in your own recorded data, each with the evidence behind it. Nothing here is guessed.</p>
      </div>
      <div className="card">
        <div className="row between"><h2>What stands out</h2><span className="pill sand">calculated from your data</span></div>
        {insights.length === 0 ? (
          <Empty title="No insights yet">Record some transactions and patterns will appear here.</Empty>
        ) : (
          insights.map((i) => (
            <div className="insight" key={i.id}>
              <div className="row"><strong>{i.title}</strong><span className={`pill ${i.kind === 'risk' ? 'bad' : i.kind === 'estimate' ? 'warn' : ''}`}>{i.kind}</span></div>
              <div className="small">{i.detail}</div>
              <div className="ev small muted">Evidence: {i.evidence}</div>
              <div className="ev small muted">{KIND_NOTE[i.kind]}</div>
            </div>
          ))
        )}
      </div>
      <CoachPanel />
    </div>
  )
}

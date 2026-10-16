import { useMemo, useState } from 'react'
import { askCoach } from '../coach/client'
import { buildCoachFacts, inferFocus } from '../coach/facts'
import type { CoachResult } from '../coach/types'
import { isEmptyScenario } from '../engine/scenario'
import { useScenario, useStore } from '../store'

const MAX_QUESTION = 300
const EXAMPLES = ['Why might I run short this month?', 'Where is most of my money going?', 'What would change if I spent less on entertainment?']

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div style={{ marginTop: 12 }}>
      <h3>{title}</h3>
      <ul className="small" style={{ paddingLeft: 18, margin: '4px 0 0' }}>
        {items.map((t) => <li key={t} style={{ marginBottom: 3 }}>{t}</li>)}
      </ul>
    </div>
  )
}

/** Ask the coach a question in your own words. Works without any AI service. */
export function CoachPanel() {
  const { state, today } = useStore()
  const { changes } = useScenario()
  const data = state.data!
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<{ result: CoachResult; key: string } | null>(null)

  const scenarioActive = !isEmptyScenario(changes)
  const focus = inferFocus(question, { scenarioActive, hasGoal: data.goal !== undefined })
  const facts = useMemo(
    () => buildCoachFacts({ data, asOf: today, includeExpectedIncome: state.includeExpectedIncome, changes, focus }),
    [data, today, state.includeExpectedIncome, changes, focus],
  )
  const key = JSON.stringify({ ...facts, focus: undefined })
  const stale = out !== null && out.key !== key

  async function ask() {
    if (busy) return
    setBusy(true)
    setAsked(question.trim())
    const result = await askCoach(facts, undefined, question)
    setOut({ result, key })
    setBusy(false)
  }

  const r = out?.result
  return (
    <div className="card">
      <h2>Ask the coach</h2>
      <p className="muted small">Ask in your own words, or leave it blank for a general explanation. PocketPilot's calculator does the maths; the coach only explains it. You decide what to do.</p>

      <label style={{ marginTop: 10 }}>
        Your question
        <textarea
          rows={2}
          maxLength={MAX_QUESTION}
          value={question}
          placeholder="e.g. Why might I run short this month?"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask()
            }
          }}
          style={{ resize: 'vertical' }}
        />
      </label>
      <div className="chips" style={{ marginTop: 8 }} aria-label="Example questions">
        {EXAMPLES.map((q) => <button key={q} type="button" className="chip" onClick={() => setQuestion(q)}>{q}</button>)}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => void ask()} disabled={busy}>{busy ? 'Thinking…' : question.trim() ? 'Ask' : 'Explain my finances'}</button>
        <span className="small muted">Your question is sent to the AI service with your calculated numbers (no transaction descriptions).</span>
      </div>

      <div aria-live="polite">
        {busy && <p className="small muted" style={{ marginTop: 10 }} role="status">Reading your numbers…</p>}
        {r && !busy && (
          <div style={{ marginTop: 14 }}>
            {asked && <p className="small muted">You asked: “{asked}”</p>}
            <div className="row">
              {r.source === 'ai'
                ? <span className="pill">AI coach · {r.model ?? 'language model'}</span>
                : <span className="pill sand">Built-in explanation · rule-based, not generative AI</span>}
              {r.source === 'ai' && <span className="small muted">Every ₦ amount and % was checked against PocketPilot's calculations.</span>}
              {stale && <span className="pill warn">Your numbers have changed since this was written</span>}
            </div>
            {r.notice && <div className="banner info" style={{ marginTop: 8 }} role="status">{r.notice}</div>}
            <p style={{ marginTop: 10 }}>{r.response.summary}</p>
            <Section title="What I notice" items={r.response.observations} />
            <Section title="Things to watch" items={r.response.risks} />
            <Section title="Ideas you could consider" items={r.response.recommendations} />
            <div style={{ marginTop: 12 }}>
              <h3>What this could change <span className="pill sand">calculated by PocketPilot</span></h3>
              <div className="scroll-x">
                <table className="ledger" style={{ marginTop: 4 }}>
                  <tbody>{r.expectedImpact.map((l) => <tr key={l.label}><td>{l.label}</td><td className="num">{l.value}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
            <Section title="What this assumes" items={r.response.assumptions} />
            <Section title="Possible next steps" items={r.response.next_steps} />
            <Section title="Questions that would help" items={r.response.questions} />
            <p className="small muted" style={{ marginTop: 12 }}>
              Estimates, not promises, and not licensed financial advice.{data.profile.isDemo ? ' Based on synthetic demo data.' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

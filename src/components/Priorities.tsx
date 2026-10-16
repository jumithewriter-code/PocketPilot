import type { Priority } from '../engine/types'
import { useStore } from '../store'
import { PRIORITY_LABELS } from '../ui'

/** Any combination of priorities, including none. A savings goal is never required. */
export function Priorities() {
  const { state, dispatch } = useStore()
  const current = state.data!.profile.priorities
  const toggle = (p: Priority) =>
    dispatch({ type: 'setPriorities', priorities: current.includes(p) ? current.filter((x) => x !== p) : [...current, p] })
  return (
    <div className="form-grid">
      {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
        <label key={p} className="prio">
          <input type="checkbox" checked={current.includes(p)} onChange={() => toggle(p)} />
          <span>{PRIORITY_LABELS[p]}</span>
        </label>
      ))}
    </div>
  )
}

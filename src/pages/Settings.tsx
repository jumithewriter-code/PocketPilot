import { useState } from 'react'
import { Priorities } from '../components/Priorities'
import { useScenario, useStore } from '../store'

export function Settings() {
  const { state, dispatch } = useStore()
  const data = state.data!
  const scenario = useScenario()
  const [confirmReset, setConfirmReset] = useState(false)
  return (
    <div className="stack">
      <h1>Settings and profile</h1>

      <div className="card">
        <h2>Your priorities</h2>
        <p className="muted small" style={{ margin: '4px 0 10px' }}>Pick any, or none. You can change these whenever you like. A savings goal is never required.</p>
        <Priorities />
      </div>

      <div className="card">
        <h2>Data and privacy</h2>
        <ul className="small" style={{ paddingLeft: 18, margin: '8px 0' }}>
          <li>{data.profile.isDemo ? 'You are viewing a fictional student profile with synthetic data.' : 'Your entries are stored only in this browser.'}</li>
          <li>PocketPilot never asks for bank logins, BVNs, PINs or card numbers, and there is no live bank or B Moni connection in this prototype.</li>
          <li>Currency: Nigerian naira (₦).</li>
        </ul>
        <div className="row">
          {data.profile.isDemo && !confirmReset && <button className="btn ghost" onClick={() => setConfirmReset(true)}>Reset demo to its original state</button>}
          {data.profile.isDemo && confirmReset && (
            <>
              <span className="small">This discards your changes to the demo.</span>
              <button className="btn" onClick={() => { dispatch({ type: 'startDemo' }); scenario.reset(); setConfirmReset(false) }}>Yes, reset demo</button>
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
            </>
          )}
          <button className="btn danger" onClick={() => { dispatch({ type: 'exit' }); scenario.reset() }}>Clear data and go back to start</button>
        </div>
      </div>
    </div>
  )
}

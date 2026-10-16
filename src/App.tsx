import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Budget } from './pages/Budget'
import { Insights } from './pages/Insights'
import { Onboarding } from './pages/Onboarding'
import { Overview } from './pages/Overview'
import { Planning } from './pages/Planning'
import { Settings } from './pages/Settings'
import { Transactions } from './pages/Transactions'
import { useStore } from './store'
import { SyntheticBanner } from './ui'

interface Page {
  id: string
  label: string
  icon: string
  render: (go: (p: string) => void) => ReactNode
}

const PAGES: Page[] = [
  { id: 'overview', label: 'Overview', icon: '◎', render: (go) => <Overview go={go} /> },
  { id: 'transactions', label: 'Transactions', icon: '☰', render: () => <Transactions /> },
  { id: 'budget', label: 'Budget', icon: '▤', render: () => <Budget /> },
  { id: 'insights', label: 'Insights', icon: '✦', render: () => <Insights /> },
  { id: 'planning', label: 'Planning', icon: '↗', render: () => <Planning /> },
  { id: 'settings', label: 'Settings', icon: '⚙', render: () => <Settings /> },
]

export default function App() {
  const { state } = useStore()
  const [page, setPage] = useState('overview')
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0]
  useEffect(() => {
    document.title = state.data ? `${current.label} · PocketPilot` : 'PocketPilot: understand your money'
    // Move focus to the new page for keyboard and screen-reader users (not on first load).
    if (firstRender.current) firstRender.current = false
    else mainRef.current?.focus({ preventScroll: true })
  }, [current.label, state.data])
  if (!state.data) return <Onboarding />
  const go = (id: string) => {
    if (PAGES.some((p) => p.id === id)) {
      setPage(id)
      window.scrollTo({ top: 0 })
    }
  }
  const nav = PAGES.map((p) => (
    <button key={p.id} aria-current={p.id === current.id ? 'page' : undefined} onClick={() => go(p.id)}>
      <span className="ico" aria-hidden>{p.icon}</span>
      <span>{p.label}</span>
    </button>
  ))
  return (
    <div className="app">
      <a className="skip" href="#main">Skip to main content</a>
      <nav className="side" aria-label="Main">
        <div className="brand"><span className="brand-mark" aria-hidden>P</span> PocketPilot</div>
        {nav}
        <div className="foot">Understand your money. Take control.<br />Prototype · synthetic data only</div>
      </nav>
      <main className="main" id="main" tabIndex={-1} ref={mainRef}>
        <div className="topbar">
          <div className="brand" style={{ display: 'flex' }}><span className="brand-mark" aria-hidden>P</span> PocketPilot</div>
          {state.data.profile.isDemo && <SyntheticBanner />}
        </div>
        {current.render(go)}
      </main>
      <nav className="tabs" aria-label="Main (mobile)">{nav}</nav>
    </div>
  )
}

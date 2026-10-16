import { useMemo, useState } from 'react'
import { TxForm } from '../components/TxForm'
import { TxList } from '../components/TxList'
import { addDays, monthRange } from '../engine/dates'
import { filterTransactions, summarise } from '../engine/finance'
import { formatNaira } from '../engine/format'
import { CATEGORIES, type Category, type Transaction } from '../engine/types'
import { useStore } from '../store'
import { Empty, Money, Stat } from '../ui'

type Preset = 'month' | '30' | 'all' | 'custom'

export function Transactions() {
  const { state, dispatch, today } = useStore()
  const data = state.data!
  const [preset, setPreset] = useState<Preset>('30')
  const [customFrom, setCustomFrom] = useState(addDays(today, -30))
  const [customTo, setCustomTo] = useState(today)
  const [category, setCategory] = useState<Category | 'Income' | ''>('')
  const [type, setType] = useState<'' | 'income' | 'expense'>('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const [notice, setNotice] = useState('')

  const range = useMemo(() => {
    if (preset === 'month') return monthRange(today)
    if (preset === '30') return { from: addDays(today, -29), to: today }
    if (preset === 'custom') return { from: customFrom, to: customTo }
    return { from: undefined, to: undefined }
  }, [preset, today, customFrom, customTo])

  const rows = useMemo(
    () => filterTransactions(data.transactions, { from: range.from, to: range.to, category: category || undefined, type: type || undefined, search }),
    [data.transactions, range, category, type, search],
  )
  const sum = useMemo(() => summarise(rows, '0000-01-01', '9999-12-31'), [rows])
  const rangeInvalid = preset === 'custom' && customFrom > customTo

  function save(tx: Transaction) {
    dispatch({ type: editing === 'new' ? 'addTx' : 'updateTx', tx })
    setNotice(editing === 'new' ? `Added “${tx.description}” as ${tx.category}.` : `Updated “${tx.description}”.`)
    setEditing(null)
  }

  return (
    <div className="stack">
      <div className="row between">
        <h1>Transactions</h1>
        {editing === null && <button className="btn" onClick={() => { setNotice(''); setEditing('new') }}>+ Add transaction</button>}
      </div>
      {notice && <div className="banner info" role="status">{notice}</div>}

      {editing !== null && (
        <TxForm today={today} history={data.transactions} initial={editing === 'new' ? undefined : editing} onSave={save} onCancel={() => setEditing(null)} />
      )}

      <div className="card">
        <div className="form-grid">
          <label>
            Period
            <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
              <option value="30">Last 30 days</option>
              <option value="month">This month</option>
              <option value="all">All time</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          {preset === 'custom' && (
            <>
              <label>From<input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label>
              <label>To<input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label>
            </>
          )}
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value as Category | 'Income' | '')}>
              <option value="">All categories</option>
              <option value="Income">Income</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as '' | 'income' | 'expense')}>
              <option value="">Income and expenses</option>
              <option value="income">Income only</option>
              <option value="expense">Expenses only</option>
            </select>
          </label>
          <label>
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. lunch" />
          </label>
        </div>
        {rangeInvalid && <p className="field-err" style={{ marginTop: 8 }}>The start date must be before the end date.</p>}
      </div>

      <div className="grid stats">
        <Stat label="Money in" value={formatNaira(sum.income)} />
        <Stat label="Spent" value={formatNaira(sum.expenses)} hint="excludes savings transfers" />
        <Stat label="Moved to savings" value={formatNaira(sum.transfers)} />
        <div className="card stat"><div className="label">Net change</div><div className="value"><Money n={sum.netCashFlow} signed /></div><div className="hint">{rows.length} transaction{rows.length === 1 ? '' : 's'} shown</div></div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          data.transactions.length === 0 ? (
            <Empty title="No transactions yet">Add your first one to start seeing where your money goes.</Empty>
          ) : (
            <Empty title="Nothing matches these filters">Try a wider period or clear the search.</Empty>
          )
        ) : (
          <TxList txs={rows} grouped onEdit={(t) => { setNotice(''); setEditing(t) }} onDelete={(id) => { dispatch({ type: 'deleteTx', id }); setNotice('Transaction deleted. Totals and charts have been updated.') }} />
        )}
      </div>
    </div>
  )
}

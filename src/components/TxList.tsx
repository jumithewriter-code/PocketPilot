import { useState } from 'react'
import { formatDayLong, formatNaira } from '../engine/format'
import type { Transaction } from '../engine/types'

interface Props {
  txs: Transaction[]
  onEdit?: (tx: Transaction) => void
  onDelete?: (id: string) => void
  grouped?: boolean
}

export function TxList({ txs, onEdit, onDelete, grouped }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null)
  let lastDate = ''
  return (
    <div>
      {txs.map((t) => {
        const head = grouped && t.date !== lastDate
        lastDate = t.date
        return (
          <div key={t.id}>
            {head && <div className="day-head">{formatDayLong(t.date)}</div>}
            <div className="tx">
              <div>{t.description}</div>
              <div className={`amt num ${t.type === 'income' ? 'pos' : ''}`}>
                {t.type === 'income' ? '+' : '−'}{formatNaira(t.amount)}
              </div>
              <div className="meta">
                <span className={`pill ${t.type === 'income' ? '' : t.category === 'Savings and transfers' ? 'sand' : 'terra'}`}>{t.category}</span>
                {t.category === 'Savings and transfers' && <span className="small muted">not counted as spending</span>}
                {!grouped && <span className="small muted">{formatDayLong(t.date)}</span>}
                {t.oneOff && <span className="pill sand" title="Not assumed to repeat in forecasts">one-off</span>}
                {(onEdit || onDelete) && (
                  <span className="row" style={{ marginLeft: 'auto', gap: 6 }}>
                    {onEdit && <button className="btn ghost sm" onClick={() => onEdit(t)} aria-label={`Edit ${t.description}`}>Edit</button>}
                    {onDelete && confirming !== t.id && <button className="btn danger sm" onClick={() => setConfirming(t.id)} aria-label={`Delete ${t.description}`}>Delete</button>}
                    {onDelete && confirming === t.id && (
                      <>
                        <button className="btn danger sm" onClick={() => { onDelete(t.id); setConfirming(null) }}>Confirm delete</button>
                        <button className="btn ghost sm" onClick={() => setConfirming(null)}>Keep</button>
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

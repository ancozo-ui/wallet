import { useEffect, useState } from 'react'
import { won } from './const'

export function Sheet({ title, sub, children, onClose }) {
  return (
    <div className="scrim" onClick={(e) => { if (e.target.classList.contains('scrim')) onClose() }}>
      <div className="sheet">
        {title && <h3>{title}</h3>}
        {sub && <div className="msub">{sub}</div>}
        {children}
      </div>
    </div>
  )
}

export function Stepper({ value, min = 0.5, step = 0.5, max = 99, format, onChange }) {
  const fmt = format || ((v) => v)
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>−</button>
      <div className="val">{fmt(value)}</div>
      <button type="button" onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}>＋</button>
    </div>
  )
}

export function Stars({ value, onChange }) {
  return (
    <div className="stars">
      {[1, 2, 3].map((n) => (
        <button type="button" key={n} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>⭐</button>
      ))}
    </div>
  )
}

export function Donut({ data }) {
  const tot = data.reduce((a, d) => a + d.value, 0) || 1
  let acc = 0
  const segs = data.map((d) => {
    const s = (acc / tot) * 360; acc += d.value; const e = (acc / tot) * 360
    return `${d.color} ${s}deg ${e}deg`
  }).join(',')
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${segs})` }} />
      <div className="legend">
        {data.map((d, i) => (
          <div className="lg" key={i}>
            <span className="sw" style={{ background: d.color }} />
            {d.label}<span className="lv">{Math.round((d.value / tot) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Bars({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const sorted = [...data].sort((a, b) => b.value - a.value)
  return (
    <div className="bars">
      {sorted.map((d, i) => (
        <div className="barrow" key={i}>
          <div className="bt"><span>{d.emoji || ''} {d.label}</span><b>{won(d.value)}원</b></div>
          <div className="track"><div className="fill" style={{ width: `${Math.max(8, (d.value / max) * 100)}%`, background: d.color }} /></div>
        </div>
      ))}
    </div>
  )
}

export function Toast({ msg }) {
  if (!msg) return null
  return <div className="toast">{msg}</div>
}

export function Celebrate({ amount, onDone }) {
  const [coins] = useState(() => {
    const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches
    if (reduce) return []
    const emo = ['🪙', '⭐', '💰', '🎊']
    return Array.from({ length: 16 }, (_, i) => ({
      e: emo[i % 4], left: Math.random() * 100, dur: 1 + Math.random() * 1.2, delay: Math.random() * 0.4,
    }))
  })
  useEffect(() => { const t = setTimeout(onDone, 1800); return () => clearTimeout(t) }, [onDone])
  return (
    <>
      <div className="celebrate">
        <div className="msg">
          <div className="em">🎉</div>
          <div className="big">+{won(amount)}원!</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>보상이 지급됐어요</div>
        </div>
      </div>
      {coins.map((c, i) => (
        <div className="coin" key={i}
          style={{ left: `${c.left}vw`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}>{c.e}</div>
      ))}
    </>
  )
}

export function useToast() {
  const [msg, setMsg] = useState('')
  const toast = (m) => { setMsg(m); }
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2600)
    return () => clearTimeout(t)
  }, [msg])
  return [msg, toast]
}

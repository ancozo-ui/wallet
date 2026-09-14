import { useEffect, useState } from 'react'
import { won } from './const'
import { pushPermission, enablePush, disablePush } from './push'

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

// 알림 켜기/끄기 토글. 부모는 설정 시트, 자녀는 홈 블록으로 쓴다.
// 권한 요청은 이 버튼의 탭(사용자 제스처) 안에서만 일어난다.
export function PushToggle({ kid, toast }) {
  const [perm, setPerm] = useState(() => pushPermission())
  if (perm === 'unsupported') return null

  const on = async () => {
    try {
      const r = await enablePush()
      setPerm(r === 'unsupported' ? 'unsupported' : pushPermission())
      toast?.(r === 'granted' ? '🔔 알림을 켰어요!' : '알림이 꺼져 있어요. 휴대폰 설정에서 켜주세요')
    } catch (e) { toast?.('⚠️ ' + (e.message || '알림을 켜지 못했어요')) }
  }
  const off = async () => {
    try { await disablePush(); setPerm(pushPermission()); toast?.('알림을 껐어요') }
    catch (e) { toast?.('⚠️ ' + (e.message || '')) }
  }

  if (perm === 'granted') {
    return (
      <div className="sblock" style={{ cursor: 'default' }}>
        <span className="em">🔔</span>
        <div><div className="t">알림 켜짐</div>
          <div className="d">{kid ? '이제 소식이 오면 알려줄게요 🎉' : '이 기기로 알림이 와요'}</div></div>
        <button className="rt" style={{ color: 'var(--muted)', fontSize: 12 }} onClick={off}>끄기</button>
      </div>
    )
  }
  if (perm === 'denied') {
    return (
      <div className="sblock" style={{ cursor: 'default' }}>
        <span className="em">🔕</span>
        <div><div className="t">알림이 꺼져 있어요</div>
          <div className="d">{kid ? '부모님께 알림을 켜달라고 부탁해요'
            : '휴대폰 설정 → 앱 → 용돈나라 → 알림 에서 켜주세요'}</div></div>
      </div>
    )
  }
  return (
    <button className="sblock" onClick={on}>
      <span className="em">🔔</span>
      <div><div className="t">알림 받기</div>
        <div className="d">{kid ? '부모님이 허락하면 바로 알려줄게요!' : '아이가 요청을 보내면 바로 알려드려요'}</div></div>
      <span className="rt" style={{ color: 'var(--mint-ink)', fontSize: 12 }}>켜기</span>
    </button>
  )
}

// 화면(시트)이 열려 있는 동안 유지되는 고유 표식.
// 네트워크가 끊겨 사용자가 다시 눌러도 같은 표식이라 서버에 두 번 저장되지 않는다.
export function useIdemToken() {
  const [t] = useState(() => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`))
  return t
}

// 연타로 같은 요청이 두 번 만들어지는 걸 막는 제출 버튼
export function ActionButton({ className, onClick, children, busyLabel = '처리 중…', ...rest }) {
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (busy) return
    setBusy(true)
    try { await onClick() } finally { setBusy(false) }
  }
  return (
    <button className={className} disabled={busy} onClick={go} {...rest}>
      {busy ? busyLabel : children}
    </button>
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
          <div style={{ fontWeight: 800, fontSize: 15 }}>퀘스트 완료!</div>
          <div className="big">+{won(amount)}원!</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>보상이 지급됐어요</div>
        </div>
      </div>
      {coins.map((c, i) => (
        <div className="fallcoin" key={i}
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

import { useEffect, useState } from 'react'
import { won } from './const'
import { pushPermission, enablePush, disablePush, isSubscribed } from './push'

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
  const [subscribed, setSubscribed] = useState(false)

  // 구독 존재 여부가 실제 on/off. 권한만으로는 판단할 수 없다(끈 뒤에도 granted 로 남음).
  useEffect(() => { isSubscribed().then(setSubscribed).catch(() => setSubscribed(false)) }, [])

  if (perm === 'unsupported') return null

  const on = async () => {
    try {
      const r = await enablePush()
      setPerm(r === 'unsupported' ? 'unsupported' : pushPermission())
      setSubscribed(r === 'granted')
      toast?.(r === 'granted' ? '🔔 알림을 켰어요!' : '알림이 꺼져 있어요. 휴대폰 설정에서 켜주세요')
    } catch (e) { toast?.('⚠️ ' + (e.message || '알림을 켜지 못했어요')) }
  }
  const off = async () => {
    try { await disablePush(); setSubscribed(false); toast?.('알림을 껐어요') }
    catch (e) { toast?.('⚠️ ' + (e.message || '')) }
  }

  if (perm === 'granted' && subscribed) {
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

// 투자 지갑 성장 그래프. 진짜 그래프(시간 x축, 금액 y축)인데 이자 지급 지점마다
// 잎이 돋게 꾸며서 화분처럼도 읽힌다 — 나중엔 잎 장식만 빼면 그냥 그래프로 남는다.
// Donut/Bars 와 같은 컨벤션으로 손으로 그린 SVG(라이브러리 없음).
export function InvestVine({ tx, onTapTick }) {
  const sorted = [...tx].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  if (!sorted.length) {
    return <div className="empty" style={{ padding: 26 }}>아직 투자를 시작하지 않았어요<br />🌱 투자하기로 첫 씨앗을 심어보세요</div>
  }
  let cum = 0
  const pts = [{ i: 0, y: 0, t: null }]
  sorted.forEach((t) => { cum += t.sign * t.amount; pts.push({ i: pts.length, y: cum, t }) })

  const W = 300, H = 140, PAD = 16
  const ys = pts.map((p) => p.y)
  const maxY = Math.max(...ys, 1), minY = Math.min(...ys, 0)
  const span = Math.max(maxY - minY, 1)
  const lastI = pts.length - 1 || 1
  const sx = (i) => PAD + (i / lastI) * (W - PAD * 2)
  const sy = (y) => H - PAD - ((y - minY) / span) * (H - PAD * 2)
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ')
  const area = `${line} L ${sx(lastI).toFixed(1)} ${H - PAD} L ${sx(0).toFixed(1)} ${H - PAD} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="vine">
      <defs>
        <linearGradient id="vineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#vineFill)" stroke="none" />
      <path d={line} fill="none" stroke="var(--mint)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p) => p.t?.kind === 'interest' && (
        <text key={p.i} x={sx(p.i)} y={sy(p.y) - 6} textAnchor="middle" fontSize="15"
          style={{ cursor: onTapTick ? 'pointer' : 'default' }} onClick={() => onTapTick?.(p.t)}>🌿</text>
      ))}
    </svg>
  )
}

// 선 그래프는 아이 눈높이엔 밋밋하다 — 대신 투자 총액에 따라 자라는 나무로 보여준다.
// 정확한 수치보다 "커지고 있다"는 느낌이 먼저 와닿게. 부모는 InvestVine(정밀 그래프)을 본다.
const TREE_STAGES = [
  { max: 5000, e: '🌱', label: '씨앗' },
  { max: 30000, e: '🌿', label: '새싹' },
  { max: 100000, e: '🪴', label: '어린 나무' },
  { max: 300000, e: '🌳', label: '나무' },
  { max: Infinity, e: '🌲', label: '큰 나무' },
]
function treeStage(total) {
  return TREE_STAGES.find((s) => total < s.max) || TREE_STAGES[TREE_STAGES.length - 1]
}

export function InvestTree({ total, tx, onTapTick }) {
  const sorted = [...tx].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  if (!sorted.length) {
    return <div className="empty" style={{ padding: 26 }}>아직 투자를 시작하지 않았어요<br />🌱 투자하기로 첫 씨앗을 심어보세요</div>
  }
  const stage = treeStage(total)
  const recent = sorted.slice(-12) // 너무 많으면 어지러우니 최근 것만
  return (
    <div className="tree-plot">
      <div className="tree-main">{stage.e}</div>
      <div className="tree-label">{stage.label} · {won(total)}원</div>
      <div className="tree-scatter">
        {recent.map((t, i) => (
          <span key={t.id} className={'tseed' + (t.kind === 'interest' ? ' tick' : '')} style={{ '--i': i }}
            onClick={() => t.kind === 'interest' && onTapTick?.(t)}>
            {t.kind === 'interest' ? '🍃' : t.kind === 'withdraw' ? '🍂' : '🌱'}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Toast({ msg }) {
  if (!msg) return null
  return <div className="toast">{msg}</div>
}

export function Celebrate({ amount, label, onDone }) {
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
          <div style={{ fontWeight: 800, fontSize: 15 }}>{label || '퀘스트 완료!'}</div>
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

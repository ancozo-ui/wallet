import { useEffect, useRef, useState } from 'react'
import { CATS, BUY_CATS, QCAT, txIcon, won } from './const'
import { Sheet, Stepper, Stars, ActionButton, useIdemToken } from './ui'
import { QuestCard, Stats } from './Parent'
import * as api from './api'

export default function Child({ ctx }) {
  const { data, online, run, celebrate } = ctx
  const [tab, setTab] = useState('home')
  const [sheet, setSheet] = useState(null)

  // 부모가 퀘스트 완료를 승인해 보상이 들어오면 아이 화면에서 축하한다.
  // 첫 로드 때 이미 있던 내역은 기준선으로 잡아두고, 그 뒤에 새로 생긴 것만 축하.
  const seenQuestTx = useRef(null)
  useEffect(() => {
    const rewards = (data?.tx || []).filter((t) => t.sign > 0 && t.category === 'quest')
    if (seenQuestTx.current === null) {
      seenQuestTx.current = new Set(rewards.map((t) => t.id))
      return
    }
    const fresh = rewards.filter((t) => !seenQuestTx.current.has(t.id))
    if (!fresh.length) return
    fresh.forEach((t) => seenQuestTx.current.add(t.id))
    celebrate(fresh.reduce((a, t) => a + t.amount, 0))
  }, [data?.tx, celebrate])

  if (!data) return <div className="body"><div className="empty"><span className="e">🐷</span>불러오는 중…</div></div>

  const me = data.me
  const fines = data.fines || []
  const activeQuests = (data.quests || []).filter((q) => q.status === 'prog' || q.status === 'done_sub')
  const reserved = (data.myPending || []).reduce((a, r) => a + (r.amount || 0), 0)
  const available = Math.max(0, me.balance - reserved)
  const ackFineNow = (f) => run(() => api.ackFine(f.id), `벌금 ${won(f.amount)}원이 빠져나갔어요`)

  return (
    <>
      <div className="hd">
        <div className="who">
          <div className="avatar">{me.emoji}</div>
          <div><h1>{me.name}의 지갑</h1><div className="sub">나의 용돈 나라</div></div>
        </div>
        <div className="sp" />
      </div>

      {!online && <div className="netbar"><span>📡 인터넷에 연결되어 있지 않아요</span><span className="d">마지막으로 본 정보예요</span></div>}

      <div className="body">
        {tab === 'home' && <Home me={me} tx={data.tx} fines={fines} activeQuests={activeQuests}
          onAck={ackFineNow} onGoQuests={() => setTab('quests')}
          onSpend={() => setTab('spend')} onSend={() => setSheet({ t: 'send' })} />}
        {tab === 'spend' && <Spend me={me} available={available} reserved={reserved} onTime={(k) => setSheet({ t: 'time', kind: k })} onBuy={(c) => setSheet({ t: 'buy', cat: c })} />}
        {tab === 'quests' && <Quests quests={data.quests} run={run}
          onSubmit={(q) => setSheet({ t: 'submit', q })} onPropose={() => setSheet({ t: 'propose' })} />}
        {tab === 'stats' && <Stats kid={me} tx={data.tx} allowanceDay={data.family?.allowance_day ?? 6} />}
      </div>

      <div className="nav">
        {[['home', '🏠', '홈'], ['spend', '💸', '지출'], ['quests', '🏆', '퀘스트'], ['stats', '📊', '분석']].map(([id, ic, lb]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><span className="ic">{ic}</span>{lb}</button>
        ))}
      </div>

      {sheet?.t === 'send' && <SendSheet me={me} available={available} siblings={data.siblings} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet?.t === 'time' && <TimeSheet me={me} available={available} kind={sheet.kind} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet?.t === 'buy' && <BuySheet me={me} available={available} cat={sheet.cat} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet?.t === 'submit' && <SubmitSheet q={sheet.q} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet?.t === 'propose' && <ProposeSheet me={me} ctx={ctx} onClose={() => setSheet(null)} />}
    </>
  )
}

function Home({ me, tx, fines, activeQuests, onAck, onGoQuests, onSpend, onSend }) {
  const inc = tx.filter((t) => t.sign > 0).reduce((a, t) => a + t.amount, 0)
  const out = tx.filter((t) => t.sign < 0).reduce((a, t) => a + t.amount, 0)
  const hasNews = fines.length > 0 || activeQuests.length > 0
  return (
    <>
      {hasNews && <div className="sec-t">📌 지금 상황</div>}
      {fines.map((f) => (
        <button className="sblock fine" key={f.id} onClick={() => onAck(f)}>
          <span className="em">⚠️</span>
          <div><div className="t">벌금 · {f.reason}</div><div className="d">눌러서 확인하고 차감해요</div></div>
          <span className="rt">-{won(f.amount)}원</span>
        </button>
      ))}
      {activeQuests.map((q) => {
        const qc = QCAT[q.category] || QCAT.help
        const prog = q.status === 'prog'
        return (
          <button className="sblock" key={q.id} onClick={onGoQuests}>
            <span className="em">{prog ? '🔵' : '⏳'}</span>
            <div><div className="t">{qc.e} {q.title}</div>
              <div className="d">{prog ? '진행중 · 오늘 밤 12시까지 · 눌러서 완료하기' : '완료 제출함 · 부모님 확인 대기중'}</div></div>
            <span className="rt" style={{ color: 'var(--coin-ink)' }}>🏆 {won(q.reward)}</span>
          </button>
        )
      })}
      <div className="card balance">
        <div className="lab">지금 내 용돈</div>
        <div><span className="amt">{won(me.balance)}</span><span className="won"> 원</span></div>
        <div className="pig">🐷</div>
        <div className="row">
          <div className="chip"><div className="k">모은 돈</div><div className="v">+{won(inc)}</div></div>
          <div className="chip"><div className="k">쓴 돈</div><div className="v">-{won(out)}</div></div>
          <div className="chip"><div className="k">시간당</div><div className="v">{won(me.rate)}</div></div>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn" style={{ background: 'var(--spend)', color: '#fff' }} onClick={onSpend}>💸 지출하기</button>
        <button className="btn coin" onClick={onSend}>💌 보내기</button>
      </div>
      <div className="sec-t">최근 내역</div>
      <div className="card" style={{ padding: '5px 13px' }}>
        {tx.length === 0 && <div className="empty" style={{ padding: 18 }}>아직 내역이 없어요</div>}
        {tx.map((t) => {
          const [ic, cl] = txIcon(t)
          return (
            <div className="tx" key={t.id}>
              <div className={'ti ' + cl}>{ic}</div>
              <div><div className="tl">{t.label}</div><div className="td">{new Date(t.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}{t.by_actor ? <> · <span className="byline">{t.by_actor}</span></> : null}</div></div>
              <div className={'tv ' + (t.sign > 0 ? 'plus' : 'minus')}>{t.sign > 0 ? '+' : '-'}{won(t.amount)}</div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function Spend({ me, available, reserved, onTime, onBuy }) {
  return (
    <>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14 }}>
        <div style={{ fontSize: 24 }}>👛</div>
        <div><div className="rt" style={{ fontSize: 11.5, color: 'var(--muted)' }}>지금 쓸 수 있는 돈</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 22 }}>{won(available)}원</div></div>
        {reserved > 0 && <div style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--faint)', textAlign: 'right' }}>승인 대기<br />{won(reserved)}원</div>}
      </div>
      <div className="sec-t">⏱ 타임충전권 <span className="cnt">시간당 {won(me.rate)}원</span></div>
      <div className="grid2">
        <button className="tile" onClick={() => onTime('game')}><span className="em">🎮</span><span className="tt">게임 이용권</span><span className="ds">주말에 즐겨요</span></button>
        <button className="tile" onClick={() => onTime('tv')}><span className="em">📺</span><span className="tt">TV 이용권</span><span className="ds">평일에 즐겨요</span></button>
      </div>
      <div className="sec-t">🛒 구매 (실제 현금으로 환전)</div>
      <div className="grid2">
        {BUY_CATS.map((c) => <button className="tile" key={c} onClick={() => onBuy(c)}><span className="em">{CATS[c].e}</span><span className="tt">{CATS[c].n}</span></button>)}
      </div>
      <div className="insight" style={{ marginTop: 14 }}><span className="q">💡</span>
        <span>무엇에 쓸지 고르면 부모님이 확인해요. "환전"은 내 용돈을 진짜 돈으로 바꿔서 직접 사러 가는 거예요!</span></div>
    </>
  )
}

function Quests({ quests, run, onSubmit, onPropose }) {
  const order = { prog: 0, open: 1, done_sub: 2, done: 3, expired: 4 }
  const qs = [...quests].sort((a, b) => order[a.status] - order[b.status])
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 12px' }}>
        <div style={{ fontFamily: 'var(--disp)', fontSize: 17, flex: 1 }}>도전할 퀘스트</div>
        <button className="btn coin sm" onClick={onPropose}>✋ 제안하기</button>
      </div>
      {qs.length === 0 && <div className="empty"><span className="e">🗺️</span>아직 퀘스트가 없어요<br />하고 싶은 일을 제안해 보세요!</div>}
      {qs.map((q) => <QuestCard key={q.id} q={q} child onApply={(qq) => run(() => api.applyQuest(qq.id), '도전 시작! 오늘 밤 12시까지 ⏰')} onSubmit={onSubmit} />)}
    </>
  )
}

// ---------- sheets ----------
function SendSheet({ me, available, siblings, ctx, onClose }) {
  const token = useIdemToken()
  const [to, setTo] = useState(siblings[0]?.id || '')
  const [amt, setAmt] = useState('')
  const [memo, setMemo] = useState('')
  if (!siblings.length) return <Sheet title="💌 보내기" onClose={onClose}><div className="empty" style={{ padding: 20 }}>보낼 형제가 없어요</div></Sheet>
  const go = async () => {
    if (!+amt) return
    if (+amt > available) { ctx.toast(`쓸 수 있는 돈이 부족해요 (지금 ${won(available)}원)`); return }
    const ok = await ctx.run(() => api.createRequest(me.family_id, me.id, { kind: 'transfer', to_member_id: to, amount: +amt, memo: memo || '용돈 선물', client_token: token }), '보내기 요청 완료! 부모님 확인을 기다려요 💌')
    if (ok) onClose()
  }
  return (
    <Sheet title="💌 형제에게 보내기" sub={`쓸 수 있는 돈 ${won(available)}원 · 부모님이 확인하면 전달돼요`} onClose={onClose}>
      {siblings.length > 1 && <div className="field"><label>누구에게?</label>
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {siblings.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
        </select></div>}
      <div className="field"><label>보낼 금액 (원)</label><input type="number" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="예: 500" /></div>
      <div className="field"><label>한마디</label><input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 생일 축하해!" /></div>
      <ActionButton className="btn coin" onClick={go}>보내기 요청</ActionButton>
    </Sheet>
  )
}

function TimeSheet({ me, available, kind, ctx, onClose }) {
  const token = useIdemToken()
  const [hours, setHours] = useState(1)
  const amt = Math.round(me.rate * hours)
  const label = kind === 'game' ? '🎮 게임 이용권' : '📺 TV 이용권'
  const tooMuch = amt > available
  const go = async () => {
    if (tooMuch) { ctx.toast(`쓸 수 있는 돈이 부족해요 (지금 ${won(available)}원)`); return }
    const ok = await ctx.run(() => api.createRequest(me.family_id, me.id, { kind: 'spend', category: kind, amount: amt, memo: `${hours % 1 ? hours.toFixed(1) : hours}시간 이용`, convert: false, client_token: token }), '요청을 보냈어요! 부모님 확인을 기다려요 ⏳')
    if (ok) onClose()
  }
  return (
    <Sheet title={label} sub={`시간당 ${won(me.rate)}원 · 쓸 수 있는 돈 ${won(available)}원`} onClose={onClose}>
      <Stepper value={hours} min={0.5} step={0.5} max={5} format={(v) => `${v % 1 ? v.toFixed(1) : v}시간`} onChange={setHours} />
      <div className="calc" style={tooMuch ? { background: 'var(--danger-soft)', color: 'var(--danger)' } : null}>
        {tooMuch ? `돈이 부족해요 · ${won(amt)}원 필요` : `${won(amt)}원 차감`}</div>
      <ActionButton className="btn pri" style={{ marginTop: 14 }} onClick={go}>부모님께 요청 💌</ActionButton>
    </Sheet>
  )
}

function BuySheet({ me, available, cat, ctx, onClose }) {
  const token = useIdemToken()
  const ci = CATS[cat]
  const [amt, setAmt] = useState('')
  const [memo, setMemo] = useState('')
  const go = async () => {
    if (!+amt) return
    if (+amt > available) { ctx.toast(`쓸 수 있는 돈이 부족해요 (지금 ${won(available)}원)`); return }
    const ok = await ctx.run(() => api.createRequest(me.family_id, me.id, { kind: 'spend', category: cat, amount: +amt, memo: memo || `${ci.n} 구매`, convert: true, client_token: token }), '요청을 보냈어요! 부모님 확인을 기다려요 ⏳')
    if (ok) onClose()
  }
  return (
    <Sheet title={`${ci.e} ${ci.n} 사기`} sub={`쓸 수 있는 돈 ${won(available)}원 · 얼마가 필요한지 적어요`} onClose={onClose}>
      <div className="field"><label>필요한 금액 (원)</label><input type="number" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="예: 2000" /></div>
      <div className="field"><label>무엇을 살 거예요?</label><input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 친구 생일 선물" /></div>
      <ActionButton className="btn pri" onClick={go}>부모님께 요청 💌</ActionButton>
    </Sheet>
  )
}

function SubmitSheet({ q, ctx, onClose }) {
  const isUnit = q.reward_type === 'unit'
  const [qty, setQty] = useState(1)
  const [diff, setDiff] = useState(2)
  const go = async () => {
    const ok = await ctx.run(() => api.submitQuest(q.id, isUnit ? qty : 1, diff), '완료 제출 완료! 부모님 확인을 기다려요 ⏳')
    if (ok) onClose()
  }
  return (
    <Sheet title={`${q.title} 완료! 🎉`} sub="얼마나 했는지, 얼마나 힘들었는지 알려줘요" onClose={onClose}>
      {isUnit && <div className="field"><label>몇 {q.unit || '개'} 했어요?</label>
        <Stepper value={qty} min={1} step={1} max={99} format={(v) => `${v}${q.unit || '개'}`} onChange={setQty} />
        <div className="calc">{won(q.reward * qty)}원 받을 예정</div></div>}
      <div className="field"><label>얼마나 힘들었어요?</label><Stars value={diff} onChange={setDiff} /></div>
      <ActionButton className="btn coin" onClick={go}>완료 제출하기 ✓</ActionButton>
    </Sheet>
  )
}

function ProposeSheet({ me, ctx, onClose }) {
  const token = useIdemToken()
  const [title, setTitle] = useState('')
  const [cat, setCat] = useState('help')
  const [reward, setReward] = useState('')
  const go = async () => {
    if (!title.trim() || !+reward) return
    const ok = await ctx.run(() => api.createRequest(me.family_id, me.id, { kind: 'proposal', title: title.trim(), category: cat, reward: +reward, client_token: token }), '제안을 보냈어요! 부모님 승인을 기다려요 ✋')
    if (ok) onClose()
  }
  return (
    <Sheet title="✋ 퀘스트 제안하기" sub="하고 싶은 일을 부모님께 제안해요" onClose={onClose}>
      <div className="field"><label>무슨 일?</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 방 청소하기" /></div>
      <div className="field"><label>종류</label>
        <div className="chips">
          {Object.entries(QCAT).map(([k, c]) => <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{c.e} {c.n}</button>)}
        </div></div>
      <div className="field"><label>원하는 보상 (원)</label><input type="number" inputMode="numeric" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="예: 500" /></div>
      <ActionButton className="btn coin" onClick={go}>부모님께 제안</ActionButton>
    </Sheet>
  )
}

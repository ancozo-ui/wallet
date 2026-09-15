import { useCallback, useEffect, useRef, useState } from 'react'
import { CATS, BUY_CATS, QCAT, txIcon, won } from './const'
import { Sheet, Stepper, Stars, ActionButton, useIdemToken, PushToggle } from './ui'
import { QuestCard, Stats, Invest } from './Parent'
import * as api from './api'

// 돈이 모자랄 때 아이에게 보여줄 안내. 마이너스면 '채워야 한다'는 걸 먼저 알려준다.
function shortOfMoney(available, balance) {
  if (balance < 0) return `마이너스 ${won(-balance)}원을 먼저 채워야 해요 · 퀘스트를 깨보세요! 🏆`
  return `쓸 수 있는 돈이 부족해요 (지금 ${won(available)}원) · 퀘스트로 더 모아볼까요? 🏆`
}

export default function Child({ ctx }) {
  const { data, online, run, celebrate, toast } = ctx
  const [tab, setTab] = useState('home')
  const [sheet, setSheet] = useState(null)

  // 부모가 퀘스트 완료를 승인해 보상이 들어오면 아이 화면에서 축하한다.
  //
  // 이미 축하한 보상은 기기에 기록해 두고(localStorage), 아직 축하 안 한 것만
  // 오래된 순서대로 '한 건씩' 보여준다. 그래서
  //  - 같은 축하가 앱에 들어갈 때마다 다시 뜨지 않고
  //  - 여러 건이 쌓여도 합산되지 않고 어떤 퀘스트였는지 각각 알 수 있으며
  //  - 앱이 꺼져 있는 사이 받은 보상도 다음에 열 때 제대로 축하받는다.
  const queueRef = useRef([])
  const showingRef = useRef(false)

  const pump = useCallback(() => {
    if (showingRef.current) return
    const next = queueRef.current.shift()
    if (!next) return
    showingRef.current = true
    celebrate(next.amount, next.label)
    // 축하 카드가 1.8초 뒤 사라지므로 조금 여유를 두고 다음 건을 띄운다.
    setTimeout(() => { showingRef.current = false; pump() }, 2200)
  }, [celebrate])

  useEffect(() => {
    const meNow = data?.me
    if (!data?.tx || !meNow) return
    const key = `celebrated:${meNow.id}`
    const rewards = data.tx.filter((t) => t.sign > 0 && t.category === 'quest')

    let raw
    try { raw = localStorage.getItem(key) } catch { return }

    // 이 기기에서 처음 여는 경우: 지난 내역을 몰아서 축하하지 않는다.
    if (raw === null) {
      try { localStorage.setItem(key, JSON.stringify(rewards.map((t) => t.id))) } catch { /* 저장 불가 */ }
      return
    }

    let seen
    try { seen = new Set(JSON.parse(raw)) } catch { seen = new Set() }
    const fresh = rewards
      .filter((t) => !seen.has(t.id))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    if (!fresh.length) return

    fresh.forEach((t) => seen.add(t.id))
    try { localStorage.setItem(key, JSON.stringify([...seen].slice(-200))) } catch { /* 저장 불가 */ }

    queueRef.current.push(...fresh.map((t) => ({ amount: t.amount, label: t.label })))
    pump()
  }, [data?.tx, data?.me, pump])

  if (!data) return <div className="body"><div className="empty"><span className="e">🐷</span>불러오는 중…</div></div>

  const me = data.me
  const fines = data.fines || []
  const activeQuests = (data.quests || []).filter((q) => q.status === 'prog' || q.status === 'done_sub')
  const reserved = (data.myPending || []).reduce((a, r) => a + (r.amount || 0), 0)
  const available = Math.max(0, me.balance - reserved)
  const ackFineNow = (f) => run(() => api.ackFine(f.id), `벌금 ${won(f.amount)}원이 빠져나갔어요`)
  // 마이너스는 하한선 없이 쌓이고, 전부 채워 플러스가 되어야 쓸 수 있다.
  const blocked = me.balance < 0
  const guide = () => toast(shortOfMoney(available, me.balance))

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
          toast={toast} signOut={ctx.signOut}
          onSpend={() => setTab('spend')} onSend={() => (blocked ? guide() : setSheet({ t: 'send' }))} />}
        {tab === 'spend' && <Spend me={me} available={available} reserved={reserved} blocked={blocked}
          onGoQuests={() => setTab('quests')}
          onTime={(k) => (blocked ? guide() : setSheet({ t: 'time', kind: k }))}
          onBuy={(c) => (blocked ? guide() : setSheet({ t: 'buy', cat: c }))} />}
        {tab === 'quests' && <Quests quests={data.quests} run={run}
          onSubmit={(q) => setSheet({ t: 'submit', q })} onCancel={(q) => setSheet({ t: 'cancel', q })}
          onPropose={() => setSheet({ t: 'propose' })} />}
        {tab === 'invest' && <Invest kid={me} tx={data.investTx || []} ticks={data.investTicks || []}
          onDeposit={() => (blocked ? guide() : setSheet({ t: 'invest-deposit' }))}
          onWithdraw={() => setSheet({ t: 'invest-withdraw' })} />}
        {tab === 'stats' && <Stats kid={me} tx={data.tx} investTx={data.investTx || []} allowanceDay={data.family?.allowance_day ?? 6} />}
      </div>

      <div className="nav">
        {[['home', '🏠', '홈'], ['spend', '💸', '지출'], ['quests', '🏆', '퀘스트'], ['invest', '🌱', '투자'], ['stats', '📊', '분석']].map(([id, ic, lb]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><span className="ic">{ic}</span>{lb}</button>
        ))}
      </div>

      {sheet?.t === 'send' && <SendSheet me={me} available={available} siblings={data.siblings} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet?.t === 'time' && <TimeSheet me={me} available={available} kind={sheet.kind} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet?.t === 'buy' && <BuySheet me={me} available={available} cat={sheet.cat} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet?.t === 'cancel' && <CancelSheet q={sheet.q} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet?.t === 'submit' && <SubmitSheet q={sheet.q} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet?.t === 'propose' && <ProposeSheet me={me} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet?.t === 'invest-deposit' && <InvestDepositSheet me={me} available={available} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet?.t === 'invest-withdraw' && <InvestWithdrawSheet me={me} ctx={ctx} onClose={() => setSheet(null)} />}
    </>
  )
}

function Home({ me, tx, fines, activeQuests, onAck, onGoQuests, onSpend, onSend, toast, signOut }) {
  // 여기 "모은 돈/쓴 돈"은 용돈(소비성) 기준이다 — 투자 입출금(grp='invest')은 물론,
  // "바로 투자로" 줄 때 같이 생기는 "용돈 지급" 기록(related_id 로 투자와 짝지어짐)도
  // 실제로는 한 번도 쓸 수 있는 돈이 된 적이 없으므로 함께 뺀다.
  const inc = tx.filter((t) => t.sign > 0 && t.grp !== 'invest' && !t.related_id).reduce((a, t) => a + t.amount, 0)
  const out = tx.filter((t) => t.sign < 0 && t.grp !== 'invest' && !t.related_id).reduce((a, t) => a + t.amount, 0)
  const owing = me.balance < 0
  const hasNews = fines.length > 0 || activeQuests.length > 0
  return (
    <>
      <PushToggle kid toast={toast} />
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
      <div className={'card balance' + (owing ? ' owing' : '')}>
        <div className="lab">지금 내 용돈</div>
        <div><span className="amt">{won(me.balance)}</span><span className="won"> 원</span></div>
        <div className="pig">{owing ? '😿' : '🐷'}</div>
        <div className="row">
          <div className="chip"><div className="k">모은 돈</div><div className="v">+{won(inc)}</div></div>
          <div className="chip"><div className="k">쓴 돈</div><div className="v">-{won(out)}</div></div>
          <div className="chip"><div className="k">시간당</div><div className="v">{won(me.rate)}</div></div>
        </div>
        {owing && <div className="note">
          ⚠️ 마이너스예요. 다음 용돈이나 퀘스트 보상에서 <b>{won(-me.balance)}원</b>이 먼저 채워지고,
          그 전까지는 돈을 쓸 수 없어요.</div>}
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
      {/* 기기를 공유하니 아이도 로그아웃이 필요하다. 로그아웃하면 이 기기의 푸시 구독도 해제된다. */}
      <button className="btn line" style={{ marginTop: 14, color: 'var(--muted)' }} onClick={signOut}>로그아웃</button>
    </>
  )
}

function Spend({ me, available, reserved, blocked, onGoQuests, onTime, onBuy }) {
  return (
    <>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14 }}>
        <div style={{ fontSize: 24 }}>{blocked ? '😿' : '👛'}</div>
        <div><div className="rt" style={{ fontSize: 11.5, color: 'var(--muted)' }}>지금 쓸 수 있는 돈</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 22 }}>{won(available)}원</div></div>
        {reserved > 0 && <div style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--faint)', textAlign: 'right' }}>승인 대기<br />{won(reserved)}원</div>}
      </div>

      {blocked && (
        <div className="card" style={{ background: 'var(--danger-soft)', borderColor: 'transparent' }}>
          <div style={{ fontWeight: 800, color: 'var(--danger)', fontSize: 14 }}>지금은 쓸 수 없어요</div>
          <div style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6 }}>
            마이너스 <b>{won(-me.balance)}원</b>을 다 채워야 다시 쓸 수 있어요.<br />
            퀘스트를 깨서 보상을 받거나, 토요일 용돈을 모으면 저절로 채워져요!
          </div>
          <button className="btn pri" style={{ marginTop: 11 }} onClick={onGoQuests}>🏆 퀘스트 하러 가기</button>
        </div>
      )}
      <div className="sec-t">⏱ 타임충전권 <span className="cnt">시간당 {won(me.rate)}원</span></div>
      <div className="grid2" style={blocked ? { opacity: 0.45 } : null}>
        <button className="tile" onClick={() => onTime('game')}><span className="em">🎮</span><span className="tt">게임 이용권</span><span className="ds">주말에 즐겨요</span></button>
        <button className="tile" onClick={() => onTime('tv')}><span className="em">📺</span><span className="tt">TV 이용권</span><span className="ds">평일에 즐겨요</span></button>
      </div>
      <div className="sec-t">🛒 구매 (실제 현금으로 환전)</div>
      <div className="grid2" style={blocked ? { opacity: 0.45 } : null}>
        {BUY_CATS.map((c) => <button className="tile" key={c} onClick={() => onBuy(c)}><span className="em">{CATS[c].e}</span><span className="tt">{CATS[c].n}</span></button>)}
      </div>
      <div className="insight" style={{ marginTop: 14 }}><span className="q">💡</span>
        <span>무엇에 쓸지 고르면 부모님이 확인해요. "환전"은 내 용돈을 진짜 돈으로 바꿔서 직접 사러 가는 거예요!</span></div>
    </>
  )
}

function Quests({ quests, run, onSubmit, onCancel, onPropose }) {
  const [openCat, setOpenCat] = useState(null)
  // 지금 하는 중인 건 항상 펼쳐 두고, 나머지는 카테고리로 접어 스크롤을 줄인다.
  const active = quests.filter((q) => q.status === 'prog' || q.status === 'done_sub')
  const rest = quests.filter((q) => q.status === 'open')
  const byCat = {}
  rest.forEach((q) => { (byCat[q.category] || (byCat[q.category] = [])).push(q) })
  const cats = Object.keys(QCAT).filter((k) => byCat[k] && byCat[k].length)
  const apply = (qq) => run(() => api.applyQuest(qq.id), '도전 시작! 오늘 밤 12시까지 ⏰')

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 12px' }}>
        <div style={{ fontFamily: 'var(--disp)', fontSize: 17, flex: 1 }}>도전할 퀘스트</div>
        <button className="btn coin sm" onClick={onPropose}>✋ 제안하기</button>
      </div>

      {active.length > 0 && <div className="sec-t">🔥 지금 하는 중 <span className="cnt">{active.length}</span></div>}
      {active.map((q) => (
        <QuestCard key={q.id} q={q} child onApply={apply} onSubmit={onSubmit} onCancel={onCancel} />
      ))}

      {active.length === 0 && cats.length === 0 && (
        <div className="empty"><span className="e">🗺️</span>아직 퀘스트가 없어요<br />하고 싶은 일을 제안해 보세요!</div>
      )}

      {cats.length > 0 && <div className="sec-t">도전할 수 있어요 <span className="cnt">{rest.length}</span></div>}
      {cats.map((k) => {
        const c = QCAT[k]
        const list = byCat[k]
        const isOpen = openCat === k
        return (
          <div key={k}>
            <button className="sblock" onClick={() => setOpenCat(isOpen ? null : k)}>
              <span className="em">{c.e}</span>
              <div><div className="t">{c.n}</div><div className="d">{list.length}개</div></div>
              <span className="rt" style={{ color: 'var(--faint)' }}>{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && list.map((q) => (
              <QuestCard key={q.id} q={q} child onApply={apply} onSubmit={onSubmit} onCancel={onCancel} />
            ))}
          </div>
        )
      })}
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
    if (+amt > available) { ctx.toast(shortOfMoney(available, me.balance)); return }
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
    if (tooMuch) { ctx.toast(shortOfMoney(available, me.balance)); return }
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
    if (+amt > available) { ctx.toast(shortOfMoney(available, me.balance)); return }
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

function CancelSheet({ q, ctx, onClose }) {
  const unit = q.reward_type === 'unit' ? `${q.unit || '개'}당 ` : ''
  const go = async () => {
    const ok = await ctx.run(() => api.cancelQuest(q.id), '도전을 취소했어요')
    if (ok) onClose()
  }
  return (
    <Sheet title="정말 취소할까요?" onClose={onClose}>
      <div style={{ textAlign: 'center', fontSize: 42, marginTop: 4 }}>😢</div>
      <div style={{ textAlign: 'center', fontSize: 14, lineHeight: 1.7, margin: '8px 4px 4px' }}>
        지금 취소하면 <b>"{q.title}"</b> 으로 받을 수 있던<br />
        <b style={{ color: 'var(--coin-ink)', fontSize: 17 }}>{unit}{won(q.reward)}원</b> 을 못 모아요.
      </div>
      <div className="insight" style={{ marginTop: 12 }}><span className="q">⏰</span>
        <span>오늘 밤 12시까지 아직 시간이 있어요. 조금만 더 해볼까요?</span></div>
      <button className="btn pri" style={{ marginTop: 14 }} onClick={onClose}>계속 도전할래요! 💪</button>
      <ActionButton className="btn line" style={{ marginTop: 8, color: 'var(--muted)' }} onClick={go}>
        그래도 취소할래요</ActionButton>
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

function InvestDepositSheet({ me, available, ctx, onClose }) {
  const token = useIdemToken()
  const investTotal = (me.invest_principal || 0) + (me.invest_pending || 0)
  const [amt, setAmt] = useState('')
  const go = async () => {
    if (!+amt) return
    if (+amt > available) { ctx.toast(shortOfMoney(available, me.balance)); return }
    const ok = await ctx.run(() => api.investDeposit(+amt, token), '투자 지갑에 넣었어요 🌱')
    if (ok) onClose()
  }
  return (
    <Sheet title="🌱 투자하기" sub="용돈 지갑에 있는 돈을 투자 지갑으로 옮겨요 · 승인 없이 바로 들어가요" onClose={onClose}>
      <div className="btn-row" style={{ marginBottom: 4 }}>
        <div className="calc" style={{ background: 'var(--surface-2)', color: 'var(--ink)', flex: 1 }}>
          💰 용돈 지갑<br /><b>{won(available)}원</b></div>
        <div className="calc" style={{ flex: 1 }}>
          🌱 투자 지갑<br /><b>{won(investTotal)}원</b></div>
      </div>
      <div className="field" style={{ marginTop: 10 }}><label>용돈 지갑에서 얼마를 옮길까요? (원)</label>
        <input type="number" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="예: 50000" /></div>
      <div className="insight"><span className="q">💡</span>
        <span>지금 넣은 돈은 다음 정산부터 이자가 붙기 시작해요</span></div>
      <ActionButton className="btn pri" style={{ marginTop: 12 }} onClick={go}>투자하기</ActionButton>
    </Sheet>
  )
}

function InvestWithdrawSheet({ me, ctx, onClose }) {
  const token = useIdemToken()
  const total = (me.invest_principal || 0) + (me.invest_pending || 0)
  const [amt, setAmt] = useState('')
  const [memo, setMemo] = useState('')
  const tooMuch = +amt > total
  const go = async () => {
    if (!+amt || !memo.trim()) { ctx.toast('금액과 어디에 쓸지를 모두 적어주세요'); return }
    if (tooMuch) { ctx.toast(`투자 잔액이 부족해요 (지금 ${won(total)}원)`); return }
    const ok = await ctx.run(() => api.createRequest(me.family_id, me.id,
      { kind: 'invest_withdraw', amount: +amt, memo: memo.trim(), client_token: token }),
      '인출 요청을 보냈어요! 부모님 확인을 기다려요 ⏳')
    if (ok) onClose()
  }
  return (
    <Sheet title="💵 투자금 인출하기" sub={`투자 지갑 ${won(total)}원 · 부모님이 확인하면 용돈 지갑으로 들어와요`} onClose={onClose}>
      <div className="field"><label>인출할 금액 (원)</label>
        <input type="number" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="예: 15000" /></div>
      <div className="field"><label>어디에 쓸 거예요?</label>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 갖고 싶었던 자전거를 사고 싶어요" /></div>
      {tooMuch && <div className="calc" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>투자 잔액이 부족해요</div>}
      <ActionButton className="btn pri" style={{ marginTop: 12 }} onClick={go}>부모님께 요청 💌</ActionButton>
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

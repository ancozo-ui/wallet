import { useMemo, useState } from 'react'
import { QCAT, catInfo, won, stars } from './const'
import { Sheet, Donut, Bars } from './ui'
import * as api from './api'

export default function Parent({ ctx }) {
  const { me, data, run, online } = ctx
  const [actor, setActor] = useState('엄마')
  const [tab, setTab] = useState('home')
  const [focus, setFocus] = useState(null)
  const [sheet, setSheet] = useState(null)
  const A = { ...ctx, actor }

  const kids = data?.kids || []
  const focusKid = focus || kids[0]?.id
  const kmap = useMemo(() => Object.fromEntries(kids.map((k) => [k.id, k])), [kids])

  const completions = (data?.quests || []).filter((q) => q.status === 'done_sub')
  const reqs = (data?.requests || []).filter((r) => r.kind !== 'fine')
  const queueCount = completions.length + reqs.length

  if (!data) return <Loading />

  const nav = [
    ['home', '🏠', '홈'], ['queue', '📥', '승인함', queueCount],
    ['quests', '🏆', '퀘스트'], ['stats', '📊', '분석'],
  ]

  return (
    <>
      <div className="hd">
        <div className="who">
          <div className="avatar">{actor === '엄마' ? '👩' : '👨'}</div>
          <div><h1>우리집 용돈</h1><div className="sub">관리자 · 지금 {actor}</div></div>
        </div>
        <div className="sp" />
        <div className="actor-seg">
          <button className={actor === '엄마' ? 'on' : ''} onClick={() => setActor('엄마')}>👩 엄마</button>
          <button className={actor === '아빠' ? 'on' : ''} onClick={() => setActor('아빠')}>👨 아빠</button>
        </div>
      </div>

      {!online && <div className="netbar"><span>📡 인터넷에 연결되어 있지 않아요</span><span className="d">마지막으로 본 정보예요</span></div>}

      <div className="body">
        {tab === 'home' && <Home kids={kids} onGive={() => setSheet({ t: 'give' })}
          onFine={() => setSheet({ t: 'fine' })} onAdd={() => setSheet({ t: 'kid' })}
          onEdit={(k) => setSheet({ t: 'kid', kid: k })} onFocus={(id) => { setFocus(id); setTab('stats') }}
          queueCount={queueCount} onQueue={() => setTab('queue')} signOut={ctx.signOut} />}
        {tab === 'queue' && <Queue completions={completions} reqs={reqs} kmap={kmap} A={A} />}
        {tab === 'quests' && <Quests kids={kids} quests={data.quests} onNew={() => setSheet({ t: 'quest' })} />}
        {tab === 'stats' && <Stats kid={kmap[focusKid]} tx={data.tx.filter((t) => t.member_id === focusKid)} />}
      </div>

      <div className="nav">
        {nav.map(([id, ic, lb, badge]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {badge ? <span className="nd">{badge}</span> : null}
            <span className="ic">{ic}</span>{lb}
          </button>
        ))}
      </div>

      {sheet?.t === 'give' && <GiveSheet kids={kids} A={A} onClose={() => setSheet(null)} />}
      {sheet?.t === 'fine' && <FineSheet kids={kids} A={A} onClose={() => setSheet(null)} />}
      {sheet?.t === 'kid' && <KidSheet kid={sheet.kid} kids={kids} A={A} onClose={() => setSheet(null)} />}
      {sheet?.t === 'quest' && <QuestSheet kids={kids} A={A} onClose={() => setSheet(null)} />}
    </>
  )
}

function Loading() { return <div className="body"><div className="empty"><span className="e">🐷</span>불러오는 중…</div></div> }

function Home({ kids, onGive, onFine, onAdd, onEdit, onFocus, queueCount, onQueue, signOut }) {
  return (
    <>
      <div className="sec-t">우리 아이들 <span className="cnt">{kids.length}</span></div>
      {kids.map((k) => (
        <div className="card kidcard" key={k.id}>
          <div className="av" onClick={() => onFocus(k.id)}>{k.emoji}</div>
          <div onClick={() => onFocus(k.id)} style={{ cursor: 'pointer' }}>
            <div className="nm">{k.name}</div>
            <div className="rt">시간당 {won(k.rate)}원 · 탭하면 분석</div>
          </div>
          <div className="bal" onClick={() => onFocus(k.id)}><b>{won(k.balance)}</b><span> 원</span></div>
          <button className="editkid" onClick={() => onEdit(k)}>✏️</button>
        </div>
      ))}
      <button className="btn line" style={{ margin: '2px 0 14px' }} onClick={onAdd}>＋ 아이 추가</button>
      <div className="btn-row">
        <button className="btn pri" onClick={onGive}>🎁 용돈 주기</button>
        <button className="btn line" onClick={onFine}>⚠️ 벌금 부과</button>
      </div>
      {queueCount > 0 && (
        <div className="card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={onQueue}>
          <div className="avatar" style={{ background: 'var(--danger-soft)' }}>📥</div>
          <div><div style={{ fontWeight: 700 }}>승인할 일 {queueCount}건</div>
            <div className="sub" style={{ fontSize: 11.5, color: 'var(--muted)' }}>지출·송금·완료·제안을 확인하세요</div></div>
          <div style={{ marginLeft: 'auto', fontSize: 20, color: 'var(--faint)' }}>›</div>
        </div>
      )}
      <button className="btn line" style={{ marginTop: 22, color: 'var(--muted)' }} onClick={signOut}>로그아웃</button>
    </>
  )
}

function Queue({ completions, reqs, kmap, A }) {
  const spend = reqs.filter((r) => r.kind === 'spend')
  const transfer = reqs.filter((r) => r.kind === 'transfer')
  const proposal = reqs.filter((r) => r.kind === 'proposal')
  const [confirmQ, setConfirmQ] = useState(null)
  if (!completions.length && !reqs.length)
    return <div className="empty"><span className="e">🎉</span>모두 처리했어요!<br />승인 대기 중인 요청이 없습니다.</div>

  const nm = (id) => kmap[id]?.name || '아이'
  return (
    <>
      {completions.length > 0 && <div className="sec-t">⏳ 완료 확인 <span className="cnt">{completions.length}</span></div>}
      {completions.map((q) => {
        const base = q.reward_type === 'unit' ? q.reward * (q.submission?.qty || 1) : q.reward
        return (
          <div className="req completion" key={q.id}>
            <div className="rk" style={{ color: 'var(--coin-ink)' }}>퀘스트 완료</div>
            <div className="rt">{nm(q.member_id)} · {q.title}</div>
            <div className="rd">{q.reward_type === 'unit' ? `${q.submission?.qty}${q.unit || ''} 완료` : '완료'} · 체감 난이도 <span style={{ color: 'var(--coin)' }}>{stars(q.submission?.diff || 0)}</span></div>
            <div className="calc" style={{ marginBottom: 10 }}>기본 보상 {won(base)}원</div>
            <button className="btn coin" onClick={() => setConfirmQ(q)}>✓ 확인하고 보상 주기</button>
          </div>
        )
      })}

      {spend.length > 0 && <div className="sec-t">💸 지출 요청 <span className="cnt">{spend.length}</span></div>}
      {spend.map((p) => {
        const ci = catInfo(p.category)
        return (
          <div className="req spend" key={p.id}>
            <div className="rk" style={{ color: 'var(--spend)' }}>{p.convert ? '구매 · 환전' : '지출'}</div>
            <div className="rt">{nm(p.member_id)} · {ci.e} {ci.n}</div>
            <div className="rd">"{p.memo}"{p.convert ? ' · 실제 현금으로 바꿔요' : ''}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="amt-big minus">-{won(p.amount)}원</div>
              <div className="btn-row" style={{ marginLeft: 'auto' }}>
                <button className="btn line sm" onClick={() => A.run(() => api.rejectRequest(p.id), '거절했어요')}>거절</button>
                <button className="btn pri sm" onClick={() => A.run(() => api.approveRequest(p.id, A.actor), `${A.actor}가 승인했어요`)}>승인</button>
              </div>
            </div>
          </div>
        )
      })}

      {transfer.length > 0 && <div className="sec-t">💌 형제 송금 <span className="cnt">{transfer.length}</span></div>}
      {transfer.map((p) => (
        <div className="req transfer" key={p.id}>
          <div className="rk" style={{ color: 'var(--spend)' }}>송금 승인</div>
          <div className="rt">{nm(p.member_id)} → {nm(p.to_member_id)}</div>
          <div className="rd">"{p.memo}"</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="amt-big">{won(p.amount)}원</div>
            <div className="btn-row" style={{ marginLeft: 'auto' }}>
              <button className="btn line sm" onClick={() => A.run(() => api.rejectRequest(p.id), '거절했어요')}>거절</button>
              <button className="btn pri sm" onClick={() => A.run(() => api.approveRequest(p.id, A.actor), '송금을 승인했어요')}>승인</button>
            </div>
          </div>
        </div>
      ))}

      {proposal.length > 0 && <div className="sec-t">✋ 퀘스트 제안 <span className="cnt">{proposal.length}</span></div>}
      {proposal.map((p) => {
        const qc = QCAT[p.category] || QCAT.help
        return (
          <div className="req proposal" key={p.id}>
            <div className="rk" style={{ color: 'var(--mint-ink)' }}>아이 제안</div>
            <div className="rt">{nm(p.member_id)} · {qc.e} {p.title}</div>
            <div className="rd">원하는 보상 {won(p.reward)}원 · {qc.n}</div>
            <div className="btn-row">
              <button className="btn line sm" style={{ flex: 1 }} onClick={() => A.run(() => api.rejectRequest(p.id), '거절했어요')}>거절</button>
              <button className="btn pri sm" style={{ flex: 1 }} onClick={() => A.run(() => api.approveRequest(p.id, A.actor), '제안을 등록했어요')}>승인해서 등록</button>
            </div>
          </div>
        )
      })}

      {confirmQ && <ConfirmSheet q={confirmQ} A={A} kmap={kmap} onClose={() => setConfirmQ(null)} />}
    </>
  )
}

function ConfirmSheet({ q, A, onClose }) {
  const base = q.reward_type === 'unit' ? q.reward * (q.submission?.qty || 1) : q.reward
  const [bonus, setBonus] = useState(0)
  const go = async () => {
    const ok = await A.run(() => api.confirmQuest(q.id, bonus, A.actor), null, base + bonus)
    if (ok) onClose()
  }
  return (
    <Sheet title={`${q.title} 확인 ✓`} sub="잘했으면 보너스를 더 줄 수 있어요" onClose={onClose}>
      <div className="calc">기본 보상 {won(base)}원 · 난이도 {stars(q.submission?.diff || 0)}</div>
      <div className="field" style={{ marginTop: 14 }}><label>보너스 (선택)</label>
        <div className="chips">
          {[0, 300, 500, 1000].map((b) => (
            <button key={b} className={bonus === b ? 'on' : ''} onClick={() => setBonus(b)}>{b === 0 ? '없음' : '+' + b}</button>
          ))}
        </div>
      </div>
      <div className="calc" style={{ background: 'var(--coin-soft)', color: 'var(--coin-ink)' }}>총 {won(base + bonus)}원 지급</div>
      <button className="btn coin" style={{ marginTop: 14 }} onClick={go}>🎉 보상 지급하기</button>
    </Sheet>
  )
}

function Quests({ kids, quests, onNew }) {
  return (
    <>
      <button className="btn pri" onClick={onNew} style={{ margin: '6px 0 14px' }}>＋ 새 퀘스트 등록</button>
      {kids.map((k) => {
        const qs = quests.filter((q) => q.member_id === k.id)
        return (
          <div key={k.id}>
            <div className="sec-t">{k.emoji} {k.name} <span className="cnt">{qs.length}</span></div>
            {qs.length === 0 && <div className="empty" style={{ padding: 18 }}>아직 퀘스트가 없어요</div>}
            {qs.map((q) => <QuestCard key={q.id} q={q} />)}
          </div>
        )
      })}
    </>
  )
}

export function QuestCard({ q, child, onApply, onSubmit }) {
  const qc = QCAT[q.category] || QCAT.help
  const rw = q.reward_type === 'unit' ? `${q.unit || '개'}당 ${won(q.reward)}원` : `${won(q.reward)}원`
  const badge = { open: ['b-open', '🟢 모집중'], prog: ['b-prog', '🔵 진행중'], done_sub: ['b-wait', '⏳ 확인 대기중'], done: ['b-done', '✅ 완료'], expired: ['b-done', '⌛ 만료'] }[q.status]
  return (
    <div className="quest">
      <div className={'qe ' + qc.c}>{qc.e}</div>
      <div style={{ flex: 1 }}>
        <span className={'badge ' + badge[0]}>{badge[1]}</span>
        {q.proposer === 'child' && <span className="badge b-open" style={{ background: 'var(--coin-soft)', color: 'var(--coin-ink)' }}>✋ 내 제안</span>}
        <div className="qt">{q.title}</div>
        <div className="qd">{qc.n}{q.actor ? ` · ${q.actor} 등록` : ''}</div>
        <div className="qr">🏆 {rw}</div>
        {child && q.status === 'open' && <button className="btn pri sm" style={{ width: '100%', marginTop: 8 }} onClick={() => onApply(q)}>할래요!</button>}
        {child && q.status === 'prog' && <>
          <div className="countdown">⏰ 오늘 밤 12시까지 끝내기!</div>
          <button className="btn coin sm" style={{ width: '100%', marginTop: 8 }} onClick={() => onSubmit(q)}>다 했어요 ✓</button>
        </>}
      </div>
    </div>
  )
}

export function Stats({ kid, tx }) {
  const [period, setPeriod] = useState('week')
  if (!kid) return <div className="empty">아이를 선택하세요</div>

  const days = period === 'month' ? 30 : 7
  const from = Date.now() - days * 86400 * 1000
  const ftx = tx.filter((t) => new Date(t.created_at).getTime() >= from)
  const inWin = ftx.length
  const spent = ftx.filter((t) => t.sign < 0).reduce((a, t) => a + t.amount, 0)
  const earned = ftx.filter((t) => t.sign > 0).reduce((a, t) => a + t.amount, 0)

  const incomeCats = { weekly: ['주간 용돈', 'var(--mint)'], quest: ['퀘스트', 'var(--coin)'], transfer: ['받은 돈', 'var(--spend)'], manual: ['직접 받음', 'var(--mint-ink)'] }
  const inc = {}
  ftx.filter((t) => t.sign > 0).forEach((t) => { const k = incomeCats[t.category] ? t.category : 'manual'; inc[k] = (inc[k] || 0) + t.amount })
  const incData = Object.entries(inc).map(([c, v]) => ({ label: incomeCats[c][0], color: incomeCats[c][1], value: v }))

  const spColors = { food: '#E58F2F', toy: '#E5573F', study_buy: '#0FA98C', book: '#4C82F7', gift: '#C65CC6', donate: '#2FA86A', game: '#7A5CF0', tv: '#F5B133' }
  const sp = {}
  ftx.filter((t) => t.sign < 0 && t.grp !== 'fine').forEach((t) => { sp[t.category] = (sp[t.category] || 0) + t.amount })
  const spData = Object.entries(sp).map(([c, v]) => ({ label: catInfo(c).n, emoji: catInfo(c).e, color: spColors[c] || '#888', value: v }))

  const qe = {}
  ftx.filter((t) => t.sign > 0 && t.category === 'quest').forEach((t) => {
    const key = (t.label || '퀘스트').replace(/\s*\(.*\)/, '').replace(/\s*\+보너스/, '')
    if (!qe[key]) qe[key] = { total: 0, cnt: 0, diffs: [] }
    qe[key].total += t.amount; qe[key].cnt++; if (t.difficulty) qe[key].diffs.push(t.difficulty)
  })
  const qeArr = Object.entries(qe).sort((a, b) => b[1].total - a[1].total)

  return (
    <>
      <div className="seg" style={{ margin: '8px 0 4px' }}>
        <button className={period === 'week' ? 'on p' : ''} onClick={() => setPeriod('week')}>최근 1주</button>
        <button className={period === 'month' ? 'on p' : ''} onClick={() => setPeriod('month')}>최근 1달</button>
      </div>
      <div className="card" style={{ display: 'flex', gap: 10, padding: 13 }}>
        <div style={{ flex: 1 }}><div className="rt" style={{ fontSize: 11.5, color: 'var(--muted)' }}>모은 돈</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 20, color: 'var(--good)' }}>+{won(earned)}</div></div>
        <div style={{ flex: 1 }}><div className="rt" style={{ fontSize: 11.5, color: 'var(--muted)' }}>쓴 돈</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 20, color: 'var(--danger)' }}>-{won(spent)}</div></div>
      </div>
      {!inWin && <div className="empty" style={{ padding: 24 }}>이 기간엔 내역이 없어요<br />{period === 'week' ? '"최근 1달"로 넓혀 보세요' : ''}</div>}
      <div className="sec-t">{kid.emoji} {kid.name} · 💰 어디서 들어왔나</div>
      <div className="card">{incData.length ? <Donut data={incData} /> : <div className="empty" style={{ padding: 10 }}>아직 수입이 없어요</div>}</div>
      <div className="sec-t">🛍 어디에 썼나</div>
      {spData.length ? <div className="card"><Bars data={spData} /></div> : <div className="empty" style={{ padding: 20 }}>아직 쓴 내역이 없어요</div>}
      <div className="sec-t">🏆 퀘스트로 번 돈 · 힘든 정도</div>
      <div className="card">
        {qeArr.length ? qeArr.map(([name, d]) => {
          const avg = d.diffs.length ? Math.round(d.diffs.reduce((a, b) => a + b, 0) / d.diffs.length) : 0
          return <div className="valrow" key={name}><span>{name}</span>
            {avg ? <span className="star">{stars(avg)}</span> : null}
            <span className="vv">{won(d.total)}원</span></div>
        }) : <div className="empty" style={{ padding: 10 }}>아직 퀘스트로 번 돈이 없어요</div>}
      </div>
    </>
  )
}

// ---------------- Sheets ----------------
function GiveSheet({ kids, A, onClose }) {
  const [kid, setKid] = useState(kids[0]?.id || '')
  const [amt, setAmt] = useState('')
  const [memo, setMemo] = useState('')
  const go = async () => {
    if (!+amt) return
    const ok = await A.run(() => api.give(kid, +amt, memo, A.actor), `${A.actor}가 용돈을 지급했어요 🎁`)
    if (ok) onClose()
  }
  return (
    <Sheet title="🎁 용돈 주기" sub="아이에게 용돈을 지급해요" onClose={onClose}>
      <div className="field"><label>누구에게?</label>
        <select value={kid} onChange={(e) => setKid(e.target.value)}>
          {kids.map((k) => <option key={k.id} value={k.id}>{k.emoji} {k.name} ({won(k.balance)}원)</option>)}
        </select></div>
      <div className="field"><label>금액 (원)</label><input type="number" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="예: 3000" /></div>
      <div className="field"><label>메모</label><input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 이번 주 용돈" /></div>
      <button className="btn pri" onClick={go}>용돈 주기</button>
    </Sheet>
  )
}

function FineSheet({ kids, A, onClose }) {
  const [kid, setKid] = useState(kids[0]?.id || '')
  const [amt, setAmt] = useState('')
  const [reason, setReason] = useState('')
  const go = async () => {
    if (!+amt) return
    const ok = await A.run(() => api.issueFine(kid, +amt, reason, A.actor), `${A.actor}가 벌금을 부과했어요`)
    if (ok) onClose()
  }
  return (
    <Sheet title="⚠️ 벌금 부과" sub={'아이가 "확인"하면 차감돼요 · 돈이 빠져나간다는 걸 알게 해줘요'} onClose={onClose}>
      <div className="field"><label>누구에게?</label>
        <select value={kid} onChange={(e) => setKid(e.target.value)}>
          {kids.map((k) => <option key={k.id} value={k.id}>{k.emoji} {k.name}</option>)}
        </select></div>
      <div className="field"><label>금액 (원)</label><input type="number" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="예: 200" /></div>
      <div className="field"><label>이유</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 약속을 어겼어요" /></div>
      <button className="btn danger" onClick={go}>벌금 부과하기</button>
    </Sheet>
  )
}

function QuestSheet({ kids, A, onClose }) {
  const [kid, setKid] = useState(kids[0]?.id || '')
  const [title, setTitle] = useState('')
  const [cat, setCat] = useState('study')
  const [reward, setReward] = useState('')
  const go = async () => {
    if (!title.trim() || !+reward) return
    const ok = await A.run(() => api.createQuest(A.me.family_id, kid, title.trim(), cat, +reward, A.actor), `${A.actor}가 퀘스트를 등록했어요 🏆`)
    if (ok) onClose()
  }
  return (
    <Sheet title="＋ 새 퀘스트" sub="아이가 도전할 일을 만들어요" onClose={onClose}>
      <div className="field"><label>누구의 퀘스트?</label>
        <select value={kid} onChange={(e) => setKid(e.target.value)}>
          {kids.map((k) => <option key={k.id} value={k.id}>{k.emoji} {k.name}</option>)}
        </select></div>
      <div className="field"><label>무슨 일?</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 방 청소하기" /></div>
      <div className="field"><label>종류</label>
        <div className="chips">
          {Object.entries(QCAT).map(([k, c]) => <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{c.e} {c.n}</button>)}
        </div></div>
      <div className="field"><label>보상 (원)</label><input type="number" inputMode="numeric" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="예: 500" /></div>
      <button className="btn pri" onClick={go}>퀘스트 등록</button>
    </Sheet>
  )
}

const EMOJIS = ['🦊', '🐰', '🐱', '🐶', '🐻', '🐼', '🐯', '🦁', '🐨', '🐸', '🐵', '🦄', '🐹', '🐥']
function KidSheet({ kid, kids, A, onClose }) {
  const isNew = !kid
  const [name, setName] = useState(kid?.name || '')
  const [emoji, setEmoji] = useState(kid?.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)])
  const [rate, setRate] = useState(kid?.rate ?? 500)
  const [loginId, setLoginId] = useState('')
  const [pin, setPin] = useState('')
  const go = async () => {
    if (isNew) {
      if (!name.trim() || !loginId.trim() || String(pin).length < 4) { A.toast('이름·아이디·4자리 이상 PIN 이 필요해요'); return }
      const ok = await A.run(() => api.addChild({ name: name.trim(), emoji, rate: +rate || 0, loginId: loginId.trim(), pin }), `${name} 추가 완료 🎉`)
      if (ok) onClose()
    } else {
      const ok = await A.run(() => api.updateKid(kid.id, { name: name.trim() || '아이', emoji, rate: +rate || 0 }), '저장했어요')
      if (ok) onClose()
    }
  }
  return (
    <Sheet title={isNew ? '＋ 아이 추가' : '아이 정보 수정'} sub="이름·아이콘·요율을 정해요" onClose={onClose}>
      <div className="field"><label>이름 / 별명</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 하준, 첫째" /></div>
      <div className="field"><label>아이콘</label>
        <div className="chips emoji-chips">
          {EMOJIS.map((e) => <button key={e} className={emoji === e ? 'on' : ''} onClick={() => setEmoji(e)}>{e}</button>)}
        </div></div>
      <div className="field"><label>타임충전권 시간당 요율 (원)</label><input type="number" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="예: 1000" /></div>
      {isNew && <>
        <div className="field"><label>로그인 아이디 (영문/숫자)</label><input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="예: hajun" /></div>
        <div className="field"><label>PIN (4자리 이상)</label><input inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="예: 2580" /></div>
      </>}
      <button className="btn pri" onClick={go}>{isNew ? '추가하기' : '저장하기'}</button>
    </Sheet>
  )
}

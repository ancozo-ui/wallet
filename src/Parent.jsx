import { useMemo, useState } from 'react'
import { QCAT, PRESET_QUESTS, catInfo, won, stars, WEEKDAYS, allowanceWeekStart, txIcon, investBand } from './const'
import { Sheet, Donut, Bars, InvestVine, InvestTree, ActionButton, useIdemToken, PushToggle } from './ui'
import * as api from './api'

export default function Parent({ ctx }) {
  const { me, data, run, online } = ctx
  const [actor, setActor] = useState('엄마')
  const [tab, setTab] = useState('home')
  const [focus, setFocus] = useState(null)
  const [sheet, setSheet] = useState(null)
  const A = { ...ctx, actor }

  const kids = data?.kids || []
  const allowanceDay = data?.family?.allowance_day ?? 6
  const focusKid = focus || kids[0]?.id
  const kmap = useMemo(() => Object.fromEntries(kids.map((k) => [k.id, k])), [kids])

  const completions = (data?.quests || []).filter((q) => q.status === 'done_sub')
  const reqs = (data?.requests || []).filter((r) => r.kind !== 'fine')
  const queueCount = completions.length + reqs.length

  if (!data) return <Loading />

  const nav = [
    ['home', '🏠', '홈'], ['queue', '📥', '승인함', queueCount],
    ['quests', '🏆', '퀘스트'], ['invest', '🌱', '투자'], ['stats', '📊', '분석'],
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
        {tab === 'home' && <Home kids={kids} allowanceDay={allowanceDay} onGive={() => setSheet({ t: 'give' })}
          onFine={() => setSheet({ t: 'fine' })} onAdd={() => setSheet({ t: 'kid' })}
          onEdit={(k) => setSheet({ t: 'kid', kid: k })} onFocus={(id) => { setFocus(id); setTab('stats') }}
          onSettings={() => setSheet({ t: 'settings' })}
          queueCount={queueCount} onQueue={() => setTab('queue')} signOut={ctx.signOut} />}
        {tab === 'queue' && <Queue completions={completions} reqs={reqs} kmap={kmap} A={A} />}
        {tab === 'quests' && <Quests kids={kids} quests={data.quests} onNew={() => setSheet({ t: 'quest' })}
          onEdit={(q) => setSheet({ t: 'questedit', quest: q })} onPreset={() => setSheet({ t: 'preset' })} />}
        {tab === 'invest' && (
          <>
            {kids.length > 1 && (
              <div className="seg" style={{ margin: '8px 0 2px' }}>
                {kids.map((k) => (
                  <button key={k.id} className={focusKid === k.id ? 'on p' : ''} onClick={() => setFocus(k.id)}>
                    {k.emoji} {k.name}
                  </button>
                ))}
              </div>
            )}
            <Invest kid={kmap[focusKid]} tx={(data.investTx || []).filter((t) => t.member_id === focusKid)}
              ticks={data.investTicks || []} generalTx={data.tx.filter((t) => t.member_id === focusKid)}
              onDelete={(t) => setSheet({ t: 'deltx', tx: t })} readOnly />
          </>
        )}
        {tab === 'stats' && (
          <>
            {/* 분석 탭으로 바로 들어오면 첫째만 보여서, 여기서 아이를 바꿀 수 있게 한다. */}
            {kids.length > 1 && (
              <div className="seg" style={{ margin: '8px 0 2px' }}>
                {kids.map((k) => (
                  <button key={k.id} className={focusKid === k.id ? 'on p' : ''} onClick={() => setFocus(k.id)}>
                    {k.emoji} {k.name}
                  </button>
                ))}
              </div>
            )}
            <Stats kid={kmap[focusKid]} tx={data.tx.filter((t) => t.member_id === focusKid)}
              investTx={(data.investTx || []).filter((t) => t.member_id === focusKid)}
              allowanceDay={allowanceDay} onDelete={(t) => setSheet({ t: 'deltx', tx: t })} />
          </>
        )}
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
      {sheet?.t === 'settings' && <SettingsSheet family={data.family} A={A} onClose={() => setSheet(null)} />}
      {sheet?.t === 'preset' && <PresetQuestSheet kids={kids} quests={data.quests} A={A} onClose={() => setSheet(null)} />}
      {sheet?.t === 'questedit' && <QuestEditSheet q={sheet.quest} A={A} onClose={() => setSheet(null)} />}
      {sheet?.t === 'deltx' && <DeleteTxSheet tx={sheet.tx} A={A} onClose={() => setSheet(null)} />}
    </>
  )
}

function Loading() { return <div className="body"><div className="empty"><span className="e">🐷</span>불러오는 중…</div></div> }

function Home({ kids, allowanceDay, onGive, onFine, onAdd, onEdit, onFocus, onSettings, queueCount, onQueue, signOut }) {
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
          <div className="bal" onClick={() => onFocus(k.id)}>
            <b style={k.balance < 0 ? { color: 'var(--danger)' } : null}>{won(k.balance)}</b><span> 원</span></div>
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
      <button className="btn line" style={{ marginTop: 14 }} onClick={onSettings}>🔔 알림 · ⚙️ 용돈 지급일(매주 {WEEKDAYS[allowanceDay]})</button>
      <button className="btn line" style={{ marginTop: 8, color: 'var(--muted)' }} onClick={signOut}>로그아웃</button>
    </>
  )
}

function Queue({ completions, reqs, kmap, A }) {
  const spend = reqs.filter((r) => r.kind === 'spend')
  const transfer = reqs.filter((r) => r.kind === 'transfer')
  const proposal = reqs.filter((r) => r.kind === 'proposal')
  const investWithdraw = reqs.filter((r) => r.kind === 'invest_withdraw')
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
            <div className="btn-row">
              <ActionButton className="btn line sm" style={{ flex: 1 }}
                onClick={() => A.run(() => api.rejectQuest(q.id), '반려했어요 · 다시 하도록 되돌렸어요')}>반려</ActionButton>
              <ActionButton className="btn coin sm" style={{ flex: 2 }}
                onClick={() => setConfirmQ(q)}>✓ 확인하고 보상 주기</ActionButton>
            </div>
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
                <ActionButton className="btn line sm" onClick={() => A.run(() => api.rejectRequest(p.id), '거절했어요')}>거절</ActionButton>
                <ActionButton className="btn pri sm" onClick={() => A.run(() => api.approveRequest(p.id, A.actor), `${A.actor}가 승인했어요`)}>승인</ActionButton>
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
              <ActionButton className="btn line sm" onClick={() => A.run(() => api.rejectRequest(p.id), '거절했어요')}>거절</ActionButton>
              <ActionButton className="btn pri sm" onClick={() => A.run(() => api.approveRequest(p.id, A.actor), '송금을 승인했어요')}>승인</ActionButton>
            </div>
          </div>
        </div>
      ))}

      {investWithdraw.length > 0 && <div className="sec-t">🌱 투자금 인출 요청 <span className="cnt">{investWithdraw.length}</span></div>}
      {investWithdraw.map((p) => (
        <div className="req invest" key={p.id}>
          <div className="rk" style={{ color: 'var(--mint-ink)' }}>투자 지갑에서 인출</div>
          <div className="rt">{nm(p.member_id)}</div>
          <div className="rd">"{p.memo}"</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="amt-big">{won(p.amount)}원</div>
            <div className="btn-row" style={{ marginLeft: 'auto' }}>
              <ActionButton className="btn line sm" onClick={() => A.run(() => api.rejectRequest(p.id), '거절했어요')}>거절</ActionButton>
              <ActionButton className="btn pri sm" onClick={() => A.run(() => api.approveRequest(p.id, A.actor), '인출을 승인했어요')}>승인</ActionButton>
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
              <ActionButton className="btn line sm" style={{ flex: 1 }} onClick={() => A.run(() => api.rejectRequest(p.id), '거절했어요')}>거절</ActionButton>
              <ActionButton className="btn pri sm" style={{ flex: 1 }} onClick={() => A.run(() => api.approveRequest(p.id, A.actor), '제안을 등록했어요')}>승인해서 등록</ActionButton>
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
  const [bonusInput, setBonusInput] = useState('')
  // 부모가 적은 금액 그대로 준다(단위 제한 없음).
  const bonus = Math.max(0, Math.floor(+bonusInput || 0))
  const go = async () => {
    // 축하 연출은 아이 화면에서 뜬다(부모는 승인만).
    const ok = await A.run(() => api.confirmQuest(q.id, bonus, A.actor), `${won(base + bonus)}원 보상을 지급했어요`)
    if (ok) onClose()
  }
  return (
    <Sheet title={`${q.title} 확인 ✓`} sub="잘했으면 보너스를 더 줄 수 있어요" onClose={onClose}>
      <div className="calc">기본 보상 {won(base)}원 · 난이도 {stars(q.submission?.diff || 0)}</div>
      <div className="field" style={{ marginTop: 14 }}><label>보너스 (선택)</label>
        <input type="number" inputMode="numeric" min="0" value={bonusInput}
          onChange={(e) => setBonusInput(e.target.value)} placeholder="예: 700" />
      </div>
      <div className="calc" style={{ background: 'var(--coin-soft)', color: 'var(--coin-ink)' }}>총 {won(base + bonus)}원 지급</div>
      <ActionButton className="btn coin" style={{ marginTop: 14 }} onClick={go}>🎉 보상 지급하기</ActionButton>
    </Sheet>
  )
}

function Quests({ kids, quests, onNew, onEdit, onPreset }) {
  // 아이마다 퀘스트가 십여 개라 전부 나열하면 스크롤이 길어진다. 카테고리로 접는다.
  const [openKey, setOpenKey] = useState(null)
  return (
    <>
      <div className="btn-row" style={{ margin: '6px 0 10px' }}>
        <button className="btn pri" onClick={onNew}>＋ 새 퀘스트</button>
        <button className="btn line" onClick={onPreset}>📋 협의 목록 불러오기</button>
      </div>
      <div className="msub" style={{ textAlign: 'center' }}>
        목록의 퀘스트는 계속 남아 반복 도전할 수 있어요 · ✏️ 로 보상 수정·삭제</div>
      {kids.map((k) => {
        const qs = quests.filter((q) => q.member_id === k.id)
        const byCat = {}
        qs.forEach((q) => { (byCat[q.category] || (byCat[q.category] = [])).push(q) })
        const cats = Object.keys(QCAT).filter((c) => byCat[c] && byCat[c].length)
        return (
          <div key={k.id}>
            <div className="sec-t">{k.emoji} {k.name} <span className="cnt">{qs.length}</span></div>
            {qs.length === 0 && <div className="empty" style={{ padding: 18 }}>아직 퀘스트가 없어요</div>}
            {cats.map((c) => {
              const key = k.id + ':' + c
              const isOpen = openKey === key
              const list = byCat[c]
              return (
                <div key={key}>
                  <button className="sblock" onClick={() => setOpenKey(isOpen ? null : key)}>
                    <span className="em">{QCAT[c].e}</span>
                    <div><div className="t">{QCAT[c].n}</div><div className="d">{list.length}개</div></div>
                    <span className="rt" style={{ color: 'var(--faint)' }}>{isOpen ? '▾' : '▸'}</span>
                  </button>
                  {isOpen && list.map((q) => <QuestCard key={q.id} q={q} onEdit={onEdit} />)}
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}

export function QuestCard({ q, child, onApply, onSubmit, onCancel, onEdit }) {
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
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn coin sm" style={{ flex: 1 }} onClick={() => onSubmit(q)}>다 했어요 ✓</button>
            <button className="btn line sm" style={{ flex: '0 0 auto', color: 'var(--muted)' }}
              onClick={() => onCancel(q)}>취소</button>
          </div>
        </>}
      </div>
      {onEdit && <button className="delbtn" style={{ marginLeft: 0 }} onClick={() => onEdit(q)} title="보상 수정·삭제">✏️</button>}
    </div>
  )
}

export function Stats({ kid, tx, investTx = [], allowanceDay = 6, onDelete }) {
  const [period, setPeriod] = useState('week')
  if (!kid) return <div className="empty">아이를 선택하세요</div>

  const weekStart = allowanceWeekStart(allowanceDay)
  const from = period === 'month' ? weekStart.getTime() - 21 * 86400 * 1000 : weekStart.getTime()
  // 투자 입출금(grp='invest')은 수입/지출이 아니라 "돈을 옮긴 것"이라 여기 집계에서 뺀다 —
  // 안 빼면 투자하기가 '쓴 돈'으로, 인출이 '번 돈'으로 잡혀 숫자가 왜곡된다.
  const ftx = tx.filter((t) => new Date(t.created_at).getTime() >= from && t.grp !== 'invest')
  const inWin = ftx.length
  const caption = period === 'week'
    ? `${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일(${WEEKDAYS[allowanceDay]}) 지급일부터`
    : '최근 4주'
  const spent = ftx.filter((t) => t.sign < 0).reduce((a, t) => a + t.amount, 0)
  const earned = ftx.filter((t) => t.sign > 0).reduce((a, t) => a + t.amount, 0)

  // 투자는 용돈과 금액 단위가 다르다(목돈 vs 용돈) — 같은 그래프에 섞으면
  // 비율이 깨지므로, 용돈 도넛/막대와는 완전히 분리된 자기들끼리의 그래프로 보여준다.
  const investPeriod = investTx.filter((t) => new Date(t.created_at).getTime() >= from)
  const investEarned = investPeriod.filter((t) => t.kind === 'interest').reduce((a, t) => a + t.amount, 0)
  const investDeposited = investPeriod.filter((t) => t.kind === 'deposit').reduce((a, t) => a + t.amount, 0)
  const investWithdrawn = investPeriod.filter((t) => t.kind === 'withdraw').reduce((a, t) => a + t.amount, 0)
  const investData = [
    { label: '넣은 돈', emoji: '🌱', color: 'var(--mint)', value: investDeposited },
    { label: '뺀 돈', emoji: '💵', color: 'var(--spend)', value: investWithdrawn },
    { label: '이자로 번 돈', emoji: '📈', color: 'var(--coin)', value: investEarned },
  ].filter((d) => d.value > 0)

  const incomeCats = { weekly: ['주간 용돈', 'var(--mint)'], quest: ['퀘스트', 'var(--coin)'], transfer: ['받은 돈', 'var(--spend)'], manual: ['직접 받음', 'var(--mint-ink)'] }
  const inc = {}
  ftx.filter((t) => t.sign > 0).forEach((t) => { const k = incomeCats[t.category] ? t.category : 'manual'; inc[k] = (inc[k] || 0) + t.amount })
  const incData = Object.entries(inc).map(([c, v]) => ({ label: incomeCats[c][0], color: incomeCats[c][1], value: v }))

  const spColors = { food: '#E58F2F', toy: '#E5573F', study_buy: '#0FA98C', book: '#4C82F7', gift: '#C65CC6', donate: '#2FA86A', game: '#7A5CF0', tv: '#F5B133', fine: '#B3261E', transfer: '#4C82F7' }
  const sp = {}
  // 벌금·송금도 '나간 돈'이므로 함께 보여준다(예전엔 벌금이 빠져 있었다).
  ftx.filter((t) => t.sign < 0).forEach((t) => { sp[t.category] = (sp[t.category] || 0) + t.amount })
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
        <button className={period === 'week' ? 'on p' : ''} onClick={() => setPeriod('week')}>이번 주</button>
        <button className={period === 'month' ? 'on p' : ''} onClick={() => setPeriod('month')}>최근 4주</button>
      </div>
      <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--faint)', marginBottom: 8 }}>{caption}</div>
      <div className="card" style={{ display: 'flex', gap: 10, padding: 13 }}>
        <div style={{ flex: 1 }}><div className="rt" style={{ fontSize: 11.5, color: 'var(--muted)' }}>모은 돈</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 20, color: 'var(--good)' }}>+{won(earned)}</div></div>
        <div style={{ flex: 1 }}><div className="rt" style={{ fontSize: 11.5, color: 'var(--muted)' }}>쓴 돈</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 20, color: 'var(--danger)' }}>-{won(spent)}</div></div>
      </div>
      {!inWin && <div className="empty" style={{ padding: 24 }}>이 기간엔 내역이 없어요<br />{period === 'week' ? '"최근 4주"로 넓혀 보세요' : ''}</div>}
      <div className="sec-t">{kid.emoji} {kid.name} · 💰 어디서 들어왔나</div>
      <div className="card">{incData.length ? <Donut data={incData} /> : <div className="empty" style={{ padding: 10 }}>아직 수입이 없어요</div>}</div>
      <div className="sec-t">💸 돈이 어디로 나갔나</div>
      {spData.length ? <div className="card"><Bars data={spData} /></div> : <div className="empty" style={{ padding: 20 }}>아직 나간 돈이 없어요</div>}
      <div className="sec-t">🏆 퀘스트로 번 돈 · 힘든 정도</div>
      <div className="card">
        {qeArr.length ? qeArr.map(([name, d]) => {
          const avg = d.diffs.length ? Math.round(d.diffs.reduce((a, b) => a + b, 0) / d.diffs.length) : 0
          return <div className="valrow" key={name}><span>{name}</span>
            {avg ? <span className="star">{stars(avg)}</span> : null}
            <span className="vv">{won(d.total)}원</span></div>
        }) : <div className="empty" style={{ padding: 10 }}>아직 퀘스트로 번 돈이 없어요</div>}
      </div>

      {/* 투자는 용돈 금액과 단위가 달라 그래프를 따로 둔다 — 관리·삭제는 "🌱 투자" 탭에서 한다. */}
      <div className="sec-t">🌱 투자 활동 <span className="cnt">용돈과 별도</span></div>
      {investData.length ? <div className="card"><Bars data={investData} /></div>
        : <div className="empty" style={{ padding: 20 }}>이 기간엔 투자 활동이 없어요</div>}

      {onDelete && (
        <>
          <div className="sec-t">🧾 내역 관리 <span className="cnt">삭제 가능</span></div>
          <div className="card" style={{ padding: '5px 13px' }}>
            {ftx.length === 0 && <div className="empty" style={{ padding: 14 }}>이 기간 내역이 없어요</div>}
            {ftx.map((t) => {
              const [ic, cl] = txIcon(t)
              return (
                <div className="tx" key={t.id}>
                  <div className={'ti ' + cl}>{ic}</div>
                  <div style={{ minWidth: 0 }}><div className="tl">{t.label}</div>
                    <div className="td">{new Date(t.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}{t.by_actor ? ` · ${t.by_actor}` : ''}</div></div>
                  <div className={'tv ' + (t.sign > 0 ? 'plus' : 'minus')} style={{ marginLeft: 'auto' }}>{t.sign > 0 ? '+' : '-'}{won(t.amount)}</div>
                  <button className="delbtn" onClick={() => onDelete(t)} title="삭제">🗑</button>
                </div>
              )
            })}
          </div>
          <div className="msub" style={{ textAlign: 'center' }}>삭제하면 잔액도 함께 되돌아가요 · 비밀번호 확인 필요</div>
        </>
      )}
    </>
  )
}

// 투자 지갑 화면. 부모(읽기 전용)·아이(입금/인출 버튼) 양쪽에서 같은 모양으로 쓴다.
export function Invest({ kid, tx, ticks, generalTx = [], onDeposit, onWithdraw, onDelete, readOnly }) {
  const [openTick, setOpenTick] = useState(null)
  if (!kid) return <div className="empty">아이를 선택하세요</div>
  const total = (kid.invest_principal || 0) + (kid.invest_pending || 0)
  const sorted = [...tx].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <>
      <div className="card invest-hero">
        <div className="lab">🌱 투자 지갑</div>
        <div><span className="amt">{won(total)}</span><span className="won"> 원</span></div>
        {kid.invest_pending > 0 && (
          <div className="note">이번에 넣은 {won(kid.invest_pending)}원은 다음 정산부터 이자가 붙어요</div>
        )}
      </div>
      <div className="card">
        {/* 아이는 자라는 나무로(직관적), 부모는 정밀한 그래프로(정확한 수치) */}
        {readOnly
          ? <InvestVine tx={tx} onTapTick={setOpenTick} />
          : <InvestTree total={total} tx={tx} onTapTick={setOpenTick} />}
      </div>
      {!readOnly && (
        <div className="btn-row">
          <button className="btn pri" onClick={onDeposit}>🌱 투자하기</button>
          <button className="btn line" onClick={onWithdraw}>💵 인출하기</button>
        </div>
      )}
      <div className="sec-t">투자 내역{onDelete ? <span className="cnt">삭제 가능</span> : null}</div>
      <div className="card" style={{ padding: '5px 13px' }}>
        {sorted.length === 0 && <div className="empty" style={{ padding: 18 }}>아직 투자 내역이 없어요</div>}
        {sorted.map((t) => {
          const em = t.kind === 'interest' ? '📈' : t.kind === 'deposit' ? '🌱' : '💵'
          const title = t.kind === 'interest' ? '이자가 붙었어요' : t.kind === 'deposit' ? '투자하기' : `인출 · ${t.memo || ''}`
          // 삭제는 investTx 가 아니라 그와 연결된 transactions 행을 지워야 한다(delete_transaction 이 그걸 봄).
          const linked = onDelete && t.kind !== 'interest' ? generalTx.find((g) => g.invest_tx_id === t.id) : null
          return (
            <div className="tx" key={t.id} onClick={() => t.kind === 'interest' && setOpenTick(t)}
              style={t.kind === 'interest' ? { cursor: 'pointer' } : null}>
              <div className="ti ic-invest">{em}</div>
              <div><div className="tl">{title}</div>
                <div className="td">{new Date(t.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</div></div>
              <div className={'tv ' + (t.sign > 0 ? 'plus' : 'minus')} style={{ marginLeft: 'auto' }}>{t.sign > 0 ? '+' : '-'}{won(t.amount)}</div>
              {linked && <button className="delbtn" onClick={(e) => { e.stopPropagation(); onDelete(linked) }} title="삭제">🗑</button>}
            </div>
          )
        })}
      </div>
      {openTick && <InvestTickSheet tx={openTick} ticks={ticks} onClose={() => setOpenTick(null)} />}
    </>
  )
}

function InvestTickSheet({ tx, ticks, onClose }) {
  const [detail, setDetail] = useState(false)
  const tick = ticks.find((k) => k.id === tx.tick_id)
  const band = investBand(tick?.rate_pct ?? 1)
  return (
    <Sheet title={`${band.e} ${band.t}`} onClose={onClose}>
      <div className="calc">+{won(tx.amount)}원</div>
      {!detail ? (
        <button className="btn line" style={{ marginTop: 10 }} onClick={() => setDetail(true)}>자세히 보기</button>
      ) : tick ? (
        <div className="msub" style={{ marginTop: 10, textAlign: 'center', lineHeight: 1.7 }}>
          S&P500 지수가 {tick.change_pct}% {tick.change_pct > 0 ? '올라서' : tick.change_pct < 0 ? '내려서' : '제자리라서'} {tick.rate_pct}% 이율이 적용됐어요<br />
          <span style={{ color: 'var(--faint)' }}>{tick.window_start} ~ {tick.window_end}</span>
        </div>
      ) : <div className="msub" style={{ marginTop: 10, textAlign: 'center' }}>자세한 정보를 찾을 수 없어요</div>}
    </Sheet>
  )
}

// ---------------- Sheets ----------------
function GiveSheet({ kids, A, onClose }) {
  const token = useIdemToken()
  const [kid, setKid] = useState(kids[0]?.id || '')
  const [amt, setAmt] = useState('')
  const [memo, setMemo] = useState('')
  const [toInvest, setToInvest] = useState(false)
  const go = async () => {
    if (!+amt) return
    const ok = await A.run(() => api.give(kid, +amt, memo, A.actor, token, toInvest),
      toInvest ? `${A.actor}가 투자 지갑으로 바로 넣었어요 🌱` : `${A.actor}가 용돈을 지급했어요 🎁`)
    if (ok) onClose()
  }
  return (
    <Sheet title="🎁 용돈 주기" sub="아이에게 용돈을 지급해요" onClose={onClose}>
      <div className="field"><label>누구에게?</label>
        <select value={kid} onChange={(e) => setKid(e.target.value)}>
          {kids.map((k) => <option key={k.id} value={k.id}>{k.emoji} {k.name} ({won(k.balance)}원)</option>)}
        </select></div>
      <div className="field"><label>금액 (원)</label><input type="number" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="예: 3000" /></div>
      <div className="field"><label>메모</label><input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 할머니가 주신 용돈" /></div>
      <button type="button" className="sblock" onClick={() => setToInvest((v) => !v)}
        style={toInvest ? { borderColor: 'var(--mint)', background: 'var(--mint-soft)' } : null}>
        <span className="em">🌱</span>
        <div><div className="t">바로 투자 지갑으로</div>
          <div className="d">목돈 선물 같은 건 용돈 지갑을 거치지 않고 바로 투자로 넣을 수 있어요</div></div>
        <span className="rt" style={{ color: toInvest ? 'var(--mint-ink)' : 'var(--faint)' }}>{toInvest ? 'ON' : 'OFF'}</span>
      </button>
      <ActionButton className="btn pri" style={{ marginTop: 12 }} onClick={go}>
        {toInvest ? '투자 지갑으로 넣기' : '용돈 주기'}</ActionButton>
    </Sheet>
  )
}

function FineSheet({ kids, A, onClose }) {
  const token = useIdemToken()
  const [kid, setKid] = useState(kids[0]?.id || '')
  const [amt, setAmt] = useState('')
  const [reason, setReason] = useState('')
  const go = async () => {
    if (!+amt) return
    const ok = await A.run(() => api.issueFine(kid, +amt, reason, A.actor, token), `${A.actor}가 벌금을 부과했어요`)
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
      <ActionButton className="btn danger" onClick={go}>벌금 부과하기</ActionButton>
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
      <ActionButton className="btn pri" onClick={go}>퀘스트 등록</ActionButton>
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
      <ActionButton className="btn pri" onClick={go}>{isNew ? '추가하기' : '저장하기'}</ActionButton>
    </Sheet>
  )
}

function PresetQuestSheet({ kids, quests, A, onClose }) {
  const [kid, setKid] = useState(kids[0]?.id || '')
  const [picked, setPicked] = useState(() => new Set(PRESET_QUESTS.filter((p) => !p.who).map((p) => p.title)))
  const existing = new Set(quests.filter((q) => q.member_id === kid).map((q) => q.title))
  const toAdd = PRESET_QUESTS.filter((p) => picked.has(p.title) && !existing.has(p.title))

  const toggle = (title) => setPicked((prev) => {
    const next = new Set(prev)
    next.has(title) ? next.delete(title) : next.add(title)
    return next
  })
  const go = async () => {
    if (!toAdd.length) { A.toast('추가할 퀘스트를 골라주세요'); return }
    const ok = await A.run(() => api.createQuests(A.me.family_id, kid, toAdd, A.actor),
      `${toAdd.length}개 퀘스트를 등록했어요 🏆`)
    if (ok) onClose()
  }

  return (
    <Sheet title="📋 협의 목록 불러오기" sub="미리 정해둔 칭찬 코인 목록이에요. 모두 건당 500원." onClose={onClose}>
      <div className="field"><label>누구의 퀘스트로 등록할까요?</label>
        <select value={kid} onChange={(e) => setKid(e.target.value)}>
          {kids.map((k) => <option key={k.id} value={k.id}>{k.emoji} {k.name}</option>)}
        </select></div>
      {PRESET_QUESTS.map((p) => {
        const already = existing.has(p.title)
        const on = picked.has(p.title)
        return (
          <button key={p.title} className="sblock" disabled={already}
            style={already ? { opacity: 0.5 } : on ? { borderColor: 'var(--mint)', background: 'var(--mint-soft)' } : null}
            onClick={() => toggle(p.title)}>
            <span className="em">{already ? '✔️' : on ? '☑️' : '⬜'}</span>
            <div><div className="t">{QCAT[p.category].e} {p.title}</div>
              <div className="d">
                {already ? '이미 등록됨' : `${p.unit ? p.unit + '당 ' : ''}500원${p.who ? ` · ${p.who} 전용` : ''}`}
              </div></div>
          </button>
        )
      })}
      <ActionButton className="btn pri" style={{ marginTop: 6 }} onClick={go}>
        {toAdd.length ? `${toAdd.length}개 등록하기` : '등록할 항목을 골라주세요'}
      </ActionButton>
    </Sheet>
  )
}

function QuestEditSheet({ q, A, onClose }) {
  const [title, setTitle] = useState(q.title)
  const [cat, setCat] = useState(q.category)
  const [reward, setReward] = useState(q.reward)
  const [confirmDel, setConfirmDel] = useState(false)
  const unitLabel = q.reward_type === 'unit' ? `${q.unit || '개'}당 보상 (원)` : '보상 (원)'
  const save = async () => {
    const ok = await A.run(
      () => api.updateQuest(q.id, { title: title.trim() || q.title, category: cat, reward: +reward || 0 }),
      '퀘스트를 수정했어요')
    if (ok) onClose()
  }
  const del = async () => {
    const ok = await A.run(() => api.deleteQuest(q.id), '퀘스트를 목록에서 지웠어요')
    if (ok) onClose()
  }
  return (
    <Sheet title="✏️ 퀘스트 수정" sub="목록에 계속 남는 퀘스트예요. 보상을 바꾸거나 목록에서 뺄 수 있어요." onClose={onClose}>
      <div className="field"><label>무슨 일?</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label>종류</label>
        <div className="chips">
          {Object.entries(QCAT).map(([k, c]) => (
            <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{c.e} {c.n}</button>
          ))}
        </div></div>
      <div className="field"><label>{unitLabel}</label>
        <input type="number" inputMode="numeric" value={reward} onChange={(e) => setReward(e.target.value)} /></div>
      <ActionButton className="btn pri" onClick={save}>저장하기</ActionButton>
      {!confirmDel ? (
        <button className="btn line" style={{ marginTop: 8, color: 'var(--danger)' }} onClick={() => setConfirmDel(true)}>
          목록에서 삭제</button>
      ) : (
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn line" onClick={() => setConfirmDel(false)}>취소</button>
          <ActionButton className="btn danger" onClick={del}>정말 삭제</ActionButton>
        </div>
      )}
      <div className="msub" style={{ marginTop: 10, textAlign: 'center' }}>
        삭제해도 이미 지급된 보상 내역은 그대로 남아요</div>
    </Sheet>
  )
}

function DeleteTxSheet({ tx, A, onClose }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  // 투자와 연결된 내역(바로 투자로 준 용돈, 아이의 투자하기, 인출 승인)은
  // 이 한 줄만으로 잔액 변화를 예측할 수 없다 — 투자 지갑도 함께 움직인다.
  const investLinked = tx.grp === 'invest' || !!tx.related_id
  const back = investLinked
    ? '투자 지갑과 연결된 내역이에요 · 삭제하면 투자 지갑 금액도 함께 되돌아가요'
    : tx.sign > 0 ? `아이 잔액에서 ${won(tx.amount)}원이 다시 회수돼요`
    : `아이 잔액에 ${won(tx.amount)}원이 돌아가요`
  const go = async () => {
    if (!pw) return
    setBusy(true)
    try { await api.verifyPassword(pw) }
    catch (e) { A.toast('⚠️ ' + (e.message || '비밀번호 오류')); setBusy(false); return }
    const ok = await A.run(() => api.deleteTransaction(tx.id), '내역을 삭제하고 잔액을 되돌렸어요')
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Sheet title="🗑 내역 삭제" sub="대시보드 정확성을 위한 관리 기능이에요" onClose={onClose}>
      <div className="calc" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
        {tx.label} · {tx.sign > 0 ? '+' : '-'}{won(tx.amount)}원</div>
      <div className="msub" style={{ marginTop: 8 }}>{back}</div>
      <div className="field" style={{ marginTop: 12 }}><label>부모 비밀번호 확인</label>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호를 한 번 더 입력" /></div>
      <button className="btn danger" disabled={busy} onClick={go}>{busy ? '확인 중…' : '삭제하기'}</button>
    </Sheet>
  )
}

function SettingsSheet({ family, A, onClose }) {
  const [day, setDay] = useState(family?.allowance_day ?? 6)
  const go = async () => {
    const ok = await A.run(() => api.updateFamily(A.me.family_id, { allowance_day: day }), '용돈 지급일을 저장했어요')
    if (ok) onClose()
  }
  return (
    <Sheet title="⚙️ 설정" sub="알림과 주간 용돈 지급 요일을 정해요." onClose={onClose}>
      <div className="field"><label>알림</label>
        <PushToggle toast={A.toast} /></div>
      <div className="field"><label>용돈 지급 요일</label>
        <div className="chips">
          {WEEKDAYS.map((w, i) => <button key={i} className={day === i ? 'on' : ''} onClick={() => setDay(i)}>{w}</button>)}
        </div>
      </div>
      <ActionButton className="btn pri" onClick={go}>저장하기</ActionButton>
      <div className="msub" style={{ textAlign: 'center', marginTop: 10 }}>빌드 {__BUILD__}</div>
    </Sheet>
  )
}

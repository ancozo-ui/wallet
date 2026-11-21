import { useEffect, useRef, useState } from 'react'
import { SUBJECTS, makeQuestions, shuffle } from './quizData'
import { useIdemToken, ActionButton } from './ui'
import { won } from './const'
import * as api from './api'

// 보상 구간표를 "80점 200원 · 90점 300원 · 100점 500원" 으로.
export const tierText = (tiers) =>
  (tiers || []).slice().sort((a, b) => a.min - b.min).map((t) => `${t.min}점 ${won(t.reward)}원`).join(' · ')

// 오답노트에서 같은 문제를 알아보는 표식
export const noteKey = (subject, q) => `${subject}|${q.q}|${q.answer}`

const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// 🎲 퀴즈 한 판 전체 화면. 시작 → 풀이 → 결과. 중간에 나가면 보상이 없다(끝까지 해야 점수가 인정돼요).
export default function Quiz({ cfg, ctx, onClose }) {
  const [round, setRound] = useState(0)
  return <Round key={round} cfg={cfg} ctx={ctx} onClose={onClose} onAgain={() => setRound((r) => r + 1)} />
}

function Round({ cfg, ctx, onClose, onAgain }) {
  const token = useIdemToken()
  const practice = !!cfg.practice
  const sub = SUBJECTS[cfg.subject] || SUBJECTS.practice
  const [phase, setPhase] = useState('ready')       // ready | run | done
  const [qs, setQs] = useState([])
  const [idx, setIdx] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [fb, setFb] = useState(null)                // { ok, picked } 답을 고른 직후 잠깐 보여 주는 결과
  const [typed, setTyped] = useState('')
  const [now, setNow] = useState(Date.now())
  const [confirmExit, setConfirmExit] = useState(false)
  const [result, setResult] = useState(null)        // { reward, secs, correct } | { error }
  const logRef = useRef([])                         // 푼 문제 기록 → 오답노트
  const [log, setLog] = useState([])
  const startRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])
  useEffect(() => {
    if (phase !== 'run') return undefined
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [phase])

  const start = () => {
    const base = practice
      ? shuffle(cfg.questions).map((q) => (q.kind === 'choice' ? { ...q, options: shuffle(q.options) } : q))
      : makeQuestions(cfg.subject, cfg.question_count).map((q) => ({ ...q, _sj: cfg.subject }))
    setQs(base)
    logRef.current = []; setLog([])
    setIdx(0); setCorrect(0); setFb(null); setTyped('')
    startRef.current = Date.now(); setNow(Date.now())
    setPhase('run')
  }

  // 푼 결과를 오답노트에 반영(실패해도 퀴즈 결과에는 영향 없음)
  const saveNotes = async () => {
    const items = logRef.current.map((l) => ({ subject: l.sj, key: l.key, ok: l.ok, picked: l.picked, q: l.q }))
    if (!items.length) return
    try { await api.quizNoteSave(items) } catch { /* 노트 저장 실패는 무시 */ }
  }
  const leave = () => {
    if (phase === 'run' && logRef.current.length) saveNotes().then(() => ctx.reload().catch(() => {}))
    onClose()
  }

  const finish = async (finalCorrect) => {
    const secs = Math.max(1, Math.round((Date.now() - startRef.current) / 1000))
    setPhase('done')
    setResult({ pending: true, secs, correct: finalCorrect })
    if (practice) {
      await saveNotes()
      setResult({ reward: 0, secs, correct: finalCorrect })
      ctx.reload().catch(() => {})
      return
    }
    await saveNotes()   // 보상 저장이 실패해도 틀린 문제는 노트에 남긴다
    try {
      const reward = await api.quizFinish(cfg.subject, finalCorrect, cfg.question_count, secs, token)
      setResult({ reward: reward || 0, secs, correct: finalCorrect })
      ctx.reload().catch(() => {})
    } catch (e) {
      setResult({ error: e.message || '저장하지 못했어요', secs, correct: finalCorrect })
    }
  }

  const answer = (given) => {
    if (fb) return
    const q = qs[idx]
    const ok = String(given) === q.answer
    const nextCorrect = correct + (ok ? 1 : 0)
    const { _sj, ...payload } = q
    logRef.current.push({ sj: _sj, key: noteKey(_sj, q), ok, picked: String(given), q: payload })
    setLog(logRef.current.slice())
    setFb({ ok, picked: given })
    setCorrect(nextCorrect)
    timerRef.current = setTimeout(() => {
      setFb(null); setTyped('')
      if (idx + 1 >= qs.length) finish(nextCorrect)
      else setIdx(idx + 1)
    }, ok ? 550 : 1300)
  }

  const press = (k) => {
    if (fb) return
    if (k === 'del') setTyped((t) => t.slice(0, -1))
    else if (k === 'ok') { if (typed) answer(typed) }
    else setTyped((t) => (t.length < 3 ? t + k : t))
  }

  // ---------- 시작 ----------
  if (phase === 'ready') {
    return (
      <div className="quiz">
        <div className="quiz-top"><button className="quiz-x" onClick={onClose}>✕</button></div>
        <div className="quiz-center">
          <div className="quiz-big">{sub.e}</div>
          <h2>{practice ? '오답 다시 풀기' : `${sub.n} 퀴즈`}</h2>
          <p className="quiz-p"><b>{cfg.question_count}문제</b>를 {practice ? '다시 풀어 봐요' : '끝까지 풀어요'}</p>
          {practice ? (
            <div className="quiz-tiers"><div>용돈은 없지만</div><div><b>2번 연속</b> 맞히면 <span>졸업! 🎓</span></div></div>
          ) : (
            <div className="quiz-tiers">
              {(cfg.tiers || []).slice().sort((a, b) => a.min - b.min).map((t) => (
                <div key={t.min}><b>{t.min}점</b> 이상 <span>+{won(t.reward)}원</span></div>
              ))}
            </div>
          )}
          <p className="quiz-p quiz-sm">{practice ? '틀렸던 문제만 모았어요 · 천천히 해 보자! 💪' : '중간에 나가면 용돈이 없어요 · 끝까지 집중해 보자! 💪'}</p>
          <button className="btn coin quiz-go" onClick={start}>시작하기</button>
        </div>
      </div>
    )
  }

  // ---------- 결과 ----------
  if (phase === 'done') {
    const pct = Math.floor((result.correct * 100) / cfg.question_count)
    const sorted = (cfg.tiers || []).slice().sort((a, b) => a.min - b.min)
    const next = sorted.find((t) => t.min > pct)
    return (
      <div className="quiz">
        <div className="quiz-center">
          <div className="quiz-big">{result.error ? '😢' : result.reward > 0 || (practice && !result.pending) ? '🎉' : '💪'}</div>
          <h2>{result.correct} / {cfg.question_count} 맞았어요</h2>
          <p className="quiz-p tnum">걸린 시간 {fmtSec(result.secs)}{practice ? '' : ` · ${pct}점`}</p>
          {result.pending && <p className="quiz-p">용돈 확인 중…</p>}
          {!result.pending && !result.error && result.reward > 0 && <div className="quiz-reward">+{won(result.reward)}원</div>}
          {!result.pending && !result.error && practice && (
            <p className="quiz-p">{log.some((l) => !l.ok) ? '틀린 건 오답노트에 그대로 남아요. 또 도전해 봐요!' : '모두 맞혔어요! 한 번 더 맞히면 졸업이에요 🎓'}</p>
          )}
          {!result.pending && !result.error && !practice && result.reward === 0 && (
            <p className="quiz-p">{sorted[0] ? `${sorted[0].min}점부터 용돈이 나와요. 다시 도전해 볼까?` : '다시 도전해 볼까?'}</p>
          )}
          {!result.pending && !result.error && !practice && result.reward > 0 && next && (
            <p className="quiz-p quiz-sm">{next.min}점이면 {won(next.reward)}원이야!</p>
          )}
          {result.error && (
            <>
              <p className="quiz-p" style={{ color: 'var(--danger)' }}>{result.error}</p>
              <ActionButton className="btn coin quiz-go" onClick={async () => {
                setResult({ pending: true, secs: result.secs, correct: result.correct })
                try {
                  const reward = await api.quizFinish(cfg.subject, result.correct, cfg.question_count, result.secs, token)
                  setResult({ reward: reward || 0, secs: result.secs, correct: result.correct })
                  ctx.reload().catch(() => {})
                } catch (e) { setResult({ error: e.message || '저장하지 못했어요', secs: result.secs, correct: result.correct }) }
              }}>다시 저장하기</ActionButton>
            </>
          )}
          {!result.pending && log.some((l) => !l.ok) && (
            <div className="quiz-wrongs">
              <div className="quiz-wt">📒 틀린 문제 {log.filter((l) => !l.ok).length}개 — 오답노트에 담았어요</div>
              {log.filter((l) => !l.ok).map((l, i) => (
                <div key={i} className="quiz-w">
                  <div className="qq">{l.q.q}{l.q.sub ? <span className="qs"> · {l.q.sub}</span> : null}</div>
                  <div className="qa"><span className="no">내 답 {l.picked}</span><span className="ok">정답 {l.q.answer}</span></div>
                </div>
              ))}
            </div>
          )}
          {!result.pending && !result.error && (
            <>
              <button className="btn coin quiz-go" onClick={onAgain}>{practice ? '한 번 더 풀기' : '한 번 더 도전'}</button>
              <button className="btn line quiz-go" onClick={onClose}>그만하기</button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ---------- 풀이 ----------
  const q = qs[idx]
  const elapsed = Math.max(0, Math.floor((now - startRef.current) / 1000))
  return (
    <div className="quiz">
      <div className="quiz-top">
        <button className="quiz-x" onClick={() => setConfirmExit(true)}>✕</button>
        <div className="quiz-prog"><div style={{ width: `${(idx / qs.length) * 100}%` }} /></div>
        <div className="quiz-count tnum">{idx + 1}/{qs.length}</div>
        <div className="quiz-time tnum">⏱ {fmtSec(elapsed)}</div>
      </div>

      <div className="quiz-body">
        {q.sub ? <div className="quiz-sub">{q.sub}</div> : <div className="quiz-sub">&nbsp;</div>}
        <div className={'quiz-q' + (q.big ? ' big' : '') + (q.small ? ' small' : '')}>{q.q}</div>

        {q.kind === 'choice' && (
          <div className="quiz-opts">
            {q.options.map((o) => {
              const isRight = fb && o === q.answer
              const isWrong = fb && !fb.ok && o === fb.picked
              return (
                <button key={o} className={'quiz-opt' + (isRight ? ' right' : '') + (isWrong ? ' wrong' : '')}
                  disabled={!!fb} onClick={() => answer(o)}>{o}</button>
              )
            })}
          </div>
        )}

        {q.kind === 'number' && (
          <>
            <div className={'quiz-ans' + (fb ? (fb.ok ? ' right' : ' wrong') : '')}>
              {fb ? (fb.ok ? `${q.answer} ✓` : `정답은 ${q.answer}`) : (typed || '　')}
            </div>
            <div className="quiz-pad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) => (
                <button key={k} className={'quiz-key' + (k === 'ok' ? ' ok' : '')} disabled={!!fb}
                  onClick={() => press(k)}>{k === 'del' ? '⌫' : k === 'ok' ? '확인' : k}</button>
              ))}
            </div>
          </>
        )}
        {fb && <div className={'quiz-fb ' + (fb.ok ? 'ok' : 'no')}>{fb.ok ? '정답! 👏' : '아쉬워요 😅'}</div>}
      </div>

      {confirmExit && (
        <div className="scrim" onClick={(e) => { if (e.target.classList.contains('scrim')) setConfirmExit(false) }}>
          <div className="sheet">
            <h3>그만할까요?</h3>
            <div className="msub">{practice ? '지금까지 푼 건 오답노트에 반영돼요.' : '지금 나가면 이번 판은 용돈이 없어요. (틀린 문제는 오답노트에 담겨요)'}</div>
            <button className="btn pri" onClick={() => setConfirmExit(false)}>계속 풀기</button>
            <button className="btn line" style={{ marginTop: 8, color: 'var(--muted)' }} onClick={leave}>그만하기</button>
          </div>
        </div>
      )}
    </div>
  )
}

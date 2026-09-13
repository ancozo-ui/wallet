import { useState } from 'react'
import { supabase } from './supabase'

function krErr(msg = '') {
  const m = msg.toLowerCase()
  if (m.includes('email not confirmed')) return '이메일 확인이 필요해요. 관리자(부모)가 Supabase에서 확인 처리해야 해요.'
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않아요.'
  if (m.includes('user already registered')) return '이미 가입된 이메일이에요. 로그인해 주세요.'
  return msg || '문제가 생겼어요'
}

export default function Login({ toast }) {
  const [mode, setMode] = useState('parent') // parent | child
  const [signup, setSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [loginId, setLoginId] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  const parentSubmit = async () => {
    setBusy(true)
    try {
      if (signup) {
        const { data, error } = await supabase.auth.signUp({ email, password: pw })
        if (error) throw error
        if (!data.session) { toast('가입됨! 이메일 확인이 필요할 수 있어요. 로그인해 보세요.'); setSignup(false) }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) throw error
      }
    } catch (e) { toast('⚠️ ' + krErr(e.message)) }
    setBusy(false)
  }

  const childSubmit = async () => {
    setBusy(true)
    try {
      const email = `${loginId.trim().toLowerCase()}@kids.local`
      const { error } = await supabase.auth.signInWithPassword({ email, password: pin })
      if (error) throw error
    } catch (e) { toast('⚠️ 로그인 정보를 확인해 주세요') }
    setBusy(false)
  }

  return (
    <div className="body" style={{ padding: 22, display: 'flex', flexDirection: 'column', minHeight: 480 }}>
      <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 6 }}>
        <div style={{ fontSize: 52 }}>🐷</div>
        <div style={{ fontFamily: 'var(--disp)', fontSize: 28 }}>용돈 나라</div>
        <div className="msub">우리 가족 용돈 지갑</div>
      </div>

      <div className="seg" style={{ margin: '10px 0 18px' }}>
        <button className={mode === 'parent' ? 'on p' : ''} onClick={() => setMode('parent')}>👨‍👩 부모</button>
        <button className={mode === 'child' ? 'on' : ''} onClick={() => setMode('child')}>🧒 아이</button>
      </div>

      {mode === 'parent' ? (
        <>
          <div className="field"><label>이메일</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@email.com" /></div>
          <div className="field"><label>비밀번호</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" /></div>
          <button className="btn pri" disabled={busy} onClick={parentSubmit}>
            {busy ? '처리 중…' : (signup ? '회원가입' : '로그인')}</button>
          <button className="btn line" style={{ marginTop: 8 }} onClick={() => setSignup(!signup)}>
            {signup ? '이미 계정이 있어요 · 로그인' : '처음이에요 · 회원가입'}</button>
        </>
      ) : (
        <>
          <div className="field"><label>내 아이디</label>
            <input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="예: hajun" /></div>
          <div className="field"><label>PIN 번호</label>
            <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" /></div>
          <button className="btn pri" disabled={busy} onClick={childSubmit}>{busy ? '처리 중…' : '들어가기'}</button>
          <div className="msub" style={{ marginTop: 12, textAlign: 'center' }}>
            아이디·PIN은 부모님이 만들어줘요</div>
        </>
      )}
    </div>
  )
}

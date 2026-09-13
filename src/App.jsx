import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getMyMember, createFamily, loadParent, loadChild, subscribeFamily } from './api'
import { Toast, Celebrate, useToast } from './ui'
import Parent from './Parent'
import Child from './Child'
import Login from './Login'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined=로딩
  const [me, setMe] = useState(undefined)
  const [data, setData] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [cele, setCele] = useState(0)
  const [toastMsg, toast] = useToast()

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    addEventListener('online', on); addEventListener('offline', off)
    return () => { removeEventListener('online', on); removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return
    if (!session) { setMe(null); setData(null); return }
    setMe(undefined)
    getMyMember().then((m) => setMe(m || null)).catch(() => setMe(null))
  }, [session])

  const reload = useCallback(async () => {
    if (!me) return
    try {
      if (me.role === 'parent') setData(await loadParent())
      else setData(await loadChild(me.id))
    } catch (e) { toast('불러오기 오류: ' + (e.message || '')) }
  }, [me]) // eslint-disable-line

  useEffect(() => {
    if (!me) return
    reload()
    const unsub = subscribeFamily(() => reload())
    return unsub
  }, [me, reload])

  const run = useCallback(async (fn, okMsg, celeAmt) => {
    if (!online) { toast('📡 인터넷에 연결되면 할 수 있어요'); return false }
    try {
      await fn()
      await reload()
      if (celeAmt) setCele(celeAmt)
      if (okMsg) toast(okMsg)
      return true
    } catch (e) { toast('⚠️ ' + (e.message || '문제가 생겼어요')); return false }
  }, [online, reload]) // eslint-disable-line

  const signOut = () => supabase.auth.signOut()

  let screen
  if (session === undefined || (session && me === undefined)) {
    screen = <Splash />
  } else if (!session) {
    screen = <Login toast={toast} />
  } else if (!me) {
    screen = <CreateFamilyGate toast={toast} onDone={() => getMyMember().then((m) => setMe(m || null))} />
  } else {
    const ctx = { me, data, reload, online, run, toast, celebrate: setCele, signOut }
    screen = me.role === 'parent' ? <Parent ctx={ctx} /> : <Child ctx={ctx} />
  }

  return (
    <div className="wrap">
      <div className="phone"><div className={'screen' + (!online ? ' offline' : '')}>{screen}</div></div>
      <Toast msg={toastMsg} />
      {cele > 0 && <Celebrate amount={cele} onDone={() => setCele(0)} />}
    </div>
  )
}

function Splash() {
  return <div className="body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
    <div style={{ textAlign: 'center', color: 'var(--muted)' }}><div style={{ fontSize: 44 }}>🐷</div>불러오는 중…</div>
  </div>
}

function CreateFamilyGate({ toast, onDone }) {
  const [name, setName] = useState('우리집')
  const [parent, setParent] = useState('엄마아빠')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try { await createFamily(name, parent); await onDone() }
    catch (e) { toast('⚠️ ' + (e.message || '')); setBusy(false) }
  }
  return (
    <div className="body" style={{ padding: 22 }}>
      <div style={{ fontSize: 44, textAlign: 'center', marginTop: 20 }}>🏠</div>
      <h3 style={{ fontFamily: 'var(--disp)', fontWeight: 400, fontSize: 22, textAlign: 'center' }}>가족 만들기</h3>
      <div className="msub" style={{ textAlign: 'center' }}>처음 오셨네요! 가족을 먼저 만들어요.</div>
      <div className="field"><label>가족 이름</label>
        <input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>부모 표시 이름</label>
        <input value={parent} onChange={(e) => setParent(e.target.value)} /></div>
      <button className="btn pri" disabled={busy} onClick={go}>{busy ? '만드는 중…' : '가족 만들기'}</button>
    </div>
  )
}

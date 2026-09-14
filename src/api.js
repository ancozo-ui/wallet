import { supabase } from './supabase'

const tok = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

// ---- 신원 / 부트스트랩 ----
export async function getMyMember() {
  const { data, error } = await supabase.from('members').select('*').limit(1).maybeSingle()
  if (error) throw error
  return data // 없으면 null (가족 미생성 부모)
}
export const createFamily = (name, parentName) =>
  rpc('create_family', { p_family_name: name, p_parent_name: parentName })

// ---- 데이터 로드 ----
export async function loadParent() {
  await expireQuests()
  const [family, kids, tx, quests, requests] = await Promise.all([
    supabase.from('families').select('*').limit(1).maybeSingle(),
    supabase.from('members').select('*').eq('role', 'child').order('sort'),
    supabase.from('transactions').select('*').order('created_at', { ascending: false }),
    supabase.from('quests').select('*').order('created_at', { ascending: false }),
    supabase.from('requests').select('*').eq('status', 'pending').order('created_at'),
  ])
  for (const r of [family, kids, tx, quests, requests]) if (r.error) throw r.error
  return { family: family.data, kids: kids.data, tx: tx.data, quests: quests.data, requests: requests.data }
}
export async function loadChild(memberId) {
  await expireQuests()
  const [family, me, tx, quests, fines, mypend, sibs] = await Promise.all([
    supabase.from('families').select('*').limit(1).maybeSingle(),
    supabase.from('members').select('*').eq('id', memberId).single(),
    supabase.from('transactions').select('*').eq('member_id', memberId).order('created_at', { ascending: false }),
    supabase.from('quests').select('*').eq('member_id', memberId).order('created_at', { ascending: false }),
    supabase.from('requests').select('*').eq('kind', 'fine').eq('status', 'pending'),
    supabase.from('requests').select('*').eq('member_id', memberId).eq('status', 'pending').in('kind', ['spend', 'transfer']),
    supabase.rpc('list_siblings'),
  ])
  for (const r of [family, me, tx, quests, fines, mypend, sibs]) if (r.error) throw r.error
  return { family: family.data, me: me.data, tx: tx.data, quests: quests.data, fines: fines.data, myPending: mypend.data || [], siblings: sibs.data || [] }
}
export async function updateFamily(id, fields) {
  const { error } = await supabase.from('families').update(fields).eq('id', id)
  if (error) throw error
}
export const deleteTransaction = (id) => rpc('delete_transaction', { p_tx: id })

// 부모 비밀번호 재확인 (민감 작업 전). 틀리면 throw.
export async function verifyPassword(password) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('로그인 정보를 찾을 수 없어요')
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password })
  if (error) throw new Error('비밀번호가 맞지 않아요')
}

// ---- 부모 행위 ----
// token 은 화면에서 만든 고유 표식(useIdemToken). 재시도해도 서버가 한 번만 처리한다.
export const give = (member, amount, memo, actor, token) =>
  rpc('give_allowance', { p_member: member, p_amount: amount, p_memo: memo, p_actor: actor, p_token: token || tok() })
export const confirmQuest = (q, bonus, actor) =>
  rpc('confirm_quest', { p_quest: q, p_bonus: bonus, p_actor: actor, p_token: tok() })
export const rejectQuest = (q) => rpc('reject_quest', { p_quest: q })
export const approveRequest = (id, actor) =>
  rpc('approve_request', { p_request: id, p_actor: actor, p_token: tok() })
export const rejectRequest = (id) => rpc('reject_request', { p_request: id })
export const issueFine = (member, amount, reason, actor, token) =>
  rpc('issue_fine', { p_member: member, p_amount: amount, p_reason: reason, p_actor: actor, p_token: token || tok() })

export async function createQuest(familyId, member, title, cat, reward, actor) {
  const { error } = await supabase.from('quests').insert({
    family_id: familyId, member_id: member, title, category: cat,
    reward_type: 'fixed', reward, status: 'open', proposer: 'parent', actor,
  })
  if (error) throw error
}
// 협의된 목록을 한 번에 등록
export async function createQuests(familyId, memberId, items, actor) {
  const rows = items.map((it) => ({
    family_id: familyId, member_id: memberId,
    title: it.title, category: it.category,
    reward_type: it.unit ? 'unit' : 'fixed',
    unit: it.unit || null,
    reward: it.reward ?? 500,
    status: 'open', proposer: 'parent', actor,
  }))
  const { error } = await supabase.from('quests').insert(rows)
  if (error) throw error
}
export async function updateQuest(id, fields) {
  const { error } = await supabase.from('quests').update(fields).eq('id', id)
  if (error) throw error
}
export async function deleteQuest(id) {
  const { error } = await supabase.from('quests').delete().eq('id', id)
  if (error) throw error
}
// 자정(한국시간)을 넘긴 도전을 다시 '모집중'으로. 앱을 열 때마다 호출해 별도 스케줄러 없이 처리.
async function expireQuests() {
  const { error } = await supabase.rpc('expire_quests')
  if (error) console.warn('expire_quests skipped:', error.message)
}

export async function updateKid(id, fields) {
  const { error } = await supabase.from('members').update(fields).eq('id', id)
  if (error) throw error
}
export async function addChild({ name, emoji, rate, loginId, pin }) {
  const { data, error } = await supabase.functions.invoke('create-child', {
    body: { name, emoji, rate, loginId, pin },
  })
  if (error) throw new Error(error.message || '아이 추가에 실패했어요')
  if (data && data.error) throw new Error(data.error)
  return data
}

// ---- 아이 행위 ----
export const ackFine = (id) => rpc('acknowledge_fine', { p_request: id, p_token: tok() })
export const applyQuest = (id) => rpc('apply_quest', { p_quest: id })
export const cancelQuest = (id) => rpc('cancel_quest', { p_quest: id })
export const submitQuest = (id, qty, diff) => rpc('submit_quest', { p_quest: id, p_qty: qty, p_diff: diff })

export async function createRequest(familyId, memberId, payload) {
  const row = { family_id: familyId, member_id: memberId, ...payload }
  let { error } = await supabase.from('requests').insert(row)

  // 마이그레이션 0004(client_token 컬럼)가 아직 적용되지 않은 DB면 표식 없이 한 번 더 시도한다.
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    const { client_token, ...withoutToken } = row // eslint-disable-line no-unused-vars
    ;({ error } = await supabase.from('requests').insert(withoutToken))
  }

  // 같은 표식의 요청이 이미 저장돼 있음 = 끊긴 통신 후 재시도. 중복 저장 대신 성공 처리.
  if (error && error.code === '23505') return
  if (error) throw error
}

// ---- 실시간 ----
export function subscribeFamily(onChange) {
  const ch = supabase.channel('family-changes')
  for (const table of ['members', 'transactions', 'quests', 'requests']) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
  }
  ch.subscribe()
  return () => supabase.removeChannel(ch)
}

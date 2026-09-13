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
  const [family, me, tx, quests, fines, sibs] = await Promise.all([
    supabase.from('families').select('*').limit(1).maybeSingle(),
    supabase.from('members').select('*').eq('id', memberId).single(),
    supabase.from('transactions').select('*').eq('member_id', memberId).order('created_at', { ascending: false }),
    supabase.from('quests').select('*').eq('member_id', memberId).order('created_at', { ascending: false }),
    supabase.from('requests').select('*').eq('kind', 'fine').eq('status', 'pending'),
    supabase.rpc('list_siblings'),
  ])
  for (const r of [family, me, tx, quests, fines, sibs]) if (r.error) throw r.error
  return { family: family.data, me: me.data, tx: tx.data, quests: quests.data, fines: fines.data, siblings: sibs.data || [] }
}
export async function updateFamily(id, fields) {
  const { error } = await supabase.from('families').update(fields).eq('id', id)
  if (error) throw error
}

// ---- 부모 행위 ----
export const give = (member, amount, memo, actor) =>
  rpc('give_allowance', { p_member: member, p_amount: amount, p_memo: memo, p_actor: actor, p_token: tok() })
export const confirmQuest = (q, bonus, actor) =>
  rpc('confirm_quest', { p_quest: q, p_bonus: bonus, p_actor: actor, p_token: tok() })
export const approveRequest = (id, actor) =>
  rpc('approve_request', { p_request: id, p_actor: actor, p_token: tok() })
export const rejectRequest = (id) => rpc('reject_request', { p_request: id })
export const issueFine = (member, amount, reason, actor) =>
  rpc('issue_fine', { p_member: member, p_amount: amount, p_reason: reason, p_actor: actor, p_token: tok() })

export async function createQuest(familyId, member, title, cat, reward, actor) {
  const { error } = await supabase.from('quests').insert({
    family_id: familyId, member_id: member, title, category: cat,
    reward_type: 'fixed', reward, status: 'open', proposer: 'parent', actor,
  })
  if (error) throw error
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
export const submitQuest = (id, qty, diff) => rpc('submit_quest', { p_quest: id, p_qty: qty, p_diff: diff })

export async function createRequest(familyId, memberId, payload) {
  const { error } = await supabase.from('requests').insert({
    family_id: familyId, member_id: memberId, ...payload,
  })
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

import { supabase } from './supabase'

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!KEY

export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported')

function toU8(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4)
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function saveSub(sub) {
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
    p_ua: navigator.userAgent.slice(0, 200),
  })
  if (error) throw error
}

// ★ 반드시 사용자의 탭(클릭) 안에서 호출할 것. 로드 시 자동 호출 금지 —
//   크롬이 제스처 없는 요청을 막고, 한 번 거부되면 브라우저 설정에서만 되돌릴 수 있다.
export async function enablePush() {
  if (!pushSupported()) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: toU8(KEY),
  })
  await saveSub(sub)
  return 'granted'
}

export async function disablePush() {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

// 앱 시작 시 자가치유: 이미 허용돼 있고 구독이 살아 있으면 DB 행만 다시 맞춘다.
// 권한을 새로 묻지 않는다. 기기를 공유해 계정이 바뀐 경우 주인도 여기서 갱신된다.
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== 'granted') return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) await saveSub(sub)
}

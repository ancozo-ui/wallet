// 서비스워커 (injectManifest 전략)
//
// 원래 generateSW 로 자동 생성했지만, workbox.importScripts 옵션이
// vite-plugin-pwa 에서 무시되어 푸시 핸들러가 로드되지 않았다.
// 그래서 직접 작성하되, 자동 생성본이 하던 일을 그대로 재현한다.
// (특히 NavigationRoute 를 빠뜨리면 온라인은 멀쩡하고 오프라인에서만 404 가 난다)
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

// --- 기존 generateSW 출력과 동일한 동작 ---
self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// --- 푸시 ---
self.addEventListener('push', (e) => {
  let d = {}
  // 파싱이 실패해도 반드시 알림을 띄운다. 안 띄우면 크롬이
  // "이 사이트는 백그라운드에서 업데이트되었습니다"를 대신 보여준다.
  try { d = e.data ? e.data.json() : {} }
  catch (_) { d = { title: '용돈 나라', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || '용돈 나라', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || 'wallet',
    renotify: true,
    vibrate: [60, 40, 60],
    lang: 'ko',
    data: { url: d.url || '/' },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of wins) {
      if (c.url.startsWith(self.location.origin)) { await c.focus(); return }
    }
    await self.clients.openWindow(url)
  })())
})

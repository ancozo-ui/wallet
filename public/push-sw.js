// 푸시 알림 핸들러. workbox generateSW 가 importScripts 로 불러온다.
// 서비스워커 전략을 바꾸지 않으려고 별도 파일로 뺐다(프리캐시·오프라인 동작 보존).
self.addEventListener('push', (e) => {
  let d = {}
  // 파싱이 실패해도 반드시 알림을 띄운다. 안 띄우면 크롬이
  // "이 사이트가 백그라운드에서 업데이트되었습니다"를 대신 보여준다.
  try { d = e.data ? e.data.json() : {} }
  catch { d = { title: '용돈 나라', body: e.data ? e.data.text() : '' } }
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

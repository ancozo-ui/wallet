import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

// 설치형 앱(PWA)은 홈 화면에서 다시 열어도 새 navigation 이 일어나지 않는다.
// 안드로이드가 앱을 종료하지 않고 재개만 하기 때문인데, 그러면 브라우저가
// 새 서비스워커를 확인할 계기가 없어 재설치 전까지 옛 화면이 그대로 남는다.
// 그래서 (1) 앱이 보일 때마다 갱신을 확인하고 (2) 새 워커가 제어를 넘겨받으면
// 한 번 새로고침해 새 화면을 띄운다.
if ('serviceWorker' in navigator) {
  // 첫 설치 때도 controllerchange 가 한 번 발생한다. 그때는 새로고침할 필요가 없다.
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    location.reload()
  })
}

registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => { if (document.visibilityState === 'visible') reg.update() }
    document.addEventListener('visibilitychange', check)
    setInterval(check, 60 * 60 * 1000)
    check()
  },
})

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

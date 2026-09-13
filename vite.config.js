import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        id: '/',
        name: '용돈 나라',
        short_name: '용돈나라',
        description: '아이들을 위한 용돈 지갑',
        lang: 'ko',
        theme_color: '#0FA98C',
        background_color: '#EAF0EE',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // 안드로이드가 설치 앱(WebAPK)을 만들 때 192/512 PNG 를 요구한다.
        // SVG 만 있으면 기기에 따라 설치본이 깨져 실행 즉시 종료되는 문제가 있었다.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})

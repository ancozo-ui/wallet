# 용돈 나라 (Kids Wallet)

초등학교 저학년 자녀를 위한 **가상 용돈 지갑** — 경제 개념 교육용.

부모가 매주 용돈을 주고, 아이는 그 안에서 쓰고(승인형), 용돈이 부족하면
퀘스트(집안일·학습 등)를 수행해 추가로 번다. 실제 돈이 아닌 **장부형**이며,
실물 현금이 필요할 땐 "환전"으로 바꿔 직접 쓴다.

## 핵심 규칙

- 💰 **돈은 일방적으로 못 뺏음** — 부모는 "주기"만, 차감은 없음.
- 🧾 **지출은 승인형** — 아이가 요청 → 부모 승인 시 차감. 타임충전권(게임/TV, 시간×요율)과 구매(환전, 카테고리별).
- 🏆 **퀘스트** — 부모 등록 + 아이 제안, 당일 자정 마감, 기본 보상 + 완성도 보너스, 체감 난이도 기록.
- ⚠️ **벌금** — 부모 부과 → 아이가 "확인"하면 차감(돈이 빠져나감을 각인).
- 💌 **형제 송금** — 부모 최종 승인, 서로 잔액은 비공개.
- 👨‍👩 **엄마·아빠 공용 관리자 계정** + 행위자 표시. 아이는 각자 계정.

## 구성

```
src/                   웹앱 (Vite + React PWA) — Supabase 연동 실제 앱
index.html             앱 진입점
supabase/              백엔드 — Postgres + RLS + RPC (README 참고)
prototype/index.html   localStorage 기반 초기 프로토타입(참고용, 부모/아이 전환 데모)
```

- **웹앱**: Vite + React PWA. 로그인·가족생성·아이추가·지급·퀘스트·지출·송금·벌금·분석 + 오프라인 처리 + 실시간 동기화.
- **백엔드**: [supabase/README.md](supabase/README.md) — 스키마 적용·보안 모델·세팅 흐름.
- **프로토타입**: `prototype/index.html` 을 브라우저로 열면 백엔드 없이 흐름만 체험(참고용).

## 웹앱 실행

```bash
npm install
```

`.env.local` 에 Supabase 값 설정(`.env.example` 참고):

```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

```bash
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 프로덕션 빌드 (dist/)
```

첫 사용: 부모가 회원가입 → 가족 만들기 → "＋ 아이 추가"로 아이 계정 생성
→ 아이 기기에서 아이디/PIN 으로 로그인. (Supabase 프로젝트에 `supabase/` 스키마·함수가 먼저 적용돼 있어야 함)

> 참고: 부모 회원가입 시 이메일 확인이 필요할 수 있음. Supabase → Authentication → Providers → Email 에서
> "Confirm email" 을 꺼두면 가정용으로 바로 로그인된다.

## 플랫폼

- 프론트: **Vite + React PWA** (와이파이폰·태블릿·브라우저 어디서나, 홈 화면 설치 가능).
- 백엔드: **Supabase** (Auth + Postgres + RLS + Realtime).

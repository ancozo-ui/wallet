# 용돈 나라 — Supabase 백엔드

초등 저학년 자녀용 가상 용돈 지갑의 백엔드. Postgres + RLS + RPC 로
"아이는 자기 것만 / 부모는 가족 전체 / 돈은 일방적으로 못 뺏음" 규칙을 DB가 강제한다.

## 구성

```
supabase/
├─ migrations/0001_init.sql      테이블 · RLS 정책 · RPC 함수
└─ functions/create-child/       아이 계정 생성(Edge Function, service-role)
```

## 보안 모델 (핵심)

- **계정**: 구성원마다 Supabase Auth 유저 1개. 부모(엄마·아빠 공용) 1개, 아이마다 1개.
  엄마/아빠 구분은 로그인이 아니라 앱에서 고르는 `by_actor` 값으로 거래에 기록.
- **잔액 변경은 RPC 로만**. `members.balance` 직접 UPDATE 는 트리거(`guard_balance`)가 차단.
  → 아이는 스스로 돈을 못 올리고, 부모도 일방 차감 함수가 없어 못 뺏는다.
- **RLS**: `transactions`/`quests`/`requests` 는 부모=가족 전체, 아이=자기 것만.
  형제 잔액은 안 보이고, 송금 대상은 `list_siblings()`(이름·이모지만) 로만 노출.

## RPC 한눈에

| 함수 | 누가 | 하는 일 |
|---|---|---|
| `create_family(가족명, 부모명)` | 가입 직후 부모 | 가족 + 본인(부모) 생성 |
| `give_allowance(아이, 금액, 메모, 행위자)` | 부모 | 용돈 지급(+) |
| `confirm_quest(퀘스트, 보너스, 행위자)` | 부모 | 완료 확인 + 보상·보너스 지급 |
| `approve_request(요청, 행위자)` | 부모 | 지출/송금/제안 승인 |
| `reject_request(요청)` | 부모 | 요청 거절 |
| `issue_fine(아이, 금액, 사유, 행위자)` | 부모 | 벌금 부과(대기) |
| `acknowledge_fine(요청)` | 아이 | 벌금 "확인" → 차감 |
| `apply_quest(퀘스트)` | 아이 | 퀘스트 신청(마감=오늘 자정) |
| `submit_quest(퀘스트, 수량, 난이도)` | 아이 | 완료 제출 |
| `expire_quests()` | 스케줄 | 마감 지난 진행중 → 모집중 복귀 |

아이의 지출/송금/제안 "요청 생성"은 RLS 정책으로 직접 INSERT 허용(본인 것만).

## 온라인 전용 + 재시도 안전장치

- 이 앱은 **인터넷 연결됐을 때만 행동**(지급/지출/승인/퀘스트/벌금) 가능하다.
  오프라인이면 클라이언트가 마지막 데이터(캐시)를 보여주고 행동 버튼은 "인터넷 연결이 필요해요"로 안내한다.
- 연결이 끊겼다 이어질 때 같은 요청이 두 번 전송돼 **잔액이 중복 변경되는 것**을 막기 위해,
  잔액을 바꾸는 RPC 들은 마지막 인자로 **`p_token uuid`(클라이언트가 만든 고유값)** 를 받는다.
  같은 토큰이 다시 오면 `op_seen()` 이 감지해 **한 번만** 처리한다. (토큰 생략 시 중복검사 없음)
  대상: `give_allowance` · `confirm_quest` · `approve_request` · `issue_fine` · `acknowledge_fine`.
  예: `supabase.rpc('give_allowance',{ p_member, p_amount, p_memo, p_actor, p_token: crypto.randomUUID() })`

## 적용 방법

### A. Supabase CLI (권장)
```bash
supabase init                      # 최초 1회
supabase link --project-ref <PROJECT_REF>
supabase db push                   # migrations/0001_init.sql 반영
supabase functions deploy create-child
```

### B. 대시보드에서 수동
1. SQL Editor 에 `migrations/0001_init.sql` 전체 붙여넣고 실행.
2. 이어서 `migrations/0002_allowance_day.sql` 도 실행(주간 용돈 지급 요일 설정).
3. Edge Functions 에서 `create-child` 생성 후 `functions/create-child/index.ts` 내용 배포.

> 이미 0001 을 적용한 프로젝트라면 **0002 만 추가로 실행**하면 된다.
> `families.allowance_day`(0=일..6=토, 기본 토) + 부모용 families update 정책을 추가한다.
> 미적용 시에도 분석은 토요일 기준으로 동작하지만, 앱에서 지급 요일 변경은 저장되지 않는다.

## 가입 → 첫 세팅 흐름

1. 부모가 이메일/비번으로 **회원가입**.
2. 앱에서 `create_family('우리집','엄마아빠')` 호출 → 가족 + 부모 구성원 생성.
3. 아이 추가 시 **`create-child`** 호출(부모 JWT 필요):
   ```json
   { "name": "하준", "emoji": "🦊", "rate": 1000, "loginId": "hajun", "pin": "2580" }
   ```
   → 아이 로그인 = `hajun@kids.local` / 비번 = `2580`.
4. 아이 기기(와이파이폰·태블릿)에서 그 계정으로 **한 번 로그인 → 세션 유지**.
   앱 재진입 잠금은 PIN 으로(선택).

## 마감 자동화(선택)

매일 0시에 신청한 퀘스트를 만료시키려면 pg_cron 사용:
```sql
select cron.schedule('expire-quests', '5 0 * * *', $$ select expire_quests(); $$);
```
(미사용 시 앱에서 로드할 때 만료 처리해도 됨.)

## Edge Function 환경변수

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 는
Supabase 가 함수 런타임에 기본 주입한다. 별도 설정 불필요.

---

## 푸시 알림 (Web Push)

앱이 꺼져 있어도 변동사항을 알린다. 자녀의 요청은 부모에게, 부모의 승인·지급·벌금은 자녀에게.

**경로**: `DB 트리거 → pg_net(net.http_post) → Edge Function(notify) → Web Push → 기기`

자녀의 지출·송금·제안은 RPC 가 아니라 테이블 직접 INSERT 라서, 모든 이벤트를 한 곳에서
잡을 수 있는 지점은 트리거뿐이다(마이그레이션 0006).

### 켜고 끄기

Vault 의 `push_hook_secret` 이 **ON/OFF 스위치**다. `push_dispatch()` 는 이 값을 못 찾으면
즉시 return 하므로, 배포를 건드리지 않고 알림만 멈출 수 있다.

```sql
-- 끄기
delete from vault.secrets where name = 'push_hook_secret';
-- 켜기 (값은 Edge Function 의 PUSH_HOOK_SECRET 과 같아야 함)
select vault.create_secret('<PUSH_HOOK_SECRET>', 'push_hook_secret', '푸시 훅 호출 인증');
```

### 구성요소

| | |
|---|---|
| `push_subscriptions` | 기기별 구독. endpoint 유니크. 본인 것만 조회·삭제(RLS) |
| `save_push_subscription` / `delete_push_subscription` | 구독 등록·해제 RPC. 기기 공유 시 주인이 바뀌므로 삭제 후 삽입 |
| `push_dispatch(jsonb)` | 트리거 → Edge Function 호출. **예외를 삼켜** 알림 실패가 돈 흐름을 막지 않는다 |
| `push_diag()` | 진단용. `net._http_response` 상태코드와 구독 수를 돌려준다(service_role 전용) |
| `functions/notify` | 수신자 판정(송금은 양쪽), 한글 문구, 발송, 404/410 구독 자동 정리 |

### 시크릿

Edge Function 환경변수(`supabase secrets set`): `VAPID_KEYS`(JWK 쌍), `VAPID_SUBJECT`,
`PUSH_HOOK_SECRET`. 프론트에는 Vercel 환경변수 `VITE_VAPID_PUBLIC_KEY`(base64url 공개키).
Vite 는 빌드 시점에 인라인하므로 **변수 추가 후 반드시 재배포**해야 한다.

발송은 `jsr:@negrel/webpush` 를 쓴다. `npm:web-push` 는 VAPID 서명이 node:crypto 의
`crypto.createSign` 을 타는데 Deno 런타임에서 미구현이라 실패한다.

### 문제 해결 순서

1. `select push_diag();` → `recent_http` 가 비었으면 트리거 미발화, 401 이면 시크릿 불일치
2. `subs` 가 0 이면 그 기기에서 알림을 안 켠 것
3. 알림이 **"이 사이트는 백그라운드에서 업데이트되었습니다"** 로 오면 서비스워커에 푸시
   핸들러가 없는 것 — 대개 **옛 배포 URL 에 설치된 앱**이다. Vercel 배포 고유 URL
   (`wallet-<hash>-...`)은 그 시점 빌드에 영구 고정되므로 이후 수정이 도달하지 않는다.
   운영 주소(고정) 또는 브랜치 별칭 URL 을 쓸 것.

### 서비스워커

푸시 핸들러 때문에 `src/sw.js` 를 직접 작성하고 `strategies: 'injectManifest'` 를 쓴다.
`generateSW` + `workbox.importScripts` 조합은 플러그인이 무시한다.
자동 생성본이 하던 일(skipWaiting / clientsClaim / precacheAndRoute / cleanupOutdatedCaches /
**NavigationRoute**)을 직접 재현하고 있으니 수정 시 빠뜨리지 말 것. 특히 NavigationRoute 는
빠뜨려도 온라인에선 멀쩡하고 **오프라인에서만 404** 가 나서 알아채기 어렵다.

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
2. Edge Functions 에서 `create-child` 생성 후 `functions/create-child/index.ts` 내용 배포.

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

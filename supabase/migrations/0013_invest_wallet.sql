-- ============================================================
--  0013: 투자 지갑 (Investment Wallet)
--
--  용돈 잔액과 완전히 분리된 두 번째 지갑. 목돈(조부모 용돈 등)을
--  넣어두면 실제 S&P500 지수 흐름에 연동돼 15일마다 복리로 불어난다.
--  하락은 없게 눌러둠(최소 1%, 최대 7%) — "저축"이 아니라 "투자"를
--  가르치되, 초등 저학년에게 손실 경험은 아직 이르다는 판단.
--
--  이자 지급(apply_invest_tick)은 앱을 켤 때 확인하는 방식(expire_quests
--  패턴)이 아니라 진짜 예약 실행이어야 한다 — 외부 지수 데이터를 가져오려면
--  실제 인터넷 요청이 필요하고(순수 SQL로는 불가능), 아무도 접속하지 않는
--  기간에도 이자는 계속 계산돼야 하기 때문. 그래서 pg_cron → Edge Function
--  (invest-tick) → 이 함수 호출 구조를 쓴다(기존 푸시 알림과 반대 방향의
--  같은 패턴: 알림은 DB→외부, 이건 외부→DB).
-- ============================================================

-- ---------- 1. members: 투자 잔액 컬럼 ----------
-- invest_principal: 다음 이자 지급 대상 원금(이미 한 구간 이상 묵은 돈)
-- invest_pending  : 이번 구간에 새로 들어와 아직 이자 대상이 아닌 돈
--                   (다음 틱 때 원금으로 편입됨 — 단기 우려먹기 방지)
-- 화면에 보여줄 총 투자액 = invest_principal + invest_pending
alter table members
  add column invest_principal int not null default 0 check (invest_principal >= 0),
  add column invest_pending   int not null default 0 check (invest_pending   >= 0);

-- balance 뿐 아니라 투자 두 컬럼도 RPC(app.bal='ok') 밖에서는 못 바꾸게 확장
create or replace function guard_balance() returns trigger
  language plpgsql as
$$ begin
     if (new.balance <> old.balance
         or new.invest_principal <> old.invest_principal
         or new.invest_pending <> old.invest_pending)
        and coalesce(current_setting('app.bal', true), '') <> 'ok' then
       raise exception '잔액은 직접 수정할 수 없어요 (지급/승인/벌금 함수로만 변경됩니다)';
     end if;
     return new;
   end $$;

-- ---------- 2. 지수 데이터 ----------
-- 가족별이 아니라 전체 공통(실제 S&P500 지수는 하나뿐).
create table market_snapshots (
  date       date primary key,
  value      numeric not null,
  source     text,
  fetched_at timestamptz not null default now()
);
alter table market_snapshots enable row level security;
create policy msnap_select on market_snapshots for select using (auth.uid() is not null);
-- insert 정책 없음 → invest-tick Edge Function 이 service-role 키로만 기록

create table invest_ticks (
  id           uuid primary key default gen_random_uuid(),
  window_start date not null unique,   -- 유니크 = 같은 구간 중복 지급 방지(멱등성)
  window_end   date not null,
  change_pct   numeric not null,       -- 그 구간 S&P500 평균 변동률(원본값)
  rate_pct     numeric not null,       -- 1~7 로 매핑해 실제 적용된 이율
  created_at   timestamptz not null default now()
);
alter table invest_ticks enable row level security;
create policy itick_select on invest_ticks for select using (auth.uid() is not null);

-- ---------- 3. 투자 전용 내역(적립/인출/이자) ----------
-- transactions 와 분리한 이유: 대시보드의 수입/지출 집계가 꼬이지 않게 하고,
-- 인출 목적(memo)·이자 지급 틱 연결(tick_id) 등 투자 고유 필드를 깔끔히 담기 위함.
-- 단, 실제로 용돈 잔액이 움직이는 적립/인출은 transactions 에도 함께 남긴다
-- (grp='invest') — "최근 내역"에서 돈이 왜 움직였는지 계속 보이게.
create table invest_transactions (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  sign       smallint not null check (sign in (-1,1)),
  amount     int  not null check (amount >= 0),
  kind       text not null check (kind in ('deposit','withdraw','interest')),
  memo       text,                                       -- 인출 사유(필수, RPC 에서 강제)
  tick_id    uuid references invest_ticks(id),            -- kind='interest' 일 때만 설정 → 그래프의 잎 위치
  by_actor   text,
  created_at timestamptz not null default now()
);
create index on invest_transactions(member_id, created_at desc);
create index on invest_transactions(family_id, created_at desc);
alter table invest_transactions enable row level security;
create policy itx_select on invest_transactions for select
  using (family_id = my_family_id() and (my_role() = 'parent' or member_id = my_member_id()));
-- insert/update/delete 정책 없음 → RPC(security definer) 전용, transactions 와 동일 컨벤션

-- transactions.grp 에 'invest' 추가(체크 제약은 증분 확장이 안 돼 drop 후 재생성)
alter table transactions drop constraint transactions_grp_check;
alter table transactions add constraint transactions_grp_check
  check (grp in ('income','spend','fine','transfer','invest'));

-- ---------- 4. requests.kind 에 인출 요청 추가 ----------
alter table requests drop constraint requests_kind_check;
alter table requests add constraint requests_kind_check
  check (kind in ('spend','transfer','proposal','fine','invest_withdraw'));

-- 아이가 직접 인출 요청을 넣을 수 있게(기존 spend/transfer/proposal 과 동일한 방식)
drop policy r_insert_child on requests;
create policy r_insert_child on requests for insert
  with check (family_id = my_family_id()
              and member_id = my_member_id()
              and kind in ('spend','transfer','proposal','invest_withdraw'));

-- ---------- 5. RPC ----------

create or replace function assert_child() returns void
  language plpgsql stable as
$$ begin
     if my_role() is distinct from 'child' then
       raise exception '아이만 할 수 있어요';
     end if;
   end $$;

-- [아이] 투자하기 — 승인 불필요, 즉시 반영
create or replace function invest_deposit(p_amount int, p_token uuid default null)
  returns void language plpgsql security definer set search_path = public as
$$ declare v_me uuid := my_member_id(); v_fam uuid; v_bal int;
   begin
     perform assert_child();
     if op_seen(p_token) then return; end if;
     if p_amount <= 0 then raise exception '금액은 0보다 커야 해요'; end if;
     select balance, family_id into v_bal, v_fam from members where id = v_me;
     if v_bal - p_amount < 0 then raise exception '잔액이 부족해요'; end if;
     perform set_config('app.bal','ok',true);
     update members set balance = balance - p_amount, invest_pending = invest_pending + p_amount
       where id = v_me;
     insert into invest_transactions(family_id, member_id, sign, amount, kind, by_actor)
       values (v_fam, v_me, 1, p_amount, 'deposit', '본인');
     insert into transactions(family_id, member_id, sign, amount, grp, category, label, by_actor)
       values (v_fam, v_me, -1, p_amount, 'invest', 'invest_deposit', '투자 지갑으로 이동', '본인');
   end $$;

-- [부모] 요청 승인 — invest_withdraw 분기 추가(기존 함수 전체 재정의)
create or replace function approve_request(p_request uuid, p_actor text,
                                           p_token uuid default null)
  returns void language plpgsql security definer set search_path = public as
$$ declare r requests; v_bal int; v_prin int; v_pend int; v_from_pending int; v_from_principal int;
   begin
     perform assert_parent();
     if op_seen(p_token) then return; end if;
     select * into r from requests where id = p_request;
     if r.id is null or r.family_id <> my_family_id() then raise exception '요청을 찾을 수 없어요'; end if;
     if r.status <> 'pending' then raise exception '이미 처리된 요청이에요'; end if;

     if r.kind = 'spend' then
       select balance into v_bal from members where id = r.member_id;
       if v_bal < r.amount then raise exception '잔액이 부족해요'; end if;
       perform set_config('app.bal','ok',true);
       update members set balance = balance - r.amount where id = r.member_id;
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
         values (r.family_id, r.member_id, -1, r.amount, 'spend', r.category, coalesce(r.memo,'지출'), p_actor||' 승인');

     elsif r.kind = 'transfer' then
       select balance into v_bal from members where id = r.member_id;
       if v_bal < r.amount then raise exception '잔액이 부족해요'; end if;
       perform set_config('app.bal','ok',true);
       update members set balance = balance - r.amount where id = r.member_id;
       update members set balance = balance + r.amount where id = r.to_member_id;
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
         values (r.family_id, r.member_id, -1, r.amount, 'transfer','transfer',
                 (select name from members where id = r.to_member_id)||'에게 보냄', p_actor||' 승인');
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
         values (r.family_id, r.to_member_id, 1, r.amount, 'transfer','transfer',
                 (select name from members where id = r.member_id)||'에게 받음', p_actor||' 승인');

     elsif r.kind = 'proposal' then
       insert into quests(family_id,member_id,title,category,reward_type,reward,status,proposer)
         values (r.family_id, r.member_id, r.title, coalesce(r.category,'help'),'fixed', r.reward, 'open','child');

     elsif r.kind = 'invest_withdraw' then
       select invest_principal, invest_pending into v_prin, v_pend from members where id = r.member_id;
       if (v_prin + v_pend) < r.amount then raise exception '투자 잔액이 부족해요'; end if;
       v_from_pending := least(v_pend, r.amount);
       v_from_principal := r.amount - v_from_pending;
       perform set_config('app.bal','ok',true);
       update members set
         invest_pending   = invest_pending   - v_from_pending,
         invest_principal = invest_principal - v_from_principal,
         balance = balance + r.amount
        where id = r.member_id;
       insert into invest_transactions(family_id, member_id, sign, amount, kind, memo, by_actor)
         values (r.family_id, r.member_id, -1, r.amount, 'withdraw', r.memo, p_actor||' 승인');
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
         values (r.family_id, r.member_id, 1, r.amount, 'invest', 'invest_withdraw',
                 '투자 인출 · '||coalesce(r.memo,''), p_actor||' 승인');

     else
       raise exception '이 요청은 승인 대상이 아니에요';
     end if;

     update requests set status = 'approved' where id = r.id;
   end $$;

-- [시스템] 투자 이자 지급 — 클라이언트가 아니라 invest-tick Edge Function(서비스 롤)만 호출.
-- window_start 유니크 제약이 곧 멱등성 보장(같은 구간 재호출해도 두 번째부턴 조용히 무시).
create or replace function apply_invest_tick(p_window_start date, p_window_end date,
                                             p_change_pct numeric, p_rate_pct numeric)
  returns void language plpgsql security definer set search_path = public as
$$ declare v_tick_id uuid; r record; v_interest int;
   begin
     insert into invest_ticks(window_start, window_end, change_pct, rate_pct)
       values (p_window_start, p_window_end, p_change_pct, p_rate_pct)
       on conflict (window_start) do nothing
       returning id into v_tick_id;
     if v_tick_id is null then return; end if;   -- 이미 이 구간은 지급됨

     perform set_config('app.bal','ok',true);
     for r in select id, family_id, invest_principal, invest_pending from members where role = 'child' loop
       v_interest := round(r.invest_principal * p_rate_pct / 100.0);
       update members set
         invest_principal = invest_principal + v_interest + invest_pending,  -- 이번 구간 신규 입금도 여기서 원금 편입
         invest_pending = 0
        where id = r.id;
       if v_interest > 0 then
         insert into invest_transactions(family_id, member_id, sign, amount, kind, tick_id, by_actor)
           values (r.family_id, r.id, 1, v_interest, 'interest', v_tick_id, '시스템');
       end if;
     end loop;
   end $$;

-- ---------- 6. 권한 ----------
-- 새로 만든 함수도 실행 권한(0001 의 grant execute on all functions 는 그 시점 함수만 대상이라
-- 이후 마이그레이션들도 매번 필요한 만큼 명시적으로 grant 해왔다 — 0003/0006/0010/0011 과 동일 컨벤션)
grant execute on function invest_deposit(int, uuid) to authenticated;
grant execute on function assert_child() to authenticated;
grant execute on function approve_request(uuid, text, uuid) to authenticated;
-- apply_invest_tick 은 절대 클라이언트가 못 부르게 authenticated 에는 주지 않고 service_role 에만.
grant execute on function apply_invest_tick(date, date, numeric, numeric) to service_role;

-- ---------- 7. 실시간 동기화 ----------
alter publication supabase_realtime add table invest_transactions, invest_ticks;

-- ---------- 8. 푸시 알림 ----------
-- 8-1) 인출 요청 생성 이벤트 추가(승인/거절은 기존 request_approved/rejected 가 이미 처리함 —
--      'fine' 만 예외 처리돼 있고 invest_withdraw 는 그 예외에 안 걸리므로 그대로 작동)
create or replace function trg_push_requests() returns trigger
  language plpgsql security definer set search_path = public as
$$ declare ev text;
   begin
     if TG_OP = 'INSERT' then
       ev := case new.kind when 'spend'          then 'spend_request'
                           when 'transfer'        then 'transfer_request'
                           when 'proposal'        then 'proposal_request'
                           when 'fine'             then 'fine_issued'
                           when 'invest_withdraw'  then 'invest_withdraw_request' end;
     elsif old.status = 'pending' and new.status is distinct from old.status then
       if new.kind = 'fine' then return null; end if;  -- 벌금 '확인'은 아이 본인 행동
       ev := case new.status when 'approved' then 'request_approved'
                             when 'rejected' then 'request_rejected' end;
     end if;
     if ev is null then return null; end if;
     perform push_dispatch(jsonb_build_object(
       'event', ev, 'family_id', new.family_id, 'actor_member_id', my_member_id(),
       'kind', new.kind, 'member_id', new.member_id, 'to_member_id', new.to_member_id,
       'amount', new.amount, 'memo', new.memo, 'category', new.category,
       'reason', new.reason, 'title', new.title, 'reward', new.reward,
       'entity_id', new.id));
     return null;
   end $$;

-- 8-2) 이자 지급 → 아이에게 알림
create or replace function trg_push_invest_tx() returns trigger
  language plpgsql security definer set search_path = public as
$$ declare v_rate numeric;
   begin
     if new.kind = 'interest' then
       select rate_pct into v_rate from invest_ticks where id = new.tick_id;
       perform push_dispatch(jsonb_build_object(
         'event','invest_tick_earned', 'family_id', new.family_id,
         'member_id', new.member_id, 'amount', new.amount, 'rate_pct', v_rate,
         'entity_id', new.id));
     end if;
     return null;
   end $$;
create trigger trg_push_invest_tx after insert on invest_transactions
  for each row execute function trg_push_invest_tx();

-- ---------- 9. 정기 실행(pg_cron → invest-tick Edge Function) ----------
-- push_dispatch 와 같은 패턴: Vault 에 시크릿이 없으면 그냥 조용히 return.
-- 즉 이 시크릿이 '투자 이자 기능 ON 스위치' 역할도 겸한다.
create or replace function invest_tick_dispatch() returns void
  language plpgsql security definer set search_path = public as
$$ declare v_secret text;
   begin
     select decrypted_secret into v_secret
       from vault.decrypted_secrets where name = 'invest_hook_secret';
     if v_secret is null then return; end if;
     perform net.http_post(
       url     := 'https://vukusjpopqhvvbepbsqt.supabase.co/functions/v1/invest-tick',
       body    := '{}'::jsonb,
       headers := jsonb_build_object('Content-Type','application/json','x-invest-secret', v_secret),
       timeout_milliseconds := 15000);
   exception when others then
     null;   -- 실패해도 절대 다른 기능을 막지 않는다
   end $$;

-- 배포 후 한 번만 수동으로 실행(운영 DB 에서):
--   1) create extension if not exists pg_cron;
--   2) select vault.create_secret('<임의의 긴 문자열>', 'invest_hook_secret', 'invest-tick 호출 인증');
--      (supabase secrets set INVEST_HOOK_SECRET=<같은 값> 으로 Edge Function 쪽에도 동일하게 등록)
--   3) select cron.schedule('invest-tick-daily', '0 16 * * *',
--        $cron$ select invest_tick_dispatch(); $cron$);
-- 위 3단계 전까지는 함수만 배포돼 있을 뿐 아무 일도 일어나지 않는다(push_hook_secret 과 동일한 안전장치).

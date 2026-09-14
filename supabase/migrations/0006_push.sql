-- ============================================================
--  0006: 변동사항 푸시 알림 (Web Push)
--
--  DB 트리거 → pg_net → Edge Function(notify) → 기기
--  자녀의 지출·송금·제안은 RPC 가 아니라 테이블 직접 INSERT 라서,
--  모든 이벤트를 한 곳에서 잡을 수 있는 지점은 트리거뿐이다.
--
--  ★ 이 마이그레이션만 적용해서는 아무 일도 일어나지 않는다.
--    push_dispatch 가 Vault 의 push_hook_secret 을 못 찾으면 즉시 return 하므로,
--    시크릿을 넣는 순간이 곧 '알림 ON 스위치'다.
-- ============================================================

create extension if not exists pg_net;

-- ---------- 구독 저장 ----------
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members(id)  on delete cascade,
  family_id  uuid not null references families(id) on delete cascade,
  endpoint   text not null unique,        -- 기기(브라우저 프로필)당 1개
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index on push_subscriptions(member_id);

alter table push_subscriptions enable row level security;
-- 본인 것만 보고 지운다. 부모에게도 자녀의 키는 열지 않는다(발송은 service-role).
create policy ps_select on push_subscriptions for select using (member_id = my_member_id());
create policy ps_delete on push_subscriptions for delete using (member_id = my_member_id());
-- INSERT/UPDATE 정책 없음 → 아래 RPC 전용

-- 등록을 RPC 로 하는 이유: 태블릿처럼 기기를 공유하면 같은 endpoint 가
-- 자녀 ↔ 부모 계정 사이를 오간다. 클라이언트 upsert 는 남의 행이라 RLS 에 막히고
-- 단순 insert 는 unique 제약에 걸린다. 삭제 후 삽입이 의미상으로도 맞다.
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text,
                                                  p_ua text default null)
  returns void language plpgsql security definer set search_path = public as
$$ declare v_me uuid := my_member_id();
   begin
     if v_me is null then raise exception '로그인이 필요해요'; end if;
     delete from push_subscriptions where endpoint = p_endpoint;   -- 기기 주인 교체
     insert into push_subscriptions(member_id, family_id, endpoint, p256dh, auth, ua)
       values (v_me, my_family_id(), p_endpoint, p_p256dh, p_auth, p_ua);
   end $$;

create or replace function delete_push_subscription(p_endpoint text)
  returns void language plpgsql security definer set search_path = public as
$$ begin
     delete from push_subscriptions
      where endpoint = p_endpoint and member_id = my_member_id();
   end $$;

grant execute on function save_push_subscription(text,text,text,text) to authenticated;
grant execute on function delete_push_subscription(text) to authenticated;

-- ---------- 발송 디스패처 ----------
create or replace function push_dispatch(p jsonb)
  returns void language plpgsql security definer set search_path = public as
$$ declare v_secret text;
   begin
     select decrypted_secret into v_secret
       from vault.decrypted_secrets where name = 'push_hook_secret';
     if v_secret is null then return; end if;     -- 미설정 = 알림 비활성
     perform net.http_post(
       url     := 'https://vukusjpopqhvvbepbsqt.supabase.co/functions/v1/notify',
       body    := p,
       headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
       timeout_milliseconds := 5000);
   exception when others then
     -- ★ 알림 실패가 돈 흐름(요청 생성·승인·지급)을 절대 막지 않게 한다.
     null;
   end $$;

-- ---------- 트리거 ----------

-- 1) requests: 아이의 요청 생성 → 부모 / 승인·거절 → 아이 / 벌금 부과 → 아이
create or replace function trg_push_requests() returns trigger
  language plpgsql security definer set search_path = public as
$$ declare ev text;
   begin
     if TG_OP = 'INSERT' then
       ev := case new.kind when 'spend'    then 'spend_request'
                           when 'transfer' then 'transfer_request'
                           when 'proposal' then 'proposal_request'
                           when 'fine'     then 'fine_issued' end;
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
create trigger trg_push_requests after insert or update on requests
  for each row execute function trg_push_requests();

-- 2) quests: 완료 제출 → 부모
create or replace function trg_push_quests() returns trigger
  language plpgsql security definer set search_path = public as
$$ begin
     if new.status = 'done_sub' and old.status is distinct from 'done_sub' then
       perform push_dispatch(jsonb_build_object(
         'event','quest_submitted', 'family_id', new.family_id,
         'actor_member_id', my_member_id(), 'member_id', new.member_id,
         'title', new.title, 'reward', new.reward, 'reward_type', new.reward_type,
         'qty', new.submission->>'qty', 'unit', new.unit, 'entity_id', new.id));
     end if;
     return null;
   end $$;
create trigger trg_push_quests after update of status on quests
  for each row execute function trg_push_quests();

-- 3) transactions: 퀘스트 보상 / 용돈 지급 → 아이
--    보상 지급은 quests 로 못 잡는다. 0005 에서 confirm_quest 가 퀘스트를
--    다시 'open' 으로 되돌리기 때문(상시 퀘스트). 그래서 여기서 잡는다.
--    지출·송금·벌금은 grp 가 income 이 아니라 걸러져 requests 알림과 중복되지 않는다.
create or replace function trg_push_tx() returns trigger
  language plpgsql security definer set search_path = public as
$$ declare v_bal int;
   begin
     if not (new.sign = 1 and new.grp = 'income') then return null; end if;
     select balance into v_bal from members where id = new.member_id;
     perform push_dispatch(jsonb_build_object(
       'event', case when new.category = 'quest' then 'quest_paid' else 'allowance_given' end,
       'family_id', new.family_id, 'actor_member_id', my_member_id(),
       'member_id', new.member_id, 'amount', new.amount,
       'label', new.label, 'balance', v_bal, 'entity_id', new.id));
     return null;
   end $$;
create trigger trg_push_tx after insert on transactions
  for each row execute function trg_push_tx();

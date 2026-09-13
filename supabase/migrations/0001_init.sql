-- ============================================================
--  용돈 나라 (Kids Wallet) — Supabase 초기 스키마
--  Postgres + RLS + RPC. 잔액 변동은 오직 RPC(security definer)로만.
--  규칙: 아이는 자기 것만 조회 / 부모는 가족 전체 / 돈은 일방적으로 못 뺏음
-- ============================================================

create extension if not exists pgcrypto;

-- ======================= TABLES =======================

create table families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '우리집',
  created_at timestamptz not null default now()
);

create table members (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  user_id    uuid unique references auth.users(id) on delete set null, -- 이 구성원의 로그인
  role       text not null check (role in ('parent','child')),
  name       text not null,
  emoji      text not null default '🙂',
  rate       int  not null default 0,   -- 타임충전권 시간당 요율(원)
  balance    int  not null default 0,   -- 아이 잔액(부모는 0). 직접 수정 금지 → RPC만.
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index on members(family_id);

create table transactions (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade, -- 지갑 주인
  sign       smallint not null check (sign in (-1,1)),
  amount     int  not null check (amount >= 0),
  grp        text not null check (grp in ('income','spend','fine','transfer')),
  category   text,                 -- weekly/quest/manual/food/toy/game/tv/fine/transfer ...
  label      text,
  by_actor   text,                 -- 엄마 / 아빠 / "아빠 승인" 등 행위자
  difficulty smallint,             -- 퀘스트 체감 난이도(1~3)
  created_at timestamptz not null default now()
);
create index on transactions(member_id, created_at desc);
create index on transactions(family_id, created_at desc);

create table quests (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade, -- 대상 아이
  title       text not null,
  category    text not null default 'help',   -- study / help / health / ...
  reward_type text not null default 'fixed' check (reward_type in ('fixed','unit')),
  reward      int  not null default 0,
  unit        text,                            -- 단가형 단위(예: '권')
  repeat      text not null default 'once' check (repeat in ('once','daily','weekly')),
  status      text not null default 'open' check (status in ('open','prog','done_sub','done','expired')),
  proposer    text not null default 'parent' check (proposer in ('parent','child')),
  actor       text,                            -- 등록한 사람(엄마/아빠)
  submission  jsonb,                           -- { qty, diff }
  deadline    date,                            -- 신청일(그날 자정까지)
  created_at  timestamptz not null default now()
);
create index on quests(family_id);
create index on quests(member_id);

create table requests (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  kind          text not null check (kind in ('spend','transfer','proposal','fine')),
  member_id     uuid not null references members(id) on delete cascade, -- 주체 아이(지출자/송금자/제안자/벌금대상)
  to_member_id  uuid references members(id) on delete cascade,          -- 송금 받는 형제
  category      text,
  amount        int,
  memo          text,
  reason        text,
  title         text,   -- 제안 퀘스트 제목
  reward        int,    -- 제안 희망 보상
  convert       boolean not null default false, -- 구매(환전) 여부
  by_actor      text,   -- 벌금 부과자
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now()
);
create index on requests(family_id, status);

-- ======================= HELPERS =======================
-- security definer 로 members 를 RLS 우회 조회 → 정책 재귀 방지
create or replace function my_family_id() returns uuid
  language sql stable security definer set search_path = public as
$$ select family_id from members where user_id = auth.uid() limit 1 $$;

create or replace function my_member_id() returns uuid
  language sql stable security definer set search_path = public as
$$ select id from members where user_id = auth.uid() limit 1 $$;

create or replace function my_role() returns text
  language sql stable security definer set search_path = public as
$$ select role from members where user_id = auth.uid() limit 1 $$;

create or replace function assert_parent() returns void
  language plpgsql stable as
$$ begin
     if my_role() is distinct from 'parent' then
       raise exception '부모만 할 수 있어요';
     end if;
   end $$;

-- 잔액은 RPC 안에서만 변경 가능(app.bal='ok' 일 때만). 그 외 UPDATE 는 차단.
create or replace function guard_balance() returns trigger
  language plpgsql as
$$ begin
     if new.balance <> old.balance
        and coalesce(current_setting('app.bal', true), '') <> 'ok' then
       raise exception '잔액은 직접 수정할 수 없어요 (지급/승인/벌금 함수로만 변경됩니다)';
     end if;
     return new;
   end $$;
create trigger trg_guard_balance before update on members
  for each row execute function guard_balance();

-- ======================= RLS =======================
alter table families     enable row level security;
alter table members      enable row level security;
alter table transactions enable row level security;
alter table quests       enable row level security;
alter table requests     enable row level security;

-- families: 우리 가족만
create policy fam_select on families for select using (id = my_family_id());

-- members: 부모는 전체, 아이는 자기 행만(형제 잔액 비공개)
create policy mem_select on members for select
  using (family_id = my_family_id() and (my_role() = 'parent' or id = my_member_id()));
create policy mem_insert on members for insert
  with check (my_role() = 'parent' and family_id = my_family_id());
create policy mem_update on members for update
  using (my_role() = 'parent' and family_id = my_family_id())
  with check (family_id = my_family_id());           -- balance 변경은 트리거가 별도 차단
create policy mem_delete on members for delete
  using (my_role() = 'parent' and family_id = my_family_id());

-- transactions: 읽기만(부모 전체 / 아이 자기 것). 쓰기는 RPC 전용.
create policy tx_select on transactions for select
  using (family_id = my_family_id() and (my_role() = 'parent' or member_id = my_member_id()));

-- quests: 부모 전체 / 아이 자기 것. 등록·수정은 부모, 신청·제출은 RPC.
create policy q_select on quests for select
  using (family_id = my_family_id() and (my_role() = 'parent' or member_id = my_member_id()));
create policy q_insert on quests for insert
  with check (my_role() = 'parent' and family_id = my_family_id());
create policy q_update on quests for update
  using (my_role() = 'parent' and family_id = my_family_id());
create policy q_delete on quests for delete
  using (my_role() = 'parent' and family_id = my_family_id());

-- requests: 부모는 가족 전체(승인용) / 아이는 자기 것(+자기 벌금)
create policy r_select on requests for select
  using (family_id = my_family_id() and (my_role() = 'parent' or member_id = my_member_id()));
-- 아이는 자기 지출/송금/제안만 생성. 벌금은 부모가 RPC 로.
create policy r_insert_child on requests for insert
  with check (family_id = my_family_id()
              and member_id = my_member_id()
              and kind in ('spend','transfer','proposal'));

-- ======================= RPC (security definer) =======================

-- 가입 직후 가족 + 부모 구성원 생성(본인)
create or replace function create_family(p_family_name text, p_parent_name text)
  returns uuid language plpgsql security definer set search_path = public as
$$ declare v_fam uuid;
   begin
     if my_member_id() is not null then raise exception '이미 가족에 속해 있어요'; end if;
     insert into families(name) values (coalesce(nullif(p_family_name,''),'우리집'))
       returning id into v_fam;
     insert into members(family_id, user_id, role, name, emoji)
       values (v_fam, auth.uid(), 'parent', coalesce(nullif(p_parent_name,''),'부모'), '👨‍👩');
     return v_fam;
   end $$;

-- 형제 이름·이모지만 노출(잔액 제외) — 송금 대상 선택용
create or replace function list_siblings()
  returns table(id uuid, name text, emoji text)
  language sql stable security definer set search_path = public as
$$ select m.id, m.name, m.emoji from members m
    where m.family_id = my_family_id() and m.role = 'child' and m.id <> my_member_id()
    order by m.sort $$;

-- [부모] 용돈 지급
create or replace function give_allowance(p_member uuid, p_amount int, p_memo text, p_actor text)
  returns void language plpgsql security definer set search_path = public as
$$ declare v_fam uuid;
   begin
     perform assert_parent();
     select family_id into v_fam from members where id = p_member;
     if v_fam is distinct from my_family_id() then raise exception '우리 가족 아이가 아니에요'; end if;
     if p_amount <= 0 then raise exception '금액은 0보다 커야 해요'; end if;
     perform set_config('app.bal','ok',true);
     update members set balance = balance + p_amount where id = p_member;
     insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
       values (v_fam, p_member, 1, p_amount, 'income','manual', coalesce(nullif(p_memo,''),'용돈'), p_actor);
   end $$;

-- [부모] 퀘스트 완료 확인 + 보너스 지급
create or replace function confirm_quest(p_quest uuid, p_bonus int, p_actor text)
  returns void language plpgsql security definer set search_path = public as
$$ declare q quests; v_base int; v_total int; v_label text;
   begin
     perform assert_parent();
     select * into q from quests where id = p_quest;
     if q.id is null or q.family_id <> my_family_id() then raise exception '퀘스트를 찾을 수 없어요'; end if;
     if q.status <> 'done_sub' then raise exception '완료 제출된 퀘스트가 아니에요'; end if;
     v_base := case when q.reward_type = 'unit'
                    then q.reward * coalesce((q.submission->>'qty')::int, 1)
                    else q.reward end;
     v_total := v_base + coalesce(p_bonus, 0);
     v_label := q.title
                || case when q.reward_type='unit'
                        then ' ('||coalesce(q.submission->>'qty','1')||coalesce(q.unit,'')||')' else '' end
                || case when coalesce(p_bonus,0) > 0 then ' +보너스' else '' end;
     perform set_config('app.bal','ok',true);
     update members set balance = balance + v_total where id = q.member_id;
     insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor,difficulty)
       values (q.family_id, q.member_id, 1, v_total, 'income','quest', v_label, p_actor,
               (q.submission->>'diff')::int);
     update quests set status = 'done' where id = q.id;
   end $$;

-- [부모] 요청 승인(지출/송금/제안)
create or replace function approve_request(p_request uuid, p_actor text)
  returns void language plpgsql security definer set search_path = public as
$$ declare r requests; v_bal int;
   begin
     perform assert_parent();
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

     else
       raise exception '이 요청은 승인 대상이 아니에요';
     end if;

     update requests set status = 'approved' where id = r.id;
   end $$;

-- [부모] 요청 거절
create or replace function reject_request(p_request uuid)
  returns void language plpgsql security definer set search_path = public as
$$ begin
     perform assert_parent();
     update requests set status = 'rejected'
      where id = p_request and family_id = my_family_id() and status = 'pending';
   end $$;

-- [부모] 벌금 부과(대기) — 아이 확인 후 차감
create or replace function issue_fine(p_member uuid, p_amount int, p_reason text, p_actor text)
  returns uuid language plpgsql security definer set search_path = public as
$$ declare v_id uuid;
   begin
     perform assert_parent();
     if (select family_id from members where id = p_member) is distinct from my_family_id()
       then raise exception '우리 가족 아이가 아니에요'; end if;
     if p_amount <= 0 then raise exception '금액 오류'; end if;
     insert into requests(family_id,kind,member_id,amount,reason,by_actor)
       values (my_family_id(),'fine', p_member, p_amount, coalesce(nullif(p_reason,''),'약속 어김'), p_actor)
       returning id into v_id;
     return v_id;
   end $$;

-- [아이] 벌금 확인 → 차감(동의가 아니라 "확인")
create or replace function acknowledge_fine(p_request uuid)
  returns void language plpgsql security definer set search_path = public as
$$ declare r requests;
   begin
     select * into r from requests where id = p_request;
     if r.id is null or r.kind <> 'fine' then raise exception '벌금을 찾을 수 없어요'; end if;
     if r.member_id <> my_member_id() then raise exception '내 벌금이 아니에요'; end if;
     if r.status <> 'pending' then raise exception '이미 처리됨'; end if;
     perform set_config('app.bal','ok',true);
     update members set balance = balance - r.amount where id = r.member_id;
     insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
       values (r.family_id, r.member_id, -1, r.amount, 'fine','fine', '벌금 · '||coalesce(r.reason,''), r.by_actor);
     update requests set status = 'approved' where id = r.id;
   end $$;

-- [아이] 퀘스트 신청(open→prog, 마감=오늘)
create or replace function apply_quest(p_quest uuid)
  returns void language plpgsql security definer set search_path = public as
$$ declare q quests;
   begin
     select * into q from quests where id = p_quest;
     if q.id is null or q.member_id <> my_member_id() then raise exception '내 퀘스트가 아니에요'; end if;
     if q.status <> 'open' then raise exception '신청할 수 없는 상태예요'; end if;
     update quests set status = 'prog', deadline = current_date where id = q.id;
   end $$;

-- [아이] 완료 제출(prog→done_sub, 수량·난이도)
create or replace function submit_quest(p_quest uuid, p_qty int, p_diff int)
  returns void language plpgsql security definer set search_path = public as
$$ declare q quests;
   begin
     select * into q from quests where id = p_quest;
     if q.id is null or q.member_id <> my_member_id() then raise exception '내 퀘스트가 아니에요'; end if;
     if q.status <> 'prog' then raise exception '진행 중이 아니에요'; end if;
     update quests set status = 'done_sub',
       submission = jsonb_build_object('qty', greatest(coalesce(p_qty,1),1),
                                       'diff', least(greatest(coalesce(p_diff,2),1),3))
      where id = q.id;
   end $$;

-- 마감 지난 퀘스트 만료(진행중 → 모집중 복귀). pg_cron 로 매일 0시 실행 권장.
create or replace function expire_quests()
  returns void language sql security definer set search_path = public as
$$ update quests set status = 'open', deadline = null
    where status = 'prog' and deadline is not null and deadline < current_date $$;

-- 로그인 사용자에게 RPC 실행 권한
grant execute on all functions in schema public to authenticated;

-- 실시간 동기화(잔액/승인함/퀘스트가 기기 간 자동 반영)
alter publication supabase_realtime add table members, transactions, quests, requests;

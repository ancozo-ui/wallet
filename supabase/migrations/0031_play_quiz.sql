-- 🎲 놀이 퀴즈: 앱이 문제를 내고 채점해 점수 구간별로 용돈을 바로 지급한다.
-- 설정(문제 수·보상 구간)은 아이×과목별로 부모가 바꿀 수 있다.

create table quiz_config (
  family_id      uuid not null references families(id) on delete cascade,
  member_id      uuid not null references members(id) on delete cascade,
  subject        text not null check (subject in ('times','english','hangul')),
  question_count int  not null default 20 check (question_count between 5 and 100),
  enabled        boolean not null default true,
  -- 점수(%)가 min 이상이면 reward 원. 가장 높은 구간 하나만 적용.
  tiers          jsonb not null default '[{"min":80,"reward":200},{"min":90,"reward":300},{"min":100,"reward":500}]',
  primary key (member_id, subject)
);
alter table quiz_config enable row level security;
create policy qc_select on quiz_config for select
  using (family_id = my_family_id() and (my_role() = 'parent' or member_id = my_member_id()));
create policy qc_update on quiz_config for update
  using (my_role() = 'parent' and family_id = my_family_id())
  with check (my_role() = 'parent' and family_id = my_family_id());

create table quiz_attempts (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  subject    text not null,
  correct    int  not null,
  total      int  not null,
  seconds    int  not null,
  reward     int  not null default 0,
  created_at timestamptz not null default now()
);
create index on quiz_attempts(member_id, created_at desc);
alter table quiz_attempts enable row level security;
create policy qa_select on quiz_attempts for select
  using (family_id = my_family_id() and (my_role() = 'parent' or member_id = my_member_id()));
-- insert/update/delete 정책 없음 → quiz_finish RPC 전용

-- [아이] 퀴즈를 끝냈을 때 호출. 보상 금액은 서버가 설정의 구간표로 계산한다(클라이언트가 정하지 않음).
-- 점수는 앱이 알려주는 값이라 완전한 검증은 못 하므로 문제 수·최소 소요시간만 확인한다.
create or replace function quiz_finish(p_subject text, p_correct int, p_total int, p_seconds int,
                                       p_token uuid default null)
  returns int language plpgsql security definer set search_path = public as
$$ declare cfg quiz_config; v_me uuid := my_member_id(); v_pct int; v_reward int := 0; v_bal int; v_name text;
   begin
     if my_role() is distinct from 'child' then raise exception '아이만 할 수 있어요'; end if;
     if op_seen(p_token) then
       select reward into v_reward from quiz_attempts where member_id = v_me order by created_at desc limit 1;
       return coalesce(v_reward, 0);
     end if;
     select * into cfg from quiz_config where member_id = v_me and subject = p_subject;
     if cfg.member_id is null or not cfg.enabled then raise exception '이 놀이는 지금 열려 있지 않아요'; end if;
     if p_total <> cfg.question_count then raise exception '문제 수가 맞지 않아요'; end if;
     if p_correct < 0 or p_correct > p_total then raise exception '점수가 올바르지 않아요'; end if;
     if p_seconds < p_total * 1.5 then raise exception '너무 빨리 끝났어요. 다시 도전해 보세요'; end if;

     v_pct := floor(p_correct * 100.0 / p_total);
     select coalesce(max(t.reward), 0) into v_reward
       from jsonb_to_recordset(cfg.tiers) as t(min int, reward int) where t.min <= v_pct;

     insert into quiz_attempts(family_id, member_id, subject, correct, total, seconds, reward)
       values (cfg.family_id, v_me, p_subject, p_correct, p_total, p_seconds, v_reward);

     if v_reward > 0 then
       v_name := case p_subject when 'times' then '구구단' when 'english' then '영어 단어' else '한글 단어' end;
       perform set_config('app.bal', 'ok', true);
       update members set balance = balance + v_reward where id = v_me;
       insert into transactions(family_id, member_id, sign, amount, grp, category, label, by_actor)
         values (cfg.family_id, v_me, 1, v_reward, 'income', 'quiz',
                 '놀이 · ' || v_name || ' ' || p_correct || '/' || p_total, '자동 지급');
     end if;
     return v_reward;
   end $$;
grant execute on function quiz_finish(text, int, int, int, uuid) to authenticated;

-- 퀴즈 보상은 아이가 방금 직접 본 결과라 푸시 알림을 보내지 않는다(여러 번 풀면 알림이 쌓이므로).
create or replace function trg_push_tx() returns trigger
  language plpgsql security definer set search_path = public as
$$ declare v_bal int;
   begin
     if not (new.sign = 1 and new.grp = 'income') then return null; end if;
     if new.category = 'quiz' then return null; end if;
     select balance into v_bal from members where id = new.member_id;
     perform push_dispatch(jsonb_build_object(
       'event', case when new.category = 'quest' then 'quest_paid' else 'allowance_given' end,
       'family_id', new.family_id, 'actor_member_id', my_member_id(),
       'member_id', new.member_id, 'amount', new.amount,
       'label', new.label, 'balance', v_bal, 'entity_id', new.id));
     return null;
   end $$;

-- 처음 설정: 유찬(구구단·영어 단어 30문제), 유진(한글 단어 20문제)
insert into quiz_config(family_id, member_id, subject, question_count)
select family_id, id, 'times', 30 from members where id = '60e6368d-5d68-486c-8336-5a5a607e1094'
union all
select family_id, id, 'english', 30 from members where id = '60e6368d-5d68-486c-8336-5a5a607e1094'
union all
select family_id, id, 'hangul', 20 from members where id = 'ccceba92-b5f7-4e2b-b76e-816fd7ece790';

-- 부모가 설정을 바꾸면 아이 화면에도 바로 반영되도록 실시간 구독에 추가
alter publication supabase_realtime add table quiz_config;

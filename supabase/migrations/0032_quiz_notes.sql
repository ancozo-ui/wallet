-- 📒 오답노트: 퀴즈에서 틀린 문제를 모아 두고, 같은 문제를 2번 연속 맞히면 '다 외웠어요'로 넘긴다.
create table quiz_notes (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  subject       text not null,
  nkey          text not null,            -- 과목|문제|정답 — 같은 문제를 알아보는 표식
  payload       jsonb not null,           -- 문제 전체(보기 포함)
  wrong_count   int  not null default 1,
  streak        int  not null default 0,  -- 연속으로 맞힌 횟수
  mastered      boolean not null default false,
  last_picked   text,
  last_wrong_at timestamptz not null default now(),
  unique (member_id, nkey)
);
create index on quiz_notes(member_id, mastered, last_wrong_at desc);
alter table quiz_notes enable row level security;
create policy qn_select on quiz_notes for select
  using (family_id = my_family_id() and (my_role() = 'parent' or member_id = my_member_id()));
-- insert/update/delete 정책 없음 → quiz_note_save RPC 전용

-- [아이] 한 판(또는 오답 연습)에서 푼 결과를 알린다.
--   p_items: [{ subject, key, ok, picked, q }]  — 틀리면 노트에 추가/횟수 증가, 맞히면 이미 노트에 있는 문제만 연속 정답 +1
create or replace function quiz_note_save(p_items jsonb)
  returns void language plpgsql security definer set search_path = public as
$$ declare v_me uuid := my_member_id(); v_fam uuid; it jsonb;
   begin
     if my_role() is distinct from 'child' then raise exception '아이만 할 수 있어요'; end if;
     if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then raise exception '기록이 올바르지 않아요'; end if;
     select family_id into v_fam from members where id = v_me;
     for it in select * from jsonb_array_elements(p_items) loop
       if (it->>'subject') not in ('times','english','hangul') then continue; end if;
       if (it->>'ok')::boolean then
         update quiz_notes
            set streak = streak + 1, mastered = (streak + 1 >= 2)
          where member_id = v_me and nkey = it->>'key';
       else
         insert into quiz_notes(family_id, member_id, subject, nkey, payload, last_picked)
           values (v_fam, v_me, it->>'subject', it->>'key', it->'q', it->>'picked')
         on conflict (member_id, nkey) do update
           set wrong_count = quiz_notes.wrong_count + 1, streak = 0, mastered = false,
               last_picked = excluded.last_picked, last_wrong_at = now(), payload = excluded.payload;
       end if;
     end loop;
   end $$;
grant execute on function quiz_note_save(jsonb) to authenticated;

-- ============================================================
--  0005: 퀘스트를 '상시 도전 목록'으로
--
--  - 협의된 퀘스트는 목록에 계속 남아 반복 도전할 수 있다.
--    (완료 확인·보상 지급 후 사라지지 않고 다시 '모집중'으로 돌아온다)
--  - 도전(진행중)한 채로 자정을 넘기면 초기화되어 다시 도전할 수 있다.
--  - 자정 기준은 서버 UTC 가 아니라 한국 시간(Asia/Seoul).
--    예전에는 UTC 기준이라 한국 시간 오전 9시에야 초기화됐다.
-- ============================================================

-- 한국 시간 기준 오늘 날짜
create or replace function kst_today() returns date
  language sql stable as
$$ select (now() at time zone 'Asia/Seoul')::date $$;

grant execute on function kst_today() to authenticated;

-- [아이] 퀘스트 신청 — 오늘(한국시간) 자정까지 완료해야 함
create or replace function apply_quest(p_quest uuid)
  returns void language plpgsql security definer set search_path = public as
$$ declare q quests;
   begin
     select * into q from quests where id = p_quest;
     if q.id is null or q.member_id <> my_member_id() then raise exception '내 퀘스트가 아니에요'; end if;
     if q.status <> 'open' then raise exception '신청할 수 없는 상태예요'; end if;
     update quests set status = 'prog', deadline = kst_today(), submission = null where id = q.id;
   end $$;

-- [부모] 완료 확인 + 보상 지급 → 목록에 남기고 다시 도전 가능 상태로
create or replace function confirm_quest(p_quest uuid, p_bonus int, p_actor text,
                                         p_token uuid default null)
  returns void language plpgsql security definer set search_path = public as
$$ declare q quests; v_base int; v_total int; v_label text;
   begin
     perform assert_parent();
     if op_seen(p_token) then return; end if;
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
     -- 상시 퀘스트: 지급 후 목록에 남아 다시 도전 가능
     update quests set status = 'open', deadline = null, submission = null where id = q.id;
   end $$;

-- 마감(한국시간 자정) 지난 도전 초기화 — 우리 가족 것만
create or replace function expire_quests()
  returns integer language plpgsql security definer set search_path = public as
$$ declare n integer;
   begin
     update quests set status = 'open', deadline = null, submission = null
      where family_id = my_family_id()
        and status = 'prog'
        and deadline is not null
        and deadline < kst_today();
     get diagnostics n = row_count;
     return n;
   end $$;

grant execute on function expire_quests() to authenticated;

-- 기존에 'done' 으로 끝나 목록에서 빠져 있던 퀘스트를 다시 도전 가능하게 되돌린다.
update quests set status = 'open', deadline = null, submission = null where status = 'done';

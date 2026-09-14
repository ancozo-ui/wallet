-- ============================================================
--  0010: 퀘스트 완료 제출을 부모가 '반려'할 수 있게
--
--  덜 끝났는데 제출한 경우, 보상 없이 다시 진행중으로 되돌린다.
--  아이는 마저 하고 다시 제출하면 된다(마감은 그날 자정 그대로).
-- ============================================================

create or replace function reject_quest(p_quest uuid)
  returns void language plpgsql security definer set search_path = public as
$$ declare q quests;
   begin
     perform assert_parent();
     select * into q from quests where id = p_quest;
     if q.id is null or q.family_id <> my_family_id() then
       raise exception '퀘스트를 찾을 수 없어요';
     end if;
     if q.status <> 'done_sub' then
       raise exception '완료 제출된 퀘스트가 아니에요';
     end if;
     update quests
        set status = 'prog', submission = null, deadline = kst_today()
      where id = q.id;
   end $$;

grant execute on function reject_quest(uuid) to authenticated;

-- 알림: 완료 제출(→부모) 에 더해, 반려(→아이) 도 보낸다.
create or replace function trg_push_quests() returns trigger
  language plpgsql security definer set search_path = public as
$$ begin
     if new.status = 'done_sub' and old.status is distinct from 'done_sub' then
       perform push_dispatch(jsonb_build_object(
         'event','quest_submitted', 'family_id', new.family_id,
         'actor_member_id', my_member_id(), 'member_id', new.member_id,
         'title', new.title, 'reward', new.reward, 'reward_type', new.reward_type,
         'qty', new.submission->>'qty', 'unit', new.unit, 'entity_id', new.id));
     elsif new.status = 'prog' and old.status = 'done_sub' then
       perform push_dispatch(jsonb_build_object(
         'event','quest_returned', 'family_id', new.family_id,
         'actor_member_id', my_member_id(), 'member_id', new.member_id,
         'title', new.title, 'entity_id', new.id));
     end if;
     return null;
   end $$;

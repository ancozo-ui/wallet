-- ============================================================
--  0011: 아이가 '할래요' 한 도전을 스스로 취소
--
--  진행중(prog) → 모집중(open) 으로 되돌린다. 보상도 기록도 남지 않는다.
--  부모 알림은 보내지 않는다(아이 본인이 되돌린 것이라 알릴 일이 아니다).
-- ============================================================

create or replace function cancel_quest(p_quest uuid)
  returns void language plpgsql security definer set search_path = public as
$$ declare q quests;
   begin
     select * into q from quests where id = p_quest;
     if q.id is null or q.member_id <> my_member_id() then
       raise exception '내 퀘스트가 아니에요';
     end if;
     if q.status <> 'prog' then
       raise exception '진행 중인 퀘스트가 아니에요';
     end if;
     update quests set status = 'open', deadline = null, submission = null where id = q.id;
   end $$;

grant execute on function cancel_quest(uuid) to authenticated;

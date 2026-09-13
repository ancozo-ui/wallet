-- ============================================================
--  0003: 부모용 내역 삭제(+잔액 되돌림)
--  대시보드 정확성을 위한 관리 기능. 부모만 호출.
--  거래를 지우면 그 거래가 잔액에 준 효과를 반대로 되돌린다.
--    - 벌금(-200) 삭제 → 잔액 +200 (돌려줌)
--    - 퀘스트 보상(+500) 삭제 → 잔액 -500 (회수)
-- ============================================================

create or replace function delete_transaction(p_tx uuid)
  returns void language plpgsql security definer set search_path = public as
$$ declare t transactions;
   begin
     perform assert_parent();
     select * into t from transactions where id = p_tx;
     if t.id is null or t.family_id <> my_family_id() then
       raise exception '내역을 찾을 수 없어요';
     end if;
     perform set_config('app.bal','ok',true);
     update members set balance = balance - (t.sign * t.amount) where id = t.member_id;
     delete from transactions where id = t.id;
   end $$;

grant execute on function delete_transaction(uuid) to authenticated;

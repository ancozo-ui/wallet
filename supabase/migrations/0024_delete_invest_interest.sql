-- ============================================================
--  0024: 이자 지급 내역도 부모가 삭제 가능하게
--
--  이자는 transactions 에 줄이 안 남는다(용돈 잔액을 안 건드리므로) —
--  그래서 기존 delete_transaction 으로는 지울 방법이 없었다. 이자 전용
--  삭제 RPC 를 새로 만든다: invest_principal 에서 그 금액을 도로 빼고
--  invest_transactions 행을 지운다. invest_ticks(그 구간의 지수·이율
--  계산 자체)는 다른 아이에게도 적용됐을 수 있는 공용 기록이라 건드리지
--  않는다 — 이 아이의 "받은 결과"만 되돌린다.
-- ============================================================

create or replace function delete_invest_interest(p_invest_tx uuid)
  returns void language plpgsql security definer set search_path = public as
$$ declare it invest_transactions; v_prin int;
   begin
     perform assert_parent();
     select * into it from invest_transactions where id = p_invest_tx;
     if it.id is null or it.family_id <> my_family_id() then raise exception '내역을 찾을 수 없어요'; end if;
     if it.kind <> 'interest' then raise exception '이자 내역이 아니에요'; end if;
     select invest_principal into v_prin from members where id = it.member_id;
     if v_prin < it.amount then raise exception '이미 인출되었거나 다른 곳에 쓰인 이자라 되돌릴 수 없어요'; end if;
     perform set_config('app.bal','ok',true);
     update members set invest_principal = invest_principal - it.amount where id = it.member_id;
     delete from invest_transactions where id = it.id;
   end $$;

grant execute on function delete_invest_interest(uuid) to authenticated;

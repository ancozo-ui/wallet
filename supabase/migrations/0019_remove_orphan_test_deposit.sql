-- ============================================================
--  0019: 짝 잃은 50,000원 테스트 투자 기록 제거(1회성)
--
--  조유찬의 "투자 지갑으로 이동 -50,000" 거래는 원래 짝이었던
--  "+50,000 용돈 지급" 이 0016 이전 버그로 먼저 삭제된 상태라 related_id
--  가 비어있다. 이 상태로 일반 delete_transaction 을 쓰면 "이 한 줄이
--  balance 를 50,000원 줄였었다"고 오해해서 삭제 시 balance 에 50,000원을
--  잘못 더해버린다(실제로는 애초에 balance 를 건드린 적이 없었음 — 반대
--  방향의 새 버그). 그래서 여기서는 balance 는 그대로 두고 투자 지갑
--  (invest_pending)과 두 테이블의 기록만 직접 지운다.
-- ============================================================

do $$ begin
  perform set_config('app.bal','ok',true);
  update members set invest_pending = invest_pending - 50000
    where id = '60e6368d-5d68-486c-8336-5a5a607e1094' and invest_pending >= 50000;
  delete from invest_transactions where id = '32dd7c3c-e8f3-479f-aa6c-5ffa5703b6f7';
  delete from transactions where id = '880ee050-5735-4669-ac3f-005612b83c94';
end $$;

-- ============================================================
--  0022: 잘못된 테스트 틱 되돌리기(1회성)
--
--  invest-tick 이 "오늘"의 실제 S&P500 데이터를 먼저 가져와 저장하는데,
--  하필 그 실제 날짜가 테스트로 넣어둔 가짜 구간(09-01~09-15) 안의
--  09-14 자리와 겹쳐서 내 테스트 값(1122)을 진짜 지수값(7619)으로
--  덮어썼다. 그 결과 등락률이 88%로 왜곡돼 최대치(7%)로 틱이 적용됐다.
--  이 틱을 되돌리고, 안전하게 더 과거 구간으로 다시 테스트한다.
-- ============================================================

do $$ begin
  perform set_config('app.bal','ok',true);
  update members set invest_principal = invest_principal - 3500
    where id = 'ccceba92-b5f7-4e2b-b76e-816fd7ece790';
  delete from invest_transactions where id = '7c91fc90-3714-42da-a7ba-2e91cc617cbf';
  delete from invest_ticks where id = 'c226b1f2-1aef-4f5d-b6a8-24a1914eb10a';
end $$;

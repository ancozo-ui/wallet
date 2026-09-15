-- ============================================================
--  0026: 메인 머지 전 테스트 데이터 전체 정리(1회성)
--
--  조유진 계정에 남아있던 투자 기능 테스트 흔적(할머니 용돈 5만원 →
--  투자, 이자 2회)을 전부 되돌리고, 이자 시뮬레이션에 썼던 가짜
--  지수 데이터·틱 기록도 지운다. balance 는 순증감 없음(원래부터
--  give-to-invest 쌍이 서로 상쇄되도록 설계됐으므로).
-- ============================================================

do $$ begin
  perform set_config('app.bal','ok',true);

  -- 이자 2건 되돌리기 (56,180 → 50,000)
  update members set invest_principal = invest_principal - 3000 - 3180
    where id = 'ccceba92-b5f7-4e2b-b76e-816fd7ece790';
  delete from invest_transactions where id in (
    '640bca07-7a31-44db-9139-c9743496bc5d', 'bcadc457-5440-47bd-9165-26f64667df2e');

  -- 50,000원 투자 되돌리기 (50,000 → 0). balance 는 짝(할머니 용돈 지급 ↔
  -- 투자로 이동)이 서로 상쇄돼 원래 안 움직였던 것이므로 그대로 둔다.
  update members set invest_principal = invest_principal - 50000
    where id = 'ccceba92-b5f7-4e2b-b76e-816fd7ece790';
  delete from invest_transactions where id = '60053048-2ede-44e6-9d6b-0d01bc114136';
  delete from transactions where id in (
    '1fa3096b-a8ee-428c-a14f-84245901f232', '3deec75e-8c3f-44ce-ba21-913b6f137edb');
end $$;

-- 이자 시뮬레이션에 썼던 가짜 지수·틱 데이터 정리
delete from invest_ticks where window_start in ('2026-07-01', '2026-08-01');
delete from market_snapshots where date between '2026-07-01' and '2026-08-15';

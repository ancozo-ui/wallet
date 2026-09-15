-- ============================================================
--  0021: 이자 지급 테스트를 위한 임시 시뮬레이션 데이터(1회성)
--
--  "조유진이 15일 전부터 50,000원을 투자하고 있었다"는 상황을 만들기
--  위해 invest_pending(방금 넣어서 아직 이자 대상 아님)을 invest_principal
--  (이자 대상)로 미리 옮겨준다 — 실제로는 한 틱을 그냥 기다려야 이렇게
--  되지만, 테스트를 위해 그 기다림을 건너뛴다.
--
--  그리고 가짜 15일치 S&P500 지수 데이터(market_snapshots)를 넣는다 —
--  앞 7일 평균 대비 뒤 8일 평균이 약 8% 오르도록 설계해서, invest-tick
--  이 "세계 경제가 좋았어요" 구간(1~7% 매핑 중 상단)을 타도록 했다.
-- ============================================================

do $$ begin
  perform set_config('app.bal','ok',true);
  update members set invest_principal = invest_principal + invest_pending, invest_pending = 0
    where id = 'ccceba92-b5f7-4e2b-b76e-816fd7ece790';
end $$;

insert into market_snapshots (date, value, source) values
  ('2026-09-01', 1000, 'test'),
  ('2026-09-02', 1005, 'test'),
  ('2026-09-03', 1010, 'test'),
  ('2026-09-04', 1015, 'test'),
  ('2026-09-05', 1020, 'test'),
  ('2026-09-06', 1025, 'test'),
  ('2026-09-07', 1030, 'test'),
  ('2026-09-08', 1050, 'test'),
  ('2026-09-09', 1058, 'test'),
  ('2026-09-10', 1065, 'test'),
  ('2026-09-11', 1072, 'test'),
  ('2026-09-12', 1078, 'test'),
  ('2026-09-13', 1083, 'test'),
  ('2026-09-14', 1088, 'test'),
  ('2026-09-15', 1092, 'test')
on conflict (date) do update set value = excluded.value, source = excluded.source;

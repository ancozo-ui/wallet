-- ============================================================
--  0027: 투자 이율·지수 설정을 코드가 아니라 DB 값으로
--
--  이율 범위(최소/최대)와 어느 지수를 따라갈지를 하드코딩하면 바꿀
--  때마다 코드 배포가 필요하다. 한 행짜리 설정 테이블로 빼서, 이후엔
--  SQL 한 줄(update)로 조정할 수 있게 한다. invest-tick Edge Function
--  이 매번 이 값을 읽어서 계산한다.
--
--  바꾸는 법(운영 DB에서 SQL 실행):
--    update invest_config set rate_floor_pct = 0.2, rate_cap_pct = 0.6;
--    update invest_config set stooq_symbol = '^ndq', yahoo_symbol = '^IXIC', index_name = '나스닥';
-- ============================================================

create table invest_config (
  id             boolean primary key default true check (id),  -- 항상 한 행만 존재(싱글턴)
  rate_floor_pct numeric not null default 0.15,   -- 지수가 안 오르거나 데이터 못 가져올 때 이율(%)
  rate_cap_pct   numeric not null default 0.5,    -- 최대 이율(%)
  cap_change_pct numeric not null default 5,      -- 이 등락률(%) 이상이면 최대 이율
  index_name     text not null default 'S&P500',  -- 아이에게 보여줄 이름(자세히 보기 화면 등)
  stooq_symbol   text not null default '^spx',
  yahoo_symbol   text not null default '^GSPC',
  updated_at     timestamptz not null default now()
);
insert into invest_config (id) values (true);

alter table invest_config enable row level security;
create policy iconf_select on invest_config for select using (auth.uid() is not null);
-- insert/update 정책 없음 — SQL 로 직접 바꾼다(부모 앱 UI는 아직 없음).

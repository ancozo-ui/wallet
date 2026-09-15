-- ============================================================
--  0028: 투자 이자 자동 지급 스케줄 켜기 (pg_cron)
--
--  실제 비밀값은 깃에 두지 않는다(0007 과 동일 패턴). 이 마이그레이션은
--  운영 DB 에 한 번 적용되면서 Vault 에 'invest_hook_secret' 을 심었고,
--  이후 값은 지웠다.
--
--  이 시크릿이 곧 '투자 이자 자동 지급 ON 스위치'다:
--    - 있으면  → invest_tick_dispatch 가 Edge Function(invest-tick) 을 호출한다
--    - 없으면  → invest_tick_dispatch 가 즉시 return 하여 자동 지급이 전면 정지된다
--
--  끄고 싶을 때:
--    delete from vault.secrets where name = 'invest_hook_secret';
--    (또는 select cron.unschedule('invest-tick-daily');)
--
--  DB 를 새로 만들어 마이그레이션을 처음부터 재생하는 경우에는
--  아래를 직접 실행해야 한다(값은 supabase secrets 의 INVEST_HOOK_SECRET 과 동일해야 함):
--    select vault.create_secret('<INVEST_HOOK_SECRET>', 'invest_hook_secret', 'invest-tick 호출 인증');
-- ============================================================

create extension if not exists pg_cron;

do $$ begin end $$;   -- no-op (값은 이미 적용 후 지웠음, 위 주석 참고)

-- 매일 오후 4시(KST 새벽 1시경 UTC 기준 — 서버는 UTC)에 확인. 15일이 안 찼으면
-- invest-tick 이 오늘자 지수만 저장하고 조용히 끝낸다(자세한 이유는 함수 주석 참고).
select cron.schedule('invest-tick-daily', '0 16 * * *',
  $cron$ select invest_tick_dispatch(); $cron$);

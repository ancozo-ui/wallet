-- ============================================================
--  0007: 푸시 훅 시크릿 (Vault)
--
--  실제 비밀값은 깃에 두지 않는다. 이 마이그레이션은 운영 DB 에 한 번
--  적용되면서 Vault 에 'push_hook_secret' 을 심었고, 이후 값은 지웠다.
--
--  이 시크릿이 곧 '알림 ON 스위치'다:
--    - 있으면  → push_dispatch 가 Edge Function(notify) 을 호출한다
--    - 없으면  → push_dispatch 가 즉시 return 하여 알림이 전면 정지된다
--
--  끄고 싶을 때:
--    delete from vault.secrets where name = 'push_hook_secret';
--
--  DB 를 새로 만들어 마이그레이션을 처음부터 재생하는 경우에는
--  아래를 직접 실행해야 한다(값은 supabase secrets 의 PUSH_HOOK_SECRET 과 동일해야 함):
--    select vault.create_secret('<PUSH_HOOK_SECRET>', 'push_hook_secret', '푸시 훅 호출 인증');
-- ============================================================

do $$ begin end $$;   -- no-op

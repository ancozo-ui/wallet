-- 0008: 푸시 파이프라인 진단용 함수 (일시적)
-- 트리거가 왜 조용한지 보려면 DB 안을 들여다봐야 하는데,
-- push_dispatch 가 예외를 삼키도록 설계돼 있어 밖에서는 아무 흔적이 없다.
create or replace function push_diag()
  returns jsonb language sql security definer set search_path = public as
$$
  select jsonb_build_object(
    'http_post_schemas', (select coalesce(jsonb_agg(distinct n.nspname), '[]'::jsonb)
                            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where p.proname = 'http_post'),
    'has_vault_secret',  (select exists(select 1 from vault.decrypted_secrets
                                         where name = 'push_hook_secret')),
    'subs',              (select count(*) from push_subscriptions),
    'triggers',          (select coalesce(jsonb_agg(tgname), '[]'::jsonb)
                            from pg_trigger where tgname like 'trg_push%')
  )
$$;
grant execute on function push_diag() to service_role;

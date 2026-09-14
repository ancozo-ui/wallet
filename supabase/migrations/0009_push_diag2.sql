-- 0009: 진단에 pg_net 응답 기록 추가 (트리거가 실제로 함수를 불렀는지 확인용)
create or replace function push_diag()
  returns jsonb language sql security definer set search_path = public as
$$
  select jsonb_build_object(
    'subs', (select count(*) from push_subscriptions),
    'recent_http', (select coalesce(jsonb_agg(jsonb_build_object(
                        'code', status_code, 'err', left(coalesce(error_msg,''), 120), 'at', created)
                        order by created desc), '[]'::jsonb)
                      from (select * from net._http_response order by created desc limit 5) t)
  )
$$;
grant execute on function push_diag() to service_role;

-- 과거 승인 내역의 요청 시각 채우기 (지출만). 같은 아이·금액·분류·메모의 요청과 내역을 시간순으로 1:1 짝짓되,
-- 48시간 안에 짝이 없거나 같은 항목 요청이 사이에 끼어 모호한 건은 비워 둔다(그 내역은 승인 시각만 표시).
do $$ declare r record; t uuid; n_ok int := 0; n_none int := 0; n_amb int := 0; maxgap interval := '0';
  gap interval; amb int; stats text; used uuid[] := '{}'; n_skip int := 0;
begin
  for r in select rq.* from requests rq
            where rq.status='approved' and rq.kind='spend' order by rq.created_at
  loop
    select x.id, x.created_at - r.created_at into t, gap
      from transactions x
     where x.member_id = r.member_id and x.amount = r.amount and x.grp = 'spend' and x.sign = -1
       and x.by_actor like '%승인' and x.requested_at is null and not (x.id = any(used))
       and x.category is not distinct from r.category
       and x.label = coalesce(r.memo,'지출')
       and x.created_at >= r.created_at and x.created_at <= r.created_at + interval '48 hours'
     order by x.created_at limit 1;
    if t is null then n_none := n_none + 1; continue; end if;
    -- 같은 항목의 다른 요청이 사이에 끼어 있으면 '모호' (순서대로 짝지었지만 따로 센다)
    select count(*) into amb from requests o
     where o.id <> r.id and o.status='approved' and o.kind='spend' and o.member_id=r.member_id
       and o.amount=r.amount and o.category is not distinct from r.category
       and coalesce(o.memo,'지출') = coalesce(r.memo,'지출')
       and o.created_at > r.created_at and o.created_at < r.created_at + gap;
    if amb > 0 then
      -- 모호한 건은 채우지 않는다(해당 내역은 승인 시각만 표시). 짝이 된 내역은 다른 요청이 가져가지 못하게 소진 처리.
      used := used || t; n_amb := n_amb + 1; continue;
    end if;
    update transactions set requested_at = r.created_at where id = t;
    n_ok := n_ok + 1;
    if gap > maxgap then maxgap := gap; end if;
  end loop;
  stats := 'matched='||n_ok||' unmatched='||n_none||' skipped_ambiguous='||n_amb||' maxgap='||maxgap
    ;
  raise notice 'backfill %', stats;
end $$;

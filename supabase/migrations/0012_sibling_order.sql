-- ============================================================
--  0012: 형제 목록 정렬을 안정적으로
--
--  sort 값이 모두 0(기본값)이라 정렬 기준이 동률이었고,
--  그러면 행이 수정될 때마다 순서가 뒤바뀔 수 있다.
--  만든 순서(created_at)를 2차 기준으로 넣어 고정한다.
-- ============================================================

create or replace function list_siblings()
  returns table(id uuid, name text, emoji text)
  language sql stable security definer set search_path = public as
$$ select m.id, m.name, m.emoji from members m
    where m.family_id = my_family_id() and m.role = 'child' and m.id <> my_member_id()
    order by m.sort, m.created_at $$;

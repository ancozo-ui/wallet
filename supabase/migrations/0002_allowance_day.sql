-- ============================================================
--  0002: 주간 용돈 지급 요일 설정
--  families.allowance_day : 0=일 ... 6=토 (기본 토요일)
--  분석 대시보드의 "이번 주"가 이 요일을 기준으로 끊긴다.
-- ============================================================

alter table families add column if not exists allowance_day int not null default 6;

-- 부모가 가족 설정(이름·지급요일)을 수정할 수 있도록 update 정책 추가
drop policy if exists fam_update on families;
create policy fam_update on families for update
  using (id = my_family_id() and my_role() = 'parent')
  with check (id = my_family_id());

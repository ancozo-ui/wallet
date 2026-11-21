-- 부모가 아이의 오답노트를 초기화(삭제)할 수 있게 한다. 아이는 지울 수 없다.
create policy qn_delete on quiz_notes for delete
  using (my_role() = 'parent' and family_id = my_family_id());

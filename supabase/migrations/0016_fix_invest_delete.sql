-- ============================================================
--  0016: 투자와 연결된 거래를 삭제할 때 투자 잔액도 함께 되돌리기
--
--  버그: delete_transaction 은 "이 거래 한 줄의 sign*amount 만큼 balance 를
--  되돌리면 된다"고 가정한다. 예전엔 항상 맞았지만, 투자 기능이 생기면서
--  깨졌다 — "바로 투자로" 로 준 용돈은 장부에 +지급/-투자이동 두 줄이
--  남는데, 실제로는 balance 를 건드리지 않고(서로 상쇄) invest_pending
--  만 올린다. 이 상태에서 "지급" 한 줄만 지우면, delete_transaction 은
--  거기 적힌 +50000 을 balance 에서 그대로 회수해버려서 실제로 한 번도
--  balance 에 들어온 적 없는 돈이 마이너스로 빠져나간다.
--  (아이의 자기 투자·부모의 인출 승인도 같은 종류의 문제가 있었다 —
--   거래를 지워도 투자 잔액 쪽은 전혀 안 돌아갔다.)
--
--  고침: transactions 에 두 개의 연결 컬럼을 추가한다.
--    related_id  — "지급 ↔ 투자이동"처럼 짝지어 생성된 다른 거래를 가리킴
--    invest_tx_id — 이 거래가 invest_transactions 의 어느 줄과 같이
--                    생겼는지 가리킴(적립/인출)
--  delete_transaction 은 이제 이 연결을 따라가서, 짝이 있으면 같이 지우고
--  investment 쪽도 함께 되돌린다. 연결이 없는 평범한 거래(벌금·퀘스트·
--  일반 용돈 등)는 예전과 완전히 똑같이 동작한다.
-- ============================================================

alter table transactions
  add column related_id  uuid references transactions(id) on delete set null,
  add column invest_tx_id uuid references invest_transactions(id) on delete set null;

-- [아이] 투자하기 — 자기 거래 줄에 invest_transactions 연결을 남긴다
create or replace function invest_deposit(p_amount int, p_token uuid default null)
  returns void language plpgsql security definer set search_path = public as
$$ declare v_me uuid := my_member_id(); v_fam uuid; v_bal int; v_itx uuid;
   begin
     perform assert_child();
     if op_seen(p_token) then return; end if;
     if p_amount <= 0 then raise exception '금액은 0보다 커야 해요'; end if;
     select balance, family_id into v_bal, v_fam from members where id = v_me;
     if v_bal - p_amount < 0 then raise exception '잔액이 부족해요'; end if;
     perform set_config('app.bal','ok',true);
     update members set balance = balance - p_amount, invest_pending = invest_pending + p_amount
       where id = v_me;
     insert into invest_transactions(family_id, member_id, sign, amount, kind, by_actor)
       values (v_fam, v_me, 1, p_amount, 'deposit', '본인')
       returning id into v_itx;
     insert into transactions(family_id, member_id, sign, amount, grp, category, label, by_actor, invest_tx_id)
       values (v_fam, v_me, -1, p_amount, 'invest', 'invest_deposit', '투자 지갑으로 이동', '본인', v_itx);
   end $$;

-- [부모] 용돈 지급 — p_to_invest 일 때 "지급↔이동" 두 줄을 서로 연결하고,
-- 이동 쪽엔 invest_transactions 연결까지 남긴다.
create or replace function give_allowance(p_member uuid, p_amount int, p_memo text, p_actor text,
                                          p_token uuid default null, p_to_invest boolean default false)
  returns void language plpgsql security definer set search_path = public as
$$ declare v_fam uuid; v_income uuid; v_move uuid; v_itx uuid;
   begin
     perform assert_parent();
     if op_seen(p_token) then return; end if;
     select family_id into v_fam from members where id = p_member;
     if v_fam is distinct from my_family_id() then raise exception '우리 가족 아이가 아니에요'; end if;
     if p_amount <= 0 then raise exception '금액은 0보다 커야 해요'; end if;

     perform set_config('app.bal','ok',true);
     if p_to_invest then
       update members set invest_pending = invest_pending + p_amount where id = p_member;
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
         values (v_fam, p_member, 1, p_amount, 'income','manual', coalesce(nullif(p_memo,''),'용돈'), p_actor)
         returning id into v_income;
       insert into invest_transactions(family_id, member_id, sign, amount, kind, by_actor)
         values (v_fam, p_member, 1, p_amount, 'deposit', p_actor)
         returning id into v_itx;
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor,related_id,invest_tx_id)
         values (v_fam, p_member, -1, p_amount, 'invest','invest_deposit','투자 지갑으로 이동', p_actor, v_income, v_itx)
         returning id into v_move;
       update transactions set related_id = v_move where id = v_income;
     else
       update members set balance = balance + p_amount where id = p_member;
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
         values (v_fam, p_member, 1, p_amount, 'income','manual', coalesce(nullif(p_memo,''),'용돈'), p_actor);
     end if;
   end $$;

-- [부모] 요청 승인 — invest_withdraw 승인 줄에도 invest_transactions 연결을 남긴다.
create or replace function approve_request(p_request uuid, p_actor text,
                                           p_token uuid default null)
  returns void language plpgsql security definer set search_path = public as
$$ declare r requests; v_bal int; v_prin int; v_pend int; v_from_pending int; v_from_principal int; v_itx uuid;
   begin
     perform assert_parent();
     if op_seen(p_token) then return; end if;
     select * into r from requests where id = p_request;
     if r.id is null or r.family_id <> my_family_id() then raise exception '요청을 찾을 수 없어요'; end if;
     if r.status <> 'pending' then raise exception '이미 처리된 요청이에요'; end if;

     if r.kind = 'spend' then
       select balance into v_bal from members where id = r.member_id;
       if v_bal < r.amount then raise exception '잔액이 부족해요'; end if;
       perform set_config('app.bal','ok',true);
       update members set balance = balance - r.amount where id = r.member_id;
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
         values (r.family_id, r.member_id, -1, r.amount, 'spend', r.category, coalesce(r.memo,'지출'), p_actor||' 승인');

     elsif r.kind = 'transfer' then
       select balance into v_bal from members where id = r.member_id;
       if v_bal < r.amount then raise exception '잔액이 부족해요'; end if;
       perform set_config('app.bal','ok',true);
       update members set balance = balance - r.amount where id = r.member_id;
       update members set balance = balance + r.amount where id = r.to_member_id;
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
         values (r.family_id, r.member_id, -1, r.amount, 'transfer','transfer',
                 (select name from members where id = r.to_member_id)||'에게 보냄', p_actor||' 승인');
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
         values (r.family_id, r.to_member_id, 1, r.amount, 'transfer','transfer',
                 (select name from members where id = r.member_id)||'에게 받음', p_actor||' 승인');

     elsif r.kind = 'proposal' then
       insert into quests(family_id,member_id,title,category,reward_type,reward,status,proposer)
         values (r.family_id, r.member_id, r.title, coalesce(r.category,'help'),'fixed', r.reward, 'open','child');

     elsif r.kind = 'invest_withdraw' then
       select invest_principal, invest_pending into v_prin, v_pend from members where id = r.member_id;
       if (v_prin + v_pend) < r.amount then raise exception '투자 잔액이 부족해요'; end if;
       v_from_pending := least(v_pend, r.amount);
       v_from_principal := r.amount - v_from_pending;
       perform set_config('app.bal','ok',true);
       update members set
         invest_pending   = invest_pending   - v_from_pending,
         invest_principal = invest_principal - v_from_principal,
         balance = balance + r.amount
        where id = r.member_id;
       insert into invest_transactions(family_id, member_id, sign, amount, kind, memo, by_actor)
         values (r.family_id, r.member_id, -1, r.amount, 'withdraw', r.memo, p_actor||' 승인')
         returning id into v_itx;
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor,invest_tx_id)
         values (r.family_id, r.member_id, 1, r.amount, 'invest', 'invest_withdraw',
                 '투자 인출 · '||coalesce(r.memo,''), p_actor||' 승인', v_itx);

     else
       raise exception '이 요청은 승인 대상이 아니에요';
     end if;

     update requests set status = 'approved' where id = r.id;
   end $$;

-- [부모] 내역 삭제 — 이제 연결된 짝 거래와 투자 잔액까지 함께 되돌린다.
create or replace function delete_transaction(p_tx uuid)
  returns void language plpgsql security definer set search_path = public as
$$ declare t transactions; other transactions; v_itx invest_transactions; v_link uuid;
           v_prin int; v_pend int; v_from_pending int; v_from_principal int;
   begin
     perform assert_parent();
     select * into t from transactions where id = p_tx;
     if t.id is null or t.family_id <> my_family_id() then
       raise exception '내역을 찾을 수 없어요';
     end if;

     if t.related_id is not null then
       select * into other from transactions where id = t.related_id;
     end if;
     v_link := coalesce(t.invest_tx_id, other.invest_tx_id);
     if v_link is not null then
       select * into v_itx from invest_transactions where id = v_link;
     end if;

     perform set_config('app.bal','ok',true);

     if v_itx.id is not null then
       select invest_principal, invest_pending into v_prin, v_pend from members where id = v_itx.member_id;
       if v_itx.kind = 'deposit' then
         -- 투자로 들어갔던 돈을 삭제 → 투자 잔액에서 그만큼 되돌린다.
         if (v_prin + v_pend) < v_itx.amount then
           raise exception '이미 이자가 붙었거나 다른 곳으로 인출된 돈이라 되돌릴 수 없어요';
         end if;
         v_from_pending := least(v_pend, v_itx.amount);
         v_from_principal := v_itx.amount - v_from_pending;
         update members set
           invest_pending   = invest_pending   - v_from_pending,
           invest_principal = invest_principal - v_from_principal
          where id = v_itx.member_id;
       else -- 'withdraw'
         -- 인출 승인 기록을 삭제 → 투자 원금으로 되돌려 놓는다.
         update members set invest_principal = invest_principal + v_itx.amount where id = v_itx.member_id;
       end if;
       delete from invest_transactions where id = v_itx.id;
     end if;

     update members set balance = balance - (t.sign * t.amount) where id = t.member_id;
     delete from transactions where id = t.id;

     if other.id is not null then
       update members set balance = balance - (other.sign * other.amount) where id = other.member_id;
       delete from transactions where id = other.id;
     end if;
   end $$;

grant execute on function invest_deposit(int, uuid) to authenticated;
grant execute on function give_allowance(uuid, int, text, text, uuid, boolean) to authenticated;
grant execute on function approve_request(uuid, text, uuid) to authenticated;
grant execute on function delete_transaction(uuid) to authenticated;

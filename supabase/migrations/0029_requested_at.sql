-- 내역에 '아이가 요청한 시각'을 보여주기 위한 컬럼. 승인 시점에 requests.created_at 을 함께 기록한다.
-- 추가 전용(nullable) 이라 기존 화면·데이터는 그대로 동작한다.
alter table transactions        add column if not exists requested_at timestamptz;
alter table invest_transactions add column if not exists requested_at timestamptz;

-- approve_request: 시그니처 동일(오버로드 방지). 새로 만드는 내역에 requested_at 기록.
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
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor,requested_at)
         values (r.family_id, r.member_id, -1, r.amount, 'spend', r.category, coalesce(r.memo,'지출'), p_actor||' 승인', r.created_at);

     elsif r.kind = 'transfer' then
       select balance into v_bal from members where id = r.member_id;
       if v_bal < r.amount then raise exception '잔액이 부족해요'; end if;
       perform set_config('app.bal','ok',true);
       update members set balance = balance - r.amount where id = r.member_id;
       update members set balance = balance + r.amount where id = r.to_member_id;
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor,requested_at)
         values (r.family_id, r.member_id, -1, r.amount, 'transfer','transfer',
                 (select name from members where id = r.to_member_id)||'에게 보냄', p_actor||' 승인', r.created_at);
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor,requested_at)
         values (r.family_id, r.to_member_id, 1, r.amount, 'transfer','transfer',
                 (select name from members where id = r.member_id)||'에게 받음', p_actor||' 승인', r.created_at);

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
       insert into invest_transactions(family_id, member_id, sign, amount, kind, memo, by_actor, requested_at)
         values (r.family_id, r.member_id, -1, r.amount, 'withdraw', r.memo, p_actor||' 승인', r.created_at)
         returning id into v_itx;
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor,invest_tx_id,requested_at)
         values (r.family_id, r.member_id, 1, r.amount, 'invest', 'invest_withdraw',
                 '투자 인출 · '||coalesce(r.memo,''), p_actor||' 승인', v_itx, r.created_at);

     else
       raise exception '이 요청은 승인 대상이 아니에요';
     end if;

     update requests set status = 'approved' where id = r.id;
   end $$;

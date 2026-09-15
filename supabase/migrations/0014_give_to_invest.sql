-- ============================================================
--  0014: 용돈 지급하면서 바로 투자 지갑으로
--
--  조부모 용돈 같은 목돈은 부모가 그 자리에서 "이건 투자로 넣어주자"고
--  결정하고 싶을 때가 있다. 그렇다고 아이의 결정권을 뺏으면 안 되니
--  (평소 용돈은 여전히 아이가 스스로 투자할지 정함), give_allowance 에
--  선택적 플래그만 하나 추가한다 — 기본값 false 라 기존 호출은 그대로 동작.
--
--  p_to_invest=true 여도 balance 는 결국 안 움직인다(지급 +금액, 이동 -금액이
--  같은 트랜잭션 안에서 상쇄) — 장부에는 "용돈 지급"과 "투자로 이동" 두 건이
--  각각 남아서, 아이가 직접 두 단계로 했을 때와 내역이 똑같이 보인다.
-- ============================================================

create or replace function give_allowance(p_member uuid, p_amount int, p_memo text, p_actor text,
                                          p_token uuid default null, p_to_invest boolean default false)
  returns void language plpgsql security definer set search_path = public as
$$ declare v_fam uuid;
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
         values (v_fam, p_member, 1, p_amount, 'income','manual', coalesce(nullif(p_memo,''),'용돈'), p_actor);
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
         values (v_fam, p_member, -1, p_amount, 'invest','invest_deposit','투자 지갑으로 이동', p_actor);
       insert into invest_transactions(family_id, member_id, sign, amount, kind, by_actor)
         values (v_fam, p_member, 1, p_amount, 'deposit', p_actor);
     else
       update members set balance = balance + p_amount where id = p_member;
       insert into transactions(family_id,member_id,sign,amount,grp,category,label,by_actor)
         values (v_fam, p_member, 1, p_amount, 'income','manual', coalesce(nullif(p_memo,''),'용돈'), p_actor);
     end if;
   end $$;

grant execute on function give_allowance(uuid, int, text, text, uuid, boolean) to authenticated;

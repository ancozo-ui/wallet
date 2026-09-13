// 용돈 나라 — 아이 계정 생성 (부모만 호출)
// 아이 로그인용 auth 유저를 만들고(이메일+비번), members 행을 연결한다.
// auth 유저 생성은 service-role 권한이 필요해 Edge Function 으로 분리.
//
// 배포:  supabase functions deploy create-child
// 호출:  parent JWT 를 Authorization 헤더에 넣어 POST
//        body: { name, emoji, rate, loginId, pin }
//        → 아이 로그인 이메일 = `${loginId}@kids.local`, 비밀번호 = pin(4자리 이상 권장)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // 1) 호출자(부모) 신원 확인 — 전달된 JWT 로 동작하는 클라이언트
    const asCaller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: me } = await asCaller
      .from("members")
      .select("family_id, role")
      .limit(1)
      .maybeSingle();
    if (!me || me.role !== "parent") {
      return json({ error: "부모만 아이를 추가할 수 있어요" }, 403);
    }

    const { name, emoji, rate, loginId, pin } = await req.json();
    if (!name || !loginId || !pin || String(pin).length < 4) {
      return json({ error: "이름, 로그인 ID, 4자리 이상 PIN 이 필요해요" }, 400);
    }

    // 2) service-role 로 아이 auth 유저 생성(이메일 확인 생략)
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const email = `${String(loginId).toLowerCase()}@kids.local`;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password: String(pin),
      email_confirm: true,
      user_metadata: { role: "child", name },
    });
    if (cErr || !created?.user) {
      return json({ error: cErr?.message ?? "계정 생성 실패" }, 400);
    }

    // 3) members 행 생성(부모의 family_id 에 연결)
    const { data: member, error: mErr } = await admin
      .from("members")
      .insert({
        family_id: me.family_id,
        user_id: created.user.id,
        role: "child",
        name,
        emoji: emoji ?? "🙂",
        rate: rate ?? 0,
      })
      .select()
      .single();
    if (mErr) {
      // 보상: 만든 auth 유저 롤백
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: mErr.message }, 400);
    }

    return json({ member, loginEmail: email });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

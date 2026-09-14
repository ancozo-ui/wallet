// 용돈 나라 — 변동사항 푸시 발송
// 호출자는 브라우저가 아니라 Postgres 트리거(pg_net). x-push-secret 로 인증한다.
// 배포: supabase functions deploy notify   (config.toml 에서 verify_jwt=false)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const won = (n: number) => (n ?? 0).toLocaleString("ko-KR");

// src/const.js 의 일부를 복사. Vite/Deno 경계를 넘어 코드를 공유하는 것보다 싸다.
const CAT: Record<string, string> = {
  food: "먹거리", toy: "장난감", study_buy: "학용품", book: "책",
  gift: "선물", donate: "기부", game: "게임", tv: "TV",
};

type Member = { id: string; role: string; name: string };
type Target = { memberId: string; title: string; body: string; tag: string };

Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-push-secret") !== Deno.env.get("PUSH_HOOK_SECRET")) {
      return json({ error: "unauthorized" }, 401);
    }
    const p = await req.json();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: members } = await admin
      .from("members").select("id, role, name").eq("family_id", p.family_id);
    if (!members?.length) return json({ sent: 0, reason: "no members" });

    const nameOf = (id: string) => members.find((m: Member) => m.id === id)?.name ?? "아이";
    const parents = members.filter((m: Member) => m.role === "parent").map((m: Member) => m.id);

    const targets = buildTargets(p, parents, nameOf);
    // 이 일을 일으킨 사람에게는 보내지 않는다.
    const wanted = targets.filter((t) => t.memberId && t.memberId !== p.actor_member_id);
    if (!wanted.length) return json({ sent: 0 });

    const { data: subs } = await admin
      .from("push_subscriptions").select("*")
      .in("member_id", wanted.map((t) => t.memberId));
    if (!subs?.length) return json({ sent: 0, reason: "no subscriptions" });

    const keys = await webpush.importVapidKeys(
      JSON.parse(Deno.env.get("VAPID_KEYS")!), { extractable: false },
    );
    const server = await webpush.ApplicationServer.new({
      contactInformation: Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
      vapidKeys: keys,
    });

    let sent = 0;
    const dead: string[] = [];
    await Promise.allSettled(subs.map(async (s: any) => {
      const t = wanted.find((x) => x.memberId === s.member_id)!;
      const payload = JSON.stringify({ title: t.title, body: t.body, tag: t.tag, url: "/" });
      try {
        // urgency=high 로 보내야 안드로이드 절전(Doze) 중에도 기기를 바로 깨운다.
        // 기본값(normal)이면 잠든 기기에서 수 분~수십 분 지연될 수 있다.
        // ttl 1일: 기기가 꺼져 있어도 그동안은 보관됐다가 전달된다.
        await server.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(payload, { ttl: 86400, urgency: webpush.Urgency.High });
        sent++;
        await admin.from("push_subscriptions")
          .update({ last_ok_at: new Date().toISOString() }).eq("id", s.id);
      } catch (err: any) {
        // 410 Gone / 404 = 사라진 구독 → 정리
        const code = err?.response?.status;
        if (code === 404 || code === 410 || err?.isGone?.()) dead.push(s.id);
        else console.error("push failed", s.id, String(err));
      }
    }));
    if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);

    return json({ sent, pruned: dead.length });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 200); // pg_net 은 재시도하지 않는다. 시끄럽게 실패할 이유가 없다.
  }
});

function buildTargets(p: any, parents: string[], nameOf: (id: string) => string): Target[] {
  const kid = nameOf(p.member_id);
  const amt = won(p.amount);
  const tag = `${p.event}-${p.entity_id}`;
  const toParents = (title: string, body: string) =>
    parents.map((id) => ({ memberId: id, title, body, tag }));

  switch (p.event) {
    case "spend_request":
      return toParents("💸 지출 요청",
        `${kid}이(가) ${CAT[p.category] ?? "무언가"}에 ${amt}원 쓰고 싶어해요${p.memo ? ` · "${p.memo}"` : ""}`);
    case "transfer_request":
      return toParents("💌 송금 요청", `${kid} → ${nameOf(p.to_member_id)} ${amt}원`);
    case "proposal_request":
      return toParents("🏆 퀘스트 제안", `${kid}이(가) "${p.title}"을(를) 제안했어요 (${won(p.reward)}원)`);
    case "quest_submitted":
      return toParents("⏳ 완료 확인 기다려요",
        `${kid}이(가) "${p.title}"을(를) 끝냈대요${p.qty ? ` (${p.qty}${p.unit ?? ""})` : ""}`);

    case "request_approved":
      if (p.kind === "transfer") {
        return [
          { memberId: p.member_id, title: "✅ 보냈어요!", body: `${nameOf(p.to_member_id)}에게 ${amt}원을 보냈어요`, tag },
          { memberId: p.to_member_id, title: "💌 선물이 왔어요!", body: `${kid}이(가) ${amt}원을 보내줬어요`, tag: tag + "-in" },
        ];
      }
      if (p.kind === "proposal") {
        return [{ memberId: p.member_id, title: "🏆 퀘스트가 생겼어요!", body: `"${p.title}" 이제 도전할 수 있어요`, tag }];
      }
      return [{ memberId: p.member_id, title: "✅ 허락받았어요!",
        body: `${p.memo ? `"${p.memo}" ` : ""}${amt}원을 쓸 수 있어요`, tag }];

    case "request_rejected":
      return [{ memberId: p.member_id, title: "🙅 이번엔 안 됐어요",
        body: `${p.memo || p.title || "요청"}이(가) 거절됐어요. 부모님과 이야기해봐요`, tag }];

    case "quest_paid":
      return [{ memberId: p.member_id, title: "🎉 보상 도착!",
        body: `${p.label ?? "퀘스트"} +${amt}원! 지금 ${won(p.balance)}원`, tag }];

    case "allowance_given":
      return [{ memberId: p.member_id, title: "🎁 용돈이 들어왔어요",
        body: `+${amt}원 · 지금 ${won(p.balance)}원`, tag }];

    case "fine_issued":
      return [{ memberId: p.member_id, title: "⚠️ 벌금이 있어요",
        body: `${p.reason ?? "약속 어김"} -${amt}원 · 앱에서 확인해주세요`, tag }];

    default:
      return [];
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}

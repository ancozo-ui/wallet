// 용돈 나라 — 투자 지갑 이자 지급
// 매일 pg_cron(invest_tick_dispatch) 이 호출한다. 호출자는 브라우저가 아니라
// Postgres(pg_net) 이므로 x-invest-secret 헤더로 인증한다(notify 함수와 동일 패턴).
// 배포: supabase functions deploy invest-tick   (config.toml 에서 verify_jwt=false)
//
// 매번 하는 일:
//  1) 오늘(가장 최근 거래일) 지수 종가를 가져와 market_snapshots 에 저장
//  2) 마지막 이자 지급 이후 15일이 지났으면, 그 구간을 반으로 나눠 앞뒤 평균을
//     비교해 등락률을 구하고 invest_config 의 이율 범위로 매핑한 뒤 apply_invest_tick() 호출
//
// 이율 범위·어느 지수를 쓸지는 코드에 없다 — invest_config 테이블(DB) 값을 매번
// 읽어서 쓴다. 바꾸고 싶으면 그 테이블을 SQL 로 update 하면 되고 배포가 필요 없다.
//
// 지수를 못 가져와도(휴장일 등으로 오늘치가 비어도) 절대 실패로 죽지 않는다 —
// 구간 평균 계산에 데이터가 모자라면 그냥 최소이율로 떨어질 뿐이다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WINDOW_DAYS = 15;
const DEFAULT_CFG = { rate_floor_pct: 0.15, rate_cap_pct: 0.5, cap_change_pct: 5, stooq_symbol: "^spx", yahoo_symbol: "^GSPC" };

Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-invest-secret") !== Deno.env.get("INVEST_HOOK_SECRET")) {
      return json({ error: "unauthorized" }, 401);
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const cfg = await fetchConfig(admin);

    // 테스트/수동 확인용: ?window_start=YYYY-MM-DD&window_end=YYYY-MM-DD 를 주면
    // 15일 대기 없이 그 구간을 바로 계산해 적용한다(실제 15일을 기다릴 필요 없음).
    const url = new URL(req.url);
    const forceStart = url.searchParams.get("window_start");
    const forceEnd = url.searchParams.get("window_end");

    await fetchAndStoreLatest(admin, cfg);

    if (forceStart && forceEnd) {
      const result = await evaluateWindow(admin, cfg, forceStart, forceEnd);
      return json({ forced: true, ...result });
    }

    const { data: lastTick } = await admin
      .from("invest_ticks").select("window_end").order("window_end", { ascending: false }).limit(1).maybeSingle();

    let windowStart: string;
    if (lastTick) {
      windowStart = addDays(lastTick.window_end, 1);
    } else {
      const { data: first } = await admin
        .from("market_snapshots").select("date").order("date", { ascending: true }).limit(1).maybeSingle();
      if (!first) return json({ tick: false, reason: "no snapshots yet" });
      windowStart = first.date;
    }
    const windowEnd = addDays(windowStart, WINDOW_DAYS - 1);
    const today = new Date().toISOString().slice(0, 10);
    if (today < windowEnd) {
      return json({ tick: false, reason: "window not closed yet", windowStart, windowEnd, today });
    }

    const result = await evaluateWindow(admin, cfg, windowStart, windowEnd);
    return json({ tick: true, ...result });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 200); // pg_net 은 재시도하지 않는다. 시끄럽게 실패할 이유가 없다.
  }
});

async function fetchConfig(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.from("invest_config").select("*").eq("id", true).maybeSingle();
  return data ? { ...DEFAULT_CFG, ...data } : DEFAULT_CFG;
}

async function evaluateWindow(admin: ReturnType<typeof createClient>, cfg: any, windowStart: string, windowEnd: string) {
  const { data: rows } = await admin
    .from("market_snapshots").select("date, value")
    .gte("date", windowStart).lte("date", windowEnd).order("date", { ascending: true });

  const { changePct, ratePct } = computeRate(rows ?? [], cfg);

  const { error } = await admin.rpc("apply_invest_tick", {
    p_window_start: windowStart,
    p_window_end: windowEnd,
    p_change_pct: changePct,
    p_rate_pct: ratePct,
  });
  if (error) throw error;

  return { windowStart, windowEnd, sampleCount: rows?.length ?? 0, changePct, ratePct };
}

// 구간을 반으로 나눠 앞/뒤 평균을 비교 — 하루이틀의 급등락에 휘둘리지 않게 스무딩.
// 데이터가 모자라면(휴장일이 겹쳤거나 지수를 아예 못 가져왔거나) 안전하게 최소이율.
function computeRate(rows: { date: string; value: number }[], cfg: any) {
  const floor = Number(cfg.rate_floor_pct), cap = Number(cfg.rate_cap_pct), capChange = Number(cfg.cap_change_pct);
  if (rows.length < 2) return { changePct: 0, ratePct: floor };
  const mid = Math.floor(rows.length / 2);
  const firstHalf = rows.slice(0, mid);
  const secondHalf = rows.slice(mid);
  const avg = (xs: { value: number }[]) => xs.reduce((s, x) => s + Number(x.value), 0) / xs.length;
  const a = avg(firstHalf), b = avg(secondHalf);
  if (!(a > 0)) return { changePct: 0, ratePct: floor };
  const changePct = (b / a - 1) * 100;
  const ratePct = changePct <= 0 ? floor : changePct >= capChange ? cap : floor + (cap - floor) * (changePct / capChange);
  return { changePct: round2(changePct), ratePct: round2(ratePct) };
}

async function fetchAndStoreLatest(admin: ReturnType<typeof createClient>, cfg: any) {
  const latest = await fetchStooqLatest(cfg.stooq_symbol).catch(() => null)
    ?? await fetchYahooLatest(cfg.yahoo_symbol).catch(() => null);
  if (!latest) return; // 둘 다 실패해도 조용히 넘어간다 — 다음날 다시 시도
  await admin.from("market_snapshots")
    .upsert({ date: latest.date, value: latest.value, source: latest.source, fetched_at: new Date().toISOString() },
      { onConflict: "date" });
}

// Stooq: 무료, 키 불필요, CSV. 최근 며칠치를 받아 마지막(가장 최근 거래일) 행만 쓴다.
async function fetchStooqLatest(symbol: string): Promise<{ date: string; value: number; source: string }> {
  const res = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`);
  if (!res.ok) throw new Error(`stooq ${res.status}`);
  const csv = (await res.text()).trim();
  const lines = csv.split("\n").filter((l) => l && !l.startsWith("Date"));
  const last = lines.at(-1);
  if (!last) throw new Error("stooq empty");
  const [date, , , , close] = last.split(",");
  const value = Number(close);
  if (!date || !Number.isFinite(value)) throw new Error("stooq parse failed");
  return { date, value, source: "stooq" };
}

// Yahoo Finance 비공식 차트 API. Stooq 가 막히거나 느릴 때 보조용.
async function fetchYahooLatest(symbol: string): Promise<{ date: string; value: number; source: string }> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`);
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const j = await res.json();
  const result = j?.chart?.result?.[0];
  const ts: number[] = result?.timestamp ?? [];
  const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];
  for (let i = ts.length - 1; i >= 0; i--) {
    if (closes[i] != null) {
      return { date: new Date(ts[i] * 1000).toISOString().slice(0, 10), value: closes[i], source: "yahoo" };
    }
  }
  throw new Error("yahoo parse failed");
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function round2(n: number): number { return Math.round(n * 100) / 100; }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

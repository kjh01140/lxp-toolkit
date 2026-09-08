/**
 * POST /api/hit  — 방문 · 다운로드 클릭 집계 (공개 엔드포인트)
 *
 * body: { "t": "view" }                     페이지뷰 1
 *       { "t": "dl", "asset": "<파일명>" }   다운로드 버튼 클릭 1
 *
 * 저장: Cloudflare KV 네임스페이스 바인딩 STATS 의 단일 키 "stats"
 *   {
 *     total:  <누적 페이지뷰>,
 *     days:   { "YYYY-MM-DD": <그 날 페이지뷰> , ... },   // 최근 180일만 유지
 *     clicks: { "<asset>": <누적 클릭> , ... },
 *     firstAt: <ISO>,  updatedAt: <ISO>
 *   }
 *
 * 주의: KV 는 원자적 증가가 없어 "읽고-더하고-쓰기" 방식입니다. 동시에 정확히
 * 겹친 요청은 하나가 유실될 수 있습니다(친구 배포 규모에선 거의 없음). 과금이
 * 아니라 분석 지표이므로 근사치로 충분합니다.
 */

const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview|monitor|lighthouse|headless|pingdom|uptime/i;

function day(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function prune(days, keep) {
  const keys = Object.keys(days).sort();
  while (keys.length > keep) delete days[keys.shift()];
  return days;
}

export async function onRequestPost({ request, env }) {
  const kv = env.STATS;
  if (!kv) return json({ ok: false, error: "STATS KV 바인딩 없음" }, 500);

  // 같은 사이트에서 온 요청만 허용 (선택: SITE_ORIGIN 미설정 시 same-origin 자동 허용)
  const origin = request.headers.get("Origin") || "";
  const self = new URL(request.url).origin;
  const allow = (env.SITE_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  const okOrigin = !origin || origin === self || allow.includes(origin) || allow.length === 0;
  if (!okOrigin) return json({ ok: false, error: "forbidden" }, 403);

  // 봇 필터
  const ua = request.headers.get("User-Agent") || "";
  if (BOT.test(ua)) return json({ ok: true, skipped: "bot" });

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }

  const now = new Date().toISOString();
  const raw = await kv.get("stats");
  const s = raw ? JSON.parse(raw) : { total: 0, days: {}, clicks: {}, firstAt: now };

  if (body && body.t === "view") {
    const k = day(now);
    s.total = (s.total || 0) + 1;
    s.days[k] = (s.days[k] || 0) + 1;
    prune(s.days, 180);
  } else if (body && body.t === "dl" && typeof body.asset === "string" && body.asset.length < 128) {
    s.clicks[body.asset] = (s.clicks[body.asset] || 0) + 1;
  } else {
    return json({ ok: false, error: "unknown event" }, 400);
  }
  s.updatedAt = now;

  await kv.put("stats", JSON.stringify(s));
  return json({ ok: true });
}

// sendBeacon 프리플라이트 / 크로스오리진 대비
export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

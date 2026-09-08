/**
 * POST /api/stats  — 관리자 대시보드 데이터 (비밀번호 필요)
 *
 * body: { "pw": "<관리자 비밀번호>" }
 *   → 환경변수 ADMIN_PW 와 일치할 때만 200. 아니면 401.
 *
 * 응답:
 *   {
 *     stats:   { total, days:{...}, clicks:{...}, firstAt, updatedAt },
 *     releases:[ { tag, name, downloads, size, updatedAt } , ... ],  // GitHub Releases 실제 다운로드 수
 *     repo:    "kjh01140/lxp-toolkit",
 *     now:     <ISO>
 *   }
 *
 * 환경변수 (Cloudflare Pages → Settings → Environment variables):
 *   ADMIN_PW   (필수)  관리자 비밀번호
 *   GH_REPO    (선택)  기본값 "kjh01140/lxp-toolkit"
 * KV 바인딩:
 *   STATS      (필수)  hit.js 와 동일한 네임스페이스
 */

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { body = {}; }

  if (!env.ADMIN_PW) {
    return json({ error: "server_misconfigured", message: "ADMIN_PW 환경변수가 없습니다." }, 500);
  }
  if (!body || body.pw !== env.ADMIN_PW) {
    return json({ error: "unauthorized" }, 401);
  }

  const kv = env.STATS;
  const raw = kv ? await kv.get("stats") : null;
  const stats = raw ? JSON.parse(raw) : { total: 0, days: {}, clicks: {}, firstAt: null, updatedAt: null };

  const repo = env.GH_REPO || "kjh01140/lxp-toolkit";
  let releases = [];
  let releasesError = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
      headers: {
        "User-Agent": "lxp-toolkit-admin",
        Accept: "application/vnd.github+json",
      },
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    if (r.ok) {
      const list = await r.json();
      releases = list.flatMap((rel) =>
        (rel.assets || []).map((a) => ({
          tag: rel.tag_name,
          name: a.name,
          downloads: a.download_count,
          size: a.size,
          updatedAt: a.updated_at,
        }))
      );
    } else {
      releasesError = `GitHub API ${r.status}`;
    }
  } catch (e) {
    releasesError = String(e);
  }

  return json({ stats, releases, releasesError, repo, now: new Date().toISOString() });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

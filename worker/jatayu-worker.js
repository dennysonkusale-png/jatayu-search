/**
 * Jatayu search proxy — a Cloudflare Worker.
 *
 * Why this exists: the browser cannot call a general search API directly.
 * Providers require a secret key, which cannot live in a public HTML file,
 * and most refuse cross-origin requests. This worker holds the key, adds the
 * CORS headers the page needs, and caches.
 *
 * Deploy:
 *   cd worker
 *   npm install -g wrangler
 *   wrangler login
 *   wrangler secret put BRAVE_API_KEY     # or SEARXNG_URL
 *   wrangler deploy
 *
 * Then put the worker URL into the <meta name="jatayu-proxy"> tag in
 * jatayu.html.
 *
 * What it deliberately does not do: log queries, store anything, or serve
 * ads. It answers, caches for five minutes, and forgets.
 */

const MAX_QUERY = 300;
const CACHE_SECONDS = 300;

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405, cors);

    const url = new URL(request.url);

    if (url.searchParams.has("ping")) {
      return json({
        ok: true,
        provider: env.BRAVE_API_KEY ? "brave" : env.SEARXNG_URL ? "searxng" : "none",
      }, 200, cors);
    }

    const q = (url.searchParams.get("q") || "").trim().slice(0, MAX_QUERY);
    if (!q) return json({ error: "missing q" }, 400, cors);

    const cache = caches.default;
    const cacheKey = new Request(
      "https://jatayu.internal/search" + encodeURIComponent(q) + "&o=" + encodeURIComponent(origin),
      { method: "GET" }
    );
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    let results;
    let source;
    try {
      if (env.BRAVE_API_KEY) {
        results = await brave(q, env);
        source = "brave";
      } else if (env.SEARXNG_URL) {
        results = await searxng(q, env);
        source = "searxng";
      } else {
        return json({
          error: "no provider configured",
          hint: "set the BRAVE_API_KEY or SEARXNG_URL secret",
        }, 501, cors);
      }
    } catch (err) {
      return json({ error: "provider failed", detail: String(err).slice(0, 200) }, 502, cors);
    }

    const response = json({ query: q, source, results }, 200, cors, CACHE_SECONDS);
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};

/* ------------------------------------------------------------------ providers */

async function brave(q, env) {
  const url = "https://api.search.brave.com/res/v1/web/search" +
    "?count=15&text_decorations=false&safesearch=moderate&q=" + encodeURIComponent(q);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": env.BRAVE_API_KEY,
    },
  });
  if (!res.ok) throw new Error("brave responded " + res.status);
  const data = await res.json();
  const items = (data.web && data.web.results) || [];
  return items.map((r) => ({
    title: plain(r.title),
    url: r.url,
    snippet: plain(r.description),
    source: hostOf(r.url),
    type: "web",
  })).filter((r) => r.url && r.title);
}

async function searxng(q, env) {
  const base = String(env.SEARXNG_URL).replace(/\/+$/, "");
  const url = base + "/search?format=json&safesearch=1&q=" + encodeURIComponent(q);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("searxng responded " + res.status);
  const data = await res.json();
  const items = Array.isArray(data.results) ? data.results : [];
  return items.slice(0, 15).map((r) => ({
    title: plain(r.title),
    url: r.url,
    snippet: plain(r.content),
    source: hostOf(r.url),
    type: "web",
  })).filter((r) => r.url && r.title);
}

/* -------------------------------------------------------------------- helpers */

function plain(s) {
  return String(s == null ? "" : s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}

function json(body, status, cors, maxAge) {
  const headers = Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors);
  if (maxAge) headers["Cache-Control"] = "public, max-age=" + maxAge;
  else headers["Cache-Control"] = "no-store";
  return new Response(JSON.stringify(body), { status, headers });
}

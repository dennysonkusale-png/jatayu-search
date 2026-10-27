/**
 * Jatayu accounts — email-code sign-in, sessions, saved searches.
 *
 * No passwords. A user enters an email, receives a 6-digit code, and gets a
 * session cookie. Codes and tokens are stored only as SHA-256 hashes.
 *
 * Required bindings/secrets:
 *   DB              D1 database (see schema.sql)
 *   RESEND_API_KEY  transactional email
 *   MAIL_FROM       e.g. "Jatayu <login@yourdomain.in>" — must be a verified
 *                   sending domain with SPF, DKIM and DMARC, or codes land in spam
 *   SESSION_PEPPER  random string; mixed into code hashes
 *   CROSS_SITE      "true" when the front end is on a different site to this
 *                   worker (e.g. github.io). Sets SameSite=None; Secure.
 *   DEV_SHOW_CODE   "1" to return the code in the response. Never in production.
 */

const COOKIE = "jt_session";
const SESSION_DAYS = 30;
const CODE_TTL_SEC = 600;
const MAX_CODE_ATTEMPTS = 5;
const MAX_BODY = 4096;

/* ------------------------------------------------------------------ router */

export async function route(request, env, url, cors) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  try {
    if (path === "/auth/code" && method === "POST") return await requestCode(request, env, cors);
    if (path === "/auth/verify" && method === "POST") return await verifyCode(request, env, cors);
    if (path === "/auth/logout" && method === "POST") return await logout(request, env, cors);
    if (path === "/me" && method === "GET") return await getMe(request, env, cors);
    if (path === "/me" && method === "DELETE") return await deleteAccount(request, env, cors);
    if (path === "/me/prefs" && method === "PUT") return await savePrefs(request, env, cors);
    if (path === "/searches" && method === "GET") return await listSearches(request, env, cors);
    if (path === "/searches" && method === "POST") return await addSearch(request, env, cors);
    if (path === "/searches" && method === "DELETE") return await clearSearches(request, env, cors);
  } catch (err) {
    return json({ error: "server_error", detail: String(err).slice(0, 200) }, 500, cors);
  }
  return null;
}

/* ------------------------------------------------------------------- routes */

async function requestCode(request, env, cors) {
  const body = await readJson(request);
  const email = normaliseEmail(body && body.email);
  if (!email) return json({ error: "invalid_email" }, 400, cors);

  /* Two limits: one stops a single address being mailbombed, the other stops
     this worker being used as a free email cannon from one IP. */
  if (!(await bumpLimit(env, "code:email:" + email, 5, 3600))) {
    return json({ error: "rate_limited", retry_after: 3600 }, 429, cors);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await bumpLimit(env, "code:ip:" + ip, 20, 3600))) {
    return json({ error: "rate_limited", retry_after: 3600 }, 429, cors);
  }

  const code = randomCode();
  const now = nowSec();
  const hash = await hashCode(env, email, code);

  await env.DB.prepare(
    "INSERT INTO login_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0) " +
    "ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, " +
    "expires_at = excluded.expires_at, attempts = 0"
  ).bind(email, hash, now + CODE_TTL_SEC).run();

  try {
    await sendCodeEmail(env, email, code);
  } catch (err) {
    return json({ error: "mail_failed", detail: String(err).slice(0, 120) }, 502, cors);
  }

  const out = { ok: true, sent: true, expires_in: CODE_TTL_SEC };
  if (env.DEV_SHOW_CODE === "1") out.dev_code = code;
  return json(out, 202, cors);
}

async function verifyCode(request, env, cors) {
  const body = await readJson(request);
  const email = normaliseEmail(body && body.email);
  const code = String((body && body.code) || "").trim();
  if (!email) return json({ error: "invalid_email" }, 400, cors);
  if (!/^\d{6}$/.test(code)) return json({ error: "invalid_code" }, 400, cors);

  if (!(await bumpLimit(env, "verify:ip:" + (request.headers.get("CF-Connecting-IP") || "unknown"), 30, 3600))) {
    return json({ error: "rate_limited" }, 429, cors);
  }

  const row = await env.DB.prepare(
    "SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?"
  ).bind(email).first();

  if (!row) return json({ error: "no_code" }, 400, cors);
  if (row.expires_at < nowSec()) {
    await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
    return json({ error: "expired" }, 400, cors);
  }
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    return json({ error: "too_many_attempts" }, 429, cors);
  }

  const expected = await hashCode(env, email, code);
  if (expected !== row.code_hash) {
    await env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    return json({ error: "invalid_code" }, 400, cors);
  }

  /* Correct code: burn it, then upsert the user and open a session. */
  await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();

  const now = nowSec();
  let user = await env.DB.prepare("SELECT id, email, email_verified FROM users WHERE email = ?")
    .bind(email).first();
  if (!user) {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id, email, email_verified, created_at) VALUES (?, ?, 1, ?)"
    ).bind(id, email, now).run();
    user = { id, email, email_verified: 1 };
  } else if (!user.email_verified) {
    await env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(user.id).run();
  }

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(tokenHash, user.id, now, now + SESSION_DAYS * 86400).run();

  const headers = Object.assign({}, cors, {
    "Set-Cookie": sessionCookie(env, token, SESSION_DAYS * 86400),
  });
  return json({ ok: true, email: user.email }, 200, headers);
}

async function logout(request, env, cors) {
  const token = cookieValue(request, COOKIE);
  if (token) {
    const h = await sha256Hex(token);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(h).run();
  }
  const headers = Object.assign({}, cors, { "Set-Cookie": clearCookie(env) });
  return json({ ok: true }, 200, headers);
}

async function getMe(request, env, cors) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorised" }, 401, cors);
  const prefs = await env.DB.prepare("SELECT theme, lang, safe_search FROM prefs WHERE user_id = ?")
    .bind(user.id).first();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM saved_searches WHERE user_id = ?")
    .bind(user.id).first();
  return json({
    email: user.email,
    saved: count ? count.n : 0,
    prefs: prefs ? {
      theme: prefs.theme ? safeParse(prefs.theme) : null,
      lang: prefs.lang,
      safe_search: !!prefs.safe_search,
    } : null,
  }, 200, cors);
}

async function deleteAccount(request, env, cors) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorised" }, 401, cors);
  /* DPDP Act: deletion must actually delete. FKs cascade. */
  await env.DB.prepare("DELETE FROM saved_searches WHERE user_id = ?").bind(user.id).run();
  await env.DB.prepare("DELETE FROM prefs WHERE user_id = ?").bind(user.id).run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();
  const headers = Object.assign({}, cors, { "Set-Cookie": clearCookie(env) });
  return json({ ok: true, deleted: true }, 200, headers);
}

async function savePrefs(request, env, cors) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorised" }, 401, cors);
  const body = await readJson(request);
  if (!body) return json({ error: "invalid_body" }, 400, cors);

  const theme = body.theme ? JSON.stringify(body.theme).slice(0, 4000) : null;
  const lang = typeof body.lang === "string" ? body.lang.slice(0, 8) : null;
  const safe = body.safe_search === false ? 0 : 1;

  await env.DB.prepare(
    "INSERT INTO prefs (user_id, theme, lang, safe_search, updated_at) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, lang = excluded.lang, " +
    "safe_search = excluded.safe_search, updated_at = excluded.updated_at"
  ).bind(user.id, theme, lang, safe, nowSec()).run();

  return json({ ok: true }, 200, cors);
}

async function listSearches(request, env, cors) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorised" }, 401, cors);
  const { results } = await env.DB.prepare(
    "SELECT id, query, filters, pinned, created_at FROM saved_searches " +
    "WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
  ).bind(user.id).all();
  return json({
    searches: (results || []).map(function(r){
      return {
        id: r.id, query: r.query, pinned: !!r.pinned,
        created_at: r.created_at, filters: r.filters ? safeParse(r.filters) : null,
      };
    }),
  }, 200, cors);
}

async function addSearch(request, env, cors) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorised" }, 401, cors);
  const body = await readJson(request);
  const query = String((body && body.query) || "").trim().slice(0, 200);
  if (!query) return json({ error: "invalid_query" }, 400, cors);

  const filters = body.filters ? JSON.stringify(body.filters).slice(0, 500) : null;
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO saved_searches (id, user_id, query, filters, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, user.id, query, filters, body.pinned ? 1 : 0, nowSec()).run();

  return json({ ok: true, id }, 201, cors);
}

async function clearSearches(request, env, cors) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorised" }, 401, cors);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    await env.DB.prepare("DELETE FROM saved_searches WHERE id = ? AND user_id = ?")
      .bind(id, user.id).run();
  } else {
    await env.DB.prepare("DELETE FROM saved_searches WHERE user_id = ?").bind(user.id).run();
  }
  return json({ ok: true }, 200, cors);
}

/* ------------------------------------------------------------------ helpers */

async function currentUser(request, env) {
  const token = cookieValue(request, COOKIE);
  if (!token) return null;
  const h = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT s.expires_at, u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id " +
    "WHERE s.token_hash = ?"
  ).bind(h).first();
  if (!row) return null;
  if (row.expires_at < nowSec()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(h).run();
    return null;
  }
  return { id: row.id, email: row.email };
}

async function bumpLimit(env, key, limit, windowSec) {
  const now = nowSec();
  const row = await env.DB.prepare("SELECT count, reset_at FROM rate_limits WHERE key = ?")
    .bind(key).first();
  if (!row || row.reset_at < now) {
    await env.DB.prepare(
      "INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?) " +
      "ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at"
    ).bind(key, now + windowSec).run();
    return true;
  }
  if (row.count >= limit) return false;
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
  return true;
}

async function sendCodeEmail(env, email, code) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");
  const from = env.MAIL_FROM || "Jatayu <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: code + " is your Jatayu sign-in code",
      text: "Your Jatayu code is " + code + ". It expires in 10 minutes. " +
            "If you did not ask for this, ignore this email.",
      html: '<div style="font-family:system-ui,Arial,sans-serif;font-size:16px">' +
            '<p>Your Jatayu sign-in code:</p>' +
            '<p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:16px 0">' + code + '</p>' +
            '<p style="color:#666;font-size:13px">It expires in 10 minutes. ' +
            'If you did not ask for this, ignore this email.</p></div>',
    }),
  });
  if (!res.ok) throw new Error("resend " + res.status);
}

async function readJson(request) {
  const text = await request.text();
  if (!text || text.length > MAX_BODY) return null;
  try { return JSON.parse(text); } catch (e) { return null; }
}

function normaliseEmail(v) {
  const email = String(v || "").trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

function nowSec() { return Math.floor(Date.now() / 1000); }

function randomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, "0");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(function(b){ return b.toString(16).padStart(2, "0"); }).join("");
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(function(b){ return b.toString(16).padStart(2, "0"); }).join("");
}

function hashCode(env, email, code) {
  return sha256Hex(email + ":" + code + ":" + (env.SESSION_PEPPER || ""));
}

function cookieValue(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const parts = raw.split(";");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    const eq = p.indexOf("=");
    if (eq > -1 && p.slice(0, eq) === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return null;
}

function cookieAttrs(env) {
  const cross = String(env.CROSS_SITE || "") === "true";
  return "; Path=/; HttpOnly; Secure; SameSite=" + (cross ? "None" : "Lax");
}

function sessionCookie(env, token, maxAge) {
  return COOKIE + "=" + encodeURIComponent(token) + cookieAttrs(env) + "; Max-Age=" + maxAge;
}

function clearCookie(env) {
  return COOKIE + "=" + cookieAttrs(env) + "; Max-Age=0";
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers),
  });
}

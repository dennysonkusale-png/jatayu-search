/**
 * Auth test suite.
 *
 * Runs the real worker code against real SQLite (via Python's sqlite3 module,
 * because this sandbox cannot load native or wasm SQLite builds). That means
 * the schema, the queries and the route logic are all genuinely exercised.
 *
 *   node test/auth.test.mjs
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = "/tmp/jatayu-auth-test.db";
const SCHEMA = fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

/* ---------------------------------------------------------------- D1 shim */

const PY = `
import sys, json, sqlite3
req = json.load(sys.stdin)
con = sqlite3.connect(req["db"])
con.row_factory = sqlite3.Row
if "script" in req:
    con.executescript(req["script"])
    con.commit()
    print(json.dumps({"rows": []}))
    sys.exit(0)
cur = con.execute(req["sql"], req["params"])
if cur.description:
    print(json.dumps({"rows": [dict(r) for r in cur.fetchall()]}))
else:
    con.commit()
    print(json.dumps({"changes": cur.rowcount, "last_id": cur.lastrowid}))
con.commit()
`;

function runSQL(sql, params = []) {
  const out = execFileSync("python3", ["-c", PY], {
    input: JSON.stringify({ db: DB_PATH, sql, params }),
    encoding: "utf8",
  });
  return JSON.parse(out);
}

function runScript(sql) {
  execFileSync("python3", ["-c", PY], {
    input: JSON.stringify({ db: DB_PATH, script: sql }),
    encoding: "utf8",
  });
}

function makeDB() {
  return {
    prepare(sql) {
      const stmt = {
        _params: [],
        bind(...args) { stmt._params = args; return stmt; },
        async first() {
          const r = runSQL(sql, stmt._params);
          return r.rows && r.rows.length ? r.rows[0] : null;
        },
        async all() { const r = runSQL(sql, stmt._params); return { results: r.rows || [] }; },
        async run() { return runSQL(sql, stmt._params); },
      };
      return stmt;
    },
  };
}

/* ------------------------------------------------------------- environment */

if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
runScript(SCHEMA);

const sent = [];
globalThis.fetch = async (url, opts) => {
  if (String(url).includes("api.resend.com")) {
    sent.push(JSON.parse(opts.body));
    return new FakeResponse(JSON.stringify({ id: "msg_1" }), { status: 200 });
  }
  throw new Error("unexpected fetch " + url);
};

const env = {
  DB: makeDB(),
  RESEND_API_KEY: "test",
  MAIL_FROM: "Jatayu <login@test.dev>",
  SESSION_PEPPER: "pepper",
  ALLOWED_ORIGIN: "https://example.test",
  DEV_SHOW_CODE: "1",
};
const ctx = { waitUntil() {} };
const CORS = {
  "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
  "Access-Control-Allow-Credentials": "true",
};

const worker = (await import("../jatayu-worker.js")).default;

/* Minimal stand-ins for the web APIs the worker uses. undici's versions need
   llhttp, a wasm module this sandbox cannot allocate repeatedly, so we avoid
   them entirely. These implement exactly the surface the worker touches. */
class H {
  constructor(init = {}) {
    this._m = {};
    if (init instanceof H) { this._m = { ...init._m }; return; }
    for (const k of Object.keys(init)) this._m[String(k).toLowerCase()] = String(init[k]);
  }
  get(k) { const v = this._m[String(k).toLowerCase()]; return v === undefined ? null : v; }
  set(k, v) { this._m[String(k).toLowerCase()] = String(v); }
  has(k) { return String(k).toLowerCase() in this._m; }
}
class FakeRequest {
  constructor(url, init = {}) {
    this.url = url;
    this.method = (init.method || "GET").toUpperCase();
    this.headers = new H(init.headers || {});
    this._body = init.body == null ? "" : String(init.body);
  }
  async text() { return this._body; }
  async json() { return JSON.parse(this._body); }
}
class FakeResponse {
  constructor(body, init = {}) {
    this._body = body == null ? "" : String(body);
    this.status = init.status || 200;
    this.headers = new H(init.headers || {});
  }
  get ok() { return this.status >= 200 && this.status < 300; }
  async text() { return this._body; }
  async json() { return JSON.parse(this._body); }
  clone() { return new FakeResponse(this._body, { status: this.status, headers: this.headers }); }
}
let cacheStore = null;
globalThis.caches = { default: {
  async match() { return cacheStore ? cacheStore.clone() : undefined; },
  async put(k, r) { cacheStore = r; },
} };
globalThis.Request = FakeRequest;
globalThis.Response = FakeResponse;
globalThis.Headers = H;

const call = (path, init = {}) =>
  worker.fetch(new FakeRequest("https://w.test" + path, init), env, ctx);

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

/* ------------------------------------------------------------------ tests */

let r = await call("/auth/code", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "Denny@Example.com " }),
});
let body = await r.json();
check("code requested", r.status === 202 && body.ok === true, `status ${r.status}`);
check("email normalised to lowercase", body.dev_code && sent[0].to[0] === "denny@example.com",
  sent[0] ? sent[0].to : "no mail");
check("dev code returned for testing", /^\d{6}$/.test(body.dev_code || ""));
check("mail body contains the code", sent[0].text.includes(body.dev_code));
const code = body.dev_code;

r = await call("/auth/code", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "not-an-email" }),
});
check("bad email rejected", r.status === 400);

r = await call("/auth/verify", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "denny@example.com", code: "000000" === code ? "111111" : "000000" }),
});
check("wrong code rejected", r.status === 400, `status ${r.status}`);

const row = runSQL("SELECT attempts FROM login_codes WHERE email = ?", ["denny@example.com"]).rows[0];
check("failed attempt counted", row && row.attempts === 1, `attempts ${row && row.attempts}`);

r = await call("/auth/verify", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "denny@example.com", code }),
});
body = await r.json();
const setCookie = r.headers.get("set-cookie") || "";
check("correct code signs in", r.status === 200 && body.ok === true, `status ${r.status}`);
check("session cookie is httpOnly", /HttpOnly/i.test(setCookie));
check("session cookie is SameSite=Lax by default", /SameSite=Lax/i.test(setCookie));
const cookie = setCookie.split(";")[0];

const tokenHashInDB = runSQL("SELECT token_hash FROM sessions").rows[0];
check("token stored hashed, not raw",
  tokenHashInDB && !cookie.includes(tokenHashInDB.token_hash) && tokenHashInDB.token_hash.length === 64);

const codeGone = runSQL("SELECT COUNT(*) AS n FROM login_codes").rows[0];
check("code burned after use", codeGone.n === 0);

r = await call("/me", { headers: { Cookie: cookie } });
body = await r.json();
check("GET /me returns the account", r.status === 200 && body.email === "denny@example.com");
check("new account has zero saved searches", body.saved === 0);

r = await call("/me");
check("GET /me without a cookie is 401", r.status === 401);

r = await call("/me", { headers: { Cookie: "jt_session=deadbeef" } });
check("forged cookie is 401", r.status === 401);

r = await call("/searches", {
  method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "chai near me", filters: { location: "Mumbai", radiusKm: 10 }, pinned: true }),
});
check("saving a search works", r.status === 201, `status ${r.status}`);

r = await call("/searches", { headers: { Cookie: cookie } });
body = await r.json();
check("saved search round-trips with filters",
  body.searches.length === 1 && body.searches[0].query === "chai near me" &&
  body.searches[0].filters.radiusKm === 10 && body.searches[0].pinned === true);

r = await call("/me/prefs", {
  method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ theme: { preset: "dark" }, lang: "mr", safe_search: false }),
});
check("prefs saved", r.status === 200);

r = await call("/me", { headers: { Cookie: cookie } });
body = await r.json();
check("prefs come back on /me",
  body.prefs && body.prefs.lang === "mr" && body.prefs.theme.preset === "dark" && body.prefs.safe_search === false);

/* a second user must not see the first user's data */
await call("/auth/code", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "other@example.com" }),
});
const otherCode = sent[sent.length - 1];
const codeForOther = /(\d{6})/.exec(otherCode.text)[1];
r = await call("/auth/verify", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "other@example.com", code: codeForOther }),
});
const otherCookie = (r.headers.get("set-cookie") || "").split(";")[0];
r = await call("/searches", { headers: { Cookie: otherCookie } });
body = await r.json();
check("second user sees no saved searches", body.searches.length === 0);

/* logout kills the session */
r = await call("/auth/logout", { method: "POST", headers: { Cookie: cookie } });
check("logout clears the cookie", /Max-Age=0/.test(r.headers.get("set-cookie") || ""));
r = await call("/me", { headers: { Cookie: cookie } });
check("session dead after logout", r.status === 401);

/* deletion actually deletes (DPDP) */
await call("/auth/code", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "other@example.com" }),
});
const c2 = /(\d{6})/.exec(sent[sent.length - 1].text)[1];
r = await call("/auth/verify", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "other@example.com", code: c2 }),
});
const c2cookie = (r.headers.get("set-cookie") || "").split(";")[0];
await call("/searches", {
  method: "POST", headers: { Cookie: c2cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "delete me" }),
});
r = await call("/me", { method: "DELETE", headers: { Cookie: c2cookie } });
check("account deletion returns ok", r.status === 200);
const left = runSQL("SELECT (SELECT COUNT(*) FROM users WHERE email = ?) AS u, " +
  "(SELECT COUNT(*) FROM saved_searches) AS s", ["other@example.com"]).rows[0];
check("deletion removed user and their searches", left.u === 0 && left.s === 1, JSON.stringify(left));

/* rate limiting: the same address may not be mailed more than 5 times an hour */
let limitedAt = 0;
for (let i = 1; i <= 7; i++) {
  const rr = await call("/auth/code", {
    method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "9.9.9.9" },
    body: JSON.stringify({ email: "flood@example.com" }),
  });
  if (rr.status === 429) { limitedAt = i; break; }
}
check("code requests are rate limited per email", limitedAt === 6, `429 first seen on attempt ${limitedAt}`);

/* search still works through the same worker */
globalThis.fetch = async (url) => {
  if (String(url).includes("api.search.brave.com")) {
    return new FakeResponse(JSON.stringify({ web: { results: [
      { title: "ISRO", url: "https://www.isro.gov.in/", description: "space agency" },
    ] } }), { status: 200 });
  }
  throw new Error("unexpected " + url);
};
env.BRAVE_API_KEY = "k";
r = await call("/?q=isro");
body = await r.json();
check("search route still works alongside auth", r.status === 200 && body.results.length === 1);
check("CORS advertises credentials for cookies",
  r.headers.get("access-control-allow-credentials") === "true");

/* ------------------------------------------------------------------ summary */

const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("FAILED:", failed.map((f) => f.name).join("; "));
  process.exit(1);
}

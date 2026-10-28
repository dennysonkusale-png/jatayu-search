# Search proxy (Cloudflare Worker)

The front end is a static page, so it cannot call a general search API itself: providers
need a secret key, which must never ship inside public HTML, and most block cross-origin
requests. This worker is that missing hop.

```
browser  ->  this worker (holds the key, adds CORS, caches 5 min)  ->  provider
```

Without it the app still works — it falls back to Wikipedia and OpenStreetMap. With it,
results come from a real web index.

## Deploy

**Fastest route — no terminal.** Cloudflare can create the worker straight from this repo:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/

It will ask you to sign in, then prompt for the secrets (`BRAVE_API_KEY` or `SEARXNG_URL`).
Afterwards, open the D1 database it created and run `schema.sql` once, or skip accounts for
now and use search only.

**Or from the command line:**

```bash
npm install -g wrangler
wrangler login
cd worker

# pick ONE provider
wrangler secret put BRAVE_API_KEY     # free tier: https://brave.com/search/api/
# or, if you self-host SearXNG:
wrangler secret put SEARXNG_URL       # e.g. https://searx.example.com

wrangler deploy
```

`wrangler deploy` prints a URL like `https://jatayu-search-proxy.<you>.workers.dev`.
Check it:

```bash
curl "https://jatayu-search-proxy.<you>.workers.dev/?ping=1"
# {"ok":true,"provider":"brave"}

curl "https://jatayu-search-proxy.<you>.workers.dev/?q=isro" | head -c 400
```

## Connect the front end

In `jatayu.html`, fill in the empty meta tag near the top of `<head>`:

```html
<meta name="jatayu-proxy" content="https://jatayu-search-proxy.<you>.workers.dev">
```

Commit, and Pages redeploys. The results line under the search box changes from
"Live results from Wikipedia and OpenStreetMap" to the proxy's results. If the worker is
down or misconfigured the page silently falls back to Wikipedia rather than breaking.

## Notes

- `ALLOWED_ORIGIN` in `wrangler.toml` restricts who may call the worker. Set it to your
  real origin, not `*`.
- Responses are cached for five minutes per query, which cuts provider quota use.
- The worker logs nothing and stores nothing beyond that cache.
- Free tier limits: Brave's free plan is rate-limited, and Cloudflare Workers allows
  100,000 requests a day on the free plan. Check both before pointing real traffic at it.
- Do not commit a key. `wrangler secret` keeps it out of the repo; a key in
  `wrangler.toml` or in the HTML is public the moment you push.

---

# Accounts (email code sign-in)

The same worker also handles accounts: no passwords, a 6-digit code by email, and an
httpOnly session cookie. Files: `auth.js` (routes), `schema.sql` (D1 tables).

## 1. Create the database

```bash
wrangler d1 create jatayu
# copy the database_id it prints into wrangler.toml

wrangler d1 execute jatayu --remote --file=./schema.sql
```

## 2. Secrets

```bash
wrangler secret put RESEND_API_KEY   # https://resend.com — 3,000 emails/month free
wrangler secret put SESSION_PEPPER   # any long random string
```

`MAIL_FROM` lives in `wrangler.toml`. **Codes sent from an unverified domain land in spam**,
so add your domain in Resend and publish its SPF, DKIM and DMARC records before testing with
real users. Resend's `onboarding@resend.dev` sender only mails your own address.

## 3. Deploy and connect

```bash
wrangler deploy
```

Then put the worker URL in the page:

```html
<meta name="jatayu-proxy" content="https://jatayu-search-proxy.<you>.workers.dev">
```

That single setting does two jobs: it turns on real web results *and* switches the sign-in
from local-preview to real accounts.

## 4. Same-site or cross-site?

- Front end on **Cloudflare Pages** (same account, or your own domain): leave
  `CROSS_SITE = "false"`. The cookie is first-party and `SameSite=Lax`.
- Front end on **github.io** (a different site): set `CROSS_SITE = "true"`. The cookie
  becomes `SameSite=None; Secure`, which works but is weaker — a first-party setup is
  worth the move.

`ALLOWED_ORIGIN` must be the exact origin of the front end. With `"*"`, browsers refuse to
send credentials, so sign-in will silently fail.

## 5. What the endpoints do

| Route | Purpose |
|---|---|
| `POST /auth/code` | emails a 6-digit code (10 min, 5/hour per address, 20/hour per IP) |
| `POST /auth/verify` | checks the code, creates the user, sets the session cookie |
| `POST /auth/logout` | deletes the session row and clears the cookie |
| `GET /me` | email, saved-search count, prefs |
| `PUT /me/prefs` | theme, language, safe-search |
| `GET/POST/DELETE /searches` | saved searches with their filters |
| `DELETE /me` | deletes the account, searches, prefs and sessions (DPDP) |

Codes and session tokens are stored only as SHA-256 hashes, so a database dump yields no
usable credentials. The page never sees a token — it lives in an httpOnly cookie.

## 6. Tests

```bash
node test/auth.test.mjs
```

28 checks covering the full flow: code issue, wrong code, attempt counting, code burn,
cookie flags, hashed-token storage, `/me`, saved searches, prefs, one user not seeing
another's data, logout, account deletion, rate limiting, and that the search route still
works alongside auth. They run the real worker against real SQLite (via Python's `sqlite3`,
because this environment cannot load native or wasm builds).

## 7. Before real users

- Email deliverability is the most likely thing to make sign-in feel broken. Test with a
  Gmail and an Outlook address, not just your own domain.
- You are now storing personal data. Have a deletion route (it exists), say what you store,
  and keep it to the minimum: an email address and what the user chose to save.
- Free tiers: Workers 100k requests/day, D1 5 GB and 5M row reads/day, Resend 3k emails/month.

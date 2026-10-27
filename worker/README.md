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

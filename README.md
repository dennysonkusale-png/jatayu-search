# Jatayu

A fast, free, fully themeable search engine for India. **See what others miss.**

This repository holds a working front-end prototype and the build specification behind it. It is not yet connected to a live index — see [What is not built yet](#what-is-not-built-yet).

## What works today

Open `jatayu.html` and everything below is live, in one self-contained file with no build step and no dependencies.

- **Live search** with tabs for All, Images, Videos, News and Places. Web results come from Wikipedia, images and video from Wikimedia Commons, headlines from Wikinews, and nearby places from OpenStreetMap — with real distance badges and directions links.
- **Themes** — system, light and dark, six presets, per-token colour pickers, and an uploaded photo as the page background with dim, blur and position controls. Every custom palette is checked for WCAG AA contrast, with a one-tap auto-fix that never silently overrides the user.
- **Location filter** — opt-in only. Use my location, pick a city, or enter a PIN code; radius chips from 1 to 50 km; a dismissible chip that always shows when a filter is active.
- **Nine interface languages** — English, हिन्दी, मराठी, संस्कृतम्, Español, Français, العربية, 日本語, 简体中文 — with real right-to-left handling for Arabic.
- **Voice search** via the Web Speech API, with per-language recognition and an editable transcript.
- **Account menu and settings in the top-right corner.** With the worker configured, sign-in is a real email-code flow backed by D1, and saved searches sync to the account. Without it, sign-in falls back to a device-local preview that says so.
- **Email results** and **saved searches**, both device-local in this build.

## Run it locally

Voice search and geolocation require a secure context, so serve the file rather than opening it directly:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000/jatayu.html`. Opening the file directly still works for search, themes and the manual location picker, but voice and geolocation will be unavailable and the app will say so.

## What is not built yet

Being explicit, because a prototype that pretends to be a product wastes everyone's time:

- **There is no general web index.** Every tab calls a public, CORS-enabled API straight from the browser: Wikipedia for web results, Wikimedia Commons for images and video, Wikinews for headlines, and OpenStreetMap's Nominatim for nearby places. So a query with no matching article returns little or nothing, and nothing is ranked like a real search engine. Pages behind JavaScript, logins or `noindex` are invisible.
- **The Videos tab is thin.** Commons holds relatively few video files, so expect sparse results until a search proxy is connected.
- **Nominatim's usage policy caps this at roughly one request per second** and forbids heavy or bulk use. That is fine for a demo and not fine for real traffic — see below.
- **The backend exists but is not deployed yet.** `worker/` contains real email-code auth, sessions, saved-search sync and account deletion, tested but inactive until you create the D1 database and add the Resend key. Until then the page runs its device-local preview. Scheduled email digests are still unbuilt, and "Email results" opens the user's mail client rather than sending from the server.
- **No PWA manifest or service worker**, so no offline shell or install prompt.
- **Theme, history and location live in `localStorage`** and never leave the device.

## The build specification

`jatayu-build-prompt.md` is a complete, paste-ready brief for an AI coding agent — the product requirements, performance budgets, data contracts, privacy posture and 23 acceptance criteria. It covers what this prototype does not: a real search provider behind one interface, accounts with email-code sign-in, transactional email with SPF/DKIM/DMARC, per-locale font subsetting, and the PWA work.

## Real web search (optional)

A static page cannot call a general search API directly: providers need a secret key, which
cannot live in public HTML, and most block cross-origin requests. This repo ships the missing
hop — a Cloudflare Worker in [`worker/`](worker/README.md) that holds the key, adds CORS and
caches for five minutes.

```
browser  ->  worker (Brave or SearXNG key, CORS, cache)  ->  provider
```

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/

Deploy it from that button, or follow `worker/README.md`. Then paste the worker URL into
**Settings → Search index URL** in the app and press Save — no editing files, no rebuild. You can
also hard-code it in the `<meta name="jatayu-proxy">` tag in `jatayu.html` if you prefer.

Until an index is configured the app uses Wikipedia and Wikinews, and says so in a banner above
the results, because those are an encyclopaedia and a news wire rather than a web index. If the
worker is unreachable the page falls back to them rather than breaking.

## Design decisions worth knowing

**The name.** Jatayu is the eagle of the Ramayana who saw what everyone else missed and acted on it. Far-sightedness is the right metaphor for a search engine. A naming note in the spec records which alternatives were checked and why they were rejected — Shodhya is a live Indian search engine, Jigyasa is a NIC government search product, and Shodh is used by several search tools.

**Theme guardrails.** Users can pick unreadable colours if they want to. The app warns, offers a fix, and leaves the choice with them. Silently correcting someone's design choice is worse than a warning.

**Location is never silent.** A filter that is applied without the user seeing it is a bug, not a feature, so the active location is always a visible, dismissible chip.

**Place ranking.** A relevant place beats a merely nearer one: keyword match first, distance second.

## Status

Place data is © OpenStreetMap contributors, used under the ODbL. Article summaries come from Wikipedia, CC BY-SA 4.0.

Prototype. Released under the MIT License — see [LICENSE](LICENSE).

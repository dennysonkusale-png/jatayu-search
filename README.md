# Jatayu

A fast, free, fully themeable search engine for India. **See what others miss.**

This repository holds a working front-end prototype and the build specification behind it. It is not yet connected to a live index — see [What is not built yet](#what-is-not-built-yet).

## What works today

Open `jatayu.html` and everything below is live, in one self-contained file with no build step and no dependencies.

- **Live search** against Wikipedia's search API and OpenStreetMap, with query suggestions, recent searches, saved searches, and result cards carrying real distance badges and directions links.
- **Themes** — system, light and dark, six presets, per-token colour pickers, and an uploaded photo as the page background with dim, blur and position controls. Every custom palette is checked for WCAG AA contrast, with a one-tap auto-fix that never silently overrides the user.
- **Location filter** — opt-in only. Use my location, pick a city, or enter a PIN code; radius chips from 1 to 50 km; a dismissible chip that always shows when a filter is active.
- **Nine interface languages** — English, हिन्दी, मराठी, संस्कृतम्, Español, Français, العربية, 日本語, 简体中文 — with real right-to-left handling for Arabic.
- **Voice search** via the Web Speech API, with per-language recognition and an editable transcript.
- **Email results** and **saved searches**, both device-local in this build.

## Run it locally

Voice search and geolocation require a secure context, so serve the file rather than opening it directly:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000/jatayu.html`. Opening the file directly still works for search, themes and the manual location picker, but voice and geolocation will be unavailable and the app will say so.

## What is not built yet

Being explicit, because a prototype that pretends to be a product wastes everyone's time:

- **There is no general web index.** Results come from two public APIs called straight from the browser: Wikipedia's search API, and OpenStreetMap's Nominatim for local intent. So a query with no Wikipedia article returns little or nothing, and results are not ranked like a real search engine. Pages that exist only behind JavaScript, logins or `noindex` are invisible to it.
- **Nominatim's usage policy caps this at roughly one request per second** and forbids heavy or bulk use. That is fine for a demo and not fine for real traffic — see below.
- **No backend.** Sign-in, cross-device sync and scheduled email digests are specified but not implemented. "Email results" opens the user's mail client with the results pre-filled.
- **No PWA manifest or service worker**, so no offline shell or install prompt.
- **Theme, history and location live in `localStorage`** and never leave the device.

## The build specification

`jatayu-build-prompt.md` is a complete, paste-ready brief for an AI coding agent — the product requirements, performance budgets, data contracts, privacy posture and 23 acceptance criteria. It covers what this prototype does not: a real search provider behind one interface, accounts with email-code sign-in, transactional email with SPF/DKIM/DMARC, per-locale font subsetting, and the PWA work.

## Getting to a real web index

A static page cannot call a general search API directly: providers either need a secret key, which cannot live in a
public HTML file, or refuse cross-origin requests. The honest path is one small server-side hop:

```
browser  ->  your proxy (Cloudflare Worker / Vercel function)  ->  provider
```

The proxy holds the key, adds CORS headers, and caches. Providers worth evaluating:

- **SearXNG**, self-hosted — free, aggregates other engines, no per-query cost. Run it next to the proxy.
- **Brave Search API** — free tier with rate limits; check current terms.
- **Your own crawl** — the only option that is truly independent, and by far the most work.

Scraping Google or Bing result pages breaks their terms and will get the product blocked; it is not a shortcut, it is a
dead end. The spec in `jatayu-build-prompt.md` already puts the provider behind a single `search(query, opts)`
interface, so swapping sources later is one file.

## Design decisions worth knowing

**The name.** Jatayu is the eagle of the Ramayana who saw what everyone else missed and acted on it. Far-sightedness is the right metaphor for a search engine. A naming note in the spec records which alternatives were checked and why they were rejected — Shodhya is a live Indian search engine, Jigyasa is a NIC government search product, and Shodh is used by several search tools.

**Theme guardrails.** Users can pick unreadable colours if they want to. The app warns, offers a fix, and leaves the choice with them. Silently correcting someone's design choice is worse than a warning.

**Location is never silent.** A filter that is applied without the user seeing it is a bug, not a feature, so the active location is always a visible, dismissible chip.

**Place ranking.** A relevant place beats a merely nearer one: keyword match first, distance second.

## Status

Place data is © OpenStreetMap contributors, used under the ODbL. Article summaries come from Wikipedia, CC BY-SA 4.0.

Prototype. Released under the MIT License — see [LICENSE](LICENSE).

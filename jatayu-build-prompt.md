# Build Task: "Jatayu" — a fast, free, fully themeable search engine for India, with optional accounts and email delivery

You are a senior full-stack engineer and product designer. Build a working, production-ready web search engine, mobile-first, for users in India. Deliver runnable code, not a mockup or a static demo. The product name is **Jatayu** (जटायु) — the eagle of the Ramayana who saw what everyone else missed and acted on it. Far-sightedness is the right metaphor for a search engine, and the name is understood across India without explanation. Use it as given, or rename freely.

Naming note, so nobody repeats the work: Jigyasa, Shodh, Shodhya, Anviksa, Dhiyo and Dhiyam are all in use — Shodhya is a live Indian search engine, Jigyasa is a NIC government search product, and Shodh is used by several search tools. Jatayu was checked and has no active collision in search: Jataayu Software built India's first mobile browser but was acquired by Bharti Telesoft in 2007 and absorbed into Comviva, and the brand has not traded since. Two residual risks remain: that trademark may have transferred with the acquisition, and a JATAYU Pro GPS-tracking app exists. Get a proper IP India clearance before spending money on the mark.

---

## 1. Product in one line

A search engine that loads in under a second on a mid-range Android phone on 4G, costs the user nothing, needs no account to search, lets them restyle the entire interface — dark, light, any colour, or their own photo — filters results to what is physically near them, and, if they choose to sign in, syncs their searches across devices and mails results to their inbox.

## 2. Who it is for, and the constraints that follow

- Primary user: Indian mobile web users, a large share on entry-level Android devices, 4G or flaky 3G, prepaid data they pay for by the GB, often bilingual.
- Therefore: every kilobyte counts, the UI must be legible at 5 inches, one-handed thumb reach, and it must survive a dropped connection without losing the query.
- Do not design for a desktop power user first. Desktop is a progressive enhancement.

## 3. Non-negotiable principles

1. **Fast before pretty.** Performance budgets in section 8 are acceptance criteria, not aspirations.
2. **Free and open to everyone.** No paywall, no login wall, no forced app install, no ads in v1. Searching never requires an account.
3. **Simple surface, deep control.** The home screen is a logo, a search box, and a theme button. Everything else is one tap away, never in the way.
4. **Nothing the user chose is lost.** Theme, location and preferences persist across sessions and devices they control.
5. **No dark patterns, no data harvesting.** See section 7.
6. **An account is a convenience, never a toll gate.** Signing in buys exactly three things — sync, saved searches, email delivery — and nothing that a guest cannot otherwise do is locked behind it.

## 4. Feature requirements

### 4.1 Search experience
- Single prominent search box on the home screen, autofocused on desktop, tap-to-focus on mobile.
- Debounced (150 ms) query suggestions while typing, from a local suggestion source plus popular queries. Keyboard: `/` focuses the box, `Esc` clears, `Up`/`Down` moves through suggestions, `Enter` submits.
- Results page: title, source favicon, clean URL breadcrumb, two-to-three line snippet with matched terms bolded, and the site's name. No result should be taller than needed on a phone.
- Tabs or chips for All / Images / News / Videos / Maps. Keep "All" as the default; others can be minimal but must actually work.
- "Instant answers" strip above organic results for a small set of intents: calculator, unit and currency conversion (INR first), date/time in Indian cities, and simple definitions. Graceful no-op when there is no answer.
- Recent searches stored locally (last 20) with a clear-all control. Recent searches are never sent to the server.
- Empty, no-results, and error states written in plain language, each with a useful next action (retry, simplify the query, remove the location filter).

### 4.2 Speed
- Server-rendered or streamed HTML for the results page; no blank white screen waiting for a client bundle.
- Cached edge responses for repeated queries. Target: TTFB under 200 ms on a cache hit, full results painted under 1.5 s on a mid-range Android on 4G.
- Initial JavaScript under 150 KB gzipped. No blocking third-party scripts, no web fonts that block first paint (use a system font stack with a Devanagari-capable fallback).
- Skeleton placeholders while results load, and the query stays visible and editable throughout.
- Prefetch a result's destination on hover or on touchstart (opt-in, off on metered/save-data connections via `navigator.connection.saveData`).

### 4.3 Free, and account-optional
- **Guest mode is the default and must be complete.** Every feature in 4.1, 4.2, 4.4, 4.5, 4.6 and 4.7 works with no account. Guest preferences live in `localStorage` (or IndexedDB for image backgrounds) and can be exported/imported as a small JSON file to carry a theme to another device.
- **Signed-in mode adds sync and email, nothing else.** See 4.9. Signing in must never be a precondition for seeing a result.
- Zero cost to the end user. Document the server-side cost model — search API quota, hosting, database, transactional email volume — in the README, with the free-tier limits you rely on.

### 4.4 Dark and light mode
- Three states: **System**, **Light**, **Dark**. Default to System via `prefers-color-scheme`, with a one-tap toggle in the header and a three-way selector in settings.
- Respect `prefers-contrast` and `prefers-reduced-motion`.
- No flash of wrong theme: set the theme class from an inline script in `<head>` before first paint.
- The theme switch must never shift layout.

### 4.5 Full UI customisation — colours and images
This is the signature feature. Build it properly.

- **Presets:** at least six curated themes (e.g. Light, Dark, Midnight, Sandstone, High-Contrast, Monsoon) plus a "Custom" state.
- **Colour controls:** individual pickers with hex input for page background, surface/card, primary text, secondary text, accent (links and buttons), and border. A live preview panel updates as the user drags, without a page reload.
- **Image background:** the user can upload an image (JPG/PNG/WebP, up to 5 MB) to use as the page background instead of a flat colour.
  - Store it locally (IndexedDB, not `localStorage`) and render it with `background-size: cover`, `background-attachment: fixed` on desktop and `scroll` on mobile for performance.
  - Provide three sliders that exist specifically to keep text readable: **dim** (dark overlay 0–80%), **blur** (0–20 px), and **focus/position** (top/centre/bottom).
  - Show a one-tap **"Make readable"** button that computes a scrim strength which brings body text to at least 4.5:1 contrast against the image.
  - Support a URL input for the image as an alternative to upload, plus a small gallery of free-to-use default wallpapers.
  - Compress/resize the upload client-side (max 1920 px wide, WebP) before storing.
- **Guardrails:** every custom palette is checked for WCAG AA contrast (4.5:1 body text, 3:1 large text and UI boundaries). If a user's choice fails, warn them inline and offer **Auto-fix** (nudge lightness until it passes) rather than silently overriding them. The choice remains theirs, with a warning.
- **Derived tokens:** generate hover, active, and disabled states from the accent colour rather than asking the user to pick them.
- **Reset** to the last preset, and **Export / Import theme JSON** (versioned schema, validated on import, no arbitrary CSS injection).
- Persist all of it and reapply instantly on the next visit, including on the results page. For a signed-in user the theme travels to their other devices (4.9); for a guest it stays on the device.

### 4.6 Location filter — "near me"
- Location is **opt-in and explicit**. Never request the browser permission on page load. Show a chip labelled "Near me" that, when tapped, opens a small sheet: *Use my current location* | *Pick a city* | *Enter a PIN code*.
- **City picker:** searchable list of Indian cities and towns with state names, bundled locally so it works offline. Hindi/romanised spellings should match ("bengaluru", "bangalore", "bengaluru" all resolve).
- **PIN code:** 6-digit input, resolved to a locality and coordinates. Use a free geocoding source that permits it (e.g. OpenStreetMap Nominatim under its usage policy, self-hosted if volume is high) or a bundled PIN-code dataset. Never hardcode an API key in client code.
- **Radius:** chips for 1, 5, 10, 25, 50 km, default 10 km.
- **Active state:** a persistent, dismissible chip in the results header — "Near Andheri West, Mumbai · 10 km" with an `x` to clear and a tap to edit. The filter must be visible whenever it is active; never silently applied.
- **Effect on results:** for local intent (restaurants, shops, services, "near me" queries), results are filtered or re-ranked by distance, each carrying a distance badge ("2.4 km") and a **Directions** link that opens Google Maps or OSM with the coordinates. For clearly non-local queries (definitions, news, code), do not distort ranking — say so in the README and keep the filter additive, not destructive.
- **Fallbacks:** if permission is denied, is unavailable, or the device reports an error, fall back to the manual picker with a friendly message. If the filter returns nothing, offer to widen the radius in one tap.
- Cache the resolved location locally, with a "not my area" escape hatch.

### 4.7 Language and local context

India is multilingual and multi-script. Treat language as a first-class feature, not a translation layer bolted on at the end.

**Interface languages — three tiers**
- **Tier 1, complete in v1:** English, हिन्दी (Hindi), मराठी (Marathi) and **संस्कृतम् (Sanskrit)**. Every string, every empty state, every error message. No half-translated screens.
- **Tier 2, Indian:** Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Punjabi, Odia and Assamese — drop in as locale files without refactoring.
- **Tier 3, global:** Spanish, French, German, Portuguese, Arabic, Japanese, Simplified Chinese and Russian. Same treatment, same key set, added as locale files.
- **Sanskrit, honestly:** ship it because it was asked for and because a locale file is cheap, but do not present it as a mass-market default — the audience is small. Use plain modern Sanskrit for UI terms rather than obscure classical vocabulary, keep Devanagari, and label the option संस्कृतम् in its own script.
- Language selector grouped by tier, every option written in its own script (Español, Français, العربية, 日本語, 简体中文). Past about a dozen entries, give it a search box instead of a long menu.
- Default from `navigator.languages`, matched to supported locales with region-stripping fallback (`pt-BR` → `pt`, `en-GB` → `en`), then English. A manual choice always wins and is never overridden.
- Switching language must not reset theme, location, history or the query.

**Right-to-left**
- Arabic and Urdu must flip the entire interface: `dir="rtl"` on `<html>`, logical CSS properties throughout (`margin-inline-start`, never `margin-left`), the settings drawer entering from the left, and no hard-coded left/right positioning anywhere.
- Keep Latin digits inside RTL text unless the locale asks otherwise, and wrap user queries and URLs in `<bdi>` so mixed-direction strings do not reorder the line.
- Test RTL separately. It is the single most common way a "global" build breaks while looking finished in English.

**Fonts across scripts**
- One stack that actually covers what you ship: Noto Sans Devanagari, Noto Naskh Arabic, Noto Sans JP, Noto Sans SC. Never let a missing glyph fall back to a tofu box.
- Subset and preload per locale rather than shipping every script to every user — a full CJK font is several megabytes and would consume the entire performance budget on its own.
- Check every shipped locale at 12, 14 and 16 px, and at 200% zoom.

**Voice across languages**
- Recognition language follows the interface language where a matching `SpeechRecognition` locale exists (`en-IN`, `hi-IN`, `mr-IN`, `es-ES`, `fr-FR`, `ar-SA`, `ja-JP`, `zh-CN`).
- **Sanskrit has no browser speech model.** Fall back to `hi-IN` and say so in the interface rather than silently mishearing the user.

**Query languages**
- Accept queries in any script — Devanagari, Bengali, Tamil, Telugu, Gujarati, Gurmukhi, Kannada, Malayalam, Odia, Urdu, Latin. Never reject or silently transliterate what the user typed.
- **Romanised Indian-language queries must work**: "sasta laptop", "paas ka medical store", "mumbai madhe hotel", "acha dentist". Send the raw query upstream, and where it looks romanised, generate a Devanagari variant via transliteration and merge both result sets. Detect script, show what was understood ("searching for: सस्ता लैपटॉप") and let the user switch it off.
- Query-language hints as chips when detection is ambiguous: "Search in हिन्दी" / "Search in English".

**Results language**
- A "Results in: Any / English / हिन्दी / मराठी" filter, plus a per-result "translate" link. Default to Any, weighted by the UI language for India-specific queries.

**Typography and numbers**
- Devanagari-capable font stack with correct line-height and no clipping of matras or combining marks. Test at 12, 14 and 16 px on Android Chrome and at 200% zoom.
- Latin digits for prices and measurements by default (₹1,299, not ₹१,२९९); offer native digits as a setting rather than forcing them.
- Handle IME composition events without breaking the suggestion debounce — do not fire a search on every composition update.

**Local defaults**
- INR in currency conversion, Indian date formats, metric units, IST times, `en-IN` locale, and results weighted toward Indian sources where the query is India-specific.
- Safe-search on by default with a visible toggle.

### 4.8 Mobile and PWA
- Installable PWA with an offline shell: the home screen and recent searches work offline, with a clear "you're offline" banner and the query preserved.
- Bottom-anchored controls reachable with a thumb on screens up to 6.5 inches. Minimum 44 px tap targets.
- Add-to-home-screen prompt shown once, dismissible, never nagging.

### 4.9 Accounts, sync and email delivery

Sign-in is optional. Guests keep the whole product; an account adds sync, a searchable history, and email.

**Authentication**
- Two paths: **email one-time code or magic link** (the default, and the one most Indian users will finish) and **email + password**. No social login, no phone OTP in v1.
- Argon2id for passwords, minimum 10 characters, checked against a breach list. Never hand-roll crypto.
- Sessions in `httpOnly`, `Secure`, `SameSite=Lax` cookies, rotated on privilege change, with a visible **"Sign out of all devices"** control and server-side revocation.
- Rate-limit sign-up, sign-in and code requests per IP and per email. Constant-time responses, so the form never reveals whether an address has an account.
- **Merge on first sign-in:** if the device already has a theme, history and pinned searches locally, offer "keep this device's setup" or "use my saved setup" and merge the rest. Never silently discard what they built as a guest.

**Saved searches and sync**
- A signed-in search is saved to the account, with a visible indicator ("Saved to your account") and a one-tap **pause saving** switch for private searches.
- Saved searches list shows query, active filters (type, location, radius), timestamp, result count, and a re-run link. Search within history, delete one, delete all.
- **Pin** a query with its filters so it appears as a chip on the home screen — "chai near me · 5 km" — one tap to re-run.
- Sync scope: theme, saved and pinned searches, language, safe-search preference. Do not sync large background image files; sync a reference or skip them, and state which in the settings copy.

**Email delivery — two behaviours, both required**
1. **Send now: "Email me these results."** On the results page, emails the current query, the active filters and the top 10 results (title, source, snippet, link) as responsive HTML with a plain-text alternative. Must work for **guests too**, with a one-off address prompt and no account required.
2. **Scheduled digest.** Daily or weekly email of the user's saved or pinned searches, each with its fresh top results. **Off by default**, opt-in only, with frequency, day and time-of-day in IST, and a hard cap of one email per search per period.
- Preferences page: frequency, timezone (default IST), which searches are included, pause for 7 or 30 days, and unsubscribe in one click.
- Treat deliverability as a feature, not an afterthought: transactional provider with SPF, DKIM and DMARC configured on a dedicated sending domain; a plain-text part on every message; a visible unsubscribe link in every email including "send now"; a one-click `List-Unsubscribe` header; bounce and complaint handling that stops delivery after repeated hard bounces.
- Never send more than the user asked for. No marketing blasts, no re-engagement mail, no selling or renting the list.
- Queue email as a job; never send inside the request. Show status ("Sent to you@example.com") and allow one resend.
- If the email provider key is absent, degrade visibly — a disabled button with the reason — rather than failing silently.

### 4.10 Voice search

Voice matters most to users who find typing in English slow — treat it as a primary input, not a novelty button.

- Mic button inside the search box, right side, 44 px, visually secondary to typing. Typing is always fully functional; voice is an addition.
- Use the **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`). Feature-detect it: if absent, hide the button rather than showing something broken, and mention voice in the empty state instead.
- **Language of recognition is selectable**, following the search language by default: `en-IN`, `hi-IN`, `mr-IN`, `bn-IN`, `ta-IN`, `te-IN`, `gu-IN`, `kn-IN`, `ml-IN`, `pa-IN`, `or-IN`, `ur-IN`. Remember the last choice.
- Interaction: one tap starts, live interim transcript appears in the search box as the user speaks, silence auto-stops, a second tap cancels, hard cap of about 10 seconds.
- **Do not auto-submit for Indic languages.** Recognition accuracy is lower; put the transcript in the box, editable, and require a confirm tap. Auto-submit is acceptable for `en-IN` only, and only with high confidence.
- Clear listening state: pulsing mic, "सुन रहे हैं…" label, `aria-pressed` on the button and an `aria-live` announcement. Respect reduced motion for any waveform.
- Permission is requested on tap, never on load. Denied, blocked or unavailable microphone produces a plain-language message plus "type instead" and guidance to browser settings — never a dead button.
- **Secure context required.** `SpeechRecognition` and geolocation only work on https or localhost. Detect `file://` or plain http and say so explicitly, because this is the first thing that will look "broken" in local testing.
- **Privacy honesty:** in most browsers the audio is sent to the browser vendor's speech service (Google, Apple), not processed on device and not sent to your server. Say exactly that in the UI copy. Never claim on-device processing you do not have.
- Optional server-side speech-to-text behind a flag for browsers without the API (a Sarvam, Bhashini or Whisper endpoint). Keys server-side only, opt-in, and the recording is discarded after transcription.
- Voice also usable for the location sheet ("say your area") and for setting the search language.

## 5. Recommended stack

Pick this unless you have a strong reason not to, and state your reason if you deviate.

- **Next.js (App Router) + TypeScript + Tailwind CSS**, deployed to a free or cheap edge host (Vercel/Cloudflare). Tailwind with CSS custom properties for the theme tokens, so theme switching is a variable swap and not a re-render.
- **State:** React context or Zustand for theme and location; `localStorage` + IndexedDB for persistence.
- **Search backend:** abstract it behind one interface — `search(query, {type, location, radius, page, safe})` returning a normalised result shape. Then implement two providers: (a) a **mock provider** with 40+ realistic seeded results so the whole app is testable without network keys, and (b) one real provider.
- **Real provider options, in order of preference for "free":**
  1. **Self-hosted SearXNG** — open source, aggregates engines, no per-query fee. Call its JSON API from your server, never from the browser.
  2. **Brave Search API** — has a free tier with rate limits; check current terms before relying on it.
  3. Your own small crawl + index for a narrow vertical, if you want full independence.
- **Do not** scrape Google or Bing result pages. It breaks their terms and it will break your product.
- **Auth:** Better Auth or Auth.js against a managed Postgres or SQLite (Neon, Supabase or Turso free tiers), with Argon2id hashing and server-side sessions. Use the library's email-code flow rather than writing your own.
- **Email:** Resend, Brevo or Postmark free tier for transactional mail, React Email or MJML for templates, and a cron job (Vercel Cron, Cloudflare Cron or a small queue) for digests. Keep the provider key server-side only.
- **Voice:** Web Speech API with a per-language `lang` code, plus an optional server-side STT fallback (Sarvam, Bhashini or Whisper) behind a flag.
- **i18n:** `next-intl` or `i18next` with JSON message files per locale, ICU plural rules, RTL-aware styling, and a script that fails the build when a locale is missing keys — so no screen ships half-translated.
- **Location:** browser Geolocation API, OpenStreetMap tiles/links for maps, Nominatim or a bundled dataset for reverse geocoding.
- If the environment you are building in cannot make live network calls, ship the mock provider wired to the real one behind a flag, and document the exact env var to flip it.

## 6. Data contracts

Normalised result object:

```
{
  id, title, url, displayUrl, snippet, source, favicon,
  type: "web" | "image" | "news" | "video" | "place",
  publishedAt?: string,
  distanceKm?: number,
  lat?: number, lng?: number
}
```

Theme object (versioned, validated on import, never injected as raw CSS):

```
{
  version: 1,
  mode: "system" | "light" | "dark",
  colors: { bg, surface, text, textMuted, accent, border },
  background: { kind: "color" | "image", imageId?, dim, blur, position },
  preset: "light" | "dark" | ... | "custom"
}
```

Account and email objects (server-side only, never trusted from the client):

```
User       { id, email, emailVerified, createdAt, digestFrequency: "off" | "daily" | "weekly",
             timezone: "Asia/Kolkata", saveSearches: boolean }

SavedSearch{ id, userId, query, filters: { type, location, radiusKm }, pinned, createdAt, lastRunAt }

EmailJob   { id, to, kind: "results-now" | "digest", payloadRef, status: "queued" | "sent" | "failed", sentAt }
```

Authorise every read and write against the session's own `userId`. No endpoint may take a user id from the request body.

## 7. Privacy and safety

- **Guests leave no trace.** For a signed-in user, store only what the feature needs: email, password hash or code state, saved searches, theme, delivery preferences. Nothing else.
- Search history is stored server-side **only** for signed-in users who have saving switched on. Pause, delete one, delete all, and full account deletion are each a single tap, immediate, and complete — including any queued email jobs.
- **Export and delete:** download everything held about the account as JSON, and delete the account and all associated data from settings without emailing support.
- Never sell, rent or share query data. No use of saved searches to train third-party models. Email open tracking off by default. State this in one plain paragraph inside the app, not buried in a policy page.
- Design to India's DPDP Act 2023 expectations: clear notice, purpose limitation, explicit consent before any email is sent, and a working deletion route.
- Email provider keys and all provider calls stay server-side. Encrypt in transit and at rest, collect no phone number, and keep the email address as the only required personal field.
- One obvious **"Clear my data"** button that wipes theme, history, location cache, stored images, saved searches and queued emails, and says exactly what it removed.
- Safe search on by default. A visible report link on every result. Block known malware and piracy domains at the provider layer.
- Never commit API keys. Use environment variables and a server-side proxy for every provider call.

## 8. Accessibility and quality budgets

- WCAG 2.2 AA: keyboard-operable everywhere, visible focus rings, correct landmarks, `aria-live` on the results region, screen-reader labels on all icon buttons, respects reduced motion.
- Lighthouse: Performance ≥ 90 on mobile, Accessibility ≥ 95, Best Practices ≥ 95.
- Works with JavaScript disabled for the basic search flow (form GET to `/search?q=`), enhanced with JS.
- Tested at 320 px, 390 px, 768 px and 1440 px widths. Tested on a throttled "Slow 4G" profile.
- Contrast is verified programmatically in a unit test, not eyeballed.

## 9. Acceptance criteria

Ship only when every line below is true.

- [ ] A user can search, get results, and open a result on a 390 px phone in under three taps.
- [ ] Cold load of the home screen is under 1.5 s LCP on throttled 4G.
- [ ] Dark, light and system modes all work, with no flash of the wrong theme on reload.
- [ ] A user can set all six colours, upload a background photo, adjust dim and blur, and reload the page with the theme intact.
- [ ] Choosing an unreadable colour combination raises a warning with a working Auto-fix, and never silently overrides the user.
- [ ] Theme export produces a JSON file that imports correctly on a fresh browser profile.
- [ ] Tapping "Near me" grants or denies gracefully; the manual city and PIN-code pickers both work without the Geolocation permission.
- [ ] With a location active, the chip is visible, dismissible, and local results show distance badges and working Directions links.
- [ ] The location filter is never applied without the user seeing that it is applied.
- [ ] A guest can search, theme the app, use the location filter and email themselves a set of results without ever creating an account.
- [ ] Sign-in by email code works end to end; an unverified address cannot receive a digest.
- [ ] Signing in on a second device restores theme, pinned searches and history, and a guest's local setup survives the merge.
- [ ] "Email me these results" arrives within a minute, contains all 10 results with working links, carries a working unsubscribe, and includes a plain-text part.
- [ ] Digests are off by default and only ever send for searches the user opted in to.
- [ ] Deleting the account removes saved searches, preferences and queued email jobs, and "Clear my data" does the same on the device.
- [ ] Sign out, sign out of all devices, and session expiry all behave, and no endpoint accepts a user id from the request body.
- [ ] Voice search returns a transcript in `en-IN` and `hi-IN` on Chrome or Safari over https or localhost, and the transcript is editable before submitting.
- [ ] Where the Speech API is missing, the mic hides itself; where the mic is denied, the message is clear and typing still works.
- [ ] The interface is complete in English, Hindi, Marathi and Sanskrit, plus at least four global locales including one RTL language, and switching language never resets theme, location, history or the current query.
- [ ] Arabic flips the layout to RTL cleanly: drawer from the left, no clipped text, no element positioned off-screen.
- [ ] No shipped locale renders a tofu box; Devanagari, Arabic, Japanese and Chinese each render correctly at 12-16 px.
- [ ] On first visit the language follows `navigator.languages` with region fallback, and a manual choice survives a reload.
- [ ] A romanised query ("sasta laptop", "paas ka medical store") returns useful results rather than an empty page.
- [ ] Devanagari, Tamil and Bengali text render without clipped matras at 12-16 px on Android Chrome.
- [ ] The app runs end to end on the mock provider with zero API keys configured.
- [ ] README documents the stack, the provider swap, the cost model, the auth and email setup, the DPDP posture, and how to run it locally.

## 10. Out of scope for v1

Social login, phone OTP, shared or team accounts, ads, AI chat answers, full web crawling at scale, native mobile apps, push notifications, and any marketing or re-engagement email. Say so in the README rather than half-building them.

## 11. Build order

1. Project scaffold, theme token system, dark/light/system with no flash.
2. Search box, suggestions, results page against the mock provider, mobile layout.
3. Customisation panel: colours, contrast guardrail, background image with dim/blur.
4. Location sheet, city and PIN pickers, radius, distance badges, map links.
5. Accounts: email-code and password sign-in, sessions, saved and pinned searches, sync, guest-to-account merge.
6. Email: "Email me these results" for guests and signed-in users, then the digest job, then SPF/DKIM/DMARC and unsubscribe plumbing.
7. Language: i18n plumbing, complete Hindi, Marathi and Sanskrit strings, the first global locales, RTL pass, per-locale font subsetting, script detection, romanised-query handling, results-language filter.
8. Voice search: Web Speech API, per-language recognition, editable transcript, permission and unsupported-browser states.
9. Speed pass: caching, streaming, bundle budget, offline shell, PWA.
10. Accessibility and contrast tests, privacy and deletion checks, README, deployment config.

Report progress after each step, and ask before making a choice that changes the product rather than the implementation.

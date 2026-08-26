# 4th&Go — Publish-Readiness Session Notes (2026-08-26/27)

Written so a fresh session — or the user re-reading this later — can pick up
exactly where this left off without re-deriving decisions from scratch. This
covers licensing/security, the beta launch, the landing page, and the full
Chrome Web Store path, in the order things were actually decided.

## Where things stand right now

- `main` has: full-app license lock (both surfaces), a feedback popover, real
  icon sizes, README/PRIVACY, and the marketing landing page.
- **Beta is live**: GitHub Release `v1.1.0-beta` contains a clean zip of just
  the 15 real extension files (no docs, no landing page) —
  https://github.com/rithvikmada/sleeper-draft-assistant-chrome-extension/releases/tag/v1.1.0-beta
- **Landing page is live** via GitHub Pages, deployed from an orphan
  `gh-pages` branch (root = `landing/index.html` + its assets, copied over —
  not the same branch as the extension source) —
  https://rithvikmada.github.io/sleeper-draft-assistant-chrome-extension/
  (Pages was still finishing its first build as of this writing — give it a
  minute or two after this note if it 404s.)
- The landing page's "Install extension" button already points at
  `/releases/latest`, which now correctly resolves to the beta release —
  verified live, not assumed.
- Gumroad product exists (`rithmada.gumroad.com/l/fourthandgo`), license-key-
  per-sale is enabled, and the extension's `shared.js` verifies real keys
  against Gumroad's public `/v2/licenses/verify` endpoint (see
  `GUMROAD_PRODUCT_PERMALINK` in `shared.js`).

## Licensing/security — the honest state of it, and why

**This was a deliberate scope decision made explicitly with the user early in
this project, not an oversight discovered later.** For a $10, ~50-user
product, we chose client-side-only license gating: the extension checks a
key against Gumroad's API, caches the result locally, and gates the whole UI
behind a boolean (`cachedLicenseValid` / `isLicensed()` in `shared.js`).

**What this actually protects against, and what it doesn't:**
- It stops a casual user from using the extension without paying.
- It does **not**, and structurally cannot, stop a technically competent
  person from bypassing it — because the entire extension ships as plain,
  readable JavaScript. Anyone can open DevTools and either flip
  `cachedLicenseValid = true` in the console, or (since testers load an
  *unpacked* copy with real files on disk) just delete the license-check
  code from their own local copy of `panel.js`. This is true of **every**
  browser extension that has ever shipped — there is no way to make
  client-side-readable code truly tamper-proof. It's not a bug in this
  implementation; it's a property of the platform.
- The user has a developer friend intentionally trying to crack it as a fun
  exercise — expected, and not a business risk at this scale. Losing one
  curious friend's "sale" costs nothing real.

**Two upgrade paths were discussed, only one was chosen:**

- **Option A (chosen, not yet built)** — move the license *check* itself
  behind a small serverless function (Cloudflare Workers or Vercel, both
  free-tier) that calls Gumroad's verify API server-side and returns a
  short-lived **signed token** the extension trusts, instead of a flippable
  local boolean. This raises the bar from "type one line in the console" to
  "forge a signature or replay a token" — real friction, roughly a day of
  work, and — importantly — **does not touch the extension's offline-first
  architecture**. It only hardens the *check*, not the whole app.
  **Status: agreed on, not yet implemented.** Next session should build this
  before the real (non-beta) Web Store + Gumroad push, not before today's
  beta.
- **Option B (explicitly rejected)** — compute the actual rankings/BEER/
  value logic server-side, so a bypassed license check has nothing real to
  unlock. This is real backend architecture (ongoing hosting, a database or
  equivalent, session management) and — critically — it would break the
  product's actual, already-shipped, deliberately-designed value
  proposition: **working fully offline mid-draft**, which is documented
  throughout this project (staleness indicators, the 7-day offline license
  cache, the entire "works during a draft with no internet but Sleeper's
  API" pitch). Trading that away to fight piracy on a $10 product is not
  worth it, and the user agreed after this was laid out plainly. **Do not
  revisit this without a real reason (e.g., the product scales to a
  meaningfully different revenue level).**

**Also agreed on, lower priority, do alongside Option A:**
- Light minification/renaming of the license-check code specifically — not
  real protection, just removes "read it in 10 seconds, unchanged variable
  names" as the easiest bypass path. A determined developer still gets
  through; a curious one has to work slightly harder.

## Feedback system

Went through two services before landing on one that actually works from an
extension context:
1. **FormSubmit** — tried first, **rejected**: it hard-blocks any request
   whose origin isn't a real `http(s)://` page. `chrome-extension://` will
   never satisfy that. Confirmed via a real failed request
   (`{"success":"false","message":"Make sure you open this page through a
   web server..."}`), not assumed.
2. **Web3Forms** (`api.web3forms.com`) — works, confirmed live. Access key is
   a public key by design (safe in client code, routes to one inbox, can't
   access the account). Currently hardcoded in `panel.js` as
   `WEB3FORMS_ACCESS_KEY`.

The feedback popover supports Bug/Feature request/Other + a textarea +
up to 3 image attachments (5MB each), via `multipart/form-data`.

## Gumroad — plan for beta testers (agreed, not yet executed)

**The plan, confirmed to work with zero code changes**: Gumroad generates a
real, unique license key per sale regardless of price paid — including a
sale made free via a discount code. Since the extension's verify call only
checks `product_permalink` + `license_key` against Gumroad (see
`verifyLicenseKeyRemote` in `shared.js`), a key issued through a 100%-off
discount code validates exactly the same way a real $10 purchase would.
**No extension code needs to change for this.**

**What the user needs to do** (Gumroad dashboard, not something this session
can do without their login):
1. Create a discount/offer code on the `fourthandgo` product set to 100%
   off (Gumroad supports this natively).
2. Give that code to beta testers; they "buy" for $0 and get a real,
   automatically-delivered license key the normal way.
3. That key is entered on the extension's lock screen exactly like a paid
   key would be.

**Separately, a security note still outstanding**: a real Gumroad API access
token was pasted into this chat earlier in the project. It was never used or
written to any file (verified by grep), but should still be **regenerated**
in the Gumroad account settings as standing hygiene — this has been flagged
multiple times and its status is unconfirmed as of this note.

## Landing page

Built from the app's own real design tokens (ink/chalk palette, Chivo/
JetBrains Mono), not a generic template — see `landing/index.html`. Notable
decisions:
- Hero includes the **real Sleeper app icon** (provided by the user, masked
  into an Apple-style rounded-square/squircle via Pillow — see the masking
  script's output, `landing/assets/sleeper-icon-*.png`), not a neutral
  placeholder mark as originally built. Displaying it is nominative
  reference for compatibility ("built for Sleeper drafts"), paired with a
  footer disclaimer that 4th&Go isn't affiliated with or endorsed by
  Sleeper.
- Buy buttons link to Gumroad's **direct checkout** (`?wanted=true` query
  param), not the product landing page — skips an extra click.
- CTA copy deliberately excludes the price ("Win Your Draft →" / "Get
  4th&Go") — price lives only in the pricing section itself, per direct
  feedback that repeating "$10" in every button read as pushy.
- A second, secondary "Install extension" button sits next to the Gumroad
  CTA — outline style so it doesn't compete with the gold purchase button —
  pointing at `INSTALL_URL` (one constant in the page's own `<script>`),
  currently the GitHub Releases page. **Swap that one constant to the real
  Chrome Web Store URL once the listing is live — nothing else needs to
  change.**
- FAQ section answers real pre-purchase objections (Sleeper ToS, mock-draft
  support, league-format fit, license delivery, subscription-vs-one-time,
  support path) — not generic filler questions.
- A Spotlight-Card-style cursor-following hover glow on the feature cards
  (gated behind `@media (hover:hover) and (pointer:fine)` so touch devices
  never pay for an effect they'd never see) — the one piece of pure UI
  polish pulled from a component-library browse, applied narrowly.
- Deliberately did **not** rebuild in React/Tailwind when asked — the
  reasoning (no capability gap that plain CSS lacks, loses the instant-
  republish Artifact workflow, adds real tooling for a single static page)
  is preserved here in case a future session is asked the same thing again.
- Deliberately did **not** add fake testimonials, countdown timers, or an AI
  chat widget when asked what else to add — no real testimonials exist yet
  (don't fabricate them), and there's nothing genuinely time-limited here.

## Chrome Web Store — everything prepped, nothing submitted yet

- `webstore-listing.md` — draft store listing copy (name, short/long
  description, screenshot shot-list). **Price/license requirement is stated
  in the first line on purpose** — Chrome Web Store policy requires that
  disclosure be visible before install, confirmed by reading the actual
  policy text (not assumed), see the policy-check conversation for the exact
  quote.
- `webstore-privacy-practices.md` — draft answers for the dashboard's
  required Privacy Practices questionnaire (permission justifications, data
  usage disclosure), written to match what the code actually does — verified
  against real `chrome.tabs`/`chrome.scripting` usage in `background.js`,
  not guessed.
- Confirmed via the actual current Chrome Web Store policy: a fully
  paid-gated extension (nothing works without a license key) is allowed, as
  long as the requirement is disclosed before install. This is not a gray
  area — it was checked directly.
- **Not yet done**: developer account registration ($5 one-time), actual
  listing submission, review (timeline is NOT guaranteed by Google — realistically
  anywhere from a few hours to ~2 weeks for a first-time developer account,
  told to the user plainly rather than promising a date).

## Still-placeholder assets

- **Extension's own icon** (`icon16/32/48/128.png`) — still the original
  generic colored-bars placeholder. This is a **different** icon from the
  Sleeper logo used on the landing page — don't confuse the two. Real logo
  work is explicitly with the user's designers, not this session's job to
  produce, per direct instruction ("we will do logo and landing page with
  designers" — though the landing page itself ended up built here after
  that, at the user's later direction; the *icon/logo* specifically is still
  outstanding from the design side).
- **Real screenshots** of the actual board — landing page currently uses a
  built, animated CSS/JS recreation of the board (not a real screenshot) as
  the hero centerpiece. Needs either the user to send real screenshots, or
  to walk through a live/mock draft themselves — this session does not have
  a reliable way to load the unpacked extension into an automated browser to
  capture these directly.

## Prioritized punch list

**Before beta today (mostly done as of this note):**
- [x] GitHub Release with a clean extension-only zip
- [x] Landing page live at a real URL (GitHub Pages)
- [x] Install button resolving correctly to the release
- [ ] Gumroad 100%-off discount code for beta testers (user's own dashboard)
- [ ] Send beta testers the landing page URL + a discount code or a
  `DEV_TEST_KEYS` beta key

**Before the real Web Store + Gumroad push (not urgent for today's beta):**
- [ ] Option A: signed-token license check via a serverless function
- [ ] Light minification of the license-check code
- [ ] Regenerate the exposed Gumroad access token (still unconfirmed)
- [ ] Real extension icon/logo (designers)
- [ ] Real board screenshots (user or a future session with browser access)
- [ ] Chrome Web Store developer registration + submission
- [ ] Swap the landing page's `INSTALL_URL` constant to the live Web Store
  listing URL once approved
- [ ] Final end-to-end QA pass: fresh install → real license activation →
  every feature → send a feedback message, as an actual buyer would
  experience it

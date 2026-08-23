# 4th&Go — Sleeper Draft Board — Project Context

Read this first before making any changes. This captures decisions, gotchas, and
history so a fresh session doesn't waste time rediscovering things or
accidentally reversing intentional fixes. Organized by topic, not chronologically
— when something was superseded, the old version was removed rather than left
alongside the new one.

## What this is
A Chrome extension (Manifest V3, side panel) that shows a personal tiered fantasy
football ranking board and auto-crosses off players as they're drafted, by
polling Sleeper's public read-only draft API.

**League format this is tuned for:** 10-team, full PPR, 1QB/2RB/2WR/1TE/2FLEX,
no K/D. This matters for ranking/logic decisions (see backlog #4) and is why
K/DST rows are dropped everywhere a source is parsed or fetched.

## File structure
- `manifest.json` — MV3 config. Side panel + host permission for `api.sleeper.app`
  only (FantasyFootballCalculator's permission was added and later removed — see
  ADP section below).
- `background.js` — opens side panel on icon click, auto-detects draft ID from an
  open Sleeper draft tab (URL pattern `sleeper.com/draft/nfl/<id>`).
- `panel.html` / `panel.js` — the side panel: live draft cockpit. All rankings
  data, Sleeper polling, pick matching, and board rendering.
- `rankings-manager.html` / `rankings-manager.js` — full-tab curation surface:
  ranking sources, ADP sources, unmatched-player reconciliation.
- `shared.js` — **must load first** (before `panel.js`/`rankings-manager.js`).
  Owns everything both surfaces need to agree on: constants (`TIER_ORDER`,
  `TIER_COLORS`, `POS_COLORS`), name normalization (`norm()`, `playerKey()`),
  the CSV parser (`parseRankings`), consensus math (`median`, `buildConsensus`),
  ADP math (`buildAdpConsensus`, `buildValueComparison`), storage schema/keys,
  and shared widgets (`renderBestPicksWidget`, `renderTeamCountsWidget`,
  `renderValueBadge`, `renderSourceListWidget`).
- `rankings.js` — default ranking set (356 players, numeric tiers 1–16).
  Data file, not code; pre-seeded into storage on first load and **re-seeded
  from this file on every load** so editing the CSV/regenerating actually takes
  effect.
- `fp-rankings.js` — FantasyPros 2026 Draft Rankings ECR (336 players),
  auto-generated from a CSV via `build-fp-source.js`. Also re-seeded on every
  manager load. This is a *different* FantasyPros export than the Real-Time ADP
  one users paste in manually — see the ADP section for the format differences.
- `build-fp-source.js` — one-off regeneration script (not extension code).
  Usage: `node build-fp-source.js` after replacing the source CSV. Not a live
  test suite — see Testing below.
- `4thGo-feature-backlog.md` — the actual backlog, with sequencing notes. Don't
  re-derive priorities from scratch; read that file.
- `rankings-manager-prompt.md` — the **original implementation spec** for the
  Rankings Manager, from before it existed. Fully superseded by the real
  code now; kept for history only, not a live reference.
- `test-fp-parse.js` / `test-fp-parse2.js` — disposable ad-hoc debug scripts
  from one parser-debugging session, not a maintained test suite (see Testing).
- `icon128.png` — placeholder icon.

## Sleeper's public API
- Picks: `GET https://api.sleeper.app/v1/draft/{draft_id}/picks` — no auth needed.
- Live PPR ADP: `GET https://api.sleeper.app/projections/nfl/{year}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&order_by=pts_ppr`
  — also no auth, undocumented but public (see ADP section).
- Name matching handles Jr./Sr./III suffixes, punctuation, and a loose fallback
  (last name + first initial + position) for cases like "Ken" vs "Kenneth Walker".
- K/DST picks are intentionally skipped everywhere (this league has none).
- Auto-poll runs on a self-rescheduling `setTimeout` chain (not `setInterval`),
  with an `inFlight` guard so requests never stack, and exponential backoff on
  errors (capped at 8s) that resets once healthy again.

### IMPORTANT — the picks endpoint is cache-capped at 15s, don't re-litigate this
`/picks` is cached at Cloudflare's edge for 15 seconds
(`Cache-Control: public, s-maxage=15, stale-while-revalidate=300`), and the
cache key **ignores query strings** — confirmed via response headers
(`Cf-Cache-Status: HIT` even with a unique `?_=timestamp` on every request).
- No client-side trick can force fresher-than-~15s data. Already investigated
  and confirmed — don't re-attempt cache-busting (unique params, custom
  headers, etc. — tried, doesn't work).
- Polling faster than ~3s has **zero benefit** and just burns requests.
  `FAST_INTERVAL_MS` is `3000` deliberately.
- The panel surfaces Sleeper's own `Age` response header in the status line, and
  a live countdown (`#cacheCountdown`, ticks in `panel.js`) shows seconds until
  the cached response expires. Manual refresh toasts whether it got a fresh
  origin hit (`age === 0`) or another cached copy.

## ADP
`K_ADP` storage holds an **array** of ADP source objects (`makeAdpSource()` /
`loadAdpSources()` / `saveAdpSources()` in `shared.js`) — same shape as ranking
`sources`. Multiple ADP sources can be enabled at once, each with its own column
in the Rankings Manager table and (for enabled sources) the side panel board.
`loadAdp()` is a legacy single-map accessor (median blend collapsed to one
`{map,label}`) kept only because the Best Picks widget just wants one number.

**Sources currently wired in:**
- **Sleeper Live ADP** (fixed id `adp_sleeper_live`) — auto-fetched via the
  "⟳ FETCH SLEEPER ADP" button (`fetchSleeperAdp()` in `rankings-manager.js`)
  from the projections endpoint above. Free, public, no auth, same domain
  already in `manifest.json`. `docs.sleeper.com`'s documented endpoint list
  doesn't mention this — that's why earlier sessions concluded no ADP endpoint
  existed. It exists; it's just undocumented.
- **Manually-imported sources** (typically a FantasyPros Real-Time ADP export,
  re-pasted day-of-draft) — added via "+ ADD ADP SOURCE", parsed with the same
  flexible `parseRankings()` used for ranking sources. Re-importing under the
  same name (case-insensitive) updates that source in place instead of
  duplicating it.
- **FFC (FantasyFootballCalculator) was built, then deleted.** It was a real
  public API (`/api/v1/adp/ppr`, versioned, parameterized — an intentional
  public endpoint, not scraped) and worked fine, but became redundant once
  Sleeper Live + a manual FantasyPros import covered the actual workflow.
  Removed: `fetchFfcAdp()`, its button, the `fantasyfootballcalculator.com`
  host permission. `loadAdpSources()` has a one-time cleanup that drops any
  leftover `adp_ffc_live` entry from a user's existing storage.

**Sources investigated and rejected — don't re-attempt without a reason to
revisit:**
- Sleeper's internal GraphQL (`sleeper.app/graphql`) — every operation fired
  during a real mock draft was captured (get_draft, draft_picks, draft_queue,
  me, my_dms, etc.). **None of them carry ADP.** Needs a personal auth token
  and a permission this extension doesn't request; nothing to gain from it.
- FantasyPros' own ADP page (`/nfl/adp/ppr-overall.php`) — caps at 5 visible
  rows and gates the rest (plus CSV export) behind a free account signup.
  Claude won't create accounts. If the user signs up themselves, the unlocked
  table/CSV pastes into the existing import fine.
- beatadp.com — a paid product; its ADP table is server-rendered (no
  discoverable JSON API) and its `robots.txt` fences off `/api/`. Scraping
  would mean depending on a monetized third party's markup staying stable.
- DraftKick.com (`app.draftkick.com/football`) — serves a raw, unauthenticated
  static file (`/data/football/Offense.csv`) with ADP/AAV from many platforms
  plus embedded FantasyPros ECR/Tier/ADP and per-source raw stat projections
  (real VORP fuel for backlog #8, eventually). **Deliberately not wired in**:
  it's DraftKick's paid-product backing data, not an intentional public API,
  and using it would fetch FantasyPros' paywalled data through a side door —
  the same data just declined above. Fine to revisit for VORP research; don't
  add a fetch button without asking first.

**VALUE metric — what it actually measures (don't flip the sign without
re-confirming):** `buildValueComparison()` in `shared.js` compares **Sleeper
Live ADP against a baseline** (whichever other ADP source(s) are enabled,
median-blended if more than one) — it does **not** use "my rank" at all.
`delta = sleeperAdp - baselineAdp`. Positive/green = Sleeper drafts them LATER
than the baseline says = a discount specific to Sleeper. Negative/red = Sleeper
drafts them EARLIER than baseline = Sleeper drafters pay up relative to the
wider market = a reach. Verified against a worked example (FantasyPros ADP
higher than Sleeper → reach/red; FantasyPros lower → value/green) with a unit
test before shipping. The Best Picks widget's inline "ADP +N" text uses this
exact same `delta`/color scale now (previously it computed a separate my-rank-
vs-ADP metric via now-deleted `adpDelta`/`adpDeltaColor` functions — the two
widgets showing different numbers both labeled "ADP" read as a bug, not two
intentional metrics, so they were unified. If a rank-relative ADP metric is
wanted again later, it needs a label that makes clear it's different from the
tier board's VALUE bar).

**VALUE/ADP-gap color+width scale is a flat pick-count, not a percentage of
ADP (fixed 2026-08-23 — don't revert to percent-of-baseline without a strong
reason):** `valueColor()` in `shared.js` buckets `Math.abs(delta)` against
fixed thresholds (`VALUE_LIGHT_PICKS = 4`, `VALUE_FULL_PICKS = 15`), and
`renderValueBadge()`'s bar width scales the same way. A percent-of-baseline
version was tried first (`delta / baselineAdp`) and looked broken in practice:
near the top of the draft ADP values cluster in a tiny range (1.1–3.0), so a
trivial half-pick gap between sources computed as a huge percentage and lit up
bright green/big, while a real 5-8 pick gap in the middle rounds computed as a
small percentage and read as gray noise — backwards from the actual signal.
Flat pick-count scaling doesn't have that blowup: "5 picks apart" reads the
same regardless of which round it happens in.

**CSV parser notes specific to ADP/ranking imports** (`parseRankings()` in
`shared.js`):
- Positional tiers (WR1→WR, TE2→TE) are stripped to the base position.
- FantasyPros' Real-Time ADP export ≠ their Draft Rankings ECR export — different
  reports, different columns. Real-Time ADP uses `POS.RK` (e.g. "RB1") instead
  of `POS` (`HEADER_ALIASES.pos` recognizes it), and embeds team+bye in the name
  cell ("Jahmyr Gibbs DET (6)", "Tyreek Hill FA ()") — `stripEmbeddedTeamBye()`
  strips that, or `playerKey()` matching silently breaks against every other
  source.
- The Real-Time export also prepends a one-line caption above the real header
  row. `parseRankings()` scans the first 4 rows and picks whichever scores the
  most header-alias hits, not just row 0 — otherwise the caption gets read as
  the header and the parser falls back to broken shape-inference.
- The same export carries both a coarse sequential `RK` column and a precise
  decimal `REAL-TIME` column (the actual ADP value). Header-role matching is
  priority-ordered by the `HEADER_ALIASES` array (not column position), with
  `real-time`/`realtime` listed ahead of `rk`/`rank`, so the precise value wins.

## Surface split — read before moving any feature
Settled after using the extension in a real draft.
- **Side panel (`panel.html`) = the live draft cockpit.** Best Picks Right Now,
  team position counts, the tiered board (now including per-source ADP columns
  and the value bar — see below), and the BEST QB/RB/WR/TE grid all live here.
  Setup controls (draft ID, slot, refresh, link to the manager) collapse into
  `#settingsPanel`, which auto-collapses on a successful SYNC.
- **Rankings Manager tab = curation only.** Import/edit ranking sources, manage
  ADP sources, compare everything side by side. No recommendations or team
  counts here — most good cheat sheets are paywalled, so this is where the user
  builds their own from whatever they can get.
- Per-source ADP columns + the value bar living in the side panel board rows
  (not just the manager table) is a deliberate partial exception to "side panel
  = board only" — the user wants that data visible while actually drafting.
  See "Design & alignment lessons" below before touching this layout again.
- The two recommendation widgets (`renderBestPicksWidget`/`renderTeamCountsWidget`
  in `shared.js`) take a container element, so mounting either one elsewhere is
  a one-line change — don't fork the markup.
- **Pop-out** (`⤢`): opens `panel.html` via `chrome.windows.create({type:"popup"})`
  — side panels can't detach natively. Both copies poll independently
  (harmless — idempotent writes). Closes the side panel it was opened from via
  `window.close()` (the only real way; there's no `chrome.sidePanel.close()`).
  Opens with `?popout=1` so it hides its own pop-out button.
- **Manual crossout on the board is double-click**, not single — a single
  click on a full-width row was too easy to trigger by accident mid-draft. The
  manager's ✕/↺ icon stays single-click (small, deliberate target).
- **TAKEN is an independent toggle, not a filter value** — `posFilter`
  (ALL/QB/RB/WR/TE) and `showTaken` (bool) layer independently, fixed
  identically in both `panel.js` and `rankings-manager.js`.
- **Favorite/avoid flags** (`playerFlags` in `shared.js`) are set only in the
  manager (★/⊘ per row) and shown as read-only badges everywhere else. Display
  only — doesn't affect consensus ranking.

## Rankings Manager architecture
- **Two surfaces, one state.** `panel.js` is the only thing that polls Sleeper;
  it writes picks to `chrome.storage.local` under `draftState`. The manager
  reads that and can add manual crossouts back. Both listen via
  `chrome.storage.onChanged` and guard against acting on the echo of their own
  write.
- **Player identity is `normalizedName|POSITION`** (`playerKey()`), not array
  index — required for multiple sources to survive matching. Picks are
  recorded with this key for every drafted player, even ones absent from the
  default rankings.
- **Consensus = median, not mean**, across enabled sources only; a player
  missing from a source contributes nothing rather than counting as unranked.
- The builtin ranking source and the FantasyPros ECR source are both
  **re-seeded from their source files on every load** (without their stored
  player array persisted), so a code update to the underlying data actually
  takes effect.
- `myRosterId` is user-entered; picks match on `roster_id` OR `draft_slot`
  because Sleeper populates these differently in real vs. mock drafts.
- **Unmatched-player reconciliation**: `findOrphans(sources, merges)` detects
  players appearing in only one source. `K_MERGES` stores confirmed
  variant→canonical mappings globally; `buildConsensus(sources, merges)`
  resolves through it before grouping. Manager UI is a collapsible section with
  a prompt-based one-click MERGE — a rare safety net, not a heavy-use feature.

## Design language
Dark "stadium/scoreboard" theme, not a generic AI-template look:
- Background near-black (`#0B0D08`), panel surfaces `#14170F`, hairlines
  `#22251B`/`#2A2E22`.
- Monospace (JetBrains Mono) for data/labels, Inter for body text.
- Position colors: QB gold `#F5C242`, RB green `#5FCF8A`, WR blue `#5FA8E8`,
  TE pink `#E88AC9`.
- Tiers are numbered 1 (best) through 16 (not letters — FantasyPros' numeric
  tier column lines up directly), colored gold→orange→green→blue→purple→gray
  as they descend.
- Preserve/extend this theme in future design work — don't replace it.

## Design & alignment lessons (read before touching board/column layout again)
The ADP-columns-in-the-side-panel work went through five rounds of alignment
bugs before it was actually right, each a genuinely different root cause
(padding mismatch → independent `auto`-track sizing between two separate grid
containers → a wrapper div silently overriding alignment). **The user has
explicitly flagged that the current layout should be revisited in a future
full design pass**, built with the complete picture of what the board needs to
show (rank, name, N ADP columns, value bar, pos chip, and whatever gets added
next) rather than bolted on incrementally — this file's own history is the
evidence for why. When that pass happens:
- Don't eyeball alignment fixes. Build the exact markup+CSS in an isolated
  static HTML file, serve it locally (`python3 -m http.server`), open in a
  real browser, and read `getBoundingClientRect()` values for whatever needs
  to line up. Screenshot only as a final sanity check, not as the verification
  method.
- Never mix an `auto`-sized grid track with content that's empty in one
  context (e.g. a header/label row) and non-empty in another (a real data
  row), across two separate grid containers meant to align. Fixed lengths (or
  matching `minmax`) on every track are the only way to guarantee two
  independent grid containers land on the same column boundaries.
- Full source-name labels (vs. 2-letter tags) were tried and measurably don't
  fit at the panel's default ~380px width without crushing the name column to
  1-2 characters — the math: content width 340px, minus rank (34px) + pos-chip
  (36px) + gaps (40px) leaves ~230px for [name + N ADP cols + value bar], and
  the name needs the majority of that. Full labels are only realistic once the
  popped-out window (wider) is the primary use path, not the docked panel.
- CSS for `.vbig`/`.vbig-num`/`.vbig-track`/`.vbig-fill`/`.vbadge`-family rules
  lives in both `panel.html` and `rankings-manager.html`, kept in sync
  manually — there's no shared stylesheet (see Technical debt).

## Feature backlog
Full list with sequencing lives in `4thGo-feature-backlog.md`. Don't re-derive
priorities from scratch. Notable status since it was last summarized here:
- **#1 (importable rankings), #3 (multi-source side-by-side), #9 (ADP-vs-rank
  column), #11 (unmatched-player reconciliation), #15 (favorite/avoid flags)
  — all built.** See the relevant sections above.
- **#2 (UI redesign)** — still explicitly deferred, but now scoped to include
  the ADP-columns/value-bar layout — see "Design & alignment lessons" above.
- **#8 (VORP) / #16 (true value-cliff tiering)** — both still blocked on a real
  points-projection data source. DraftKick's static CSV (see ADP section) has
  raw per-vendor stat projections that could unblock this, pending a decision
  on using it.
- **#13 (team grade vs. league-mates)** — user-flagged as high priority; still
  blocked on picking a value metric (overlaps #4/#8).
- **#14 (manual refresh button value)** — still an open question; the
  cache-expiry countdown may make the button redundant.
- Everything else (weighted sources, custom draft-strategy logic,
  league-specific scoring) is unstarted; read the backlog file for the actual
  sequencing reasoning before picking one up.

## Design fundamentals pass (completed, historical)
An Apple-design/Emil-design-eng principles review fixed: double-click source
isolation (previously had a side effect of also disabling the source), a
themed confirm dialog replacing native `confirm()`, unified button press
feedback (`scale(0.97)` on active), a hover-transition gap on board rows,
snappier settings-drawer collapse animation, slide+fade toast transitions with
color differentiation, and hover/transition polish on filter buttons.

## Technical debt
- **CSS token duplication** across `panel.html` and `rankings-manager.html` —
  both redefine `:root`, button base styles, and now the `.vbig`/value-bar
  family of rules. Worth consolidating into a shared stylesheet once the
  design pass (backlog #2) happens.
- **Typography consolidation** — scattered "small monospace eyebrow" styles
  (`.sub`, `th`, `.teamHint`) hand-tuned differently. Same design-pass note.
- `rankings-manager.html` still carries dead `.bestCard`/`.bestMeta`/`.posChip`
  CSS from before the surface split (that widget never mounts there anymore).
  Harmless, not worth the churn to clean up on its own.

## Testing
**There is no automated test suite in this repo currently** — earlier notes in
this file referenced `test.js`/`widget-test.js`/`flag-test.js`/
`merge-test-final.js`, but those files were never committed and don't exist.
Don't assume they can be run. What actually exists:
- `test-fp-parse.js` / `test-fp-parse2.js` — disposable one-off scripts from a
  single CSV-parsing debug session (hardcode an old absolute path,
  `/Users/rithvikmada/Repos/sleeper-draft-ext 4/` — stale, don't reuse as-is).
- Verification during this project has mostly been: (a) real unpacked-extension
  testing by the user against live/mock Sleeper drafts, and (b) for grid/layout
  bugs specifically, an isolated static-HTML harness measured via
  `getBoundingClientRect()` (see "Design & alignment lessons").
- Mock drafts (bot-filled) work identically to real drafts for API purposes and
  pick much faster — good for stress-testing polling/matching logic.
- Still not verified against a real draft: pop-out window behavior with two
  copies polling at once, and the cache-expiry countdown/fresh-vs-cached toast
  against a real `Age` header over a full draft.

## Build/deployment workflow
- All edits happen directly on the local filesystem Chrome's "Load unpacked"
  already points at — a plain extension reload picks up changes immediately.
  (Earlier sessions edited in a sandboxed environment and handed over zip
  files, which caused real confusion debugging against stale code; that's why
  this project moved to Claude Code operating on the real folder directly.)
- No build step for source code. FantasyPros ECR CSV → `fp-rankings.js` is
  regenerated via `node build-fp-source.js` after replacing the source CSV.

# 4th&Go — Sleeper Draft Board — Project Context

Read this first before making any changes. This captures decisions, gotchas, and
history so a fresh session doesn't waste time rediscovering things or
accidentally reversing intentional fixes. Organized by topic, not chronologically
— when something was superseded, the old version was removed rather than left
alongside the new one.

## What this is
A Chrome extension (Manifest V3) that shows a personal tiered fantasy football
ranking board and auto-crosses off players as they're drafted, by polling
Sleeper's public read-only draft API. The board lives in its own resizable
popup window, opened directly by the toolbar icon — see "Window architecture"
below; there is no docked side panel (removed 2026-08-23).

**League format this is tuned for:** 10-team, full PPR, 1QB/2RB/2WR/1TE/2FLEX,
no K/D. This matters for ranking/logic decisions (see backlog #4) and is why
K/DST rows are dropped everywhere a source is parsed or fetched.

## File structure
- `manifest.json` — MV3 config. Host permission for `api.sleeper.app` only
  (FantasyFootballCalculator's permission was added and later removed — see
  ADP section below). No `sidePanel` permission/key — see "Window architecture".
- `background.js` — opens/focuses the board's popup window on icon click
  (remembering its last size/position), and auto-detects draft ID from an
  open Sleeper draft tab (URL pattern `sleeper.com/draft/nfl/<id>`).
- `panel.html` / `panel.js` — the board window: live draft cockpit. All
  rankings data, Sleeper polling, pick matching, and board rendering.
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
  re-derive priorities from scratch; read that file. **Stale as of the Stage 2
  audit fixes below** — still says Sleeper has no ADP endpoint and that VORP
  needs a projections source to be found; both are wrong (see "Engineering
  audit" below). Not yet reconciled — that reconciliation was explicitly
  deferred, so don't trust this file's premises about ADP or VORP without
  cross-checking the sections here first.
- `rankings-manager-prompt.md` — the **original implementation spec** for the
  Rankings Manager, from before it existed. Fully superseded by the real
  code now; kept for history only, not a live reference.
- `codebase-audit-prompt.md` — the original engineering-audit brief that
  scoped the review below. Historical now — the audit it describes has run;
  see "Engineering audit" below for what actually happened and what's left.
- `AUDIT.md` — the Stage 1 audit report itself (33 findings, rated
  must-fix/worth-fixing/minor-polish). Most items are now fixed — see
  "Engineering audit" below for which. Keep it as the historical record of
  what was found and why; don't edit findings after the fact to match fixes,
  that's what this section of claude.md is for.
- `test.js` — a real regression suite now (`node test.js`), not a stale
  reference to files that don't exist. See Testing below.
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
in the Rankings Manager table and (for enabled sources) the board window.
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

## Window architecture (changed 2026-08-23 — no more docked side panel)
The board used to be a Chrome side panel with a separate ⤢ pop-out button for
a wider window. Both are gone, replaced with a single resizable popup window
that the toolbar icon opens/focuses directly:
- `background.js`'s `chrome.action.onClicked` handler (not
  `chrome.sidePanel.setPanelBehavior`, which has been removed along with the
  `sidePanel` permission) opens `panel.html` via `chrome.windows.create({type:
  "popup"})`, or focuses the existing one if it's already open — tracked via a
  window ID in `chrome.storage.session` (cleared on `windows.onRemoved`, so a
  closed window doesn't leave a stale ID that fails silently forever).
- The window's size/position persist across opens: `chrome.windows.
  onBoundsChanged` writes `{left,top,width,height}` to `chrome.storage.local`
  (`boardWindowBounds`) on every move/resize, and the next open reuses them,
  falling back to `DEFAULT_BOUNDS` (1000×900) on first run.
- **Why this replaced the docked side panel**: the docked panel's ~380px width
  was hard-capped (see "Design & alignment lessons" below) and couldn't fit
  projection/stat columns without crushing the name column. A user-resizable
  window has no such ceiling — extra columns (see the stats/projections
  backlog item) are meant to show only in this wider view rather than
  cramming into a width that was already fully spent on ADP columns + the
  value bar.
- The old pop-out's "two copies polling independently, harmless because writes
  are idempotent" reasoning no longer applies since there's only ever one
  window now (repeat icon clicks focus it, they don't spawn a second one).
- **"Rankings Manager button does nothing" (fixed 2026-08-23) — two real,
  independent bugs stacked on top of each other, both caused by this window
  architecture change.** Debugged with the user against a live loaded
  extension (chrome://extensions' "Inspect views" list was the key
  diagnostic — it proved a tab WAS being created on every click well before
  the actual visibility fix landed):
  1. The button used to live inside `#settingsPanel`, which auto-collapses to
     `max-height:0` right after a successful sync (`startPolling()` does this
     deliberately — see below). A zero-height container isn't just visually
     hidden, it's unclickable, so once you're mid-draft (exactly when you'd
     want the manager) the button couldn't be reached at all. Fixed by moving
     `#openManager` out of `#settingsPanel` into `#statusBar` (next to the `⚙`
     settings toggle), so it's always reachable.
  2. Separately, `chrome.tabs.create({url})` was creating a real tab on every
     click (confirmed via the growing "Inspect views" count), but that tab
     had no visible home. Two attempted fixes didn't work: a bare call, then
     a bare call followed by `chrome.windows.update(tab.windowId,
     {focused:true})` — both failed because Chrome was attaching the new tab
     to THIS BOARD'S OWN `type:"popup"` window (which has no tab strip to
     ever surface it), not to some other normal window as expected, so
     "focus the tab's window" was just re-focusing the popup that was already
     focused. `tabs.create()`'s implicit "current window" target resolution
     is apparently not safe to rely on from inside a popup-type window.
     First fixed by switching to `chrome.windows.create({url, type:"normal"})`
     instead, which sidesteps the ambiguity entirely — but that always opens
     a brand-new browser window, which is reliably visible but ignores an
     existing window the user's actually working in (e.g. their draft tab),
     a real usability regression the user flagged immediately. **Final fix**:
     explicitly enumerate real windows via `chrome.windows.getAll({windowTypes:
     ["normal"]})` and target one of their ids directly with `chrome.tabs.
     create({url, windowId})` — landing as a tab in an existing normal window
     when one exists, falling back to `windows.create()` only if none does.
     The lesson isn't "use windows.create" or "use tabs.create", it's: never
     let either API implicitly guess a target window from inside a
     `type:"popup"` context — always resolve and pass a real window id
     explicitly. Any future "open X in a new tab" affordance added to
     `panel.js` should follow this same explicit-target pattern.

## Surface split — read before moving any feature
Settled after using the extension in a real draft.
- **The board window (`panel.html`) = the live draft cockpit.** Best Picks Right
  Now, team position counts, the tiered board (now including per-source ADP
  columns and the value bar — see below), and the BEST QB/RB/WR/TE grid all
  live here. Setup controls (draft ID, slot, refresh, link to the manager)
  collapse into `#settingsPanel`, which auto-collapses on a successful SYNC.
- **Rankings Manager tab = curation only.** Import/edit ranking sources, manage
  ADP sources, compare everything side by side. No recommendations or team
  counts here — most good cheat sheets are paywalled, so this is where the user
  builds their own from whatever they can get.
- Per-source ADP columns + the value bar living in the board window's rows
  (not just the manager table) is a deliberate partial exception to "board
  window = board only" — the user wants that data visible while actually
  drafting. See "Design & alignment lessons" below before touching this layout
  again.
- The two recommendation widgets (`renderBestPicksWidget`/`renderTeamCountsWidget`
  in `shared.js`) take a container element, so mounting either one elsewhere is
  a one-line change — don't fork the markup.
- **Best Picks respects the board's position filter now** (2026-08-23) — user
  feedback from actually mock-drafting with the tool: filtering the board to
  RB mid-draft still showed the overall best-3-across-all-positions in Best
  Picks, not the best available RBs, which is exactly the moment you'd want
  the latter. Fixed by pre-filtering the `rows` passed into
  `renderBestPicksWidget` by `posFilter` in `panel.js`'s `renderRecommendations()`
  (`renderBestPicksWidget` itself stays position-agnostic — filtering
  upstream means "each source's own #1 pick," computed inside the widget,
  naturally scopes to that position too, for free). The position-filter
  button handlers now call `renderRecommendations()` alongside `renderBoard()`
  so both update together. The widget takes an optional `posFilter` purely to
  relabel "1ST — BEST AVAILABLE" as "1ST — BEST RB AVAILABLE" (etc.) so a
  filtered view doesn't silently look identical to the unfiltered one — the
  4-position BEST QB/RB/WR/TE grid elsewhere is intentionally unaffected by
  this, it always shows one best per position regardless of filter.
- **Board tier-grouping only recognized numeric "1".."16" tier labels
  (fixed 2026-08-23) — silently dropped every player otherwise.** Found via a
  real user CSV: isolating to a single source (`activeSources()` returns just
  that one) makes `buildConsensus` pass that source's own raw tier label
  through as-is (`enabled.length <= 1` branch) rather than computing a
  blended numeric tier — correct by design, but a source using letter tiers
  (S/A/B/C/…/O, common in real exports) produced tier group keys like `"E"`/
  `"F"` that `renderBoard()`'s `orderedTiers = TIER_ORDER.filter(t =>
  groups[t])` (`panel.js`) never included, since `TIER_ORDER` only has
  `"1"`-`"16"`. Those groups just vanished from the board entirely — looked
  exactly like "no players at this position," not a tiering bug, since
  nothing else on screen (Best Picks, which doesn't group by tier at all)
  showed anything wrong. Fixed by rendering every group `renderBoard()`
  actually built, not just ones matching `TIER_ORDER`: numeric tiers keep
  `TIER_ORDER`'s defined order, any other label sorts in by that group's best
  (lowest) rank, `"?"` (no tier at all) stays last. This display fix alone
  only covered the single-source-isolated case, though — see the next entry
  for the deeper half of this bug, which also affected blended multi-source
  view despite it always outputting numeric 1-16 tiers.
- **Letter-graded sources need normalizing before anything touches tiers**
  (fixed 2026-08-23, same CSV as above). A letter-tiered source's tier
  opinion (not its rank — rank always counted fine) was invisible to
  anything comparing tier labels directly, since that only ever matches
  `"1"`-`"16"`. Fixed with `normalizeTierLabel()` in `shared.js`: maps a
  `S,A,B,C,...,O` 16-letter scheme (S best) onto `TIER_ORDER`'s `"1"`-`"16"`
  the moment `buildConsensus` reads `p.tier`, before anything downstream
  (single-source passthrough, or the blending below) ever sees the raw
  label. Genuinely unrecognized labels (not numeric, not in the S-O scheme)
  pass through unchanged — `renderBoard()`'s tier-grouping (previous entry)
  still displays them fine, they just can't participate in the blending
  below since there's nothing to compare them against.
- **Source-vote-boundary tiering was tried and reverted (2026-08-23) —
  the depth/equal-width approach above is what's actually running.** Attempt:
  store each player's normalized tier keyed by source (`e.tiers[src.id]`),
  then for every adjacent pair in blended rank order, count how many sources
  that tier *both* players place them in different tiers, keeping a boundary
  where a majority of those voting sources agreed. Simulated against real
  bundled data first (371 merged players, 2 sources) and looked reasonable
  (16 tiers, 10-61 players each) — but **failed on the user's actual live
  data** (an 11-player tier 1 followed by a 112-player tier 2), and the
  simulation's apparent success was misleading. The real flaw: independently-
  drawn tier boundaries from different sources almost never land on the
  *exact same* adjacent rank-pair, even when the sources broadly agree a
  cliff exists nearby — one source breaks between rank 14/15, another
  between 16/17, and exact-pair matching counts that as zero agreement
  despite the real, near-miss consensus. With only 2-3 sources actually
  covering most of the draft (see the "FantasyPros Top 10" note below), that
  made "majority agreement at this exact pair" nearly unreachable across most
  of the board, collapsing into one dominant leftover tier — worse than the
  depth-based version, not better. (A secondary bug was also found and fixed
  along the way — capping to 16 tiers by raw strength collapsed ties into
  whichever boundaries appeared earliest in the draft — but fixing it wasn't
  enough to save the core approach.) **Reverted in full**: `buildConsensus`
  and `assignBlendedTiers` are back to the depth-based equal-width version
  exactly as documented above (`depthVotes`/`maxTierIdx`/`depth` restored).
  A windowed/clustering approach — treating nearby-but-not-identical
  boundaries across sources as the same real cliff, rather than requiring
  exact positional agreement — might actually work, but needs real design
  work before attempting again; don't re-attempt the naive exact-pair
  version described here.
- **Open question, unresolved as of this revert**: is "FantasyPros Top 10"
  (one of the user's three enabled sources) only populated for the first ~10
  players, with no tier opinion at all past that point? If so, only 2 of 3
  sources actually vote on tier boundaries for the other ~95% of the draft
  regardless of which blending approach is used — worth checking before the
  next tiering attempt, since it directly affects how much signal is
  available to blend against.
- **Manual crossout on the board is double-click**, not single — a single
  click on a full-width row was too easy to trigger by accident mid-draft. The
  manager's ✕/↺ icon stays single-click (small, deliberate target).
- **TAKEN is an independent toggle, not a filter value** — `posFilter`
  (ALL/QB/RB/WR/TE) and `showTaken` (bool) layer independently, fixed
  identically in both `panel.js` and `rankings-manager.js`.
- **Favorite/avoid flags** (`playerFlags` in `shared.js`) can be set from
  either surface now (2026-08-23): the manager keeps its ★/⊘ per-row buttons
  for bulk editing, and the board window added a right-click menu on a
  player's name (`openFlagMenu`/`setFlag` in `panel.js`) for setting them
  mid-draft without switching tabs. Right-click, not double-click, was chosen
  deliberately — double-click on the row already means "cross player off"
  (see the dblclick handler above), and a floating menu was chosen over
  inline pills or a tooltip so it never competes with the ADP columns/value
  bar for row space (three variants were mocked up before picking this one).
  Both surfaces still just call `saveFlags()`/`loadFlags()` against the same
  `K_FLAGS` storage key, so there's one source of truth either way. Display
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
  resolves through it before grouping. Manager UI is a collapsible "UNMATCHED
  PLAYERS" section — still a rare safety net, not a heavy-use feature.
  **MERGE opens a clickable candidate list now (`openMergeModal` in
  `rankings-manager.js`), not a native `prompt()` (fixed 2026-08-23).** The
  original prompt asked users to type `Name|POS` freehand — a real user hit
  this: a slightly-off format failed validation, showed a generic error
  toast, and the orphan just sat there looking unchanged with no clear
  reason why. `mergeCandidatesFor(orphanKey)` now lists every other player at
  the same position from other enabled sources (name, source(s), rank),
  filterable by a search box; clicking one records the merge — no typing,
  no format to get wrong.
  **Also rank-limited and actually collapsible now (2026-08-23)**: only
  orphans ranked below `ORPHAN_RANK_LIMIT` (150) show at all — deep-bench
  name mismatches aren't worth surfacing and were burying the handful of
  early-round ones that actually matter. The section defaults collapsed
  (`orphansCollapsed` in `rankings-manager.js`, toggled by clicking the
  `#orphansHeader` row) so it doesn't eat vertical space above the main
  player table by default; the header's count reflects how many are hidden
  by the rank cutoff so it's clear filtering happened, not that reconciliation
  stopped working. **Gap fixed in the Stage 2 audit pass (see "Engineering
  audit" below)** — this used to hide the whole section (`display:none`)
  rather than showing "0" when nothing qualified under the rank cutoff, so a
  source whose every mismatch happened to be ranked below 150 made the entire
  UNMATCHED PLAYERS section disappear from the page, not just show empty. A
  real user hit this after importing Boone/Smyth (analyst rank sources with
  abbreviated first names like "K. Gainwell" that don't normalize-match
  "Kenneth Gainwell") and reported "I don't see it" because the section
  wasn't collapsed-and-empty, it was gone. `renderOrphans()` now shows the
  section whenever 2+ sources are enabled (the same condition `findOrphans`
  itself requires), reporting "(0)" and pointing at the right-click merge
  path below when there's genuinely nothing to reconcile. See the next entry
  for that right-click path, which is the OTHER fix that landed the same day
  for the underlying "abbreviated names never match" problem.
  **Right-click "merge near matches" (2026-08-23)** — added as the fix for
  the gap above, and as a fundamentally faster path than the orphans list for
  any source with abbreviated names: right-click a player's name in the main
  table (any row, not just orphans) to open a menu that finds every OTHER
  enabled source's likely-same-person entry via `findNearMatchOrphans()` in
  `shared.js` — same last-name + first-initial + position fallback pattern
  already trusted for matching a live Sleeper pick to a rankings row
  (`matchPick` in `panel.js`), reused here instead of inventing a second
  fuzzy-matching approach. Only auto-offers a source's candidate when it's
  the SINGLE such match in that source at that position — two same-initial
  same-last-name players there is genuinely ambiguous and gets skipped
  rather than guessed (verified with a Node simulation: a fake "Brandon
  Robinson" alongside "B. Robinson" in the same source correctly produced
  zero matches). The menu (`openNearMergeMenu`/`.nearMergeMenu` CSS, same
  floating-menu pattern as the board's right-click favorite/avoid menu) lists
  every match with a checkbox (all checked by default) and one "MERGE
  SELECTED" button that writes all of them into `K_MERGES` in a single
  action — this is the actual answer to "merge all possible/near-match
  orphans at once," not a rank-cutoff change, since a higher cutoff still
  requires clicking through orphans one at a time. Not rank-limited, unlike
  the orphans list — the whole point is reaching mismatches the orphans list
  hides. Genuinely unrelated players (a total name-matching miss) simply
  produce zero results here; there was never a report to fabricate.
- **Player search** (2026-08-23): a name/team substring filter (`playerSearch`
  in both `panel.js` and `rankings-manager.js`) layers on top of `posFilter`/
  `showTaken` the same independent way those two already do — case-insensitive
  substring match against `r.name`/`r.team`, not a prefix match, so "chase"
  finds "Ja'Marr Chase". Same pattern duplicated in both surfaces rather than
  shared, matching the existing `posFilter`/`showTaken` precedent.
- **Source edit modal** (2026-08-23): the ✎ button on both ranking and ADP
  source chips used to just `prompt()` a rename. It now opens a real modal
  (`#editModal`, `openEditModal(kind, id)` in `rankings-manager.js`) that
  edits a source by its fixed id — rename, upload/clear a small icon (stored
  as a 48×48 data URL on the source object, downscaled client-side via canvas
  so a full photo upload doesn't bloat `chrome.storage.local`), replace the
  player list with a freshly-uploaded CSV, and see a "last updated" status
  line (`importedAt` timestamp, now tracked on ranking sources too, not just
  ADP sources which already had it). Uploading a new CSV through this modal
  is the correct way to refresh a source day-of-draft — re-using "+ ADD
  SOURCE" with the same name creates a duplicate for ranking sources (ADP
  sources upsert by name there; ranking sources never got that treatment,
  since editing was expected to go through this modal instead).
- **`manualOverride` lets the two code-seeded ranking sources actually be
  edited (fixed 2026-08-23)** — previously the edit modal hid the CSV-replace
  option entirely for the default source, since `loadSources()` re-seeds its
  player list from `rankings.js` on every load regardless of what's stored,
  which would've silently discarded an upload on the next reload. The user
  wanted to actually replace it, not just be told no. `makeSource()` (shared.js)
  now carries a `manualOverride` flag, set the moment a CSV is replaced through
  the edit modal for `id === "default"` or `id === "fp"` (FantasyPros ECR,
  `rankings-manager.js`'s `ensureBuiltinSources()`) — once set, `loadSources()`/
  `ensureBuiltinSources()` stop re-seeding that source from its bundled JS
  file and trust the stored upload instead. `saveSources()` only persists the
  default source's (large) player array when `manualOverride` is true;
  otherwise it's left as `[]` as before, since it's cheaply regenerable from
  `rankings.js`. The edit modal's CSV input is now always visible for every
  ranking AND ADP source — the status line explains the override behavior for
  `default`/`fp` specifically until one is uploaded, then shows the normal
  "last updated" timestamp. That timestamp is also now in the ✎ button's
  hover tooltip on every chip (ranking and ADP alike), so it's visible without
  opening the modal at all.
- **Uploaded source icons render on the board too, not just the manager
  chips** (2026-08-23): `sourceDotHtml(s, {solo, title})` in `shared.js` is
  the one place a source's little square/dot badge gets built now — used by
  both `renderBestPicksWidget`'s per-card dots and `renderSourceListWidget`'s
  always-visible source list, both in the board window. Shows the uploaded
  icon (`.dot.has-icon`, CSS in `panel.html`) when `s.icon` is set, falling
  back to the existing color-swatch + 2-letter tag otherwise — same fallback
  pattern as the manager's own chip swatches. The ADP column header labels in
  the tiered board still use plain `sourceTag()` text, not this helper —
  that's a text label above a column, not a square badge, so it wasn't in
  scope for this change.
- **Position-only ranking sources** (2026-08-23) — for guides that only rank
  within one position (a QB1-20 list, RB1-19 list, etc., no combined overall
  order across positions at all — common for free/informal creator guides,
  unlike paywalled big-boards). `makeSource()`'s `positionOnly` flag (set via
  a checkbox in both the add-source and edit-source modals in
  `rankings-manager.js`) tells `buildConsensus` (`shared.js`) to exclude that
  source completely from rank/tier blending — its players never touch
  `e.ranks`/`tierVotes`/`depthVotes`, so it's structurally impossible for a
  positional-only rank to corrupt the cross-position consensus math the way
  it would if just dropped into the normal `Rank` column (a QB ranked "1"
  within its own position isn't remotely the same value as an RB ranked "1"
  overall — mixing them would silently wreck blending for every other source
  at once). Instead its tier gets stored per-player in a separate
  `posOnlyTiers[src.id]` map, plus a `posOnlyRanks[src.id]` map (within-
  position rank, added later for the Best Picks dot logic below). The
  Rankings Manager table shows it as its own reference column (mirrors the
  existing per-source rank columns, showing tier text instead) — **the board
  itself does NOT** get a matching column (reverted same day it shipped —
  see next entry). The combined sources you already have keep
  driving the actual blended rank/tier exactly as before — this was a
  deliberate design choice (user: "priority and reliance for the combined
  ranking sources... to drive the blended tiers/rankings") specifically to
  avoid a repeat of the source-vote-boundary tiering failure a few entries up
  — anything that lets an unreliable/incomparable signal into the actual
  blending math has already gone wrong once this session. The
  `ranking-source-normalizer-prompt.md` file (a separate-Claude-chat prompt
  for converting messy exports into importable CSVs) was updated to detect
  this shape — multiple side-by-side per-position tables, no combined rank —
  and flag it explicitly rather than inventing a fake overall order from
  outside assumptions about typical positional value.
  **Board reference column reverted (2026-08-23, same day) — a position-only
  source is still just a ranking source, and no ranking source gets its own
  board column.** The initial build gave position-only sources a dedicated
  tier column on the tiered board (`posOnlyCols` in `panel.js`), mirroring
  the ADP-column layout. User caught the inconsistency immediately: normal
  blend sources like Flock or FantasyPros ranking sources never got a column
  of their own there — board columns are (and should stay) reserved for ADP
  and future per-player stat/projection data, not per-source ranking detail;
  that's what the Rankings Manager table is already for. Removed `posOnlyCols`
  and the per-row `posOnlyCells` entirely from `renderBoard()` — `gridColParts`
  is back to `[rank, name, ...adpCols, value?, pos-chip]` exactly like before
  position-only sources existed. `posOnlyTiers`/`posOnlyRanks` themselves are
  untouched (still needed for the Rankings Manager table and the Best Picks
  dot-placement logic below) — only the board's dedicated column was cut.
  **Best Picks dot placement for a position-only source (2026-08-23)** — a
  position-only source's rank is only meaningful within a position (its "WR2"
  isn't comparable to its "RB2"), so it can't get a single true overall #1
  pick the way `sourceTopPick` computes for a blended source (lowest
  `r.ranks[s.id]` across everything). Instead, `renderBestPicksWidget` (in
  `shared.js`) computes, for each position actually present among the
  displayed top cards, that source's best-ranked player using the new
  `e.posOnlyRanks[src.id]` map (added alongside `posOnlyTiers`, same
  `buildConsensus` pass) — then, if that produces candidates from more than
  one position (e.g. its own WR2 card AND its own RB2 card both make the top
  3), dots only the single one that ranks highest on OUR actual blended
  board (`r.consensus`), so the source still shows exactly one dot rather
  than one per position. User's own framing: "if his WR2 and his RB2 are on
  the best picks options put his icon at the player who is higher on our
  blended rankings." Verified with a Node simulation before shipping (RB2 at
  blended rank 3 beat WR2 at blended rank 8 for the dot, matching this rule).
  **Isolating (solo-clicking) a position-only source went completely blank —
  fixed same day, two independent causes.** User report: filtering the board
  to a position AND isolating "Max Loeb Rankings" (a position-only source)
  showed "No available WR players" / "Nothing here" everywhere, despite the
  source clearly having WR data.
  1. `renderBoard()`/`bestAvailable()` in `panel.js` call `buildConsensus(
     activeSources(), merges)`, and `activeSources()` returns an array
     containing ONLY the solo'd source when one is set. `buildConsensus` was
     still routing a `positionOnly` source into the "never touches ranks/tier"
     branch even when it's the *only* source in the call — with nothing else
     to protect from corruption, that just meant `consensus`/`tier` came back
     null/"" for literally every row, so the tier board and per-position BEST
     grid effectively saw an all-null board. Fixed with a `soloing = enabled.
     length === 1` check in `buildConsensus`: when a position-only source is
     the sole source passed in, it's treated as a normal single blend source
     (own rank IS the consensus, own tier IS the tier) instead of routing to
     `posOnlyTiers`/`posOnlyRanks`.
  2. Separately, `renderRecommendations()` in `panel.js` deliberately calls
     `buildConsensus(sources.filter(s=>s.enabled), merges)` for the Best Picks
     widget — the FULL multi-source blend, never solo-filtered (so every
     source's agreement dot stays visible even while isolating one). Fix #1
     doesn't apply here since there's usually more than one enabled source
     overall, so a position-only source still correctly gets routed away from
     `ranks` in this call. But `renderBestPicksWidget` (`shared.js`) was
     isolating by checking `r.ranks[soloSource] !== undefined` unconditionally
     — for a position-only source that's always undefined, so every row got
     filtered out. Fixed by reading `r.posOnlyRanks[soloSource]` instead
     whenever the solo'd source `.positionOnly` is true (`soloIsPosOnly`/
     `soloRank()` helpers), used for the isolate filter/sort AND the rank-tile
     display value. Both fixes verified with direct Node simulations against
     the real flattened T20 CSV before shipping — isolating it alone now shows
     real consensus/tier per row, and isolating it inside a multi-source Best
     Picks call now correctly surfaces its own WR ranking instead of going
     blank.

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
  the name needs the majority of that. This math was specific to the docked
  side panel, which no longer exists (see "Window architecture") — the board
  now always runs in a user-resizable window, so this constraint doesn't
  automatically apply anymore. Still worth checking actual available width
  before adding new columns, since the window can still be resized narrow.
- CSS for `.vbig`/`.vbig-num`/`.vbig-track`/`.vbig-fill`/`.vbadge`-family rules
  lives in both `panel.html` and `rankings-manager.html`, kept in sync
  manually — there's no shared stylesheet (see Technical debt).

## Engineering audit (ran 2026-08-23, Stage 2 in progress)
A full engineering review ran ahead of the VORP (#8) build, per
`codebase-audit-prompt.md`'s two-stage process. Stage 1 wrote `AUDIT.md` — 33
findings, no code changes. Stage 2 is fixing them in small reviewable
batches, each its own commit, pausing for confirmation between batches — see
`AUDIT.md`'s findings index for the full list and severities.
**Landed so far (batches 1-5 of the planned 7):**
- **Batch 1 — stale strings, dead code, comments.** The three user-facing
  strings still pointing at the removed side panel ("try FFC", "START A SYNC
  IN THE SIDE PANEL", the manager's header copy) are fixed.
  `test-fp-parse.js`/`test-fp-parse2.js` (broken one-offs, hardcoded a path
  that no longer exists) are deleted. ~25 lines of dead CSS in
  `rankings-manager.html` (the `.bestCard`/`.dot`/`#teamCounts` family, left
  over from the surface split) are gone — `.posChip` was correctly identified
  as still-live and kept.
- **Batch 2 — silent failures made loud.** `validateParsedSource()` in
  `shared.js` now blocks importing a ranking/ADP source whose rows have no
  usable position — previously this "succeeded," showed a player count on
  the chip, and the source silently contributed nothing to anything, since
  `buildConsensus`/`buildAdpConsensus` both skip position-less rows. Same
  function also warns (without blocking) on garbage input like a pasted HTML
  page or a recipe. `poll()` in `panel.js` now flags when a synced draft
  yields zero QB/RB/WR/TE picks (a wrong-sport or wrong-ID draft used to read
  as a healthy green "LIVE — N picks synced" with nothing ever crossing off).
  A staleness indicator (`STALE_AFTER_S`, `updateStaleness()`) turns the sync
  line red if 30s pass with no successful poll — see the throttling note
  below for why this was built. The Rankings Manager's 400-row table cap is
  now disclosed instead of silently truncating. `fetchSleeperAdp()`
  distinguishes "no ADP data published yet" from "Sleeper renamed the
  field" (previously both produced the same misleading message), and flags
  an implausibly small result. The unmatched-players section no longer hides
  itself when nothing clears the rank cutoff — see the correction above.
- **Batch 3 — HTML escaping.** `esc()` in `shared.js`, applied at every
  interpolation of a name, source name, team, tier, player key, or API value
  across all three files (~46 sites). **Not an XSS fix** — MV3's
  `script-src 'self'` already blocks inline scripts/handlers, so injected
  markup could never execute — this is a rendering-integrity fix: a name
  containing `<b>` or a source name breaking out of a `title="..."`
  attribute used to garble the board and could break the `data-key`
  attribute crossouts depend on. Verified in a browser, before/after: 2
  injected elements → 0, 3 injected attributes (including a live `onx="1"`)
  → 0, with `data-key`/`data-name` still round-tripping exactly.
- **Batch 4 — math and storage robustness.** `median()` coerced numeric
  strings via string concatenation instead of arithmetic
  (`median([1,"3"])` was `6.5`, not `2`) — fixed, and now total (always
  returns a Number or null). `usableSources()` normalizes a corrupted stored
  source (missing/null/non-array `players`) instead of letting
  `buildConsensus` throw and blank the board on every load with no way back
  short of DevTools. The `suppressEcho`/`suppressStorageEcho` booleans (one
  per surface, each guarding all six storage keys) are replaced by
  `makeEchoGuard()` — per-key, so saving sources in the manager can no
  longer swallow a genuine live-pick update from the board. `persistDraftState`
  now skips the write when nothing actually changed, which stops the manager
  rebuilding its full table every ~3s all draft (`updatedAt` used to change on
  every write regardless). Both surfaces' `renderAll()` now catch and show a
  readable recovery message instead of a blank page if a render does fail.
- **Batch 5 — `test.js`.** A real regression suite (`node test.js`, 56
  checks, no dependencies) replacing what was previously just a note that no
  tests exist. Covers the parser against real bundled data plus the garbage
  cases above, `median`'s fix, `buildConsensus`'s position-only isolation and
  missing-source handling, `buildValueComparison`'s sign convention,
  `findNearMatchOrphans`'s ambiguity rule, and the echo guard. Deliberately
  not a full sweep — see AUDIT.md §11a and the file's own header comment for
  why it leans on real bundled data rather than synthetic fixtures.
- **The must-fix that was a live question, not a code fix, is closed.**
  `AUDIT.md` §11g flagged a real risk: Chrome throttles JS timers in occluded
  windows, and the board window sits behind the Sleeper tab during a real
  draft. Tested directly (2026-08-23): the poll counter went from #9 to #213
  in ~10 minutes — 204 polls at ~2.9s each, the full un-throttled rate. Not
  throttled. The staleness indicator above was still built, since it makes
  any future stall visible regardless of cause, but the conditional must-fix
  itself is withdrawn.
- **Not yet done — batch 6 (docs) was explicitly skipped, batch 7
  (duplication/naming) is next.** `4thGo-feature-backlog.md` is therefore
  **still wrong** about the ADP endpoint and VORP's data source (see the file
  structure note above) — the second must-fix from `AUDIT.md` is NOT closed.
  No README exists yet. `manifest.json` is still `1.0.0`. Batch 7 (shared CSS
  token file, shared `toast()`/`activeSources()`/filter-trio helpers, the
  `builtin` → `undeletable` rename) is smaller than originally scoped, since
  batch 4 already moved `usableSources`/`makeEchoGuard` into `shared.js`.

## Feature backlog
Full list with sequencing lives in `4thGo-feature-backlog.md`. Don't re-derive
priorities from scratch. Notable status since it was last summarized here:
- **#1 (importable rankings), #3 (multi-source side-by-side), #9 (ADP-vs-rank
  column), #11 (unmatched-player reconciliation), #15 (favorite/avoid flags)
  — all built.** See the relevant sections above.
- **#2 (UI redesign)** — still explicitly deferred, but now scoped to include
  the ADP-columns/value-bar layout — see "Design & alignment lessons" above.
- **#4 (baked-in league-scoring adjustment logic) and #5 (custom draft-strategy
  rules) — dropped (2026-08-23).** Research found no consistent industry
  formula for settings-adjusted rankings (2-FLEX, TE premium) to build #4 on —
  only fixed-preset published lists (Draft Sharks/RotoBaller TEP rankings,
  tuned to one specific TE-premium level, not arbitrary settings) and analyst
  rules-of-thumb, not real methodology. #5 was dropped as not realistically
  buildable. If a settings-tuned source is ever found matching this league's
  exact settings, import it as a normal ranking source — no special logic
  needed.
- **#8 (VORP) / #16 (true value-cliff tiering) — UNBLOCKED (2026-08-23), not yet
  built.** The blocking data source turned up for free: Sleeper's own
  projections endpoint (`api.sleeper.app/projections/nfl/{year}`, same one
  `fetchSleeperAdp()` already calls for Sleeper Live ADP) returns real
  per-player point projections (`pts_ppr`) sourced from RotoWire, plus
  `rec`/`rush_yd`/`pass_yd` — actual magnitude data, not just ordinal rank.
  No new host permission, no new fetch call, just more fields off a response
  already being pulled. DraftKick's static CSV (see ADP section) is NOT
  needed for this anymore — it was the fallback plan when no clean same-domain
  source existed; skip it now unless a stat this endpoint doesn't carry is
  needed later. Building VORP still needs: (a) a replacement-level calc using
  this league's actual settings (10 teams, 1QB/2RB/2WR/1TE/2FLEX), (b) a
  decision on where in the UI it surfaces.
- **#13 (team grade vs. league-mates)** — user-flagged as high priority, and
  now the natural next build: VORP (#8) is the value metric it was blocked on
  picking, so building #8 first directly unblocks #13 rather than being a
  detour from it.
- **Stats/projections board columns (new, 2026-08-23)** — user wants PROJ
  (pts_ppr, all positions) and a position-conditional STAT column (`rec` for
  RB/WR/TE, `rush_yd` for QB) added to the board. Same Sleeper endpoint as
  VORP above covers this data — no separate source needed. Per the Window
  architecture section, these should only render in the (now only) board
  window when there's actually room, not forced into a narrow resize.
- **#14 (manual refresh button value)** — still an open question; the
  cache-expiry countdown may make the button redundant.
- Everything else (weighted sources, league-specific scoring) is unstarted;
  read the backlog file for the actual sequencing reasoning before picking
  one up.

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

## Converting a raw ranking/ADP export into an importable CSV
This comes up close to draft day: the user pastes a raw export (a table copied
from a site, a creator's spreadsheet, a screenshot transcribed to text) and
wants it turned into a CSV for the Rankings Manager's import box. There are
two related tools for this — use the right one:
- **`ranking-source-normalizer-prompt.md`** — a standalone prompt meant to be
  pasted into a SEPARATE fresh Claude chat (no repo access) along with the raw
  export. Use this when the user wants to hand the conversion off elsewhere,
  or as the canonical spec of the output format/rules even when doing the
  conversion here directly.
- **Doing it directly in this session** (what actually happened converting
  Boone/Smyth, 2026-08-23) — do this when the user pastes the export here and
  wants the CSV back immediately. The rules are identical to the prompt file
  above; the one extra thing available here that a fresh chat doesn't have is
  **this repo's own bundled full-name data** (`rankings.js`, `fp-rankings.js`)
  — use it:
  - **Combined multi-analyst tables** (one row per player, one rank column
    PER analyst/site, often an average-rank column too, "-" meaning that
    analyst didn't rank the player): when asked to pull specific analysts out
    as their own sources, one CSV per analyst using ONLY that analyst's own
    column — never the average (this tool computes its own median blend
    across whatever sources actually get imported; pre-blending here would
    double-count). A row where that analyst's cell is "-" is dropped from
    that analyst's CSV only. No `Tier` column when the source has no tier
    data at all — a rank-only source still blends into consensus rank
    normally, it just never casts a tier vote (see `buildConsensus` in
    `shared.js`), so leaving Tier out cannot corrupt tier boundaries.
  - **Abbreviated names** ("J. Gibbs", "K. Gainwell") are common in these
    tables and are a real problem, not cosmetic: this tool matches players by
    *exact* normalized name across sources (`playerKey()`), so an abbreviated
    name silently fails to match the same player's full name elsewhere and
    becomes a false "unmatched player." Cross-reference every name against
    `rankings.js` + `fp-rankings.js` by last name + team + position before
    finalizing the CSV — if there's exactly one match there, use its full
    name (this is verifying against real data, not guessing). If ambiguous
    (multiple candidates, e.g. two same-team same-position same-last-name
    players) or no match at all, leave the name abbreviated and list it in
    the summary rather than inventing a full name from memory — Boone/Smyth
    had 14 such names, all deep-bench (rank 200+), listed to the user rather
    than guessed. The user can then also fix any of these directly by
    right-clicking the correctly-named player in the Rankings Manager table
    and using "merge near matches" (see Rankings Manager architecture below)
    instead of re-running this whole conversion.
  - Verify the final CSV against the real parser before handing it over:
    `node -e '...eval(fs.readFileSync("shared.js")); parseRankings(csv)...'`
    — check `warnings.length === 0` and a sane position breakdown. This
    caught nothing wrong for Boone/Smyth but is cheap insurance every time.
  - Drop K/DST rows, same as every other ranking import (see CSV parser notes
    in the ADP section above) — this project's league has none.

## Testing
**`test.js` is a real, committed regression suite now (added in the
Stage 2 audit, 2026-08-23)** — `node test.js`, 56 checks, no dependencies,
no build step. Earlier notes in this file referenced `test.js`/`widget-test.js`/
`flag-test.js`/`merge-test-final.js` as never having been committed; that's
still true of the other three, but `test.js` itself is real now and should be
run after any change to `shared.js`, especially `parseRankings`,
`buildConsensus`, or `median`. It loads `shared.js` (plus `rankings.js` /
`fp-rankings.js`) via Node's `vm` module as a classic script, the same way the
extension itself loads it — so it only tests what actually ships. Deliberately
not a coverage sweep; it covers what has actually broken in this project's
history (three separate real parser bugs, `median`'s numeric-string bug, the
position-only isolation fix, the value-comparison sign convention) plus what
the Stage 1 audit found being silently accepted (garbage CSV imports). See the
file's own header comment and `AUDIT.md` §11a for the full reasoning,
including why it leans on the real bundled rankings data rather than
synthetic fixtures — this project's own tiering-rewrite failure (a synthetic
simulation passed, real data didn't) is the cautionary tale behind that
choice.
- `test-fp-parse.js` / `test-fp-parse2.js` — **deleted** in the Stage 2 audit
  (batch 1). They were broken one-offs (hardcoded a path that no longer
  exists, and `test-fp-parse.js` called `.length` on `parseRankings()`'s
  `{players, warnings}` object, so it could never have printed a correct
  count) and a tracked `test-*.js` file implied a suite that didn't exist.
- Verification during this project has otherwise mostly been: (a) real
  unpacked-extension testing by the user against live/mock Sleeper drafts,
  (b) for grid/layout bugs specifically, an isolated static-HTML harness
  measured via `getBoundingClientRect()` (see "Design & alignment lessons"),
  and (c), new in the Stage 2 audit, loading the real `panel.html`/
  `rankings-manager.html` against a stubbed `chrome.storage` served over
  `python3 -m http.server`, for verifying actual rendered DOM/attributes
  (used to confirm the escaping fixes and the render-guard recovery path).
- Mock drafts (bot-filled) work identically to real drafts for API purposes and
  pick much faster — good for stress-testing polling/matching logic.
- **The single-window icon-click/focus behavior has now been indirectly
  verified**: a real ten-minute poll test (see "Engineering audit" above)
  confirmed the poll counter kept advancing at the full ~3s rate the whole
  time, which rules out Chrome throttling this window's timers while it's
  occluded — the scenario that behavior test was actually worried about.
  Still not directly verified: whether a click on the toolbar icon reliably
  brings the window to front on every OS/Chrome version.
- Still not verified against a real draft: the cache-expiry countdown/
  fresh-vs-cached toast against a real `Age` header over a full draft, and
  the new staleness indicator (`STALE_AFTER_S`) actually firing during a
  genuine stall rather than only in the manual test used to build it.

## Build/deployment workflow
- All edits happen directly on the local filesystem Chrome's "Load unpacked"
  already points at — a plain extension reload picks up changes immediately.
  (Earlier sessions edited in a sandboxed environment and handed over zip
  files, which caused real confusion debugging against stale code; that's why
  this project moved to Claude Code operating on the real folder directly.)
- No build step for source code. FantasyPros ECR CSV → `fp-rankings.js` is
  regenerated via `node build-fp-source.js` after replacing the source CSV.

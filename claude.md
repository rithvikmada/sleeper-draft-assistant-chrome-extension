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
  re-derive priorities from scratch; read that file. Note: some items (ADP
  endpoint, VORP) are now unblocked (see Feature backlog section below).
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

## Design language (redesigned 2026-08-24)
Imported from a Claude Design system ("4th&Go Draft Board Redesign" project):
dark ink/chalk theme with field-green undertones, deliberately not a generic
template. The board window (`panel.html`) got a complete visual redesign via
this imported system; the Rankings Manager (`rankings-manager.html`) kept the
original "turf" theme untouched.

**Board window (panel.html) — new design tokens:**
- Ink palette: near-black with green cast (`#070908`–`#C9D2CD`), 11 steps
- Chalk accent: primary gold (`#FFD84D`), from muted to bright
- Signal colors: cyan (`#22D3EE`), green (`#35D07F`), red (`#FF5A5A`), orange
  (`#FF8A3D`), violet (`#A78BFA`)
- Position colors: QB pink (`#F4527A`), RB green (`#35D07F`), WR cyan (`#22D3EE`),
  TE orange (`#FF8A3D`), FLEX gold (`#FFD84D`) — matches Sleeper's own scheme
- Typography: Chivo (sans-serif, 7 weights) for UI/labels/body, JetBrains Mono
  (monospace) for data/ranks/ADP
- Spacing: 4px base scale (space-1 through space-4), radius 3px–14px, shadows
  and edges consistent
- Icons: Lucide set (24px grid, 1.5–2px stroke, rounded caps), inlined as local
  SVG data instead of CDN-fetched to avoid network dependency mid-draft

**Rankings Manager (rankings-manager.html) — original theme unchanged:**
- Kept the existing "turf" theme (dark stadium/scoreboard look) as-is
- No redesign applied; continues to work exactly as before
- Both surfaces coexist with independent stylesheets (no shared theme.css)
- This separation was deliberate — board window needed a fresh design pass,
  manager didn't

**Design pass notes:**
The "Design & alignment lessons" section (below) noted that the board layout
should be "revisited in a future full design pass." That redesign happened
2026-08-24, imported from a premade Claude Design system rather than
hand-authored. All the grid-alignment gotchas documented there were solved
by starting fresh with semantic HTML + CSS custom properties, rather than
bolting columns onto the old grid incrementally.

New features included in the redesign:
- Best Picks cards now show position-rank tags (RB1, WR2) matching the board
- ADP Value column header (was "Value"), with original green/red diverging bar
  restored (no raw Sleeper ADP text)
- Live-ADP blink dot: small position-colored dot pulses next to the value bar
  when current pick has passed the baseline (FantasyPros) ADP — flags that the
  player should've been gone but isn't
- Position-rank tags are FIXED SLOTS (RB1, RB2, RB3...) not renumbered as
  players are drafted — gaps in the numbering show you how many were taken at
  that position
- Source icon chips now render uploaded images edge-to-edge (not inset with a
  colored border) and stay at their correct 22×19px size even with large
  intrinsic images

## Design & alignment lessons (redesign completed 2026-08-24)
The redesign work mentioned below as "should be revisited in a future full
design pass" was completed 2026-08-24 — the board window now imports design
tokens from a Claude Design system and uses semantic HTML + CSS custom properties
instead of the incremental grid-column bolting-on that caused the original
alignment issues.

**Past gotchas (for reference, now resolved):**
The old incremental ADP-columns work went through five rounds of misalignment
bugs (padding mismatch → independent `auto`-track sizing between grid containers
→ a wrapper div silently overriding alignment). These are no longer relevant
after the 2026-08-24 redesign, but documented here for understanding why a
fresh layout was needed rather than patching the old one:
- Never mix `auto`-sized grid tracks with content that's empty in one context
  and non-empty in another, across two separate grid containers. Fixed lengths
  (or matching `minmax`) are the only way to guarantee alignment.
- Eyeballing is insufficient for column alignment — verify with
  `getBoundingClientRect()` in a local test harness (`python3 -m http.server`),
  not screenshots.
- Side-panel width constraints (old: ~380px fixed panel, ~230px for content)
  no longer apply — the board runs in a user-resizable window now. Still worth
  checking actual width before adding new columns, since users can resize narrow.

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

## BEER / VBD (backlog #8, built 2026-08-25)
Built in its own worktree/branch (`feature/beer-vbd`, branched from an
up-to-date `main` that already had the audit fixes and visual redesign
merged in), per `beer-vbd-prompt.md`. Value-Based Drafting using the BEER
(man-games) baseline specifically — **not VOLS, not BEER+**. BEER+'s
risk-adjustment and QB-streaming layers, and roster-need-aware value
discounting, were explicitly kept out of this pass — see the backlog gap
logged below.

**What it is, in one line**: `value = a player's projected PPR points −
replacement-level points at their position`. Subtracting replacement level
per position is what makes the number comparable ACROSS positions — raw
projected points aren't (a QB's raw total dwarfs a TE's and says nothing
about relative value).

**Data source — reuses the existing Sleeper projections endpoint, not a new
CSV import.** `fetchSleeperProjections()` (`shared.js`) hits the exact same
`api.sleeper.app/projections/nfl/{year}` endpoint `fetchSleeperAdp()` already
calls for Sleeper Live ADP, just reading `pts_ppr` instead of `adp_ppr` off
the same response. No new host permission, no new import mechanism — this
was a deliberate philosophy match with ADP's precedent (see the ADP section
above: same domain, no auth, already investigated as low-risk), not a CSV
path built separately. `loadProjections()`/`saveProjections()` store the
result under `K_PROJ` (`beerProjections` in `chrome.storage.local`), and
`autoRefreshProjections()` runs silently on every board-window and
Rankings-Manager-tab open (logs-only on failure), same pattern as
`fetchSleeperAdp`'s manual button being a thin wrapper — `⟳ FETCH
PROJECTIONS` in the Rankings Manager calls the identical pure fetch
function, so manual and automatic paths can't drift apart.

**Replacement level — the man-games calculation, and the exact assumption
made (revisit if it looks off in practice, don't reverse-engineer it from
code later):** `computeReplacementRanks()` in `shared.js` derives
`REPLACEMENT_RANK[pos]` (how many players deep, by projection, before you
hit replacement level) from this league's real settings
(`LEAGUE_SETTINGS` — 10 teams, 1QB/2RB/2WR/1TE/2FLEX):
1. Starter slots per position = `starters[pos] × teams`, plus a share of the
   20 total FLEX slots. **FLEX_SHARE is a documented simplifying assumption,
   not derived from data**: RB 45% / WR 45% / TE 10% — full PPR flattens
   RB/WR value enough that flex usage skews roughly even between them, TE
   sees much less flex usage since a flex-worthy TE is almost always started
   outright at the TE slot instead. No authoritative real-world split exists;
   this was picked as reasonable and defensible, not exotic, per the build
   prompt's own instruction.
2. Man-games: `REPLACEMENT_RANK[pos] = ceil(starterSlots × 17 games /
   AVG_GAMES_PLAYED[pos])`. `AVG_GAMES_PLAYED` is one blended constant per
   position (QB 14, RB 11.5, WR 13.5, TE 13.5) — QBs miss the fewest games
   (least contact, backups rarely needed mid-season), RBs miss the most
   (workload + committee/injury risk), WR/TE in between. This is what
   converts "how many starters does the league need" into "how many players
   deep you actually have to draft to cover a full season" — starters alone
   undercount replacement depth since byes/injuries/in-season churn pull
   bench players into starting lineups.
   Resulting depths for this league's exact settings (locked in as a
   regression check in `test.js`): **QB13, RB43, WR37, TE16.**

**Live recompute — no new polling mechanism, reuses the existing pick-sync
plumbing exactly as the build prompt required.** `REPLACEMENT_RANK[pos]`
itself is a static depth (a function of league shape, which doesn't change
mid-draft) — what's live is WHICH player sits at that depth.
`buildBeerValues(rows, projMap, takenKeySet)` (`shared.js`) sorts each
position's still-AVAILABLE players by projection, takes the
`REPLACEMENT_RANK[pos]`-th one's points as replacement level, and computes
every player's value against that. As players at a position get drafted off
the top, the player occupying that Nth-deepest available slot gets worse,
degrading replacement level (and therefore raising the value of everyone
still available there) in real time. This is called fresh inside `renderBest()`
(panel.js) and `renderTable()` (rankings-manager.js) on every render — both
already re-render on every poll cycle and on every `K_DRAFT` storage change,
so BEER values update on the same cadence live picks do, with zero new
timers. Verified with a Node simulation in `test.js` (drafting the top 5 QBs
off a synthetic 50-QB pool measurably raises QB6's value, matching "the best
available replacement gets worse as players at that position get drafted"
from the build prompt) before shipping.

**Where it surfaces in the UI:**
- **BEST QB/RB/WR/TE grid (`renderBest()`, panel.js)** — each of the four
  cards now shows that position's highest-value available player (not
  highest consensus rank — a deliberate decision, see below), with the value
  number (`BEER +N.N`) on the card. Whichever ONE of the four cards has the
  single highest value across all four gets an "On tap" pill (a light beer
  pun — deliberate, see below) plus a matching gradient ring around the
  card — that's "the objective best pick right now, any position," answered
  by comparing the grid's own four already-chosen players against each other
  rather than needing a second, differently-sorted widget.
  **Went through three design passes, all logged here on purpose:**
  1. First version used a lightning-bolt icon on the label — replaced
     (2026-08-25) with a plain "Top pick" pill + solid accent border,
     cleaner and more in line with the design system's restraint; the icon
     read as more decoration than signal.
  2. Made a little more fun on direct request (2026-08-25): the flat accent
     border became a slow (6s) animated gradient ring (golden/amber tones, a
     light nod to the BEER name), and the pill's label changed from "Top
     pick" to "On tap" — leans into the beer pun without undercutting that
     BEER is a real statistical methodology, not a gimmick.
  3. **Walked back to flat/static (2026-08-25, same day) — direct user
     feedback that the shimmer was pulling their eye back to that spot for
     the majority of the draft**, the opposite of what a passive status
     indicator should do. `.quadCellBest` is back to a plain solid accent
     border with zero animation, and `.topPickTag`'s background is a flat
     muted tint (`var(--chalk-a12)`), not a moving gradient — no motion
     anywhere in the everyday "On tap" state now. **The "On tap" wording
     stayed** (that was liked) — only the motion was the problem, not the
     pun. The rare "Last call" state (see below) intentionally KEPT its
     shimmer/glow/pop animation — the reasoning inverted: a passive "this is
     the current best pick" indicator shouldn't move, but a genuinely rare
     threshold crossing earning a beat of attention is exactly the point of
     having a rare state at all. If motion is ever reconsidered for the
     everyday state again, revisit this note first — it was a direct,
     specific complaint, not a guess.
  **This was a real design discussion, not an assumption** — see the
  reasoning below.
- **Highlight only turns on after round 6 (`HIGHLIGHT_AFTER_ROUND`,
  panel.js, 2026-08-25)** — direct feedback plus a real methodological
  point: BEER's replacement-level signal is noisiest in the opening rounds
  (little separation has developed yet at most positions — see "when should
  I use BEER" reasoning, added to this file below), so highlighting a
  crowned "best pick" off a still-unsettled number for the first several
  rounds was actively steering picks toward it before the signal was
  trustworthy. `roundsCompleted = Math.floor(lastSharedPicks.length /
  LEAGUE_SETTINGS.teams)` gates BOTH the crown (`quadCellBest`/`topPickTag`)
  and the rare state — before round 7 starts, no card gets crowned at all,
  full stop, though every card still shows its own best-by-value player and
  BEER number the whole draft; only the "which ONE is best" call is gated,
  not the underlying data. `HIGHLIGHT_AFTER_ROUND = 6` is a judgment call,
  not derived from anything — a single constant, easy to retune.
- **When should BEER actually be trusted over consensus rank? (added
  2026-08-25, as a real answer given to the user, not just code commentary)**
  BEER only knows one input — projected points — so it can't see things
  consensus rank encodes (injury risk, situation/opportunity changes, analyst
  judgment about role uncertainty). It also measures value over REPLACEMENT,
  not "best player" — a player at a scarce position can out-value a better
  player at a deep position, which is the entire point of VBD but means BEER
  and "who's just the best" aren't always the same answer. Recommended usage,
  matching why the round-6 gate above exists: lean on consensus/tier in the
  opening rounds where analyst judgment about risk matters most and BEER has
  the least separation to work with; lean on BEER as a tie-breaker within a
  tier/position, for cross-position value calls, and for spotting a position
  about to dry up — the scenarios it's actually built for. If BEER disagrees
  with consensus by several rounds' worth of rank early in a draft, that's
  more likely unpriced risk than a hidden gem.
- **"Last call" rare card — threshold-based, not random (reworked
  2026-08-25).** Originally a random ~1-in-12 roll on every crown change —
  **reverted** after direct feedback: a trigger with no actual meaning read
  as confusing ("is something wrong?") rather than a fun flourish, since
  there was no way to tell if it meant anything. Replaced with a real,
  deterministic check: `RARE_BEER_VALUE` (panel.js, currently `150`) is a
  judgment-call threshold for "this crowned pick's BEER value is unusually
  large" — crossing it is what triggers the warmer gradient
  (`.quadCellRare`/`.topPickTagRare`) AND a one-time toast explaining why
  ("cleared the rare threshold, worth a serious look") rather than a random
  "you found an easter egg" message. Recomputed every render (deterministic,
  no need to gate on crown-change like the old random version did), but only
  toasts on the false→true transition (`rareAlerted` flag) so it doesn't
  re-fire every ~3s poll tick while the same activation is still ongoing.
  `RARE_BEER_VALUE` is a rough guess, not derived from real draft data yet —
  tune it up/down once it's been seen against a live draft; if it never
  fires, it's too high, if it fires on every pick, too low.
- **One explanatory tooltip, exactly once, not repeated per surface**
  (2026-08-25) — a small "i" info-dot (`.infoDot`/`.infoPop`, panel.html)
  sits next to a "Best by position · BEER" label above the grid. Hovering
  (or focusing, for keyboard users) shows a one-sentence explanation of what
  BEER value means and how to use it ("draft whichever card has the highest
  number for the position you need"), plus a "Learn more about VBD" link out
  to the VBD-cheat-sheet article the user supplied when scoping this build.
  Deliberately placed ONCE, here, rather than on every card or duplicated in
  the Rankings Manager — the manager's VALUE column header already has its
  own native `title=""` hover text explaining the metric in the same spot
  every other column header's tooltip lives, which is a different,
  lower-ceremony UI pattern and wasn't touched.
- **VALUE column in the Rankings Manager table (`renderTable()`,
  rankings-manager.js)**, sortable by clicking the column header
  (`sortByValue` toggle) — the first sortable column this table has ever
  had. Rows without a computed value (no projection data for that player)
  sort to the bottom rather than being treated as 0, which would otherwise
  rank an unknown player above a legitimately low-value one.
- **"Best Picks Right Now" (the top-3 card widget) was deliberately left
  alone** — still sorted by consensus rank, unchanged. This was a direct
  user call after walking through what each widget's job actually is (see
  below) — not an oversight.

**Why the BEST grid changed and Best Picks didn't — the actual reasoning,
worth preserving since it's not obvious from the code alone.** VBD's whole
value is that it IS cross-position comparable, so it can answer two
different questions:
  - "What's the single best pick, any position, right now" — sort the WHOLE
    available pool by value, take #1. This is what "Best Picks Right Now"
    already conceptually does (a single ranked top-3), just currently by
    consensus rank instead of value.
  - "What's my best option if I specifically want position X" — sort WITHIN
    that position by value. This is structurally what the BEST QB/RB/WR/TE
    grid is FOR — it can never itself answer the first question, since it's
    position-scoped by construction.
  A first proposal was a toggle mode on Best Picks (rank-sorted vs.
  value-sorted) — rejected by the user in favor of upgrading the BEST grid
  instead (each card picks by value, one card highlighted as the objective
  overall best), since that answers both questions from one already-existing
  widget without adding a second value-sorted list elsewhere. If Best Picks
  Right Now ever needs a value-sorted mode later, that's a distinct, smaller
  follow-up — not implied or half-built by this change.

**Known gap, logged as a new backlog item, not silently accepted (per the
build prompt's explicit instruction) — plain BEER is team-agnostic by
definition, not by a limitation of this build.** It has no idea what's
already on your roster: it won't discount a RB's value because you already
drafted three RBs. That's a separate layer (closer to what "BEER+"-style
enhancements or roster-need-adjusted VBD would add), deliberately out of
scope for this pass. The team-counts widget already tracks roster
composition and could feed such a layer later. See the new backlog entry
below (**BEER+-parity gap**).

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
- **#8 (VORP/VBD) — BUILT (2026-08-25), as plain BEER specifically (not
  VOLS, not BEER+).** See the new "BEER / VBD" section above for the full
  writeup: replacement level via man-games on this league's real settings,
  live recompute off the existing pick-sync plumbing, the BEST grid's
  per-position value + single objective-best highlight, and the Rankings
  Manager's new sortable VALUE column. **#16 (true value-cliff tiering) is
  still separate and NOT built** — BEER gives a continuous value number per
  player, not tier boundaries; #16 would still need the windowed/clustering
  tiering approach flagged (not attempted) back in the source-vote-boundary
  revert above.
- **BEER+-parity gap — partially addressed (2026-08-25), narrowly.** Plain
  BEER's actual VALUE numbers (cards, manager table) are still fully
  team-agnostic on purpose — that's the pure, inspectable methodology, and
  it stays untouched. What changed: the BEST grid's crown ("On tap" — which
  ONE card gets highlighted as the objective best pick) now factors in
  roster need, because leaving it pure BEER meant the crown landed on RB
  almost every single render (RB's deep 43-player replacement pool tends to
  produce bigger raw value gaps than other positions, independent of how
  many RBs you already have) — direct feedback was that reading "take an RB"
  over and over nudges bad roster-construction decisions. `TEAM_TARGET_SLOTS`
  + `crownNeedMultiplier()` (panel.js) discount a position's CROWN-SELECTION
  score (not its displayed value) by `0.6^(draftedCount - target)` once
  you're past a rough target depth for that position — a soft discount, not
  a hard cutoff, so an exceptional value can still win if it's big enough to
  overcome the discount. See the "BEER / VBD" section above for
  `TEAM_TARGET_SLOTS`'s exact numbers and reasoning.
  **Still NOT built, still a real gap**: the actual VALUE column/card
  numbers everywhere else stay roster-agnostic, and there's still no
  risk-adjustment or QB-streaming layer. Both are BEER+-style enhancements,
  explicitly out of scope per the #8 build's own prompt — the crown change
  above is a narrow, UI-selection-only exception to that, not a reversal of
  it.
- **#13 (positional rank vs. league-mates) — BUILT (2026-08-25), both the
  per-position slice AND the overall team-grade rollup (added same day,
  slightly later — see the end of this entry).**
  `buildTeamPositionRanks(picks, beerValues)` (shared.js) groups
  every drafted player by which roster took them, sums each team's BEER
  value per position, and ranks all 10 teams against each other.
  **UI (`.posRankPill`, panel.html/panel.js) — fused two-row pill, chosen
  over three other mocked-up variants (a separate rank circle below the
  badge, a corner-overlapping notification-style chip, and a thin
  color-only bar with no number) after the user reviewed all four**: the
  top row is the exact same position-count badge as before ("QB 1"), the
  bottom row is a thin strip showing the ordinal rank ("4TH") on a
  continuous green (1st) → yellow-green → orange → red (last) gradient,
  computed by `rankColor()` (panel.js, 4 hand-picked RGB stops, lerped
  between whichever two straddle this rank — a straight HSL hue sweep was
  avoided because its midpoint washes out into a hard-to-read olive/brown).
  Only appears once the team has actually drafted someone at that position
  (a "1st of 10" tie at zero players everywhere would be meaningless noise)
  — falls back to the plain badge with no rank strip until then.
  **Deliberately live, not a snapshot at pick time**: every player is valued
  against the CURRENT replacement level (same `beerValues` map the rest of
  the board uses), so your rank at a position can shift even with no new
  picks there — matching the same "live" philosophy as the rest of BEER,
  and a direct choice over grading each pick at the moment it was made (that
  would answer a different question — "was that a good pick then" — and
  was explicitly not what was asked for; log a new backlog item if that's
  wanted later, don't fold it into this one).
  **Sum of every drafted player's value at a position (not just the best
  starter)** was chosen deliberately, same reasoning as the man-games
  replacement calc itself: rewards depth, doesn't require guessing who's a
  "starter" at any given moment.
  **The rank denominator ("of N") counts every team seen anywhere in
  picks, even ones with zero players at that specific position** — a team
  with no RBs yet still occupies (and typically holds down) a real rank
  slot there, rather than being excluded from the count entirely, which
  would otherwise make "of N" shrink and grow confusingly position to
  position.
  **Team identity for grouping uses each pick's OWN `rosterId`** (added to
  every recorded pick in `poll()`, panel.js — `roster_id` preferred,
  `draft_slot` as fallback, matching the exact same acceptance the existing
  "is this pick mine" check already used, since Sleeper populates these
  differently across real vs. mock drafts) — but "which team is MINE" is
  resolved by finding the `rosterId` on one of the picks already flagged
  `byMe`, not by comparing `myRosterId` directly against a `rosterId` key.
  Those two are usually the same team, but `myRosterId` itself is checked
  against EITHER `roster_id` OR `draft_slot` when a pick is first tagged
  "mine," while `rosterId` always prefers `roster_id` — an edge case where
  they disagree is possible, and this sidesteps it rather than assuming.
  **Overall team grade rollup — BUILT as a same-day follow-up.**
  `buildTeamOverallRanks(picks, beerValues)` (shared.js) sums a team's BEER
  value across EVERY drafted player, any position, and ranks all teams
  against that one number. **No position-weighting scheme was needed, and
  that's not a shortcut** — a player's BEER value is already normalized to
  replacement level AT THEIR OWN POSITION (that's the entire point of VBD:
  it makes value comparable across positions), so summing raw values across
  positions is a real combined number, not an arbitrary blend the way
  averaging ranks would be. Surfaces as the same fused pill design as the
  per-position ranks, just neutral-toned (`.posRankPill.t-neutral`) since
  it isn't any one position's color — replaces the old plain "Tot N" badge
  in the board's "My team" widget with a "Tot N" pill + rank strip, same
  gradient. If bench-depth discounting or some other weighting is ever
  wanted on top of this, that's a deliberate future change, not something
  half-built here — this is a straight, unweighted sum.
- **Stats/projections board columns — BUILT (2026-08-24).** See "Stat
  columns" section below for the full design/data/UI writeup. Originally
  scoped as one PROJ + one position-conditional stat; grew through the same
  session into a 5-group, 15-column, animated, position-colored system per
  direct user iteration.
- **#14 (manual refresh button value)** — still an open question; the
  cache-expiry countdown may make the button redundant.
- Everything else (weighted sources, league-specific scoring) is unstarted;
  read the backlog file for the actual sequencing reasoning before picking
  one up.

## Stat columns (added 2026-08-24)
The board's tiered rows now show a stat block between Player and ADP Value —
built in one session, iterated heavily against direct user feedback. Read
this before touching any of it; several early designs were explicitly
rejected in favor of what's here now.

**Data — two Sleeper endpoints, not one.** `fetchSleeperStatsPlayers()`
(`shared.js`) pulls from:
- Current-year `/v1/projections/nfl/{year}` (same endpoint `fetchSleeperAdp()`
  already used for ADP) — used ONLY for the pinned BASIC group now (`pts_ppr`
  + `p.player.years_exp`), since that's the one forward-looking forecast in
  the whole block.
- Prior-year `/v1/stats/nfl/{year-1}` — a **second, separate endpoint**,
  same domain/no-auth/no new permission, discovered specifically for this
  feature. Every QB/RB/WR/TE stat (see below) is computed from this
  endpoint's raw counts (`gp`, `pass_att`, `pass_sack`, `rush_att`,
  `rush_yd`, `rec`, `rec_tgt`, `rec_yd`, `off_snp`, `tm_off_snp`) as a
  PRIOR-SEASON per-game or per-snap RATE — an established usage profile,
  not a single-season point estimate the way BASIC's PROJ is.
- **`tm_off_snp` (team offensive snap total) is already a precomputed field
  on every player row** — unlike targets, no separate team-total
  aggregation pass is needed for TE's snap-share stat.

**Which stats, and why — final set is user-specified, not research-derived
(2026-08-24, replacing an earlier PASS/RUSH/TGT%/etc set built from
correlation research):**
- **BASIC** (pinned, always first, same 3 stats for every position): EXP
  (years of NFL experience), PROJ (season-long projected fantasy points),
  P/WK (PROJ ÷ 17). Unchanged from the original design.
- **QB**: RU/G (rushing yards/game) + AT/G (pass attempts/game) + FPDB
  (fantasy points per dropback, PPR).
- **RB**: RC/G (receptions/game) + SN/G (offensive snaps/game) + AT/G (rush
  attempts/game).
- **WR**: TG/G (targets/game) + TPS (targets per offensive snap) + YPS
  (receiving yards per offensive snap).
- **TE**: TG/G (targets/game) + SNP% (offensive snap share) + YPS
  (receiving yards per offensive snap).
- **5 of the original 12 user-requested stats needed route-run data Sleeper's
  API doesn't have anywhere** (routes/game, targets per route run, yards per
  route run, route participation) — confirmed by dumping all 129 fields on a
  real player and finding no route/routes/dropback key at all. Rather than
  drop them or fake the numbers, **offensive snaps substitute for routes
  throughout** (SN/G, TPS, YPS, SNP%) — a real, available signal, though not
  literally the same thing (a blocking down is a snap but not a route).
  "Dropbacks" for QB's FPDB is similarly approximated as `pass_att +
  pass_sack`, the standard definition when no play-by-play dropback count
  exists. Every substitution is spelled out in its own `full` tooltip text in
  `fetchSleeperStatsPlayers` (`shared.js`), not just silently relabeled as if
  it were the literal requested stat — if the user ever gets access to real
  route data (a paid provider), these are the fields to replace.
- All label/tooltip text lives in `STAT_META` (`shared.js`) — the single
  source of truth for what the header shows AND what
  `fetchSleeperStatsPlayers()` actually populates. Don't add/rename a stat
  in one place without the other; `STAT_LABELS` is derived FROM `STAT_META`
  specifically so they can't drift.

**Percentile color-coding was tried and reverted.** Each stat's percentile
(`pct`, still computed and stored, just unused for color right now) was
originally used to color the row's number green/gold/gray — user feedback:
"looks too green," not a useful signal at a glance. Numbers are now plain
white (`var(--text-primary)`) always. If per-stat coloring is wanted again,
it needs a less saturated palette or a different visual treatment (e.g. a
separate small badge) — don't just flip the color back on `.statCol` text,
that's the exact thing that was rejected.

**Layout: 5 fixed-DOM-order groups (BASIC, QB, RB, WR, TE), positioned via
CSS transform — not `order`, not real DOM reordering.** Every row (and the
header) always renders all 5 groups × 3 stats = 15 columns. A row only has
real values under BASIC and its OWN position's group; the other 3 position
groups show empty placeholders (`–`) — this is what lets the label live in
the (position-colored) column header instead of repeating on every row.
`STAT_GROUP_SEQUENCE` in `shared.js` is the DOM order and never changes;
each group's *visual* slot comes from an inline `translateX(slot * 134px)`
set from `statGroupOrder(selectedPos)`. This split (fixed DOM, transform-
driven visual position) is why the reorder can animate:

**Selecting a player slides that position's group to slot 1 (right after
BASIC) — this only works because reordering does NOT call `renderBoard()`.**
A full render rebuilds every row's HTML from scratch, which means brand-new
DOM nodes with no prior `transform` to animate from — a CSS `transition`
can't animate a value that was never anything else. `applyStatGroupOrder()`
instead walks the ALREADY-RENDERED `.statGroup`/`.statHeadGroup` elements
(header + every visible row) and just updates their `transform` style in
place, so the existing `transition: transform 220ms` on those elements
actually plays. Any future change to this reorder behavior must keep going
through `applyStatGroupOrder()`, not a `renderBoard()` call, or the slide
silently stops working (still ends up in the right place, just teleports
instead of animating — an easy regression to miss since nothing looks
"broken," it just loses the polish).
- Default order (no selection): BASIC, WR, RB, QB, TE — user's stated
  preference for which position to see first.
- Click a row → deselect+reselect logic lives in `panel.js`'s `$("board")`
  click handler, tracked by **exact player key** (`selectedStatPlayerKey`),
  not just position — clicking the SAME player again deselects (back to
  default order); clicking a DIFFERENT player switches to their position.
  This must stay key-based: switching to position-based tracking would make
  clicking a second player at the same position a no-op deselect, which
  isn't what was asked for.
- The clicked row also gets a persistent `.selected` class (same background
  as `.row2:hover`, so it looks like "still hovered") that does NOT clear on
  mouseout — only on clicking that same row again, or the player getting
  drafted. The drafted-clears-selection check runs at the top of every
  `renderBoard()` call (`taken`/`manualTaken` lookup), not just the poll
  path, so a manual crossout or a pick applied from the Rankings Manager tab
  both correctly clear it too.

**Column-header tooltip is a custom element, not `title=""`.** Hovering a
stat label shows a small themed floating box (`.statTooltip`,
`showStatTooltip`/`hideStatTooltip` in `panel.js`) built specifically
because the native browser tooltip has its own built-in show delay and
can't be styled to match the board. Full name + unit text lives in
`STAT_META`, read via each header span's `data-full` attribute — deliberately
NOT the `title` attribute, which would bring back the native tooltip. This
tooltip only appears on the header labels, not on row values — an earlier
version put `title` on every row cell too and that was explicitly walked
back as not wanted.

**Alignment gotcha, already fixed, don't reintroduce:** header labels use
`text-align:center`; if a future edit adds a stat cell without matching
`text-align:center` (and matching width) on `.statCol`, header and row
values will visibly drift out of column alignment — this exact bug shipped
once and was reported as "misaligned really badly." Verify any layout change
here with `getBoundingClientRect()` on both a header label and a row value
in the same column, not by eyeballing a screenshot (same lesson as the
older "Design & alignment lessons" section above, for the same reason).

**Auto-fetch on load, not just the manual buttons.** `autoRefreshAdpAndStats()`
(`shared.js`) runs on every board-window and Rankings-Manager-tab open
(silent, logs-only on failure), fetching fresh Sleeper Live ADP + stat data
in the background without blocking the initial render. The manual
"⟳ FETCH SLEEPER ADP" / "⟳ FETCH STATS" buttons in the Rankings Manager are
now thin UI wrappers (disabled/text-swap + toast) around the exact same
pure fetch functions (`fetchSleeperAdpPlayers`/`fetchSleeperStatsPlayers`,
`shared.js`) — manual and automatic paths can't drift apart because there's
only one implementation of the actual fetch/parse logic.

**Window default width was widened, then explicitly set back down.** It
went 1000 → 1200 → 1500 → 1650px as the stat block grew (one column, then
12, then 15 with BASIC), then the user gave an exact window size they were
actually using and asked for that as the default — landed at 1280×970
(`background.js`). The stat block itself doesn't strictly need 1280px+ to
render correctly, it just leaves less slack in the name column at that
width. **Don't re-widen `DEFAULT_BOUNDS` to "fit the stat block better"
without asking first** — the current value is a stated preference, not a
layout bug.

**Stat picker (added 2026-08-24) — every stat is now selectable, per
position, not fixed at 3.** User wanted to choose between the original
correlation-research set (PASS/RUSH/TGT%/AIR/RZ/ATT/REC — current-year
projections + prior-year role stats) and the later per-game/per-snap set
(RU/G/TG/G/SNP%/etc), rather than the extension picking one "final" answer.
- **`STAT_OPTION_DEFS` (`shared.js`) is now the single source of truth** —
  6 entries per position (3 old + 3 new), each with a stable `id`, `label`,
  and `full` tooltip text. `fetchSleeperStatsPlayers()` computes ALL 6 per
  position for every player, always, regardless of what's currently shown —
  the picker only changes what `renderStatGroups` reads, never triggers a
  re-fetch. `players[key].options` is a `{id: {label,value,pct,display,full}}`
  map (replacing the old fixed 3-entry `.stats` array); `.basic` is
  unchanged (BASIC isn't user-configurable).
- **Bringing back the old set meant re-adding `buildTeamTargetTotals()`**
  (target share's denominator) and the current-year `pass_yd`/`rush_yd`/
  `rush_att`/`rec` projection fields — both were deleted in the prior
  session when the per-game set replaced the old one outright. Worth
  knowing if a future session sees them and wonders why they're back.
- **Selection is a real user preference, `K_STAT_PREFS` (`statColumnPrefs`
  in storage)**, defaulting to `DEFAULT_VISIBLE_STATS` — explicitly the
  per-game/per-snap set, i.e. "leave what we have now as default," per
  direct instruction. `loadStatPrefs()` also strips any id that isn't a
  real `STAT_OPTION_DEFS` entry, so a stale/hand-edited storage value can't
  silently blank out a whole group.
- **Column widths are no longer a fixed 134px/group — they're computed from
  however many stats are actually selected** (`statGroupLayout` in
  shared.js: `count * 42px + 8px padding`, 0 if nothing's selected for that
  position). This is why `.statBlock`/`#colHead .c-stat` no longer carry a
  CSS width at all — it's set inline by `panel.js`'s `renderBoard()` on
  every render, and reused by `applyStatGroupOrder()`'s reorder-in-place
  path (which changes offsets, never widths, since a stat-picker change
  goes through a full `renderBoard()` instead — different columns need
  different HTML, not just repositioning).
- **The picker itself (`#statPickerBtn`/`#statPickerPanel`) is a themed
  floating checkbox grid**, same pattern as the existing flag menu — 4
  columns (one per position), 6 checkboxes each, toggling
  `visibleStats[pos]` directly and persisting on every change. **Gotcha
  that shipped once and was caught in testing, don't reintroduce it:**
  giving `.statPickerPanel` an unconditional `display: grid` means that
  rule beats the browser's own `[hidden] { display: none }` UA rule (equal
  specificity, author style wins), so the panel never actually hid via the
  `hidden` attribute alone — fixed with an explicit
  `.statPickerPanel[hidden] { display: none }` override. Any future
  `hidden`-attribute-driven show/hide element needs the same explicit
  override if its visible state sets `display` to anything other than
  `block`.

## Board UI polish batch (2026-08-25)
A batch of small board-window (`panel.html`/`panel.js`) requests, done together:
- **Light mode** — `html[data-theme="light"]` in `panel.html` is a straight
  token swap of the same ink/text/surface/border custom properties dark mode
  already defines (signal colors, position colors, spacing/type scale are
  untouched). Toggled via the new sun/moon button in the header
  (`themeToggleBtn`/`applyTheme()` in `panel.js`), persisted to
  `chrome.storage.local` under `K_THEME` (`boardTheme`), applied to
  `<html>` (not `<body>`) so it's set before first paint.
- **Status dropdown** — a new header button (`statusBtn`/`#statusPanel`,
  `renderStatusPanel()` in `panel.js`) shows the current Sleeper sync line
  plus a "when was each enabled source last imported" list (ranking sources
  + ADP sources together), each flagged stale past 24h
  (`SOURCE_STALE_MS`). Purely a glance aid — doesn't drive any other
  behavior. Same floating-dropdown mechanics as Settings below.
- **Settings is a floating dropdown now, not a full-header drawer.**
  `#settingsPanel` used to be an inline block that pushed the whole header
  open at its full width (a real complaint — "settings opens up the full
  width of the viewport"). It's now `position:fixed`, a fixed 304px width,
  anchored under `#settingsBtn` on open via `getBoundingClientRect`
  (`openSettingsPanel()`/`closeSettingsPanel()`/`positionFloatingPanel()`),
  closes on outside click, and only one of Settings/Status is open at a
  time. `startPolling()`/`stopPolling()` now call these helpers instead of
  toggling `.collapsed`/`.on` directly.
- **Draft actions / Double-click-to-draft are real toggle switches now**,
  not text-swapping "On"/"Off" chip buttons — `.switchTrack`/`.switchThumb`
  CSS in `panel.html`, `role="switch"`/`aria-checked` wired in
  `panel.js`. These are settings; a switch reads as a setting at a glance
  where a button that changes its own label didn't.
  **Sleeper token instructions clarified** — the info popover
  (`sleeperTokenInfo` click handler) now explicitly says to capture the
  GraphQL request from a Sleeper **mock draft tab** in the browser, not from
  this extension's own board window (which has no GraphQL traffic of its
  own to capture).
- **Removed the "Sleeper live sync · Full PPR" text** next to the logo — was
  static, non-interactive, and redundant with the status line already below
  it.
- **Position-filtering the board now also defaults the stat-group order**,
  not just clicking a player. `effectiveStatPos()` in `panel.js` returns the
  explicitly-selected player's position if one is selected (still wins),
  else the current `posFilter` if it's a single position (QB/RB/WR/TE, not
  ALL/RB/WR), else null (default WR/RB/QB/TE order) — used everywhere
  `statGroupOrder(selectedStatPos)` used to be called directly. Reasoning:
  once the board is filtered to one position, every visible row already has
  that position's own group as the only one with real data, so clicking a
  row to bring it forward would mostly be a no-op anyway.
- **Left position-color bar restored** — an early version of this project
  had one before dots/squares were tried (see `sourceDotHtml`, still used
  for source icons elsewhere and NOT what this is). `.row2` now gets a 3px
  `border-left` colored via `data-pos` attribute (`--pos-qb`/`--pos-rb`/
  `--pos-wr`/`--pos-te`), replacing `.row2.mine`'s old `box-shadow: inset 2px
  0 0 var(--accent)` (which would've collided with a border-based bar) —
  `.mine` now only tints the row background, the position color owns the
  left edge unconditionally. Row `padding-left` dropped from 16px to 13px so
  border(3px)+padding(13px) still lines up with `#colHead`'s 16px padding.

## Team/Roster dropdown (added 2026-08-25)
A read-only "what does my whole team look like" popover in the board window,
mocked up first as a published Artifact (three directions shown, then merged
per direct feedback) before any code was written — worth repeating that
process for the next big UI addition, it caught several preferences (draft
pick vs. BEER value, continuous list vs. grouped sections, chip style) before
any implementation cost was spent.

- **Deliberately built as `.queuePopover`'s sibling, not a separate design.**
  User feedback was explicit: the Roster and Sleeper queue popovers should
  read as one family, not two things built separately and bolted together.
  `#rosterPopover` carries BOTH `class="queuePopover rosterPopover"` — the
  first class supplies the shared chrome (position/width/padding/shadow/
  border), `.rosterPopover` only adds what's actually different (a summary
  strip, grid-layout rows instead of flex rows, no drag/draft/remove
  actions since this is read-only review). The header line also literally
  reuses `.queueHeader` rather than a separate styled header. Any future
  third "family member" popover should follow this same pattern — add the
  base class, only write CSS for the actual deltas.
- **Roster button lives in `#filters`, directly next to `Queue ▾`** (Stats ▾
  → Roster ▾ → Queue ▾) — moved there from next to `#teamCounts` after
  direct feedback that the two related dropdowns should sit together.
  Always visible (not gated behind Draft actions like Queue is), since
  roster review isn't tied to the experimental queue/draft-write feature.
- **The "Your turn"/"Your turn in N picks" badge moved from the header's
  status line to sit directly above `#filters`** (`#turnBadgeRow`, panel.html)
  — right above the row of buttons you're about to act on, instead of up in
  a status line that's easy to scroll past mid-draft.
- **One continuous list, ordered by lineup slot** (QB, RB, RB, WR, WR, TE,
  FLEX, FLEX, then bench) — not grouped by position with section headers.
  An early version grouped by position (borrowing the Rankings Manager's own
  layout); direct feedback reverted it back to one flat list, matching how
  the Sleeper roster screenshot that inspired this reads. Each row still
  carries its own position chip (`slotChipHtml()`, panel.js) so position is
  visible without a section header doing that job.
- **Real roster size comes from the draft itself, not a guessed constant.**
  `fetchDraftSettings(draftId)` (panel.js) hits `GET /v1/draft/{id}` — a
  separate, cheap Sleeper endpoint (same domain, already covered by the
  existing `api.sleeper.app` host permission) returning a `settings` object
  with this draft's real per-position slot counts (`slots_qb`/`slots_rb`/
  `slots_wr`/`slots_te`/`slots_flex`/`slots_bn`). Fetched once per draftId
  inside `poll()` (fire-and-forget, guarded by `draftSettingsForId` so it
  doesn't refetch every ~3s tick) and fed into `buildMyRosterSlots()` via
  `rosterSlotCount()`, which falls back to `LEAGUE_SETTINGS`/a flat
  `ROSTER_BENCH_SLOTS = 6` guess before the fetch resolves or if a field is
  ever missing. This exists because the guess was wrong in practice — a real
  15-man league needed 7 bench slots, not 6 — and Sleeper's draft object
  already carries the authoritative number (the same template Sleeper's own
  roster board pre-builds once a draft starts), so there was no reason to
  keep guessing. K/DST slot counts in that response are ignored even when
  present, matching this app's blanket no-K/DST handling everywhere else —
  showing a K/DST slot with no picks that could ever fill it would just be
  clutter, not useful information.
- **Draft pick shows as round.pick** (`formatDraftPick()`, e.g. `"3.02"`),
  **not the BEER value** — direct preference, this is a roster-review
  surface, not another value ranking. The subtitle underneath it is each
  player's **position rank** (`"WR 49"`, via the same `computePosRanks()`
  Best Picks' "RB1"/"WR2" tags already use — not a separate computation),
  not a spelled-out "Round 3, Pick 2" explainer. Direct feedback: the
  explainer was redundant once you already know what round.pick notation
  means, and position rank is what actually answers "did I get my WR10 or
  my WR40," which the pick number alone can't.
- **Player headshots + team logos, via Sleeper's own CDN — no new fetch, no
  manifest change.** `avatarHtml(key, name, pos, team, size)` (panel.js,
  shared by both this popover and the Sleeper queue popover — see below)
  looks up `sleeperIds[key]` (Sleeper's numeric player_id — already fetched
  for the queue/draft-write feature off the projections endpoint,
  `fetchSleeperPlayerIdMap()` in shared.js) and builds
  `sleepercdn.com/content/nfl/players/thumb/{id}.jpg` for the headshot,
  `sleepercdn.com/images/team_logos/nfl/{team-lowercased}.png` for the team
  badge (confirmed against real responses — logo files use lowercase
  3-letter codes, e.g. `min.png`, `was.png` not `wsh.png`). **No
  `manifest.json` change was needed for either** — these render as plain
  CSS `background-image` on a `<div>`, and MV3's default CSP only restricts
  `script-src`/`object-src`, not image loading. Falls back to initials /
  plain team-abbreviation text when a player has no matched Sleeper ID or
  team on file (an unmatched player, or a free agent).
- **The Sleeper queue popover got the same avatar treatment on direct
  follow-up request** (`renderSleeperQueuePopover`, panel.js) — same
  `avatarHtml()` call, just a smaller `.avatarCircle.sm`/`.avatarBadge`
  variant sized for the queue's tighter 40px rows. This is the reason
  `avatarHtml()` is a standalone helper rather than inlined in
  `renderRosterPopover` — built once, reused, so the two popovers' avatars
  can't visually drift apart the way two independent inline implementations
  would.
- **Rank-strip numbers were reported as "too big" — root cause was an actual
  CSS bug, not just a sizing preference.** The summary strip's per-position
  rank tags (`"2ND"`, `"10TH"`) were built with `class="prpRank"`, which only
  gets its small size from `.posRankPill .prpRank { font-size: 8px; ... }` —
  a descendant selector requiring a `.posRankPill` ancestor that these spans
  never had, so they silently fell through to the page's default body font
  size instead. Fixed with a dedicated `.rosterRankTag` class carrying its
  own explicit sizing, not dependent on being nested inside anything else.
  Worth remembering as a general lesson: a "too big" report on something
  that was clearly styled small in the source is worth checking for an
  unmatched-selector bug before assuming it's a design-taste disagreement.
- **Starters/FLEX fill by earliest draft order**, not by BEER value —
  `buildMyRosterSlots()` sorts "mine" picks by `pickNo` ascending, fills
  each position's starter slots first, then FLEX from whoever's left among
  RB/WR/TE, then bench. This was a default judgment call (not confirmed with
  the user) — revisit if a value-aware FLEX assignment is ever wanted
  instead.

## Injury status badges (added 2026-08-25, own worktree/branch)
Mocked up first as a published Artifact (six surfaces shown in one page: the
badge/legend, tier board row, Best Picks card, BEER grid, Sleeper queue
popover, Team/Roster popover) before any code was written, same process as
the Team/Roster dropdown above — caught the CSS-specificity/tooltip-pattern
questions before implementation cost was spent.

- **Data source — one new fetch pass folded into an existing function, not a
  new endpoint.** `fetchSleeperPlayerIdMap()` (`shared.js`) already walks
  every player in the `/projections/nfl/{year}` response to build the
  `sleeperIds` map (needed for the queue/draft-write feature); it now ALSO
  reads `p.player.injury_status` / `injury_body_part` / `injury_start_date`
  off the same nested object in the same loop and returns `{ ids, injuries }`
  instead of just `ids`. No new host permission, no new HTTP request. Stored
  under a new `K_INJURIES` key (`playerInjuries`) via
  `saveInjuriesToStorage()`/`loadInjuries()`, refreshed by the same
  `autoRefreshAdpAndStats()` silent background pass (`shared.js`) both
  surfaces already call on load — manual and automatic paths can't drift
  apart because it's the same function.
- **The "actual news/reporting" idea from the original ask was deliberately
  cut, not silently dropped.** Sleeper's public projections response has
  `injury_status`/`injury_body_part`, but not the editorial story text — that's
  licensed content Sleeper doesn't expose on this (or any other) endpoint this
  extension can reach. The mockup showed a greyed-out "unavailable" placeholder
  in that tooltip slot specifically so this was a visible, informed choice
  rather than an unexplained gap — confirmed with the user before building,
  who agreed to skip it. If a future session is tempted to look for an
  `injury_notes` field: it's been checked, don't re-litigate.
- **`injuryBadge(inj, opts)`** (`shared.js`) is the single render function for
  every surface — a small colored `Q`/`D`/`O`/`IR`/etc. pill, following the
  same "one function, called from everywhere" precedent as `flagBadge()` and
  `avatarHtml()`. `INJURY_META` maps Sleeper's own status strings to a short
  code + severity bucket (`q`=gold/Questionable, `d`=orange/Doubtful,
  `o`=red/Out, `ir`=darker red/Injured Reserve, `other`=violet/everything
  else — PUP, NA, Suspended, DNR, COVID). An unrecognized status string still
  renders (3-letter clip of the raw value, `other` bucket) rather than
  vanishing — same "don't silently drop an unrecognized label" principle
  `normalizeTierLabel()` follows elsewhere in this file.
- **Two tooltip mechanisms, one per surface, matching each surface's existing
  infra — not a shared new one.** The board window has a themed hover
  tooltip system (`data-tip` + `showTip`/`hideTip` in panel.js); the Rankings
  Manager has no such infra and uses plain `title=""` everywhere (see
  `flagBadge`'s own callers). `injuryBadge(inj, { useTitle: true })` switches
  between the two — panel.js's five call sites (tier board row, Best Picks
  card, BEER grid, Sleeper queue popover, Team/Roster popover) all use the
  `data-tip` default; rankings-manager.js's row passes `useTitle: true`.
- **A real CSS-specificity bug was caught and fixed before shipping, not
  after a bug report.** `.quadCell .nm2 span` (the BEER grid's existing tier-
  chip styling, panel.html) is a two-class-plus-element selector that would
  have silently outranked a plain `.injBadge.t-q`-style selector on the BEER
  grid specifically (the one place this badge lands inside a bare `span`
  ancestor rule) — the badge would have rendered with the wrong color/font,
  looking "broken" only in that one widget. Fixed by repeating `.injBadge`
  in its own selectors (`.injBadge.injBadge.t-q`, etc.) to force a higher
  specificity than any two-class-plus-element combinator elsewhere in the
  file, verified with a throwaway stubbed-`chrome.storage` HTML harness
  (same pattern as the Stage 2 audit's escaping-fix verification) before
  removing it — screenshotted the three severity colors rendering correctly
  side by side.
- **`rankings-manager.js`/`.html` gets the badge too, lower ceremony than the
  board.** Spliced into the existing name cell right after `flagBadge()`
  (`renderTable()`, same row). Its own `.injBadge` CSS lives in `theme.css`
  (the shared "turf" stylesheet `rankings-manager.html` still uses — see the
  Design language section above for why panel.html no longer links it) using
  that theme's own token names, plus two new tokens (`--orange`, `--violet`)
  theme.css didn't previously need. No specificity conflict there — the
  manager's row markup doesn't have an equivalent bare-`span` ancestor rule.
- **Staleness surfaced in the status dropdown, same pattern as source
  freshness.** `loadInjuriesUpdatedAt()` (`shared.js`) reads `K_INJURIES`'s
  own `updatedAt`, separate from `loadInjuries()` (which every render site
  calls just for the map) so that timestamp isn't threaded through every
  badge lookup. `renderStatusPanel()` (panel.js) adds an "Injury status"
  section below "Source freshness" showing "Sleeper injury data" + a
  relative age, flagged stale past the same `SOURCE_STALE_MS` (24h) the
  ranking/ADP sources already use — this isn't a user-imported source, so it
  doesn't belong in that list, but "how old is what I'm looking at" is the
  same question either way. Direct motivation: a Questionable tag fetched
  Thursday can be stale by Sunday morning with nothing on screen saying so.
- **Tests**: `injuryBadge`/`INJURY_META` added to `test.js`'s exported-names
  list, with a new block covering: no-injury renders nothing, each severity
  bucket maps correctly (including IR staying visually distinct from Out),
  an unrecognized status still renders instead of vanishing, the
  `useTitle`/`data-tip` attribute switch, and that a status string containing
  a raw double-quote can't break out of the attribute (an escaping check,
  not an XSS fix — see the Stage 2 audit's own escaping-fix note above for
  why that distinction matters under MV3's CSP).

## Rage bait mode (added 2026-08-25)
For fun only — no signal, no effect on rankings/consensus/ADP/BEER/anything
else this tool computes. Sends a message into Sleeper's draft chat every
random few picks, and lets the user send one on demand, purely to mess with
leaguemates during a live draft.

- **An auxiliary of Draft actions, not a standalone toggle** — the settings
  block (`#rageBaitField`, `panel.html`) is hidden entirely until
  `sleeperWriteEnabled` is true, same gating pattern as `#sleeperDblClickField`.
  Turning Draft actions off also hides Rage bait mode's own controls; the
  auto-fire path (`maybeFireRageBait` in `panel.js`) independently re-checks
  `sleeperWriteReady()` at fire time too, so a stray timer state can't send
  after the fact.
- **Random trigger, not a fixed cadence** — `rageBaitNextAt` (module-level in
  `panel.js`) is set to the current pick count plus a random 10-13-pick gap
  (`rageBaitRandomGap()`), and only re-rolled after actually firing. Hooked
  into `poll()`'s existing "did new picks land" branch (right where the
  `Pick N: name` toast already fires) rather than a separate timer — no new
  polling mechanism, same as BEER's live recompute reusing the existing
  pick-sync plumbing. Deliberately NOT tied to ADP in any way — "maybe based
  off ADP" was floated as an idea when this was scoped but dropped in favor
  of a plain random gap, since this mode is explicitly not meant to carry
  real signal; keep it that way unless asked otherwise. Range was widened
  from an initial 3-7 to 10-13 picks on direct feedback (fires too often at
  the tighter gap).
- **Never fires immediately after the user's own pick** (direct requirement,
  not a guess) — a rage bait message landing right after your own pick reads
  as mocking yourself, not your leaguemates. `maybeFireRageBait(newPickTotal,
  newestWasMine)` in `panel.js` takes a second argument — whether the newest
  landed pick was the user's own (same `roster_id`/`draft_slot` vs
  `myRosterId` check `poll()` already does to flag a pick "mine," computed
  fresh at the toast call site) — and simply skips firing this cycle if so,
  **without** re-rolling `rageBaitNextAt`. That means a same-team pick only
  ever delays the fire to the very next new pick (whoever drafts next), never
  further — it's a one-pick skip, not a reset of the whole random window.
- **Message pool**: `DEFAULT_RAGE_BAIT_MESSAGES` (`shared.js`) is the built-in
  list (12 messages, user-authored wording, several with emoji) — kept
  intentionally light/needling, not actually mean, since these get sent under
  the user's own Sleeper name/identity.
- **Editor UI — moved out of Settings into a "Manage" popover (2026-08-25),
  after a mockup pass.** The first shipped version put one input-per-message
  directly inline in `#settingsPanel` (replacing an even earlier one-per-line
  textarea, which had its own problem — see below) — direct feedback: a
  dozen-plus messages made the whole Settings panel scroll uncomfortably
  long. Three layout options were mocked up as a published Artifact (a
  detached "Manage" popover, an inline wrapping chip well, and a collapsed
  disclosure) before writing any code — the popover was picked because it's
  the only one of the three that keeps full inline text editing (unlike the
  chip well, which truncates long messages) while fully getting the list out
  of Settings' own scroll height (unlike the disclosure, which still grows
  the panel when open). Settings itself now shows just one collapsed row —
  `#rageBaitMessagesField`'s `.manageRow`: a live count pill (`#rageBaitCount`)
  plus a "Manage" button (`#rageBaitManageBtn`). Clicking it opens
  `#rageBaitPopover` (`openRageBaitPopover()`/`closeRageBaitPopover()` in
  `panel.js`) — a sibling of `#rosterPopover` reusing the exact same
  `.queuePopover` base + flip-above/below-and-clamp positioning (not the
  simpler fixed-dropdown positioning Settings/Status use), since the message
  list can run long enough to need that same "flip upward near the bottom of
  the window" handling the Roster/Queue popovers already have. Inside the
  popover, the list itself is still the one-input-per-message-row editor
  (`renderRageBaitMessagesList()`, `.rbMsgRow`/`.rbMsgInput`/`.rbMsgRemove`)
  — that part didn't change, only where it lives. That per-row version
  itself replaced an even earlier one-message-per-line `<textarea>`, which
  looked broken in practice: a long message word-wraps onto a second visual
  line inside the box, reading exactly like a second, separate message even
  though it's really one line of text (a real report: "disturbance" wrapping
  to its own line looked like the pool had split mid-sentence). Persisted to
  `K_RAGEBAIT_MESSAGES` (`rageBaitMessages` in storage) — empty/unset falls
  back to the defaults (`currentRageBaitMessages()`), and a ↺ reset button
  (now in the popover header) restores them. No CSV parsing involved (unlike
  ranking/ADP imports) — this is just discrete strings, not tabular data.
- **Test button behavior is exact spec, not "pick any message":** the FIRST
  test click ever in a window session always sends "Hello, everyone!"
  (verifies the whole send pipeline with a known-good message before trusting
  it with something silly); every click after that sends a random pick from
  the current pool, same as a real auto-fire would. Tracked with a
  session-only `rageBaitTested` boolean (not persisted — resetting on window
  reopen is fine, there's no real state worth carrying across sessions here).
  This is a REAL send (goes through the same `sendRageBaitMessage()` path as
  auto-fire), not a local-only preview — same reasoning as the existing
  Sleeper connection test button testing the real tab+token path rather than
  a weaker stand-in.
- **The chat-send GraphQL mutation is now CONFIRMED (2026-08-25), via
  introspection rather than captured traffic.** The first shipped version
  guessed `create_message(object_id, message)` — untested, since there was
  no live draft-chat network traffic available to capture from while
  building this (unlike `draft_pick_player`/`update_draft_queue`, which were
  both built from real captured requests, see the big comment above
  `findSleeperDraftTab` in `background.js`). That guess was live-rejected,
  but the rejection error itself named real schema type names
  (`RootMutationType`, `Message`, `Snowflake`) — enough to run a real
  introspection query (`__type(name:"RootMutationType"){fields{...}}`) from
  a Sleeper draft tab's own DevTools console and read off `create_message`'s
  actual argument list directly, instead of guessing again. Real shape:
  `create_message(text: String, parent_type: String!, parent_id: Snowflake!,
  channel_id: Snowflake, attachment_*, ...)`, returning a `Message` with a
  `text` field (not `message` — the return-shape half of the original guess
  was also wrong). `parent_type: "draft"` + `parent_id: draftId` is what
  threads a message onto a specific draft's chat — inferred from the same
  parent_type/parent_id pattern `create_reaction`/`pin_message`/etc. use
  elsewhere in the schema for "attach this to some parent object," not
  independently confirmed by watching a real send yet. **If a real send
  still fails**: capture actual draft-chat traffic the same way
  `update_draft_queue` was originally confirmed — open a real Sleeper draft
  chat tab, DevTools → Network → filter "graphql", send a message from
  Sleeper's own UI, and diff the real request against `sleeperSendChatMessage()`
  in `background.js`.
- **UI**: settings block sits directly after the existing Sleeper Test field
  in `#settingsPanel` (`panel.html`) — a switch (`#rageBaitToggle`, same
  `.switchTrack` pattern as Double-click to draft), a messages textarea
  (`.input2.textarea`, a new CSS variant added since no textarea existed in
  `panel.html` before this — a fixed-height `.input2` doesn't fit a
  multi-line control), and a Test button + status line mirroring
  `#sleeperTestField`'s exact layout/status-class pattern
  (`testStatus`/`.ok`/`.err`).

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

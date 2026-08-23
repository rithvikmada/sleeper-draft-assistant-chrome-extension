# 4th&Go — Sleeper Draft Board — Project Context

Read this first before making any changes. This captures decisions, gotchas, and
history from the chat session where this extension was originally built, so we
don't waste time rediscovering things or accidentally reversing fixes.

## What this is
A Chrome extension (Manifest V3, side panel) that shows a personal tiered fantasy
football ranking board and auto-crosses off players as they're drafted, by polling
Sleeper's public read-only draft API.

**League format this is tuned for:** 10-team, full PPR, 1QB/2RB/2WR/1TE/2FLEX,
no K/D. This matters for future ranking/logic decisions (see backlog #4).

## File structure
- `manifest.json` — MV3 config, side panel + host permission for api.sleeper.app
- `background.js` — opens side panel on icon click, auto-detects draft ID from an
  open Sleeper draft tab (URL pattern `sleeper.com/draft/nfl/<id>`)
- `panel.html` — side panel UI shell + all CSS (dark "turf" theme)
- `panel.js` — all logic: rankings data, Sleeper polling, pick matching, rendering
- `rankings.js` — DEFAULT ranking set (356 players, tiers S→O, from user's REDRAFT-rankings.csv).
  This is a DATA file, not code. Pre-seeded into storage on first load.
- `fp-rankings.js` — FantasyPros 2026 Draft Rankings (336 players, auto-generated from CSV).
  Another DATA file that gets auto-seeded on first manager init. Format matches `rankings.js`.
- `shared.js` — MUST load FIRST (before panel.js/rankings-manager.js). Owns:
  constants (TIER_ORDER, TIER_COLORS, POS_COLORS); name normalization (norm(), playerKey());
  CSV parser (parseRankings, now handles positional tiers like WR1→WR);
  consensus math (median, buildConsensus with merges support); storage schema and keys;
  shared widgets (renderBestPicksWidget, renderTeamCountsWidget);
  merge/flag/ADP helpers (loadMerges, loadFlags, saveFlags, flagBadge, etc.)
- `rankings-manager.html` / `rankings-manager.js` — full-tab Rankings Manager UI + logic.
  Loads both rankings.js and fp-rankings.js so pre-seeded sources exist. Handles source curation,
  importing new sources, renaming, toggling, and unmatched-player reconciliation.
- `build-fp-source.js` — one-off script (not extension code). Usage: `node build-fp-source.js` 
  to parse a CSV and regenerate `fp-rankings.js`. See "Pre-seeded sources" section above.
- `icon128.png` — placeholder icon

## Confirmed-working behavior (as of last session)
- Sleeper's public API needs no auth: `GET https://api.sleeper.app/v1/draft/{draft_id}/picks`
- Name matching handles Jr./Sr./III suffixes, punctuation, and a loose fallback
  (last name + first initial + position) for cases like "Ken" vs "Kenneth Walker"
- K/DST picks are intentionally skipped (this league has none)
- Auto-poll runs on a self-rescheduling `setTimeout` chain (not `setInterval`),
  with an `inFlight` guard so requests never stack, and exponential backoff on
  errors (capped at 8s) that resets once healthy again

## IMPORTANT — known platform limitation, do not "fix" this again
**Sleeper's `/picks` endpoint is cached at Cloudflare's edge for 15 seconds**
(`Cache-Control: public, s-maxage=15, stale-while-revalidate=300`), and the cache
key **ignores query strings** — confirmed via DevTools Network tab response headers
(`Cf-Cache-Status: HIT` even with a unique `?_=timestamp` cache-busting param on
every request). This means:
- No client-side trick can force fresher-than-~15s data. This was investigated
  and confirmed, not assumed — don't waste time re-attempting cache-busting
  approaches (unique query params, custom headers, etc. — already tried, don't work).
- Polling faster than ~3s therefore has **zero benefit** and just burns requests.
  Current `FAST_INTERVAL_MS` is set to `3000` deliberately — don't "optimize" this
  back down without re-confirming the cache behavior hasn't changed.
- The panel surfaces Sleeper's own `Age` response header in the status line
  ("Sleeper cache age: Xs") so the user can see real data freshness rather than
  being told a false "instant" refresh promise.
- **Built:** a live countdown (`#cacheCountdown` in `panel.html`, ticks via
  `setInterval` in `panel.js`) showing seconds until the current cached response
  expires (`15 - age - elapsed`), and manual refresh now toasts whether it got a
  fresh origin hit (`age === 0`) or another cached copy.

## IMPORTANT — Sleeper publishes NO public ADP endpoint
Verified against `docs.sleeper.com`: the documented API covers users, leagues,
drafts, players, and state — there is no ADP endpoint, and `/picks` is per-draft
rather than aggregated. The original feature spec assumed one existed; it doesn't.
- ADP in the Rankings Manager is therefore **user-imported**, not fetched. Don't
  "fix" this by hunting for the right URL — there isn't one.
- Sleeper does have an undocumented internal GraphQL endpoint that the community
  uses for ADP. It was deliberately NOT used: it needs a host permission this
  extension doesn't request, it's unversioned, and a mid-draft break is exactly
  when you'd least want it. If it's ever adopted, that's a explicit decision with
  a permission change, not a quiet swap.

## Surface split — READ THIS BEFORE MOVING ANY FEATURE
Settled after using the extension in a real draft; the original split was wrong.
- **Side panel (`panel.html`) = the live draft cockpit.** Best Picks Right Now,
  my-team position counts, the tiered board, and the BEST QB/RB/WR/TE grid all live
  here, because this is what's open while drafting. Setup controls (draft ID, draft
  slot, refresh, link to the manager) are tucked into a collapsible `#settingsPanel`
  that auto-collapses on a successful SYNC and re-opens on STOP — they only matter
  once, and the space belongs to the board.
- **Rankings Manager tab (`rankings-manager.html`) = curation only.** Import/edit
  ranking sources, manage ADP, and compare sources side by side. It deliberately does
  NOT show recommendations or team counts any more. The motivation is that most good
  cheat sheets are paywalled, so this is where the user builds and normalizes their
  own from whatever they can get.
- The two recommendation widgets live in `shared.js` as
  `renderBestPicksWidget(el, opts)` / `renderTeamCountsWidget(el, opts)`. They take a
  container element, so re-mounting either one on the manager later is a one-line
  change — don't fork the markup.
- **Pop-out**: `⤢` opens `panel.html` via `chrome.windows.create({type:"popup"})`.
  Chrome side panels cannot detach, so this is the supported way to get the board onto
  a second monitor. It's the same page, so both copies poll independently — harmless
  (idempotent writes, trivial extra request volume), and each restores shared pick
  state on open, gated on the draft ID matching so a previous draft's crossouts can't
  bleed into a new one.
- **Manual crossout on the board is DOUBLE-click**, not single. A single click on a
  full-width row was too easy to trigger by accident and silently removed a player
  mid-draft. The manager's ✕/↺ icon stays single-click — it's a small deliberate
  target, so the same risk doesn't apply.
- **Pop-out closes the side panel it was opened from**, via `window.close()` — that's
  the real (and only) way to close a side panel from its own script; there is no
  `chrome.sidePanel.close()`. The popped-out copy opens with `?popout=1` on its URL
  so it can hide its own pop-out button (popping out of a pop-out isn't meaningful).
- **TAKEN is a toggle, not a filter option.** It used to be a 6th value of
  `posFilter` that replaced whatever position was selected and showed ONLY drafted
  players. Now `posFilter` (ALL/QB/RB/WR/TE) and `showTaken` (bool) are independent —
  TAKEN layers drafted players, crossed out, on top of whatever position filter is
  active. Fixed identically in both `panel.js` and `rankings-manager.js`, which had
  the same bug pattern.
- **Favorite/avoid flags** (`playerFlags` in `shared.js`) are set only in the manager
  (★/⊘ buttons per row) and shown as read-only badges everywhere else (board rows,
  Best Picks cards). Display only — doesn't touch consensus ranking.

## Rankings Manager architecture (backlog #1/#3/#9 + part of #2)
- **Two surfaces, one state.** `panel.js` is the only thing that polls Sleeper; it
  writes picks to `chrome.storage.local` under `draftState`. The manager reads that
  and can add manual crossouts back. Both listen via `chrome.storage.onChanged`, so
  a pick in one shows up in the other with no refresh. Each guards against acting on
  the echo of its own write.
- **Player identity across sources is `normalizedName|POSITION`** (`playerKey()` in
  `shared.js`) — not array index, which was the old panel-local scheme and can't
  survive multiple sources. Picks are recorded with this key for EVERY drafted
  player, even ones absent from the default rankings, so an imported source that
  includes them still crosses them off.
- **Consensus = median, not mean**, across enabled sources only, and a player
  missing from a source contributes nothing rather than counting as unranked.
  Both choices are deliberate — see backlog #3.
- **The builtin source is re-seeded from `rankings.js` on every load** and stored
  without its player array, so regenerating the default CSV actually takes effect
  instead of being pinned to a stale copy in storage.
- `myRosterId` is a user-entered draft slot; picks match on `roster_id` OR
  `draft_slot` because Sleeper populates these differently in real vs. mock drafts.

## Distribution / update workflow gotcha (why we're moving to Claude Code)
Files were being edited in a sandboxed environment, zipped, and handed to the user
to manually download/unzip/re-point "Load unpacked" at. Several rounds of confusion
happened because "click reload in chrome://extensions" only re-reads whatever is
**already on the user's local disk** — it does NOT pull new code from anywhere.
This caused the user to debug against stale code for a while. Moving to Claude Code
fixes this at the root: edits happen directly on the real local folder Chrome is
already pointed at, so a plain extension reload is sufficient going forward.

## Design language (for any future UI work)
Dark "stadium/scoreboard" theme, not a generic AI-template look:
- Background near-black (`#0B0D08`), panel surfaces `#14170F`, hairline borders `#22251B`/`#2A2E22`
- Monospace (JetBrains Mono) for data/labels, Inter for body text
- Position colors: QB gold `#F5C242`, RB green `#5FCF8A`, WR blue `#5FA8E8`, TE pink `#E88AC9`
- Tier colors run gold→orange→green→blue→purple→gray as tiers descend S→O
- This theme should be preserved/extended, not replaced, in future design passes
  (see backlog item #2 — UI redesign is explicitly deferred until functionality settles)

## Feature backlog
Full list with sequencing thoughts lives in `4thGo-feature-backlog.md` — now kept
in this repo folder (was previously only in the handoff folder). Don't re-derive
priorities from scratch — read that file. Quick summary of open items:
1. Editable/importable rankings (default = current CSV, layer imports on top)
2. "One best pick" recommendation view (deferred until #4/#5 logic exists)
3. Multiple ranking sources shown side-by-side (constrained — most premium sources
   have no free/scrapeable export; likely just FantasyPros consensus + Sleeper ADP)
4. League-specific scoring logic baked into rank/value (e.g. TE premium for this
   league's 2-FLEX format)
5. Custom rule-based draft strategy logic — explicitly NOT AI-based, needs the
   user to fully articulate the actual rules before this can be coded (biggest
   lift on the list, deliberately sequenced last)
6. ADP-vs-rank "value" heat map — SUPERSEDED, pulled forward into the Rankings
   Manager build as a simple colored rank-vs-ADP delta column (see #9)
7. Competitive research task (assigned to Claude, not yet done) — review
   FantasyPros Draft Wizard, PFF mock sim, Draft Sharks, Underdog/Flock UX, and
   revisit open-source VOR tools (`jjti/ff`, `gnmerritt/fantasy-bot`) for patterns
   worth adopting into #5/#6. **The backlog explicitly flags this as a "do this
   before we start coding" item** because it's meant to inform #2/#5/#6 — check
   with the user before building anything in that space.
8. VORP — deliberately deferred to its own future pass. Blocked on a real point
   PROJECTIONS source; current ranking data is ordinal, and ranks alone can't
   express magnitude. Likely shares logic with #4 when eventually built.
9. Sleeper ADP-vs-rank column — built, but user-imported rather than auto-pulled
   (was #6). See the "no public ADP endpoint" section above.
10. Weighted sources / saved consensus profiles
11. Unmatched-player reconciliation UI — known weak spot in cross-source merging
12. Persist real picks independently of the side panel polling
13. **Positional + overall team GRADE vs. league-mates — user flagged as higher
    priority than several items above it.** Feasible with data already fetched
    (`roster_id`/`draft_slot` are on every pick); blocked mainly on choosing a value
    metric, which overlaps #4 and #8.
14. Manual refresh button may not be earning its place — consider disabling it while
    the cache is still warm, or removing it

## Design fundamentals pass (completed)
Applied Apple-design and Emil-design-eng principles review. Fixes prioritized by feedback integrity:
1. **Double-click source isolation now works without side effects** — rewired click/dblclick handlers with a 200ms timeout to distinguish single from double-click. Before: double-clicking to isolate a source also disabled it as a side effect. Now: isolation is pure.
2. **Replaced native `confirm()` with a themed dialog** — added `#confirmModal` using the same `.sheet` + modal pattern as imports, with styled buttons and message. Toasts no longer break the turf theme mid-draft.
3. **Unified button press feedback** — added `button:active { transform: scale(0.97); }` globally in both surfaces, plus hover states for filter buttons (subtle color brightening).
4. **Fixed row hover transition gap** — added `filter` to the `.row` transition list so brightness-change animates at the same speed as opacity fade.
5. **Settings-drawer collapse animation** — switched from `max-height: 400px → 0` (which wastes most of transition time on empty space) to `max-height: 250px → 0` with cubic-bezier easing for snappier, actually smooth collapse. Changed again from grid-template-rows after user feedback about blank space.
6. **Toast transitions** — toasts now slide up from bottom + fade in/out, with color differentiation: gold for success/normal, red for error. Callable as `toast(msg, isError)`.
7. **Filter-button visual feedback** — added cursor pointer + hover brightening + transitions, making the small interactive elements consistent with other chips in the UI.

## Feature #11: Unmatched-player reconciliation — ✅ BUILT
Solves the problem of name mismatches across ranking sources silently splitting players into duplicate rows.
- **Detection**: `findOrphans(sources, merges)` identifies players appearing in only 1 source (true orphans, not false positives from small consensus groups)
- **Storage**: `K_MERGES` map stores variant→canonical mappings globally: `{ "ken walker|rb": "kenneth walker|rb", ... }`
- **Application**: `buildConsensus(sources, merges = {})` now takes optional merges parameter. Each player key is resolved through the merge map before grouping, so merged variants get one blended rank instead of two separate ones
- **Manager UI**: New collapsible "UNMATCHED PLAYERS" section shows detected orphans per source with their rank, plus one-click MERGE button. Users paste the canonical name+position; merge persists to storage and immediately re-ranks both surfaces
- **Cross-surface consistency**: Both side panel and manager load/apply the same merges via storage listeners
- **Pragmatic design**: Detection only surfaces true orphans (single-source players), not borderline groups. Merge UI is minimal (prompt-based) since this is a rare safety net, not a heavy-use feature. No versioning complexity — merges persist globally.

## Parser enhancements — CSV handling
- **Positional tier support**: Parser now strips numeric suffixes from positions (WR1→WR, TE2→TE, RB2→RB) to handle sources like FantasyPros that use positional tiers instead of pure positions
- **Tested with FantasyPros 2026 Draft Rankings CSV** (336 players parsed successfully; 44 skipped because kickers/DST/FA, which league doesn't use)

## Source renaming — ✅ BUILT
Users can now customize ranking source names in the manager. Each source chip has a pencil icon (✎) that opens a rename prompt. Changes persist to storage and update both surfaces immediately. Useful for labeling sources like "FantasyPros ECR", "Sleeper ADP", etc.

## Pre-seeded sources — FantasyPros embedded
- **New file**: `fp-rankings.js` contains 336 parsed FantasyPros 2026 players as JavaScript array export (`FP_RANKINGS`)
- **Auto-seeding**: On manager init, `ensureBuiltinSources()` checks if FantasyPros source exists in storage; if not, seeds it automatically as "FantasyPros ECR"
- **Workflow for future sources**: Parse CSV with fixed parser → generate `{source}-rankings.js` file → add script tag to rankings-manager.html → wire in ensureBuiltinSources(). Users have all their sources at launch without manual import.

## Testing coverage (51+ automated tests)
- `test.js`: parser, normalization, consensus (median vs mean), disabled sources, ADP delta, storage round-trip, saveSources/load cycle (builtin re-seed verified)
- `widget-test.js`: renderBestPicksWidget, renderTeamCountsWidget, responsive grids, soloSource isolation, flag badges
- `flag-test.js`: flag storage, loadFlags/saveFlags, flagBadge rendering, cross-surface persistence
- `merge-test-final.js`: orphan detection, merge deduplication, consensus blending with merges
- All tests pass on Haiku; no regressions after design/parser/merge changes

## Immediate next step (where we left off)
Three features shipping this session: design fundamentals pass (#11 tested end-to-end), unmatched-player reconciliation (#11 with orphan detection UI), source renaming + FantasyPros pre-seeding (parser fixed, CSV parsing verified).

Real-draft verification still pending:
1. Pop-out window behavior (two copies polling, state consistency) — should work per implementation
2. Double-click crossout in practice — validated in harness, not real draft
3. TAKEN toggle working as independent filter layer — tested in harness
4. Cache countdown accuracy against real `Age` header — harness-tested only
5. Cross-surface source toggling live re-ranking — storage listeners working

## Technical debt noted (for future polish pass)
- CSS token duplication across panel.html and rankings-manager.html — both redefine `:root` and button base styles. Worth consolidating into a shared stylesheet or template once more surfaces are added.
- Typography consolidation — scattered "small monospace eyebrow" styles (.sub, th, .teamHint) hand-tuned differently. Consider one shared class before design overhaul.

## Build/deployment workflow
- All edits on local filesystem directly; Chrome already points "Load unpacked" at `/Users/rithvikmada/Repos/sleeper-draft-ext 4`
- Chrome reload (`cmd+r` on the extension) picks up changes immediately
- No build step needed for source code; FantasyPros CSV → JavaScript is done in Claude (run `node build-fp-source.js` to regenerate `fp-rankings.js` from latest CSV)

## Feature #11: Unmatched-player reconciliation — ✅ BUILT
- **Problem solved:** Players are matched across sources by normalized name + position. When sources spell names differently (nicknames, punctuation, suffix variants, mid-season position trades), they silently split into separate rows, breaking consensus blending.
- **Detection:** `findOrphans(sources, merges)` identifies players appearing in only one source (true orphans, not false positives from small consensus groups).
- **Storage:** `K_MERGES` map stores confirmed merges globally: `{ variantKey: canonicalKey, ... }`. Once merged, the variant always resolves to the canonical key.
- **Application:** `buildConsensus(sources, merges = {})` now takes an optional merges parameter. Each player key is resolved through the merge map before grouping, so merged variants get one blended rank.
- **Manager UI:** New collapsible "UNMATCHED PLAYERS" section shows detected orphans per source with their rank, plus one-click MERGE button. Users paste the canonical name+position; the merge persists to storage and immediately re-ranks both surfaces.
- **Cross-surface consistency:** Both side panel and manager call buildConsensus() with the same merges, so the correction shows live in both places.
- **Pragmatic scope:** Detection only surfaces true orphans (single-source players), not borderline groups. Merge UI is minimal (prompt-based) since this is a rare safety net, not a feature. No versioning complexity — merges persist globally across sessions.

## Immediate next step (where we left off)
The Rankings Manager (backlog #1/#3/#9 + part of #2) was confirmed WORKING against a
real draft by the user. The follow-up pass then rebalanced the two surfaces — see
"Surface split" above — moving recommendations into the side panel, reducing the
manager to curation, adding the settings drawer, pop-out window, and double-click
crossout safeguard.

That rebalancing pass is unit-tested (45 checks across the parser, consensus,
storage, and both shared widgets) and was driven through a stubbed-`chrome.*`
harness — settings collapse-on-sync, pop-out, solo-source isolation, single-vs-
double-click, and live cross-surface source toggling all verified there. But it has
NOT been run as a real unpacked extension. Next session should reload it and check:
1. The pop-out window (`⤢`) — two copies polling at once is expected and fine, but
   confirm nothing double-toasts or fights over storage in practice.
2. Double-click crossout, and that single-click genuinely no longer removes anyone.
3. That toggling a source in the manager tab re-ranks the side panel's Best Picks
   live, with the panel and manager open side by side.
4. "MY TEAM" counts — still the least-exercised path, since `byMe` only started
   working in the previous pass.
5. Still open from earlier: the cache-expiry countdown and the fresh-vs-cached
   refresh toast have never been checked against a real draft's `Age` header.
   Related: backlog #14 questions whether the refresh button should exist at all.

## Testing notes
Mock drafts (bot-filled) work identically to real drafts for API purposes and pick
much faster — good for stress-testing polling/matching logic. A test protocol was
written covering: polling cadence, cache-age readout accuracy, real end-to-end
pick-to-board latency, and manual refresh honesty. Ask the user if they ran it and
what the actual observed latency numbers were before assuming timing is fine.

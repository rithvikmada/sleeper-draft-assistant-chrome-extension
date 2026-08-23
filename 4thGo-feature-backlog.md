# 4th&Go — Feature Backlog / Running Notes

Running list of ideas for the extension. Nothing here is built yet — just capturing
thoughts as they come. We'll batch these into actual coding sessions later.

---

## 1. Editable / importable rankings — ✅ BUILT (Rankings Manager)
- Rankings currently hardcoded in `rankings.js` from the original CSV.
- Want: an in-panel way to import a new rankings file (CSV/paste) that overrides the default.
- Keep the original CSV as the fallback/default set — new imports layer on top, don't require a rebuild.
- Open question: single active ranking set, or saved/named sets you can switch between?
- **Resolved as: multiple named sets, all live at once.** The bundled CSV is a
  permanent, undeletable base source; imports are added alongside it and each can
  be toggled on/off independently. Import accepts CSV upload or paste, comma or
  tab, with or without a header row.

## 2. "What should I take right now" — single answer — ◐ PARTIALLY BUILT
- Current design shows best-at-each-position. You want one clear top recommendation
  at a glance, not four things to scan.
- This connects to #4 (league-specific logic) and #5 (draft strategy logic) —
  the "one answer" is presumably the output of whatever ranking/weighting logic
  we land on, not just raw rank-1-overall.
- Design pass explicitly deferred until functionality below is settled — no point
  styling a layout that's about to change shape.
- **What now exists:** the Rankings Manager's "Best picks right now" panel shows a
  ranked top 3 (not a 4-position grid) off blended consensus. Still ranked purely
  by consensus rank order — it does NOT yet account for roster needs, positional
  scarcity, or league scoring, so it isn't the "smart" single answer yet. That
  still waits on #4/#5. The side panel keeps its 4-position grid unchanged.
- **Scope addition (2026-08-23):** when this pass finally happens, it needs to
  include the side panel board's row layout — rank, name, per-source ADP
  columns, the value bar, and the pos chip. That layout was built incrementally
  (ADP columns added, then a value bar, then column labels) without a full
  picture of everything it'd eventually need to hold, and went through five
  rounds of alignment bugs as a result (see `claude.md`'s "Design & alignment
  lessons" section for the actual root causes). Design it once, thoughtfully,
  against the complete feature set instead of bolting more columns onto the
  current ad-hoc grid.

## 3. Multiple ranking sources side-by-side — ✅ BUILT (Rankings Manager)
- See more than one source's opinion on the board at once (not just your one CSV).
- Goal: glance across sources, then make your own call — not the tool picking for you.
- Needs: figure out which sources are actually pullable (free API/export vs. manual paste),
  and how to display without cluttering the board.
- **Built as:** one rank column per enabled source in the full list, plus a blended
  CONSENSUS column. Consensus is the MEDIAN across enabled sources, not the mean,
  so one outlier source can't drag a player. A player missing from a source simply
  doesn't contribute rather than being treated as unranked — otherwise anyone on a
  short list would get buried. Clicking a source isolates the whole page to it.
- Answer on pullability: nothing is auto-pulled. Everything is user-imported, which
  sidesteps the scraping/ToS problem entirely.

## 4. League-specific scoring logic baked in
- E.g. TE premium adjustment for your format (2 FLEX, full PPR, no K/D).
- This should adjust value/rank programmatically, not just be a note.

## 5. Custom draft-strategy logic (rule-based, not AI-based)
- You have a specific strategy/philosophy you want encoded as actual logic —
  explicit rules/weights in code, not a model making judgment calls live.
- Needs: you to spell out the actual strategy rules before this can be built
  (e.g. positional run triggers, round-based targets, handcuff logic, etc.)
- This is the biggest scope item on the list — will need its own dedicated
  conversation to nail down the rules before coding.

## 6. ADP vs. rank "value" heat map
- Show where a player's current Sleeper ADP diverges from your rank — i.e.,
  value/reach indicator at a glance, color-coded like a heat map.
- Explicit inspiration: FantasyPros' analytical layer (minus the player-profile
  stats stuff — you said that part doesn't matter much to you).
- This is very doable with data we already have (Sleeper ADP is public,
  your rank is already loaded) — likely one of the more self-contained additions.

## 7. Competitive research (on me, not coded yet)
- Task: review what other draft tools/assistants actually offer in their UI/UX —
  FantasyPros Draft Wizard, PFF mock draft sim, Draft Sharks, Underdog/Flock, etc.
- Also revisit the open-source VOR-based tools (jjti/ff, gnmerritt/fantasy-bot) for
  how they calculate and surface value-over-replacement, since that logic could feed #5/#6.
- Deliverable: a summary of patterns worth stealing, brought back before we scope
  the next build session.
- **Reminder flag: ask me to actually do this research before we start coding**, since
  it should inform #2, #5, and #6 rather than happen after.

## 8. VORP (Value Over Replacement Player) — deferred, own future pass
- Explicitly NOT part of the Rankings Manager build (see rankings-manager-prompt.md).
- Real reason it's deferred: VORP requires actual point PROJECTIONS, not ranks.
  The current rankings data is ordinal (1st, 2nd, 3rd...) — VORP needs magnitude
  (how many points better is this player than the next-best replacement), which
  ranks alone can't provide.
- To build this properly later, will need: (a) a projections data source (e.g.
  FantasyPros publishes point projections separately from their ECR rankings —
  check if that's exportable), (b) a defined "replacement level" calculation
  using this league's exact settings (10 teams, starters, reasonable bench
  buffer), (c) probably its own view/tab rather than a bolt-on to existing UI.
- Connects to backlog #4 (league-specific scoring logic) — TE premium and
  2-FLEX value adjustments are conceptually the same kind of "true value beyond
  raw rank" problem VORP solves, so these two items may end up sharing logic
  when eventually built.

## 9. ADP-vs-rank column — ◐ BUILT, but NOT auto-pulled (premise was wrong)
- Formerly backlog #6 (heat map). Low-cost to add now since we're already
  polling Sleeper's API for live picks — added directly into the Rankings
  Manager scope rather than staying a separate future item. See
  rankings-manager-prompt.md for the implementation spec.
- **Correction — the assumption that Sleeper exposes ADP was wrong.**
  `docs.sleeper.com` documents no ADP endpoint at all (verified against the docs;
  the full endpoint list covers users/leagues/drafts/players/state and nothing
  else). The `/picks` feed is per-draft, not aggregated. So there is nothing to
  poll, and this is NOT a matter of finding the right URL.
- **Built as:** ADP is an always-present column populated by user import, using the
  same flexible parser as ranking sources, cached in `chrome.storage.local`. The
  delta column and its green/red value-vs-reach coloring are fully working —
  positive delta = market drafts them later than you rank them = value.
- **If a live ADP feed is ever wanted**, the options are: (a) Sleeper's
  undocumented internal GraphQL endpoint — deliberately NOT used here, it needs a
  host permission the extension doesn't have and could break mid-draft; (b) compute
  ADP ourselves by polling many completed public mock drafts; (c) import from
  FantasyPros/other exports, which is what this build does.

## 10. Weighted sources / saved consensus profiles — NEW, from the #1/#3 build
- Right now every enabled source counts equally in the median. Natural next ask:
  trust source A twice as much as source B.
- Note the tension: a weighted median is a different (and less intuitive) statistic
  than a plain one. Decide deliberately whether weighting should switch the blend to
  a weighted mean, or do repeated-value weighting on the median.
- Related: save named combinations of enabled sources + weights ("my ppr blend",
  "sharp only") and switch between them, instead of toggling chips one at a time.

## 11. Unmatched-player reconciliation UI — ✅ BUILT
- Detects players appearing in only one source (true orphans) and surfaces them in
  the manager with a one-click MERGE button. Users paste the canonical name+position,
  the merge persists, and consensus immediately re-ranks both surfaces.
- Detection: `findOrphans()` identifies orphans; rendering shows them in a collapsible
  "UNMATCHED PLAYERS" section with their rank per source.
- Merge logic: `K_MERGES` map stores variant→canonical mappings. `buildConsensus()`
  resolves all keys through the merge map before grouping, so merged players get one
  blended rank instead of two separate ones.
- Cross-surface: Both panel and manager load/apply the same merges, so corrections
  show live everywhere.
- Pragmatic: Detects only true orphans (single-source), not borderline consensus groups.
  Merge UI is minimal (prompt-based) since this is a safety net for rare name mismatches,
  not a heavy-use feature.

## 12. Persist real picks, not just manual crossouts — NEW, from the #1/#3 build
- The manager reads live picks from shared storage, but only the side panel writes
  them, and only while it's actively polling. Close the panel and the manager still
  shows the last synced snapshot — correct, but it goes stale silently.
- Options: a staleness indicator in the manager, or letting the manager take over
  polling when the panel is closed. Deliberately not built now, since the constraint
  was to leave the polling/cache path in `panel.js` untouched.

## 13. Positional + overall team GRADE vs. league-mates — NEW, user flagged as high priority
- As the draft runs, show how the user's roster stacks up against every other team:
  a rank per position ("your RBs are 3rd of 10, your WRs are 1st") plus an overall
  team letter grade. The point is to make in-draft decisions off RELATIVE standing —
  "I'm 1st at WR five rounds in, so go get running backs" — not off your own roster
  viewed in isolation.
- **Feasibility is good and the data is already in hand**: every pick in the
  `/picks` feed carries `roster_id` and `draft_slot` (`panel.js` already reads both
  to decide `byMe`), so grouping the existing picks array by roster reconstructs all
  N teams' rosters with zero new API calls. `lastSharedPicks` is already persisted
  for both surfaces.
- Open questions before building:
  - What metric ranks a position group? Sum vs. average of consensus rank is the
    cheap version; a replacement-value method is the honest one. This overlaps
    heavily with #4 (league scoring) and #8 (VORP) — probably shares logic, and a
    letter grade implies a value scale that ranks alone can't really supply, so
    read #8's note about ordinal-vs-magnitude before picking an approach.
  - How to label teams in a mock draft (bots may have no useful display name —
    verify what Sleeper actually returns; "Team {slot}" is the safe fallback).
  - Where it lives: N teams wide doesn't fit the side panel. Likely a new "League"
    view in the Rankings Manager tab, or its own pop-out window.

## 14. Manual refresh button may not be earning its place — NEW
- User's observation from a live draft: it appears to do nothing useful.
- That matches the documented 15s Cloudflare edge cache — clicking mid-window just
  refetches the same cached copy. The fresh-vs-cached toast already tells the truth
  about this rather than faking a refresh, so the button isn't lying, it's just
  mostly useless.
- Options: disable/grey it while cache-remaining > 0 so it's only clickable when it
  could actually help, or drop it entirely and rely on the countdown plus auto-poll
  (which picks up fresh data within one 3s cycle of cache expiry anyway).

## 15. Favorite / avoid player flags — ✅ BUILT
- ★ favorite / ⊘ avoid buttons per player in the manager's comparison table.
  Storage: `playerFlags` map (`shared.js`: `loadFlags`/`saveFlags`/`flagBadge`),
  playerKey -> `"favorite"|"avoid"`. Read-only badges show on side-panel board rows
  and Best Picks cards — flags are set only from the manager, matching the user's
  mental model ("flag them there, see it in the sidebar while drafting").
- Does NOT affect consensus ranking/ordering — display only, by design. If ranking
  weight ever gets attached to flags, that's a deliberate future decision, not a
  side effect of this.

## 16. True value-cliff tiering — NEW, upgrade path noted during the tier-blending fix
- Current state (as of the multi-source tier rework): when 2+ ranking sources are
  blended, the tier board no longer blends each source's own tier LABELS (their
  boundaries aren't on the same scale — Flock's "tier 6" and FantasyPros' "tier 6"
  don't represent the same quality band, they're independently-drawn cutoffs that
  happen to share a number). Instead, tiers are carved directly from the blended
  rank into 16 even-sized bands (`assignRankBasedTiers` in `shared.js`). This
  guarantees tier order always matches rank order, which is correct, but it's an
  even split, not a real detection of where the actual talent cliffs are.
- Real tiering (what FantasyPros' own paid tiers, and tools like it, actually do)
  clusters players by GAPS in projected point value — a big drop-off between
  player N and N+1 means a new tier starts there, so tiers can be uneven sizes and
  actually reflect "these guys are basically interchangeable, this next guy is a
  step down."
- Blocked on the same thing as #8 (VORP): we only have ordinal rank data, not real
  point projections, so there's no magnitude to detect a "gap" in — rank alone
  can't tell you if #14 vs #15 is a big drop or a coin flip. Once a projections
  source exists, revisit this: gap-detection (e.g. threshold on projected-points
  delta between consecutive ranked players, or simple clustering) should replace
  the even-band bucketing here.
- Low priority until #8 has a data source; noted now so the even-bucket approach
  isn't mistaken for the final design later.

Rough dependency order, for when we do batch these:
1. Editable rankings import (#1) — foundational, nothing else really needs it first
2. ADP vs. rank heat map (#6) — self-contained, low risk, good early win
3. Competitive research (#7) — informs the harder stuff below
4. League-specific scoring logic (#4) — needed before "one best pick" can be smart
5. Draft strategy rules (#5) — needs your rules spelled out first; biggest lift
6. Multi-source display (#3) — depends on what's actually pullable
7. "One best pick" UI + full design pass (#2) — last, once the underlying logic exists

This is just a suggested order — not locked in.

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

## 8. VORP / VBD — BUILT 2026-08-25, as plain BEER (man-games baseline)
- Built in the `feature/beer-vbd` worktree/branch, per `beer-vbd-prompt.md`.
  See claude.md's "BEER / VBD" section for the full writeup.
- Data source: Sleeper's own projections endpoint (`pts_ppr`), same one ADP
  already uses — the earlier "will need a projections data source" blocker
  from this entry turned out to already exist for free.
- Replacement level uses this league's actual settings (10 teams,
  1QB/2RB/2WR/1TE/2FLEX), via a documented man-games/FLEX-share assumption —
  see claude.md for the exact numbers and reasoning.
- Live: recomputes off currently-available players as the draft progresses,
  reusing the existing pick-sync plumbing, no new polling.
- Surfaces as VBD values on the BEST QB/RB/WR/TE grid (with a highlighted
  objective-best-pick card) and a new sortable VALUE column in the Rankings
  Manager table — not a separate view/tab as originally guessed above.
- **Not built, logged separately**: BEER+'s risk-adjustment/QB-streaming
  layers, and roster-need-aware value discounting (plain BEER is
  team-agnostic) — see claude.md's "BEER+-parity gap" backlog entry.
- Connects to backlog #4 (league-specific scoring logic), which was
  separately dropped (no consistent industry formula found) — see claude.md.

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

## 13. Positional rank vs. league-mates — per-position slice BUILT 2026-08-25
- Original ask: a rank per position ("your RBs are 3rd of 10, your WRs are 1st")
  plus an overall team letter grade, so in-draft decisions can be made off
  RELATIVE standing, not your own roster viewed in isolation.
- **Per-position rank is built.** `buildTeamPositionRanks()` (shared.js) groups
  the existing `lastSharedPicks` array by `rosterId` (added to each pick in
  panel.js's `poll()`), sums each team's BEER value per position, and ranks
  every team. Surfaces as a live chip in the board window's "My team" widget —
  no new API calls, no new view/window needed (the "where it lives" open
  question below resolved to "right where the existing team-counts widget
  already is," not a separate League view). See claude.md's #13 write-up for
  the full reasoning, including why it's LIVE (graded against current
  replacement level, not frozen at pick time) and how the rank denominator
  handles a team with zero players at a position.
- **What actually resolved the old open questions**: the metric question
  (sum vs. average vs. replacement-value) is answered by BEER itself now
  that #8 is built — sum of BEER value per position, same reasoning as the
  man-games calc. The "where it lives" question resolved to the existing
  board-window widget, no new UI surface needed.
- **Not yet built — a genuinely separate follow-up now, not implied by the
  above**: an OVERALL team grade/letter that rolls all four positions into
  one number or rank, the way the original ask described. Per-position rank
  answers "how do my RBs compare," not "how does my WHOLE team compare" —
  that needs a decision on how to weight positions against each other (equal
  weight? weighted by roster slots, e.g. 2 RB slots vs 1 QB slot?) before
  it's a single honest number, which per-position rank alone doesn't need to
  answer. Pick this up as its own scoped task, don't assume it's a trivial
  extension of what's built.
- Team display names in a mock draft (bots may have no useful name) —
  still unaddressed, since the rank chip only ever needed to show YOUR OWN
  rank number, not label every other team by name. Would matter if a future
  "league standings" view ever lists all 10 teams by name.

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

## 16. True value-cliff tiering — attempted, reverted (2026-08-23), still unsolved
- **History note**: this section went through multiple stale descriptions —
  `assignRankBasedTiers` ("even-sized bands" from blended rank), then this
  entry briefly (incorrectly) marked a source-vote-boundary approach as
  "built." That approach was tried, looked fine in simulation, then failed
  badly on real live data and was fully reverted. Currently running: the
  depth-based equal-width-bucket version, unchanged. Don't trust prior
  descriptions of "what's built" in this section; check `shared.js`'s
  `assignBlendedTiers` directly, or CLAUDE.md's "Source-vote-boundary tiering
  was tried and reverted" entry for the full account of what failed and why.
- **What was tried and reverted**: for every adjacent pair of players in
  blended rank order, count how many sources that tier BOTH of them place
  them in different tiers, keeping a boundary where a majority of those
  voting sources agreed. Simulated fine against bundled data (16 tiers,
  10-61 players each), but real usage produced an 11-player tier 1 followed
  by a 112-player tier 2. Root cause: independently-drawn tier boundaries
  from different sources almost never land on the exact same adjacent
  rank-pair, even when sources broadly agree a cliff exists nearby (one
  breaks 14/15, another 16/17 — zero credit under exact-pair matching
  despite real near-agreement). With only 2-3 sources actually covering most
  of the draft, "majority at this exact pair" was nearly unreachable outside
  a few lucky spots, collapsing most of the board into one leftover tier.
- **Next real attempt, if picked back up**: a windowed/clustering version —
  treat two sources' boundaries as "the same cliff" if they fall within a
  small rank-distance of each other, rather than requiring the exact same
  adjacent pair. Needs real design work (how wide a window, how to merge
  overlapping windows from 3+ sources) before building, not another quick
  pass.
- **Also unresolved**: whether "FantasyPros Top 10" only has tier opinions
  for its first ~10 players and contributes nothing past that — worth
  checking before any next attempt, since it changes how many real voters
  exist for 95% of the draft regardless of which blending method is used.
- The more rigorous long-term version remains gap-detection on real
  point-projection magnitude (VORP, #8) instead of editorial tier agreement —
  genuinely detects talent cliffs rather than cliffs in how sources chose to
  draw their own boundaries. Still blocked on VORP existing.

Rough dependency order, for when we do batch these:
1. Editable rankings import (#1) — foundational, nothing else really needs it first
2. ADP vs. rank heat map (#6) — self-contained, low risk, good early win
3. Competitive research (#7) — informs the harder stuff below
4. League-specific scoring logic (#4) — needed before "one best pick" can be smart
5. Draft strategy rules (#5) — needs your rules spelled out first; biggest lift
6. Multi-source display (#3) — depends on what's actually pullable
7. "One best pick" UI + full design pass (#2) — last, once the underlying logic exists

This is just a suggested order — not locked in.

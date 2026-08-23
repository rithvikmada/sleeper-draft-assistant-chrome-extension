Read PROJECT_NOTES.md and 4thGo-feature-backlog.md first if you haven't already
this session. This request implements backlog items #1, #3, and part of #2 as one
combined feature: a standalone "Rankings Manager."

## What to build

A new extension page — `rankings.html` / `rankings.js` — opened in its own full
browser tab (via `chrome.tabs.create`, triggered by a button in the existing side
panel), NOT crammed into the side panel. Reuse the existing dark "turf" theme,
tier colors, and position colors already defined in `panel.html`'s CSS — don't
reinvent the visual language, extend it.

## Data model

- Support multiple NAMED ranking sources. Each source = { id, name, color/icon,
  enabled: bool, players: [{name, team, pos, rank, tier?}] }
- The existing `rankings.js` (FantasyPros-consensus-style, 356 players) becomes
  the default/base source, pre-loaded and always present — call it e.g. "My
  Default Rankings" — user can still add more sources on top of it.
- Users add sources via: CSV upload, or paste-in text (support a simple flexible
  parser — comma or tab separated, tolerate a header row).
- Store all sources in `chrome.storage.local` under a key like `rankingSources`,
  as an array. This needs to be readable by BOTH `rankings.js` (this new tab)
  and the existing `panel.js` (side panel) — don't duplicate the source data.

## Sync with live draft state

- Read the SAME `taken`/drafted state that `panel.js` already tracks (currently
  in-memory there, driven by Sleeper polling — check how it's currently stored;
  if it's not already persisted to `chrome.storage.local`, that's a prerequisite
  change so both surfaces can share it).
- Use `chrome.storage.onChanged` listeners in both `panel.js` and `rankings.js`
  so a pick synced in one surface instantly reflects in the other, no manual
  refresh needed between the two tabs.

## UI requirements — "Best Picks Right Now" panel (primary feature)

- Top of the page: 3 cards showing the top consensus available players (like the
  reference screenshot: gold/silver/bronze style ranking, position badge, small
  row of source icons under each card showing which sources rank them there).
- Consensus definition: rank each available player by the MEDIAN of their rank
  across all currently-ENABLED sources (not mean — more robust to one outlier
  source). Players missing from a given source should be excluded from that
  source's contribution, not treated as unranked/infinity.
- Clicking a specific source's icon filters the ENTIRE page (best-picks panel +
  full list below) to that source's view alone. Clicking it again (or a "show
  all" control) returns to blended consensus.
- Below the best-picks panel: full scrollable player list, position-filterable
  (ALL/QB/RB/WR/TE, matching the side panel's existing filter pattern), with
  one rank column PER enabled source shown side by side (not just one blended
  number) — the user explicitly wants to see spread across sources, not just
  trust an average blindly.
- Drafted players show crossed-out/dimmed, consistent with the side panel's
  existing `.gone` row style.

## Position count tracker

Small, secondary — a compact counter (QB: n, RB: n, WR: n, TE: n) reflecting
the user's OWN drafted team (the side panel's "myTeam" tracking, not all-drafted
players). Place it near the top, doesn't need to be fancy.

## ADP column (Sleeper)

Add Sleeper ADP as an always-present column alongside the ranking sources —
not a toggleable "source" like the others, just a reference number shown per
player. Pull it from Sleeper's public ADP data (same API family already used
for live pick polling in `panel.js` — check their docs for the correct ADP
endpoint for the current season/format if it's not the same `/picks` endpoint).
Cache this on load rather than polling repeatedly — ADP doesn't change fast
enough during a single draft session to need live refresh like the picks feed
does.

Visually: color-code the gap between a source's rank and ADP (e.g., green if a
player is ranked notably higher than their ADP — a potential value/reach signal
— red if notably lower). This is a lightweight version of a "value heat map" —
don't over-build it, a simple colored delta number per row is enough for now.

## Source management UI

- A simple panel/modal for: adding a new source (name + CSV upload or paste),
  toggling a source on/off, removing a source. Keep this functional over
  polished — it's a utility screen, not the main event.

## Explicit constraints — do not violate these

- Do NOT change the Sleeper polling interval or cache-handling logic in
  `panel.js` (see PROJECT_NOTES.md — the 3s interval and Cloudflare 15s cache
  behavior were deliberately investigated and fixed; don't touch that code path
  as part of this feature).
- Keep the side panel's existing width/layout untouched — this feature lives
  entirely in the new tab.
- If anything here is ambiguous (e.g., exact CSV column format for a new
  source), ask rather than guessing — don't invent a rigid format the user
  then has to reformat their data around.

## After building

Update PROJECT_NOTES.md and the feature backlog to reflect that #1/#3 (and part
of #2) are now implemented, and note any follow-on ideas that came up during
the build (e.g., weighting sources unevenly, saving named "consensus profiles")
as new backlog entries rather than scope-creeping them into this pass.

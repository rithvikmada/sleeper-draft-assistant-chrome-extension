# Ranking-source normalizer prompt

Paste this into a fresh Claude chat along with the raw export from any new
ranking/ADP source (CSV, pasted table, screenshot text, whatever you can get).
It converts messy exports into a CSV that pastes directly into 4th&Go's
Rankings Manager import box.

---

I'm importing a fantasy football ranking/ADP export into a tool that accepts
CSV with these exact rules. Convert my source into that format.

**Output format:** CSV, comma-separated, with a header row of exactly:
`Name,Team,Position,Rank`
(add a `Tier` column only if the source has real tier data)

**Rules:**
- One row per player. Drop any K or DST/DEF rows entirely — only QB, RB, WR, TE survive.
- `Name`: just the player's name — no team, bye week, or position suffix mixed in.
  If the source embeds team/bye in the name cell (e.g. "Jahmyr Gibbs DET (6)" or
  "Tyreek Hill FA ()"), strip that out so it's just "Jahmyr Gibbs" / "Tyreek Hill".
- `Team`: 2-3 letter team code, uppercase. Leave blank if not available (don't guess).
- `Position`: exactly one of QB, RB, WR, TE — no positional-rank suffixes (e.g.
  "RB1", "WR12" becomes just "RB", "WR").
- `Rank`: one numeric column — whichever number in the source represents its
  primary ordering (overall rank, ECR, ADP, whatever the source's main sort is).
  If the source has BOTH a coarse sequential rank (1,2,3...) AND a precise
  decimal value (e.g. ADP like 1.3, 2.1, 14.7), use the precise decimal one,
  not the sequential row order.
- `Tier` (if included): the source's own numeric or letter tier label, as-is —
  don't invent tiers if the source doesn't have them.
- If a player appears twice (e.g. listed once overall and once per-position),
  keep one row, using whichever has more complete data.
- Sort the output by `Rank` ascending.

**If the source has NO combined/overall ranking — only separate positional
lists side by side (a QB table, RB table, WR table, TE table, each with its
own Rank starting at 1)** — don't invent an overall order by guessing at
typical positional value (e.g. assuming RBs/WRs generally go before QBs).
That's outside information the source itself doesn't contain, and dressing
it up as this source's own ranking would misrepresent what it actually says.
Instead:
- Still flatten it into one CSV with columns `Name,Position,Tier,Rank` — but
  `Rank` here means the player's rank *within their own position* (QB1, QB2,
  ... RB1, RB2, ...), not an overall order. Leave each position's numbering
  starting at 1, don't renumber into one continuous sequence.
- Tell me explicitly in your summary that this source has no combined rank,
  so I know to mark it "position-only" when importing (a real option in the
  Rankings Manager's add/edit source modal — it keeps the source's tier
  opinion visible as its own reference column without letting a
  not-really-comparable rank number corrupt the blended board).
- Watch for stray non-data rows some spreadsheet exports leave behind (e.g. a
  section-divider line like "TOP 12 STATS END" sitting in the middle of a
  column) — drop those, they're not players.
- Watch for trailing footnote marks on a name or tier value (e.g. "Player
  Name*" or a tier like "1*") — strip the `*` itself, don't fold it into the
  name or treat it as part of the tier label.

**If the source is a combined "consensus" table with one rank column PER
ANALYST/SITE** (e.g. an average-rank column plus several individual named
columns, each a different analyst's own numeric rank, "-" meaning that
analyst didn't rank the player) **and I ask for specific analysts pulled out
as their own sources:**
- Produce one CSV per analyst requested, each just `Name,Team,Position,Rank`
  using that analyst's own column — never the average/consensus column
  (that's not any one analyst's opinion, and this tool computes its own
  median blend across whatever individual sources you actually import, so
  pre-blending here would double-count). Rows where that analyst's column is
  "-" (unranked) are dropped from *that analyst's* CSV only — they may still
  appear in another analyst's CSV.
- No `Tier` column at all if the source has no tier data of any kind — don't
  invent one. A rank-only source still blends into consensus rank normally
  (see `Rank` above), it just never casts a tier vote, so it can't fabricate
  or shift tier boundaries the way a made-up tier column would.
- These tables often use abbreviated first names/initials (e.g. "J. Gibbs",
  "A.J. Brown") instead of full names — this tool matches players by exact
  normalized name across sources, so an abbreviated name won't match "Jahmyr
  Gibbs" elsewhere and will show up as a false "unmatched player" needing a
  manual merge for every single row. If I've given you other rankings data in
  this same conversation (or you otherwise have a reliable full-name list for
  the same team+position), cross-reference last name + team + position
  against it and expand to the full name found there — this is verifying
  against real data, not guessing, so do it whenever there's a clean single
  match. If a last name + team + position match is ambiguous (multiple
  candidates) or has no match at all, leave the abbreviated name as-is rather
  than inventing a full name from memory, and list every such player in your
  summary so I know which ones will need a manual merge.

**After you produce the CSV**, tell me in 1-2 sentences:
- How many players you dropped and why (K/DST, duplicates, unparseable rows).
- Whether you had to guess/infer anything (e.g. team code from context) rather
  than reading it directly from the source, so I know what to spot-check.

Here's my source data:

[PASTE THE RAW EXPORT HERE]

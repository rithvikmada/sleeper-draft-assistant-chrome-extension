// ============================================================
// 4th&Go — regression tests for shared.js
//
//   node test.js
//
// No dependencies, no build step, no framework — shared.js is plain
// functions over plain data, so a tiny inline harness is all this needs.
// Run it after touching shared.js, and before any change to parseRankings,
// buildConsensus, or median specifically — see AUDIT.md section 11a for why:
// this project's own history is the argument for having this file at all.
// The source-vote-boundary tiering rewrite (see claude.md) passed a
// hand-written simulation against bundled data and then failed on real
// live data, because the simulation tested conditions that flattered it.
// These tests lean on the REAL bundled rankings.js / fp-rankings.js for
// exactly that reason — synthetic data is easy to accidentally write in a
// way that can't reveal the bug you're trying to catch.
//
// Deliberately not a coverage sweep of every function in shared.js. It
// covers what has actually gone wrong in this project before, or what the
// Stage 1 audit found: three separate real parser bugs (TIERS-plural
// header, the Real-Time caption row, RK-vs-REAL-TIME priority), the
// median() numeric-string bug, the position-only isolation fix, the
// value-comparison sign convention, and the echo guard's per-key isolation.
// ============================================================

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ---------- tiny harness ----------
let pass = 0, fail = 0;
const failures = [];
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  failures.push(`${label}\n    got:      ${a}\n    expected: ${e}`);
}
function ok(cond, label) {
  if (cond) { pass++; return; }
  fail++;
  failures.push(`${label}\n    condition was false`);
}
function doesNotThrow(fn, label) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push(`${label}\n    threw: ${e.message}`); }
}

// ---------- load shared.js + the two bundled data files as real code ----------
// classic-script style (no module.exports), same as how the extension loads
// them — so this only tests what actually ships, not a rewritten API.
const REPO = __dirname;
const sandbox = {
  console,
  chrome: { storage: { local: { get: async () => ({}), set: async () => {} } } },
};
vm.createContext(sandbox);
for (const file of ["rankings.js", "fp-rankings.js", "games-played-data.js", "shared.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, file), "utf8"), sandbox, { filename: file });
}
// Top-level `const`/`let` inside a vm-executed script do NOT become
// properties of the context object (only `var` and function declarations
// do) — so the names below have to be pulled out with one more eval rather
// than destructured off `sandbox` directly.
const NAMES = [
  "parseRankings", "buildConsensus", "buildAdpConsensus", "buildValueComparison",
  "validateParsedSource", "usableSources", "median", "norm", "playerKey", "esc",
  "makeSource", "makeAdpSource", "makeEchoGuard", "findOrphans", "findNearMatchOrphans",
  "normalizeTierLabel", "TIER_ORDER", "RANKINGS", "FP_RANKINGS",
  "buildBeerValues", "REPLACEMENT_RANK", "LEAGUE_SETTINGS", "buildTeamPositionRanks", "buildTeamOverallRanks",
  "injuryBadge", "INJURY_META", "gamesPlayedAt", "GAMES_PLAYED_CURVE",
];
const exported = vm.runInContext(`({ ${NAMES.join(", ")} })`, sandbox);
const {
  parseRankings, buildConsensus, buildAdpConsensus, buildValueComparison,
  validateParsedSource, usableSources, median, norm, playerKey, esc,
  makeSource, makeAdpSource, makeEchoGuard, findOrphans, findNearMatchOrphans,
  normalizeTierLabel, TIER_ORDER, RANKINGS, FP_RANKINGS,
  buildBeerValues, REPLACEMENT_RANK, LEAGUE_SETTINGS, buildTeamPositionRanks, buildTeamOverallRanks,
  injuryBadge, INJURY_META, gamesPlayedAt, GAMES_PLAYED_CURVE,
} = exported;

const mk = (id, name, arr) =>
  makeSource(name, arr.map((p) => ({ name: p.name, team: p.team, pos: p.pos, tier: p.tier, rank: p.rank })), { id });

// ============================================================
// parseRankings — the real export shapes this project actually imports,
// plus the garbage cases the Stage 1 audit found being accepted as players.
// ============================================================

{
  // The bundled default and FantasyPros exports must keep parsing at their
  // known-good sizes — this is the regression tripwire for the three real
  // parser bugs this project has already hit (TIERS-plural header not
  // recognized, the Real-Time caption row being misread as the header, RK
  // winning over REAL-TIME when both are present).
  const toCsv = (arr) => "Name,Team,Position,Tier,Rank\n" +
    arr.map((p) => `${p.name},${p.team || ""},${p.pos},${p.tier || ""},${p.rank}`).join("\n");
  eq(parseRankings(toCsv(RANKINGS)).players.length, RANKINGS.length, "bundled default rankings still parse at full size");
  eq(parseRankings(toCsv(FP_RANKINGS)).players.length, FP_RANKINGS.length, "bundled FantasyPros ECR still parses at full size");

  // FantasyPros' Real-Time ADP export: a caption line above the real header,
  // POS.RK instead of POS, team+bye embedded in the name cell, and both a
  // coarse RK column and a precise REAL-TIME column (REAL-TIME must win).
  const realTime = [
    "Real-Time ADP — Redraft Half-PPR 12-team",
    '"RK","PLAYER NAME","POS.RK","REAL-TIME","BEST","WORST"',
    '1,"Jahmyr Gibbs DET (6)","RB1",1.3,1,3',
    '2,"Ja\'Marr Chase CIN (10)","WR1",2.1,1,5',
    '3,"Tyreek Hill FA ()","WR2",12.4,9,20',
  ].join("\n");
  const rt = parseRankings(realTime);
  eq(rt.players.length, 3, "Real-Time ADP export: caption row skipped, 3 players found");
  eq(rt.players[0], { name: "Jahmyr Gibbs", team: "", pos: "RB", tier: "", rank: 1.3 },
    "Real-Time ADP: team/bye stripped from name, POS.RK read as position, REAL-TIME (not RK) used as rank");
  eq(rt.players[2].team, "", "Real-Time ADP: a free agent's empty team+bye parens don't leak into the name");

  // A source using "TIERS" (plural) as its tier header — the real bug that
  // silently loaded every FantasyPros player with an empty tier.
  const tiersPlural = "Name,Team,Position,TIERS,Rank\nBijan Robinson,ATL,RB,1,1";
  eq(parseRankings(tiersPlural).players[0].tier, "1", "TIERS (plural) header is recognized, not just TIER");

  // Garbage inputs — confirmed in the Stage 1 audit to import as fake
  // players with no position. Must be refused by validateParsedSource, the
  // gate all three import paths in rankings-manager.js now go through.
  const garbage = {
    "a recipe": "Ingredients\n2 cups flour\n1 tsp salt\n3 eggs",
    "an HTML page": "<!DOCTYPE html><html><body><h1>Not a CSV</h1></body></html>",
    "bare numbers": "1,2,3\n4,5,6\n7,8,9",
    "a source with no position column": "Player,Rank\nJa'Marr Chase,1\nBijan Robinson,2",
    "empty input": "",
  };
  for (const [label, text] of Object.entries(garbage)) {
    const { players, warnings } = parseRankings(text);
    eq(validateParsedSource(players, warnings).level, "error", `refused: ${label}`);
  }

  // And the inverse — a legitimate-but-unusual export must NOT be refused.
  const positionOnly = "Name,Position,Tier,Rank\nJosh Allen,QB,1,1\nLamar Jackson,QB,1,2";
  eq(validateParsedSource(parseRankings(positionOnly).players, []).level, "ok",
    "a position-only guide (real shape, not garbage) is not refused");

  // Positional tiers (WR1 -> WR) and K/DST rows — this league has none.
  const posTiers = "Name,Team,Position,Rank\nSome Guy,KC,WR1,1\nSome Kicker,KC,K,2";
  const pt = parseRankings(posTiers);
  eq(pt.players.length, 1, "K/DST rows are dropped; positional tier suffix (WR1) is stripped to WR");
  eq(pt.players[0].pos, "WR", "WR1 normalized to WR");
}

// ============================================================
// norm / playerKey — the join key across every source and the live feed
// ============================================================

{
  eq(norm("Kenneth Walker III"), norm("Kenneth Walker"), "suffix (III) is stripped for matching");
  eq(norm("Ja'Marr Chase"), norm("JaMarr Chase"), "apostrophe is stripped for matching");
  eq(norm("D'Andre Swift"), "dandre swift", "apostrophe + normalization, exact form");
  eq(playerKey("Bijan Robinson", "rb"), playerKey("Bijan Robinson", "RB"), "position is case-insensitive");
  ok(playerKey("A", "WR") !== playerKey("A", "RB"), "same name, different position, is a different key");
}

// ============================================================
// median() — the numeric-string bug found while stress-testing corrupted
// input during the Stage 1 audit
// ============================================================

{
  eq(median([1, "3"]), 2, "median coerces numeric strings instead of concatenating (1+'3' bug)");
  eq(median([1, "3", "5"]), 3, "odd-length median with a string input returns a Number, not a string");
  eq(typeof median([1, "3", "5"]), "number", "median never returns a string — the board calls .toFixed() on this");
  eq(median([2, 4]), 3, "plain even-length median, unaffected");
  eq(median([]), null, "empty input returns null, not NaN");
  eq(median(["not a number", 5]), 5, "a genuinely non-numeric entry is dropped, not counted as 0");
}

// ============================================================
// esc() — HTML escaping, added in the audit's security batch
// ============================================================

{
  eq(esc(`A&B <b>Bold</b>`), "A&amp;B &lt;b&gt;Bold&lt;/b&gt;", "escapes & and tags");
  eq(esc(`Boone" style="display:none`), "Boone&quot; style=&quot;display:none", "escapes quotes (the attribute-breakout case)");
  eq(esc(null), "", "null coerces to empty string, not the literal 'null'");
  eq(esc(undefined), "", "undefined coerces to empty string");
  eq(esc(42), "42", "numbers pass through as strings");
  eq(esc("Kenneth Walker III"), "Kenneth Walker III", "clean text is unchanged (no accidental double-escaping)");
}

// ============================================================
// buildConsensus — the invariants this project has broken before:
// position-only source isolation, missing-source penalty-free blending,
// and resilience against a corrupted stored source.
// ============================================================

{
  const def = mk("default", "Flock", RANKINGS);
  const fp = mk("fp", "FantasyPros ECR", FP_RANKINGS);

  const rows = buildConsensus([def, fp], {});
  ok(rows.length > 300, "two bundled sources blend into a real-sized board (sanity floor)");
  ok(rows.every((r) => r.consensus === null || typeof r.consensus === "number"),
    "every row's consensus is a number or null, never a string (median() regression guard)");

  // Position-only source: must NOT touch rank/tier blending when other
  // sources exist, but MUST act as a normal source when it's the only one
  // (the isolation bug fixed 2026-08-23 — see claude.md).
  const posOnly = mk("qbGuide", "QB Guide", RANKINGS.filter((p) => p.pos === "QB"));
  posOnly.positionOnly = true;
  const blended = buildConsensus([def, posOnly], {});
  ok(blended.every((r) => r.ranks["qbGuide"] === undefined),
    "a position-only source alongside others contributes nothing to ranks{} (can't corrupt cross-position blend)");
  const solo = buildConsensus([posOnly], {});
  ok(solo.length > 0 && solo.every((r) => typeof r.consensus === "number"),
    "the SAME position-only source, isolated alone, produces a real consensus (not an all-null board)");

  // A player missing from a source must not be penalized — median just
  // ignores the gap rather than treating it as an infinitely bad rank.
  const a = mk("a", "A", [{ name: "Bijan Robinson", team: "ATL", pos: "RB", tier: "1", rank: 1 }]);
  const b = mk("b", "B", []); // never ranks anyone
  const oneVoter = buildConsensus([a, b], {})[0];
  eq(oneVoter.consensus, 1, "a player missing from one source isn't dragged down — consensus reflects only the sources that ranked them");

  // Corrupted stored source shapes (players missing/null/not-an-array) must
  // no longer throw and blank the whole board.
  doesNotThrow(() => buildConsensus([def, { id: "x", name: "X", enabled: true }], {}),
    "buildConsensus tolerates a stored source with no players array");
  doesNotThrow(() => buildConsensus([def, { id: "x", name: "X", enabled: true, players: null }], {}),
    "buildConsensus tolerates players: null");
  doesNotThrow(() => buildConsensus([def, null, "garbage"], {}),
    "buildConsensus tolerates a null or non-object entry in the sources array");

  // usableSources() itself: null/non-object entries are DROPPED (there's
  // nothing to normalize a null into), while a real object with a bad
  // players shape is KEPT and repaired — that distinction is what lets a
  // malformed stored source stay visible (0 players, fixable via the edit
  // modal) instead of vanishing or crashing.
  eq(usableSources([{ id: "x", players: [1] }, null, { id: "y" }]).length, 2,
    "usableSources drops null/non-object entries but keeps and repairs real ones");
  eq(usableSources([{ id: "y" }])[0].players, [], "a source with no players array gets [] rather than undefined");
}

// ============================================================
// buildValueComparison — the Sleeper-vs-baseline sign convention, verified
// by hand once in this project's history; locked in here so it can't
// silently flip.
// ============================================================

{
  // Sleeper drafts a player LATER (higher ADP number) than the baseline ->
  // positive delta -> green -> a discount specific to Sleeper.
  const sleeper = makeAdpSource("Sleeper Live ADP", [{ name: "Bijan Robinson", pos: "RB", rank: 10 }], { id: "adp_sleeper_live" });
  const baseline = makeAdpSource("FantasyPros ADP", [{ name: "Bijan Robinson", pos: "RB", rank: 3 }], { id: "adp_fp" });
  const vc = buildValueComparison([sleeper, baseline]);
  const entry = vc.get(playerKey("Bijan Robinson", "RB"));
  eq(entry.delta, 7, "Sleeper later than baseline (10 vs 3) -> positive delta -> value/discount, per shared.js's documented convention");

  // And the reverse: Sleeper drafts them EARLIER -> negative delta -> reach.
  const sleeper2 = makeAdpSource("Sleeper Live ADP", [{ name: "Bijan Robinson", pos: "RB", rank: 2 }], { id: "adp_sleeper_live" });
  const vc2 = buildValueComparison([sleeper2, baseline]);
  eq(vc2.get(playerKey("Bijan Robinson", "RB")).delta, -1, "Sleeper earlier than baseline -> negative delta -> reach");

  // No baseline (or no Sleeper source) -> no comparison, not a crash.
  eq(buildValueComparison([sleeper]).size, 0, "no baseline source enabled -> empty comparison map, not an error");
}

// ============================================================
// findNearMatchOrphans — the ambiguity rule ("skip, don't guess")
// ============================================================

{
  // Exactly one same-initial same-lastname candidate -> a confident match.
  const full = mk("full", "Full Names", [{ name: "Kenneth Gainwell", team: "PIT", pos: "RB", tier: "", rank: 50 }]);
  const abbrev = mk("abbrev", "Abbrev Names", [{ name: "K. Gainwell", team: "PIT", pos: "RB", tier: "", rank: 48 }]);
  const matches = findNearMatchOrphans("Kenneth Gainwell", "RB", [full, abbrev], {});
  eq(matches.length, 1, "a single same-initial same-lastname candidate is offered as a match");
  eq(matches[0].name, "K. Gainwell", "the correct candidate is returned");

  // Two same-initial same-lastname players at one position in one source is
  // genuinely ambiguous — must be skipped, never guessed.
  const ambiguous = mk("amb", "Ambiguous", [
    { name: "Brandon Robinson", team: "GB", pos: "WR", tier: "", rank: 90 },
    { name: "B. Robinson", team: "ATL", pos: "RB", tier: "", rank: 5 }, // different position — shouldn't confuse the RB case
    { name: "Bo Robinson", team: "DAL", pos: "RB", tier: "", rank: 91 },
  ]);
  const ambMatches = findNearMatchOrphans("Bijan Robinson", "RB", [ambiguous], {});
  eq(ambMatches.length, 0, "two same-initial same-lastname RBs in one source -> zero matches, not a guess");
}

// ============================================================
// makeEchoGuard — per-key isolation, the fix for the manager silently
// dropping a live pick update while it was saving its own sources
// ============================================================

{
  const g = makeEchoGuard();
  let resolveWrite;
  const pending = g.write("rankingSources", () => new Promise((r) => { resolveWrite = r; }));
  ok(g.isEcho("rankingSources"), "a key is marked as ours while its write is in flight");
  ok(!g.isEcho("draftState"), "a DIFFERENT key is never suppressed by someone else's write (the confirmed cross-key bug)");
  resolveWrite();
  pending.then(() => {
    eq(g.isEcho("rankingSources"), false, "the guard clears once the write settles");
  });

  // A failing write must still clear its guard, or the surface would ignore
  // that key forever.
  g.write("playerFlags", () => Promise.reject(new Error("quota"))).catch(() => {}).then(() => {
    eq(g.isEcho("playerFlags"), false, "a rejected write still clears its guard");
  });
}

// ============================================================
// normalizeTierLabel — the S..O letter scheme, mapped onto numeric TIER_ORDER
// ============================================================

{
  eq(normalizeTierLabel("S"), "1", "S (best) maps to tier 1");
  eq(normalizeTierLabel("A"), "2", "A maps to tier 2, right after S");
  eq(normalizeTierLabel("O"), "16", "O (worst of the 16-letter scheme) maps to tier 16");
  eq(normalizeTierLabel("7"), "7", "an already-numeric tier passes through unchanged");
  eq(normalizeTierLabel("Z"), "Z", "an unrecognized label passes through unchanged rather than being guessed at");
}

// ============================================================
// findOrphans — sanity floor against real bundled data
// ============================================================

{
  const def = mk("default", "Flock", RANKINGS);
  const fp = mk("fp", "FantasyPros ECR", FP_RANKINGS);
  const orphans = findOrphans([def, fp], {});
  ok(Object.keys(orphans).length === 2, "two real sources with genuinely different rosters produce orphans on both sides");
  eq(findOrphans([def], {}), {}, "a single source has nothing to be an orphan relative to");
}

// ============================================================
// GAMES_PLAYED_CURVE / gamesPlayedAt — the real historical games-played
// data (build-games-played-data.js) that replaced the old guessed
// AVG_GAMES_PLAYED constants. Sanity checks on the bundled data + lookup,
// not on the real-world numbers themselves (those are expected to shift
// whenever the curve is regenerated for a new season).
// ============================================================

{
  ["QB", "RB", "WR", "TE"].forEach((pos) => {
    ok(Array.isArray(GAMES_PLAYED_CURVE[pos]) && GAMES_PLAYED_CURVE[pos].length >= 60,
      `${pos} has a real games-played curve with real depth`);
    GAMES_PLAYED_CURVE[pos].forEach((v, i) => {
      ok(v > 0 && v <= 17, `${pos} curve value at rank ${i + 1} (${v}) is a plausible games-played number (0-17)`);
    });
  });
  eq(gamesPlayedAt("QB", 1), GAMES_PLAYED_CURVE.QB[0], "gamesPlayedAt(pos, 1) reads the curve's first entry");
  eq(gamesPlayedAt("QB", 1000), GAMES_PLAYED_CURVE.QB[GAMES_PLAYED_CURVE.QB.length - 1],
    "a rank beyond the curve's real depth clamps to the last (deepest) real data point rather than throwing or guessing further");
  // The real, honest finding from building this (see claude.md): QBs decay
  // steeply in games-played by rank (backups only play when a starter is
  // hurt), while RBs stay comparatively flat even at replacement depth (a
  // low-rank RB is usually a healthy committee back, not an injured one).
  ok(GAMES_PLAYED_CURVE.QB[0] - GAMES_PLAYED_CURVE.QB[39] > GAMES_PLAYED_CURVE.RB[0] - GAMES_PLAYED_CURVE.RB[39],
    "QB's games-played drop-off from rank 1 to rank 40 is steeper than RB's, matching the real finding this build surfaced");
}

// ============================================================
// buildBeerValues — BEER/VBD (backlog #8). This league's exact settings
// (10 teams, 1QB/2RB/2WR/1TE/2FLEX) via LEAGUE_SETTINGS drive
// REPLACEMENT_RANK — checking the derived numbers against hand math catches
// a silent typo in the man-games formula that unit tests on made-up data
// wouldn't (see the file header on why this project leans on real math
// checks, not just synthetic happy-path cases).
// ============================================================

{
  eq(LEAGUE_SETTINGS.teams, 10, "league settings: 10 teams");
  // These used to be one hand-worked division per position against a flat
  // guessed games-played constant. Since 2026-08-25, games-played varies BY
  // RANK (GAMES_PLAYED_CURVE, from real Sleeper season data — see
  // build-games-played-data.js), and REPLACEMENT_RANK is solved iteratively
  // against that curve (computeReplacementRanks, shared.js) rather than by
  // one division. So these are now regression pins against the CURVE DATA
  // ITSELF, not a hand-workable formula — if the bundled games-played-data.js
  // is ever regenerated (a new season rolls into the 3-year window), these
  // numbers are EXPECTED to move and should be updated to match, not treated
  // as a bug. What this test actually protects against is a silent break in
  // the iterative solve or the curve lookup (e.g. an off-by-one on rank
  // indexing), not "did the real-world number change."
  eq(REPLACEMENT_RANK.QB, 11, "QB replacement rank matches the iterative solve against the real games-played curve");
  eq(REPLACEMENT_RANK.RB, 34, "RB replacement rank matches the iterative solve against the real games-played curve");
  eq(REPLACEMENT_RANK.WR, 32, "WR replacement rank matches the iterative solve against the real games-played curve");
  eq(REPLACEMENT_RANK.TE, 14, "TE replacement rank matches the iterative solve against the real games-played curve");
}

{
  // 50 QBs, descending projection, no one drafted — replacement is the
  // REPLACEMENT_RANK.QB-th best, so QB1's value is points(1) - points(that rank).
  const rows = [];
  const projMap = {};
  for (let i = 1; i <= 50; i++) {
    const name = `QB Player ${i}`;
    const key = playerKey(name, "QB");
    rows.push({ key, pos: "QB", name });
    projMap[key] = 400 - i * 5; // strictly descending
  }
  const { values } = buildBeerValues(rows, projMap, new Set());
  const repRank = REPLACEMENT_RANK.QB;
  const p1 = playerKey("QB Player 1", "QB");
  const pRep = playerKey(`QB Player ${repRank}`, "QB");
  eq(values.get(p1), projMap[p1] - projMap[pRep], "QB1's value is its own points minus the replacement-rank QB's points");
  eq(values.get(pRep), 0, "the replacement player itself always values at exactly 0");

  // Live recompute: draft off the top 5 QBs. The replacement player is still
  // "replacement-rank-th best AVAILABLE," which is now that many spots
  // deeper into the original list — replacement level should get worse
  // (lower points), which means QB1's value should go UP relative to the
  // undrafted pool, matching "the best available replacement gets worse as
  // players at that position get drafted" from the build prompt.
  const takenTop5 = new Set(Array.from({ length: 5 }, (_, i) => playerKey(`QB Player ${i + 1}`, "QB")));
  const rowsAfter = rows.filter((r) => !takenTop5.has(r.key));
  const { values: valuesAfter } = buildBeerValues(rowsAfter, projMap, new Set());
  const p6 = playerKey("QB Player 6", "QB"); // now the best available QB
  const pRepAfter = playerKey(`QB Player ${5 + repRank}`, "QB"); // now the replacement-rank-th best available QB
  eq(valuesAfter.get(p6), projMap[p6] - projMap[pRepAfter], "after 5 QBs are drafted, replacement level is recomputed off the replacement-rank-th best AVAILABLE QB");
  ok(valuesAfter.get(p6) > values.get(playerKey("QB Player 6", "QB")), "the same player's value rises once shallower players ahead of them are drafted off, since replacement level degraded");
}

{
  // A player with no projection data shouldn't appear in the value map at
  // all (not defaulted to 0, which would make them look like exactly
  // replacement-level rather than "unknown").
  const rows = [{ key: "x|QB", pos: "QB", name: "No Projection Guy" }];
  const { values } = buildBeerValues(rows, {}, new Set());
  eq(values.has("x|QB"), false, "a player missing from the projections map is excluded from values, not defaulted to 0");
}

// ============================================================
// buildTeamPositionRanks — backlog #13 (team grade vs. league-mates).
// ============================================================

{
  const beerValues = new Map([
    ["qb-a|QB", 40], ["qb-b|QB", 30], ["qb-c|QB", 10],
    ["rb-a|RB", 20], ["rb-b|RB", 5],
  ]);
  const picks = [
    { key: "qb-a|QB", pos: "QB", rosterId: 1 }, // team 1: QB total 40
    { key: "qb-b|QB", pos: "QB", rosterId: 2 }, // team 2: QB total 30
    { key: "qb-c|QB", pos: "QB", rosterId: 3 }, // team 3: QB total 10
    { key: "rb-a|RB", pos: "RB", rosterId: 2 }, // team 2: RB total 20
    { key: "rb-b|RB", pos: "RB", rosterId: 1 }, // team 1: RB total 5
    { key: "unknown|QB", pos: "QB", rosterId: 4 }, // no BEER value — excluded
    { key: "no-team|QB", pos: "QB", rosterId: null }, // no rosterId — excluded
  ];
  const ranks = buildTeamPositionRanks(picks, beerValues);
  eq(ranks[1].QB, { rank: 1, of: 3, total: 40 }, "highest QB total in the league ranks 1st");
  eq(ranks[2].QB, { rank: 2, of: 3, total: 30 }, "middle QB total ranks 2nd");
  eq(ranks[3].QB, { rank: 3, of: 3, total: 10 }, "lowest QB total ranks 3rd");
  // "of" reflects every team seen anywhere in picks, not just teams with a
  // pick at THIS position — a team with zero RBs should count toward the
  // denominator and rank last, not be excluded from it entirely.
  eq(ranks[2].RB, { rank: 1, of: 3, total: 20 }, "team 2's RB total (20) beats team 1's (5) for 1st of 3 teams total");
  eq(ranks[3].RB, { rank: 3, of: 3, total: 0 }, "a team with zero RB picks still counts toward the denominator and ranks last");
  ok(ranks[4] === undefined, "a pick with no computed BEER value doesn't create a team entry off it alone");

  // Live recompute: if team 3's QB value rises above team 1's and 2's
  // (replacement level shifted, or a stronger backup got added), the rank
  // ordering should update with zero changes to picks — same "live, not a
  // snapshot" requirement as buildBeerValues itself.
  const beerValuesAfter = new Map(beerValues);
  beerValuesAfter.set("qb-c|QB", 100);
  const ranksAfter = buildTeamPositionRanks(picks, beerValuesAfter);
  eq(ranksAfter[3].QB.rank, 1, "team 3's QB rank improves once its BEER value rises, with no new picks");
}

// ============================================================
// buildTeamOverallRanks — the overall-team-grade rollup across all
// positions, added as a follow-up to buildTeamPositionRanks above.
// ============================================================

{
  const beerValues = new Map([
    ["qb-a|QB", 40], ["rb-a|RB", 20], ["wr-a|WR", 10], // team 1 total: 70
    ["qb-b|QB", 30], ["rb-b|RB", 5],                   // team 2 total: 35
    ["qb-c|QB", 10],                                    // team 3 total: 10
  ]);
  const picks = [
    { key: "qb-a|QB", pos: "QB", rosterId: 1 },
    { key: "rb-a|RB", pos: "RB", rosterId: 1 },
    { key: "wr-a|WR", pos: "WR", rosterId: 1 },
    { key: "qb-b|QB", pos: "QB", rosterId: 2 },
    { key: "rb-b|RB", pos: "RB", rosterId: 2 },
    { key: "qb-c|QB", pos: "QB", rosterId: 3 },
    { key: "unknown|QB", pos: "QB", rosterId: 4 }, // no BEER value — excluded
  ];
  const ranks = buildTeamOverallRanks(picks, beerValues);
  eq(ranks[1], { rank: 1, of: 3, total: 70 }, "team 1's combined total (70, across QB+RB+WR) ranks 1st overall");
  eq(ranks[2], { rank: 2, of: 3, total: 35 }, "team 2's combined total (35) ranks 2nd overall");
  eq(ranks[3], { rank: 3, of: 3, total: 10 }, "team 3's combined total (10, one QB only) ranks 3rd overall");
  ok(ranks[4] === undefined, "a pick with no computed BEER value doesn't create a team entry off it alone");
}

// ============================================================
// injuryBadge — Sleeper's own injury_status strings mapped to a severity
// bucket that drives badge color everywhere it's shown (board, best picks,
// BEER grid, queue, roster). Recognized statuses must keep their exact
// severity; an unrecognized one must still render (fall through to "other"),
// not silently disappear the way an unhandled tier label used to.
// ============================================================

{
  ok(injuryBadge(undefined) === "", "no injury on file renders no badge");
  ok(injuryBadge({ status: "" }) === "", "an empty status string renders no badge, same as no injury data");

  const q = injuryBadge({ status: "Questionable", bodyPart: "Ankle" });
  ok(q.includes("t-q"), "Questionable maps to the 'q' (gold) severity bucket");
  ok(q.includes(">Q<"), "Questionable's short code is Q");
  ok(q.includes("Ankle"), "body part is included in the tooltip text");

  ok(injuryBadge({ status: "Doubtful" }).includes("t-d"), "Doubtful maps to the 'd' (orange) severity bucket");
  ok(injuryBadge({ status: "Out" }).includes("t-o"), "Out maps to the 'o' (red) severity bucket");
  ok(injuryBadge({ status: "IR" }).includes("t-ir"), "IR gets its own darker-red bucket, distinct from Out");
  ok(injuryBadge({ status: "PUP" }).includes("t-other"), "PUP falls into the neutral 'other' bucket");

  const unknown = injuryBadge({ status: "SomeNewStatus" });
  ok(unknown.includes("t-other"), "an unrecognized status still renders (falls through to 'other'), not dropped");
  ok(unknown.includes(">SOM<"), "an unrecognized status's code is a 3-letter clip of the raw string, uppercased");

  const withTitle = injuryBadge({ status: "Out", bodyPart: "Knee" }, { useTitle: true });
  ok(withTitle.includes('title="'), "useTitle renders a native title attribute for rankings-manager.js, which has no data-tip infra");
  ok(!withTitle.includes("data-tip"), "useTitle does not also emit data-tip");

  const dangerousName = injuryBadge({ status: 'Weird" onmouseover="x', bodyPart: "" });
  ok(!dangerousName.includes('"x"'), "a raw double-quote in an unrecognized status can't break out of the data-tip attribute (escaped by esc())");
}

// ============================================================
console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\nFAILURES:\n");
  failures.forEach((f) => console.log("  ✗ " + f + "\n"));
  process.exitCode = 1;
} else {
  console.log("All checks passed.");
}

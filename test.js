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
  "makeSource", "makeAdpSource", "makeEchoGuard", "findOrphans", "findNearMatchOrphans", "findPossibleDuplicates",
  "normalizeTierLabel", "TIER_ORDER", "RANKINGS", "FP_RANKINGS",
  "buildBeerValues", "REPLACEMENT_RANK", "LEAGUE_SETTINGS", "buildTeamPositionRanks", "buildTeamOverallRanks",
  "injuryBadge", "INJURY_META",
  "POSITIONS", "CORE_POSITIONS", "BEER_POSITIONS", "buildPositionRankValueMap",
  "applySyncedLeagueSettings", "computeReplacementRanks", "activePositions",
  "SCORING_FORMATS", "applySyncedScoringFormat", "setScoringFormatOverride",
  "scoringPtsField", "scoringAdpField",
  "gamesPlayedAt", "GAMES_PLAYED_CURVE",
];
const exported = vm.runInContext(`({ ${NAMES.join(", ")} })`, sandbox);
const {
  parseRankings, buildConsensus, buildAdpConsensus, buildValueComparison,
  validateParsedSource, usableSources, median, norm, playerKey, esc,
  makeSource, makeAdpSource, makeEchoGuard, findOrphans, findNearMatchOrphans, findPossibleDuplicates,
  normalizeTierLabel, TIER_ORDER, RANKINGS, FP_RANKINGS,
  buildBeerValues, REPLACEMENT_RANK, LEAGUE_SETTINGS, buildTeamPositionRanks, buildTeamOverallRanks,
  injuryBadge, INJURY_META,
  SCORING_FORMATS, applySyncedScoringFormat, setScoringFormatOverride,
  scoringPtsField, scoringAdpField,
  POSITIONS, CORE_POSITIONS, BEER_POSITIONS, buildPositionRankValueMap,
  applySyncedLeagueSettings, computeReplacementRanks, activePositions,
  gamesPlayedAt, GAMES_PLAYED_CURVE,
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

  // Positional tiers (WR1 -> WR) are stripped, and K/DEF rows are kept (K/DST
  // support, added 2026-08-26 — K/DEF are valid positions now, not dropped).
  const posTiers = "Name,Team,Position,Rank\nSome Guy,KC,WR1,1\nSome Kicker,KC,K,2\nSome Defense,SF,DEF,3";
  const pt = parseRankings(posTiers);
  eq(pt.players.length, 3, "positional tier suffix (WR1) is stripped to WR; K/DEF rows are kept, not dropped");
  eq(pt.players[0].pos, "WR", "WR1 normalized to WR");
  eq(pt.players[1].pos, "K", "K is a valid position, not dropped");
  eq(pt.players[2].pos, "DEF", "DEF is a valid position, not dropped");

  // A genuinely unrecognized position (not K/DEF, not QB/RB/WR/TE) is still dropped.
  const badPos = "Name,Team,Position,Rank\nSome Guy,KC,WR,1\nMystery Guy,KC,ZZ,2";
  const bp = parseRankings(badPos);
  eq(bp.players.length, 1, "an unrecognized position row is still dropped");
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
// findPossibleDuplicates — found live: TWO sources independently abbreviating
// the same player the same way ("P. Nacua") is invisible to findOrphans
// (which only ever flags a name used by exactly ONE source), since neither
// side looks like a lone single-source anomaly. This is the dedicated
// detector for that case.
// ============================================================

{
  // The exact real scenario this was built from: "Puka Nacua" (used by two
  // sources) and "P. Nacua" (used by two DIFFERENT sources) — neither name
  // variant is a single-source orphan, so findOrphans finds nothing here.
  const srcA = mk("a", "A", [{ name: "Puka Nacua", team: "LAR", pos: "WR", tier: "", rank: 2 }]);
  const srcB = mk("b", "B", [{ name: "Puka Nacua", team: "LAR", pos: "WR", tier: "", rank: 3 }]);
  const srcC = mk("c", "C", [{ name: "P. Nacua", team: "LAR", pos: "WR", tier: "", rank: 4 }]);
  const srcD = mk("d", "D", [{ name: "P. Nacua", team: "LAR", pos: "WR", tier: "", rank: 4 }]);
  eq(Object.keys(findOrphans([srcA, srcB, srcC, srcD], {})).length, 0,
    "findOrphans sees nothing wrong — both name variants are used by 2 sources each, neither looks like a lone anomaly");
  const dupes = findPossibleDuplicates([srcA, srcB, srcC, srcD], {});
  eq(dupes.length, 1, "findPossibleDuplicates catches the real duplicate findOrphans misses");
  ok(
    (dupes[0].nameA === "Puka Nacua" && dupes[0].nameB === "P. Nacua") ||
    (dupes[0].nameA === "P. Nacua" && dupes[0].nameB === "Puka Nacua"),
    "the reported pair is the two Nacua variants"
  );

  // Ambiguity safety: a THIRD same-initial same-lastname player breaks the
  // mutual match and must be skipped, not guessed — same discipline as
  // findNearMatchOrphans.
  const srcE = mk("e", "E", [{ name: "Jaylen Gibbs", team: "DET", pos: "RB", tier: "", rank: 40 }]);
  const srcF = mk("f", "F", [{ name: "Jahmyr Gibbs", team: "DET", pos: "RB", tier: "", rank: 1 }]);
  const srcG = mk("g", "G", [{ name: "J. Gibbs", team: "DET", pos: "RB", tier: "", rank: 1 }]);
  const ambDupes = findPossibleDuplicates([srcE, srcF, srcG], {});
  eq(ambDupes.length, 0,
    "J. Gibbs is ambiguous between Jahmyr and Jaylen Gibbs -> no pair reported, not a guess");

  // Already merged -> not reported again as a "possible" duplicate (it's a
  // confirmed one already, shown in the separate Merged Players list).
  const merged = { [playerKey("P. Nacua", "WR")]: playerKey("Puka Nacua", "WR") };
  eq(findPossibleDuplicates([srcA, srcC], merged).length, 0,
    "a pair already resolved via K_MERGES doesn't show up as a possible duplicate too");

  // Real bug found live: two DIFFERENT real players who just happen to share
  // a last name + first initial (both spelled out in full, neither an
  // abbreviation) must NOT be reported — across a real 350+ player board
  // this coincidence is common and was producing hundreds of false pairs
  // before this was fixed to require an actual abbreviation collision.
  const srcH = mk("h", "H", [{ name: "Diontae Johnson", team: "CAR", pos: "WR", tier: "", rank: 30 }]);
  const srcI = mk("i", "I", [{ name: "David Johnson", team: "FA", pos: "WR", tier: "", rank: 200 }]);
  eq(findPossibleDuplicates([srcH, srcI], {}).length, 0,
    "two different full-named players sharing last name + initial are not flagged as duplicates");
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
  // K added alongside K/DST support (2026-08-26) — same real-data pipeline
  // as QB/RB/WR/TE, not a guess (see build-games-played-data.js). DEF is
  // deliberately not in this list and never will be — see BEER_POSITIONS.
  ["QB", "RB", "WR", "TE", "K"].forEach((pos) => {
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
  // K's real finding, found extending this to K/DST support: kickers play
  // almost every game through roughly the top 30 (streaming/committee
  // kickers are rare at the top), then fall off a cliff much sharper than
  // any other position — a real result, not assumed going in.
  ok(GAMES_PLAYED_CURVE.K[0] - GAMES_PLAYED_CURVE.K[39] > GAMES_PLAYED_CURVE.QB[0] - GAMES_PLAYED_CURVE.QB[39],
    "K's games-played drop-off from rank 1 to rank 40 is even steeper than QB's");
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
  // K, added for K/DST support — same iterative solve, same real curve,
  // just no flex share (K is never flex-eligible): 1 starter x 10 teams =
  // 10 slots x 17 games, converged against K's own real games-played curve.
  eq(REPLACEMENT_RANK.K, 11, "K replacement rank matches the iterative solve against its own real games-played curve");
  ok(REPLACEMENT_RANK.DEF === undefined, "REPLACEMENT_RANK still never has a DEF entry — DEF doesn't participate in BEER at all");
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
// K/DST support (added 2026-08-26) — POSITIONS structurally includes K/DEF,
// DEF is permanently excluded from BEER (no man-games replacement model for
// a team entity), K participates normally, and league shape can sync from a
// real draft's own settings instead of staying hardcoded to this project's
// own league. See claude.md's "K/DST support" section for the full writeup.
// ============================================================

{
  eq(POSITIONS, ["QB","RB","WR","TE","K","DEF"], "POSITIONS structurally includes K/DEF");
  eq(CORE_POSITIONS, ["QB","RB","WR","TE"], "CORE_POSITIONS is still just the original four");
  eq(BEER_POSITIONS, ["QB","RB","WR","TE","K"], "BEER_POSITIONS is CORE_POSITIONS plus K — DEF never joins it");
  eq(activePositions(true), POSITIONS, "activePositions(true) is the full six");
  eq(activePositions(false), CORE_POSITIONS, "activePositions(false) is the original four, same as K/DST being off entirely");
}

{
  // DEF never gets a BEER value at all; K gets a real one, same as any other
  // BEER_POSITIONS entry.
  const projMap2 = { "josh allen|QB": 300, "some kicker|K": 140, "some defense|DEF": 110 };
  const rows2 = [
    { key: "josh allen|QB", pos: "QB" },
    { key: "some kicker|K", pos: "K" },
    { key: "some defense|DEF", pos: "DEF" },
  ];
  const beer2 = buildBeerValues(rows2, projMap2, new Set());
  ok(beer2.values.has("some kicker|K"), "K gets a real BEER value, like any other BEER_POSITIONS entry");
  ok(!beer2.values.has("some defense|DEF"), "DEF never gets a BEER value — no man-games replacement model for a team entity");

  // buildPositionRankValueMap substitutes DEF's raw projected points in place
  // of its (nonexistent) BEER value, for the per-position league-rank badge
  // ONLY — K/QB's real BEER values pass through untouched.
  const posMap = buildPositionRankValueMap(rows2, beer2.values, projMap2);
  eq(posMap.get("some defense|DEF"), 110, "DEF's league-rank value substitutes its raw projected points");
  eq(posMap.get("some kicker|K"), beer2.values.get("some kicker|K"), "K's league-rank value is its real BEER value, untouched by the substitution");
  eq(posMap.get("josh allen|QB"), beer2.values.get("josh allen|QB"), "QB's league-rank value is likewise untouched");
}

{
  // League-shape sync (applySyncedLeagueSettings) — a real draft's own
  // settings should override this project's own hardcoded 10-team shape,
  // and REPLACEMENT_RANK should be recomputed off the new shape, not just
  // LEAGUE_SETTINGS itself.
  const defaultRanks = computeReplacementRanks();
  applySyncedLeagueSettings({ teams: 12, slots_qb: 1, slots_rb: 2, slots_wr: 3, slots_te: 1, slots_flex: 1, slots_k: 1 });
  const syncedSettings = vm.runInContext("LEAGUE_SETTINGS", sandbox);
  const syncedRanks = vm.runInContext("REPLACEMENT_RANK", sandbox);
  eq(syncedSettings.teams, 12, "applySyncedLeagueSettings overwrites teams from the synced draft");
  eq(syncedSettings.starters.WR, 3, "applySyncedLeagueSettings overwrites starters.WR from slots_wr");
  ok(syncedRanks.WR !== defaultRanks.WR, "REPLACEMENT_RANK is recomputed off the new league shape, not left stale");
  ok(syncedRanks.DEF === undefined, "REPLACEMENT_RANK still never has a DEF entry after a sync");

  // A field a draft's settings response doesn't provide (or provides as a
  // non-finite value) falls back to whatever LEAGUE_SETTINGS already had,
  // rather than corrupting it with an unusable value.
  applySyncedLeagueSettings({ teams: "not a number", slots_qb: 1 });
  const partialSettings = vm.runInContext("LEAGUE_SETTINGS", sandbox);
  eq(partialSettings.teams, 12, "a non-finite synced field is ignored, keeping whatever was already there");
  eq(partialSettings.starters.QB, 1, "a provided finite field still applies alongside an ignored one");

  // Restore the default shape so this test's mutation doesn't leak into any
  // other test that might read the sandbox's live LEAGUE_SETTINGS/
  // REPLACEMENT_RANK later.
  applySyncedLeagueSettings({ teams: 10, slots_qb: 1, slots_rb: 2, slots_wr: 2, slots_te: 1, slots_flex: 2, slots_k: 1 });
}

// ============================================================
// Scoring format sync (added 2026-08-26) — every points/ADP fetch defaulted
// to Sleeper's PPR fields unconditionally; confirmed live against a real
// user draft whose own scoring_type is "std" that this was silently wrong
// for anyone not playing full PPR. See claude.md's "Scoring format" section.
// ============================================================
{
  eq(SCORING_FORMATS, ["ppr", "half_ppr", "std"], "the three scoring formats this app understands");
  eq(scoringPtsField(), "pts_ppr", "defaults to PPR before anything syncs");
  eq(scoringAdpField(), "adp_ppr", "same default for the ADP field");

  applySyncedScoringFormat("std");
  eq(scoringPtsField(), "pts_std", "a synced Standard-scoring draft switches the active points field");
  eq(scoringAdpField(), "adp_std", "and the ADP field along with it");

  // An unrecognized/missing scoring_type (a custom-scoring league, or a
  // draft object that doesn't expose it) leaves whatever was already synced
  // rather than silently reverting to PPR.
  applySyncedScoringFormat(undefined);
  eq(scoringPtsField(), "pts_std", "an unrecognized sync value doesn't overwrite the last real one");
  applySyncedScoringFormat("nonsense");
  eq(scoringPtsField(), "pts_std", "same for a garbage string");

  // The manual override is explicitly a BACKUP, not the primary path — it
  // wins over whatever synced until set back to "Auto" (null/empty).
  setScoringFormatOverride("half_ppr");
  eq(scoringPtsField(), "pts_half_ppr", "a manual override wins over the synced format");
  applySyncedScoringFormat("ppr"); // a new draft syncs PPR while the override is still active
  eq(scoringPtsField(), "pts_half_ppr", "the override keeps winning even after a new sync comes in");
  setScoringFormatOverride(null);
  eq(scoringPtsField(), "pts_ppr", "clearing the override (back to Auto) falls back to whatever's synced");
  setScoringFormatOverride("garbage");
  eq(scoringPtsField(), "pts_ppr", "an invalid override value is treated as Auto, not a crash");
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

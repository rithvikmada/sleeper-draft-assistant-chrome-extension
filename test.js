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
for (const file of ["rankings.js", "fp-rankings.js", "shared.js"]) {
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
];
const exported = vm.runInContext(`({ ${NAMES.join(", ")} })`, sandbox);
const {
  parseRankings, buildConsensus, buildAdpConsensus, buildValueComparison,
  validateParsedSource, usableSources, median, norm, playerKey, esc,
  makeSource, makeAdpSource, makeEchoGuard, findOrphans, findNearMatchOrphans,
  normalizeTierLabel, TIER_ORDER, RANKINGS, FP_RANKINGS,
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
console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\nFAILURES:\n");
  failures.forEach((f) => console.log("  ✗ " + f + "\n"));
  process.exitCode = 1;
} else {
  console.log("All checks passed.");
}

// ============================================================
// 4th&Go — shared constants + data helpers
// Loaded by BOTH panel.html (the board window) and rankings-manager.html (full tab)
// so the two surfaces agree on colors, player identity, and storage schema.
//
// NOTE: this file must load BEFORE panel.js / rankings-manager.js, and it owns
// the constants that used to live at the top of panel.js — don't re-declare
// them there, classic scripts share one global scope and it'll throw.
// ============================================================

// Tiers are numbered 1 (best) through 16 — standardized on numbers rather than
// letters so sources like FantasyPros (whose CSV tier column is already numeric)
// don't need translation to line up with the bundled rankings.
const TIER_ORDER = ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16"];
// Letter-graded sources ("S,A,B,C,...,O" is a common 16-tier scheme) get
// mapped onto TIER_ORDER's numeric scale so their tiers actually participate
// in cross-source blending (buildConsensus's depthVotes below keys off
// TIER_ORDER.indexOf, which only ever matches numeric labels) instead of
// being silently invisible to it, and so a single-source view of one of
// these sources gets the app's normal tier colors instead of falling back to
// gray. S is treated as the best tier (maps to "1"), then A-O follow in
// order — this is the standard reading of that scheme, not a guess specific
// to one source's export.
const LETTER_TIER_ORDER = ["S","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"];
function normalizeTierLabel(tier) {
  const t = String(tier || "").trim().toUpperCase();
  if (!t || TIER_ORDER.includes(t)) return t;
  const idx = LETTER_TIER_ORDER.indexOf(t);
  // Unrecognized label (not numeric, not in the S-O scheme) — leave it as-is.
  // renderBoard()'s tier grouping still displays it (ordered by rank among
  // the other groups), it just won't blend numerically with other sources.
  return idx === -1 ? t : String(idx + 1);
}
const TIER_COLORS = {
  1:"#F5C242", 2:"#E8853A", 3:"#D9622F", 4:"#4F9E6B", 5:"#3D8A62", 6:"#357A5A",
  7:"#3A7CA5", 8:"#356E93", 9:"#5B6B8C", 10:"#665C8C", 11:"#7A5C8C", 12:"#8C5C7A",
  13:"#8C5C5C", 14:"#6B5C4A", 15:"#5C5C5C", 16:"#4A4A4A",
};
const POS_COLORS = {
  QB:{ text:"#F5C242", bg:"rgba(245,194,66,.12)", border:"rgba(245,194,66,.35)" },
  RB:{ text:"#5FCF8A", bg:"rgba(95,207,138,.12)", border:"rgba(95,207,138,.35)" },
  WR:{ text:"#5FA8E8", bg:"rgba(95,168,232,.12)", border:"rgba(95,168,232,.35)" },
  TE:{ text:"#E88AC9", bg:"rgba(232,138,201,.12)", border:"rgba(232,138,201,.35)" },
};
const POSITIONS = ["QB","RB","WR","TE"];

// Colors handed out to user-added ranking sources, in order.
const SOURCE_PALETTE = ["#5FA8E8","#E88AC9","#F5C242","#9B8AE8","#5FCFC4","#E8A05F"];

// ---------- storage keys ----------
const K_SOURCES = "rankingSources"; // array of source objects (see makeSource)
const K_DRAFT   = "draftState";     // live picks + manual crossouts, shared by both surfaces
const K_ADP     = "adpData";        // array of ADP source objects (see makeAdpSource) — was a single {players,label} blob before multi-source ADP; old shape is discarded, not migrated
const K_ROSTER  = "myRosterId";     // which draft slot / roster id is the user's
const K_FLAGS   = "playerFlags";    // playerKey -> "favorite" | "avoid", set in the manager, shown everywhere
const K_MERGES  = "playerMerges";   // { variantKey: canonicalKey, ... } — unmatched player reconciliation

// ---------- HTML escaping ----------
// Everything rendered on both surfaces is built as HTML strings and assigned
// via innerHTML, and the values going into those strings are not ours: player
// names come from pasted CSVs and from Sleeper's API, source names are typed
// freehand, and tier labels are whatever a source's tier column happened to
// contain.
//
// This is NOT guarding against an attacker — an extension page runs under
// Manifest V3's script-src 'self' policy, which blocks inline scripts and
// inline event handlers outright, so injected markup cannot execute. What it
// guards against is the board rendering garbage: a name carrying "<" or "&"
// (exactly what you get from pasting a copied web page into the import box
// instead of a CSV) otherwise lands mid-row as real markup and garbles a grid
// whose columns are set per-row. Worse, the same values go into data-key /
// data-name attributes, and if those break, crossing players off silently
// stops working.
//
// Covers both contexts — element text and quoted attribute values — so one
// helper is enough as long as every attribute stays quoted. Values written
// into data-* attributes still round-trip exactly: the browser un-escapes
// them when parsing, so element.dataset gives back the original string.
const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

// ---------- player identity ----------
// Sources disagree on punctuation and suffixes, so identity is normalized
// name + position. This is the join key across every source and the live feed.
const SUFFIXES = /\b(jr|sr|ii|iii|iv|v)\b/g;
function norm(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[.'’\-]/g, "")
    .replace(SUFFIXES, "")
    .replace(/\s+/g, " ")
    .trim();
}
function playerKey(name, pos) {
  return `${norm(name)}|${String(pos || "").toUpperCase()}`;
}

// ---------- sources ----------
function makeSource(name, players, opts = {}) {
  return {
    id: opts.id || `src_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    color: opts.color || SOURCE_PALETTE[0],
    enabled: opts.enabled !== false,
    builtin: !!opts.builtin,
    icon: opts.icon || null, // small square data URL, set via the manager's edit modal — falls back to the color swatch when absent
    importedAt: opts.importedAt || Date.now(), // when the player list was last (re-)uploaded, shown in the edit modal
    // True once a user manually replaces this source's CSV through the edit
    // modal. Only meaningful for the two code-seeded sources (this one and
    // FantasyPros ECR in rankings-manager.js) — it's what tells loadSources()/
    // ensureBuiltinSources() to stop re-seeding from the bundled JS file and
    // trust the stored upload instead, so a manual replacement actually
    // sticks rather than being silently overwritten on the next load.
    manualOverride: !!opts.manualOverride,
    // True for sources whose Rank column is only meaningful WITHIN a
    // position (e.g. "QB rank 3"), not comparable across positions the way
    // every other source's rank is. buildConsensus excludes these entirely
    // from rank/tier blending — mixing a positional rank into the
    // cross-position median would corrupt it for every other source at
    // once. Instead their tier shows up as its own reference column
    // (renderBoard/renderTable), never reshaping the blended board itself.
    positionOnly: !!opts.positionOnly,
    players,
  };
}

// The bundled RANKINGS array (rankings.js) is always source #1 and can't be
// deleted — imports layer on top of it rather than replacing it.
function defaultSource() {
  const players = (typeof RANKINGS !== "undefined" ? RANKINGS : []).map((p) => ({
    name: p.name, team: p.team, pos: p.pos, tier: p.tier, rank: p.rank,
  }));
  return makeSource("Fantasy Flock Rankings", players, {
    id: "default", color: "#5FCF8A", builtin: true,
  });
}

async function loadSources() {
  const v = await chrome.storage.local.get([K_SOURCES]);
  const stored = Array.isArray(v[K_SOURCES]) ? v[K_SOURCES] : [];
  // Re-seed the builtin from rankings.js so a code update to the default
  // ranking set actually takes effect — UNLESS the user has manually replaced
  // its CSV through the edit modal, in which case that upload wins instead
  // (see manualOverride in makeSource).
  const base = defaultSource();
  const existingBase = stored.find((s) => s.id === "default");
  if (existingBase) {
    base.enabled = existingBase.enabled;
    base.icon = existingBase.icon || null;
    if (existingBase.manualOverride) {
      base.manualOverride = true;
      base.players = existingBase.players;
      base.importedAt = existingBase.importedAt;
    }
  }
  return [base, ...stored.filter((s) => s.id !== "default")];
}

async function saveSources(sources) {
  // Persist the builtin's enabled flag, icon, and — only once manually
  // overridden — its player list too (normally left as [] since it's large
  // and regenerable from rankings.js on every load).
  const toStore = sources.map((s) =>
    s.id === "default"
      ? {
          id: "default", name: s.name, color: s.color, enabled: s.enabled, builtin: true,
          icon: s.icon || null, manualOverride: !!s.manualOverride, importedAt: s.importedAt,
          players: s.manualOverride ? s.players : [],
        }
      : s
  );
  await chrome.storage.local.set({ [K_SOURCES]: toStore });
}

// ---------- CSV / paste parsing ----------
// Deliberately forgiving: comma OR tab, optional header, quoted fields.
// Column roles are inferred by shape so users don't have to reformat exports.
function splitLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if ((ch === "," || ch === "\t") && !inQ) {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ""));
}

const HEADER_ALIASES = {
  name: ["name", "player", "player name", "playername"],
  team: ["team", "tm"],
  // "pos.rk" is FantasyPros' Real-Time ADP export — a positional-rank column
  // (values like "RB1", "WR12") that also carries the position itself.
  pos:  ["position", "pos", "pos.rk", "pos rk"],
  tier: ["tier", "tiers"],
  // "real-time" comes first deliberately: FantasyPros' Real-Time ADP export
  // carries both a coarse sequential "RK" column (just row order, 1/2/3/...)
  // and a precise decimal "REAL-TIME" column (the actual live ADP value,
  // e.g. 1.3/2.1/3.2). The real value is what we want, so it's checked ahead
  // of the generic rank aliases — see the priority-ordered lookup below.
  rank: ["real-time", "realtime", "rank", "expert rank", "expertrank", "overall", "ecr", "rk"],
};
// FantasyPros' ADP exports (and others) embed team + bye week right in the
// name cell, e.g. "Jahmyr Gibbs DET (6)" or "Tyreek Hill FA ()" for a
// free agent. Left in place, that breaks playerKey() matching against every
// other source (which just has "Jahmyr Gibbs"), so it's stripped on import.
function stripEmbeddedTeamBye(name) {
  return String(name || "").replace(/\s+[A-Z]{2,4}\s*\(\d*\)\s*$/, "").trim();
}

function looksLikePos(v) { return POSITIONS.includes(String(v).toUpperCase()); }
function looksLikeTeam(v) { return /^[A-Z]{2,3}$/.test(String(v).trim()) && !looksLikePos(v); }
function looksLikeTier(v) { return /^[A-Za-z]$/.test(String(v).trim()); }
function looksLikeNum(v) { return v !== "" && !isNaN(Number(v)); }

// Returns { players, warnings }
function parseRankings(text) {
  const warnings = [];
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { players: [], warnings: ["No rows found."] };

  let rows = lines.map(splitLine);
  let idx = null;

  // --- header row? ---
  // Some exports (FantasyPros' Real-Time ADP among them) prepend a caption
  // line above the real header, e.g. "Real-Time ADP — Redraft Half-PPR...".
  // Scanning only row 0 would score that caption as 0 header hits and fall
  // through to shape-inference with the real header row misread as data (and
  // the position column, which IS on row 1, never even considered). Instead,
  // scan the first few rows and use whichever scores the most header-alias
  // hits — a real header row will always win over a prose caption line.
  let headerRowIdx = 0, headerHits = 0, first = rows[0].map((c) => c.toLowerCase().trim());
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    const cand = rows[i].map((c) => c.toLowerCase().trim());
    const hits = Object.values(HEADER_ALIASES).filter((aliases) => cand.some((c) => aliases.includes(c))).length;
    if (hits > headerHits) { headerHits = hits; headerRowIdx = i; first = cand; }
  }
  // Two or more recognized header words is unambiguous. A single one still
  // counts when the row carries no numbers at all — a real ranking row almost
  // always has a rank, so an all-text first row is a header (catches a
  // one-column "Player" list, which would otherwise import "Player" as a guy).
  if (headerHits >= 2 || (headerHits >= 1 && !first.some(looksLikeNum))) {
    idx = {};
    Object.entries(HEADER_ALIASES).forEach(([role, aliases]) => {
      // Priority is the ALIAS order, not column position — some exports carry
      // more than one plausible column for a role (e.g. both "RK" and
      // "REAL-TIME" for rank), and the earliest-listed alias should win
      // regardless of which column it happens to sit in.
      let at = -1;
      for (const alias of aliases) {
        const found = first.findIndex((c) => c === alias);
        if (found !== -1) { at = found; break; }
      }
      if (at !== -1) idx[role] = at;
    });
    rows = rows.slice(headerRowIdx + 1);
  } else {
    // --- no header: infer column roles from the shape of the data ---
    const sample = rows.slice(0, Math.min(12, rows.length));
    const cols = Math.max(...sample.map((r) => r.length));
    const score = (test) =>
      Array.from({ length: cols }, (_, c) =>
        sample.filter((r) => r[c] !== undefined && test(r[c])).length
      );
    const posS = score(looksLikePos), teamS = score(looksLikeTeam);
    const tierS = score(looksLikeTier), numS = score(looksLikeNum);
    const pick = (arr, used) => {
      let best = -1, bestV = 0;
      arr.forEach((v, i) => { if (v > bestV && !used.has(i)) { best = i; bestV = v; } });
      return bestV >= Math.ceil(sample.length * 0.6) ? best : undefined;
    };
    const used = new Set();
    idx = {};
    idx.pos = pick(posS, used); if (idx.pos !== undefined) used.add(idx.pos);
    idx.team = pick(teamS, used); if (idx.team !== undefined) used.add(idx.team);
    idx.tier = pick(tierS, used); if (idx.tier !== undefined) used.add(idx.tier);
    idx.rank = pick(numS, used); if (idx.rank !== undefined) used.add(idx.rank);
    // name = the widest remaining text column
    let nameCol, nameLen = -1;
    for (let c = 0; c < cols; c++) {
      if (used.has(c)) continue;
      const avg = sample.reduce((a, r) => a + String(r[c] || "").length, 0) / sample.length;
      if (avg > nameLen) { nameLen = avg; nameCol = c; }
    }
    idx.name = nameCol;
    warnings.push("No header row detected — columns were inferred from the data.");
  }

  if (idx.name === undefined) return { players: [], warnings: ["Couldn't find a player-name column."] };

  const players = [];
  let skipped = 0;
  rows.forEach((r, i) => {
    const name = stripEmbeddedTeamBye((r[idx.name] || "").trim());
    if (!name) { skipped++; return; }
    let pos = idx.pos !== undefined ? String(r[idx.pos] || "").toUpperCase().trim() : "";
    // Strip numeric suffixes (WR1 → WR, TE2 → TE) for sources like FantasyPros that use positional tiers
    pos = pos.replace(/\d+$/, "");
    if (pos && !POSITIONS.includes(pos)) { skipped++; return; } // drop K/DEF/unknown
    const rawRank = idx.rank !== undefined ? Number(r[idx.rank]) : NaN;
    players.push({
      name,
      team: idx.team !== undefined ? String(r[idx.team] || "").toUpperCase().trim() : "",
      pos: pos || "",
      tier: idx.tier !== undefined ? String(r[idx.tier] || "").toUpperCase().trim() : "",
      // fall back to file order when there's no usable rank column
      rank: isFinite(rawRank) && rawRank > 0 ? rawRank : i + 1,
    });
  });

  if (!players.some((p) => p.pos)) {
    warnings.push("No position column found — position filters won't work for this source.");
  }
  if (skipped) warnings.push(`${skipped} row(s) skipped (blank name, or a K/DEF position).`);
  return { players, warnings };
}

// Sanity-check a parse result BEFORE it becomes a real source.
//
// parseRankings is deliberately forgiving — that's why real exports import
// without reformatting — but forgiving also means a recipe, a copied HTML
// page, or a grid of bare numbers all "parse" into players. Verified in the
// Stage 1 audit: pasting an HTML page yields one player literally named
// "<!DOCTYPE html>...", and it saves without complaint.
//
// Position is the load-bearing field. buildConsensus and buildAdpConsensus
// both open their player loops with `if (!p.pos) return;`, so a row without a
// position contributes NOTHING — no rank vote, no board row, no ADP value.
// A source where no row has a position is therefore 100% inert while still
// showing a confident player count on its chip, which is exactly the kind of
// silent failure you can't debug with a pick clock running.
//
// Returns { level: "ok"|"warn"|"error", message }. Callers block on "error"
// and show "warn" in the same red-ish note area without blocking — the rule
// is: refuse only what is PROVABLY useless, warn loudly about what merely
// looks wrong, since a legitimate-but-odd export shouldn't be unimportable.
const IMPORT_LOW_POS_COVERAGE = 0.5; // below this share of rows having a position, it's probably the wrong file
function validateParsedSource(players, warnings = []) {
  const total = players.length;
  if (!total) return { level: "error", message: "Couldn't parse any players. " + warnings.join(" ") };

  const withPos = players.filter((p) => p.pos).length;
  if (!withPos) {
    return {
      level: "error",
      message:
        `None of these ${total} rows have a position (QB/RB/WR/TE), so none of them can be ` +
        `matched to players or appear anywhere — the source would import but do nothing. ` +
        `Add a Position column, or check you pasted the right file.`,
    };
  }

  const ignored = total - withPos;
  const sample = players.filter((p) => p.pos).slice(0, 3)
    .map((p) => `${p.name} (${p.pos} ${p.rank})`).join(", ");

  if (withPos / total < IMPORT_LOW_POS_COVERAGE) {
    return {
      level: "warn",
      message:
        `Only ${withPos} of ${total} rows have a position — the other ${ignored} will be ignored ` +
        `completely. That usually means this isn't a rankings export. Parsed so far: ${sample}. ` +
        warnings.join(" "),
    };
  }

  return {
    level: warnings.length || ignored ? "warn" : "ok",
    message:
      `Parsed ${withPos} players — e.g. ${sample}.` +
      (ignored ? ` ${ignored} row(s) without a position will be ignored.` : "") +
      (warnings.length ? " " + warnings.join(" ") : ""),
  };
}

// A stored source whose `players` is missing or isn't an array used to throw
// straight out of buildConsensus ("Cannot read properties of undefined"), and
// because that call sits under every render, the board went blank on EVERY
// load with no way back that didn't involve DevTools. Normalizing once, where
// source lists enter the math, keeps the source visible (its chip shows 0
// players, which is diagnosable and fixable through the edit modal) instead of
// taking the whole surface down.
function usableSources(sources) {
  return (sources || [])
    .filter((s) => s && typeof s === "object")
    .map((s) => (Array.isArray(s.players) ? s : { ...s, players: [] }));
}

// ---------- consensus ----------
// Coerces to Number explicitly, which is not fussiness. Callers filter with
// the loose global isFinite(), and isFinite("3") is true — so a numeric STRING
// could reach this function, and then:
//   median([1, "3"])      -> 6.5   because 1 + "3" is "13", not 4
//   median([1, "3", "5"]) -> "3"   a string, whose .toFixed() then throws and
//                                  blanks the whole board on the next render
// The first is the worse one: a blended rank that is simply wrong while
// looking entirely plausible, with nothing on screen to hint at it.
//
// Coerces rather than discards, matching how forgiving the rest of the import
// path is — a rank that arrived as "3" should count as 3, not quietly stop
// counting. Non-numeric values are dropped so this is total: it always returns
// a Number or null, whatever it is handed.
function median(nums) {
  const s = (nums || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Blends enabled sources into one player list keyed by playerKey.
// Median (not mean) so a single wild source can't drag a player up or down.
// A player missing from a source simply doesn't contribute — they are NOT
// treated as unranked/infinity, which would unfairly bury them.
function buildConsensus(sources, merges = {}) {
  const enabled = usableSources(sources).filter((s) => s.enabled);
  // Position-only sources (Rank/Tier only meaningful within one position,
  // e.g. a QB-only or RB-only guide) never touch rank/tier blending —
  // mixing a positional rank or tier into the cross-position math would
  // corrupt it for every other source at once (see makeSource in this file).
  // The combined sources below drive consensus/tier exactly as before;
  // position-only sources are collected separately into `posOnlyTiers` and
  // surfaced as their own reference column instead (renderBoard/renderTable).
  // Exception: when a position-only source is the ONLY source passed in at
  // all (isolating it via a solo click, in panel.js's activeSources()), there
  // is nothing else for its positional rank to corrupt — so let it act as a
  // normal single blend source instead, showing its own rank/tier as-is.
  // Without this, isolating a position-only source produced an all-null-
  // consensus board ("No available players", "Nothing here") since nothing
  // ever populated `ranks`/ranked it fell into the position-only-only branch.
  const soloing = enabled.length === 1;
  const blendSources = soloing ? enabled : enabled.filter((s) => !s.positionOnly);
  const posOnlySources = soloing ? [] : enabled.filter((s) => s.positionOnly);

  // Each source's own max tier index actually used — the denominator for
  // normalizing that source's tier labels to a comparable 0..1 "depth" scale.
  // See assignBlendedTiers for why this is necessary.
  const maxTierIdx = new Map();
  blendSources.forEach((src) => {
    let max = 0;
    src.players.forEach((p) => {
      if (p.tier) max = Math.max(max, TIER_ORDER.indexOf(normalizeTierLabel(p.tier)));
    });
    maxTierIdx.set(src.id, max);
  });

  const map = new Map();
  const getEntry = (p, key) => {
    if (!map.has(key)) {
      map.set(key, { key, name: p.name, team: p.team, pos: p.pos, tierVotes: [], depthVotes: [], ranks: {}, posOnlyTiers: {}, posOnlyRanks: {} });
    }
    return map.get(key);
  };
  blendSources.forEach((src) => {
    src.players.forEach((p) => {
      if (!p.pos) return;
      let key = playerKey(p.name, p.pos);
      // Apply merges: if this key is a variant, resolve to canonical.
      key = applyMerge(key, merges);
      const e = getEntry(p, key);
      e.ranks[src.id] = p.rank;
      if (!e.team && p.team) e.team = p.team;
      if (p.tier) {
        // Normalized so a letter-graded source's tiers can actually blend
        // with numeric ones (TIER_ORDER.indexOf below only matches "1".."16")
        // instead of being silently excluded from depth-based blending.
        const tier = normalizeTierLabel(p.tier);
        e.tierVotes.push(tier);
        const idx = TIER_ORDER.indexOf(tier);
        const max = maxTierIdx.get(src.id);
        if (idx >= 0 && max > 0) e.depthVotes.push(idx / max);
      }
    });
  });
  // Position-only sources: only ever recorded into posOnlyTiers, keyed by
  // source id, for display — never into ranks/tierVotes/depthVotes above.
  // A player who only appears in a position-only source (never in any
  // combined source) still gets an entry so their tier reference shows up
  // somewhere, but they'll have no rank/blended tier of their own.
  posOnlySources.forEach((src) => {
    src.players.forEach((p) => {
      if (!p.pos) return;
      let key = playerKey(p.name, p.pos);
      key = applyMerge(key, merges);
      const e = getEntry(p, key);
      if (!e.team && p.team) e.team = p.team;
      if (p.tier) e.posOnlyTiers[src.id] = String(p.tier).trim();
      // Within-position rank (e.g. this source's "WR2") — needed so Best
      // Picks can tell which player is this source's TOP recommendation
      // within a position, not just its tier band. See renderBestPicksWidget.
      if (isFinite(p.rank)) e.posOnlyRanks[src.id] = p.rank;
    });
  });
  const out = [...map.values()].map((e) => {
    const vals = Object.values(e.ranks).filter((v) => isFinite(v));
    return {
      key: e.key, name: e.name, team: e.team, pos: e.pos, ranks: e.ranks, posOnlyTiers: e.posOnlyTiers, posOnlyRanks: e.posOnlyRanks,
      // With exactly one active blending source, its own tier label is
      // meaningful as-is. With 2+, filled in below — see assignBlendedTiers.
      tier: blendSources.length <= 1 ? modeTier(e.tierVotes) : "",
      depth: e.depthVotes.length ? median(e.depthVotes) : null,
      consensus: median(vals), sourceCount: vals.length,
    };
  });
  out.sort((a, b) => (a.consensus ?? 1e9) - (b.consensus ?? 1e9));
  if (blendSources.length > 1) assignBlendedTiers(out);
  return out;
}

// A player's tier from a single source is used as-is (see buildConsensus).
// It exists only for that single-vote case; ties never arise with one vote.
function modeTier(votes) {
  if (!votes.length) return "";
  const counts = {};
  votes.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
  let best = votes[0], bestCount = 0;
  Object.entries(counts).forEach(([t, c]) => {
    if (c > bestCount || (c === bestCount && TIER_ORDER.indexOf(t) < TIER_ORDER.indexOf(best))) {
      best = t; bestCount = c;
    }
  });
  return best;
}

// Two sources' tier LABELS aren't on the same scale — Flock's "tier 6" and
// FantasyPros' "tier 6" don't represent the same quality band, they're just
// independently-drawn cutoffs that happen to share a number. But each source's
// tier DEPTH — how far down that source's own hierarchy a player sits, as a
// fraction of the deepest tier that source uses (`e.depth` from buildConsensus,
// e.g. "top 3 of 16" -> 0.19) — IS comparable across sources, since it's
// relative to each source's own scale rather than the raw label.
//
// This blends that depth (median across sources, same pattern as rank), forces
// it to only get worse (never better) as blended rank worsens so a tier can
// never contradict the rank it's built from, then buckets by EQUAL-WIDTH bands
// on that depth score (not equal player counts). Where sources genuinely agree
// a lot of players sit at similar depth, the tier stays big — that's real
// signal carried over from the sources' own tiering, not this code forcing an
// even split.
//
// A source-vote-boundary version (count how many sources place an exact tier
// break between each adjacent pair in blended rank order) was tried and
// reverted 2026-08-23: real per-source tier boundaries almost never land on
// the exact same rank-adjacent pair across sources, even when they broadly
// agree there's a cliff nearby (one source breaks between rank 14/15, another
// between 16/17 — zero overlap under exact-pair matching despite real
// agreement). That made "majority agreement at this exact pair" nearly
// impossible to reach across most of the draft, collapsing into one huge
// leftover tier — worse than this depth-based version, not better. A
// windowed/clustering approach (treating nearby-but-not-identical boundaries
// as the same cliff) might fix that properly, but needs real design work
// before trying again — don't re-attempt the naive exact-pair version.
function assignBlendedTiers(sortedRows) {
  let running = 0;
  sortedRows.forEach((r) => {
    // Missing depth (no source tiered this player) falls back to the depth of
    // the last player who had one, so a gap in tier data doesn't reset progress.
    if (r.depth !== null) running = Math.max(running, r.depth);
    r._depthEff = running;
  });
  const n = TIER_ORDER.length;
  sortedRows.forEach((r) => {
    const idx = Math.min(Math.floor(r._depthEff * n), n - 1);
    r.tier = TIER_ORDER[idx];
    delete r._depthEff;
  });
}

// ---------- shared widgets ----------
// Both surfaces render these from the SAME function against different DOM nodes,
// so "the board agrees with the manager" is true by construction rather than by
// two copies of the markup drifting apart. Pass a container element, not an id.

// Two-letter tag for a source's dot ("Fantasy Flock Rankings" -> "FF",
// "FantasyPros ECR" -> "FE") — a single initial collides whenever two source
// names share a first letter, which is common ("Fantasy Flock" / "FantasyPros").
function sourceTag(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(name || "").slice(0, 2).toUpperCase();
}

// A source's dot, used everywhere a source needs a small visual identifier
// (Best Picks cards, the always-visible source list). Renders the icon
// uploaded via the Rankings Manager's edit modal when the source has one,
// falling back to the existing color-swatch + 2-letter tag otherwise — the
// same fallback pattern used for the manager's own chip swatches.
function sourceDotHtml(s, { solo = false, title } = {}) {
  const cls = `dot${solo ? " solo" : ""}${s.icon ? " has-icon" : ""}`;
  const inner = s.icon ? `<img src="${esc(s.icon)}" alt="" />` : esc(sourceTag(s.name));
  return `<span class="${cls}" data-solo="${esc(s.id)}" style="background:${esc(s.color)}" title="${esc(title ?? s.name)}">${inner}</span>`;
}

// opts: { rows, sources, takenSet:Set<key>, adp, soloSource, posFilter, onSolo(id|null) }
// `rows` must be consensus across ALL enabled sources (not solo-filtered) so
// every source's agreement can be checked, even though only the active source's
// dot always shows. Isolating a source re-sorts the top 3 by that source's own
// rank instead of the blended consensus. Position-filtering is the CALLER's
// job (pre-filter `rows` before passing them in) — doing it here would also
// need to reach into `sourceTopPick` below, and filtering upstream makes
// "each source's own #1 pick" naturally scope to that position for free.
// `posFilter` is only used for the medal label text, so a filtered view
// doesn't silently look identical to the unfiltered one.
function renderBestPicksWidget(el, opts) {
  if (!el) return;
  const { rows = [], sources = [], takenSet = new Set(), adp = null, valueMap = null, soloSource = null, posFilter = "ALL", onSolo, flags = {} } = opts || {};
  // `rows` here is always the FULL multi-source consensus (see panel.js's
  // renderRecommendations) so every source's dot stays visible — which means
  // a position-only source never wrote anything into `r.ranks` (see
  // buildConsensus: it only gets that treatment when it's the ONLY source in
  // the whole call, which isn't the case here). Isolating one has to read its
  // rank from `r.posOnlyRanks` instead, or every row gets filtered out and
  // Best Picks goes blank for that source's isolation view.
  const soloIsPosOnly = soloSource && sources.find((s) => s.id === soloSource)?.positionOnly;
  const soloRank = (r) => (soloIsPosOnly ? r.posOnlyRanks?.[soloSource] : r.ranks[soloSource]);
  let displayRows = rows;
  if (soloSource) {
    displayRows = rows
      .filter((r) => soloRank(r) !== undefined)
      .slice()
      .sort((a, b) => soloRank(a) - soloRank(b));
  }
  const top = displayRows.filter((r) => !takenSet.has(r.key)).slice(0, 3);
  const posLabel = posFilter && posFilter !== "ALL" ? ` ${posFilter}` : "";
  const medals = [
    { label: `1ST — BEST${posLabel} AVAILABLE`, color: "#F5C242" },
    { label: "2ND", color: "#C9CAD1" },
    { label: "3RD", color: "#C98A5F" },
  ];
  if (!top.length) {
    el.innerHTML = posLabel
      ? `<div class="empty" style="grid-column:1/-1">No available${posLabel} players — everyone's off the board.</div>`
      : `<div class="empty" style="grid-column:1/-1">No available players — add a ranking source in the Rankings Manager.</div>`;
    return;
  }
  // Each enabled source's own single best-available pick (excluding taken
  // players) — a dot on a card means THAT source's #1 pick is this exact
  // player, not merely that the source has them ranked somewhere. Almost
  // every source ranks almost every player, so "ranked at all" is meaningless
  // as a signal; "agrees this is the best pick" is the useful one.
  const sourceTopPick = new Map(); // sourceId -> playerKey
  sources.filter((s) => s.enabled).forEach((s) => {
    if (s.positionOnly) {
      // A position-only source's rank is only meaningful WITHIN a position
      // (its "WR2" isn't comparable to its "RB2"), so it can't have one true
      // overall top pick the way a blended source does. Instead: find this
      // source's best-ranked player within each position actually shown on
      // the cards, then — if that yields candidates from more than one
      // position (e.g. its own WR2 AND its own RB2 both land on cards) —
      // dot only the single one that ranks highest on OUR blended board,
      // so the source still gets exactly one dot, not one per position.
      const byPos = new Map();
      top.forEach((r) => {
        const rk = r.posOnlyRanks?.[s.id];
        if (rk === undefined) return;
        const cur = byPos.get(r.pos);
        if (!cur || rk < cur.rk) byPos.set(r.pos, { key: r.key, rk, consensus: r.consensus ?? Infinity });
      });
      let bestKey = null, bestConsensus = Infinity;
      byPos.forEach((c) => {
        if (bestKey === null || c.consensus < bestConsensus) { bestKey = c.key; bestConsensus = c.consensus; }
      });
      if (bestKey) sourceTopPick.set(s.id, bestKey);
      return;
    }
    let bestKey = null, bestRank = Infinity;
    rows.forEach((r) => {
      if (takenSet.has(r.key)) return;
      const rk = r.ranks[s.id];
      if (rk !== undefined && rk < bestRank) { bestRank = rk; bestKey = r.key; }
    });
    if (bestKey) sourceTopPick.set(s.id, bestKey);
  });
  el.innerHTML = top.map((r, i) => {
    const m = medals[i];
    const c = POS_COLORS[r.pos] || { text: "var(--dim2)", bg: "transparent", border: "var(--line2)" };
    // The active solo source's dot always shows (these cards ARE its picks).
    // Every other source's dot shows only if ITS OWN #1 pick is this player.
    const dots = sources
      .filter((s) => s.enabled && (s.id === soloSource || sourceTopPick.get(s.id) === r.key))
      .map((s) => sourceDotHtml(s, {
        solo: soloSource === s.id,
        title: s.positionOnly
          ? `${s.name}: ${r.pos}${r.posOnlyRanks?.[s.id] ?? "—"}`
          : `${s.name}: rank ${r.ranks[s.id] ?? "—"}`,
      }))
      .join("");
    const adpV = adp ? adp.map.get(r.key) : undefined;
    const displayRank = soloSource ? soloRank(r) : r.consensus;
    // Short tag, not the full source name, in the RANK tile's label — a long
    // name ("Fantasy Flock Rankings") wraps and makes the whole card grid
    // jump height when isolating a source.
    const rankTileLabel = soloSource
      ? `${sourceTag(sources.find((s) => s.id === soloSource)?.name || "")} RANK`
      : `RANK · ${r.sourceCount} SRC`;
    const rankTileValue = displayRank != null ? displayRank.toFixed(1) : "—";
    // Same Sleeper-vs-baseline metric and color scale as the tier board's
    // VALUE bar (buildValueComparison) — the two surfaces used to show two
    // different numbers both labeled "ADP", which read as a bug rather than
    // two intentionally distinct metrics. Now they always agree.
    const vc = valueMap ? valueMap.get(r.key) : null;
    const deltaHtml = vc
      ? ` <span style="color:${valueColor(vc.delta)}">${vc.delta > 0 ? "+" : ""}${vc.delta.toFixed(0)}</span>`
      : "";
    const adpTileValue = adpV !== undefined ? adpV.toFixed(1) : "—";
    return `<div class="bestCard" style="border-top-color:${m.color}">
      <div class="bestTop">
        <span class="medal" style="color:${m.color}">${m.label}</span>
        <span class="posTeamChip" style="color:${c.text};background:${c.bg};border-color:${c.border}">${esc(r.pos)}${r.team ? " · " + esc(r.team) : ""}</span>
      </div>
      <div class="bestName">${flagBadge(flags[r.key])}${esc(r.name)}</div>
      <div class="statTiles">
        <div class="statTile">
          <div class="statLabel">${esc(rankTileLabel)}</div>
          <div class="statValue">${rankTileValue}</div>
        </div>
        <div class="statTile">
          <div class="statLabel">ADP</div>
          <div class="statValue">${adpTileValue}${deltaHtml}</div>
        </div>
      </div>
      <div class="srcDots">${dots}</div>
    </div>`;
  }).join("");

  if (onSolo) {
    el.querySelectorAll("[data-solo]").forEach((dot) => {
      dot.addEventListener("click", () => {
        onSolo(soloSource === dot.dataset.solo ? null : dot.dataset.solo);
      });
    });
  }
}

// A persistent, always-visible list of every enabled source — the per-card
// dots on renderBestPicksWidget only show a source when it agrees with that
// specific pick, so a source with no dot anywhere still needs a way to be
// selected. opts: { sources, soloSource, onSolo(id|null) }
function renderSourceListWidget(el, opts) {
  if (!el) return;
  const { sources = [], soloSource = null, onSolo } = opts || {};
  const enabled = sources.filter((s) => s.enabled);
  if (enabled.length < 2) { el.innerHTML = ""; return; }
  el.innerHTML = enabled.map((s) => sourceDotHtml(s, { solo: soloSource === s.id })).join("");
  if (onSolo) {
    el.querySelectorAll("[data-solo]").forEach((dot) => {
      dot.addEventListener("click", () => {
        onSolo(soloSource === dot.dataset.solo ? null : dot.dataset.solo);
      });
    });
  }
}

// opts: { picks:[{pos,byMe}], myRosterId }
function renderTeamCountsWidget(el, opts) {
  if (!el) return;
  const { picks = [], myRosterId = null } = opts || {};
  if (myRosterId == null) {
    el.innerHTML = `<span class="teamHint">Set your draft slot # in settings to track your own roster.</span>`;
    return;
  }
  const mine = picks.filter((p) => p.byMe);
  const counts = POSITIONS.map((pos) => {
    const n = mine.filter((p) => p.pos === pos).length;
    const c = POS_COLORS[pos];
    return `<span class="cnt" style="border-color:${c.border}">
      <span style="color:${c.text}">${pos}</span> <b>${n}</b></span>`;
  }).join("");
  el.innerHTML = `<span class="teamHint">MY TEAM (slot ${myRosterId})</span>${counts}
    <span class="cnt"><span style="color:var(--dim2)">TOT</span> <b>${mine.length}</b></span>`;
}

// ---------- ADP ----------
// Multiple ADP sources can be enabled at once (Sleeper live, FFC live, a
// pasted FantasyPros export, ...) — same shape/pattern as ranking `sources`,
// so the same toggle/rename/remove UI conventions apply.
function makeAdpSource(name, players, opts = {}) {
  return {
    id: opts.id || `adp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    color: opts.color || SOURCE_PALETTE[0],
    enabled: opts.enabled !== false,
    icon: opts.icon || null, // small square data URL, set via the manager's edit modal
    players, // [{name,pos,rank}] — rank here means "ADP value"
    importedAt: opts.importedAt || Date.now(),
  };
}
async function loadAdpSources() {
  const v = await chrome.storage.local.get([K_ADP]);
  const raw = v[K_ADP];
  let list = Array.isArray(raw) ? raw : []; // pre-multi-source single-object shape is discarded, not migrated
  // One-time cleanup: FFC was removed as a source (2026-08-23) — drop any
  // leftover entry from a prior session rather than leaving a dead chip.
  if (list.some((s) => s.id === "adp_ffc_live")) {
    list = list.filter((s) => s.id !== "adp_ffc_live");
    await saveAdpSources(list);
  }
  return list;
}
async function saveAdpSources(list) {
  await chrome.storage.local.set({ [K_ADP]: list });
}
// Blends enabled ADP sources into one map, median across sources — same
// blending rule as buildConsensus, minus tiers (ADP has no tier concept).
// Returns Map<playerKey, { values: {sourceId: rank}, median }>.
function buildAdpConsensus(adpSources) {
  const enabled = usableSources(adpSources).filter((s) => s.enabled);
  const map = new Map();
  enabled.forEach((src) => {
    src.players.forEach((p) => {
      if (!p.pos) return;
      const key = playerKey(p.name, p.pos);
      if (!map.has(key)) map.set(key, { key, values: {} });
      map.get(key).values[src.id] = p.rank;
    });
  });
  map.forEach((e) => {
    const vals = Object.values(e.values).filter((v) => isFinite(v));
    e.median = vals.length ? median(vals) : null;
  });
  return map;
}

// The value/reach signal compares Sleeper's OWN live ADP against a trusted
// baseline (typically a manually-imported FantasyPros Real-Time export) —
// not "my rank" at all. If Sleeper drafts someone LATER than the baseline
// says he should go, Sleeper specifically is undervaluing him = a discount
// (value). If Sleeper drafts him EARLIER than baseline, Sleeper drafters are
// paying up for him relative to the wider market = a reach.
// "Sleeper Live ADP" is recognized by its fixed id (adp_sleeper_live, set by
// the auto-fetch button). The baseline is whichever OTHER enabled source(s)
// exist, blended via median if more than one — so this still works if the
// user only has a FantasyPros import enabled alongside Sleeper, without
// needing to manually designate a "baseline" source.
function buildValueComparison(adpSources) {
  const enabled = usableSources(adpSources).filter((s) => s.enabled);
  const sleeper = enabled.find((s) => s.id === "adp_sleeper_live");
  const baselineSources = enabled.filter((s) => s.id !== "adp_sleeper_live");
  const map = new Map(); // key -> { sleeperAdp, baselineAdp, delta }
  if (!sleeper || !baselineSources.length) return map;

  const sleeperMap = new Map();
  sleeper.players.forEach((p) => {
    if (!p.pos || !isFinite(p.rank)) return;
    sleeperMap.set(playerKey(p.name, p.pos), p.rank);
  });
  const baselineVotes = new Map(); // key -> [rank, rank, ...]
  baselineSources.forEach((src) => {
    src.players.forEach((p) => {
      if (!p.pos || !isFinite(p.rank)) return;
      const key = playerKey(p.name, p.pos);
      if (!baselineVotes.has(key)) baselineVotes.set(key, []);
      baselineVotes.get(key).push(p.rank);
    });
  });
  sleeperMap.forEach((sleeperAdp, key) => {
    const votes = baselineVotes.get(key);
    if (!votes || !votes.length) return;
    const baselineAdp = median(votes);
    map.set(key, { sleeperAdp, baselineAdp, delta: sleeperAdp - baselineAdp });
  });
  return map;
}

// Legacy single-map accessor, kept for the board window's Best Picks widget
// (which only needs one blended ADP number, not per-source columns) — median
// across whichever ADP sources are enabled.
async function loadAdp() {
  const list = await loadAdpSources();
  const enabled = list.filter((s) => s.enabled);
  if (!enabled.length) return null;
  const consensus = buildAdpConsensus(list);
  const map = new Map();
  consensus.forEach((e, key) => { if (e.median !== null) map.set(key, e.median); });
  if (!map.size) return null;
  const label = enabled.length === 1 ? enabled[0].name : `${enabled.length}-source ADP blend`;
  return { map, label, sourceCount: enabled.length };
}

// Shared magnitude scale for ALL ADP-gap signals (the tier board's value bar
// and the Best Picks card's ADP delta both use this) — a flat number of
// picks apart, not a percentage of the ADP round. A percent-of-ADP scale was
// tried first and measurably backfired: near the top of the draft ADP values
// are clustered in a tiny range (1.1–3.0), so even a trivial half-pick gap
// between sources computes as a huge percentage and lights up bright green,
// while a genuinely large 5-10 pick gap in the middle rounds computes as a
// small percentage and reads as gray/noise — the opposite of the real signal.
// A flat pick-count scale doesn't have that blowup: "5 picks apart" means the
// same thing whether it happens at pick 3 or pick 103.
const VALUE_FULL_PICKS = 15;   // gap size (in picks) that maps to full-strength color + a full-width bar
const VALUE_LIGHT_PICKS = 4;   // gap size that starts registering as a light color instead of gray
function valueColor(delta) {
  if (delta === null || delta === undefined) return "var(--dim)";
  const mag = Math.abs(delta);
  if (mag >= VALUE_FULL_PICKS)  return delta >= 0 ? "#5FCF8A" : "#C97A6E";
  if (mag >= VALUE_LIGHT_PICKS) return delta >= 0 ? "#8FBF7A" : "#B8907A";
  return "var(--dim2)";
}

// Big diverging bar — chosen by the user over a solid badge and a full-row
// tint (three variants rendered for comparison). Signed number on the left,
// a wide track on the right with a fill growing from the center: right/green
// for value, left/red for reach. Bigger and more literal than the original
// thin-line meter this replaced, which read as too subtle to scan quickly.
// delta comes from buildValueComparison — delta = sleeperAdp - baselineAdp;
// positive (green) = Sleeper undervalues them = discount/value, negative
// (red) = Sleeper drafters pay up for them vs the wider market = reach.
// baselineAdp is only used to decide whether a comparison exists at all —
// see the magnitude-scale comment above for why it's NOT used to scale the
// bar's color/width anymore.
function renderValueBadge(delta, baselineAdp) {
  if (delta === null || delta === undefined || !isFinite(baselineAdp) || baselineAdp <= 0) {
    return `<span class="vbig vbig-empty" title="Need both Sleeper Live ADP and another ADP source enabled">·</span>`;
  }
  const color = valueColor(delta);
  const widthPct = delta === 0 ? 0 : Math.max(Math.min(Math.abs(delta) / VALUE_FULL_PICKS, 1) * 50, 2); // small tick even for a near-zero gap, so the bar never looks broken/empty
  const side = delta >= 0 ? "left:50%;" : "right:50%;";
  const sign = delta > 0 ? "+" : "";
  const verdict = delta >= 0 ? "value (Sleeper drafts them later than baseline)" : "reach (Sleeper drafts them earlier than baseline)";
  return `<span class="vbig" title="Sleeper ${sign}${delta.toFixed(0)} picks vs baseline — ${verdict}">
    <span class="vbig-num" style="color:${color}">${sign}${delta.toFixed(0)}</span>
    <span class="vbig-track"><span class="vbig-fill" style="${side}width:${widthPct}%;background:${color}"></span></span>
  </span>`;
}

// ---------- storage echo guard ----------
// Both surfaces write the same chrome.storage.local keys and both listen for
// changes, so each has to ignore the change event its own write produces.
// That was a single boolean per surface — which meant that while the manager
// was saving its sources, it also dropped GENUINE updates to every other key,
// including live picks arriving from the board window. A missed pick update
// isn't corrected until the next write, which during a real draft can be a
// minute away, and nothing on screen says the tab went stale.
//
// Tracking keys individually fixes that: writing sources only ever suppresses
// the sources event. The count (rather than a flag) matters because writes to
// one key can overlap — persistDraftState can fire again before the previous
// one settles, and a plain boolean would be cleared by whichever finished
// first, un-guarding the other.
//
// NOTE — still unresolved: this assumes chrome.storage.onChanged fires before
// the set() promise resolves, which Chrome does not document. If it fires
// after, the guard never matches and each surface simply re-reads and
// re-renders its own write: harmless, but wasted work. Confirming it needs a
// loaded extension (log inside the listener and check whether it runs while a
// key is still marked pending). If it turns out to fire after, switch this to
// comparing the incoming newValue against what the surface already holds,
// which doesn't depend on ordering at all.
function makeEchoGuard() {
  const pending = new Map(); // storage key -> number of our writes still in flight
  return {
    // Marks `keys` as ours for the duration of `fn()`, whatever the outcome.
    async write(keys, fn) {
      const list = [].concat(keys);
      list.forEach((k) => pending.set(k, (pending.get(k) || 0) + 1));
      try {
        return await fn();
      } finally {
        list.forEach((k) => {
          const n = (pending.get(k) || 1) - 1;
          if (n <= 0) pending.delete(k); else pending.set(k, n);
        });
      }
    },
    isEcho(key) { return pending.has(key); },
  };
}

// ---------- shared draft state ----------
// panel.js owns writing this (it's the surface that polls Sleeper).
// rankings-manager.js reads it and can add/remove manual crossouts.
async function loadDraftState() {
  const v = await chrome.storage.local.get([K_DRAFT]);
  return v[K_DRAFT] || { draftId: null, picks: [], manualKeys: [], updatedAt: null };
}
async function saveDraftState(state) {
  await chrome.storage.local.set({ [K_DRAFT]: { ...state, updatedAt: Date.now() } });
}

// ---------- favorite / avoid flags ----------
// Set from the Rankings Manager, displayed everywhere (board rows, best-picks cards).
async function loadFlags() {
  const v = await chrome.storage.local.get([K_FLAGS]);
  return v[K_FLAGS] || {};
}
async function saveFlags(flags) {
  await chrome.storage.local.set({ [K_FLAGS]: flags });
}
function flagBadge(flag) {
  if (flag === "favorite") return `<span class="flagMark fav" title="Favorited">★</span>`;
  if (flag === "avoid") return `<span class="flagMark avoid" title="Flagged to avoid">⊘</span>`;
  return "";
}

// ---------- player merges (unmatched reconciliation) ----------
// When sources disagree on name/position for the same player (nicknames, spelling),
// users can manually merge them. Stored as { variantKey: canonicalKey, ... }.
// applyMerge() resolves a key through the merge map; buildConsensus() uses it to
// group variants before calculating ranks, so merged players get one blended rank.
async function loadMerges() {
  const v = await chrome.storage.local.get([K_MERGES]);
  return v[K_MERGES] || {};
}
async function saveMerges(merges) {
  await chrome.storage.local.set({ [K_MERGES]: merges });
}
function applyMerge(key, merges) {
  // Resolve a player key through the merge map: if it's a variant, return canonical.
  return merges[key] || key;
}

// Find orphans: players appearing in only 1 source (candidates for merging).
// Returns { sourceId: [playerKeys...], ... } grouped by source they appear in.
function findOrphans(sources, merges = {}) {
  const enabled = usableSources(sources).filter((s) => s.enabled);
  if (enabled.length < 2) return {}; // No merges needed with 0-1 sources.

  const sourceMap = new Map(); // key → Set of sourceIds it appears in
  enabled.forEach((src) => {
    src.players.forEach((p) => {
      if (!p.pos) return;
      let key = playerKey(p.name, p.pos);
      key = applyMerge(key, merges);
      if (!sourceMap.has(key)) sourceMap.set(key, new Set());
      sourceMap.get(key).add(src.id);
    });
  });

  const orphans = {};
  sourceMap.forEach((sources, key) => {
    if (sources.size === 1) {
      const srcId = [...sources][0];
      if (!orphans[srcId]) orphans[srcId] = [];
      orphans[srcId].push(key);
    }
  });
  return orphans;
}

// Given one canonical player (a name already shown on the board, e.g. from
// the consensus table), find every OTHER source's player that's almost
// certainly the same person under a different spelling — same last name +
// first initial + position, same fallback pattern already trusted elsewhere
// in this app for matching a live Sleeper pick to a rankings row (see
// matchPick in panel.js). Only auto-offers a source's player when it's the
// SINGLE such candidate there — if a source has two same-initial same-
// lastname players at that position (rare, but possible), it's ambiguous and
// gets skipped rather than guessed, exactly like matchPick's own safety
// check (`loose.length === 1`). Used by the Rankings Manager's right-click
// "merge near matches" menu, to resolve several sources' worth of name-
// mismatch orphans against one player in a single action instead of hunting
// them down one at a time in the (rank-limited) orphans list.
function findNearMatchOrphans(canonicalName, canonicalPos, sources, merges = {}) {
  const canonicalKey = playerKey(canonicalName, canonicalPos);
  const normed = norm(canonicalName);
  const tokens = normed.split(" ");
  const lastName = tokens[tokens.length - 1];
  const firstInitial = normed.charAt(0);
  const matches = [];
  usableSources(sources).filter((s) => s.enabled).forEach((src) => {
    // If this source already resolves (directly or via an existing merge) to
    // the canonical key, there's nothing to find here.
    const hasExact = src.players.some(
      (p) => p.pos === canonicalPos && applyMerge(playerKey(p.name, p.pos), merges) === canonicalKey
    );
    if (hasExact) return;
    const candidates = src.players.filter((p) => {
      if (p.pos !== canonicalPos) return false;
      const key = applyMerge(playerKey(p.name, p.pos), merges);
      if (key === canonicalKey) return false;
      const n = norm(p.name);
      return n.endsWith(" " + lastName) && n.charAt(0) === firstInitial;
    });
    if (candidates.length === 1) {
      const p = candidates[0];
      matches.push({ srcId: src.id, srcName: src.name, name: p.name, pos: p.pos, rank: p.rank, key: playerKey(p.name, p.pos) });
    }
  });
  return matches;
}

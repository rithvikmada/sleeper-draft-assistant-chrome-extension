// ============================================================
// 4th&Go — shared constants + data helpers
// Loaded by BOTH panel.html (side panel) and rankings-manager.html (full tab)
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
const K_ADP     = "adpData";        // { players:[{name,pos,adp}], importedAt, label }
const K_ROSTER  = "myRosterId";     // which draft slot / roster id is the user's
const K_FLAGS   = "playerFlags";    // playerKey -> "favorite" | "avoid", set in the manager, shown everywhere
const K_MERGES  = "playerMerges";   // { variantKey: canonicalKey, ... } — unmatched player reconciliation

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
  // Always re-seed the builtin from rankings.js so a code update to the default
  // ranking set actually takes effect instead of being pinned to a stale copy.
  const base = defaultSource();
  const existingBase = stored.find((s) => s.id === "default");
  if (existingBase) base.enabled = existingBase.enabled;
  return [base, ...stored.filter((s) => s.id !== "default")];
}

async function saveSources(sources) {
  // Persist the builtin's enabled flag but not its (large, regenerable) player list.
  const toStore = sources.map((s) =>
    s.id === "default"
      ? { id: "default", name: s.name, color: s.color, enabled: s.enabled, builtin: true, players: [] }
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
  pos:  ["position", "pos"],
  tier: ["tier", "tiers"],
  rank: ["rank", "expert rank", "expertrank", "overall", "ecr", "rk"],
};

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
  const first = rows[0].map((c) => c.toLowerCase().trim());
  const headerHits = Object.values(HEADER_ALIASES).filter((aliases) =>
    first.some((c) => aliases.includes(c))
  ).length;
  // Two or more recognized header words is unambiguous. A single one still
  // counts when the row carries no numbers at all — a real ranking row almost
  // always has a rank, so an all-text first row is a header (catches a
  // one-column "Player" list, which would otherwise import "Player" as a guy).
  if (headerHits >= 2 || (headerHits >= 1 && !first.some(looksLikeNum))) {
    idx = {};
    Object.entries(HEADER_ALIASES).forEach(([role, aliases]) => {
      const at = first.findIndex((c) => aliases.includes(c));
      if (at !== -1) idx[role] = at;
    });
    rows = rows.slice(1);
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
    const name = (r[idx.name] || "").trim();
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

// ---------- consensus ----------
function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Blends enabled sources into one player list keyed by playerKey.
// Median (not mean) so a single wild source can't drag a player up or down.
// A player missing from a source simply doesn't contribute — they are NOT
// treated as unranked/infinity, which would unfairly bury them.
function buildConsensus(sources, merges = {}) {
  const enabled = sources.filter((s) => s.enabled);
  // Each source's own max tier index actually used — the denominator for
  // normalizing that source's tier labels to a comparable 0..1 "depth" scale.
  // See assignBlendedTiers for why this is necessary.
  const maxTierIdx = new Map();
  enabled.forEach((src) => {
    let max = 0;
    src.players.forEach((p) => {
      if (p.tier) max = Math.max(max, TIER_ORDER.indexOf(String(p.tier)));
    });
    maxTierIdx.set(src.id, max);
  });

  const map = new Map();
  enabled.forEach((src) => {
    src.players.forEach((p) => {
      if (!p.pos) return;
      let key = playerKey(p.name, p.pos);
      // Apply merges: if this key is a variant, resolve to canonical.
      key = applyMerge(key, merges);
      if (!map.has(key)) {
        map.set(key, { key, name: p.name, team: p.team, pos: p.pos, tierVotes: [], depthVotes: [], ranks: {} });
      }
      const e = map.get(key);
      e.ranks[src.id] = p.rank;
      if (!e.team && p.team) e.team = p.team;
      if (p.tier) {
        e.tierVotes.push(p.tier);
        const idx = TIER_ORDER.indexOf(String(p.tier));
        const max = maxTierIdx.get(src.id);
        if (idx >= 0 && max > 0) e.depthVotes.push(idx / max);
      }
    });
  });
  const out = [...map.values()].map((e) => {
    const vals = Object.values(e.ranks).filter((v) => isFinite(v));
    return {
      key: e.key, name: e.name, team: e.team, pos: e.pos, ranks: e.ranks,
      // With exactly one active source, its own tier label is meaningful as-is.
      // With 2+, filled in below — see assignBlendedTiers.
      tier: enabled.length <= 1 ? modeTier(e.tierVotes) : "",
      depth: e.depthVotes.length ? median(e.depthVotes) : null,
      consensus: median(vals), sourceCount: vals.length,
    };
  });
  out.sort((a, b) => (a.consensus ?? 1e9) - (b.consensus ?? 1e9));
  if (enabled.length > 1) assignBlendedTiers(out);
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
// so "the sidebar agrees with the manager" is true by construction rather than by
// two copies of the markup drifting apart. Pass a container element, not an id.

// Two-letter tag for a source's dot ("Fantasy Flock Rankings" -> "FF",
// "FantasyPros ECR" -> "FE") — a single initial collides whenever two source
// names share a first letter, which is common ("Fantasy Flock" / "FantasyPros").
function sourceTag(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(name || "").slice(0, 2).toUpperCase();
}

// opts: { rows, sources, takenSet:Set<key>, adp, soloSource, onSolo(id|null) }
// `rows` must be consensus across ALL enabled sources (not solo-filtered) so
// every source's agreement can be checked, even though only the active source's
// dot always shows. Isolating a source re-sorts the top 3 by that source's own
// rank instead of the blended consensus.
function renderBestPicksWidget(el, opts) {
  if (!el) return;
  const { rows = [], sources = [], takenSet = new Set(), adp = null, soloSource = null, onSolo, flags = {} } = opts || {};
  let displayRows = rows;
  if (soloSource) {
    displayRows = rows
      .filter((r) => r.ranks[soloSource] !== undefined)
      .slice()
      .sort((a, b) => a.ranks[soloSource] - b.ranks[soloSource]);
  }
  const top = displayRows.filter((r) => !takenSet.has(r.key)).slice(0, 3);
  const medals = [
    { label: "1ST — BEST AVAILABLE", color: "#F5C242" },
    { label: "2ND", color: "#C9CAD1" },
    { label: "3RD", color: "#C98A5F" },
  ];
  if (!top.length) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1">No available players — add a ranking source in the Rankings Manager.</div>`;
    return;
  }
  // Each enabled source's own single best-available pick (excluding taken
  // players) — a dot on a card means THAT source's #1 pick is this exact
  // player, not merely that the source has them ranked somewhere. Almost
  // every source ranks almost every player, so "ranked at all" is meaningless
  // as a signal; "agrees this is the best pick" is the useful one.
  const sourceTopPick = new Map(); // sourceId -> playerKey
  sources.filter((s) => s.enabled).forEach((s) => {
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
      .map((s) => `<span class="dot${soloSource === s.id ? " solo" : ""}" data-solo="${s.id}"
            style="background:${s.color}" title="${s.name}: rank ${r.ranks[s.id] ?? "—"}">${sourceTag(s.name)}</span>`)
      .join("");
    const adpV = adp ? adp.map.get(r.key) : undefined;
    const displayRank = soloSource ? r.ranks[soloSource] : r.consensus;
    // Short tag, not the full source name, in the meta line — a long name
    // ("Fantasy Flock Rankings rank 30.1") wraps to a second line and makes
    // the whole card grid jump height when isolating a source.
    const rankLabel = soloSource
      ? `${sourceTag(sources.find((s) => s.id === soloSource)?.name || "")} rank ${displayRank?.toFixed(1) ?? "—"}`
      : `rank ${displayRank?.toFixed(1) ?? "—"} <span style="color:var(--dim)">(${r.sourceCount} src)</span>`;
    const d = adpV !== undefined ? adpDelta(displayRank, adpV) : null;
    return `<div class="bestCard" style="border-top-color:${m.color}">
      <div class="medal" style="color:${m.color}">${m.label}</div>
      <div class="bestName">${flagBadge(flags[r.key])}${r.name}</div>
      <div class="bestMeta">
        <span class="posChip" style="color:${c.text};background:${c.bg};border-color:${c.border}">${r.pos}</span>
        ${r.team ? " " + r.team : ""} · ${rankLabel}
        ${d !== null ? ` · <span style="color:${adpDeltaColor(d)}">ADP ${adpV} (${d > 0 ? "+" : ""}${d.toFixed(0)})</span>` : ""}
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
  el.innerHTML = enabled.map((s) => `<span class="dot${soloSource === s.id ? " solo" : ""}" data-solo="${s.id}"
        style="background:${s.color}" title="${s.name}">${sourceTag(s.name)}</span>`).join("");
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
// NOTE: Sleeper publishes NO public ADP endpoint (docs.sleeper.com lists none —
// verified, don't go hunting for one again). ADP is therefore imported by the
// user like any other file, and cached here until they replace it.
async function loadAdp() {
  const v = await chrome.storage.local.get([K_ADP]);
  const d = v[K_ADP];
  if (!d || !Array.isArray(d.players)) return null;
  const map = new Map();
  d.players.forEach((p) => map.set(playerKey(p.name, p.pos), p.rank));
  return { map, label: d.label || "ADP", importedAt: d.importedAt };
}

// Positive delta = market drafts them LATER than you rank them = value.
function adpDelta(rank, adp) {
  if (!isFinite(rank) || !isFinite(adp)) return null;
  return adp - rank;
}
function adpDeltaColor(delta) {
  if (delta === null) return "var(--dim)";
  if (delta >= 12) return "#5FCF8A";
  if (delta >= 5)  return "#8FBF7A";
  if (delta <= -12) return "#C97A6E";
  if (delta <= -5)  return "#B8907A";
  return "var(--dim2)";
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
  const enabled = sources.filter((s) => s.enabled);
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

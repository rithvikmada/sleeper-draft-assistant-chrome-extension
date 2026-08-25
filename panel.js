// ============================================================
// 4th&Go — Sleeper live draft board
// Polls Sleeper's public read-only API (no login required):
//   GET https://api.sleeper.app/v1/draft/{draft_id}/picks
// Matches picks to your rankings by normalized name + position.
//
// Visuals below follow the "4th&Go Draft Board Redesign" project imported
// from claude.ai/design (file "Draft Board Wide.dc.html") — see claude.md.
// rankings-manager.html/js are untouched by this pass and keep the original
// "turf" theme + shared.js widgets; the render helpers in this file (ico(),
// posBadgeHtml(), valueDeltaHtml(), renderTeamCountsV2(), etc.) are local to
// this surface for exactly that reason — shared.js's renderBestPicksWidget /
// renderTeamCountsWidget / renderSourceListWidget still exist unmodified for
// whatever needs the old visual, this file just no longer calls them.
// ============================================================

// TIER_ORDER / POS_COLORS / norm() / etc. live in shared.js, which loads first.

// ---------- design-system render helpers (local to this surface) ----------
// Icon set: Lucide (1.5-2px stroke, rounded caps, 24px grid) — same set the
// design import specifies, substituted since no icon binaries shipped with
// it (see the design system's own readme.md). The import's Icon component
// pulls each glyph from unpkg.com/lucide-static at render time; that CDN
// isn't reachable from every network (corporate proxies, offline, a flaky
// connection mid-draft), and this is a tool meant to keep working exactly
// then, so the handful of icons actually used here (7) are inlined as local
// SVG data instead of fetched — same visual result, no runtime dependency on
// a third-party host staying up.
const ICON_SVG = {
  "settings": `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
  "external-link": `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`,
  "unplug": `<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v3a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>`,
  "rotate-cw": `<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>`,
  "star": `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`,
  "circle-x": `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`,
  "flag": `<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>`,
};
function iconDataUri(name) {
  const inner = ICON_SVG[name] || "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  // Single-quoted url() deliberately — this sits inside a double-quoted HTML
  // style="..." attribute (see ico() below), and a double-quoted url() there
  // closes the attribute early.
  return `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;
}
function ico(name, { size = 14, color = "currentColor", extra = "" } = {}) {
  const url = iconDataUri(name);
  return `<span class="icon" aria-hidden="true" style="width:${size}px;height:${size}px;background-color:${color};-webkit-mask-image:${url};mask-image:${url};${extra}"></span>`;
}

// Position palette for this surface only — distinct object from shared.js's
// POS_COLORS (which rankings-manager.js still uses for its old-style chips).
const POS_V2 = {
  QB: { fg: "var(--pos-qb)", bg: "var(--pos-qb-tint)" },
  RB: { fg: "var(--pos-rb)", bg: "var(--pos-rb-tint)" },
  WR: { fg: "var(--pos-wr)", bg: "var(--pos-wr-tint)" },
  TE: { fg: "var(--pos-te)", bg: "var(--pos-te-tint)" },
};
function posTint(pos) { return POS_V2[pos] || { fg: "var(--pos-flex)", bg: "var(--chalk-a12)" }; }

function posBadgeHtml(pos, rank, size = "md") {
  const t = posTint(pos);
  return `<span class="posBadge2 ${size}" style="background:${t.bg};color:${t.fg};border-color:${t.bg}">${esc(pos)}${rank != null ? `<span class="r">${esc(rank)}</span>` : ""}</span>`;
}

function valueDeltaHtml(value) {
  if (value === null || value === undefined) return `<span class="valDelta flat">·</span>`;
  const up = value > 0, flat = value === 0;
  const cls = flat ? "flat" : up ? "up" : "down";
  return `<span class="valDelta ${cls}">${up ? "+" : ""}${value.toFixed(0)}</span>`;
}

// A small pulsing dot next to the VALUE bar — colored to the player's
// position, shown only once the current pick number has passed their
// BASELINE ADP (the manually-imported FantasyPros/other source, same
// `baselineAdp` buildValueComparison already computes for the VALUE bar's
// delta — not Sleeper's own live ADP, which is what the VALUE bar is
// comparing baseline against in the first place). They were "supposed" to be
// off the board by now per the wider market and aren't.
function adpBlinkDotHtml(pos, baselineAdp) {
  if (currentPickNo == null || baselineAdp == null || !isFinite(baselineAdp)) return "";
  if (currentPickNo <= baselineAdp) return "";
  const t = posTint(pos);
  return `<span class="adpBlinkDot" style="background:${t.fg};color:${t.fg}" title="Pick ${currentPickNo} has passed their baseline ADP (${baselineAdp.toFixed(1)}) — still on the board"></span>`;
}

function badgeHtml(tone, text) {
  return `<span class="badge2 t-${tone}">${esc(text)}</span>`;
}

// Small colored chip identifying a ranking source — this surface's version of
// shared.js's sourceDotHtml(), same fallback (icon if uploaded, else 2-letter
// tag on the source's color), restyled for the new token set.
function sourceChipHtml(s, { solo = false, title } = {}) {
  // has-icon zeroes the chip's padding (see .srcChip.has-icon in panel.html)
  // so an uploaded icon fills the whole box edge-to-edge instead of sitting
  // inset with the source color showing as a border around it — the 2-letter
  // fallback tag still wants that padding, since it's real text, not an image.
  const cls = `srcChip${solo ? " solo" : ""}${s.icon ? " has-icon" : ""}`;
  const inner = s.icon ? `<img src="${esc(s.icon)}" alt="" />` : esc(sourceTag(s.name));
  return `<span class="${cls}" data-solo="${esc(s.id)}" style="background:${esc(s.color)}" title="${esc(title ?? s.name)}">${inner}</span>`;
}

function setStatus(cls, text) {
  const el = $("status");
  el.className = cls;
  el.textContent = text;
  const dot = $("statusDot");
  dot.className = "statusDot" + (cls.indexOf("live") !== -1 ? " live" : cls.indexOf("err") !== -1 ? " err" : "");
}

// ---------- name matching ----------
// Matches a Sleeper pick (first/last/pos) against the CURRENT blended consensus
// rows (whatever sources are active/enabled right now) — not a fixed player
// list — so an imported source's players match too, not just the bundled default.
function buildMatchIndex(rows) {
  const byName = new Map();
  rows.forEach((r) => {
    const n = norm(r.name);
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(r);
  });
  return { rows, byName };
}

function matchPick(first, last, pos, index) {
  const n = norm(`${first} ${last}`);
  const cands = index.byName.get(n);
  if (cands) {
    const posMatch = cands.find((r) => r.pos === pos);
    return posMatch || cands[0];
  }
  // fallback: last name + first initial + position (catches "Ken Walker" vs "Kenneth Walker")
  const ln = norm(last);
  const fi = norm(first).charAt(0);
  const loose = index.rows.filter(
    (r) => r.pos === pos && norm(r.name).endsWith(" " + ln) && norm(r.name).charAt(0) === fi
  );
  if (loose.length === 1) return loose[0];
  return null;
}

// ---------- state ----------
let taken = {};        // playerKey -> { byMe: bool, pickNo: number|null }
let manualTaken = {};  // playerKey -> true, clicks made by hand (kept separate so a re-poll doesn't wipe them)
let myRosterId = null; // user-entered draft slot / roster id — drives the "mine" highlight and the manager's position counts
const echo = makeEchoGuard(); // per-key, so writing flags can't also swallow a live pick update
let pollTimer = null;
let posFilter = "ALL";
// POS_FILTER_GROUPS / filterMatchesPos now live in shared.js, shared with rankings-manager.js.
let lastPickCount = 0;
let unmatched = [];
let currentDraftId = null;
let inFlight = false;
let errorStreak = 0;
let checkCount = 0;
let lastChangeTime = null;
const FAST_INTERVAL_MS = 3000;   // matches Sleeper's edge cache window (s-maxage=15) — polling faster wastes requests for zero benefit
const MAX_INTERVAL_MS = 8000;    // backoff ceiling if Sleeper errors out
const CACHE_MAXAGE_S = 15;       // Sleeper's edge cache s-maxage
let cacheAgeAtFetch = null;      // Sleeper's "age" header from the last response
let cacheAgeFetchedAt = null;    // local Date when that response was received
let lastSuccessAt = null;        // local Date of the last poll that actually came back OK — drives the staleness warning
// If polling silently stops (a timer that never fires, a wedged request, the
// tab being throttled), nothing on screen changes: the board keeps showing its
// last good state and the status line keeps saying LIVE. That's the worst
// shape a draft-day failure can take. Past this many seconds without a
// successful poll, say so loudly instead.
const STALE_AFTER_S = 30;
let countdownTimer = null;

// Multi-source ranking state, shared with the Rankings Manager tab via storage.
// The manager curates these; this panel only reads them to build recommendations.
let sources = [];
let adp = null;
let adpSources = []; // multiple ADP sources (Sleeper Live, a pasted FantasyPros export, ...) — for the board's per-row ADP columns + value badge
let soloSource = null; // when set, best-picks are computed from just this source
let lastSharedPicks = []; // source-agnostic record of every drafted player, by playerKey
let flags = {}; // playerKey -> "favorite" | "avoid", set in the Rankings Manager
let merges = {}; // variantKey → canonicalKey, unmatched player reconciliation
let projMap = {}; // playerKey -> projected PPR points, feeds buildBeerValues() (BEER/VBD, shared.js)
// "Last call" state for the "On tap" card (see renderBest()) — was a random
// 1-in-12 roll, changed to a real threshold (crossing RARE_BEER_VALUE) per
// direct feedback: a random trigger with no meaning read as "is something
// wrong" rather than a fun flourish. rareAlerted just prevents re-toasting
// on every ~3s poll tick while the SAME activation is still ongoing.
let rareAlerted = false;
let showTaken = false; // independent toggle, layered on top of posFilter
let playerSearch = ""; // name/team substring filter, layered on top of posFilter/showTaken
let currentPickNo = null; // next pick about to happen (picks synced so far + 1) — drives the row's live-ADP blink dot

// ---------- rendering ----------
// Both the BEST grid and the tier board are built from the SAME blended
// consensus rows the Best Picks widget uses (respecting soloSource isolation
// via activeSources()) — they used to be hardcoded to the bundled default
// rankings file only, which is why isolating a source or adding an import
// never changed what the board showed.
function bestAvailable() {
  const rows = buildConsensus(activeSources(sources, soloSource), merges);
  const out = {};
  ["QB","RB","WR","TE"].forEach((pos) => {
    out[pos] = rows.find((r) => r.pos === pos && !taken[r.key] && !manualTaken[r.key]);
  });
  return out;
}

// Per-team roster-need weighting for the crown ONLY — see claude.md before
// touching this. Direct user feedback: plain BEER has no idea what's
// already on your roster, so the "objective best" crown kept landing on RB
// almost every single render (RB's replacement pool is deep — 43 — so an
// early/mid RB's gap over replacement tends to run bigger than other
// positions', regardless of how many RBs you already have), and reading
// that over and over nudges you to keep taking RBs. This does NOT touch the
// actual BEER numbers shown anywhere (cards, manager table) — it only
// discounts a position's SCORE when picking which card gets the crown, so
// the methodology itself stays pure and inspectable; only the "which one
// wins" decision gets roster-aware.
//
// TEAM_TARGET_SLOTS is this team's own rough target depth per position —
// starters (LEAGUE_SETTINGS.starters) + this team's share of its own 2 FLEX
// spots (using the same FLEX_SHARE ratios as the league-wide replacement
// calc, rounded) + 1 bench buffer. Documented assumption, not derived, same
// as FLEX_SHARE/AVG_GAMES_PLAYED — revisit if it feels off in practice.
const TEAM_TARGET_SLOTS = { QB: 2, RB: 4, WR: 4, TE: 2 };
// Each pick beyond target multiplies the crown-selection score by 0.6 —
// not a hard cutoff, so a truly exceptional value can still win the crown,
// it just needs to be that much bigger to overcome the discount rather than
// being disqualified outright once you're "full" at a position.
function crownNeedMultiplier(pos, draftedCount) {
  const over = draftedCount - TEAM_TARGET_SLOTS[pos];
  return over > 0 ? Math.pow(0.6, over) : 1;
}

// A BEER value has to cross this to trigger the rare "Last call" card
// treatment (see below) — was a random 1-in-12 roll, changed to a real
// threshold per direct feedback: randomness with no meaning read as
// confusing/"is something wrong" rather than a fun flourish. This number is
// a rough judgment call (comfortably above what a normal early/mid-round
// pick's value looks like in practice), not derived from anything — tune it
// if it fires too often or too rarely once used against real drafts.
const RARE_BEER_VALUE = 150;

// BEST QB/RB/WR/TE grid — each card is that position's best-available player
// BY BEER VALUE (not consensus rank, per the decision logged in claude.md:
// this grid's job is "best pick if I want this specific position," which is
// a value question, not a rank one). Whichever ONE of the four cards has the
// single highest NEED-WEIGHTED value (see crownNeedMultiplier above) gets an
// "On tap" tag and an accent border — that's the answer to "what's the
// objective best pick right now, any position, given what I already have."
// The one-sentence "what is BEER" explanation lives in a single info-icon
// tooltip above this grid (panel.html, `.bestHead .infoDot`) — deliberately
// not repeated per-card.
// Crown/rare highlight only turns on after this many full rounds are
// drafted — direct feedback: BEER's replacement-level signal is noisiest in
// the opening rounds (little separation yet at most positions, see the
// "when should I use BEER" reasoning in claude.md — consensus/tier is the
// more trustworthy read early, BEER's edge is real but grows through the
// middle rounds as scarcity actually develops). Highlighting a "best pick"
// off a still-noisy number for the first several rounds was actively
// steering picks the wrong way. Cards still show every position's
// best-by-value player and its BEER number the whole draft — only the
// crown/rare treatment is gated, not the underlying data.
const HIGHLIGHT_AFTER_ROUND = 6;

function renderBest() {
  const rows = buildConsensus(activeSources(sources, soloSource), merges);
  const isGone = (r) => !!(taken[r.key] || manualTaken[r.key]);
  const { values: beerValues } = buildBeerValues(rows, projMap, takenKeySet());
  const roundsCompleted = Math.floor(lastSharedPicks.length / LEAGUE_SETTINGS.teams);
  const highlightsEnabled = roundsCompleted >= HIGHLIGHT_AFTER_ROUND;
  const myCounts = {};
  POSITIONS.forEach((pos) => { myCounts[pos] = 0; });
  lastSharedPicks.forEach((p) => { if (p.byMe && myCounts[p.pos] !== undefined) myCounts[p.pos]++; });
  const best = {};
  POSITIONS.forEach((pos) => {
    const candidates = rows.filter((r) => r.pos === pos && !isGone(r) && beerValues.has(r.key));
    if (candidates.length) {
      // The card itself still shows the position's TRUE best-by-value
      // player — need-weighting only affects which position wins the crown
      // below, not which player represents a position that's already on
      // the board.
      best[pos] = candidates.reduce((a, b) => (beerValues.get(b.key) > beerValues.get(a.key) ? b : a));
    } else {
      // No projection data for anyone left at this position — fall back to
      // consensus rank so the card still shows someone instead of going blank.
      best[pos] = rows.filter((r) => r.pos === pos && !isGone(r))
        .sort((a, b) => (a.consensus ?? Infinity) - (b.consensus ?? Infinity))[0];
    }
  });
  let objectiveBestPos = null, objectiveBestScore = -Infinity;
  if (highlightsEnabled) {
    POSITIONS.forEach((pos) => {
      const p = best[pos];
      if (!p) return;
      const v = beerValues.get(p.key);
      if (v === undefined) return;
      const score = v * crownNeedMultiplier(pos, myCounts[pos]);
      if (score > objectiveBestScore) { objectiveBestScore = score; objectiveBestPos = pos; }
    });
  }
  const crownedVal = objectiveBestPos ? beerValues.get(best[objectiveBestPos].key) : undefined;
  // Threshold-based, deterministic — recomputed every render, but only
  // toasts on the transition into "rare" (not on every poll tick while it
  // stays true, and not again for the same ongoing activation). Gated by
  // highlightsEnabled same as the crown itself — no rare toast before
  // round 6 either, same reasoning.
  const nowRare = highlightsEnabled && crownedVal !== undefined && crownedVal >= RARE_BEER_VALUE;
  if (nowRare && !rareAlerted) {
    toast(`🍺 Rare pour — this pick's BEER value (${crownedVal.toFixed(1)}) cleared the rare threshold. Worth a serious look.`);
  }
  rareAlerted = nowRare;
  $("best").innerHTML = POSITIONS.map((pos) => {
    const t = posTint(pos);
    const p = best[pos];
    const val = p ? beerValues.get(p.key) : undefined;
    const isObjectiveBest = pos === objectiveBestPos;
    const isRare = isObjectiveBest && nowRare;
    return `<div class="quadCell${isObjectiveBest ? " quadCellBest" : ""}${isRare ? " quadCellRare" : ""}" style="background:${t.bg};border-color:${t.bg}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
        <span class="lbl" style="color:${t.fg}">Best ${esc(pos)}</span>
        ${isObjectiveBest ? `<span class="topPickTag${isRare ? " topPickTagRare" : ""}" title="${isRare ? `Crossed the rare BEER threshold (${RARE_BEER_VALUE}+)` : "Weighted for what you already have, not just raw BEER value"}">${isRare ? "🍺 Last call" : "On tap"}</span>` : ""}
      </div>
      <div class="nm2">
        <strong>${p ? esc(p.name) : "—"}</strong>
        ${p && p.tier ? `<span>T-${esc(p.tier)}</span>` : ""}
      </div>
      <span class="vbdVal">${val !== undefined ? `BEER ${val >= 0 ? "+" : ""}${val.toFixed(1)}` : ""}</span>
    </div>`;
  }).join("");
}

// Position rank ("RB6", "WR12") — each player's FIXED slot in the blended
// rankings at their position, from the full consensus (unfiltered, and
// deliberately including taken/crossed-off players). Not recomputed to only
// count who's still available: a drafted player keeps the slot they had, so
// a visible run like RB3, RB6, RB7 (RB4/RB5 gone) tells you at a glance how
// many were taken at that position, instead of the numbering silently
// closing the gap and relabeling RB6 as RB4 the moment RB4/RB5 come off the
// board.
function computePosRanks(allRows) {
  const byPos = {};
  allRows.forEach((r) => {
    (byPos[r.pos] = byPos[r.pos] || []).push(r);
  });
  const ranks = new Map();
  Object.values(byPos).forEach((list) => {
    list.forEach((r, i) => ranks.set(r.key, i + 1));
  });
  return ranks;
}

function renderBoard() {
  // Position and "show taken" are independent — TAKEN no longer replaces the
  // position filter, it layers drafted players (crossed out) on top of it.
  const allRows = buildConsensus(activeSources(sources, soloSource), merges);
  const isGone = (r) => !!(taken[r.key] || manualTaken[r.key]);
  const list = applyFilters(allRows, { posFilter, showTaken, playerSearch, isGone });
  const posRanks = computePosRanks(allRows);

  // Per-row ADP detail + value delta — one caption entry per enabled ADP
  // source (usually Sleeper Live ADP + a pasted FantasyPros export), plus the
  // Sleeper-vs-baseline value/reach delta in the fixed Value column. Column
  // COUNT no longer drives layout (the header/row widths are fixed, matching
  // the design import exactly) — extra ADP sources just add another
  // "TAG value" pair to the caption line under the name, and any future
  // per-player stat (PROJ, etc.) is a caption entry too, not a new grid track.
  const adpCols = adpSources.filter((s) => s.enabled);
  const adpConsensus = buildAdpConsensus(adpSources);
  const valueMap = buildValueComparison(adpSources);

  const groups = {};
  list.forEach((r) => { const t = r.tier || "?"; (groups[t] = groups[t] || []).push(r); });

  // Isolating to a single source passes that source's own raw tier label
  // through as-is (see buildConsensus) — which isn't guaranteed to be
  // numeric. Every group gets shown: TIER_ORDER's numeric tiers keep their
  // defined order, any other label is ordered by that group's best (lowest)
  // rank, and "?" (no tier at all) always goes last.
  const otherTierLabels = Object.keys(groups)
    .filter((t) => t !== "?" && !TIER_ORDER.includes(t))
    .sort((a, b) =>
      Math.min(...groups[a].map((r) => r.consensus ?? Infinity)) -
      Math.min(...groups[b].map((r) => r.consensus ?? Infinity))
    );
  const orderedTiers = [...TIER_ORDER.filter((t) => groups[t]), ...otherTierLabels];
  if (groups["?"]) orderedTiers.push("?"); // players no active source assigned a tier to

  if (!list.length) {
    $("board").innerHTML = `<div class="empty2" style="padding:32px 20px">Nothing here. Loosen a filter to see the rest of the board.</div>`;
    return;
  }

  $("board").innerHTML = orderedTiers.map((t) => {
    const rows = groups[t].map((r) => {
      const gone = isGone(r);
      const mine = taken[r.key] && taken[r.key].byMe;
      const flag = flags[r.key];
      const adpEntry = adpConsensus.get(r.key);
      const vc = valueMap.get(r.key);
      const takenTag = gone
        ? `<span class="takenTag">${mine ? "Yours" : "Taken"}${taken[r.key] && taken[r.key].pickNo ? ` · pk ${esc(taken[r.key].pickNo)}` : ""}</span>`
        : "";
      const adpCaption = adpCols.length
        ? `<span class="adpCap">${adpCols.map((s) => `${esc(sourceTag(s.name))} ${adpEntry?.values[s.id] !== undefined ? esc(adpEntry.values[s.id]) : "—"}`).join(" · ")}</span>`
        : "";
      const flagIcon = flag === "favorite" ? "star" : flag === "avoid" ? "circle-x" : "flag";
      const flagColor = flag === "favorite" ? "var(--accent)" : flag === "avoid" ? "var(--red-500)" : "var(--text-disabled)";
      const valueCell = adpCols.length
        ? `${renderValueBadge(vc?.delta ?? null, vc?.baselineAdp)}${gone ? "" : adpBlinkDotHtml(r.pos, vc?.baselineAdp)}`
        : `<span class="valDelta flat">·</span>`;
      return `<div class="row2 ${gone ? "gone" : ""} ${mine ? "mine" : ""}" data-key="${esc(r.key)}" data-name="${esc(r.name)}" title="Double-click to cross off / undo">
        <button class="rowFlagBtn" data-key="${esc(r.key)}" aria-label="Flag player">${ico(flagIcon, { size: 13, color: flagColor })}</button>
        <span class="rk2">${r.consensus != null ? r.consensus.toFixed(1) : "—"}</span>
        <span class="nmCell2">
          <span class="nmLine">
            <span class="nmText">${esc(r.name)}</span>
            <span class="team2">${esc(r.team || "")}</span>
            ${takenTag}
          </span>
          ${adpCaption}
        </span>
        <span class="valCell2">${valueCell}</span>
        <span class="posCell2">${posBadgeHtml(r.pos, posRanks.get(r.key) ?? null, "sm")}</span>
      </div>`;
    }).join("");
    return `<div class="tierDiv"><span class="num">Tier ${esc(t)}</span><span class="line"></span><span>${groups[t].length}</span></div>${rows}`;
  }).join("");
}

// ---------- multi-source recommendation widgets ----------
// activeSources() now lives in shared.js — call as activeSources(sources, soloSource).

// Everything that's off the board, as playerKeys — the identity the shared
// widgets and imported sources use (array indices only work for RANKINGS).
function takenKeySet() {
  const set = new Set(lastSharedPicks.map((p) => p.key));
  manualKeys().forEach((k) => set.add(k));
  return set;
}

function renderSoloBar() {
  const bar = $("soloBar");
  const s = soloSource ? sources.find((x) => x.id === soloSource) : null;
  if (!s) { bar.style.display = "none"; return; }
  bar.style.display = "flex";
  $("soloLabel").textContent = `Showing ${s.name} only`;
}

// opts: { picks:[{pos,byMe,rosterId,key}], myRosterId, beerValues }
// Position badges now carry a live league-rank chip (backlog #13) alongside
// the plain count — "your QBs rank 3rd of 10" — built off buildTeamPositionRanks
// (shared.js). Looked up by whichever rosterId this team's OWN picks actually
// carry (via the first byMe pick found), not by matching myRosterId directly
// against a pick's rosterId key — myRosterId is compared against EITHER
// roster_id or draft_slot when a pick is first tagged "mine" (poll(), Sleeper
// populates them differently across real vs. mock drafts), while rosterId
// itself always prefers roster_id — the two could disagree in an edge case,
// so this sidesteps that instead of assuming they always match.
function renderTeamCountsV2(el, { picks = [], myRosterId = null, beerValues = new Map() } = {}) {
  if (myRosterId == null) {
    el.innerHTML = `<span class="teamHint">Set your draft slot # in settings to track your own roster.</span>`;
    return;
  }
  const mine = picks.filter((p) => p.byMe);
  const myTeamId = mine.find((p) => p.rosterId != null)?.rosterId;
  const ranks = myTeamId != null ? buildTeamPositionRanks(picks, beerValues) : {};
  const myRanks = myTeamId != null ? ranks[myTeamId] : null;
  const tones = { QB: "accent", RB: "positive", WR: "info", TE: "warning" };
  const counts = POSITIONS.map((pos) => {
    const n = mine.filter((p) => p.pos === pos).length;
    const r = myRanks && myRanks[pos];
    const tone = tones[pos];
    // Only shows once this team has actually drafted someone at the
    // position — a rank of "1st of 10" with zero players would be
    // meaningless noise (everyone with 0 total ties for 1st), so it falls
    // back to a plain badge (no rank strip at all) until then.
    if (!r || n === 0) return badgeHtml(tone, `${pos} ${n}`);
    const { bg, fg } = rankColor(r.rank, r.of);
    return `<span class="posRankPill t-${tone}" title="${esc(pos)} ranks ${esc(ordinal(r.rank))} of ${r.of} in the league by BEER value">
      <span class="prpTop t-${tone}">${esc(pos)} ${n}</span>
      <span class="prpRank" style="background:${bg};color:${fg}">${esc(ordinal(r.rank).toUpperCase())}</span>
    </span>`;
  }).join("");
  el.innerHTML = `<span class="teamHint">My team (slot ${esc(myRosterId)})</span>${counts}${badgeHtml("neutral", `Tot ${mine.length}`)}`;
}
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Continuous green (1st) -> yellow-green -> orange -> red (last) scale for
// the posRankPill's rank strip — 4 fixed stops, RGB-lerped between whichever
// two straddle this rank's position in the field, rather than a raw HSL
// sweep (a straight green->red hue sweep passes through a washed-out,
// hard-to-read olive/brown around the midpoint; hand-picked stops keep every
// step visually distinct). `of === 1` (only one team has drafted this
// position at all) is treated as a flat 1st, not division-by-zero.
const RANK_COLOR_STOPS = [
  { bg: [0x35, 0xd0, 0x7f], fg: [0x06, 0x2b, 0x15] },
  { bg: [0x9a, 0xcd, 0x4c], fg: [0x1d, 0x2b, 0x08] },
  { bg: [0xf0, 0x80, 0x3d], fg: [0x3a, 0x17, 0x04] },
  { bg: [0xe2, 0x45, 0x3f], fg: [0x3a, 0x07, 0x05] },
];
function rankColor(rank, of) {
  const t = of > 1 ? Math.min(1, Math.max(0, (rank - 1) / (of - 1))) : 0;
  const seg = t * (RANK_COLOR_STOPS.length - 1);
  const i = Math.min(RANK_COLOR_STOPS.length - 2, Math.floor(seg));
  const localT = seg - i;
  const lerp = (a, b) => a.map((v, k) => Math.round(v + (b[k] - v) * localT));
  const toHex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return {
    bg: toHex(lerp(RANK_COLOR_STOPS[i].bg, RANK_COLOR_STOPS[i + 1].bg)),
    fg: toHex(lerp(RANK_COLOR_STOPS[i].fg, RANK_COLOR_STOPS[i + 1].fg)),
  };
}

// A persistent, always-visible list of every enabled source — the per-card
// dots on the Best Picks cards below only show a source when it agrees with
// that specific pick, so a source with no dot anywhere still needs a way to
// be selected.
function renderSourceListV2(el, { sources = [], soloSource = null, onSolo } = {}) {
  const enabled = sources.filter((s) => s.enabled);
  if (enabled.length < 2) { el.innerHTML = ""; return; }
  el.innerHTML = enabled.map((s) => sourceChipHtml(s, { solo: soloSource === s.id })).join("");
  if (onSolo) {
    el.querySelectorAll("[data-solo]").forEach((chip) => {
      chip.addEventListener("click", () => onSolo(soloSource === chip.dataset.solo ? null : chip.dataset.solo));
    });
  }
}

// opts: { rows, sources, takenSet, valueMap, soloSource, posFilter, onSolo, flags }
// Same selection logic as shared.js's renderBestPicksWidget (kept for
// rankings-manager.js's own possible future use, but unused by this file now)
// — reimplemented here so this surface's markup can follow the design import
// exactly without touching that shared function.
function renderBestPicksV2(el, opts) {
  const { rows = [], sources = [], takenSet = new Set(), valueMap = null, soloSource = null, posFilter = "ALL", onSolo, flags = {}, posRanks = new Map() } = opts || {};
  const soloIsPosOnly = soloSource && sources.find((s) => s.id === soloSource)?.positionOnly;
  const soloRank = (r) => (soloIsPosOnly ? r.posOnlyRanks?.[soloSource] : r.ranks[soloSource]);
  let displayRows = rows;
  if (soloSource) {
    displayRows = rows.filter((r) => soloRank(r) !== undefined).slice().sort((a, b) => soloRank(a) - soloRank(b));
  }
  const top = displayRows.filter((r) => !takenSet.has(r.key)).slice(0, 3);
  const posLabel = posFilter && posFilter !== "ALL" ? ` ${posFilter}` : "";
  const ordinals = [`1st — best${posLabel} available`, "2nd", "3rd"];
  if (!top.length) {
    el.innerHTML = `<div class="empty2">${posLabel ? `No available${posLabel} players — everyone's off the board.` : "No available players — add a ranking source in the Rankings Manager."}</div>`;
    return;
  }
  const sourceTopPick = new Map();
  sources.filter((s) => s.enabled).forEach((s) => {
    if (s.positionOnly) {
      const byPos = new Map();
      top.forEach((r) => {
        const rk = r.posOnlyRanks?.[s.id];
        if (rk === undefined) return;
        const cur = byPos.get(r.pos);
        if (!cur || rk < cur.rk) byPos.set(r.pos, { key: r.key, rk, consensus: r.consensus ?? Infinity });
      });
      let bestKey = null, bestConsensus = Infinity;
      byPos.forEach((c) => { if (bestKey === null || c.consensus < bestConsensus) { bestKey = c.key; bestConsensus = c.consensus; } });
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
    const t = posTint(r.pos);
    const dots = sources
      .filter((s) => s.enabled && (s.id === soloSource || sourceTopPick.get(s.id) === r.key))
      .map((s) => sourceChipHtml(s, {
        solo: soloSource === s.id,
        title: s.positionOnly ? `${s.name}: ${r.pos}${r.posOnlyRanks?.[s.id] ?? "—"}` : `${s.name}: rank ${r.ranks[s.id] ?? "—"}`,
      })).join("");
    const displayRank = soloSource ? soloRank(r) : r.consensus;
    const rankLabel = soloSource ? `Rank · ${esc(sourceTag(sources.find((s) => s.id === soloSource)?.name || ""))}` : `Rank · ${r.sourceCount} src`;
    const vc = valueMap ? valueMap.get(r.key) : null;
    const adpVal = vc ? vc.sleeperAdp : null;
    const isFav = flags[r.key] === "favorite";
    return `<section class="bestCard2" style="background:${i === 0 ? "var(--surface-raised)" : "var(--surface-panel)"};border:1px solid ${i === 0 ? "var(--chalk-a24)" : "var(--border-subtle)"}">
      <header>
        <span class="fieldLabel" style="color:${i === 0 ? "var(--accent)" : "var(--text-muted)"}">${esc(ordinals[i])}</span>
        ${posBadgeHtml(r.pos, posRanks.get(r.key) ?? null, "md")}
      </header>
      <div class="body">
        <div class="nameRow">
          ${ico("star", { size: 14, color: isFav ? "var(--accent)" : "var(--text-disabled)" })}
          <strong>${esc(r.name)}</strong>
        </div>
        <div class="bestGrid2">
          <div class="cell"><span class="fieldLabel">${esc(rankLabel)}</span><span class="val">${displayRank != null ? displayRank.toFixed(1) : "—"}</span></div>
          <div class="cell"><span class="fieldLabel">ADP</span><span class="val">${adpVal != null ? adpVal.toFixed(1) : "—"}${valueDeltaHtml(vc ? vc.delta : null)}</span></div>
        </div>
        <div class="dots">${dots}</div>
      </div>
    </section>`;
  }).join("");
  if (onSolo) {
    el.querySelectorAll("[data-solo]").forEach((chip) => {
      chip.addEventListener("click", () => onSolo(soloSource === chip.dataset.solo ? null : chip.dataset.solo));
    });
  }
}

function renderRecommendations() {
  // Always the FULL blended consensus (every enabled source), never solo-filtered —
  // every source's dot needs to stay visible so you can see what other sources
  // think of the same pick. Position-filtering it here (not inside the widget)
  // means "each source's own #1 pick" naturally becomes "each source's own
  // #1 pick AT THIS POSITION" too.
  const consensusRows = buildConsensus(sources.filter((s) => s.enabled), merges);
  const takenSet = takenKeySet();
  // Same values feed both the team-rank chips below and buildBeerValues
  // callers elsewhere — one computation per render, not per widget.
  const { values: beerValues } = buildBeerValues(consensusRows, projMap, takenSet);
  renderTeamCountsV2($("teamCounts"), { picks: lastSharedPicks, myRosterId, beerValues });
  renderSourceListV2($("sourceList"), {
    sources,
    soloSource,
    onSolo: (id) => { soloSource = id; renderAll(); },
  });
  const bestPicksRows = posFilter === "ALL" ? consensusRows : consensusRows.filter((r) => filterMatchesPos(r.pos, posFilter));
  renderBestPicksV2($("bestPicks"), {
    rows: bestPicksRows,
    sources,
    takenSet,
    valueMap: buildValueComparison(adpSources),
    soloSource,
    posFilter,
    // renderAll (not renderRecommendations) so the tier board — which DOES isolate
    // to just the solo source — updates in the same tick instead of waiting for
    // the next poll cycle.
    onSolo: (id) => { soloSource = id; renderAll(); },
    flags,
    // Same "RB1"/"WR2" position-rank tag the board rows show, computed off
    // this widget's own full-blend consensus (not the board's, which can be
    // solo-filtered) so a card's tag always matches what's actually driving
    // this widget's picks.
    posRanks: computePosRanks(consensusRows),
  });
  renderSoloBar();
}

// A throw anywhere in here used to propagate out to whatever called it. From
// poll() that meant a rendering bug was reported as "Sync error", pointing the
// user at their draft ID for a problem that had nothing to do with Sleeper;
// from init() it meant a blank window with no explanation at all. Catching it
// keeps the failure legible and, crucially, keeps it recoverable — the
// settings drawer and the Manager button stay usable, so there's a way out
// that doesn't involve opening DevTools mid-draft.
function renderAll() {
  try {
    renderBest();
    renderBoard();
    renderRecommendations();
    const total = Object.keys(taken).length + Object.keys(manualTaken).length;
    $("pickCounter").textContent = total ? `${total} off board` : "";
  } catch (e) {
    console.error("[4th&Go] render failed", e);
    $("board").innerHTML =
      `<div style="color:var(--red-500);padding:24px;line-height:1.6;font-size:12px">
        <b>Couldn't draw the board.</b><br>${esc(e.message)}<br><br>
        <span style="color:var(--text-muted)">Your saved ranking data may be damaged. Open the Rankings Manager
        (Manager, top right) and remove or re-upload the most recently changed source.
        Syncing and manual crossouts still work.</span>
      </div>`;
  }
}

// ---------- shared state bridge (board window <-> Rankings Manager tab) ----------
function manualKeys() {
  return Object.keys(manualTaken).filter((k) => manualTaken[k]);
}

// Every successful poll used to write this unconditionally, and saveDraftState
// always stamps a fresh updatedAt — so the value always differed, so
// storage.onChanged always fired, so the Rankings Manager rebuilt its whole
// source bar and ~400-row table every 3 seconds for the entire draft even when
// no pick had come in. That destroys any text selection in the table and burns
// CPU on a laptop for a page nobody is looking at. Writing only on an actual
// change fixes it at the source rather than making the manager smarter.
let lastPersistedSig = null;
function draftStateSignature(draftId, picks) {
  const last = picks.length ? picks[picks.length - 1].pickNo : "";
  return [draftId, picks.length, last, manualKeys().sort().join(","), myRosterId].join("|");
}

function persistDraftState(draftId, sharedPicks) {
  const picks = sharedPicks !== undefined ? sharedPicks : lastSharedPicks;
  const id = draftId || currentDraftId;
  if (sharedPicks !== undefined) lastSharedPicks = sharedPicks;

  const sig = draftStateSignature(id, picks);
  if (sig === lastPersistedSig) return; // nothing actually changed — don't wake the other surface
  // Claimed BEFORE awaiting the write, not after. Recording it on success
  // instead left a window in which several calls landing before the first
  // write resolved all saw the old signature and all wrote — which is exactly
  // what a burst of activity looks like. Cleared on failure so the next call
  // retries rather than assuming a write that never happened.
  lastPersistedSig = sig;
  echo.write(K_DRAFT, () =>
    saveDraftState({ draftId: id, picks, manualKeys: manualKeys(), myRosterId })
  ).catch((e) => {
    // Storage writes were previously fire-and-forget with no catch at all, so
    // a failure surfaced only as an unhandled rejection in a console nobody
    // has open mid-draft.
    lastPersistedSig = null;
    console.error("[4th&Go] couldn't save draft state", e);
    toast("Couldn't save draft state — the Rankings Manager may be out of date.", true);
  });
}

// The manager can cross players off too — mirror its manual list back into ours.
function applyManualKeysFromStorage(keys) {
  const next = {};
  (keys || []).forEach((k) => { next[k] = true; });
  manualTaken = next;
  renderAll();
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes[K_DRAFT] && !echo.isEcho(K_DRAFT)) {
    const v = changes[K_DRAFT].newValue;
    if (v) applyManualKeysFromStorage(v.manualKeys);
  }
  // Curating sources in the manager tab must immediately change what this panel
  // recommends — one source of truth, no manual refresh between the surfaces.
  if (changes[K_SOURCES]) {
    sources = await loadSources();
    if (soloSource && !sources.some((s) => s.id === soloSource)) soloSource = null;
    renderAll(); // board + best grid are consensus-based now too, not just the widgets
  }
  if (changes[K_ADP]) {
    adp = await loadAdp();
    adpSources = await loadAdpSources();
    renderAll(); // board's per-row ADP columns depend on adpSources too, not just the widgets
  }
  if (changes[K_FLAGS] && !echo.isEcho(K_FLAGS)) {
    flags = await loadFlags();
    renderAll();
  }
  if (changes[K_MERGES]) {
    merges = await loadMerges();
    renderAll();
  }
  if (changes[K_PROJ]) {
    projMap = await loadProjections();
    renderAll(); // BEST grid's VBD values + objective-best badge depend on this
  }
});

// ---------- Sleeper sync ----------
function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function poll(draftId, { manual = false } = {}) {
  if (inFlight) return; // never stack requests
  inFlight = true;
  if (manual) {
    $("refreshBtn").classList.add("spin");
    $("refreshBtn").innerHTML = ico("rotate-cw", { size: 13 }) + "Refreshing…";
  }
  try {
    const res = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks?_=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cfAge = res.headers.get("age"); // seconds this response has sat in Sleeper's edge cache
    if (cfAge !== null) {
      cacheAgeAtFetch = Number(cfAge);
      cacheAgeFetchedAt = new Date();
    }
    const picks = await res.json();

    // Match against whatever sources are currently active — includes imported
    // sources, not just the bundled default.
    const matchIndex = buildMatchIndex(buildConsensus(activeSources(sources, soloSource), merges));
    const nextTaken = {};
    const sharedPicks = []; // source-agnostic record for the Rankings Manager
    unmatched = [];
    let skippedPos = 0; // picks dropped for not being QB/RB/WR/TE — normally K/DST, but ALL of them means wrong sport
    picks.forEach((pk) => {
      const md = pk.metadata || {};
      const first = md.first_name || "";
      const last = md.last_name || "";
      const pos = (md.position || "").toUpperCase();
      if (!first && !last) return;
      if (!["QB","RB","WR","TE"].includes(pos)) { skippedPos++; return; } // skip K/DEF picks entirely
      // A pick is "mine" if its roster_id or draft_slot matches what the user entered.
      // Sleeper populates these differently across real vs. mock drafts, so accept either.
      const mine =
        myRosterId !== null &&
        (Number(pk.roster_id) === myRosterId || Number(pk.draft_slot) === myRosterId);
      // Team identity for grouping picks by roster (buildTeamPositionRanks,
      // shared.js — backlog #13). roster_id preferred, draft_slot as
      // fallback, same acceptance as the "mine" check just above.
      const rosterId = pk.roster_id != null ? Number(pk.roster_id)
        : (pk.draft_slot != null ? Number(pk.draft_slot) : null);

      // Recorded for every pick, matched or not — the manager may carry sources
      // that include players our default rankings don't.
      sharedPicks.push({
        key: playerKey(`${first} ${last}`, pos),
        name: `${first} ${last}`.trim(),
        pos,
        pickNo: pk.pick_no,
        byMe: mine,
        rosterId,
      });

      const m = matchPick(first, last, pos, matchIndex);
      if (m) {
        nextTaken[m.key] = { byMe: mine, pickNo: pk.pick_no };
      } else {
        unmatched.push(`${first} ${last} (${pos})`);
      }
    });

    taken = nextTaken;
    currentPickNo = picks.length + 1;
    persistDraftState(draftId, sharedPicks);

    console.debug(`[4th&Go] check #${checkCount + 1} — ${picks.length} picks — ${new Date().toISOString()}`);

    if (picks.length !== lastPickCount) {
      if (picks.length > lastPickCount && lastPickCount > 0) {
        const newest = picks[picks.length - 1];
        const md = newest.metadata || {};
        toast(`Pick ${newest.pick_no}: ${md.first_name || ""} ${md.last_name || ""}`);
      }
      lastPickCount = picks.length;
      lastChangeTime = new Date();
    }

    checkCount++;
    errorStreak = 0;
    lastSuccessAt = new Date();
    // Every pick skipped for position means this isn't an NFL skill-position
    // draft at all (a basketball draft, or the wrong ID entirely). Without
    // this the status line reads a healthy green "LIVE — 137 picks synced"
    // while nothing ever crosses off and nothing explains why: the skipped
    // picks return early, so they never reach the `unmatched` counter either.
    const wrongSport = picks.length > 0 && skippedPos === picks.length;
    let msg;
    if (wrongSport) {
      msg = `${picks.length} picks synced, but none are QB/RB/WR/TE — is this an NFL draft? Check the draft ID.`;
    } else {
      msg = `Live — ${picks.length} picks synced`;
      if (unmatched.length) msg += ` · ${unmatched.length} not in your rankings (ignored)`;
    }
    setStatus(wrongSport ? "err" : "live pulse", msg);
    if (!wrongSport) setTimeout(() => $("status").classList.remove("pulse"), 500);
    $("lastSync").textContent =
      `checked ${fmtTime(new Date())} (#${checkCount})` +
      (cfAge !== null ? ` · Sleeper cache age: ${cfAge}s` : "") +
      (lastChangeTime ? ` · data last changed ${fmtTime(lastChangeTime)}` : ` · no picks yet`);
    renderAll();
    if (manual) {
      toast(cacheAgeAtFetch === 0
        ? "Fresh hit — brand-new data straight from Sleeper's origin."
        : `Still cached on Sleeper's end (age ${cacheAgeAtFetch}s) — not a fresh pull.`);
    }
  } catch (e) {
    errorStreak++;
    setStatus("err", `Sync error: ${e.message}. Check the draft ID. Retrying…`);
  } finally {
    inFlight = false;
    if (manual) {
      $("refreshBtn").classList.remove("spin");
      $("refreshBtn").innerHTML = ico("rotate-cw", { size: 13 }) + "Refresh now";
    }
    if (pollTimer !== null) scheduleNext(draftId);
  }
}

function updateCacheCountdown() {
  const el = $("cacheCountdown");
  if (cacheAgeAtFetch === null || cacheAgeFetchedAt === null) {
    el.textContent = "";
    el.classList.remove("fresh");
    return;
  }
  const elapsedSinceFetch = (Date.now() - cacheAgeFetchedAt.getTime()) / 1000;
  const remaining = Math.max(0, Math.ceil(CACHE_MAXAGE_S - cacheAgeAtFetch - elapsedSinceFetch));
  if (remaining <= 0) {
    el.textContent = "· cache expired, next poll will be a fresh hit";
    el.classList.add("fresh");
  } else {
    el.textContent = `· cache expires in ${remaining}s`;
    el.classList.remove("fresh");
  }
}

// Runs on the same 1s tick as the cache countdown — no second timer. Only
// speaks up when polling has actually stalled: an in-flight request or a
// normal 3s gap is fine, and a reported sync error already says more than
// this would, so that message is left alone.
function updateStaleness() {
  if (pollTimer === null || lastSuccessAt === null) return; // not polling, or nothing succeeded yet
  if (errorStreak > 0) return; // the error message is more specific — don't stomp it
  const staleFor = Math.floor((Date.now() - lastSuccessAt.getTime()) / 1000);
  if (staleFor < STALE_AFTER_S) return;
  setStatus("err", `No update in ${staleFor}s — the board may be behind. Try Refresh now, or Stop and re-sync.`);
}

function tickStatus() {
  updateCacheCountdown();
  updateStaleness();
}

function scheduleNext(draftId) {
  clearTimeout(pollTimer);
  // back off if Sleeper is erroring, otherwise run fast
  const delay = errorStreak > 0
    ? Math.min(FAST_INTERVAL_MS * Math.pow(2, errorStreak), MAX_INTERVAL_MS)
    : FAST_INTERVAL_MS;
  pollTimer = setTimeout(() => poll(draftId), delay);
}

function startPolling(draftId) {
  stopPolling();
  currentDraftId = draftId;
  errorStreak = 0;
  pollTimer = -1; // truthy sentinel so poll() knows to keep chaining
  poll(draftId);
  $("connectBtn").style.display = "none";
  $("stopBtn").style.display = "";
  $("refreshRow").style.display = "flex";
  chrome.storage.local.set({ savedDraftId: draftId });
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(tickStatus, 1000);
  // Setup only matters once — give the space back to the board now that we're live.
  $("settingsPanel").classList.add("collapsed");
  $("settingsBtn").classList.remove("on");
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
  cacheAgeAtFetch = null;
  cacheAgeFetchedAt = null;
  lastSuccessAt = null;
  currentPickNo = null;
  $("cacheCountdown").textContent = "";
  $("connectBtn").style.display = "";
  $("stopBtn").style.display = "none";
  $("refreshRow").style.display = "none";
  setStatus("", "Sync stopped. Manual mode: double-click rows to cross players off.");
  $("settingsPanel").classList.remove("collapsed");
  $("settingsBtn").classList.add("on");
}

// ---------- events ----------
$("connectBtn").addEventListener("click", () => {
  const id = $("draftId").value.trim();
  if (!/^\d{6,}$/.test(id)) {
    setStatus("err", "That doesn't look like a draft ID. It's the long number in the draft room URL: sleeper.com/draft/nfl/<ID>");
    return;
  }
  startPolling(id);
});

$("stopBtn").addEventListener("click", stopPolling);

$("refreshBtn").addEventListener("click", () => {
  if (!currentDraftId) return;
  poll(currentDraftId, { manual: true });
});

// Double-click, not click: a whole row is a big target and a stray single click
// used to silently remove a player mid-draft with no undo signal. Ignores the
// row's flag button, which has its own single-click behavior (open the
// favorite/avoid menu) — otherwise a fast double-click there would also
// register as a row dblclick and cross the player off by accident.
$("board").addEventListener("dblclick", (e) => {
  if (e.target.closest(".rowFlagBtn")) return;
  const row = e.target.closest(".row2");
  if (!row) return;
  const key = row.dataset.key;
  if (taken[key]) return; // synced picks can't be un-clicked (they're real)
  const name = row.dataset.name;
  if (manualTaken[key]) {
    delete manualTaken[key];
    toast(`${name} put back on the board.`);
  } else {
    manualTaken[key] = true;
    toast(`${name} crossed off — double-click again to undo.`);
  }
  renderAll();
  persistDraftState(); // keep the manager tab in step
});

// ---------- flag menu (favorite/avoid) ----------
// Two entry points: click the row's dedicated flag icon (its own column, so
// it never competes with the ADP/value cells for space), or right-click the
// player's name — kept as a secondary path for anyone used to the old
// gesture. Either way this is separate from double-click, which already
// means "cross player off" (see the dblclick handler above).
function closeFlagMenu() {
  const el = $("flagMenu");
  if (el) el.remove();
  document.removeEventListener("click", closeFlagMenu);
  document.removeEventListener("keydown", onFlagMenuKey);
}
function onFlagMenuKey(e) {
  if (e.key === "Escape") closeFlagMenu();
}
function setFlag(key, kind) {
  const next = { ...flags };
  if (kind === null || next[key] === kind) delete next[key];
  else next[key] = kind;
  flags = next;
  echo.write(K_FLAGS, () => saveFlags(flags))
    .catch((e) => { console.error("[4th&Go] couldn't save flags", e); toast("Couldn't save that flag.", true); });
  renderAll();
}
function openFlagMenu(x, y, key) {
  closeFlagMenu();
  const current = flags[key];
  const menu = document.createElement("div");
  menu.id = "flagMenu";
  menu.className = "flagMenu";
  menu.innerHTML = `
    <button class="fm-fav${current === "favorite" ? " fm-current" : ""}" data-kind="favorite">${ico("star", { size: 13, color: "var(--accent)" })}Favorite</button>
    <button class="fm-avoid${current === "avoid" ? " fm-current" : ""}" data-kind="avoid">${ico("circle-x", { size: 13, color: "var(--red-500)" })}Avoid</button>
    ${current ? `<button class="fm-clear" data-kind="clear">Clear flag</button>` : ""}
  `;
  document.body.appendChild(menu);
  // Measure before placing so the menu never renders off the panel's edge.
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 6))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - h - 6))}px`;
  menu.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setFlag(key, btn.dataset.kind === "clear" ? null : btn.dataset.kind);
      closeFlagMenu();
    });
  });
  // Deferred so the click that opened the menu doesn't also close it via the
  // document listener registered below.
  setTimeout(() => {
    document.addEventListener("click", closeFlagMenu);
    document.addEventListener("keydown", onFlagMenuKey);
  }, 0);
}
$("board").addEventListener("click", (e) => {
  const btn = e.target.closest(".rowFlagBtn");
  if (!btn) return;
  e.stopPropagation();
  const r = btn.getBoundingClientRect();
  openFlagMenu(r.left, r.bottom + 6, btn.dataset.key);
});
$("board").addEventListener("contextmenu", (e) => {
  const nameEl = e.target.closest(".nmText");
  if (!nameEl) return;
  const row = nameEl.closest(".row2");
  if (!row) return;
  e.preventDefault();
  openFlagMenu(e.clientX, e.clientY, row.dataset.key);
});

// ---------- settings drawer ----------
$("settingsBtn").addEventListener("click", () => {
  const collapsed = $("settingsPanel").classList.toggle("collapsed");
  $("settingsBtn").classList.toggle("on", !collapsed);
});

$("showAllBtn").addEventListener("click", () => {
  soloSource = null;
  renderAll();
});

// ---------- roster id (which draft slot is mine) ----------
$("myRoster").addEventListener("change", () => {
  const raw = $("myRoster").value.trim();
  myRosterId = raw === "" ? null : Number(raw);
  if (myRosterId !== null && (!isFinite(myRosterId) || myRosterId < 1)) {
    myRosterId = null;
    $("myRoster").value = "";
  }
  chrome.storage.local.set({ [K_ROSTER]: myRosterId });
  // Re-tag existing picks without waiting for the next poll.
  lastSharedPicks = lastSharedPicks.map((p) => ({ ...p, byMe: false }));
  if (currentDraftId) poll(currentDraftId, { manual: false });
  persistDraftState();
});

// A bare chrome.tabs.create({url}) was tried first — twice, once plain and
// once followed by chrome.windows.update(tab.windowId, {focused:true}). Both
// failed: confirmed via chrome://extensions' "Inspect views" list that the
// tab WAS being created on every click, it just had no visible home — Chrome
// was attaching it to this board's own type:"popup" window (no tab strip to
// surface it), so "focus the tab's window" was just re-focusing the popup
// itself. tabs.create()'s implicit "current window" resolution isn't safe to
// rely on from inside a popup window. Switching to
// chrome.windows.create({type:"normal"}) fixed the visibility bug but traded
// in a real usability cost: it always opens a brand-new browser window,
// even when the user's actual draft tab is sitting right there in an
// existing one. Explicitly targeting a real normal (tabbed) window's id —
// rather than letting either API implicitly guess one — gets both: reliably
// visible, AND lands as a tab in whatever window the user's already using
// (there's normally just one), falling back to a new window only if truly
// none exists.
$("openManager").addEventListener("click", async () => {
  try {
    const url = chrome.runtime.getURL("rankings-manager.html");
    const normalWindows = await chrome.windows.getAll({ windowTypes: ["normal"] });
    if (normalWindows.length) {
      const win = normalWindows.find((w) => w.focused) || normalWindows[0];
      await chrome.tabs.create({ url, windowId: win.id });
      await chrome.windows.update(win.id, { focused: true });
    } else {
      await chrome.windows.create({ url, type: "normal" });
    }
  } catch (e) {
    console.error("[4th&Go] couldn't open the Rankings Manager", e);
    toast(`Couldn't open the Rankings Manager: ${e.message}`, true);
  }
});

document.querySelectorAll(".pf[data-pos]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pf[data-pos]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    posFilter = btn.dataset.pos;
    renderBoard();
    renderRecommendations(); // Best Picks now filters to posFilter too — see renderRecommendations
  });
});
$("takenToggle").addEventListener("click", () => {
  showTaken = !showTaken;
  $("takenToggle").classList.toggle("active", showTaken);
  renderBoard();
});
$("playerSearch").addEventListener("input", () => {
  playerSearch = $("playerSearch").value.trim();
  renderBoard();
});

// ---------- init: restore settings, then load the curated sources ----------
(async function init() {
  $("settingsBtn").innerHTML = ico("settings", { size: 15 });
  $("openManager").innerHTML = ico("external-link", { size: 13 }) + "Manager";
  $("connectBtn").innerHTML = ico("unplug", { size: 13, color: "var(--on-accent)" }) + "Sync";
  $("refreshBtn").innerHTML = ico("rotate-cw", { size: 13 }) + "Refresh now";

  const v = await chrome.storage.local.get(["detectedDraftId", "savedDraftId", K_ROSTER]);
  const id = v.detectedDraftId || v.savedDraftId;
  if (id) {
    $("draftId").value = id;
    setStatus("", v.detectedDraftId
      ? "Draft detected from your open Sleeper tab. Hit Sync."
      : "Restored last draft ID. Hit Sync.");
  }
  if (v[K_ROSTER] != null) {
    myRosterId = Number(v[K_ROSTER]);
    $("myRoster").value = myRosterId;
  }

  // Carry over picks already synced before this window was last closed (the
  // Rankings Manager can also add manual crossouts while we're shut). Only when
  // it's the SAME draft — otherwise a previous draft's crossouts would bleed
  // through. Only one board window can exist at a time (background.js focuses
  // the existing one rather than opening a second), so this is a resume path,
  // not a two-copies-polling-concurrently path.
  const d = await loadDraftState();
  if (d.draftId && id && String(d.draftId) === String(id)) {
    lastSharedPicks = d.picks || [];
    if (d.manualKeys) applyManualKeysFromStorage(d.manualKeys);
  }

  sources = await loadSources();
  adp = await loadAdp();
  adpSources = await loadAdpSources();
  flags = await loadFlags();
  merges = await loadMerges();
  projMap = await loadProjections();

  // Settings start open so first-run has the draft ID box visible.
  $("settingsBtn").classList.add("on");
  renderAll();

  // Silent background refresh, same pattern as ADP — don't block first
  // render on a network round trip, just re-render once fresh data lands.
  autoRefreshProjections().then((map) => {
    if (map) { projMap = map; renderAll(); }
  });
})();

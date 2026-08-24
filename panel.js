// ============================================================
// 4th&Go — Sleeper live draft board
// Polls Sleeper's public read-only API (no login required):
//   GET https://api.sleeper.app/v1/draft/{draft_id}/picks
// Matches picks to your rankings by normalized name + position.
// ============================================================

// TIER_ORDER / TIER_COLORS / POS_COLORS / norm() now live in shared.js,
// which loads first — see the note at the top of that file.

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
let suppressStorageEcho = false; // ignore the onChanged event fired by our own write
let pollTimer = null;
let posFilter = "ALL";
// Most filter values are a single position, matched exactly. A grouped filter
// (currently just the RB/WR flex view) maps to a set of positions instead —
// everything downstream (renderBoard, renderRecommendations) calls
// filterMatchesPos() rather than comparing r.pos === posFilter directly, so
// adding another grouped filter later is a one-line addition here.
const POS_FILTER_GROUPS = { "RB/WR": ["RB", "WR"] };
function filterMatchesPos(pos) {
  const group = POS_FILTER_GROUPS[posFilter];
  return group ? group.includes(pos) : pos === posFilter;
}
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
let showTaken = false; // independent toggle, layered on top of posFilter
let playerSearch = ""; // name/team substring filter, layered on top of posFilter/showTaken

const $ = (id) => document.getElementById(id);

// ---------- rendering ----------
// Both the BEST grid and the tier board are built from the SAME blended
// consensus rows the Best Picks widget uses (respecting soloSource isolation
// via activeSources()) — they used to be hardcoded to the bundled default
// rankings file only, which is why isolating a source or adding an import
// never changed what the board showed.
function bestAvailable() {
  const rows = buildConsensus(activeSources(), merges);
  const out = {};
  ["QB","RB","WR","TE"].forEach((pos) => {
    out[pos] = rows.find((r) => r.pos === pos && !taken[r.key] && !manualTaken[r.key]);
  });
  return out;
}

function renderBest() {
  const best = bestAvailable();
  $("best").innerHTML = ["QB","RB","WR","TE"].map((pos) => {
    const c = POS_COLORS[pos];
    const p = best[pos];
    return `<div class="best-cell" style="background:${c.bg};border-color:${c.border}">
      <div class="best-pos" style="color:${c.text}">BEST ${pos}</div>
      <div class="best-name">${p ? `${esc(p.name)}${p.tier ? ` <span style="color:${TIER_COLORS[p.tier] || "var(--dim2)"};font-size:10px">T-${esc(p.tier)}</span>` : ""}` : "—"}</div>
    </div>`;
  }).join("");
}

function renderBoard() {
  // Position and "show taken" are independent — TAKEN no longer replaces the
  // position filter, it layers drafted players (crossed out) on top of it.
  const rows = buildConsensus(activeSources(), merges);
  let list = rows;
  if (posFilter !== "ALL") list = list.filter((r) => filterMatchesPos(r.pos));

  const isGone = (r) => !!(taken[r.key] || manualTaken[r.key]);
  if (!showTaken) list = list.filter((r) => !isGone(r));

  // Search layers on top of position/taken filters, same independence pattern —
  // matches on name or team, case-insensitive, substring (not just prefix) so
  // "chase" finds "Ja'Marr Chase" and "det" finds every Lions player.
  if (playerSearch) {
    const q = playerSearch.toLowerCase();
    list = list.filter((r) =>
      r.name.toLowerCase().includes(q) || (r.team || "").toLowerCase().includes(q)
    );
  }

  // Per-row ADP columns + value badge — one column per enabled ADP source
  // (usually Sleeper Live ADP + a pasted FantasyPros export), plus the
  // Sleeper-vs-baseline value/reach badge. Column count is dynamic, so the
  // grid template is built here and applied per-row via inline style rather
  // than a fixed CSS rule.
  const adpCols = adpSources.filter((s) => s.enabled);
  const adpConsensus = buildAdpConsensus(adpSources);
  const valueMap = buildValueComparison(adpSources);
  // Position-only ranking sources are still full ranking sources — like Flock
  // or FantasyPros, they don't get their own board column, they contribute
  // to the tiered list (or, for position-only, to the Best Picks dot logic —
  // see shared.js). Board columns are reserved for ADP and future per-player
  // stat/projection data, not per-ranking-source detail (that's what the
  // Rankings Manager table is for). A dedicated posOnly reference column was
  // tried and reverted the same day it shipped — inconsistent with every
  // other ranking source's total absence from the board's columns.
  // Every track is a fixed length, deliberately — NOT "auto" for the pos-chip
  // column. #adpColLabels and each .row are separate grid containers, so an
  // "auto" track sizes independently per container: the label row's pos-chip
  // slot is empty (~0px) while a real row's has actual chip content (~23px),
  // which changes how much space the 1fr name column eats and shifts every
  // column after it out of alignment between the header and the rows.
  const gridColParts = ["34px", "1fr", ...adpCols.map(() => "48px")];
  if (adpCols.length) gridColParts.push("96px"); // fits the bigger value bar (22px number + 56px track + gaps)
  gridColParts.push("36px"); // pos-chip — fixed, see note above
  const gridCols = gridColParts.join(" ");

  // Column labels above the list — the board is otherwise just repeating
  // rows with no header, so without this a raw ADP number column reads as
  // unlabeled noise. Rendered once, not per tier, using the same grid
  // template so it lines up with the actual columns below it.
  const labelsEl = $("adpColLabels");
  if (adpCols.length) {
    labelsEl.style.display = "grid";
    labelsEl.style.gridTemplateColumns = gridCols;
    labelsEl.innerHTML = `<span></span><span></span>` +
      adpCols.map((s) => `<span style="color:${esc(s.color)}" title="${esc(s.name)}">${esc(sourceTag(s.name))}</span>`).join("") +
      `<span>VALUE</span>` +
      `<span></span>`;
    // Pull the first tier divider up toward the labels instead of leaving a
    // big dead gap — #board's own top padding is meant for the space before
    // an UNlabeled list, not on top of the label row's own spacing.
    $("board").style.paddingTop = "0";
  } else {
    labelsEl.style.display = "none";
    $("board").style.paddingTop = "";
  }

  const groups = {};
  list.forEach((r) => { const t = r.tier || "?"; (groups[t] = groups[t] || []).push(r); });

  // Isolating to a single source passes that source's own raw tier label
  // through as-is (see buildConsensus) — which isn't guaranteed to be
  // numeric. This used to only recognize TIER_ORDER's "1".."16" labels and
  // silently dropped every other tier group entirely, so a source using
  // letter tiers (S/A/B/C/...) rendered an empty board even though its
  // players were right there in `list`. Every group now gets shown:
  // TIER_ORDER's numeric tiers keep their defined order, any other label
  // is ordered by that group's best (lowest) rank, and "?" (no tier at all)
  // always goes last.
  const otherTierLabels = Object.keys(groups)
    .filter((t) => t !== "?" && !TIER_ORDER.includes(t))
    .sort((a, b) =>
      Math.min(...groups[a].map((r) => r.consensus ?? Infinity)) -
      Math.min(...groups[b].map((r) => r.consensus ?? Infinity))
    );
  const orderedTiers = [...TIER_ORDER.filter((t) => groups[t]), ...otherTierLabels];
  if (groups["?"]) orderedTiers.push("?"); // players no active source assigned a tier to

  $("board").innerHTML = orderedTiers.map((t) => {
    const rows = groups[t].map((r) => {
      const c = POS_COLORS[r.pos] || { text: "var(--dim2)", bg: "transparent", border: "var(--line2)" };
      const gone = isGone(r);
      const mine = taken[r.key] && taken[r.key].byMe;
      const pickLabel = taken[r.key] && taken[r.key].pickNo ? ` · pk ${esc(taken[r.key].pickNo)}` : "";
      const flag = flags[r.key];
      const adpEntry = adpConsensus.get(r.key);
      const vc = valueMap.get(r.key);
      const adpCells = adpCols.map((s) =>
        `<span class="adp-cell" style="color:${adpEntry?.values[s.id] !== undefined ? "var(--dim2)" : "var(--dim)"}" title="${esc(s.name)}">${esc(adpEntry?.values[s.id] ?? "·")}</span>`
      ).join("");
      const valueCell = adpCols.length ? renderValueBadge(vc?.delta ?? null, vc?.baselineAdp) : "";
      return `<div class="row ${gone ? "gone" : ""} ${mine ? "mine" : ""}" data-key="${esc(r.key)}" data-name="${esc(r.name)}" title="Double-click to cross off / undo" style="border-left-color:${c.text};grid-template-columns:${gridCols}">
        <span class="rk">${r.consensus != null ? r.consensus.toFixed(1) : "—"}</span>
        <span class="nm">${flagBadge(flag)}${esc(r.name)} <span class="tm">· ${esc(r.team || "")}${pickLabel}</span></span>
        ${adpCells}
        ${valueCell}
        <span class="pos-chip" style="color:${c.text};background:${c.bg};border-color:${c.border}">${esc(r.pos)}</span>
      </div>`;
    }).join("");
    const badgeColor = TIER_COLORS[t] || "#4A4A4A";
    return `<div class="tier-head">
      <div class="tier-badge" style="background:${badgeColor};color:#0B0D08">${esc(t)}</div>
      <div class="tier-line"></div>
      <div class="tier-count">${groups[t].length}</div>
    </div>${rows}`;
  }).join("") || `<div style="color:var(--dim);text-align:center;padding:30px">Nothing here.</div>`;
}

// ---------- multi-source recommendation widgets ----------
function activeSources() {
  return soloSource ? sources.filter((s) => s.id === soloSource) : sources.filter((s) => s.enabled);
}

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

function renderRecommendations() {
  renderTeamCountsWidget($("teamCounts"), { picks: lastSharedPicks, myRosterId });
  renderSourceListWidget($("sourceList"), {
    sources,
    soloSource,
    onSolo: (id) => { soloSource = id; renderAll(); },
  });
  // Always the FULL blended consensus (every enabled source), never solo-filtered —
  // the widget itself re-sorts/re-labels for soloSource, but every source's dot
  // needs to stay visible so you can see what other sources think of the same pick.
  // Position-filtering it here (not inside the widget) means "each source's own
  // #1 pick" naturally becomes "each source's own #1 pick AT THIS POSITION" too —
  // asked for directly: filtering the board to RB mid-draft should surface the
  // best available RBs here, not the same overall-best-3 regardless of position.
  const consensusRows = buildConsensus(sources.filter((s) => s.enabled), merges);
  const bestPicksRows = posFilter === "ALL" ? consensusRows : consensusRows.filter((r) => filterMatchesPos(r.pos));
  renderBestPicksWidget($("bestPicks"), {
    rows: bestPicksRows,
    sources,
    takenSet: takenKeySet(),
    adp,
    valueMap: buildValueComparison(adpSources),
    soloSource,
    posFilter,
    // renderAll (not renderRecommendations) so the tier board — which DOES isolate
    // to just the solo source — updates in the same tick instead of waiting for
    // the next poll cycle.
    onSolo: (id) => { soloSource = id; renderAll(); },
    flags,
  });
  renderSoloBar();
}

function renderAll() {
  renderBest();
  renderBoard();
  renderRecommendations();
  const total = Object.keys(taken).length + Object.keys(manualTaken).length;
  $("pickCounter").textContent = total ? `${total} OFF BOARD` : "";
}

function toast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.style.display = "block";
  t.classList.toggle("error", isError);
  clearTimeout(t._h);
  clearTimeout(t._show);
  t.classList.remove("show");
  t._show = setTimeout(() => t.classList.add("show"), 10);
  t._h = setTimeout(() => { t.classList.remove("show"); t._hide = setTimeout(() => (t.style.display = "none"), 200); }, 2600);
}

// ---------- shared state bridge (board window <-> Rankings Manager tab) ----------
function manualKeys() {
  return Object.keys(manualTaken).filter((k) => manualTaken[k]);
}

function persistDraftState(draftId, sharedPicks) {
  suppressStorageEcho = true;
  saveDraftState({
    draftId: draftId || currentDraftId,
    picks: sharedPicks !== undefined ? sharedPicks : lastSharedPicks,
    manualKeys: manualKeys(),
    myRosterId,
  }).finally(() => { suppressStorageEcho = false; });
  if (sharedPicks !== undefined) lastSharedPicks = sharedPicks;
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
  if (changes[K_DRAFT] && !suppressStorageEcho) {
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
  if (changes[K_FLAGS]) {
    flags = await loadFlags();
    renderAll();
  }
  if (changes[K_MERGES]) {
    merges = await loadMerges();
    renderAll();
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
    $("refreshBtn").textContent = "⟳ …";
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
    const matchIndex = buildMatchIndex(buildConsensus(activeSources(), merges));
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

      // Recorded for every pick, matched or not — the manager may carry sources
      // that include players our default rankings don't.
      sharedPicks.push({
        key: playerKey(`${first} ${last}`, pos),
        name: `${first} ${last}`.trim(),
        pos,
        pickNo: pk.pick_no,
        byMe: mine,
      });

      const m = matchPick(first, last, pos, matchIndex);
      if (m) {
        nextTaken[m.key] = { byMe: mine, pickNo: pk.pick_no };
      } else {
        unmatched.push(`${first} ${last} (${pos})`);
      }
    });

    taken = nextTaken;
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
    $("status").className = wrongSport ? "err" : "live pulse";
    if (!wrongSport) setTimeout(() => $("status").classList.remove("pulse"), 500);
    let msg;
    if (wrongSport) {
      msg = `⚠ ${picks.length} picks synced, but none are QB/RB/WR/TE — is this an NFL draft? Check the draft ID.`;
    } else {
      msg = `● LIVE — ${picks.length} picks synced`;
      if (unmatched.length) msg += ` · ${unmatched.length} not in your rankings (ignored)`;
    }
    $("status").textContent = msg;
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
    $("status").className = "err";
    $("status").textContent = `Sync error: ${e.message}. Check the draft ID. Retrying…`;
  } finally {
    inFlight = false;
    if (manual) {
      $("refreshBtn").classList.remove("spin");
      $("refreshBtn").textContent = "⟳ REFRESH NOW";
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
  $("status").className = "err";
  $("status").textContent =
    `⚠ NO UPDATE IN ${staleFor}s — the board may be behind. Try REFRESH NOW, or STOP and re-SYNC.`;
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
  $("cacheCountdown").textContent = "";
  $("connectBtn").style.display = "";
  $("stopBtn").style.display = "none";
  $("refreshRow").style.display = "none";
  $("status").className = "";
  $("status").textContent = "Sync stopped. Manual mode: double-click rows to cross players off.";
  $("settingsPanel").classList.remove("collapsed");
  $("settingsBtn").classList.add("on");
}

// ---------- events ----------
$("connectBtn").addEventListener("click", () => {
  const id = $("draftId").value.trim();
  if (!/^\d{6,}$/.test(id)) {
    $("status").className = "err";
    $("status").textContent = "That doesn't look like a draft ID. It's the long number in the draft room URL: sleeper.com/draft/nfl/<ID>";
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
// used to silently remove a player mid-draft with no undo signal.
$("board").addEventListener("dblclick", (e) => {
  const row = e.target.closest(".row");
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

// ---------- flag context menu (favorite/avoid) ----------
// Right-click on a player's name, not double-click — double-click on the row
// already means "cross player off" (see the dblclick handler above), so
// right-click was picked specifically to avoid a gesture collision. Flags
// used to be settable only from the Rankings Manager tab; this lets you set
// them mid-draft without switching tabs, while the manager stays the only
// place to browse/edit them in bulk.
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
  saveFlags(flags);
  renderAll();
}
function openFlagMenu(x, y, key) {
  closeFlagMenu();
  const current = flags[key];
  const menu = document.createElement("div");
  menu.id = "flagMenu";
  menu.className = "flagMenu";
  menu.innerHTML = `
    <button class="fm-fav${current === "favorite" ? " fm-current" : ""}" data-kind="favorite">★ Favorite</button>
    <button class="fm-avoid${current === "avoid" ? " fm-current" : ""}" data-kind="avoid">⊘ Avoid</button>
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
$("board").addEventListener("contextmenu", (e) => {
  const nameEl = e.target.closest(".nm");
  if (!nameEl) return;
  const row = nameEl.closest(".row");
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
  const v = await chrome.storage.local.get(["detectedDraftId", "savedDraftId", K_ROSTER]);
  const id = v.detectedDraftId || v.savedDraftId;
  if (id) {
    $("draftId").value = id;
    $("status").textContent = v.detectedDraftId
      ? "Draft detected from your open Sleeper tab. Hit SYNC."
      : "Restored last draft ID. Hit SYNC.";
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

  // Settings start open so first-run has the draft ID box visible.
  $("settingsBtn").classList.add("on");
  renderAll();
})();

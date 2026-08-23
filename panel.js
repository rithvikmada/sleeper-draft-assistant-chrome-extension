// ============================================================
// 4th&Go — Sleeper live draft board
// Polls Sleeper's public read-only API (no login required):
//   GET https://api.sleeper.app/v1/draft/{draft_id}/picks
// Matches picks to your rankings by normalized name + position.
// ============================================================

// TIER_ORDER / TIER_COLORS / POS_COLORS / norm() now live in shared.js,
// which loads first — see the note at the top of that file.

// ---------- name matching ----------
// Build lookup: normalized name -> array of player indices (position disambiguates)
const players = RANKINGS.map((p, i) => ({ ...p, id: i, normName: norm(p.name) }));
const byName = new Map();
players.forEach((p) => {
  if (!byName.has(p.normName)) byName.set(p.normName, []);
  byName.get(p.normName).push(p);
});

function matchPick(first, last, pos) {
  const n = norm(`${first} ${last}`);
  const cands = byName.get(n);
  if (cands) {
    const posMatch = cands.find((c) => c.pos === pos);
    return posMatch || cands[0];
  }
  // fallback: last name + first initial + position (catches "Ken Walker" vs "Kenneth Walker")
  const ln = norm(last);
  const fi = norm(first).charAt(0);
  const loose = players.filter(
    (p) => p.pos === pos && p.normName.endsWith(" " + ln) && p.normName.charAt(0) === fi
  );
  if (loose.length === 1) return loose[0];
  return null;
}

// ---------- state ----------
let taken = {};        // playerId -> { byMe: bool, pickNo: number|null }
let manualTaken = {};  // clicks made by hand (kept separate so a re-poll doesn't wipe them)
let myRosterId = null; // user-entered draft slot / roster id — drives the "mine" highlight and the manager's position counts
let suppressStorageEcho = false; // ignore the onChanged event fired by our own write
let pollTimer = null;
let posFilter = "ALL";
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
let countdownTimer = null;

// Multi-source ranking state, shared with the Rankings Manager tab via storage.
// The manager curates these; this panel only reads them to build recommendations.
let sources = [];
let adp = null;
let soloSource = null; // when set, best-picks are computed from just this source
let lastSharedPicks = []; // source-agnostic record of every drafted player, by playerKey
let flags = {}; // playerKey -> "favorite" | "avoid", set in the Rankings Manager
let merges = {}; // variantKey → canonicalKey, unmatched player reconciliation
let showTaken = false; // independent toggle, layered on top of posFilter

const $ = (id) => document.getElementById(id);

// ---------- rendering ----------
function bestAvailable() {
  const out = {};
  ["QB","RB","WR","TE"].forEach((pos) => {
    out[pos] = players.find((p) => p.pos === pos && !taken[p.id] && !manualTaken[p.id]);
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
      <div class="best-name">${p ? `${p.name} <span style="color:${TIER_COLORS[p.tier]};font-size:10px">T-${p.tier}</span>` : "—"}</div>
    </div>`;
  }).join("");
}

function renderBoard() {
  // Position and "show taken" are independent — TAKEN no longer replaces the
  // position filter, it layers drafted players (crossed out) on top of it.
  let list = players;
  if (posFilter !== "ALL") list = list.filter((p) => p.pos === posFilter);

  const isGone = (p) => !!(taken[p.id] || manualTaken[p.id]);
  if (!showTaken) list = list.filter((p) => !isGone(p));

  const groups = {};
  list.forEach((p) => { (groups[p.tier] = groups[p.tier] || []).push(p); });

  $("board").innerHTML = TIER_ORDER.filter((t) => groups[t]).map((t) => {
    const rows = groups[t].map((p) => {
      const c = POS_COLORS[p.pos];
      const gone = isGone(p);
      const mine = taken[p.id] && taken[p.id].byMe;
      const pickLabel = taken[p.id] && taken[p.id].pickNo ? ` · pk ${taken[p.id].pickNo}` : "";
      const flag = flags[playerKey(p.name, p.pos)];
      return `<div class="row ${gone ? "gone" : ""} ${mine ? "mine" : ""}" data-id="${p.id}" title="Double-click to cross off / undo" style="border-left-color:${c.text}">
        <span class="rk">${p.rank.toFixed(1)}</span>
        <span class="nm">${flagBadge(flag)}${p.name} <span class="tm">· ${p.team}${pickLabel}</span></span>
        <span class="pos-chip" style="color:${c.text};background:${c.bg};border-color:${c.border}">${p.pos}</span>
      </div>`;
    }).join("");
    return `<div class="tier-head">
      <div class="tier-badge" style="background:${TIER_COLORS[t]};color:#0B0D08">${t}</div>
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
  renderBestPicksWidget($("bestPicks"), {
    rows: buildConsensus(activeSources(), merges),
    sources,
    takenSet: takenKeySet(),
    adp,
    soloSource,
    onSolo: (id) => { soloSource = id; renderRecommendations(); },
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

// ---------- shared state bridge (side panel <-> Rankings Manager tab) ----------
function manualKeys() {
  return Object.keys(manualTaken)
    .filter((id) => manualTaken[id])
    .map((id) => {
      const p = players[Number(id)];
      return p ? playerKey(p.name, p.pos) : null;
    })
    .filter(Boolean);
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
  const wanted = new Set(keys || []);
  const next = {};
  players.forEach((p) => {
    if (wanted.has(playerKey(p.name, p.pos))) next[p.id] = true;
  });
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
    renderRecommendations();
  }
  if (changes[K_ADP]) {
    adp = await loadAdp();
    renderRecommendations();
  }
  if (changes[K_FLAGS]) {
    flags = await loadFlags();
    renderAll();
  }
  if (changes[K_MERGES]) {
    merges = await loadMerges();
    renderRecommendations();
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

    const nextTaken = {};
    const sharedPicks = []; // source-agnostic record for the Rankings Manager
    unmatched = [];
    picks.forEach((pk) => {
      const md = pk.metadata || {};
      const first = md.first_name || "";
      const last = md.last_name || "";
      const pos = (md.position || "").toUpperCase();
      if (!first && !last) return;
      if (!["QB","RB","WR","TE"].includes(pos)) return; // skip K/DEF picks entirely
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

      const m = matchPick(first, last, pos);
      if (m) {
        nextTaken[m.id] = { byMe: mine, pickNo: pk.pick_no };
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
    $("status").className = "live pulse";
    setTimeout(() => $("status").classList.remove("pulse"), 500);
    let msg = `● LIVE — ${picks.length} picks synced`;
    if (unmatched.length) msg += ` · ${unmatched.length} not in your rankings (ignored)`;
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
  countdownTimer = setInterval(updateCacheCountdown, 1000);
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
  const id = Number(row.dataset.id);
  if (taken[id]) return; // synced picks can't be un-clicked (they're real)
  const p = players[id];
  if (manualTaken[id]) {
    delete manualTaken[id];
    toast(`${p.name} put back on the board.`);
  } else {
    manualTaken[id] = true;
    toast(`${p.name} crossed off — double-click again to undo.`);
  }
  renderAll();
  persistDraftState(); // keep the manager tab in step
});

// ---------- settings drawer / pop-out ----------
$("settingsBtn").addEventListener("click", () => {
  const collapsed = $("settingsPanel").classList.toggle("collapsed");
  $("settingsBtn").classList.toggle("on", !collapsed);
});

// The side panel can't detach, but the same page opens fine as a normal window,
// so this is a real second-monitor view with no separate codebase. window.close()
// is what actually closes a side panel from its own script (there's no
// chrome.sidePanel.close() — confirmed against Chrome's docs).
$("popOutBtn").addEventListener("click", () => {
  chrome.windows.create({
    url: chrome.runtime.getURL("panel.html?popout=1"),
    type: "popup",
    width: 620,
    height: 900,
  });
  window.close();
});

$("showAllBtn").addEventListener("click", () => {
  soloSource = null;
  renderRecommendations();
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

$("openManager").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("rankings-manager.html") });
});

document.querySelectorAll(".pf[data-pos]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pf[data-pos]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    posFilter = btn.dataset.pos;
    renderBoard();
  });
});
$("takenToggle").addEventListener("click", () => {
  showTaken = !showTaken;
  $("takenToggle").classList.toggle("active", showTaken);
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

  // Carry over picks already synced by another open copy of this panel (the
  // pop-out window and the docked panel each poll independently). Only when it's
  // the SAME draft — otherwise a previous draft's crossouts would bleed through.
  const d = await loadDraftState();
  if (d.draftId && id && String(d.draftId) === String(id)) {
    lastSharedPicks = d.picks || [];
    if (d.manualKeys) applyManualKeysFromStorage(d.manualKeys);
  }

  sources = await loadSources();
  adp = await loadAdp();
  flags = await loadFlags();
  merges = await loadMerges();

  // A popped-out window can't sensibly pop out again (or self-close into nothing).
  if (new URLSearchParams(location.search).get("popout")) {
    $("popOutBtn").style.display = "none";
  }

  // Settings start open so first-run has the draft ID box visible.
  $("settingsBtn").classList.add("on");
  renderAll();
})();

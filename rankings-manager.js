// ============================================================
// 4th&Go — Rankings Manager (full-tab surface)
// Backlog #1 (importable rankings), #3 (multi-source side-by-side),
// #9 (ADP delta column) and the "one best pick" half of #2.
//
// Reads/writes the same chrome.storage.local state the board window uses, so a
// pick synced there shows up here without a refresh (and vice versa for manual
// crossouts). This surface never polls Sleeper itself — panel.js owns that.
// ============================================================

let sources = [];
let draft = { picks: [], manualKeys: [], draftId: null, myRosterId: null };
let adpSources = []; // multiple ADP sources can be enabled at once — see makeAdpSource in shared.js
let flags = {}; // playerKey -> "favorite" | "avoid"
let injuries = {}; // playerKey -> {status,bodyPart,updatedAt}, loaded from K_INJURIES — see injuryBadge() in shared.js
let merges = {}; // variantKey → canonicalKey, unmatched player reconciliation
let posFilter = "ALL";
let showTaken = false; // independent toggle, layered on top of posFilter — not a 6th filter option
let playerSearch = ""; // name/team substring filter, layered on top of posFilter/showTaken
let soloSource = null;   // when set, the whole page shows just this source
let editingAdp = false;  // the add/import modal is in "ADP" mode
let projMap = {};        // playerKey -> projected PPR points, for the VALUE (BEER/VBD) column
let sortByValue = false; // click the VALUE column header to toggle sorting the table by it
const echo = makeEchoGuard(); // per-key — saving sources must not swallow a live pick update (see shared.js)
let includeKdst = true; // master K/DST toggle (K_INCLUDE_KDST, shared.js) — set from the board window's Settings, read here so this surface's filters/table match it. Default true.

// ---------- Rankings Creator state ----------
let activeTab = "sources"; // "sources" | "creator" — which top-level tab is showing
let customBoards = [];     // array of board objects — see shared.js's loadCustomBoards for the shape
let activeBoardId = null;
let playerStats = {};      // playerKey -> {basic:[...], options:{id:{...}}} — same shape/source as the board's stat columns
let sleeperIds = {};        // playerKey -> Sleeper's own numeric player_id (headshots), loaded from K_SLEEPER_IDS
let creatorVisibleStats = { ...DEFAULT_VISIBLE_STATS }; // shares K_STAT_PREFS with the board — same picker, same prefs
let creatorSearch = "";
let creatorPosFilter = "ALL"; // ALL/QB/RB/WR/TE — a VIEW filter on the one combined order, not a second ranking (see renderCreatorList)
let creatorSelectedKey = null; // clicking a row brings that position's stat group forward, same as the board
// Custom pointer-driven drag — NOT native HTML5 drag-and-drop. The native
// dragstart/dragover/drop API was tried first and was genuinely bad here:
// the browser owns the drag image and its position, dragover delivery is
// throttled/coalesced by the browser rather than tracking the pointer 1:1,
// and there's an unavoidable frame or more of latency between the cursor
// and the ghost — reported directly as "not sticky, not addictive," and
// confirmed by the Apple/Emil design-eng principles this was checked
// against afterward: direct manipulation requires the dragged element to
// track the pointer with zero added latency, which native HTML5 DnD simply
// cannot give you. Pointer Events + a raw `transform: translateY()` set on
// every pointermove (no CSS transition on the dragged row itself) does.
let crSort = null; // active list-reorder drag, or null — see startListDrag
let crGhost = null; // active pool→list placement drag, or null — see startPoolDrag

// ---------- derived draft state ----------
function takenMap() {
  const m = new Map();
  draft.picks.forEach((p) => m.set(p.key, { byMe: p.byMe, pickNo: p.pickNo }));
  (draft.manualKeys || []).forEach((k) => {
    if (!m.has(k)) m.set(k, { byMe: false, pickNo: null, manual: true });
  });
  return m;
}

// Storage writes were fire-and-forget: a failure showed up only as an
// unhandled rejection in a console nobody has open, while the UI carried on
// as if the change had been saved.
function reportSaveFailure(what) {
  return (e) => {
    console.error(`[4th&Go] couldn't save ${what}`, e);
    toast(`Couldn't save ${what} — your change may not stick.`, true);
  };
}

// ---------- rendering ----------
// activeSources() now lives in shared.js — call as activeSources(sources, soloSource).

function renderSyncLine() {
  const n = draft.picks.length;
  $("syncLine").textContent = draft.draftId
    ? `Synced · Draft ${draft.draftId} · ${n} pick${n === 1 ? "" : "s"} off the board`
    : "Not synced — open the board window and hit sync";
  $("syncPill").classList.toggle("off", !draft.draftId);
}

// Two-letter tag shown in a chip's swatch when the source has no uploaded
// icon — first letter of up to the first two words of the name ("Fantasy
// Flock Rankings" -> "FF", "Sleeper Live ADP" -> "SL"), purely decorative.
function sourceInitials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
}

function renderSourceBar() {
  const bar = $("sourceBar");
  const chips = sources.map((s) => {
    const solo = soloSource === s.id;
    const cls = `chip${s.enabled ? "" : " disabled"}${solo ? " solo" : ""}`;
    const edit = `<span class="edit-src" data-edit="${esc(s.id)}" title="Edit this source · ${esc(formatLastUpdated(s.importedAt))}" style="cursor:pointer;color:var(--text-disabled)">✎</span>`;
    const del = s.undeletable ? "" : `<span class="x" data-del="${esc(s.id)}" title="Remove source">✕</span>`;
    const swatch = s.icon
      ? `<span class="sw"><img src="${esc(s.icon)}" /></span>`
      : `<span class="sw" style="background:${esc(s.color)}">${esc(sourceInitials(s.name))}</span>`;
    const posOnlyBadge = s.positionOnly ? `<span style="color:var(--dim);font-size:9px;margin-left:3px" title="Position-only — reference column, doesn't affect blended rank/tier">POS</span>` : "";
    return `<span class="${cls}" data-toggle="${esc(s.id)}" title="Click to enable/disable · double-click to isolate">
      ${swatch}<span>${esc(s.name)}</span>${posOnlyBadge}<span class="ct">${s.players.length}</span>${edit}${del}</span>`;
  }).join("");

  const adpChips = adpSources.map((s) => {
    const cls = `chip${s.enabled ? "" : " disabled"}`;
    const edit = `<span class="edit-src" data-editadp="${esc(s.id)}" title="Edit this ADP source · ${esc(formatLastUpdated(s.importedAt))}" style="cursor:pointer;color:var(--text-disabled)">✎</span>`;
    const del = `<span class="x" data-deladp="${esc(s.id)}" title="Remove ADP source">✕</span>`;
    const swatch = s.icon
      ? `<span class="sw"><img src="${esc(s.icon)}" /></span>`
      : `<span class="sw" style="background:${esc(s.color)}">${esc(sourceInitials(s.name))}</span>`;
    return `<span class="${cls}" data-toggleadp="${esc(s.id)}" title="Click to enable/disable — each enabled ADP source gets its own column, and the value/reach meter blends whichever are on">
      ${swatch}<span>${esc(s.name)}</span><span class="ct">${s.players.length}</span>${edit}${del}</span>`;
  }).join("");

  bar.innerHTML = chips + adpChips +
    `<span class="chipAdd" id="addAdpBtn">+ Add ADP source</span>` +
    `<span class="chipAdd" id="addSrcBtn">+ Add source</span>` +
    `<div class="toolRow">` +
    `<button class="alt" id="fetchSleeperAdpBtn" title="Auto-fetch live ADP straight from Sleeper's own public API (api.sleeper.app/projections), matched to your league's scoring format — no login, same domain this extension already talks to">⟳ Fetch Sleeper ADP</button>` +
    `<button class="alt" id="fetchProjectionsBtn" title="Auto-fetch season point projections from the same Sleeper API, used to compute the BEER column">⟳ Fetch projections</button>` +
    `<button class="alt" id="fetchStatsBtn" title="Auto-fetch the board's stat columns (projected volume + prior-season target share/air yards/red-zone targets) from Sleeper's public API — same domain, no login">⟳ Fetch stats</button>` +
    `<button class="alt" id="downloadSkillBtn" title="Download a Claude Code skill (SKILL.md) that converts any raw rankings/ADP export into an importable CSV — drop it in .claude/skills/">⬇ Download AI skill</button>` +
    `<button class="alt" id="copyPromptBtn" title="Copy a standalone prompt (for claude.ai, ChatGPT, etc.) that does the same CSV conversion — paste your raw export after it">⧉ Copy AI prompt</button>` +
    (soloSource ? `<button class="alt" id="showAllBtn">↺ Show all sources</button>` : "") +
    `</div>`;

  bar.querySelectorAll("[data-toggleadp]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.dataset.deladp || e.target.dataset.editadp) return;
      const s = adpSources.find((x) => x.id === el.dataset.toggleadp);
      s.enabled = !s.enabled;
      persistAdpSources();
      renderAll();
    });
  });
  bar.querySelectorAll("[data-deladp]").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const s = adpSources.find((x) => x.id === el.dataset.deladp);
      const confirmed = await showConfirm(`Remove "${s.name}"?`, `This ADP source will be permanently deleted. This can't be undone.`, "REMOVE");
      if (!confirmed) return;
      adpSources = adpSources.filter((x) => x.id !== el.dataset.deladp);
      persistAdpSources();
      renderAll();
    });
  });
  bar.querySelectorAll("[data-editadp]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditModal("adp", el.dataset.editadp);
    });
  });

  bar.querySelectorAll("[data-toggle]").forEach((el) => {
    let clickTimeout;
    el.addEventListener("click", (e) => {
      if (e.target.dataset.del) return;
      clearTimeout(clickTimeout);
      clickTimeout = setTimeout(() => {
        const s = sources.find((x) => x.id === el.dataset.toggle);
        s.enabled = !s.enabled;
        if (!s.enabled && soloSource === s.id) soloSource = null;
        persistSources();
        renderAll();
      }, 200);
    });
    el.addEventListener("dblclick", () => {
      clearTimeout(clickTimeout);
      soloSource = soloSource === el.dataset.toggle ? null : el.dataset.toggle;
      renderAll();
    });
  });
  bar.querySelectorAll("[data-del]").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const s = sources.find((x) => x.id === el.dataset.del);
      const confirmed = await showConfirm(`Remove "${s.name}"?`, `This ranking source will be permanently deleted. This can't be undone.`, "REMOVE");
      if (!confirmed) return;
      sources = sources.filter((x) => x.id !== el.dataset.del);
      if (soloSource === el.dataset.del) soloSource = null;
      persistSources();
      renderAll();
    });
  });
  bar.querySelectorAll("[data-edit]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditModal("source", el.dataset.edit);
    });
  });
  $("addSrcBtn").addEventListener("click", () => openModal(false));
  $("addAdpBtn").addEventListener("click", () => openModal(true));
  $("fetchSleeperAdpBtn").addEventListener("click", fetchSleeperAdp);
  $("fetchProjectionsBtn").addEventListener("click", fetchProjections);
  $("fetchStatsBtn").addEventListener("click", fetchSleeperStats);
  $("downloadSkillBtn").addEventListener("click", downloadConverterSkill);
  $("copyPromptBtn").addEventListener("click", copyConverterPrompt);
  if ($("showAllBtn")) $("showAllBtn").addEventListener("click", () => { soloSource = null; renderAll(); });
}

// Both buttons wrap the shared CONVERTER_INSTRUCTIONS_MD body (shared.js) —
// see that file's comment for why the rules live in one place. The skill
// download is for Claude Code users (drop the file into .claude/skills/
// <name>/SKILL.md); the copy button is for everyone else (paste into any
// chat alongside the raw export). Neither depends on this repo's bundled
// name data — a fresh install ships with zero ranking sources, so the
// conversion has to work standalone.
function downloadConverterSkill() {
  const blob = new Blob([RANKING_CONVERTER_SKILL_MD], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "SKILL.md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Downloaded SKILL.md — save it as .claude/skills/rankings-csv-converter/SKILL.md in a Claude Code project to use it");
}

async function copyConverterPrompt() {
  try {
    await navigator.clipboard.writeText(RANKING_CONVERTER_PROMPT_MD);
    toast("Prompt copied — paste it into a chat (with your raw export) to convert a source");
  } catch (err) {
    // Clipboard permission can fail in some contexts — fall back to a
    // downloadable .md so the user still gets the content either way.
    const blob = new Blob([RANKING_CONVERTER_PROMPT_MD], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rankings-csv-converter-prompt.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Couldn't copy to clipboard — downloaded the prompt as a .md file instead", true);
  }
}

// Auto-fetch live PPR ADP straight from Sleeper's own public API.
// CORRECTION to earlier project notes: docs.sleeper.com's documented endpoint
// list has no ADP route, which is what earlier sessions checked — but this
// undocumented projections endpoint carries adp_ppr/adp_std/adp_half_ppr/etc
// as fields inside each player's `stats` blob, is fully public (no auth
// header needed), has open CORS (access-control-allow-origin: *), and lives
// on api.sleeper.app — a domain already in manifest.json's host_permissions,
// so no permission change was needed. Verified 2026-08-23 against real
// current-season data (last_modified within the last day, top ADP order
// matching FantasyPros/FFC's own consensus).
// The actual fetch+parse now lives in shared.js's fetchSleeperAdpPlayers()
// (also used by the board window's silent auto-refresh on load) — this is
// just the button's disabled/text-swap + toast wrapper around it.
async function fetchSleeperAdp() {
  const btn = $("fetchSleeperAdpBtn");
  btn.disabled = true;
  btn.textContent = "⟳ FETCHING…";
  try {
    const players = await fetchSleeperAdpPlayers();
    await upsertAdpSource("adp_sleeper_live", "Sleeper Live ADP", "#5FA8E8", players);
    renderAll();
    // A real ADP set from this endpoint is several hundred players. A handful
    // is a partial/degraded response, which otherwise looks identical to
    // normal: the column just shows "·" for everyone missing, exactly like a
    // player simply not being in that source.
    if (players.length < MIN_PLAUSIBLE_ADP_PLAYERS) {
      toast(`ADP fetched, but only ${players.length} players came back — that's far fewer than expected. Check the column before trusting it.`, true);
    } else {
      toast(`ADP fetched — ${players.length} players from Sleeper's own ADP`);
    }
  } catch (err) {
    toast(`Sleeper ADP fetch failed: ${err.message} — use "+ ADD ADP SOURCE" to paste an export instead`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "⟳ FETCH SLEEPER ADP";
  }
}

// Manual wrapper around fetchSleeperProjections() (shared.js) — same pure
// fetch function the silent auto-refresh uses in both surfaces, just with
// button disable/text-swap + a toast around it. See shared.js's BEER/VBD
// section for what this data feeds (the live replacement-level calc).
async function fetchProjections() {
  const btn = $("fetchProjectionsBtn");
  btn.disabled = true;
  btn.textContent = "⟳ FETCHING…";
  try {
    const players = await fetchSleeperProjections();
    const map = {};
    players.forEach((p) => { map[p.key] = p.pts; });
    projMap = map;
    await saveProjections(map);
    renderAll();
    toast(`Projections fetched — ${players.length} players, feeds the BEER column`);
  } catch (err) {
    toast(`Sleeper projections fetch failed: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "⟳ FETCH PROJECTIONS";
  }
}

// Auto-fetches the 3 board-facing stats per position (see the comment above
// loadPlayerStats in shared.js for which stat maps to which position and
// why). The actual fetch+parse now lives in shared.js's
// fetchSleeperStatsPlayers() (also used by the board window's silent
// auto-refresh on load) — this is just the button's UI wrapper.
async function fetchSleeperStats() {
  const btn = $("fetchStatsBtn");
  btn.disabled = true;
  btn.textContent = "⟳ FETCHING…";
  try {
    const { year, players, playerCount } = await fetchSleeperStatsPlayers();
    await saveStatsToStorage(year, players);
    renderAll();
    if (playerCount < MIN_PLAUSIBLE_STATS_PLAYERS) {
      toast(`Stats fetched, but only ${playerCount} players came back — that's far fewer than expected. Check the board before trusting it.`, true);
    } else {
      toast(`Stats fetched — ${playerCount} players (${year} projected volume + ${year - 1} usage)`);
    }
  } catch (err) {
    toast(`Sleeper stats fetch failed: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "⟳ FETCH STATS";
  }
}

const MAX_TABLE_ROWS = 400; // render cap — see the disclosure row at the bottom of this function
function renderTable(rows) {
  const taken = takenMap();
  const cols = activeSources(sources, soloSource);
  const adpCols = adpSources.filter((s) => s.enabled);
  const adpConsensus = buildAdpConsensus(adpSources);
  const valueMap = buildValueComparison(adpSources);
  // BEER/VBD value — see claude.md and shared.js's buildBeerValues() for the
  // full writeup. Live: recomputed from whoever's still available (taken)
  // every render, same as the board window.
  const { values: beerValues } = buildBeerValues(rows, projMap, new Set(taken.keys()));

  // Same applyFilters() path panel.js's board uses now (shared.js) — see
  // claude.md for why this used to be a second, independently-drifting copy.
  let list = applyFilters(rows, { posFilter, showTaken, playerSearch, isGone: (r) => taken.has(r.key) });
  if (sortByValue) {
    // Undrafted-with-a-value rows first (highest value first), then everyone
    // without a computed value (no projection data) in their normal order —
    // pushing those to the bottom instead of treating a missing value as 0,
    // which would otherwise rank them above legitimately low-value players.
    list = list.slice().sort((a, b) => {
      const va = beerValues.get(a.key), vb = beerValues.get(b.key);
      if (va === undefined && vb === undefined) return 0;
      if (va === undefined) return 1;
      if (vb === undefined) return -1;
      return vb - va;
    });
  }

  if (!list.length) {
    $("tbl").innerHTML = `<tr><td class="empty">Nothing here.</td></tr>`;
    return;
  }

  const head = `<tr>
    <th class="l">#</th>
    <th class="l">PLAYER</th>
    <th>POS</th>
    <th>TIER</th>
    <th>CONSENSUS</th>
    ${cols.map((s) => `<th style="color:${esc(s.color)}" title="${s.positionOnly ? "Position-only source — shows this source's own within-position tier, not a rank. Reference only, never affects blended rank/tier." : ""}">${esc(s.name.toUpperCase())}${s.positionOnly ? " ⓘ" : ""}</th>`).join("")}
    ${adpCols.map((s) => `<th style="color:${esc(s.color)}">${esc(s.name.toUpperCase())}</th>`).join("")}
    <th title="Sleeper Live ADP vs. your other enabled ADP source(s) (baseline). Green = Sleeper drafts them later than baseline (a discount). Red = Sleeper drafts them earlier than baseline (a reach). Needs Sleeper Live ADP + at least one other ADP source enabled.">VALUE</th>
    <th id="valueColHead" style="cursor:pointer;user-select:none" title="BEER value — projected points (your league's scoring) above replacement level at this player's position, recomputed live as the draft goes. Click to sort by it.">BEER${sortByValue ? " ▼" : ""}</th>
    <th></th>
  </tr>`;

  const body = list.slice(0, MAX_TABLE_ROWS).map((r, i) => {
    const t = taken.get(r.key);
    const c = POS_COLORS[r.pos] || { text: "var(--dim2)", bg: "transparent", border: "var(--line2)" };
    const adpEntry = adpConsensus.get(r.key);
    const vc = valueMap.get(r.key);
    const beerVal = beerValues.get(r.key);
    const tier = r.tier && TIER_COLORS[r.tier]
      ? `<span class="tierChip" style="background:${TIER_COLORS[r.tier]}">${esc(r.tier)}</span>` : "";
    const flag = flags[r.key];
    const rowFlagClass = flag === "favorite" ? " favRow" : flag === "avoid" ? " avoidRow" : "";
    return `<tr class="${t ? "gone" : ""} ${t && t.byMe ? "mine" : ""}${rowFlagClass}" data-pos="${esc(r.pos)}" data-pname="${esc(r.name)}" data-ppos="${esc(r.pos)}">
      <td class="l" style="color:var(--dim)">${i + 1}</td>
      <td class="l nm" title="Right-click to find &amp; merge near-match orphans">
        <span class="avatarNameRow">${avatarHtml(r.key, r.name, r.pos, r.team, "sm", sleeperIds)}<span>${flagBadge(flag)}${esc(r.name)} ${injuryBadge(injuries[r.key], { useTitle: true })} ${t && t.pickNo ? `<span style="color:var(--dim);font-size:10px">pk ${t.pickNo}</span>` : ""}</span></span>
      </td>
      <td><span class="posChip" style="color:${c.text};background:${c.bg};border-color:${c.border}">${esc(r.pos)}</span></td>
      <td>${tier}</td>
      <td style="color:var(--text)">${r.consensus?.toFixed(1) ?? "—"}</td>
      ${cols.map((s) => {
        const val = s.positionOnly ? r.posOnlyTiers?.[s.id] : r.ranks[s.id];
        return `<td style="color:${val !== undefined ? "var(--dim2)" : "var(--dim)"}">${esc(val ?? "·")}</td>`;
      }).join("")}
      ${adpCols.map((s) => `<td style="color:${adpEntry?.values[s.id] !== undefined ? "var(--dim2)" : "var(--dim)"}">${esc(adpEntry?.values[s.id] ?? "·")}</td>`).join("")}
      <td>${renderValueBadge(vc?.delta ?? null, vc?.baselineAdp)}</td>
      <td style="color:${beerVal !== undefined ? "var(--dim2)" : "var(--dim)"}">${beerVal !== undefined ? `${beerVal >= 0 ? "+" : ""}${beerVal.toFixed(1)}` : "·"}</td>
      <td>
        <span class="flagBtn${flag === "favorite" ? " on fav" : ""}" data-flag="${esc(r.key)}" data-kind="favorite" title="Favorite">★</span>
        <span class="flagBtn${flag === "avoid" ? " on avoid" : ""}" data-flag="${esc(r.key)}" data-kind="avoid" title="Flag to avoid">⊘</span>
        <span class="xbtn" data-key="${esc(r.key)}" title="${t ? "Un-cross (manual only)" : "Cross off manually"}">${t ? "↺" : "✕"}</span>
      </td>
    </tr>`;
  }).join("");

  // Silently dropping the tail is the problem, not the cap itself: the rows
  // past the cutoff are exactly the deep-bench and name-mismatch players you'd
  // open this table to go looking for. Four sources — two of them using
  // abbreviated first names, which don't merge into existing rows — measured
  // 651 merged rows, so this IS reachable, not theoretical.
  const truncated = list.length > MAX_TABLE_ROWS
    ? `<tr><td class="empty" colspan="99">Showing the first ${MAX_TABLE_ROWS} of ${list.length} players — use the position filters or the search box to narrow this down.</td></tr>`
    : "";
  $("tbl").innerHTML = head + body + truncated;

  $("tbl").querySelectorAll("[data-key]").forEach((el) => {
    el.addEventListener("click", () => toggleManual(el.dataset.key));
  });
  $("tbl").querySelectorAll("[data-flag]").forEach((el) => {
    el.addEventListener("click", () => toggleFlag(el.dataset.flag, el.dataset.kind));
  });
  $("valueColHead").addEventListener("click", () => {
    sortByValue = !sortByValue;
    renderAll();
  });
}

function toggleFlag(key, kind) {
  const next = { ...flags };
  if (next[key] === kind) delete next[key];
  else next[key] = kind;
  flags = next;
  echo.write(K_FLAGS, () => saveFlags(flags)).catch(reportSaveFailure("flags"));
  renderAll();
}

// Orphans past this rank are almost always late-round/deep-bench players
// where a name mismatch just doesn't matter — merging them is busywork, and
// they used to bury the handful of actually-relevant early orphans in a long
// scroll. Collapsed by default for the same reason: this section is a rare
// safety net, not something that needs to stay open and eat screen space
// above the main player table on every visit.
const ORPHAN_RANK_LIMIT = 150;
let orphansCollapsed = true;

function renderOrphans() {
  const rawOrphans = findOrphans(sources, merges);
  let totalRaw = 0;
  const orphanList = Object.entries(rawOrphans).map(([srcId, keys]) => {
    const src = sources.find((s) => s.id === srcId);
    totalRaw += keys.length;
    const keptKeys = keys.filter((key) => {
      const player = src && src.players.find((p) => playerKey(p.name, p.pos) === key);
      return player && isFinite(player.rank) && player.rank < ORPHAN_RANK_LIMIT;
    });
    return [srcId, keptKeys];
  }).filter(([, keys]) => keys.length);

  // Hiding the whole section when nothing qualifies is what made this feature
  // impossible to find: a user who imported sources full of abbreviated names
  // ("K. Gainwell") had every mismatch land below the rank cutoff, so the
  // section didn't render collapsed-and-empty — it vanished from the page, and
  // reconciliation looked like it had stopped existing. A feature you can't
  // see is a feature you don't have. It now always shows whenever it COULD
  // have something to say (2+ enabled sources, which is what findOrphans
  // itself requires), and says plainly when it has nothing.
  const enabledCount = sources.filter((s) => s.enabled).length;
  if (enabledCount < 2) {
    $("orphansSection").style.display = "none"; // genuinely N/A — nothing to cross-match against
    return;
  }
  $("orphansSection").style.display = "block";
  const totalKept = orphanList.reduce((n, [, keys]) => n + keys.length, 0);
  const hidden = totalRaw - totalKept;
  $("orphansCount").textContent = `${totalKept} player${totalKept === 1 ? "" : "s"}${hidden ? ` · ${hidden} below rank ${ORPHAN_RANK_LIMIT} hidden` : ""}`;

  if (!orphanList.length) {
    // The empty state doubles as the only visible advertisement that the
    // right-click merge path exists at all — it's otherwise a hidden gesture
    // with no affordance anywhere on the page.
    $("orphansList").innerHTML =
      `<div style="color:var(--dim)">Every player is matched across your enabled sources` +
      (hidden ? `, apart from ${hidden} ranked below ${ORPHAN_RANK_LIMIT} (too deep to matter).` : ".") +
      ` To reconcile a name yourself, right-click any player in the table below and choose "merge near matches".</div>`;
    $("orphansList").style.display = orphansCollapsed ? "none" : "block";
    $("orphansToggle").textContent = orphansCollapsed ? "▸" : "▾";
    return;
  }
  const html = orphanList.map(([srcId, keys]) => {
    const src = sources.find((s) => s.id === srcId);
    const srcName = src ? src.name : `Source ${srcId}`;
    const pairs = keys.map((key) => {
      const [name, pos] = key.split("|");
      const player = src.players.find((p) => playerKey(p.name, p.pos) === key);
      const rank = player ? `(rank ${player.rank})` : "";
      return `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
        <span style="flex:1">${esc(name)} ${esc(pos)} ${esc(rank)}</span>
        <button data-merge="${esc(key)}" class="mergeBtn" style="padding:3px 8px;font-size:10px">MERGE</button>
      </div>`;
    }).join("");
    return `<div style="margin-bottom:8px"><span style="color:var(--dim)">${esc(srcName)}</span>${pairs}</div>`;
  }).join("");
  $("orphansList").innerHTML = html;
  $("orphansList").style.display = orphansCollapsed ? "none" : "block";
  $("orphansToggle").textContent = orphansCollapsed ? "▸" : "▾";

  document.querySelectorAll("[data-merge]").forEach((btn) => {
    btn.addEventListener("click", () => openMergeModal(btn.dataset.merge));
  });
}
$("orphansHeader").addEventListener("click", () => {
  orphansCollapsed = !orphansCollapsed;
  renderOrphans();
});

// ---------- merge modal ----------
// Replaced a native prompt() asking users to type "Name|POS" freehand — an
// easy format to get slightly wrong (extra space, missing pipe) with a
// generic error toast as the only feedback, so a failed merge just silently
// left the orphan unchanged and looked like nothing happened at all. This
// lists actual candidate players from other enabled sources at the same
// position, so merging is a click, not a typed guess.
let mergingOrphanKey = null;

function mergeCandidatesFor(orphanKey) {
  const pos = orphanKey.split("|")[1];
  const seen = new Map(); // canonicalKey -> { name, pos, rank, sourceNames:[] }
  sources.filter((s) => s.enabled).forEach((s) => {
    s.players.forEach((p) => {
      if (p.pos !== pos) return;
      const key = playerKey(p.name, p.pos);
      if (key === orphanKey) return; // never offer merging a player with itself
      if (!seen.has(key)) seen.set(key, { name: p.name, pos: p.pos, rank: p.rank, sourceNames: [] });
      seen.get(key).sourceNames.push(s.name);
    });
  });
  return [...seen.values()].sort((a, b) => a.rank - b.rank);
}
function renderMergeCandidates(filterText) {
  const q = filterText.trim().toLowerCase();
  const candidates = mergeCandidatesFor(mergingOrphanKey).filter((c) => !q || c.name.toLowerCase().includes(q));
  const el = $("mergeCandidates");
  if (!candidates.length) {
    el.innerHTML = `<div class="empty">No matching players at this position in another source.</div>`;
    return;
  }
  el.innerHTML = candidates.map((c) => `
    <div class="mergeCandidate" data-name="${esc(c.name)}" data-pos="${esc(c.pos)}">
      <span>${esc(c.name)}</span>
      <span class="src">${esc(c.sourceNames.join(", "))} · rank ${esc(c.rank)}</span>
    </div>`).join("");
  el.querySelectorAll(".mergeCandidate").forEach((row) => {
    row.addEventListener("click", () => {
      const canonicalKey = playerKey(row.dataset.name, row.dataset.pos);
      const orphanName = mergingOrphanKey.split("|")[0];
      const next = { ...merges };
      next[mergingOrphanKey] = canonicalKey;
      merges = next;
      echo.write(K_MERGES, () => saveMerges(merges)).catch(reportSaveFailure("merges"));
      toast(`Merged "${orphanName}" into "${row.dataset.name}".`);
      closeMergeModal();
      renderAll();
    });
  });
}
function openMergeModal(orphanKey) {
  mergingOrphanKey = orphanKey;
  const [name, pos] = orphanKey.split("|");
  $("mergeHint").textContent = `"${name}" (${pos}) only appears in one source. Pick which player it actually is:`;
  $("mergeSearch").value = "";
  renderMergeCandidates("");
  $("mergeModal").classList.add("open");
}
function closeMergeModal() { $("mergeModal").classList.remove("open"); mergingOrphanKey = null; }
$("mergeSearch").addEventListener("input", () => renderMergeCandidates($("mergeSearch").value));
$("mergeCancelBtn").addEventListener("click", closeMergeModal);
$("mergeModal").addEventListener("click", (e) => { if (e.target.id === "mergeModal") closeMergeModal(); });

// ---------- right-click "merge near matches" menu ----------
// The orphans list above only surfaces mismatches ranked under 150 (deep-
// bench name variants aren't worth the scroll), and even within that, it's
// one merge at a time. This is the other direction: right-click a player
// ALREADY on the board and find every other source's likely-same-person
// entry in one shot, regardless of rank — for a source like Boone/Smyth
// where an abbreviated name ("K. Gainwell") never matched the canonical
// "Kenneth Gainwell" and would otherwise sit unmerged forever past the
// orphans list's rank cutoff.
function closeNearMergeMenu() {
  const el = $("nearMergeMenu");
  if (el) el.remove();
  document.removeEventListener("click", closeNearMergeMenu);
  document.removeEventListener("keydown", onNearMergeMenuKey);
}
function onNearMergeMenuKey(e) {
  if (e.key === "Escape") closeNearMergeMenu();
}
function openNearMergeMenu(x, y, name, pos) {
  closeNearMergeMenu();
  const canonicalKey = playerKey(name, pos);
  const matches = findNearMatchOrphans(name, pos, sources, merges);
  const menu = document.createElement("div");
  menu.id = "nearMergeMenu";
  menu.className = "nearMergeMenu";
  if (!matches.length) {
    menu.innerHTML = `<div class="nmm-title">No likely name-mismatch found for "${esc(name)}" in another source.</div>`;
  } else {
    menu.innerHTML = `
      <div class="nmm-title">Found ${matches.length} likely match${matches.length > 1 ? "es" : ""} for "${esc(name)}" (${esc(pos)}) in other sources — merge into this player?</div>
      ${matches.map((m, i) => `
        <div class="nmm-row">
          <input type="checkbox" id="nmm-${i}" data-idx="${i}" checked />
          <label for="nmm-${i}">${esc(m.name)} <span class="nmm-src">${esc(m.srcName)} · rank ${esc(m.rank)}</span></label>
        </div>`).join("")}
      <div class="nmm-actions">
        <button class="nmm-merge">MERGE SELECTED</button>
        <button class="nmm-cancel">Cancel</button>
      </div>`;
  }
  document.body.appendChild(menu);
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 6))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - h - 6))}px`;
  const mergeBtn = menu.querySelector(".nmm-merge");
  if (mergeBtn) {
    mergeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const checked = [...menu.querySelectorAll("input[type=checkbox]:checked")].map((cb) => matches[Number(cb.dataset.idx)]);
      if (!checked.length) { closeNearMergeMenu(); return; }
      const next = { ...merges };
      checked.forEach((m) => { next[m.key] = canonicalKey; });
      merges = next;
      echo.write(K_MERGES, () => saveMerges(merges)).catch(reportSaveFailure("merges"));
      toast(`Merged ${checked.length} player${checked.length > 1 ? "s" : ""} into "${name}".`);
      closeNearMergeMenu();
      renderAll();
    });
  }
  const cancelBtn = menu.querySelector(".nmm-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", (e) => { e.stopPropagation(); closeNearMergeMenu(); });
  menu.addEventListener("click", (e) => e.stopPropagation());
  setTimeout(() => {
    document.addEventListener("click", closeNearMergeMenu);
    document.addEventListener("keydown", onNearMergeMenuKey);
  }, 0);
}
$("tbl").addEventListener("contextmenu", (e) => {
  const nameEl = e.target.closest(".nm");
  if (!nameEl) return;
  const row = nameEl.closest("tr");
  if (!row || !row.dataset.pname) return;
  e.preventDefault();
  openNearMergeMenu(e.clientX, e.clientY, row.dataset.pname, row.dataset.ppos);
});

// This surface is curation-only: source management + the full side-by-side
// comparison table. Live recommendations and team counts live in the board window
// (they render from renderBestPicksWidget/renderTeamCountsWidget in shared.js,
// so re-adding them here later is just a mount point away).
// The definitive K/DST gate for this surface, same reasoning as panel.js's
// filterActivePositions — the master toggle hides K/DEF from the comparison
// table even if a K/DEF source happens to still be enabled in storage.
function filterActivePositions(rows) {
  return includeKdst ? rows : rows.filter((r) => CORE_POSITIONS.includes(r.pos));
}

function renderAll() {
  try {
    const rows = filterActivePositions(buildConsensus(activeSources(sources, soloSource), merges));
    renderSyncLine();
    renderSourceBar();
    renderTable(rows);
    renderOrphans();
  } catch (e) {
    // Same reasoning as panel.js's renderAll: fail legibly and leave a way
    // out, rather than showing an empty page on every load.
    console.error("[4th&Go] render failed", e);
    $("tbl").innerHTML =
      `<tr><td class="empty" colspan="99" style="color:var(--red)">
        <b>Couldn't draw the table.</b><br>${esc(e.message)}<br>
        <span style="color:var(--dim2)">One of your saved sources may be damaged — try removing the most
        recently added one from the chips above.</span>
      </td></tr>`;
  }
}

// ---------- manual crossouts ----------
function toggleManual(key) {
  // Real synced picks are facts — only manual crossouts are reversible here.
  if (draft.picks.some((p) => p.key === key)) {
    toast("That's a real synced pick — it can't be un-crossed.");
    return;
  }
  const set = new Set(draft.manualKeys || []);
  set.has(key) ? set.delete(key) : set.add(key);
  draft.manualKeys = [...set];
  echo.write(K_DRAFT, () => saveDraftState(draft)).catch(reportSaveFailure("crossouts"));
  renderAll();
}

async function persistSources() {
  await echo.write(K_SOURCES, () => saveSources(sources)).catch(reportSaveFailure("sources"));
}

async function persistAdpSources() {
  await echo.write(K_ADP, () => saveAdpSources(adpSources)).catch(reportSaveFailure("ADP sources"));
}
// Adds a new ADP source, or updates one in place (by fixed id) if it already
// exists — used by the live-fetch buttons so re-clicking "refresh" updates
// the same source rather than piling up duplicate entries. Preserves the
// existing enabled/disabled state across a refresh.
async function upsertAdpSource(id, name, color, players) {
  const idx = adpSources.findIndex((s) => s.id === id);
  const enabled = idx !== -1 ? adpSources[idx].enabled : true;
  const src = makeAdpSource(name, players, { id, color, enabled });
  if (idx !== -1) adpSources[idx] = src; else adpSources.push(src);
  await persistAdpSources();
}

// ---------- import modal ----------
function openModal(isAdp) {
  editingAdp = isAdp;
  $("modalTitle").textContent = isAdp ? "Add an ADP source" : "Add a ranking source";
  $("modalHint").innerHTML = isAdp
    ? `Paste or upload an ADP export — same flexible format as a ranking source, where the numeric column is the ADP value. Multiple ADP sources can be enabled at once; each gets its own column, and the value/reach meter blends whichever are on.`
    : `Columns are detected automatically. A header row is optional, and comma or tab separated both work. Recognized: Name, Team, Position, Tier, Rank — only Name is required.`;
  $("srcName").value = "";
  $("srcName").disabled = false;
  $("srcName").placeholder = isAdp ? "e.g. FantasyPros Real-Time ADP" : "e.g. FantasyPros ECR";
  $("srcPaste").value = "";
  $("srcFile").value = "";
  $("parseNote").textContent = "";
  $("parseNote").className = "";
  // Position-only doesn't apply to ADP sources — ADP never blends tiers at all.
  $("srcPositionOnlyRow").style.display = isAdp ? "none" : "";
  $("srcPositionOnlyHint").style.display = isAdp ? "none" : "";
  $("srcPositionOnly").checked = false;
  $("modal").classList.add("open");
}
function closeModal() { $("modal").classList.remove("open"); }

$("cancelBtn").addEventListener("click", closeModal);
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

// ---------- edit modal (rename, icon, replace CSV, last-updated status) ----------
// Replaces the old native prompt()-based rename with a proper menu — added so
// re-uploading a source day-of-draft doesn't mean re-running "+ ADD SOURCE"
// (which, for ranking sources, would create a duplicate rather than update in
// place; ADP sources already upserted by name). This modal always edits a
// known id directly, so there's no name-matching ambiguity either way.
let editingTarget = null;      // { kind: "source"|"adp", id }
let editingIconDataUrl;        // undefined = unchanged, null = cleared, string = new icon
let editingNewPlayers = null;  // parsed players from a freshly-chosen CSV, replacing the source's list on save

function findEditingSource() {
  const list = editingTarget.kind === "adp" ? adpSources : sources;
  return list.find((x) => x.id === editingTarget.id);
}
function renderEditIconPreview(dataUrl) {
  $("editIconPreview").innerHTML = dataUrl ? `<img src="${esc(dataUrl)}" />` : "";
}
function formatLastUpdated(ts) {
  if (!ts) return "Never re-uploaded since import.";
  return `Last updated ${new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.`;
}
function openEditModal(kind, id) {
  editingTarget = { kind, id };
  editingIconDataUrl = undefined;
  editingNewPlayers = null;
  const s = findEditingSource();
  $("editSrcName").value = s.name;
  renderEditIconPreview(s.icon || null);
  $("editSrcFile").value = "";
  $("editParseNote").textContent = "";
  $("editParseNote").className = "";
  // The code-seeded ranking sources (this default, and FantasyPros ECR)
  // normally re-seed their player list from the bundled JS file on every
  // load. Replacing the CSV here now sets manualOverride (see makeSource in
  // shared.js), which tells loadSources()/ensureBuiltinSources() to stop
  // doing that and trust this upload instead — so the option can just stay
  // visible for every ranking source rather than being hidden for these two.
  // Reads s.codeSeeded rather than a hardcoded id check (Stage 2 audit,
  // batch 7) — a third bundled source now only needs the flag set on it,
  // not this condition updated too.
  $("editCsvLabel").style.display = "";
  $("editSrcFile").style.display = "";
  $("editStatusLine").textContent = s.codeSeeded && !s.manualOverride
    ? "Built in — re-seeded from the bundled rankings file on every load. Upload a CSV below to take over from here."
    : formatLastUpdated(s.importedAt);
  // Position-only doesn't apply to ADP sources — ADP never blends tiers at all.
  $("editPositionOnlyRow").style.display = kind === "adp" ? "none" : "";
  $("editPositionOnlyHint").style.display = kind === "adp" ? "none" : "";
  $("editPositionOnly").checked = !!s.positionOnly;
  $("editModal").classList.add("open");
}
function closeEditModal() { $("editModal").classList.remove("open"); editingTarget = null; }
$("editCancelBtn").addEventListener("click", closeEditModal);
$("editModal").addEventListener("click", (e) => { if (e.target.id === "editModal") closeEditModal(); });

// Downscales to a small square PNG so a photo-sized upload doesn't bloat
// chrome.storage.local — the icon only ever renders at ~9-32px anyway.
function loadIconAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        const cropSize = Math.min(img.width, img.height);
        const sx = (img.width - cropSize) / 2, sy = (img.height - cropSize) / 2;
        ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}
$("editIconFile").addEventListener("change", async () => {
  const f = $("editIconFile").files[0];
  if (!f) return;
  try {
    editingIconDataUrl = await loadIconAsDataUrl(f);
    renderEditIconPreview(editingIconDataUrl);
  } catch (e) {
    toast(e.message, true);
  }
});
$("editIconClear").addEventListener("click", () => {
  editingIconDataUrl = null;
  renderEditIconPreview(null);
});
$("editSrcFile").addEventListener("change", () => {
  const f = $("editSrcFile").files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    const { players, warnings } = parseRankings(r.result);
    const note = $("editParseNote");
    // Same rule as the add-source path — replacing a working source's CSV with
    // an inert one is worse than a bad first import, since it silently guts a
    // source that was previously contributing.
    const v = validateParsedSource(players, warnings);
    if (v.level === "error") {
      note.className = "err";
      note.textContent = v.message;
      editingNewPlayers = null;
      return;
    }
    editingNewPlayers = players;
    note.className = v.level === "warn" ? "warn" : "ok";
    note.textContent = v.message + " Will replace the current list on save.";
  };
  r.readAsText(f);
});
$("editSaveBtn").addEventListener("click", async () => {
  const name = $("editSrcName").value.trim();
  if (!name) { toast("Give the source a name.", true); return; }
  const s = findEditingSource();
  s.name = name;
  if (editingIconDataUrl !== undefined) s.icon = editingIconDataUrl;
  if (editingTarget.kind === "source") s.positionOnly = $("editPositionOnly").checked;
  if (editingNewPlayers) {
    s.players = editingTarget.kind === "adp"
      ? editingNewPlayers.map((p) => ({ name: p.name, pos: p.pos, rank: p.rank }))
      : editingNewPlayers.map((p) => ({ name: p.name, team: p.team, pos: p.pos, tier: p.tier, rank: p.rank }));
    s.importedAt = Date.now();
    // Marks a code-seeded ranking source (default / fp) as user-owned from
    // here on, so loadSources()/ensureBuiltinSources() stop stomping this
    // upload back to the bundled JS file's content on the next load.
    if (editingTarget.kind === "source") s.manualOverride = true;
  }
  if (editingTarget.kind === "adp") await persistAdpSources();
  else await persistSources();
  closeEditModal();
  renderAll();
  toast(`Updated "${name}".`);
});

// ---------- confirm modal (themed replacement for native confirm) ----------
let confirmResolve = null;
function showConfirm(title, message, actionLabel = "DELETE") {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    $("confirmTitle").textContent = title;
    $("confirmMessage").textContent = message;
    $("confirmAction").textContent = actionLabel;
    $("confirmAction").style.background = actionLabel === "DELETE" ? "var(--red)" : "var(--green)";
    $("confirmModal").classList.add("open");
  });
}
function closeConfirmModal(result) {
  $("confirmModal").classList.remove("open");
  if (confirmResolve) confirmResolve(result);
  confirmResolve = null;
}

$("confirmCancel").addEventListener("click", () => closeConfirmModal(false));
$("confirmAction").addEventListener("click", () => closeConfirmModal(true));
$("confirmModal").addEventListener("click", (e) => { if (e.target.id === "confirmModal") closeConfirmModal(false); });

$("srcFile").addEventListener("change", () => {
  const f = $("srcFile").files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    $("srcPaste").value = r.result;
    if (!$("srcName").value) $("srcName").value = f.name.replace(/\.[^.]+$/, "");
    previewParse();
  };
  r.readAsText(f);
});
$("srcPaste").addEventListener("input", previewParse);

function previewParse() {
  const text = $("srcPaste").value;
  if (!text.trim()) { $("parseNote").textContent = ""; $("parseNote").className = ""; return; }
  const { players, warnings } = parseRankings(text);
  const note = $("parseNote");
  // validateParsedSource (shared.js) owns the "is this actually a rankings
  // file" judgement so the preview, the save button and the edit modal all
  // apply the identical rule — the preview showing green while the save
  // refuses (or vice versa) would be worse than either alone.
  const v = validateParsedSource(players, warnings);
  note.className = v.level === "error" ? "err" : v.level === "warn" ? "warn" : "ok";
  note.textContent = v.message;
}

$("saveSrcBtn").addEventListener("click", async () => {
  const text = $("srcPaste").value;
  const name = $("srcName").value.trim();
  if (!text.trim()) { $("parseNote").className = "err"; $("parseNote").textContent = "Nothing to import yet."; return; }
  if (!name) { $("parseNote").className = "err"; $("parseNote").textContent = "Give the source a name."; return; }

  const { players, warnings } = parseRankings(text);
  // Refuse the import outright when the result is provably inert (no row has a
  // position). Previously this only checked for zero players, so a source that
  // parsed "fine" but could never contribute anything saved happily and then
  // sat on the board doing nothing.
  const v = validateParsedSource(players, warnings);
  if (v.level === "error") { $("parseNote").className = "err"; $("parseNote").textContent = v.message; return; }

  if (editingAdp) {
    // Re-importing under the same name (case-insensitive) updates that
    // source in place instead of piling up duplicates — matters for a
    // day-of-draft re-upload workflow (e.g. re-pasting a fresh FantasyPros
    // Real-Time export right before the draft starts).
    const cleaned = players.map((p) => ({ name: p.name, pos: p.pos, rank: p.rank }));
    const existing = adpSources.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      await upsertAdpSource(existing.id, name, existing.color, cleaned);
      toast(`Updated ADP source "${name}" — ${players.length} players.`);
    } else {
      const color = SOURCE_PALETTE[adpSources.length % SOURCE_PALETTE.length];
      adpSources.push(makeAdpSource(name, cleaned, { color }));
      await persistAdpSources();
      toast(`Added ADP source "${name}" — ${players.length} players.`);
    }
  } else {
    const color = SOURCE_PALETTE[sources.length % SOURCE_PALETTE.length];
    const positionOnly = $("srcPositionOnly").checked;
    sources.push(makeSource(name, players, { color, positionOnly }));
    await persistSources();
    toast(`Added "${name}"${positionOnly ? " (position-only)" : ""} — ${players.length} players.`);
  }
  closeModal();
  renderAll();
});

// ---------- filters ----------
document.querySelectorAll(".pf[data-pos]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pf[data-pos]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    posFilter = btn.dataset.pos;
    renderAll();
  });
});
$("takenToggle").addEventListener("click", () => {
  showTaken = !showTaken;
  $("takenToggle").classList.toggle("active", showTaken);
  renderAll();
});
$("playerSearch").addEventListener("input", () => {
  playerSearch = $("playerSearch").value.trim();
  renderAll();
});

// ---------- live sync with the board window ----------
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes[K_DRAFT] && !echo.isEcho(K_DRAFT)) {
    draft = changes[K_DRAFT].newValue || draft;
    renderAll();
  }
  if (changes[K_SOURCES] && !echo.isEcho(K_SOURCES)) {
    sources = await loadSources();
    renderAll();
  }
  if (changes[K_ROSTER]) {
    // Kept in sync for the "mine" row highlight in the comparison table; the
    // position-count widget itself now lives in the board window.
    draft.myRosterId = changes[K_ROSTER].newValue;
  }
  if (changes[K_ADP] && !echo.isEcho(K_ADP)) {
    adpSources = await loadAdpSources();
    renderAll();
  }
  if (changes[K_FLAGS] && !echo.isEcho(K_FLAGS)) {
    flags = await loadFlags();
    renderAll();
    if (activeTab === "creator") renderCreator();
  }
  if (changes[K_MERGES] && !echo.isEcho(K_MERGES)) {
    merges = await loadMerges();
    renderAll();
  }
  if (changes[K_PROJ]) {
    projMap = await loadProjections();
    renderAll();
  }
  if (changes[K_INJURIES]) {
    injuries = await loadInjuries();
    renderAll();
  }
  if (changes[K_STATS]) {
    playerStats = await loadPlayerStats();
    if (activeTab === "creator") renderCreator();
  }
  if (changes[K_SLEEPER_IDS]) {
    sleeperIds = await loadSleeperIdMap();
    if (activeTab === "creator") renderCreator();
  }
  if (changes[K_STAT_PREFS]) {
    creatorVisibleStats = await loadStatPrefs();
    if (activeTab === "creator") renderCreator();
  }
  if (changes[K_CUSTOM_BOARDS] && !echo.isEcho(K_CUSTOM_BOARDS)) {
    customBoards = await loadCustomBoards();
    if (!customBoards.find((b) => b.id === activeBoardId)) activeBoardId = sortedBoards()[0] ? sortedBoards()[0].id : null;
    if (activeTab === "creator") renderCreator();
  }
  // Set from the board window's Settings panel — this surface has no
  // settings of its own (curation-only, per claude.md's surface split), it
  // just follows along.
  if (changes[K_INCLUDE_KDST]) {
    includeKdst = changes[K_INCLUDE_KDST].newValue !== false;
    applyKdstFilterVisibility();
    renderAll();
    if (activeTab === "creator") renderCreator();
  }
  // Scoring format sync (see the loader in init() for why this surface
  // needs it too, not just panel.js) — only re-fetches if this tab is
  // synced to the SAME draft, same guard as init()'s own restore.
  if (changes[K_DRAFT_SETTINGS]) {
    const v = changes[K_DRAFT_SETTINGS].newValue;
    if (v && draft.draftId && String(v.draftId) === String(draft.draftId)) {
      const prevFormat = SCORING_FORMAT;
      applySyncedScoringFormat(v.scoringType);
      if (SCORING_FORMAT !== prevFormat) {
        autoRefreshAdpAndStats().then(renderAll);
        autoRefreshProjections().then((map) => { if (map) { projMap = map; renderAll(); } });
      }
    }
  }
  if (changes[K_SCORING_FORMAT_OVERRIDE]) {
    const prevFormat = SCORING_FORMAT;
    setScoringFormatOverride(changes[K_SCORING_FORMAT_OVERRIDE].newValue);
    if (SCORING_FORMAT !== prevFormat) {
      autoRefreshAdpAndStats().then(renderAll);
      autoRefreshProjections().then((map) => { if (map) { projMap = map; renderAll(); } });
    }
  }
});

// Hides the K/DEF filter buttons (both the Sources tab's .pf row and the
// Creator's .crPosTab row) the instant the master toggle is off, and drops
// out of a now-hidden K/DEF filter back to ALL/All-Combined — same pattern
// as panel.js's applyKdstFilterVisibility.
function applyKdstFilterVisibility() {
  document.querySelectorAll("[data-kdst]").forEach((btn) => { btn.style.display = includeKdst ? "" : "none"; });
  if (!includeKdst && (posFilter === "K" || posFilter === "DEF")) {
    posFilter = "ALL";
    document.querySelectorAll(".pf[data-pos]").forEach((b) => b.classList.toggle("active", b.dataset.pos === "ALL"));
  }
  if (!includeKdst && (creatorPosFilter === "K" || creatorPosFilter === "DEF")) {
    creatorPosFilter = "ALL";
    document.querySelectorAll("#crPosTabs .crPosTab").forEach((b) => b.classList.toggle("active", b.dataset.pos === "ALL"));
  }
}

// ---------- top-level tab switching ----------
$("tabSourcesBtn").addEventListener("click", () => switchTab("sources"));
$("tabCreatorBtn").addEventListener("click", () => switchTab("creator"));
function switchTab(tab) {
  activeTab = tab;
  $("tabSourcesBtn").classList.toggle("active", tab === "sources");
  $("tabCreatorBtn").classList.toggle("active", tab === "creator");
  $("sourcesTab").style.display = tab === "sources" ? "" : "none";
  $("creatorTab").style.display = tab === "creator" ? "" : "none";
  // "Save to draft board" (Creator tab) writes into `sources` while the
  // Sources tab's DOM is stale/hidden — re-render on switching back to it
  // rather than only on the next storage event, so a just-saved board shows
  // up immediately instead of needing an unrelated change to trigger a redraw.
  if (tab === "sources") renderAll();
  if (tab === "creator") renderCreator();
}

// ============================================================
// Rankings Creator — drag-and-drop custom rankings, direction B (ranked
// list + tier bands) from the mockup review. Base can be "no base" (every
// QB/RB/WR/TE Sleeper knows, in live ADP order — built from the same
// fetchSleeperAdpPlayers() the board's ADP column already uses) or any
// existing ranking source (built-in or imported) — see claude.md's
// "Rankings Creator" section for the full design writeup.
// ============================================================

function getActiveBoard() {
  return customBoards.find((b) => b.id === activeBoardId) || null;
}
async function persistCustomBoards() {
  await echo.write(K_CUSTOM_BOARDS, () => saveCustomBoards(customBoards)).catch(reportSaveFailure("your custom board"));
}

// ADP-only players carry no team (fetchSleeperAdpPlayers only returns
// name/pos/rank) — backfilled here from whatever imported ranking sources
// already have team on file, same join key (playerKey) everything else
// uses. Best-effort: a player absent from every source just shows no team
// badge, same fallback avatarHtml already handles for an unmatched player.
function teamLookupFromSources() {
  const m = new Map();
  sources.forEach((s) => s.players.forEach((p) => {
    if (p.team && !m.has(playerKey(p.name, p.pos))) m.set(playerKey(p.name, p.pos), p.team);
  }));
  return m;
}

// Builds a fresh board's starting universe + order from its base. `baseId`
// is either "adp" (no base — every player, live Sleeper ADP order, single
// tier) or a ranking source id (that source's own rank/tier order, same as
// how it already reads everywhere else in this app).
async function buildBoardFromBase(baseId) {
  const players = {};
  let order = [];
  let breaks = [];
  if (baseId === "adp" || !baseId) {
    const teamByKey = teamLookupFromSources();
    let adpPlayers = [];
    try { adpPlayers = await fetchSleeperAdpPlayers(); } catch (e) {
      toast(`Couldn't fetch Sleeper ADP for a fresh base: ${e.message}`, true);
    }
    if (!includeKdst) adpPlayers = adpPlayers.filter((p) => CORE_POSITIONS.includes(p.pos));
    adpPlayers.sort((a, b) => a.rank - b.rank);
    adpPlayers.forEach((p) => {
      const key = playerKey(p.name, p.pos);
      if (players[key]) return; // a source can carry the same player twice (e.g. a data-entry dupe) — first occurrence wins, rather than double-booking a slot in `order`
      players[key] = { name: p.name, team: teamByKey.get(key) || "", pos: p.pos };
      order.push(key);
    });
  } else {
    const src = sources.find((s) => s.id === baseId);
    if (src) {
      const withRank = src.players.filter((p) => p.pos && isFinite(Number(p.rank)));
      withRank.sort((a, b) => Number(a.rank) - Number(b.rank));
      let lastTier = null;
      withRank.forEach((p) => {
        const key = playerKey(p.name, p.pos);
        if (players[key]) { lastTier = p.tier; return; }
        players[key] = { name: p.name, team: p.team || "", pos: p.pos };
        order.push(key);
        if (p.tier != null && p.tier !== "" && lastTier !== null && String(p.tier) !== String(lastTier)) breaks.push(key);
        lastTier = p.tier;
      });
    }
  }
  return { players, order, breaks };
}

async function createBoard() {
  const base = await buildBoardFromBase("adp");
  const board = {
    id: `board_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "New Custom Board",
    updatedAt: Date.now(),
    baseId: "adp",
    ...base,
  };
  customBoards = [...customBoards, board];
  activeBoardId = board.id;
  await persistCustomBoards();
  renderCreator();
}

// A full clone under a new id — the obvious "try a variant without losing
// the original" move once you're iterating on a real board (e.g. start a
// WR-heavy build off an existing QB-heavy one), which previously meant
// rebuilding from a base again and redoing every manual tweak by hand.
async function duplicateActiveBoard() {
  const board = getActiveBoard();
  if (!board) return;
  const copy = {
    ...board,
    id: `board_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: `${board.name} (copy)`,
    updatedAt: Date.now(),
    players: JSON.parse(JSON.stringify(board.players)),
    order: [...board.order],
    breaks: [...board.breaks],
  };
  customBoards = [...customBoards, copy];
  activeBoardId = copy.id;
  await persistCustomBoards();
  renderCreator();
  toast(`Duplicated — "${copy.name}"`);
}

async function deleteActiveBoard() {
  const board = getActiveBoard();
  if (!board) return;
  const confirmed = await showConfirm(`Delete "${board.name}"?`, "This custom board will be permanently deleted. This can't be undone.", "DELETE");
  if (!confirmed) return;
  customBoards = customBoards.filter((b) => b.id !== board.id);
  activeBoardId = sortedBoards()[0] ? sortedBoards()[0].id : null;
  await persistCustomBoards();
  renderCreator();
}

// One-step undo for "Reset from base" specifically — the single most
// destructive button in the Creator (it wipes every manual placement/tier
// edit with only a confirm dialog standing in the way). A confirm warns you
// once; this actually gives the mistake back. Deliberately in-memory only
// (not persisted) and scoped to the ONE most recent reset — this isn't a
// general undo history, just real insurance on the one action that needed it.
let crUndoSnapshot = null;
let crUndoTimer = null;
const CR_UNDO_TIMEOUT_MS = 12000;
function showUndoBar(text) {
  clearTimeout(crUndoTimer);
  $("crUndoText").textContent = text;
  $("crUndoBar").style.display = "flex";
  crUndoTimer = setTimeout(hideUndoBar, CR_UNDO_TIMEOUT_MS);
}
function hideUndoBar() {
  clearTimeout(crUndoTimer);
  $("crUndoBar").style.display = "none";
  crUndoSnapshot = null;
}
async function undoLastReset() {
  if (!crUndoSnapshot) return;
  const board = customBoards.find((b) => b.id === crUndoSnapshot.boardId);
  if (board) {
    board.baseId = crUndoSnapshot.baseId;
    board.players = crUndoSnapshot.players;
    board.order = crUndoSnapshot.order;
    board.breaks = crUndoSnapshot.breaks;
    board.updatedAt = Date.now();
    activeBoardId = board.id;
    await persistCustomBoards();
    renderCreator();
    toast("Reset undone.");
  }
  hideUndoBar();
}

async function resetActiveBoardFromBase() {
  const board = getActiveBoard();
  if (!board) return;
  const baseId = $("crBaseSelect").value || "adp";
  const confirmed = await showConfirm(
    "Reset from base?",
    "This replaces every player, rank, and tier in this board with the selected base's own order. Any manual placement you've done will be lost. (You'll get a short window to undo it.)",
    "RESET"
  );
  if (!confirmed) return;
  crUndoSnapshot = {
    boardId: board.id, baseId: board.baseId,
    players: JSON.parse(JSON.stringify(board.players)), order: [...board.order], breaks: [...board.breaks],
  };
  const base = await buildBoardFromBase(baseId);
  board.baseId = baseId;
  board.players = base.players;
  board.order = base.order;
  board.breaks = base.breaks;
  board.updatedAt = Date.now();
  await persistCustomBoards();
  renderCreator();
  showUndoBar(`Reset from ${baseId === "adp" ? "Sleeper ADP" : (sources.find((s) => s.id === baseId) || {}).name || "base"}.`);
}

// Writes the board out as a normal ranking source — makeSource/saveSources,
// same shape every other source uses, so it shows up in the board window
// immediately with zero new schema. Re-saving the same board updates that
// source in place (fixed id `custom_<boardId>`) instead of duplicating it.
async function saveBoardToSource() {
  const board = getActiveBoard();
  if (!board) return;
  if (!board.order.length) { toast("Nothing placed yet — drag at least one player into the list first.", true); return; }
  const players = boardToSourcePlayers(board);
  const id = `custom_${board.id}`;
  const existing = sources.find((s) => s.id === id);
  const src = makeSource(board.name || "Custom Board", players, {
    id, color: existing ? existing.color : SOURCE_PALETTE[sources.length % SOURCE_PALETTE.length],
    enabled: existing ? existing.enabled : true,
  });
  sources = [...sources.filter((s) => s.id !== id), src];
  await persistSources();
  toast(`Saved — "${board.name}" is now a ranking source (${players.length} players), live in the board window.`);
}

// Mirrors the board's own effectiveStatPos() (panel.js): a selected player
// still wins outright, but absent one, filtering to a single position now
// brings that position's stat group forward too — direct request, matching
// how the board already does this for its own position filter buttons.
function crEffectiveStatPos() {
  // CORE_POSITIONS, not POSITIONS — same reasoning as panel.js's
  // effectiveStatPos: K/DEF have no stat group in STAT_GROUP_SEQUENCE, so
  // treating one as a valid "bring forward" target would feed statGroupOrder
  // an id with no configured width and poison every offset after it.
  const board = getActiveBoard();
  if (board && creatorSelectedKey) {
    const p = board.players[creatorSelectedKey];
    if (p && CORE_POSITIONS.includes(p.pos)) return p.pos;
  }
  return CORE_POSITIONS.includes(creatorPosFilter) ? creatorPosFilter : null;
}

// Most-recently-edited first — with more than a couple of boards, "the one
// I was working on yesterday" used to mean scanning a plain insertion-order
// list with no dates shown anywhere. Doesn't mutate `customBoards` itself
// (nothing else should care about array order, only this display and the
// "pick a default" fallbacks below, which now both go through this).
function sortedBoards() {
  return [...customBoards].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
// "2h ago" / "3d ago" style — used only for the board dropdown's relative
// dates, doesn't need to be more precise than that.
function formatRelativeTime(ts) {
  if (!ts) return "";
  const sec = Math.max(0, (Date.now() - ts) / 1000);
  if (sec < 60) return "just now";
  const min = sec / 60;
  if (min < 60) return `${Math.floor(min)}m ago`;
  const hr = min / 60;
  if (hr < 24) return `${Math.floor(hr)}h ago`;
  const day = hr / 24;
  if (day < 30) return `${Math.floor(day)}d ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function renderCreatorToolbar() {
  const select = $("crBoardSelect");
  select.innerHTML = sortedBoards().map((b) => `<option value="${esc(b.id)}"${b.id === activeBoardId ? " selected" : ""}>${esc(b.name)} — ${esc(formatRelativeTime(b.updatedAt))}</option>`).join("")
    || `<option value="">No boards yet</option>`;
  const baseSelect = $("crBaseSelect");
  const board = getActiveBoard();
  const options = [`<option value="adp">No base — Sleeper ADP order</option>`]
    .concat(sources.map((s) => `<option value="${esc(s.id)}"${board && board.baseId === s.id ? " selected" : ""}>${esc(s.name)}</option>`));
  baseSelect.innerHTML = options.join("");
  if (board) baseSelect.value = board.baseId || "adp";
  $("crBoardName").value = board ? board.name : "";
  $("crBoardName").disabled = !board;
  $("crDuplicateBoardBtn").disabled = !board;
  $("crDeleteBoardBtn").disabled = !board;
  $("crResetBaseBtn").disabled = !board;
  $("crSaveBtn").disabled = !board;
  $("crBaseMeta").innerHTML = board
    ? `${board.order.length.toLocaleString()} <small>/ ${Object.keys(board.players).length.toLocaleString()}</small>`
    : "0";
}

function crPoolRows(board) {
  const q = creatorSearch.toLowerCase();
  const placed = new Set(board.order);
  return Object.keys(board.players)
    .filter((k) => !placed.has(k))
    .map((k) => board.players[k])
    .filter((p) => creatorPosFilter === "ALL" || p.pos === creatorPosFilter)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.team || "").toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderCreatorPool() {
  const board = getActiveBoard();
  const pool = $("crPool");
  if (!board) { pool.innerHTML = ""; return; }
  const rows = crPoolRows(board);
  $("crPoolCount").textContent = rows.length;
  pool.innerHTML = rows.length
    ? rows.map((p) => {
        const key = playerKey(p.name, p.pos);
        const t = posTint(p.pos);
        return `<div class="crPoolRow" data-key="${esc(key)}">
          <span class="crName2">${flagBadge(flags[key])}${esc(p.name)}</span>
          <span class="crPosTag" style="background:${t.bg};color:${t.fg}">${esc(p.pos)}</span>
        </div>`;
      }).join("")
    : `<div class="crEmptyPool">${board.order.length ? "No matches" : "Nothing here"}</div>`;

  pool.querySelectorAll(".crPoolRow").forEach((el) => {
    el.addEventListener("pointerdown", (e) => startPoolDrag(e, el));
  });
}

// Dragging a player OUT of the pool and into the ranked list. Simpler than
// the in-list reorder below (startListDrag) — a floating ghost tracks the
// pointer 1:1 (still zero-latency direct manipulation, just without the
// live sibling-shifting choreography, since there's no "original slot" in
// the list to open a gap from) and on release, hit-tests against the
// currently-rendered list rows to find where it landed.
function startPoolDrag(e, rowEl) {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();
  const key = rowEl.dataset.key;
  const rect = rowEl.getBoundingClientRect();
  const ghost = rowEl.cloneNode(true);
  ghost.className = "crPoolRow crDragGhost";
  ghost.style.width = `${rect.width}px`;
  document.body.appendChild(ghost);
  crGhost = { key, ghost, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
  positionGhost(e);
  rowEl.style.opacity = "0.35";
  document.body.style.cursor = "grabbing";
  window.addEventListener("pointermove", onPoolDragMove);
  window.addEventListener("pointerup", endPoolDrag, { once: true });
}
function positionGhost(e) {
  crGhost.ghost.style.left = `${e.clientX - crGhost.offsetX}px`;
  crGhost.ghost.style.top = `${e.clientY - crGhost.offsetY}px`;
}
function onPoolDragMove(e) {
  if (!crGhost) return;
  positionGhost(e);
  highlightDropRow(e.clientX, e.clientY);
}
// Finds whichever .crRow the pointer is currently over (if any) and shows
// the same before/after indicator the old native-drag version used —
// reused visual language, just driven by hit-testing instead of dragover.
let crHoverRow = null;
function highlightDropRow(x, y) {
  const el = document.elementFromPoint(x, y);
  const row = el && el.closest ? el.closest(".crRow") : null;
  if (crHoverRow && crHoverRow !== row) crHoverRow.classList.remove("dropBefore", "dropAfter");
  crHoverRow = row;
  if (row) {
    const rect = row.getBoundingClientRect();
    const before = y < rect.top + rect.height / 2;
    row.classList.toggle("dropBefore", before);
    row.classList.toggle("dropAfter", !before);
  }
}
function clearHoverRow() {
  if (crHoverRow) { crHoverRow.classList.remove("dropBefore", "dropAfter"); crHoverRow = null; }
}
function endPoolDrag(e) {
  window.removeEventListener("pointermove", onPoolDragMove);
  document.body.style.cursor = "";
  if (!crGhost) return;
  const { key, ghost } = crGhost;
  ghost.remove();
  const poolEl = findPoolRowEl(key);
  if (poolEl) poolEl.style.opacity = "";
  const board = getActiveBoard();
  const dropRow = crHoverRow;
  clearHoverRow();
  crGhost = null;
  if (!board) return;
  if (dropRow) {
    const rect = dropRow.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    moveKeyTo(board, key, dropRow.dataset.key, before);
    persistCustomBoards();
    renderCreator();
  } else if (document.elementFromPoint(e.clientX, e.clientY)?.closest("#crListWrap")) {
    // Dropped inside the list area but not on any specific row (past the
    // last one, or into an empty list) — append to the end, same fallback
    // the native-drag version had for "past the last row."
    let order = board.order.filter((k) => k !== key);
    order.push(key);
    board.order = order;
    board.updatedAt = Date.now();
    persistCustomBoards();
    renderCreator();
  }
  // Dropped anywhere else (back over the rail, off the page) — no-op, the
  // player simply stays unplaced.
}
function findPoolRowEl(key) {
  return [...$("crPool").querySelectorAll(".crPoolRow")].find((el) => el.dataset.key === key);
}


// Renders the ranked list as: a tier divider before the first player of
// every tier (including tier 1, so the tier you're looking at is always
// labeled), player rows, and a hoverable "+ add tier break" gap between any
// two adjacent players that aren't already a tier boundary.
//
// Position filter (ALL/QB/RB/WR/TE, `creatorPosFilter`) is a VIEW on the
// same single combined `order`/`breaks` — not a second parallel ranking.
// Filtering to RB shows only RB rows, in their existing combined-order
// positions, so re-ranking within that view (drag one RB above another)
// moves them in the real combined order too — your positional and overall
// rankings can never drift apart because there's only ever one list. Tier
// numbers shown while filtered are each row's real global tier (computed
// over the FULL order, same as unfiltered) — informational context, since a
// hidden player of another position may have started a tier in between two
// visible rows. Tier editing (add-break/merge) is only offered when
// unfiltered, since "the gap between these two visible RBs" isn't the same
// thing as "adjacent in the real list" once other positions are hidden —
// letting edits happen there would silently do something other than what a
// user watching only RBs would expect.
function renderCreatorList() {
  const board = getActiveBoard();
  const listWrap = $("crListWrap");
  const list = $("crList");
  const statOrder = statGroupOrder(crEffectiveStatPos());
  $("crStatHead").innerHTML = renderStatHeaderGroups(statOrder, creatorVisibleStats);
  $("crStatHead").style.width = `${statGroupLayout(statOrder, creatorVisibleStats).totalWidth}px`;
  if (!board) { list.innerHTML = ""; listWrap.classList.remove("empty"); return; }
  listWrap.classList.toggle("empty", board.order.length === 0);
  if (!board.order.length) { list.innerHTML = ""; return; }

  const breakSet = new Set(board.breaks || []);
  const statWidth = statGroupLayout(statOrder, creatorVisibleStats).totalWidth;
  const filtered = creatorPosFilter !== "ALL";
  const q = creatorSearch.trim().toLowerCase();
  const searching = !!q;
  // Tier editing (add-break/merge) needs true list adjacency to mean what it
  // says — same reasoning as the position filter above, and search narrows
  // the visible rows the exact same way, so it gets the same restriction.
  const restrictEditing = filtered || searching;
  let tier = 1;
  let shownAny = false;
  const parts = [];
  const visibleOrder = []; // keys in the order they're actually rendered — used for the ▲▼ move buttons' boundary checks
  board.order.forEach((key, i) => {
    if (i > 0 && breakSet.has(key)) tier++;
    const p = board.players[key] || {};
    if (filtered && p.pos !== creatorPosFilter) return;
    if (searching && !(p.name.toLowerCase().includes(q) || (p.team || "").toLowerCase().includes(q))) return;
    if (!shownAny || breakSet.has(key)) {
      parts.push(`<div class="crTierDivider" data-tier="${tier}">
        <span class="crTline"></span>
        <span class="crTierLabel"><span class="crTierDot" style="background:${TIER_COLORS[tier] || "#4A4A4A"}"></span>TIER ${tier}${!restrictEditing && i > 0 && breakSet.has(key) ? `<span class="crTierMerge" data-tiermerge="${esc(key)}" title="Merge into the tier above">✕</span>` : ""}</span>
        <span class="crTline"></span>
      </div>`);
    } else if (!restrictEditing) {
      parts.push(`<div class="crAddBreakGap" data-add="${esc(key)}"><span class="crAddBreakLine"></span><button class="crAddBreakBtn" data-add-btn="${esc(key)}">+ tier break</button></div>`);
    }
    shownAny = true;
    const t = posTint(p.pos);
    const visIdx = visibleOrder.length; // 0-based position among rows actually rendered, before this key is pushed
    visibleOrder.push(key);
    parts.push(`<div class="crRow${key === creatorSelectedKey ? " selected" : ""}" data-key="${esc(key)}">
      <span class="crRank">${i + 1}</span>
      <span class="crMoveBtns">
        <button class="crMoveBtn" data-move="${esc(key)}" data-dir="up" title="Move up" ${visIdx === 0 ? "disabled" : ""}>▲</button>
        <button class="crMoveBtn" data-move="${esc(key)}" data-dir="down" title="Move down">▼</button>
      </span>
      <span class="crGrip">⋮⋮</span>
      <span class="crRowMain">
        ${avatarHtml(key, p.name, p.pos, p.team, "sm", sleeperIds)}
        <span class="crRowName">${flagBadge(flags[key])}${esc(p.name)}${p.team ? `<span class="crTeam">${esc(p.team)}</span>` : ""}</span>
        <span class="crRowPos" style="background:${t.bg};color:${t.fg}">${esc(p.pos)}</span>
      </span>
      <span class="crStatBlock" style="width:${statWidth}px">${renderStatGroups({ key, pos: p.pos }, playerStats, statOrder, creatorVisibleStats)}</span>
      <span class="crRowRemove" data-remove="${esc(key)}" title="Remove from board">✕</span>
    </div>`);
  });
  const emptyMsg = searching
    ? "No placed players match your search."
    : `No ${esc(creatorPosFilter)} players placed yet.`;
  list.innerHTML = shownAny ? parts.join("") : `<div class="crEmptyPool" style="padding:30px 4px">${emptyMsg}</div>`;
  // The last visible row's "down" button can't be known as disabled while
  // building it (its own index doesn't know the final count yet) — patched
  // in once the full list exists. list.lastElementChild is always that
  // row's div: tier dividers/add-break gaps only ever appear BEFORE a row.
  if (shownAny) {
    const lastDown = list.lastElementChild.querySelector('.crMoveBtn[data-dir="down"]');
    if (lastDown) lastDown.disabled = true;
  }

  list.querySelectorAll("[data-move]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); moveAdjacent(el.dataset.move, el.dataset.dir); });
  });
  list.querySelectorAll(".crRow").forEach((el) => {
    el.addEventListener("pointerdown", (e) => armListDrag(e, el));
  });
  list.querySelectorAll("[data-remove]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); removeFromBoard(el.dataset.remove); });
  });
  list.querySelectorAll("[data-tiermerge]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); mergeTierUp(el.dataset.tiermerge); });
  });
  list.querySelectorAll("[data-add-btn]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); addBreakBefore(el.dataset.addBtn); });
  });
}

// The drag handle used to be just the small ⋮⋮ grip icon — a real mouse
// drag missed it entirely in testing (landed on plain row whitespace a few
// pixels off and just started a native text-selection instead). The whole
// row is the handle now, which needs a movement-threshold "arming" step
// first (Apple's hysteresis guidance: require a few pixels of movement
// before committing to a gesture) — otherwise a plain click-to-select
// (toggling a row's stat-group focus, see effectiveStatPos) would
// immediately register as a zero-distance drag instead. Below the
// threshold on release, it's a click; above it, it becomes a real drag,
// continuing smoothly from the ORIGINAL pointerdown position (not the
// point where the threshold was crossed) so there's no visible jump.
const DRAG_ARM_THRESHOLD = 4;
function armListDrag(e, rowEl) {
  if (e.button !== undefined && e.button !== 0) return;
  if (e.target.closest(".crMoveBtns, .crRowRemove")) return; // those have their own click handlers
  const startX = e.clientX, startY = e.clientY;
  let engaged = false;
  function onArmedMove(ev) {
    if (Math.abs(ev.clientY - startY) > DRAG_ARM_THRESHOLD || Math.abs(ev.clientX - startX) > DRAG_ARM_THRESHOLD) {
      engaged = true;
      window.removeEventListener("pointermove", onArmedMove);
      window.removeEventListener("pointerup", onArmedUp);
      beginListDrag(e, rowEl);
    }
  }
  function onArmedUp() {
    window.removeEventListener("pointermove", onArmedMove);
    window.removeEventListener("pointerup", onArmedUp);
    if (!engaged) {
      creatorSelectedKey = creatorSelectedKey === rowEl.dataset.key ? null : rowEl.dataset.key;
      renderCreatorList();
    }
  }
  window.addEventListener("pointermove", onArmedMove);
  window.addEventListener("pointerup", onArmedUp, { once: true });
}

// In-list reorder — direct 1:1 pointer tracking (Apple/Emil "direct
// manipulation": the dragged row's transform is set straight from the
// pointer position every move, with NO css transition on the row itself,
// so there's zero added latency between finger/cursor and row). Other rows
// between the drag's start and current position get a live "make room"
// shift (translateY by one row-height, WITH a short eased transition —
// that's a system-driven consequence of the gesture, not something the
// user is directly moving, so easing there is correct and expected, the
// same way a real stack of cards settles when you slide one out).
// `e` here is the ORIGINAL pointerdown event (see armListDrag above), not
// whatever move event crossed the arm threshold — startY has to anchor to
// where the pointer actually went down, or the row would visibly jump by
// the threshold distance the instant the drag engages.
function beginListDrag(e, rowEl) {
  const list = $("crList");
  const rowEls = [...list.querySelectorAll(".crRow")];
  const startIndex = rowEls.indexOf(rowEl);
  const rect = rowEl.getBoundingClientRect();
  const rowHeight = rect.height + parseFloat(getComputedStyle(rowEl).marginBottom || "0");
  crSort = { key: rowEl.dataset.key, rowEl, rowEls, startIndex, currentIndex: startIndex, startY: e.clientY, rowHeight };
  rowEl.classList.add("grabbed");
  rowEl.style.zIndex = "50";
  rowEls.forEach((el) => { if (el !== rowEl) el.classList.add("shifting"); });
  document.body.style.cursor = "grabbing";
  window.addEventListener("pointermove", onListDragMove);
  window.addEventListener("pointerup", endListDrag, { once: true });
  window.addEventListener("pointercancel", endListDrag, { once: true });
}
function onListDragMove(e) {
  if (!crSort) return;
  const dy = e.clientY - crSort.startY;
  crSort.rowEl.style.transform = `translateY(${dy}px)`;
  const rawIndex = crSort.startIndex + Math.round(dy / crSort.rowHeight);
  const newIndex = Math.max(0, Math.min(crSort.rowEls.length - 1, rawIndex));
  if (newIndex !== crSort.currentIndex) {
    crSort.currentIndex = newIndex;
    applyListShifts();
  }
  // Dragging up past the top of the list, onto the rail — offer removal,
  // same as the old native-drag version's "drop on the pool" behavior.
  const overRail = document.elementFromPoint(e.clientX, e.clientY)?.closest(".crRail");
  crSort.rowEl.classList.toggle("overRail", !!overRail);
}
function applyListShifts() {
  const { rowEls, startIndex, currentIndex, rowHeight } = crSort;
  rowEls.forEach((el, i) => {
    if (el === crSort.rowEl) return;
    let shift = 0;
    if (startIndex < currentIndex && i > startIndex && i <= currentIndex) shift = -rowHeight;
    else if (startIndex > currentIndex && i >= currentIndex && i < startIndex) shift = rowHeight;
    el.style.transform = shift ? `translateY(${shift}px)` : "";
  });
}
function endListDrag(e) {
  if (!crSort) return;
  window.removeEventListener("pointermove", onListDragMove);
  document.body.style.cursor = "";
  const { key, rowEl, rowEls, startIndex, currentIndex } = crSort;
  const overRail = rowEl.classList.contains("overRail");
  rowEls.forEach((el) => { el.classList.remove("shifting"); el.style.transform = ""; });
  rowEl.classList.remove("grabbed", "overRail");
  rowEl.style.zIndex = "";
  crSort = null;
  if (overRail) { removeFromBoard(key); return; }
  if (currentIndex === startIndex) return; // no real move — nothing to persist, no re-render needed
  const board = getActiveBoard();
  if (!board) return;
  const originalKeys = rowEls.map((el) => el.dataset.key);
  const targetKey = originalKeys[currentIndex];
  const before = currentIndex < startIndex;
  moveKeyTo(board, key, targetKey, before);
  persistCustomBoards();
  renderCreator();
}

function addBreakBefore(key) {
  const board = getActiveBoard();
  if (!board) return;
  const breaks = new Set(board.breaks || []);
  breaks.add(key);
  board.breaks = [...breaks];
  board.updatedAt = Date.now();
  persistCustomBoards();
  renderCreatorList();
  renderCreatorToolbar();
}
function mergeTierUp(key) {
  const board = getActiveBoard();
  if (!board) return;
  board.breaks = (board.breaks || []).filter((k) => k !== key);
  board.updatedAt = Date.now();
  persistCustomBoards();
  renderCreatorList();
  renderCreatorToolbar();
}
function removeFromBoard(key) {
  const board = getActiveBoard();
  if (!board) return;
  board.order = board.order.filter((k) => k !== key);
  board.breaks = (board.breaks || []).filter((k) => k !== key);
  board.updatedAt = Date.now();
  persistCustomBoards();
  renderCreator();
}
// Shared by both drags (startPoolDrag/endPoolDrag, startListDrag/endListDrag)
// and the ▲▼ move buttons (moveAdjacent) below — all of them are really the
// same operation, "put `key` immediately before/after `targetKey` in the
// combined order," just triggered differently. Tier breaks are keyed by
// player identity (see shared.js), so they follow whichever player carries
// them automatically; nothing here needs to touch `breaks` except when the
// moved player itself owns one, which just moves with it, which is the
// correct behavior — "this player starts a new tier" should travel with the
// player, not stay pinned to a now-meaningless list position. Doesn't
// persist/re-render itself so callers can batch that with whatever else
// they need to update.
function moveKeyTo(board, key, targetKey, before) {
  let order = board.order.filter((k) => k !== key);
  const targetIdx = order.indexOf(targetKey);
  const insertIdx = targetIdx === -1 ? order.length : (before ? targetIdx : targetIdx + 1);
  order.splice(insertIdx, 0, key);
  board.order = order;
  board.updatedAt = Date.now();
}

// One-click reorder — the same "move up/down one slot" affordance the
// Sleeper queue popover already has (panel.js's queueMoveBtn), requested
// directly as an easier alternative to dragging for a small nudge. Moves
// relative to the CURRENTLY VISIBLE neighbor (respecting the position
// filter), not the raw global neighbor, so it's consistent with how
// dragging within a filtered view already behaves — see the position-filter
// reasoning above renderCreatorList.
function moveAdjacent(key, dir) {
  const board = getActiveBoard();
  if (!board) return;
  const visible = board.order.filter((k) => {
    const p = board.players[k];
    return p && (creatorPosFilter === "ALL" || p.pos === creatorPosFilter);
  });
  const idx = visible.indexOf(key);
  if (idx === -1) return;
  const targetIdx = dir === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= visible.length) return;
  moveKeyTo(board, key, visible[targetIdx], dir === "up");
  persistCustomBoards();
  renderCreator();
}

function renderCreator() {
  const board = getActiveBoard();
  $("crEmptyState").style.display = board ? "none" : "";
  $("crMain").style.display = board ? "" : "none";
  renderCreatorToolbar();
  $("crPosTabs").querySelectorAll(".crPosTab").forEach((el) => el.classList.toggle("active", el.dataset.pos === creatorPosFilter));
  if (!board) return;
  renderCreatorPool();
  renderCreatorList();
}

$("crPosTabs").querySelectorAll(".crPosTab").forEach((el) => {
  el.addEventListener("click", () => {
    creatorPosFilter = el.dataset.pos;
    renderCreator();
  });
});
$("crNewBoardBtn").addEventListener("click", createBoard);
$("crDuplicateBoardBtn").addEventListener("click", duplicateActiveBoard);
$("crDeleteBoardBtn").addEventListener("click", deleteActiveBoard);
$("crUndoBtn").addEventListener("click", undoLastReset);
$("crResetBaseBtn").addEventListener("click", resetActiveBoardFromBase);
$("crSaveBtn").addEventListener("click", saveBoardToSource);
$("crBoardSelect").addEventListener("change", () => { activeBoardId = $("crBoardSelect").value; creatorSelectedKey = null; hideUndoBar(); renderCreator(); });
$("crBoardName").addEventListener("input", () => {
  const board = getActiveBoard();
  if (!board) return;
  board.name = $("crBoardName").value;
  board.updatedAt = Date.now();
  persistCustomBoards();
  renderCreatorToolbar();
});
// One search box for the whole board now, not just the unplaced rail —
// direct bug report: moving a player to unplaced and searching for them to
// place them back only ever searched the pool, so a placed player (the
// common "where did they go" case) was simply unfindable. Filters both
// lists off the same `creatorSearch` state.
$("crSearch").addEventListener("input", () => { creatorSearch = $("crSearch").value; renderCreatorPool(); renderCreatorList(); });
// Dragging a list row onto the rail to remove it is handled inline inside
// startListDrag/endListDrag (the "overRail" check) — no separate listener
// needed here, unlike the old native-drag version which needed #crPool's
// own drop handler since native dragover/drop only fire on the element
// actually under the cursor.

// ---------- seed built-in sources ----------
// Re-seed FantasyPros' player list from fp-rankings.js on every load, same as
// the default source already does — otherwise a fix to that file (e.g. the
// tier column) never reaches storage, since it only used to seed once and was
// left alone forever after.
async function ensureBuiltinSources() {
  if (typeof FP_RANKINGS === "undefined") return;
  const existing = sources.find((s) => s.id === "fp");
  // Once manually overridden via the edit modal's CSV replace, trust the
  // stored player list instead of stomping it back to FP_RANKINGS on every
  // load — same rule as the default source in shared.js's loadSources().
  if (existing && existing.manualOverride) return;
  const fpSource = makeSource("FantasyPros ECR", FP_RANKINGS, {
    id: "fp",
    codeSeeded: true, // undeletable stays false — this source has a real ✕, unlike the default
    color: existing ? existing.color : undefined,
    enabled: existing ? existing.enabled : true,
    icon: existing ? existing.icon : undefined,
  });
  sources = [...sources.filter((s) => s.id !== "fp"), fpSource];
  await echo.write(K_SOURCES, () => saveSources(sources)).catch(reportSaveFailure("sources"));
}

// ---------- init ----------
(async function init() {
  sources = await loadSources();
  await ensureBuiltinSources();
  draft = await loadDraftState();
  adpSources = await loadAdpSources();
  flags = await loadFlags();
  merges = await loadMerges();
  includeKdst = await loadIncludeKdst();
  applyKdstFilterVisibility();
  // Scoring format sync (shared.js) — this surface's own "⟳ Fetch stats/
  // projections/ADP" buttons (and its silent autoRefreshAdpAndStats/
  // autoRefreshProjections calls just below) would otherwise always fetch
  // PPR fields regardless of what the board window already synced from a
  // real draft, silently overwriting correctly-fetched non-PPR data with
  // wrong-format data. Loaded the same way panel.js restores it: the synced
  // draft's own settings (only if it's the SAME draft this tab's draft state
  // is for) plus any manual override, in that priority order.
  const dsv = await chrome.storage.local.get([K_DRAFT_SETTINGS]);
  const savedDs = dsv[K_DRAFT_SETTINGS];
  if (savedDs && draft.draftId && String(savedDs.draftId) === String(draft.draftId)) {
    applySyncedScoringFormat(savedDs.scoringType);
  }
  setScoringFormatOverride(await loadScoringFormatOverride());
  projMap = await loadProjections();
  injuries = await loadInjuries();
  const v = await chrome.storage.local.get([K_ROSTER]);
  if (draft.myRosterId == null && v[K_ROSTER] != null) draft.myRosterId = Number(v[K_ROSTER]);
  // Loaded before the first renderAll() so the Sources table's row avatars
  // (added alongside the Rankings Creator redesign) have real headshot ids
  // on the very first paint instead of falling back to initials until an
  // unrelated re-render happens to fire.
  sleeperIds = await loadSleeperIdMap();
  renderAll();

  customBoards = await loadCustomBoards();
  activeBoardId = sortedBoards()[0] ? sortedBoards()[0].id : null; // open the most recently edited board by default
  playerStats = await loadPlayerStats();
  creatorVisibleStats = await loadStatPrefs();

  // Silent background refresh, same pattern as ADP/stat auto-fetches.
  autoRefreshProjections().then((map) => {
    if (map) { projMap = map; renderAll(); }
  });
  // Same silent auto-refresh as the board window's init (shared.js) — covers
  // the case where the Manager tab is opened on its own, not just via the
  // board's "Manager" button. Also feeds the Rankings Creator's stat
  // columns/headshots, so run it regardless of which tab is showing first.
  autoRefreshAdpAndStats().then(async () => {
    playerStats = await loadPlayerStats();
    sleeperIds = await loadSleeperIdMap();
    if (activeTab === "creator") renderCreator();
  });
})();

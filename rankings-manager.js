// ============================================================
// 4th&Go — Rankings Manager (full-tab surface)
// Backlog #1 (importable rankings), #3 (multi-source side-by-side),
// #9 (ADP delta column) and the "one best pick" half of #2.
//
// Reads/writes the same chrome.storage.local state the side panel uses, so a
// pick synced there shows up here without a refresh (and vice versa for manual
// crossouts). This surface never polls Sleeper itself — panel.js owns that.
// ============================================================

const $ = (id) => document.getElementById(id);

let sources = [];
let draft = { picks: [], manualKeys: [], draftId: null, myRosterId: null };
let adpSources = []; // multiple ADP sources can be enabled at once — see makeAdpSource in shared.js
let flags = {}; // playerKey -> "favorite" | "avoid"
let merges = {}; // variantKey → canonicalKey, unmatched player reconciliation
let posFilter = "ALL";
let showTaken = false; // independent toggle, layered on top of posFilter — not a 6th filter option
let playerSearch = ""; // name/team substring filter, layered on top of posFilter/showTaken
let soloSource = null;   // when set, the whole page shows just this source
let editingAdp = false;  // the add/import modal is in "ADP" mode
let suppressEcho = false;

// ---------- derived draft state ----------
function takenMap() {
  const m = new Map();
  draft.picks.forEach((p) => m.set(p.key, { byMe: p.byMe, pickNo: p.pickNo }));
  (draft.manualKeys || []).forEach((k) => {
    if (!m.has(k)) m.set(k, { byMe: false, pickNo: null, manual: true });
  });
  return m;
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

// ---------- rendering ----------
function activeSources() {
  return soloSource ? sources.filter((s) => s.id === soloSource) : sources.filter((s) => s.enabled);
}

function renderSyncLine() {
  const n = draft.picks.length;
  $("syncLine").textContent = draft.draftId
    ? `SYNCED · DRAFT ${draft.draftId} · ${n} PICK${n === 1 ? "" : "S"} OFF THE BOARD`
    : "NOT SYNCED — START A SYNC IN THE SIDE PANEL";
}

function renderSourceBar() {
  const bar = $("sourceBar");
  const chips = sources.map((s) => {
    const solo = soloSource === s.id;
    const cls = `chip${s.enabled ? "" : " disabled"}${solo ? " solo" : ""}`;
    const edit = `<span class="edit-src" data-edit="${s.id}" title="Edit this source · ${formatLastUpdated(s.importedAt)}" style="cursor:pointer;margin-left:4px;opacity:0.6">✎</span>`;
    const del = s.builtin ? "" : `<span class="x" data-del="${s.id}" title="Remove source">✕</span>`;
    const swatch = s.icon
      ? `<img src="${s.icon}" style="width:9px;height:9px;border-radius:2px;object-fit:cover" />`
      : `<span class="sw" style="background:${s.color}"></span>`;
    const posOnlyBadge = s.positionOnly ? `<span style="color:var(--dim);font-size:9px;margin-left:3px" title="Position-only — reference column, doesn't affect blended rank/tier">POS</span>` : "";
    return `<span class="${cls}" data-toggle="${s.id}" title="Click to enable/disable · double-click to isolate">
      ${swatch}${s.name}${posOnlyBadge}${edit}
      <span style="color:var(--dim)">${s.players.length}</span>${del}</span>`;
  }).join("");

  const adpChips = adpSources.map((s) => {
    const cls = `chip${s.enabled ? "" : " disabled"}`;
    const edit = `<span class="edit-src" data-editadp="${s.id}" title="Edit this ADP source · ${formatLastUpdated(s.importedAt)}" style="cursor:pointer;margin-left:4px;opacity:0.6">✎</span>`;
    const del = `<span class="x" data-deladp="${s.id}" title="Remove ADP source">✕</span>`;
    const swatch = s.icon
      ? `<img src="${s.icon}" style="width:9px;height:9px;border-radius:2px;object-fit:cover" />`
      : `<span class="sw" style="background:${s.color}"></span>`;
    return `<span class="${cls}" data-toggleadp="${s.id}" title="Click to enable/disable — each enabled ADP source gets its own column, and the value/reach meter blends whichever are on">
      ${swatch}${s.name}${edit}
      <span style="color:var(--dim)">${s.players.length}</span>${del}</span>`;
  }).join("");

  bar.innerHTML = chips +
    `<span style="width:1px;height:16px;background:var(--line2);margin:0 2px"></span>` +
    adpChips +
    `<button class="alt" id="fetchSleeperAdpBtn" title="Auto-fetch live PPR ADP straight from Sleeper's own public API (api.sleeper.app/projections) — no login, same domain this extension already talks to">⟳ FETCH SLEEPER ADP</button>` +
    `<button class="alt" id="addAdpBtn">+ ADD ADP SOURCE</button>` +
    `<button class="alt" id="addSrcBtn">+ ADD SOURCE</button>` +
    (soloSource ? `<button class="alt" id="showAllBtn">↺ SHOW ALL SOURCES</button>` : "");

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
  if ($("showAllBtn")) $("showAllBtn").addEventListener("click", () => { soloSource = null; renderAll(); });
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
async function fetchSleeperAdp() {
  const btn = $("fetchSleeperAdpBtn");
  btn.disabled = true;
  btn.textContent = "⟳ FETCHING…";
  try {
    const year = new Date().getFullYear();
    const url = `https://api.sleeper.app/projections/nfl/${year}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&order_by=pts_ppr`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const players = (data || [])
      .filter((p) => p.stats && isFinite(p.stats.adp_ppr) && p.player && POSITIONS.includes(p.player.position))
      .map((p) => ({
        name: `${p.player.first_name} ${p.player.last_name}`,
        pos: p.player.position,
        rank: p.stats.adp_ppr,
      }));
    if (!players.length) throw new Error(`No ADP data for ${year} season yet`);
    await upsertAdpSource("adp_sleeper_live", "Sleeper Live ADP", "#5FA8E8", players);
    renderAll();
    toast(`ADP fetched — ${players.length} players from Sleeper's own PPR ADP`);
  } catch (err) {
    toast(`Sleeper ADP fetch failed: ${err.message} — try FFC or pasting instead`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "⟳ FETCH SLEEPER ADP";
  }
}

function renderTable(rows) {
  const taken = takenMap();
  const cols = activeSources();
  const adpCols = adpSources.filter((s) => s.enabled);
  const adpConsensus = buildAdpConsensus(adpSources);
  const valueMap = buildValueComparison(adpSources);

  // Position and "show taken" are independent — TAKEN no longer replaces the
  // position filter, it layers drafted players (crossed out) on top of it.
  let list = rows;
  if (posFilter !== "ALL") list = list.filter((r) => r.pos === posFilter);
  if (!showTaken) list = list.filter((r) => !taken.has(r.key));
  if (playerSearch) {
    const q = playerSearch.toLowerCase();
    list = list.filter((r) =>
      r.name.toLowerCase().includes(q) || (r.team || "").toLowerCase().includes(q)
    );
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
    ${cols.map((s) => `<th style="color:${s.color}" title="${s.positionOnly ? "Position-only source — shows this source's own within-position tier, not a rank. Reference only, never affects blended rank/tier." : ""}">${s.name.toUpperCase()}${s.positionOnly ? " ⓘ" : ""}</th>`).join("")}
    ${adpCols.map((s) => `<th style="color:${s.color}">${s.name.toUpperCase()}</th>`).join("")}
    <th title="Sleeper Live ADP vs. your other enabled ADP source(s) (baseline). Green = Sleeper drafts them later than baseline (a discount). Red = Sleeper drafts them earlier than baseline (a reach). Needs Sleeper Live ADP + at least one other ADP source enabled.">VALUE</th>
    <th></th>
  </tr>`;

  const body = list.slice(0, 400).map((r, i) => {
    const t = taken.get(r.key);
    const c = POS_COLORS[r.pos] || { text: "var(--dim2)", bg: "transparent", border: "var(--line2)" };
    const adpEntry = adpConsensus.get(r.key);
    const vc = valueMap.get(r.key);
    const tier = r.tier && TIER_COLORS[r.tier]
      ? `<span class="tierChip" style="background:${TIER_COLORS[r.tier]}">${r.tier}</span>` : "";
    const flag = flags[r.key];
    const rowFlagClass = flag === "favorite" ? " favRow" : flag === "avoid" ? " avoidRow" : "";
    return `<tr class="${t ? "gone" : ""} ${t && t.byMe ? "mine" : ""}${rowFlagClass}" data-pname="${r.name}" data-ppos="${r.pos}">
      <td class="l" style="color:var(--dim)">${i + 1}</td>
      <td class="l nm" title="Right-click to find & merge near-match orphans">${flagBadge(flag)}${r.name} ${t && t.pickNo ? `<span style="color:var(--dim);font-size:10px">pk ${t.pickNo}</span>` : ""}</td>
      <td><span class="posChip" style="color:${c.text};background:${c.bg};border-color:${c.border}">${r.pos}</span></td>
      <td>${tier}</td>
      <td style="color:var(--text)">${r.consensus?.toFixed(1) ?? "—"}</td>
      ${cols.map((s) => {
        const val = s.positionOnly ? r.posOnlyTiers?.[s.id] : r.ranks[s.id];
        return `<td style="color:${val !== undefined ? "var(--dim2)" : "var(--dim)"}">${val ?? "·"}</td>`;
      }).join("")}
      ${adpCols.map((s) => `<td style="color:${adpEntry?.values[s.id] !== undefined ? "var(--dim2)" : "var(--dim)"}">${adpEntry?.values[s.id] ?? "·"}</td>`).join("")}
      <td>${renderValueBadge(vc?.delta ?? null, vc?.baselineAdp)}</td>
      <td>
        <span class="flagBtn${flag === "favorite" ? " on fav" : ""}" data-flag="${r.key}" data-kind="favorite" title="Favorite">★</span>
        <span class="flagBtn${flag === "avoid" ? " on avoid" : ""}" data-flag="${r.key}" data-kind="avoid" title="Flag to avoid">⊘</span>
        <span class="xbtn" data-key="${r.key}" title="${t ? "Un-cross (manual only)" : "Cross off manually"}">${t ? "↺" : "✕"}</span>
      </td>
    </tr>`;
  }).join("");

  $("tbl").innerHTML = head + body;

  $("tbl").querySelectorAll("[data-key]").forEach((el) => {
    el.addEventListener("click", () => toggleManual(el.dataset.key));
  });
  $("tbl").querySelectorAll("[data-flag]").forEach((el) => {
    el.addEventListener("click", () => toggleFlag(el.dataset.flag, el.dataset.kind));
  });
}

function toggleFlag(key, kind) {
  const next = { ...flags };
  if (next[key] === kind) delete next[key];
  else next[key] = kind;
  flags = next;
  suppressEcho = true;
  saveFlags(flags).finally(() => { suppressEcho = false; });
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

  if (!orphanList.length) {
    $("orphansSection").style.display = "none";
    return;
  }
  $("orphansSection").style.display = "block";
  const totalKept = orphanList.reduce((n, [, keys]) => n + keys.length, 0);
  const hidden = totalRaw - totalKept;
  $("orphansCount").textContent = `(${totalKept}${hidden ? ` · ${hidden} below rank ${ORPHAN_RANK_LIMIT} hidden` : ""})`;
  const html = orphanList.map(([srcId, keys]) => {
    const src = sources.find((s) => s.id === srcId);
    const srcName = src ? src.name : `Source ${srcId}`;
    const pairs = keys.map((key) => {
      const [name, pos] = key.split("|");
      const player = src.players.find((p) => playerKey(p.name, p.pos) === key);
      const rank = player ? `(rank ${player.rank})` : "";
      return `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
        <span style="flex:1">${name} ${pos} ${rank}</span>
        <button data-merge="${key}" class="mergeBtn" style="padding:3px 8px;font-size:10px">MERGE</button>
      </div>`;
    }).join("");
    return `<div style="margin-bottom:8px"><span style="color:var(--dim)">${srcName}</span>${pairs}</div>`;
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
    <div class="mergeCandidate" data-name="${c.name}" data-pos="${c.pos}">
      <span>${c.name}</span>
      <span class="src">${c.sourceNames.join(", ")} · rank ${c.rank}</span>
    </div>`).join("");
  el.querySelectorAll(".mergeCandidate").forEach((row) => {
    row.addEventListener("click", () => {
      const canonicalKey = playerKey(row.dataset.name, row.dataset.pos);
      const orphanName = mergingOrphanKey.split("|")[0];
      const next = { ...merges };
      next[mergingOrphanKey] = canonicalKey;
      merges = next;
      suppressEcho = true;
      saveMerges(merges).finally(() => { suppressEcho = false; });
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
    menu.innerHTML = `<div class="nmm-title">No likely name-mismatch found for "${name}" in another source.</div>`;
  } else {
    menu.innerHTML = `
      <div class="nmm-title">Found ${matches.length} likely match${matches.length > 1 ? "es" : ""} for "${name}" (${pos}) in other sources — merge into this player?</div>
      ${matches.map((m, i) => `
        <div class="nmm-row">
          <input type="checkbox" id="nmm-${i}" data-idx="${i}" checked />
          <label for="nmm-${i}">${m.name} <span class="nmm-src">${m.srcName} · rank ${m.rank}</span></label>
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
      suppressEcho = true;
      saveMerges(merges).finally(() => { suppressEcho = false; });
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
// comparison table. Live recommendations and team counts live in the side panel
// (they render from renderBestPicksWidget/renderTeamCountsWidget in shared.js,
// so re-adding them here later is just a mount point away).
function renderAll() {
  const rows = buildConsensus(activeSources(), merges);
  renderSyncLine();
  renderSourceBar();
  renderTable(rows);
  renderOrphans();
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
  suppressEcho = true;
  saveDraftState(draft).finally(() => { suppressEcho = false; });
  renderAll();
}

async function persistSources() {
  suppressEcho = true;
  await saveSources(sources);
  suppressEcho = false;
}

async function persistAdpSources() {
  suppressEcho = true;
  await saveAdpSources(adpSources);
  suppressEcho = false;
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
  $("editIconPreview").innerHTML = dataUrl ? `<img src="${dataUrl}" />` : "";
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
  // The two code-seeded ranking sources (this builtin, and FantasyPros ECR)
  // normally re-seed their player list from the bundled JS file on every
  // load. Replacing the CSV here now sets manualOverride (see makeSource in
  // shared.js), which tells loadSources()/ensureBuiltinSources() to stop
  // doing that and trust this upload instead — so the option can just stay
  // visible for every ranking source rather than being hidden for these two.
  $("editCsvLabel").style.display = "";
  $("editSrcFile").style.display = "";
  const isCodeSeeded = kind === "source" && (id === "default" || id === "fp");
  $("editStatusLine").textContent = isCodeSeeded && !s.manualOverride
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
    if (!players.length) {
      note.className = "err";
      note.textContent = "Couldn't parse any players. " + warnings.join(" ");
      editingNewPlayers = null;
      return;
    }
    editingNewPlayers = players;
    note.className = warnings.length ? "warn" : "ok";
    note.textContent = `Parsed ${players.length} players — will replace the current list on save. ${warnings.join(" ")}`;
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
  if (!players.length) {
    note.className = "err";
    note.textContent = "Couldn't parse any players. " + warnings.join(" ");
    return;
  }
  note.className = warnings.length ? "warn" : "ok";
  note.textContent = `Parsed ${players.length} players — e.g. ${players.slice(0, 3).map((p) => `${p.name} (${p.pos || "?"} ${p.rank})`).join(", ")}. ${warnings.join(" ")}`;
}

$("saveSrcBtn").addEventListener("click", async () => {
  const text = $("srcPaste").value;
  const name = $("srcName").value.trim();
  if (!text.trim()) { $("parseNote").className = "err"; $("parseNote").textContent = "Nothing to import yet."; return; }
  if (!name) { $("parseNote").className = "err"; $("parseNote").textContent = "Give the source a name."; return; }

  const { players } = parseRankings(text);
  if (!players.length) { $("parseNote").className = "err"; $("parseNote").textContent = "Couldn't parse any players."; return; }

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

// ---------- live sync with the side panel ----------
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes[K_DRAFT] && !suppressEcho) {
    draft = changes[K_DRAFT].newValue || draft;
    renderAll();
  }
  if (changes[K_SOURCES] && !suppressEcho) {
    sources = await loadSources();
    renderAll();
  }
  if (changes[K_ROSTER]) {
    // Kept in sync for the "mine" row highlight in the comparison table; the
    // position-count widget itself now lives in the side panel.
    draft.myRosterId = changes[K_ROSTER].newValue;
  }
  if (changes[K_ADP] && !suppressEcho) {
    adpSources = await loadAdpSources();
    renderAll();
  }
  if (changes[K_FLAGS] && !suppressEcho) {
    flags = await loadFlags();
    renderAll();
  }
  if (changes[K_MERGES] && !suppressEcho) {
    merges = await loadMerges();
    renderAll();
  }
});

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
    builtin: false,
    color: existing ? existing.color : undefined,
    enabled: existing ? existing.enabled : true,
    icon: existing ? existing.icon : undefined,
  });
  sources = [...sources.filter((s) => s.id !== "fp"), fpSource];
  suppressEcho = true;
  await saveSources(sources);
  suppressEcho = false;
}

// ---------- init ----------
(async function init() {
  sources = await loadSources();
  await ensureBuiltinSources();
  draft = await loadDraftState();
  adpSources = await loadAdpSources();
  flags = await loadFlags();
  merges = await loadMerges();
  const v = await chrome.storage.local.get([K_ROSTER]);
  if (draft.myRosterId == null && v[K_ROSTER] != null) draft.myRosterId = Number(v[K_ROSTER]);
  renderAll();
})();

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
let adp = null;
let flags = {}; // playerKey -> "favorite" | "avoid"
let merges = {}; // variantKey → canonicalKey, unmatched player reconciliation
let posFilter = "ALL";
let showTaken = false; // independent toggle, layered on top of posFilter — not a 6th filter option
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
    const edit = `<span class="edit-src" data-edit="${s.id}" title="Rename this source" style="cursor:pointer;margin-left:4px;opacity:0.6">✎</span>`;
    const del = s.builtin ? "" : `<span class="x" data-del="${s.id}" title="Remove source">✕</span>`;
    return `<span class="${cls}" data-toggle="${s.id}" title="Click to enable/disable · double-click to isolate">
      <span class="sw" style="background:${s.color}"></span>${s.name}${edit}
      <span style="color:var(--dim)">${s.players.length}</span>${del}</span>`;
  }).join("");

  const adpChip = `<span class="chip" data-adp="1" title="${adp ? "Replace ADP data" : "Import ADP data"}">
      <span class="sw" style="background:var(--gold)"></span>ADP
      <span style="color:var(--dim)">${adp ? adp.map.size : "none"}</span></span>`;

  bar.innerHTML = chips + adpChip +
    `<button class="alt" id="addSrcBtn">+ ADD SOURCE</button>` +
    (soloSource ? `<button class="alt" id="showAllBtn">↺ SHOW ALL SOURCES</button>` : "");

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
      const id = el.dataset.edit;
      const s = sources.find((x) => x.id === id);
      const newName = prompt(`Rename "${s.name}" to:`, s.name);
      if (!newName || newName === s.name) return;
      s.name = newName.trim();
      suppressEcho = true;
      persistSources();
      suppressEcho = false;
      renderAll();
    });
  });
  $("addSrcBtn").addEventListener("click", () => openModal(false));
  bar.querySelector("[data-adp]").addEventListener("click", () => openModal(true));
  if ($("showAllBtn")) $("showAllBtn").addEventListener("click", () => { soloSource = null; renderAll(); });
}

function renderTable(rows) {
  const taken = takenMap();
  const cols = activeSources();

  // Position and "show taken" are independent — TAKEN no longer replaces the
  // position filter, it layers drafted players (crossed out) on top of it.
  let list = rows;
  if (posFilter !== "ALL") list = list.filter((r) => r.pos === posFilter);
  if (!showTaken) list = list.filter((r) => !taken.has(r.key));

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
    ${cols.map((s) => `<th style="color:${s.color}">${s.name.toUpperCase()}</th>`).join("")}
    <th>ADP</th>
    <th>Δ</th>
    <th></th>
  </tr>`;

  const body = list.slice(0, 400).map((r, i) => {
    const t = taken.get(r.key);
    const c = POS_COLORS[r.pos] || { text: "var(--dim2)", bg: "transparent", border: "var(--line2)" };
    const adpV = adp ? adp.map.get(r.key) : undefined;
    const d = adpV !== undefined ? adpDelta(r.consensus, adpV) : null;
    const tier = r.tier && TIER_COLORS[r.tier]
      ? `<span class="tierChip" style="background:${TIER_COLORS[r.tier]}">${r.tier}</span>` : "";
    const flag = flags[r.key];
    const rowFlagClass = flag === "favorite" ? " favRow" : flag === "avoid" ? " avoidRow" : "";
    return `<tr class="${t ? "gone" : ""} ${t && t.byMe ? "mine" : ""}${rowFlagClass}">
      <td class="l" style="color:var(--dim)">${i + 1}</td>
      <td class="l nm">${flagBadge(flag)}${r.name} ${t && t.pickNo ? `<span style="color:var(--dim);font-size:10px">pk ${t.pickNo}</span>` : ""}</td>
      <td><span class="posChip" style="color:${c.text};background:${c.bg};border-color:${c.border}">${r.pos}</span></td>
      <td>${tier}</td>
      <td style="color:var(--text)">${r.consensus?.toFixed(1) ?? "—"}</td>
      ${cols.map((s) => `<td style="color:${r.ranks[s.id] !== undefined ? "var(--dim2)" : "var(--dim)"}">${r.ranks[s.id] ?? "·"}</td>`).join("")}
      <td style="color:var(--dim2)">${adpV ?? "·"}</td>
      <td style="color:${adpDeltaColor(d)}">${d === null ? "·" : (d > 0 ? "+" : "") + d.toFixed(0)}</td>
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

function renderOrphans() {
  const orphans = findOrphans(sources, merges);
  const orphanList = Object.entries(orphans);
  if (!orphanList.length) {
    $("orphansSection").style.display = "none";
    return;
  }
  $("orphansSection").style.display = "block";
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

  document.querySelectorAll("[data-merge]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.merge;
      showMergePrompt(key);
    });
  });
}

function showMergePrompt(orphanKey) {
  // For now, offer a simple choice: either merge with an exact name match, or ignore.
  // In a rare case, users can manually fix names in their source and re-import.
  const response = prompt(
    `Found "${orphanKey.split("|")[0]}" in only one source.\n\nTo merge with another player, paste their name and position (e.g., "Player Name|POS"), or press Cancel to ignore.`,
    ""
  );
  if (!response) return;
  const [name, pos] = response.split("|").map((s) => s.trim());
  if (!name || !pos) { toast("Invalid format. Use: Name|POS", true); return; }
  const canonicalKey = playerKey(name, pos);
  const next = { ...merges };
  next[orphanKey] = canonicalKey;
  merges = next;
  suppressEcho = true;
  saveMerges(merges).finally(() => { suppressEcho = false; });
  toast(`Merged "${orphanKey}" with "${canonicalKey}"`);
  renderAll();
}

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

// ---------- import modal ----------
function openModal(isAdp) {
  editingAdp = isAdp;
  $("modalTitle").textContent = isAdp ? "Import ADP data" : "Add a ranking source";
  $("modalHint").innerHTML = isAdp
    ? `Sleeper publishes no public ADP endpoint, so ADP is imported here rather than fetched live. Paste or upload any ADP export — same flexible format as a ranking source, where the numeric column is the ADP.`
    : `Columns are detected automatically. A header row is optional, and comma or tab separated both work. Recognized: Name, Team, Position, Tier, Rank — only Name is required.`;
  $("srcName").value = isAdp ? "ADP" : "";
  $("srcName").disabled = isAdp;
  $("srcPaste").value = "";
  $("srcFile").value = "";
  $("parseNote").textContent = "";
  $("parseNote").className = "";
  $("modal").classList.add("open");
}
function closeModal() { $("modal").classList.remove("open"); }

$("cancelBtn").addEventListener("click", closeModal);
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

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
    if (!$("srcName").value && !editingAdp) $("srcName").value = f.name.replace(/\.[^.]+$/, "");
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
  if (!editingAdp && !name) { $("parseNote").className = "err"; $("parseNote").textContent = "Give the source a name."; return; }

  const { players } = parseRankings(text);
  if (!players.length) { $("parseNote").className = "err"; $("parseNote").textContent = "Couldn't parse any players."; return; }

  if (editingAdp) {
    await chrome.storage.local.set({
      [K_ADP]: { players: players.map((p) => ({ name: p.name, pos: p.pos, rank: p.rank })), importedAt: Date.now(), label: "ADP" },
    });
    adp = await loadAdp();
    toast(`ADP imported — ${players.length} players.`);
  } else {
    const color = SOURCE_PALETTE[sources.length % SOURCE_PALETTE.length];
    sources.push(makeSource(name, players, { color }));
    await persistSources();
    toast(`Added "${name}" — ${players.length} players.`);
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
    adp = await loadAdp();
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
  const fpSource = makeSource("FantasyPros ECR", FP_RANKINGS, {
    id: "fp",
    builtin: false,
    color: existing ? existing.color : undefined,
    enabled: existing ? existing.enabled : true,
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
  adp = await loadAdp();
  flags = await loadFlags();
  merges = await loadMerges();
  const v = await chrome.storage.local.get([K_ROSTER]);
  if (draft.myRosterId == null && v[K_ROSTER] != null) draft.myRosterId = Number(v[K_ROSTER]);
  renderAll();
})();

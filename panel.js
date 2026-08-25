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
  "list-plus": `<path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M18 9v6"/><path d="M21 12h-6"/>`,
  "circle-check": `<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>`,
  "chevron-up": `<polyline points="18 15 12 9 6 15"/>`,
  "chevron-down": `<polyline points="6 9 12 15 18 9"/>`,
  "sun": `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>`,
  "moon": `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`,
  "activity": `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
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
  return `<span class="adpBlinkDot" style="background:${t.fg};color:${t.fg}" data-tip="Pick ${currentPickNo} has passed their baseline ADP (${baselineAdp.toFixed(1)}) — still on the board"></span>`;
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
  return `<span class="${cls}" data-solo="${esc(s.id)}" style="background:${esc(s.color)}" data-tip="${esc(title ?? s.name)}">${inner}</span>`;
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
// Column sorting (feature 6) — clicking Rank/ADP Value/Pos in #colHead
// overrides the default tier+rank grouping with a flat list sorted by that
// column. null means "back to the normal tiered board". sortDir: 1 = asc,
// -1 = desc. A missing value for the active column always sorts last
// regardless of direction (Infinity/-Infinity swap based on column).
let sortColumn = null; // "rank" | "value" | "pos" | null
let sortDir = 1;
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
let playerStats = {}; // playerKey -> {basic:[...], options:{id:{...}}}, fetched via "FETCH STATS" in the Rankings Manager (shared.js's renderStatGroups)
let visibleStats = { ...DEFAULT_VISIBLE_STATS }; // pos -> [id,...] of currently-shown STAT_OPTION_DEFS entries — see openStatPicker
let showTaken = false; // independent toggle, layered on top of posFilter
let playerSearch = ""; // name/team substring filter, layered on top of posFilter/showTaken
let currentPickNo = null; // next pick about to happen (picks synced so far + 1) — drives the row's live-ADP blink dot

// EXPERIMENTAL (queue/draft-write branch) — see background.js's "Sleeper
// WRITE actions" section for the actual mechanism (script injection into
// your own open Sleeper tab, no token ever stored here).
let sleeperIds = {}; // playerKey -> Sleeper's own numeric player_id, loaded from K_SLEEPER_IDS
const K_SLEEPER_QUEUE = "sleeperQueueKeys"; // this extension's own local mirror of "what should be queued" — playerKey[]
let sleeperQueueKeys = []; // loaded from storage on init, kept in sync with the button state
// Master on/off switch for the whole feature — persisted (unlike the token
// itself, which stays session-memory-only). OFF by default. When off, the
// board renders EXACTLY as it did before this feature existed: renderBoard's
// sleeperBtns block below returns "" entirely, not even the spacer variant,
// and the settings panel hides the token field. Every write action also
// re-checks sleeperWriteReady() independently (not just at render time), so
// a stale open menu/button from before someone flips this off can't still
// fire a request after the fact.
const K_SLEEPER_WRITE_ENABLED = "sleeperWriteEnabled";
let sleeperWriteEnabled = false;
function sleeperWriteReady() {
  return sleeperWriteEnabled && !!sleeperToken();
}
// Double-click-to-draft is an extra safeguard on top of the confirm modal,
// not a replacement for it — this only changes how many clicks arm it.
// Defaults ON (the safer choice). Persisted, since it's a standing
// preference like the other settings here, not a per-draft/session thing.
const K_SLEEPER_DBLCLICK_DRAFT = "sleeperDoubleClickDraft";
let sleeperDoubleClickDraft = true;
function draftTipText() {
  return sleeperDoubleClickDraft ? "Double-click to draft now" : "Click to draft now";
}

// ---------- theme (light/dark) ----------
// Dark is the original design import's only mode; light is a straight token
// swap (see html[data-theme="light"] in panel.html) added on request. Applied
// to <html>, not <body>, so it's in effect before anything renders. Persisted
// so it survives closing/reopening the board window.
const K_THEME = "boardTheme";
let currentTheme = "dark";
function applyTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", currentTheme);
  const btn = $("themeToggleBtn");
  if (btn) btn.innerHTML = ico(currentTheme === "light" ? "moon" : "sun", { size: 15 });
}

// ---------- floating dropdowns: settings + status ----------
// Both #settingsPanel and #statusPanel anchor under their trigger button
// instead of pushing the header open at full width (settings used to be an
// inline drawer spanning the whole header) — positioned on open via
// getBoundingClientRect, same pattern as the queue popover / flag menu.
function positionFloatingPanel(panel, anchorBtn) {
  const r = anchorBtn.getBoundingClientRect();
  const w = panel.offsetWidth || 300;
  panel.style.left = `${Math.max(4, Math.min(r.right - w, window.innerWidth - w - 6))}px`;
  panel.style.top = `${r.bottom + 6}px`;
}
function openSettingsPanel() {
  closeStatusPanel();
  const panel = $("settingsPanel");
  panel.classList.remove("collapsed");
  panel.classList.add("open");
  positionFloatingPanel(panel, $("settingsBtn"));
  $("settingsBtn").classList.add("on");
}
function closeSettingsPanel() {
  $("settingsPanel").classList.remove("open");
  $("settingsBtn").classList.remove("on");
}
function isSettingsPanelOpen() { return $("settingsPanel").classList.contains("open"); }

// Relative "how long ago" for a source's importedAt, used both here and could
// be reused elsewhere — kept local since nowhere else needs it yet.
function timeAgoLabel(ts) {
  if (!ts) return "never imported";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
// A source counts as "stale" past 24h — purely a glance cue in this dropdown,
// doesn't affect anything else (the board's own STALE_AFTER_S is about the
// live Sleeper poll, a completely different staleness signal).
const SOURCE_STALE_MS = 24 * 60 * 60 * 1000;

function renderStatusPanel() {
  const statusEl = $("status");
  const syncLine = `<div class="statusSyncLine"><span class="statusDot${statusEl.className.indexOf("live") !== -1 ? " live" : statusEl.className.indexOf("err") !== -1 ? " err" : ""}"></span>${esc(statusEl.textContent)}</div>`;
  const allSrc = [...sources.filter((s) => s.enabled), ...adpSources.filter((s) => s.enabled)];
  const rows = allSrc.length
    ? allSrc.map((s) => {
        const stale = s.importedAt && (Date.now() - s.importedAt) > SOURCE_STALE_MS;
        return `<div class="statusSrcRow"><span class="nm">${esc(s.name)}</span><span class="age${stale ? " stale" : ""}">${esc(timeAgoLabel(s.importedAt))}</span></div>`;
      }).join("")
    : `<div class="statusEmpty">No sources enabled.</div>`;
  $("statusPanel").innerHTML = `
    <div class="statusSectionLabel">Sleeper sync</div>
    ${syncLine}
    <div class="statusSectionLabel">Source freshness</div>
    ${rows}`;
}
function openStatusPanel() {
  closeSettingsPanel();
  renderStatusPanel();
  const panel = $("statusPanel");
  panel.classList.add("open");
  positionFloatingPanel(panel, $("statusBtn"));
}
function closeStatusPanel() { $("statusPanel").classList.remove("open"); }
function isStatusPanelOpen() { return $("statusPanel").classList.contains("open"); }
document.addEventListener("click", (e) => {
  if (isSettingsPanelOpen() && !e.target.closest("#settingsPanel") && !e.target.closest("#settingsBtn")) closeSettingsPanel();
  if (isStatusPanelOpen() && !e.target.closest("#statusPanel") && !e.target.closest("#statusBtn")) closeStatusPanel();
});

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
      ${bestActionsHtml(p)}
    </div>`;
  }).join("");
}

// EXPERIMENTAL (queue/draft-write branch) — shared by both Best Available
// widgets (the QB/RB/WR/TE quad grid above and the top-3 Best Picks cards
// below), same queue/draft actions and gating as the board row buttons:
// nothing at all unless the feature's on AND this player has a matched
// Sleeper player_id. r may be undefined (an empty quad cell) — handled here
// so both call sites can stay one-liners.
function bestActionsHtml(r) {
  if (!sleeperWriteEnabled || !r) return "";
  const sleeperId = sleeperIds[r.key];
  if (!sleeperId) return "";
  const queued = sleeperQueueKeys.includes(r.key);
  return `<div class="bestActions">
    <button class="bestActionBtn${queued ? " on" : ""}" data-key="${esc(r.key)}" data-action="queue" aria-label="${queued ? "Remove from Sleeper queue" : "Add to Sleeper queue"}" data-tip="${queued ? "Queued — click to remove" : "Add to Sleeper draft queue"}">${ico("list-plus", { size: 14 })}</button>
    <button class="bestActionBtn" data-key="${esc(r.key)}" data-action="draft" aria-label="Draft on Sleeper" data-tip="${draftTipText()}">${ico("circle-check", { size: 14 })}</button>
  </div>`;
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

// Clicking a player's row brings that position's stat group to slot 1 (right
// after the pinned BASIC group) in the always-visible stat block — see
// statGroupOrder/STAT_GROUP_SEQUENCE in shared.js. Clicking the SAME row
// again deselects and restores the default WR/RB/QB/TE order; clicking a
// DIFFERENT row switches to that player's position instead. Tracked by exact
// player key, not just position, so re-clicking a specific player is what
// toggles the selection off — clicking a different player who happens to
// share a position doesn't. Session-only (not persisted): resets on reload,
// which is fine since it's a glance aid, not a setting.
let selectedStatPlayerKey = null;
let selectedStatPos = null;

// Filtering the board to a single position (QB/RB/WR/TE) is now itself a
// default for the stat-group order, on top of the existing click-to-select
// behavior — once every visible row IS that position, clicking to bring its
// stat group forward would be a no-op most of the time anyway, so it should
// just already be there. An explicit player selection still wins over the
// filter (clicking a specific player is a stronger signal than "I filtered
// the whole board"), and selecting the SAME position the filter already
// implies is a harmless no-op via statGroupOrder's own dedupe.
function effectiveStatPos() {
  if (selectedStatPos) return selectedStatPos;
  return POSITIONS.includes(posFilter) ? posFilter : null;
}

function renderBoard() {
  // A selected player who gets drafted (synced pick or manual crossout)
  // loses their selection automatically — the only other way to clear it is
  // clicking that same row again. Checked on every render (not just the
  // poll path) so it also catches a manual crossout from this window or a
  // pick applied from the Rankings Manager tab.
  if (selectedStatPlayerKey && (taken[selectedStatPlayerKey] || manualTaken[selectedStatPlayerKey])) {
    selectedStatPlayerKey = null;
    selectedStatPos = null;
  }
  // Position and "show taken" are independent — TAKEN no longer replaces the
  // position filter, it layers drafted players (crossed out) on top of it.
  const groupOrder = statGroupOrder(effectiveStatPos());
  const statBlockWidth = statGroupLayout(groupOrder, visibleStats).totalWidth;
  $("statHead").innerHTML = renderStatHeaderGroups(groupOrder, visibleStats);
  $("statHead").style.width = `${statBlockWidth}px`;
  document.querySelectorAll("#colHead .sortCol").forEach((el) => {
    const active = el.dataset.sort === sortColumn;
    el.classList.toggle("active", active);
    el.querySelector(".sortArrow").textContent = active ? (sortDir === 1 ? "▲" : "▼") : "";
  });
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

  const renderRow = (r, t) => {
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
      const selected = r.key === selectedStatPlayerKey;
      // EXPERIMENTAL (queue/draft-write branch) — completely absent, not
      // just hidden, when the feature toggle is off: no spacer, no reserved
      // width, identical markup to before this feature existed. Only once
      // enabled does a row get the spacer-or-buttons treatment, gated further
      // on having a matched Sleeper player_id (see sleeperIds, loaded from
      // K_SLEEPER_IDS) — a name/pos this project's own rankings recognize but
      // that didn't match anything in Sleeper's own projections data (a rare
      // mismatch) just can't be queued/drafted from here; the double-click
      // crossout still works regardless. The buttons themselves don't also
      // check for a token — sleeperWriteReady() handles that at click time,
      // same as the existing currentDraftId check, so the button stays
      // visible/discoverable even before a token's been pasted in.
      let sleeperBtns = "";
      if (sleeperWriteEnabled) {
        const sleeperId = sleeperIds[r.key];
        const queued = sleeperQueueKeys.includes(r.key);
        sleeperBtns = sleeperId && !gone
          ? `<button class="rowQueueBtn${queued ? " on" : ""}" data-key="${esc(r.key)}" aria-label="${queued ? "Remove from Sleeper queue" : "Add to Sleeper queue"}" data-tip="${queued ? "Queued on Sleeper — click to remove" : "Add to Sleeper draft queue"}">${ico("list-plus", { size: 16, color: queued ? "var(--accent)" : "var(--text-disabled)" })}</button>
             <button class="rowDraftBtn" data-key="${esc(r.key)}" aria-label="Draft on Sleeper" data-tip="${draftTipText()}">${ico("circle-check", { size: 16 })}</button>`
          : `<span class="rowFlagSpacer"></span><span class="rowFlagSpacer"></span>`;
      }
      return `<div class="row2 ${gone ? "gone" : ""} ${mine ? "mine" : ""} ${selected ? "selected" : ""}" data-key="${esc(r.key)}" data-name="${esc(r.name)}" data-pos="${esc(r.pos)}" data-tier-group="${esc(t)}" data-tip="Double-click to cross off / undo">
        <button class="rowFlagBtn" data-key="${esc(r.key)}" aria-label="Flag player">${ico(flagIcon, { size: 13, color: flagColor })}</button>
        ${sleeperBtns}
        <span class="rk2">${r.consensus != null ? r.consensus.toFixed(1) : "—"}</span>
        <span class="nmCell2">
          <span class="nmLine">
            <span class="nmText">${esc(r.name)}</span>
            <span class="team2">${esc(r.team || "")}</span>
            ${takenTag}
          </span>
          ${adpCaption}
        </span>
        <span class="statBlock" style="width:${statBlockWidth}px">${renderStatGroups(r, playerStats, groupOrder, visibleStats)}</span>
        <span class="valCell2">${valueCell}</span>
        <span class="posCell2">${posBadgeHtml(r.pos, posRanks.get(r.key) ?? null, "sm")}</span>
      </div>`;
  };

  // A column sort overrides the tier grouping entirely — one flat list, no
  // tier dividers (there's nothing coherent to divide by once the order
  // isn't rank-based). Missing values always sort last, independent of
  // ascending/descending, so an unranked/no-value player is never displayed
  // as if it "won" a descending sort.
  if (sortColumn) {
    const sortVal = (r) => {
      if (sortColumn === "rank") return r.consensus ?? null;
      if (sortColumn === "value") return valueMap.get(r.key)?.delta ?? null;
      if (sortColumn === "pos") return r.pos || null;
      return null;
    };
    const sorted = [...list].sort((a, b) => {
      const av = sortVal(a), bv = sortVal(b);
      if (av == null && bv == null) return (a.consensus ?? Infinity) - (b.consensus ?? Infinity);
      if (av == null) return 1;  // missing values always sort last, either direction
      if (bv == null) return -1;
      if (av < bv) return -sortDir;
      if (av > bv) return sortDir;
      return (a.consensus ?? Infinity) - (b.consensus ?? Infinity); // stable tiebreak
    });
    $("board").innerHTML = sorted.map((r) => renderRow(r, r.tier || "?")).join("");
    return;
  }

  $("board").innerHTML = orderedTiers.map((t) => {
    const rows = groups[t].map((r) => renderRow(r, t)).join("");
    return `<div class="tierDiv" data-tier="${esc(t)}"><span class="toggle">${ico("chevron-down", { size: 14 })}</span><span class="num">Tier ${esc(t)}</span><span class="line"></span><span>${groups[t].length}</span></div>${rows}`;
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
  // Overall team grade (backlog #13's rollup, added after the per-position
  // ranks) — same fused pill, neutral tone since it's not any one position's
  // color, built off buildTeamOverallRanks (shared.js: sums BEER value
  // across every drafted player, any position — no weighting scheme needed
  // since BEER values are already cross-position comparable).
  const overallRanks = myTeamId != null ? buildTeamOverallRanks(picks, beerValues) : {};
  const myOverall = myTeamId != null ? overallRanks[myTeamId] : null;
  const totalPill = (myOverall && mine.length > 0)
    ? (() => {
        const { bg, fg } = rankColor(myOverall.rank, myOverall.of);
        return `<span class="posRankPill t-neutral" title="Overall team value ranks ${esc(ordinal(myOverall.rank))} of ${myOverall.of} in the league by total BEER value">
          <span class="prpTop t-neutral">Tot ${mine.length}</span>
          <span class="prpRank" style="background:${bg};color:${fg}">${esc(ordinal(myOverall.rank).toUpperCase())}</span>
        </span>`;
      })()
    : badgeHtml("neutral", `Tot ${mine.length}`);
  el.innerHTML = `<span class="teamHint">My team (slot ${esc(myRosterId)})</span>${counts}${totalPill}`;
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
        <span style="display:flex;align-items:center;gap:8px">${bestActionsHtml(r)}${posBadgeHtml(r.pos, posRanks.get(r.key) ?? null, "md")}</span>
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
    renderSleeperQueueBtn();
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
  if (changes[K_STATS]) {
    playerStats = await loadPlayerStats();
    renderAll(); // board's stat column depends on this too
  }
  if (changes[K_STAT_PREFS] && !echo.isEcho(K_STAT_PREFS)) {
    visibleStats = await loadStatPrefs();
    renderAll(); // stat picker selection is board-only, but honor an external change anyway
  }
  if (changes[K_SLEEPER_IDS]) {
    sleeperIds = await loadSleeperIdMap();
    renderAll(); // queue/draft buttons only show once a player has a known Sleeper ID
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
    pruneSleeperQueue(); // a queued player who's now off the board (by us or anyone else) shouldn't linger in the queue popover

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
  openSettingsPanel();
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

// EXPERIMENTAL (queue/draft-write branch) — the draft button is double-click
// to fire, same as the row's own crossout below, as an extra deliberate-
// action safeguard on top of the confirm modal. Handled here (ahead of the
// row's own dblclick-to-crossout logic) rather than as a separate listener,
// for the same reason .rowFlagBtn is excluded just below: a fast double-
// click on a child button inside the row would otherwise also register as
// a row-level dblclick and cross the player off at the same time.
$("board").addEventListener("dblclick", (e) => {
  const draftBtn = e.target.closest(".rowDraftBtn");
  if (draftBtn) {
    // Always stop here regardless of the setting below — falling through
    // when double-click-to-draft is off would otherwise register as a
    // row-level dblclick and cross the player off too.
    if (sleeperDoubleClickDraft) {
      const row = draftBtn.closest(".row2");
      draftOnSleeper(draftBtn.dataset.key, row?.dataset.name || "Player");
    }
    return;
  }
  if (e.target.closest(".rowFlagBtn") || e.target.closest(".rowQueueBtn")) return;
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
    pruneSleeperQueue(); // same reasoning as poll()'s call — see its comment
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
// ---------- custom tooltip (replaces native title="") ----------
// A small themed floating box instead of the native title="" tooltip —
// no styling control there, plus a built-in OS hover delay. Originally
// built just for the stat column headers (data-full); generalized to one
// document-level delegated listener keyed off data-tip="...", so any
// element anywhere gets the same themed tooltip just by adding that
// attribute — no per-element wiring needed. Every title="" this project
// had (the row's "double-click to cross off", every queue/draft button,
// etc.) was migrated to data-tip for this reason, not just the stat labels.
let tipEl = null;
function hideTip() {
  if (tipEl) { tipEl.remove(); tipEl = null; }
}
function showTip(target, text) {
  hideTip();
  const el = document.createElement("div");
  el.className = "statTooltip";
  el.textContent = text;
  document.body.appendChild(el);
  const r = target.getBoundingClientRect();
  const w = el.offsetWidth;
  const left = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 4));
  el.style.left = `${left}px`;
  // Flip above the target if there's not enough room below — same idea as
  // the popover positioning elsewhere, just simpler (a tooltip's height is
  // small and fixed, no need for the full flip-and-clamp dance).
  const h = el.offsetHeight;
  el.style.top = r.bottom + 6 + h > window.innerHeight
    ? `${Math.max(4, r.top - h - 6)}px`
    : `${r.bottom + 6}px`;
  tipEl = el;
}
// Tooltips wait for a real, sustained hover before showing (2026-08-25) —
// they used to fire instantly on mouseover, which meant the board's own
// "double-click to cross off" tip (on every row) was visible almost
// constantly while scanning the list with the mouse, since the cursor is
// nearly always sitting over SOME row. TIP_DELAY_MS is long enough that
// scrolling/skimming across rows never triggers it, but a genuine pause to
// read still does. The pending timer is cleared on mouseout so a quick
// pass-through never shows anything at all.
const TIP_DELAY_MS = 550;
let tipTimer = null;
document.addEventListener("mouseover", (e) => {
  const el = e.target.closest("[data-tip]");
  if (!el) return;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => showTip(el, el.dataset.tip), TIP_DELAY_MS);
});
document.addEventListener("mouseout", (e) => {
  if (!e.target.closest("[data-tip]")) return;
  clearTimeout(tipTimer);
  hideTip();
});

// ---------- stat picker (choose which stat columns show, per position) ----------
// Every STAT_OPTION_DEFS entry — both the original correlation-research set
// and the later per-game/per-snap set — is always fetched (shared.js's
// fetchSleeperStatsPlayers), so this picker only changes what renderBoard
// reads, never triggers a re-fetch. Checkbox state IS visibleStats; no
// separate draft/staging state to reconcile before applying.
function closeStatPicker() {
  $("statPickerPanel").hidden = true;
  document.removeEventListener("click", onStatPickerOutsideClick);
}
function onStatPickerOutsideClick(e) {
  if (!e.target.closest("#statPickerPanel") && !e.target.closest("#statPickerBtn")) closeStatPicker();
}
function renderStatPickerPanel() {
  const panel = $("statPickerPanel");
  panel.innerHTML = POSITIONS.map((pos) => {
    const opts = STAT_OPTION_DEFS[pos].map((def) => {
      const checked = (visibleStats[pos] || []).includes(def.id);
      return `<label class="statPickerOpt" data-tip="${esc(def.full)}">
        <input type="checkbox" data-pos="${esc(pos)}" data-id="${esc(def.id)}" ${checked ? "checked" : ""} />
        <span class="spoLabel" style="color:${POS_COLORS && POS_COLORS[pos] ? POS_COLORS[pos].text : 'currentColor'}">${esc(def.label)}</span>
      </label>`;
    }).join("");
    return `<div class="statPickerGroup">
      <div class="spgTitle" style="color:${POS_COLORS && POS_COLORS[pos] ? POS_COLORS[pos].text : 'currentColor'}">${esc(pos)}</div>
      ${opts}
    </div>`;
  }).join("");
  panel.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const { pos, id } = cb.dataset;
      const cur = visibleStats[pos] || [];
      visibleStats = { ...visibleStats, [pos]: cb.checked ? [...cur, id] : cur.filter((x) => x !== id) };
      saveStatPrefs(visibleStats).catch((e) => { console.error("[4th&Go] couldn't save stat picker prefs", e); toast("Couldn't save that stat selection.", true); });
      renderAll(); // column count/width changed — needs a real re-render, not just applyStatGroupOrder's reorder-in-place
    });
  });
}
function openStatPicker() {
  renderStatPickerPanel();
  const panel = $("statPickerPanel");
  const btn = $("statPickerBtn");
  panel.hidden = false;
  // Reset any leftover position/height cap from a previous open before
  // measuring — otherwise a stale value from last time (especially `bottom`,
  // set only in the upward-opening branch below) would throw off this pass.
  panel.style.top = "";
  panel.style.bottom = "";
  panel.style.maxHeight = "";
  const r = btn.getBoundingClientRect();
  const w = panel.offsetWidth;
  panel.style.left = `${Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4))}px`;

  // The panel's own CSS max-height (70vh) only bounds it against the WINDOW,
  // not against where the button happens to sit — a button positioned low
  // on the page still left top + 70vh spilling off the bottom of the
  // window, past where any scrollbar or click could reach it. That's what
  // was reported: TE's checkboxes existed, just permanently off-screen,
  // with no amount of scrolling able to reach them. A flat "clamp top, cap
  // height" fix isn't enough either — if a floor on the height is kept for
  // usability, a short enough window still pushes the bottom off-screen
  // again. The real fix is picking whichever direction (below or above the
  // button) actually has more room, and capping height to EXACTLY that
  // available space — never more than what's provably on-screen.
  const margin = 8;
  const spaceBelow = window.innerHeight - r.bottom - margin;
  const spaceAbove = r.top - margin;
  if (spaceBelow >= spaceAbove) {
    panel.style.top = `${r.bottom + 6}px`;
    panel.style.maxHeight = `${Math.max(80, spaceBelow - 6)}px`;
  } else {
    panel.style.bottom = `${window.innerHeight - r.top + 6}px`;
    panel.style.maxHeight = `${Math.max(80, spaceAbove - 6)}px`;
  }
  setTimeout(() => document.addEventListener("click", onStatPickerOutsideClick), 0);
}
$("statPickerBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!$("statPickerPanel").hidden) { closeStatPicker(); return; }
  openStatPicker();
});

// ---------- EXPERIMENTAL: Sleeper write actions (queue / draft) ----------
// See background.js's "Sleeper WRITE actions" section for the mechanism.
// This extension's own K_SLEEPER_QUEUE list is the local source of truth for
// "what should be queued" — update_draft_queue's exact request shape wasn't
// directly captured (only its response was, via live network traffic), so
// it's treated here as replacing Sleeper's queue with our full intended
// list on every change, which is the safer assumption for a "set" mutation
// and also naturally supports add/remove with one call.
function saveSleeperQueueKeys() {
  chrome.storage.local.set({ [K_SLEEPER_QUEUE]: sleeperQueueKeys });
}

// Local-only cleanup (no mutation pushed to Sleeper) — Sleeper's own server
// already drops a player from its real queue the moment they're actually
// drafted, so pushing a redundant update_draft_queue on every poll tick
// would just be a wasted write. This exists purely so OUR display (the
// queue popover, the button's "Queue (N)" count) doesn't keep showing a
// player who's plainly gone — using the same "gone" definition (taken OR
// manualTaken) the board rows already use, so a manual crossout drops a
// player from the queue view too, not just a real synced pick.
function pruneSleeperQueue() {
  const next = sleeperQueueKeys.filter((k) => !taken[k] && !manualTaken[k]);
  if (next.length === sleeperQueueKeys.length) return; // nothing changed — skip the write/render
  sleeperQueueKeys = next;
  saveSleeperQueueKeys();
}

// EXPERIMENTAL, temporary (queue/draft-write branch) — Sleeper's own page JS
// attaches an Authorization bearer header that lives only in its in-memory
// app state, not in any cookie or localStorage/sessionStorage an injected
// script can read (confirmed by direct inspection, not assumed). Pasting it
// here is a stopgap to finish validating the write mutations themselves;
// read fresh off the input every call, never written to chrome.storage,
// gone the moment this window closes. If this pans out, the real fix is
// capturing the header live off one of Sleeper's own requests instead of
// asking for a manual paste every session — see claude.md.
function sleeperToken() {
  return $("sleeperToken").value.trim();
}

// Confirms the tab+token setup actually works BEFORE a draft is live, when
// there'd otherwise be nothing safe to test a real queue/draft action
// against. Runs a genuine read query (draft_autopickers) through the exact
// same tab-injection + auth path a real write uses — a green result here is
// a real guarantee about that path, not a weaker stand-in check.
$("sleeperTestBtn").addEventListener("click", async () => {
  const status = $("sleeperTestStatus");
  if (!sleeperWriteEnabled) { status.className = "testStatus err"; status.textContent = "Turn on Draft actions first."; return; }
  if (!sleeperToken()) { status.className = "testStatus err"; status.textContent = "Paste your token first."; return; }
  if (!currentDraftId) { status.className = "testStatus err"; status.textContent = "Sync a draft first."; return; }
  status.className = "testStatus";
  status.textContent = "Checking…";
  try {
    const t0 = performance.now();
    const res = await chrome.runtime.sendMessage({
      type: "sleeperTestConnection",
      payload: { draftId: currentDraftId, token: sleeperToken() },
    });
    const ms = Math.round(performance.now() - t0);
    if (!res || !res.ok) throw new Error((res && res.error) || "Unknown error");
    status.className = "testStatus ok";
    status.textContent = `Connected (${ms}ms)`;
  } catch (e) {
    status.className = "testStatus err";
    status.textContent = e.message;
  }
});

// Single entry point for every queue mutation (add, remove, reorder) — all
// three are really the same operation (push a full replacement list to
// Sleeper), so toggleSleeperQueue/removeFromSleeperQueue/reorderSleeperQueue
// below are thin callers rather than three separate copies of this
// optimistic-update/revert-on-failure dance.
async function applySleeperQueueChange(newKeys, successMsg) {
  if (!sleeperWriteReady()) { toast("Turn on Draft actions and paste your Sleeper token first.", true); return; }
  if (!currentDraftId) { toast("Sync a draft first.", true); return; }
  const prev = sleeperQueueKeys;
  sleeperQueueKeys = newKeys;
  saveSleeperQueueKeys();
  renderAll();
  const playerIds = sleeperQueueKeys.map((k) => sleeperIds[k]).filter(Boolean);
  try {
    const t0 = performance.now(); // see draftOnSleeper's identical timing note
    const res = await chrome.runtime.sendMessage({
      type: "sleeperUpdateDraftQueue",
      payload: { draftId: currentDraftId, playerIds, token: sleeperToken() },
    });
    const ms = Math.round(performance.now() - t0);
    console.debug(`[4th&Go] update_draft_queue round-trip: ${ms}ms`);
    if (!res || !res.ok) throw new Error((res && res.error) || "Unknown error");
    toast(`${successMsg} (${ms}ms)`);
  } catch (e) {
    sleeperQueueKeys = prev; // revert the optimistic update
    saveSleeperQueueKeys();
    renderAll();
    toast(`Couldn't update Sleeper's queue: ${e.message}`, true);
  }
}

function toggleSleeperQueue(key, name) {
  const wasQueued = sleeperQueueKeys.includes(key);
  const newKeys = wasQueued ? sleeperQueueKeys.filter((k) => k !== key) : [...sleeperQueueKeys, key];
  return applySleeperQueueChange(newKeys, `${name} ${wasQueued ? "removed from" : "added to"} Sleeper queue.`);
}

function removeFromSleeperQueue(key, name) {
  return applySleeperQueueChange(sleeperQueueKeys.filter((k) => k !== key), `${name} removed from Sleeper queue.`);
}

function reorderSleeperQueue(fromKey, toKey) {
  const list = sleeperQueueKeys.filter((k) => k !== fromKey);
  const toIdx = list.indexOf(toKey);
  if (toIdx === -1) return; // toKey vanished (shouldn't happen — defensive only)
  list.splice(toIdx, 0, fromKey);
  return applySleeperQueueChange(list, "Sleeper queue reordered.");
}

// One-step move — a faster, more precise alternative to drag-and-drop for
// nudging a player a spot or two, since dragging accurately onto a specific
// 40px row (especially several rows away) is fiddly to do quickly mid-draft.
// Drag stays available for bigger jumps; these buttons are for the common
// "move it up one" case.
function moveSleeperQueueItem(key, dir) {
  const idx = sleeperQueueKeys.indexOf(key);
  if (idx === -1) return;
  const newIdx = dir === "up" ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= sleeperQueueKeys.length) return;
  const list = [...sleeperQueueKeys];
  [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
  return applySleeperQueueChange(list, "Sleeper queue reordered.");
}

// The "Queue ▾" chip's label always reflects the count, even while the
// popover is closed, so there's no need to open it just to see how full the
// queue is. Hidden entirely (not shown as disabled/empty) when the feature
// is off — same rule as everything else this branch adds.
function renderSleeperQueueBtn() {
  const btn = $("sleeperQueueBtn");
  if (!sleeperWriteEnabled) { btn.style.display = "none"; return; }
  btn.style.display = "";
  btn.textContent = `Queue (${sleeperQueueKeys.length}) ▾`;
  // Keep an already-open popover in sync too — e.g. queueing a player from
  // a board row while the popover happens to be open shouldn't require
  // closing and reopening it to see the new entry.
  if (!$("sleeperQueuePopover").hidden) renderSleeperQueuePopover();
}

// Player display data (name/pos) comes from the same blended consensus rows
// every other widget uses, not a separate lookup — a queued player who's
// since dropped out of the current filtered view (isolating a source, etc.)
// still needs to show up here since the queue itself isn't filtered.
// Sized deliberately larger than a typical small popover (see .queuePopover
// CSS) so it's comfortable to edit on the fly mid-draft — option B of a few
// layouts mocked up and picked directly, then asked to be roomier.
function renderSleeperQueuePopover() {
  const panel = $("sleeperQueuePopover");
  if (!sleeperQueueKeys.length) {
    panel.innerHTML = `<div class="queueHeader">Sleeper queue</div><div class="queueEmpty">Empty — use the queue button on any player row to add one.</div>`;
    return;
  }
  const allRows = buildConsensus(activeSources(sources, soloSource), merges);
  const byKey = new Map(allRows.map((r) => [r.key, r]));
  const last = sleeperQueueKeys.length - 1;
  const rowsHtml = sleeperQueueKeys.map((key, i) => {
    const r = byKey.get(key);
    const name = r ? r.name : key.split("|")[0];
    const pos = r ? r.pos : key.split("|")[1] || "";
    return `<div class="queueRow" draggable="true" data-key="${esc(key)}">
      <span class="queueDrag" aria-hidden="true">⠿</span>
      <span class="queueMoveBtns">
        <button class="queueMoveBtn" data-key="${esc(key)}" data-dir="up" aria-label="Move ${esc(name)} up" data-tip="Move up"${i === 0 ? " disabled" : ""}>${ico("chevron-up", { size: 12 })}</button>
        <button class="queueMoveBtn" data-key="${esc(key)}" data-dir="down" aria-label="Move ${esc(name)} down" data-tip="Move down"${i === last ? " disabled" : ""}>${ico("chevron-down", { size: 12 })}</button>
      </span>
      <span class="queueNum">${i + 1}</span>
      <span class="queueName">${esc(name)}</span>
      ${posBadgeHtml(pos, null, "sm")}
      <button class="queueDraftBtn" data-key="${esc(key)}" aria-label="Draft ${esc(name)} on Sleeper" data-tip="${draftTipText()}">${ico("circle-check", { size: 15 })}</button>
      <button class="queueRemoveBtn" data-key="${esc(key)}" aria-label="Remove ${esc(name)} from queue" data-tip="Remove">${ico("circle-x", { size: 15 })}</button>
    </div>`;
  }).join("");
  panel.innerHTML = `<div class="queueHeader">Sleeper queue (${sleeperQueueKeys.length})</div><div class="queueList">${rowsHtml}</div>`;
}

function closeSleeperQueuePopover() {
  $("sleeperQueuePopover").hidden = true;
  document.removeEventListener("click", onSleeperQueuePopoverOutsideClick, true);
}
// CAPTURE phase, not bubble — deliberate, and the fix for a real bug: a
// remove/reorder click inside the popover synchronously re-renders the
// popover's innerHTML (see applySleeperQueueChange), which detaches the
// clicked button from the DOM (its parentNode chain gets severed) before a
// bubble-phase document listener would ever see it. A detached node's
// closest() can't find an ancestor it no longer has, so the click reads as
// "outside" and the popover closes — self-inflicted every time. Listening
// on the CAPTURE phase runs this check before the popover's own bubble-phase
// click handler has a chance to mutate anything, so e.target is still
// exactly where the user actually clicked. Also excludes the draft confirm
// modal — clicking Draft/Cancel there is a later, genuinely separate click,
// but it's still part of the same queue-editing flow and shouldn't close
// the popover out from under you. Same reasoning for the board's own
// row-level queue/draft buttons and the Best Available cards' mini
// buttons — queueing a player FROM the board while watching the queue
// popover build up is the actual point of leaving it open, not an edge
// case to special-case around.
function onSleeperQueuePopoverOutsideClick(e) {
  if (
    e.target.closest("#sleeperQueuePopover") ||
    e.target.closest("#sleeperQueueBtn") ||
    e.target.closest("#draftConfirmModal") ||
    e.target.closest(".rowQueueBtn") ||
    e.target.closest(".rowDraftBtn") ||
    e.target.closest(".bestActionBtn")
  ) return;
  closeSleeperQueuePopover();
}
// Same above/below-the-button flip-and-clamp positioning as openStatPicker —
// see its comment for why a flat "always open below" doesn't work near the
// bottom of the window.
function openSleeperQueuePopover() {
  renderSleeperQueuePopover();
  const panel = $("sleeperQueuePopover");
  const btn = $("sleeperQueueBtn");
  panel.hidden = false;
  panel.style.top = "";
  panel.style.bottom = "";
  panel.style.maxHeight = "";
  const r = btn.getBoundingClientRect();
  const w = panel.offsetWidth;
  panel.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - w - 4))}px`;
  const margin = 8;
  const spaceBelow = window.innerHeight - r.bottom - margin;
  const spaceAbove = r.top - margin;
  if (spaceBelow >= spaceAbove) {
    panel.style.top = `${r.bottom + 6}px`;
    panel.style.maxHeight = `${Math.max(120, spaceBelow - 6)}px`;
  } else {
    panel.style.bottom = `${window.innerHeight - r.top + 6}px`;
    panel.style.maxHeight = `${Math.max(120, spaceAbove - 6)}px`;
  }
  setTimeout(() => document.addEventListener("click", onSleeperQueuePopoverOutsideClick, true), 0);
}
$("sleeperQueueBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!$("sleeperQueuePopover").hidden) { closeSleeperQueuePopover(); return; }
  openSleeperQueuePopover();
});

// Drag-and-drop reordering — delegated on the popover container (attached
// once, survives renderSleeperQueuePopover rebuilding the rows' innerHTML)
// rather than per-row, same pattern as the board's click delegation above.
let queueDragKey = null;
$("sleeperQueuePopover").addEventListener("dragstart", (e) => {
  const row = e.target.closest(".queueRow");
  if (!row) return;
  queueDragKey = row.dataset.key;
  row.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
});
$("sleeperQueuePopover").addEventListener("dragend", (e) => {
  const row = e.target.closest(".queueRow");
  if (row) row.classList.remove("dragging");
  $("sleeperQueuePopover").querySelectorAll(".queueRow.dragOver").forEach((el) => el.classList.remove("dragOver"));
  queueDragKey = null;
});
$("sleeperQueuePopover").addEventListener("dragover", (e) => {
  const row = e.target.closest(".queueRow");
  if (!row || !queueDragKey || row.dataset.key === queueDragKey) return;
  e.preventDefault(); // required for drop to fire at all
  $("sleeperQueuePopover").querySelectorAll(".queueRow.dragOver").forEach((el) => el.classList.remove("dragOver"));
  row.classList.add("dragOver");
});
$("sleeperQueuePopover").addEventListener("drop", (e) => {
  const row = e.target.closest(".queueRow");
  if (!row || !queueDragKey || row.dataset.key === queueDragKey) return;
  e.preventDefault();
  reorderSleeperQueue(queueDragKey, row.dataset.key);
});
// Shared handlers for the queue/draft mini-buttons on both Best Available
// widgets (#best quad grid, #bestPicks top-3 cards) — same bestActionsHtml
// markup, same two actions, just two different containers to delegate from.
// Draft respects the double-click-to-draft setting, same as everywhere else
// this feature added it — queue stays single-click always (reversible,
// low-stakes, not tied to that setting).
function handleBestActionClick(e) {
  const btn = e.target.closest(".bestActionBtn");
  if (!btn) return;
  e.stopPropagation();
  const name = btn.closest(".quadCell, .bestCard2")?.querySelector("strong")?.textContent || "Player";
  if (btn.dataset.action === "draft") {
    if (!sleeperDoubleClickDraft) draftOnSleeper(btn.dataset.key, name);
    return; // when the setting's on, the dblclick handler owns this one
  }
  toggleSleeperQueue(btn.dataset.key, name);
}
function handleBestActionDblClick(e) {
  if (!sleeperDoubleClickDraft) return;
  const btn = e.target.closest(".bestActionBtn[data-action=draft]");
  if (!btn) return;
  const name = btn.closest(".quadCell, .bestCard2")?.querySelector("strong")?.textContent || "Player";
  draftOnSleeper(btn.dataset.key, name);
}
$("best").addEventListener("click", handleBestActionClick);
$("bestPicks").addEventListener("click", handleBestActionClick);
$("best").addEventListener("dblclick", handleBestActionDblClick);
$("bestPicks").addEventListener("dblclick", handleBestActionDblClick);

// Draft respects the double-click-to-draft setting here too (see the board
// row's dblclick listener for the shared reasoning) — single click drafts
// directly when it's off, does nothing when it's on.
$("sleeperQueuePopover").addEventListener("click", (e) => {
  const draftBtn = e.target.closest(".queueDraftBtn");
  if (draftBtn) {
    e.stopPropagation();
    if (!sleeperDoubleClickDraft) {
      const row = draftBtn.closest(".queueRow");
      draftOnSleeper(draftBtn.dataset.key, row?.querySelector(".queueName")?.textContent || "Player");
    }
    return;
  }
  const moveBtn = e.target.closest(".queueMoveBtn");
  if (moveBtn) {
    moveSleeperQueueItem(moveBtn.dataset.key, moveBtn.dataset.dir);
    return;
  }
  const removeBtn = e.target.closest(".queueRemoveBtn");
  if (removeBtn) {
    const row = removeBtn.closest(".queueRow");
    removeFromSleeperQueue(removeBtn.dataset.key, row?.querySelector(".queueName")?.textContent || "Player");
  }
});
$("sleeperQueuePopover").addEventListener("dblclick", (e) => {
  if (!sleeperDoubleClickDraft) return;
  const draftBtn = e.target.closest(".queueDraftBtn");
  if (!draftBtn) return;
  const row = draftBtn.closest(".queueRow");
  draftOnSleeper(draftBtn.dataset.key, row?.querySelector(".queueName")?.textContent || "Player");
});

// Themed replacement for window.confirm(), specifically so it can carry a
// "don't show this again" checkbox — a native confirm() has no way to do
// that. Persisted, but scoped to the CURRENT draft, not forever — stores the
// draftId that was last acknowledged, and only skips when currentDraftId
// still matches it. A brand new draft (a new draftId) means the checkbox's
// acknowledgment no longer applies, so the warning shows once again there —
// deliberate: "don't show this again" for a single irreversible-pick action
// shouldn't quietly carry over to a completely different draft days later.
// This is purely a UX acknowledgment, not a security boundary — nothing
// sensitive about it, unlike the token, which stays session-only.
const K_SLEEPER_SKIP_CONFIRM = "sleeperSkipDraftConfirmDraftId";
let sleeperSkipDraftConfirmDraftId = null;
function confirmDraftOnSleeper(name) {
  if (sleeperSkipDraftConfirmDraftId && sleeperSkipDraftConfirmDraftId === currentDraftId) return Promise.resolve(true);
  return new Promise((resolve) => {
    const overlay = $("draftConfirmModal");
    $("draftConfirmBody").textContent = `Draft ${name} on Sleeper right now? This actually makes the pick — there's no undo.`;
    $("draftConfirmSkip").checked = false;
    overlay.hidden = false;
    const cleanup = (result) => {
      overlay.hidden = true;
      $("draftConfirmOk").removeEventListener("click", onOk);
      $("draftConfirmCancel").removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlayClick);
      resolve(result);
    };
    const onOk = () => {
      if ($("draftConfirmSkip").checked) {
        sleeperSkipDraftConfirmDraftId = currentDraftId;
        chrome.storage.local.set({ [K_SLEEPER_SKIP_CONFIRM]: currentDraftId });
      }
      cleanup(true);
    };
    const onCancel = () => cleanup(false);
    const onOverlayClick = (e) => { if (e.target === overlay) cleanup(false); };
    $("draftConfirmOk").addEventListener("click", onOk);
    $("draftConfirmCancel").addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlayClick);
  });
}

async function draftOnSleeper(key, name) {
  if (!sleeperWriteReady()) { toast("Turn on Draft actions and paste your Sleeper token first.", true); return; }
  if (!currentDraftId || currentPickNo == null) { toast("Sync a draft first.", true); return; }
  const playerId = sleeperIds[key];
  if (!playerId) { toast("No Sleeper player ID matched for this player.", true); return; }
  // Irreversible in a real league draft — the one write action here that
  // gets a confirm gate (skippable via the modal's checkbox above). Queueing
  // doesn't need one (freely reversible, low-stakes); this does.
  const ok = await confirmDraftOnSleeper(name);
  if (!ok) return;
  try {
    // Timed so we can actually see where the delay a user perceives between
    // clicking and the pick showing up on sleeper.com is coming from — our
    // own round-trip (tab injection + the fetch itself) vs. Sleeper's own
    // server-side processing/socket broadcast to their draft room UI, which
    // is outside anything this extension does. Logged, not just toasted, so
    // it's easy to eyeball a pattern across several picks.
    const t0 = performance.now();
    const res = await chrome.runtime.sendMessage({
      type: "sleeperDraftPlayer",
      payload: { draftId: currentDraftId, playerId, pickNo: currentPickNo, token: sleeperToken() },
    });
    const ms = Math.round(performance.now() - t0);
    console.debug(`[4th&Go] draft_pick_player round-trip: ${ms}ms`);
    if (!res || !res.ok) throw new Error((res && res.error) || "Unknown error");
    toast(`Drafted ${name} on Sleeper. (${ms}ms)`);
    // The actual pick shows up as "Yours" once the next poll syncs — no
    // local taken[] write here, so this can't drift from what Sleeper's
    // picks endpoint actually reports.
  } catch (e) {
    toast(`Couldn't draft ${name} on Sleeper: ${e.message}`, true);
  }
}

$("board").addEventListener("click", (e) => {
  const btn = e.target.closest(".rowFlagBtn");
  if (btn) {
    e.stopPropagation();
    const r = btn.getBoundingClientRect();
    openFlagMenu(r.left, r.bottom + 6, btn.dataset.key);
    return;
  }
  const queueBtn = e.target.closest(".rowQueueBtn");
  if (queueBtn) {
    e.stopPropagation();
    const row = queueBtn.closest(".row2");
    toggleSleeperQueue(queueBtn.dataset.key, row?.dataset.name || "Player");
    return;
  }
  // With double-click-to-draft ON (default), a single click here deliberately
  // does nothing — see the board's dblclick listener above, which is where
  // drafting actually fires. Still needs to stop here regardless of the
  // setting (not fall through to row selection below), otherwise each of
  // the two clicks that make up a double-click would also toggle the
  // stat-group selection on the way. With it OFF, single click drafts
  // directly.
  const rowDraftBtn = e.target.closest(".rowDraftBtn");
  if (rowDraftBtn) {
    e.stopPropagation();
    if (!sleeperDoubleClickDraft) {
      const row = rowDraftBtn.closest(".row2");
      draftOnSleeper(rowDraftBtn.dataset.key, row?.dataset.name || "Player");
    }
    return;
  }
  // A plain click (not the flag button, and short of the dblclick that
  // crosses a player off) selects that player — see selectedStatPlayerKey
  // above renderBoard for the select/deselect/switch rules. Re-slotting via
  // applyStatGroupOrder (not a full renderBoard) is what makes the reorder
  // actually slide: it updates the existing elements' transform in place
  // instead of replacing them with fresh ones that have no prior state to
  // animate from.
  const row = e.target.closest(".row2");
  if (!row) return;
  const key = row.dataset.key;
  if (selectedStatPlayerKey === key) {
    // clicking the already-selected row again: unselect, restore default order
    row.classList.remove("selected");
    selectedStatPlayerKey = null;
    selectedStatPos = null;
  } else {
    const prevRow = $("board").querySelector(".row2.selected");
    if (prevRow) prevRow.classList.remove("selected");
    row.classList.add("selected");
    selectedStatPlayerKey = key;
    selectedStatPos = key.split("|").pop();
  }
  applyStatGroupOrder(statGroupOrder(effectiveStatPos()), visibleStats);
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
$("settingsBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (isSettingsPanelOpen()) closeSettingsPanel(); else openSettingsPanel();
});
$("statusBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (isStatusPanelOpen()) closeStatusPanel(); else openStatusPanel();
});
$("themeToggleBtn").addEventListener("click", () => {
  const next = currentTheme === "light" ? "dark" : "light";
  applyTheme(next);
  chrome.storage.local.set({ [K_THEME]: next });
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

// Column sorting (feature 6) — click Rank/ADP Value/Pos to sort the board
// by that column instead of tier+rank. Click the SAME column again to flip
// direction; a third click (past desc) returns to the default tiered view,
// same cycle pattern as most spreadsheet UIs.
document.querySelectorAll("#colHead .sortCol").forEach((el) => {
  el.addEventListener("click", () => {
    const col = el.dataset.sort;
    if (sortColumn !== col) {
      sortColumn = col;
      sortDir = 1;
    } else if (sortDir === 1) {
      sortDir = -1;
    } else {
      sortColumn = null;
      sortDir = 1;
    }
    renderBoard();
  });
});

// ---------- EXPERIMENTAL: Sleeper draft-actions on/off toggle ----------
$("sleeperWriteToggle").addEventListener("click", () => {
  sleeperWriteEnabled = !sleeperWriteEnabled;
  chrome.storage.local.set({ [K_SLEEPER_WRITE_ENABLED]: sleeperWriteEnabled });
  $("sleeperWriteToggle").classList.toggle("on", sleeperWriteEnabled);
  $("sleeperWriteToggle").setAttribute("aria-checked", String(sleeperWriteEnabled));
  $("sleeperTokenField").style.display = sleeperWriteEnabled ? "" : "none";
  $("sleeperTestField").style.display = sleeperWriteEnabled ? "" : "none";
  $("sleeperDblClickField").style.display = sleeperWriteEnabled ? "" : "none";
  if (!sleeperWriteEnabled) closeSleeperQueuePopover(); // don't leave it open with a now-hidden trigger button
  renderAll(); // every queue/draft button (board rows + both Best widgets) needs to pick up/drop at once
});

$("sleeperDblClickToggle").addEventListener("click", () => {
  sleeperDoubleClickDraft = !sleeperDoubleClickDraft;
  chrome.storage.local.set({ [K_SLEEPER_DBLCLICK_DRAFT]: sleeperDoubleClickDraft });
  $("sleeperDblClickToggle").classList.toggle("on", sleeperDoubleClickDraft);
  $("sleeperDblClickToggle").setAttribute("aria-checked", String(sleeperDoubleClickDraft));
  renderAll(); // draft buttons' tooltip text (draftTipText()) depends on this
});

// Click-to-open instructions popover for the Sleeper token field — same
// floating-box pattern as the stat header tooltip (see showStatTooltip
// above), but click-triggered since this is a short numbered list someone
// needs a moment to read, not a glance-and-gone label.
let sleeperInfoEl = null;
function closeSleeperInfo() {
  if (sleeperInfoEl) { sleeperInfoEl.remove(); sleeperInfoEl = null; }
  document.removeEventListener("click", onSleeperInfoOutsideClick);
}
function onSleeperInfoOutsideClick(e) {
  if (!e.target.closest(".infoPopover") && !e.target.closest("#sleeperTokenInfo")) closeSleeperInfo();
}
$("sleeperTokenInfo").addEventListener("click", (e) => {
  e.stopPropagation();
  if (sleeperInfoEl) { closeSleeperInfo(); return; }
  const el = document.createElement("div");
  el.className = "infoPopover";
  el.innerHTML = `<b>Getting your Sleeper token</b>
    <ol>
      <li>Open a Sleeper <b>mock draft</b> in its own browser tab (sleeper.com — NOT this extension's board window), then DevTools → Network</li>
      <li>Filter by "graphql", then do anything on the mock draft page (reload, or click a player's star)</li>
      <li>Click any graphql request → Headers → find "authorization"</li>
      <li>Copy that value and paste it here</li>
    </ol>`;
  document.body.appendChild(el);
  const r = $("sleeperTokenInfo").getBoundingClientRect();
  const w = el.offsetWidth;
  el.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - w - 6))}px`;
  el.style.top = `${r.bottom + 6}px`;
  sleeperInfoEl = el;
  setTimeout(() => document.addEventListener("click", onSleeperInfoOutsideClick), 0);
});

// ---------- init: restore settings, then load the curated sources ----------
(async function init() {
  $("settingsBtn").innerHTML = ico("settings", { size: 15 });
  $("statusBtn").innerHTML = ico("activity", { size: 15 });
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
  playerStats = await loadPlayerStats();
  visibleStats = await loadStatPrefs();
  sleeperIds = await loadSleeperIdMap();
  const qv = await chrome.storage.local.get([K_SLEEPER_QUEUE, K_SLEEPER_WRITE_ENABLED, K_SLEEPER_SKIP_CONFIRM, K_SLEEPER_DBLCLICK_DRAFT]);
  sleeperQueueKeys = qv[K_SLEEPER_QUEUE] || [];
  sleeperWriteEnabled = !!qv[K_SLEEPER_WRITE_ENABLED];
  sleeperSkipDraftConfirmDraftId = qv[K_SLEEPER_SKIP_CONFIRM] || null;
  sleeperDoubleClickDraft = qv[K_SLEEPER_DBLCLICK_DRAFT] !== false; // defaults true — only an explicit false turns it off
  $("sleeperWriteToggle").classList.toggle("on", sleeperWriteEnabled);
  $("sleeperWriteToggle").setAttribute("aria-checked", String(sleeperWriteEnabled));
  $("sleeperTokenField").style.display = sleeperWriteEnabled ? "" : "none";
  $("sleeperTestField").style.display = sleeperWriteEnabled ? "" : "none";
  $("sleeperDblClickField").style.display = sleeperWriteEnabled ? "" : "none";
  $("sleeperDblClickToggle").classList.toggle("on", sleeperDoubleClickDraft);
  $("sleeperDblClickToggle").setAttribute("aria-checked", String(sleeperDoubleClickDraft));

  const tv = await chrome.storage.local.get([K_THEME]);
  applyTheme(tv[K_THEME] || "dark");

  // Settings start open so first-run has the draft ID box visible.
  openSettingsPanel();
  renderAll();

  // Silent background refresh, same pattern as ADP — don't block first
  // render on a network round trip, just re-render once fresh data lands.
  autoRefreshProjections().then((map) => {
    if (map) { projMap = map; renderAll(); }
  });
  // Refresh Sleeper Live ADP + the stat columns every time the board window
  // opens, not just when someone hits the manual buttons in the Rankings
  // Manager — the board is the surface actually used mid-draft, and
  // day-of-draft ADP/usage data is stale by the time someone remembers to
  // click a button in a separate tab. Fire-and-forget: the board already
  // rendered above with whatever was last saved, and storage.onChanged
  // (below) re-renders once fresh data lands, so a slow/failed fetch never
  // blocks opening the window. autoRefreshAdpAndStats (shared.js) logs
  // failures rather than toasting — this runs on every open, and a quiet log
  // is enough since the manual buttons still work and report loudly if the
  // user goes looking.
  autoRefreshAdpAndStats();
})();

// ---------- feature 2: keyboard shortcuts (cmd+k, /, ?) ----------
document.addEventListener("keydown", (e) => {
  if (e.target === $("playerSearch")) return; // don't trigger shortcuts while typing in search
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    $("playerSearch").focus();
  } else if (e.key === "/" && !(e.target.tagName === "INPUT")) {
    e.preventDefault();
    $("playerSearch").focus();
  } else if (e.key === "?") {
    e.preventDefault();
    const modal = $("shortcutsModal");
    modal.classList.toggle("open");
  }
});
$("shortcutsModal").addEventListener("click", (e) => {
  if (e.target === $("shortcutsModal")) $("shortcutsModal").classList.remove("open");
});

// ---------- feature 3: tier collapse toggle ----------
// Collapsing a tier only hides THAT tier's own rows — bug fixed 2026-08-25:
// the original CSS used a general sibling selector
// (".tierDiv.collapsed ~ .row2[data-tier-group]") which matches EVERY row
// after the collapsed header, not just that tier's, so collapsing tier 1
// visually swallowed tiers 2/3/4/etc too. That CSS rule is gone entirely —
// visibility is set directly per-row here instead, scoped to the exact
// tier via data-tier-group, which is the only thing that was ever correct.
document.addEventListener("click", (e) => {
  const tierDiv = e.target.closest(".tierDiv");
  if (!tierDiv) return;
  e.preventDefault();
  const tierNum = tierDiv.dataset.tier;
  if (tierNum == null) return;
  const collapsed = tierDiv.classList.toggle("collapsed");
  document.querySelectorAll(`.row2[data-tier-group="${CSS.escape(tierNum)}"]`).forEach((row) => {
    row.style.display = collapsed ? "none" : "";
  });
});

// ---------- feature 4: draft turn indicator ----------
// Renders into the .turnBadge pill inline in .statusRow (not a standalone
// block elsewhere in the header) — see panel.html for why: a separate block
// wasn't aligned with the status line above it and read as too easy to
// miss. "now" gets the pulsing accent treatment; "soon" (within 2 picks)
// gets a static accent tint; anything further out stays neutral so it
// doesn't compete for attention all draft long.
function renderDraftTurnIndicator() {
  const badge = $("draftTurnBadge");
  if (!currentDraftId || !myRosterId) {
    badge.style.display = "none";
    return;
  }
  const picks = lastSharedPicks || [];
  const teams = LEAGUE_SETTINGS.teams;
  const roundNum = Math.floor(picks.length / teams) + 1;
  const picksThisRound = picks.length % teams;
  const mySlot = Number(myRosterId);
  const picksUntilMine = (mySlot - picksThisRound - 1 + teams) % teams;
  const minsUntilMine = Math.ceil((picksUntilMine * 90) / 60); // rough 90s/pick estimate

  const text = picksUntilMine === 0
    ? `Your turn! (Round ${roundNum})`
    : `Your turn in ${picksUntilMine} pick${picksUntilMine === 1 ? "" : "s"} (~${minsUntilMine}m)`;

  badge.textContent = text;
  badge.style.display = "";
  badge.classList.toggle("now", picksUntilMine === 0);
  badge.classList.toggle("soon", picksUntilMine > 0 && picksUntilMine <= 2);
}

// update on every render
const origRenderBoard = renderBoard;
window.renderBoard = function() {
  const result = origRenderBoard.apply(this, arguments);
  renderDraftTurnIndicator();
  return result;
};

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
  "minimize-2": `<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>`,
  "mail": `<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>`,
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

// POS_V2/posTint/initials/avatarHtml moved to shared.js (Rankings Creator
// needs the same headshot/team-logo rendering the board already built —
// see shared.js for the full reasoning comment, unchanged from here).

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

// ---------- K/DST support (added 2026-08-26) ----------
// includeKdst is the master on/off (default true — see K_INCLUDE_KDST in
// shared.js); includeKdstInBestPicks is the narrower opt-in for letting them
// into the Best Picks Right Now widget specifically (default false — never
// reach for a kicker/defense, per claude.md). Both loaded at init() and kept
// in sync via the storage listener below, same pattern as every other
// board-window setting.
let includeKdst = true;
let includeKdstInBestPicks = false;

// ---------- Queue/Roster pop-out windows (added 2026-08-25) ----------
// "Pop out" on the Roster/Queue dropdown opens that SAME popover in its own
// small chrome.windows.create popup — deliberately just this page again
// (panel.html?popout=roster|queue), not a new HTML file. Reusing this file
// means the popout gets the exact same rendering code, the exact same live
// Sleeper poll, and the exact same storage listeners as the main board for
// free — a second hand-written implementation of "render my roster" would
// be exactly the kind of drift this project's claude.md repeatedly warns
// about (see avatarHtml/injuryBadge/etc's "one function, called from
// everywhere" precedent). popoutView is null in the normal board window.
const popoutView = new URLSearchParams(location.search).get("popout"); // "roster" | "queue" | null
const K_POPOUT_WINDOWS = "popoutWindowIds"; // chrome.storage.session — { roster: windowId, queue: windowId }

// EXPERIMENTAL (queue/draft-write branch) — see background.js's "Sleeper
// WRITE actions" section for the actual mechanism (script injection into
// your own open Sleeper tab, no token ever stored here).
let sleeperIds = {}; // playerKey -> Sleeper's own numeric player_id, loaded from K_SLEEPER_IDS
let injuries = {}; // playerKey -> {status,bodyPart,updatedAt}, loaded from K_INJURIES — see injuryBadge() in shared.js
let injuriesUpdatedAt = null; // when K_INJURIES was last written — surfaced in the status dropdown, see renderStatusPanel

// This draft's own roster shape, straight from Sleeper — GET /v1/draft/{id}
// returns a `settings` object with real per-position slot counts (slots_qb,
// slots_rb, slots_wr, slots_te, slots_k, slots_def, slots_flex, slots_bn,
// teams, ...), the exact template Sleeper itself pre-builds your roster
// board from once a draft starts. Sizes the Team/Roster dropdown's slot list
// (see buildMyRosterSlots) — a real league's bench depth/flex count varies
// (this session's own league needed 15 total roster spots, not the previous
// flat 6-bench guess), so pulling it from the actual draft beats a
// hardcoded constant. Also feeds LEAGUE_SETTINGS/BEER's replacement-level
// math now (K/DST support, 2026-08-26 — see applySyncedLeagueSettings in
// shared.js and claude.md's "League shape sync" section); that used to be a
// deliberately-fixed representation of just this one league's shape, kept
// separate from this — no longer true.
//
// Persisted to K_DRAFT_SETTINGS (chrome.storage), not just held in memory —
// a real bug, found live-testing a 12-team/3-flex mock draft: a popped-out
// Roster window runs its own separate copy of this whole script (see
// "Queue/Roster pop-out windows" above) and NEVER calls poll()/
// fetchDraftSettings itself (only the main window polls, by design), so its
// own draftSettings/LEAGUE_SETTINGS stayed at the hardcoded 10-team/2-flex
// default forever — a real league's extra FLEX slot (and whoever was
// drafted into it) simply never had a slot to appear in over there, even
// though the main window had already synced correctly. Same fix pattern as
// K_DRAFT/K_SLEEPER_QUEUE above: the main window writes it once fetched,
// every window (including itself) picks it up via the storage.onChanged
// listener below, and init() loads whatever was last persisted for THIS
// draftId before the first fetch ever resolves. K_DRAFT_SETTINGS itself
// lives in shared.js (not here) — rankings-manager.js reads it too, to keep
// its own scoring-format sync consistent with whatever the board synced.
let draftSettings = null;
let draftSettingsForId = null; // which draftId draftSettings was fetched for — refetch only on change, not every ~3s poll tick
// Also reads `data.metadata.scoring_type` off the same response — Sleeper's
// own record of whether this draft is PPR/Half-PPR/Standard (confirmed live:
// `"std"` on a real Standard-scoring test draft) — the other half of
// "scoring format" sync (see shared.js), fed from the exact same call
// already used for league-shape sync, no second fetch.
async function fetchDraftSettings(draftId) {
  const res = await fetch(`https://api.sleeper.app/v1/draft/${draftId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return {
    settings: (data && data.settings) || null,
    scoringType: (data && data.metadata && data.metadata.scoring_type) || null,
    // draft_slot (the column position on Sleeper's own draft board, what the
    // "your draft slot" setting actually asks for) and roster_id (the
    // permanent per-team identity picks are actually tagged with) are two
    // INDEPENDENT numbering spaces — slot 3 on the board is not necessarily
    // roster_id 3. Sleeper's own draft object carries the real mapping
    // between them (`slot_to_roster_id`), fetched here alongside settings/
    // scoring so there's still only one call. See myRosterIdResolved()'s
    // comment below for why this was a real bug found live.
    slotToRoster: (data && data.slot_to_roster_id) || null,
  };
}
// Real bug found live: myRosterId is what the user enters ("your draft slot"),
// but picks are matched by roster_id, and those two numbers are not the same
// thing — a user in draft slot 3 is not necessarily roster_id 3, so directly
// comparing pk.roster_id to myRosterId could (and did) land on a totally
// unrelated team's roster whenever the two numbering spaces happened to
// diverge. This resolves the user's entered slot to its REAL roster_id via
// Sleeper's own slot_to_roster_id mapping (fetched in fetchDraftSettings)
// whenever that mapping is available; falls back to treating myRosterId as
// a roster_id directly (the old behavior) when the mapping hasn't loaded yet
// or the draft doesn't expose it (some mock drafts) — never worse than
// before, just correct once the real mapping is known.
let draftSlotToRoster = null; // {"<slot>": rosterId, ...} — keys are strings, values are numbers, straight from Sleeper
function myRosterIdResolved() {
  if (myRosterId == null) return null;
  if (draftSlotToRoster && draftSlotToRoster[String(myRosterId)] != null) {
    return Number(draftSlotToRoster[String(myRosterId)]);
  }
  return myRosterId;
}
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

// ---------- Rage bait mode (for fun only, see claude.md) ----------
// An auxiliary of Draft actions, not a standalone feature — gated the same
// way sleeperDblClickField is (only visible/meaningful once sleeperWriteEnabled
// is true; also independently re-checked at fire time via sleeperWriteReady()
// so flipping Draft actions off mid-draft can't leave a stray timer still
// sending messages).
let rageBaitEnabled = false;
let rageBaitMessages = []; // falls back to DEFAULT_RAGE_BAIT_MESSAGES (shared.js) when empty
function currentRageBaitMessages() {
  return rageBaitMessages.length ? rageBaitMessages : DEFAULT_RAGE_BAIT_MESSAGES;
}
// Random pick-count threshold — reset after every fire so the next one lands
// a fresh random gap later, not on a fixed cadence (a fixed N would get
// obvious/annoying fast; that's the whole point of "every once in a random
// few picks" from the original ask). The gap itself defaults to 10-13 picks
// but is user-adjustable (K_RAGEBAIT_MIN_GAP/K_RAGEBAIT_MAX_GAP, editable in
// the Manage popover) — rageBaitMinGap/rageBaitMaxGap hold whatever's
// currently set, loaded at init and updated live from the popover's inputs.
let rageBaitNextAt = null;
let rageBaitMinGap = RAGEBAIT_MIN_GAP_DEFAULT;
let rageBaitMaxGap = RAGEBAIT_MAX_GAP_DEFAULT;
function rageBaitRandomGap() {
  const lo = Math.max(1, rageBaitMinGap || RAGEBAIT_MIN_GAP_DEFAULT);
  const hi = Math.max(lo, rageBaitMaxGap || RAGEBAIT_MAX_GAP_DEFAULT);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
// Session-only (not persisted) — tracks whether the Test button has fired at
// least once THIS window session, so the very first test always says
// "Hello, everyone!" (per spec) and every one after is a random pick from
// the list. Resetting on window reopen is fine — there's no real state to
// preserve here, it's just picking which message a click sends.
let rageBaitTested = false;

async function sendRageBaitMessage(message) {
  if (!sleeperWriteReady()) { toast("Turn on Draft actions and paste your Sleeper token first.", true); return false; }
  if (!currentDraftId) { toast("Sync a draft first.", true); return false; }
  try {
    const res = await chrome.runtime.sendMessage({
      type: "sleeperSendChatMessage",
      payload: { draftId: currentDraftId, message, token: sleeperToken() },
    });
    if (!res || !res.ok) throw new Error((res && res.error) || "Unknown error");
    return true;
  } catch (e) {
    toast(`Rage bait message failed: ${e.message}`, true);
    return false;
  }
}

// Called from poll() whenever new picks land — see the hook there. Fires at
// most once per crossing of a random threshold, never on every poll tick.
// `newestWasMine` guards a real ask: never let a rage bait message land right
// after the user's own pick — reads as mocking your own pick, not your
// leaguemates'. Skipping here (rather than re-rolling the threshold) just
// defers to the next new pick that isn't yours — the threshold itself is
// left untouched, so the fire isn't delayed any further than that one pick.
function maybeFireRageBait(newPickTotal, newestWasMine) {
  if (!rageBaitEnabled || !sleeperWriteReady() || !currentDraftId) return;
  if (rageBaitNextAt == null) { rageBaitNextAt = newPickTotal + rageBaitRandomGap(); return; }
  if (newPickTotal < rageBaitNextAt) return;
  if (newestWasMine) return; // try again on the next new pick instead
  rageBaitNextAt = newPickTotal + rageBaitRandomGap();
  const pool = currentRageBaitMessages();
  const message = pool[Math.floor(Math.random() * pool.length)];
  sendRageBaitMessage(message).then((ok) => { if (ok) console.debug(`[4th&Go] rage bait sent: "${message}"`); });
}
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
  // Same staleness threshold/coloring as the ranking/ADP sources above —
  // this is Sleeper's own injury_status data, not a user-imported source, so
  // it doesn't belong in that list, but "how old is what I'm looking at"
  // is the exact same question a mid-draft glance needs answered here too.
  const injStale = injuriesUpdatedAt && (Date.now() - injuriesUpdatedAt) > SOURCE_STALE_MS;
  const injRow = `<div class="statusSrcRow"><span class="nm">Sleeper injury data</span><span class="age${injStale ? " stale" : ""}">${esc(timeAgoLabel(injuriesUpdatedAt))}</span></div>`;
  // Scoring format — every BEER value/projection/ADP number in this app
  // depends on this being right, so it's worth its own glance-able line
  // rather than being buried in Settings. Labels the SOURCE (synced vs.
  // manually forced) so a stale/wrong sync is obvious, not silent.
  const SCORING_FORMAT_LABELS = { ppr: "PPR", half_ppr: "Half-PPR", std: "Standard" };
  const scoringLabel = SCORING_FORMAT_LABELS[SCORING_FORMAT] || SCORING_FORMAT;
  // Three real states, not two — "synced from draft" is a claim that should
  // only be made once a real sync (or a restore of one) has actually
  // happened; before that, SCORING_FORMAT is just the untouched default.
  const scoringSource = SCORING_FORMAT_OVERRIDE
    ? "manually forced"
    : SCORING_FORMAT_EVER_SYNCED ? "synced from draft" : "default, not yet synced";
  const scoringRow = `<div class="statusSrcRow"><span class="nm">Scoring format</span><span class="age">${esc(scoringLabel)} (${esc(scoringSource)})</span></div>`;
  $("statusPanel").innerHTML = `
    <div class="statusSectionLabel">Sleeper sync</div>
    ${syncLine}
    <div class="statusSectionLabel">Source freshness</div>
    ${rows}
    <div class="statusSectionLabel">Injury status</div>
    ${injRow}
    <div class="statusSectionLabel">Scoring</div>
    ${scoringRow}`;
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
// as FLEX_SHARE/GAMES_PLAYED_CURVE — revisit if it feels off in practice.
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
  // CORE_POSITIONS, not POSITIONS — this grid stays QB/RB/WR/TE only, by
  // explicit decision (see claude.md's K/DST section): K/DEF never get a
  // "best pick" crown here, since real draft strategy says never reach for
  // one early and this grid's whole job is spotlighting the best value pick.
  CORE_POSITIONS.forEach((pos) => { myCounts[pos] = 0; });
  lastSharedPicks.forEach((p) => { if (p.byMe && myCounts[p.pos] !== undefined) myCounts[p.pos]++; });
  const best = {};
  CORE_POSITIONS.forEach((pos) => {
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
    CORE_POSITIONS.forEach((pos) => {
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
  $("best").innerHTML = CORE_POSITIONS.map((pos) => {
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
        ${p ? avatarHtml(p.key, p.name, p.pos, p.team, "sm", sleeperIds) : ""}
        <strong>${p ? esc(p.name) : "—"}</strong>
        ${p ? injuryBadge(injuries[p.key]) : ""}
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
  if (selectedStatPos && CORE_POSITIONS.includes(selectedStatPos)) return selectedStatPos;
  return CORE_POSITIONS.includes(posFilter) ? posFilter : null;
}

// The definitive gate for "is K/DST actually showing right now" — applied to
// consensus rows before they reach the board, Best Picks, or team counts, so
// turning the master toggle off hides K/DEF everywhere those come from
// regardless of whether a K/DEF ranking source happens to still be enabled
// in storage.
function filterActivePositions(rows) {
  return includeKdst ? rows : rows.filter((r) => CORE_POSITIONS.includes(r.pos));
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
  // Stat-column sorting is only offered when the board is filtered to a
  // single QB/RB/WR/TE position — not ALL, not any multi-position filter —
  // since a stat sort only makes sense when every visible row actually has
  // that stat (see renderStatHeaderGroups in shared.js for the full reasoning).
  const sortablePos = CORE_POSITIONS.includes(posFilter) ? posFilter : null;
  $("statHead").innerHTML = renderStatHeaderGroups(groupOrder, visibleStats, { sortablePos, sortColumn, sortDir });
  $("statHead").style.width = `${statBlockWidth}px`;
  document.querySelectorAll("#colHead .sortCol").forEach((el) => {
    const active = el.dataset.sort === sortColumn;
    el.classList.toggle("active", active);
    el.querySelector(".sortArrow").textContent = active ? (sortDir === 1 ? "▲" : "▼") : "";
  });
  // includeKdst off means K/DEF are gone from the available-player board
  // entirely, even if a K/DEF ranking source happens to still be enabled in
  // storage (e.g. the auto-generated one, turned off but never deleted) —
  // the toggle is the definitive gate, not just "does a source exist."
  const allRows = filterActivePositions(buildConsensus(activeSources(sources, soloSource), merges));
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
            ${injuryBadge(injuries[r.key])}
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
      if (sortColumn.startsWith("stat:")) {
        const [, , statId] = sortColumn.split(":");
        const opt = playerStats[r.key]?.options?.[statId];
        return opt && typeof opt.value === "number" ? opt.value : null;
      }
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
function renderTeamCountsV2(el, { picks = [], myRosterId = null, beerValues = new Map(), posRankValues = null } = {}) {
  if (myRosterId == null) {
    el.innerHTML = `<span class="teamHint">Set your draft slot # in settings to track your own roster.</span>`;
    return;
  }
  const mine = picks.filter((p) => p.byMe);
  const myTeamId = mine.find((p) => p.rosterId != null)?.rosterId;
  // posRankValues (buildPositionRankValueMap's output — beerValues with DEF's
  // BEER-less keys substituted by raw projected points) drives the PER-
  // POSITION rank badges below; the plain beerValues map (DEF simply absent)
  // still drives the overall "Tot" grade further down, so DEF's raw points
  // never get mixed into that total-BEER-value sum. Falls back to beerValues
  // itself if a caller doesn't pass one (keeps this function usable without
  // DEF-awareness if ever called from somewhere that hasn't computed it).
  const ranks = myTeamId != null ? buildTeamPositionRanks(picks, posRankValues || beerValues) : {};
  const myRanks = myTeamId != null ? ranks[myTeamId] : null;
  const tones = { QB: "accent", RB: "positive", WR: "info", TE: "warning", K: "k", DEF: "def" };
  const counts = activePositions(includeKdst).map((pos) => {
    const n = mine.filter((p) => p.pos === pos).length;
    const r = myRanks && myRanks[pos];
    const tone = tones[pos];
    // Only shows once this team has actually drafted someone at the
    // position — a rank of "1st of 10" with zero players would be
    // meaningless noise (everyone with 0 total ties for 1st), so it falls
    // back to a plain badge (no rank strip at all) until then.
    if (!r || n === 0) return badgeHtml(tone, `${pos} ${n}`);
    const { bg, fg } = rankColor(r.rank, r.of);
    // DEF's rank here comes from summed projected points, not BEER value
    // (see buildPositionRankValueMap in shared.js) — the tooltip says so
    // rather than silently reusing the "by BEER value" wording every other
    // position gets, since it really is a different metric.
    const metricLabel = pos === "DEF" ? "projected points" : "BEER value";
    return `<span class="posRankPill t-${tone}" title="${esc(pos)} ranks ${esc(ordinal(r.rank))} of ${r.of} in the league by ${metricLabel}">
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

// ---------- Team/Roster dropdown ----------
// Read-only "what does my whole team look like" popover — same floating-
// panel mechanics as the Sleeper queue popover (openSleeperQueuePopover
// above), but always visible (not gated behind Draft actions) and with no
// drag/draft/remove actions on any row, since this is roster review, not
// queue editing.

// Fallback only — used before a draft's real settings have come back from
// fetchDraftSettings (or if that fetch ever fails), same spirit as
// TEAM_TARGET_SLOTS/FLEX_SHARE above. Once synced, the actual bench size
// comes straight from Sleeper's own draft settings (slots_bn) instead —
// see rosterSlotCount below. Real leagues vary (this one needed 7 bench
// slots for a 15-man roster, not this guessed 6), which is exactly why it's
// only a pre-sync placeholder now, not the source of truth.
const ROSTER_BENCH_SLOTS = 6;

// Builds the ordered lineup-slot list for "my" team: starters first (in
// POSITIONS order — QB, RB, RB, WR, WR, TE), then FLEX, then bench — each
// slot either holding a drafted pick or null (still open). Starters and
// FLEX are filled by draft order (earliest pick_no first) among eligible
// players at that slot, not by BEER value — simplest rule, and the one that
// matches "one continuous list" reading as draft order within each slot
// tier. Revisit if roster-value-aware FLEX assignment is wanted instead.
// Real per-position slot count for this draft when Sleeper's settings have
// come back (see fetchDraftSettings above); falls back to this league's
// documented shape (LEAGUE_SETTINGS) / the ROSTER_BENCH_SLOTS guess before
// that resolves, or if Sleeper's response is ever missing a field.
function rosterSlotCount(settingsKey, fallback) {
  const v = draftSettings && draftSettings[settingsKey];
  return Number.isFinite(v) ? v : fallback;
}

function buildMyRosterSlots() {
  const starters = {
    QB: rosterSlotCount("slots_qb", LEAGUE_SETTINGS.starters.QB),
    RB: rosterSlotCount("slots_rb", LEAGUE_SETTINGS.starters.RB),
    WR: rosterSlotCount("slots_wr", LEAGUE_SETTINGS.starters.WR),
    TE: rosterSlotCount("slots_te", LEAGUE_SETTINGS.starters.TE),
    K: rosterSlotCount("slots_k", LEAGUE_SETTINGS.starters.K),
    // DEF isn't part of LEAGUE_SETTINGS.starters (BEER's replacement-level
    // math never uses it — see shared.js), but the roster popover still
    // needs SOME starter-slot guess before a real draft's settings sync in —
    // 1 is the standard-league default, same spirit as ROSTER_BENCH_SLOTS.
    DEF: rosterSlotCount("slots_def", 1),
  };
  const flexSlots = rosterSlotCount("slots_flex", LEAGUE_SETTINGS.flexSlots);
  const benchSlots = rosterSlotCount("slots_bn", ROSTER_BENCH_SLOTS);

  const mine = lastSharedPicks.filter((p) => p.byMe).slice().sort((a, b) => (a.pickNo || 0) - (b.pickNo || 0));
  const used = new Set();
  const slots = [];
  // activePositions, not POSITIONS — with K/DST turned off, the roster
  // popover should show exactly the starter slots it always has (this is the
  // one behavior a user turning the master toggle off should get back
  // byte-for-byte).
  activePositions(includeKdst).forEach((pos) => {
    const need = starters[pos] || 0;
    const atPos = mine.filter((p) => p.pos === pos && !used.has(p));
    for (let i = 0; i < need; i++) {
      const p = atPos[i];
      if (p) used.add(p);
      slots.push({ slotLabel: pos, pick: p || null });
    }
  });
  const flexEligible = mine.filter((p) => ["RB", "WR", "TE"].includes(p.pos) && !used.has(p));
  for (let i = 0; i < flexSlots; i++) {
    const p = flexEligible[i];
    if (p) used.add(p);
    slots.push({ slotLabel: "FLEX", pick: p || null });
  }
  const bench = mine.filter((p) => !used.has(p));
  bench.forEach((p) => slots.push({ slotLabel: "BN", pick: p }));
  const openBench = Math.max(0, benchSlots - bench.length);
  for (let i = 0; i < openBench; i++) slots.push({ slotLabel: "BN", pick: null });
  return slots;
}

// pickNo is Sleeper's overall pick number — converted to round.pick for
// display (e.g. pick 51 in a 10-team league -> "6.01"/"R6 P01") since that's
// how a draft actually gets talked about, not the raw overall count.
function formatDraftPick(pickNo) {
  if (pickNo == null) return null;
  const teams = LEAGUE_SETTINGS.teams;
  const round = Math.floor((pickNo - 1) / teams) + 1;
  const inRound = ((pickNo - 1) % teams) + 1;
  return { label: `${round}.${String(inRound).padStart(2, "0")}` };
}

// ---------- Queue/Roster pop-out windows ----------
// Small header button, included in both renderRosterPopover's and
// renderSleeperQueuePopover's markup — a pop-out (external-link) icon in the
// normal board window, a collapse (minimize-2) icon when this IS that
// popout window (popoutView matches). Delegated click handling (below)
// covers both, since these buttons live inside innerHTML that gets rebuilt
// on every render.
function popoutToggleBtnHtml(view) {
  if (popoutView === view) {
    return `<button type="button" class="iconBtn2 popoutBtn" data-popout-collapse aria-label="Collapse back into the board window" data-tip="Collapse back into the board window">${ico("minimize-2", { size: 13 })}</button>`;
  }
  return `<button type="button" class="iconBtn2 popoutBtn" data-popout-open="${view}" aria-label="Pop out into its own window" data-tip="Pop out into its own window">${ico("external-link", { size: 13 })}</button>`;
}

// Called from the MAIN board window only (popoutView is null there) — opens
// or focuses that view's popout window, reusing this same page with
// ?popout=roster|queue. Window ids live in chrome.storage.session (K_POPOUT_
// WINDOWS), same pattern background.js already uses for the main board
// window itself (K_WINDOW_ID) — session-scoped since a window id from a
// previous browser session is meaningless.
async function openPopoutWindow(view) {
  const { [K_POPOUT_WINDOWS]: ids0 } = await chrome.storage.session.get([K_POPOUT_WINDOWS]);
  const ids = ids0 || {};
  if (ids[view]) {
    try {
      await chrome.windows.update(ids[view], { focused: true });
      return;
    } catch (e) {
      // Stale id (window closed without background.js catching it, or a
      // service-worker restart lost the cleanup) — fall through and open a
      // fresh one instead of silently doing nothing.
    }
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(`panel.html?popout=${view}`),
    type: "popup",
    width: 380,
    height: 640,
  });
  ids[view] = win.id;
  await chrome.storage.session.set({ [K_POPOUT_WINDOWS]: ids });
}

// Main-window-only: hides a chip button the instant its popout is open
// elsewhere (so there's never two live copies of the same widget visible at
// once — the same reasoning the single-board-window architecture already
// applies to the whole app, see claude.md's "Window architecture"), and
// force-closes the local floating popover if it happened to be open when
// the popout appeared. Restores both the moment the popout window closes.
// Tracked as module-level state (not just "set display:none once") because
// renderRosterBtn()/renderSleeperQueueBtn() unconditionally reset their
// button's display on every call (queueing a player, a live pick landing,
// etc. — see their own comments) — without consulting these flags, the very
// next such render would silently undo the hide and show a button whose
// popover is live in another window.
let rosterPoppedOut = false;
let queuePoppedOut = false;
function applyPopoutButtonVisibility(ids) {
  rosterPoppedOut = !!(ids && ids.roster);
  queuePoppedOut = !!(ids && ids.queue);
  $("rosterBtn").style.display = rosterPoppedOut ? "none" : "";
  if (rosterPoppedOut && !$("rosterPopover").hidden) closeRosterPopover();
  renderSleeperQueueBtn(); // re-applies sleeperWriteEnabled gating AND the popout hide together, see its own guard
  if (queuePoppedOut && !$("sleeperQueuePopover").hidden) closeSleeperQueuePopover();
}

// Runs once, at load, ONLY inside a popout window (popoutView is set). Forces
// that view's popover permanently open and full-window (see .popoutRoot CSS
// in panel.html) instead of a floating dropdown, and hides the rest of the
// board's UI — settings, filters, the tiered board itself — via the
// body[data-popout] CSS rule. Deliberately does NOT call openRosterPopover()/
// openSleeperQueuePopover() (their floating-position math and outside-click-
// to-close listener are meaningless when the popover IS the whole window and
// never closes on its own) — just renders directly into the existing element
// and leaves it unhidden for good. Every other renderXPopover() call site
// already guards on "!panel.hidden" before re-rendering, so leaving it
// permanently unhidden is also what keeps this window's content live as
// picks/roster/queue change — no separate popout-specific refresh path needed.
function initPopoutMode() {
  document.body.dataset.popout = popoutView;
  if (popoutView === "roster") {
    renderRosterPopover();
    $("rosterPopover").hidden = false;
  } else if (popoutView === "queue") {
    renderSleeperQueuePopover();
    $("sleeperQueuePopover").hidden = false;
  }
}

// ---------- Popped-out queue's Sleeper-write relay (added 2026-08-25) ----------
// Draft/queue actions from the popped-out Queue window were silently
// failing ("Turn on Draft actions and paste your Sleeper token first.")
// even with write mode on and a token pasted — because they WERE, just in
// the MAIN window. The Sleeper token is deliberately session-memory only,
// living in the #sleeperToken input's value and never written to
// chrome.storage (see sleeperToken() below) — a real security choice, not
// an oversight, so a popout window's own copy of that field is always
// empty. currentDraftId/currentPickNo are similarly main-window-only: they
// only get set by startPolling(), and only the main window ever polls (see
// claude.md's "Window architecture" — one window polls, by design). Rather
// than duplicate the token/poll into every popout (defeating the point of
// keeping it out of storage, and doubling Sleeper requests), a popout
// relays the actual privileged call to the main window via
// chrome.runtime.sendMessage, which the main window executes with ITS OWN
// token/draftId/pickNo and reports back. draftOnSleeper/applySleeperQueueChange
// below call this only when popoutView is set; the main window's own calls
// are unchanged (still direct, no relay round-trip added to the common
// case).
async function execViaMainWindow(relayType, payload) {
  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: "popoutSleeperRelay", relayType, payload });
  } catch (e) {
    throw new Error("No response from the main board window — is it still open?");
  }
  if (!res) throw new Error("No response from the main board window — is it still open?");
  if (!res.ok) throw new Error(res.error || "Unknown error");
  return res.data;
}
// Registered ONLY in the main window (popoutView null) — a popout window
// has nothing to relay TO itself. Executes with this window's own live
// sleeperWriteReady()/currentDraftId/currentPickNo/sleeperToken(), exactly
// the same checks and calls draftOnSleeper/applySleeperQueueChange already
// make locally when not popped out.
if (!popoutView) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "popoutSleeperRelay") return;
    (async () => {
      try {
        if (!sleeperWriteReady()) throw new Error("Turn on Draft actions and paste your Sleeper token first.");
        if (!currentDraftId) throw new Error("Sync a draft first.");
        if (msg.relayType === "draftPlayer") {
          if (currentPickNo == null) throw new Error("Sync a draft first.");
          const res = await chrome.runtime.sendMessage({
            type: "sleeperDraftPlayer",
            payload: { draftId: currentDraftId, playerId: msg.payload.playerId, pickNo: currentPickNo, token: sleeperToken() },
          });
          if (!res || !res.ok) throw new Error((res && res.error) || "Unknown error");
          sendResponse({ ok: true, data: res.data });
        } else if (msg.relayType === "updateQueue") {
          const res = await chrome.runtime.sendMessage({
            type: "sleeperUpdateDraftQueue",
            payload: { draftId: currentDraftId, playerIds: msg.payload.playerIds, token: sleeperToken() },
          });
          if (!res || !res.ok) throw new Error((res && res.error) || "Unknown error");
          sendResponse({ ok: true, data: res.data });
        } else {
          sendResponse({ ok: false, error: "Unknown relay action." });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true; // keep the message channel open for the async sendResponse above
  });
}
document.addEventListener("click", (e) => {
  const openBtn = e.target.closest("[data-popout-open]");
  if (openBtn) {
    openPopoutWindow(openBtn.dataset.popoutOpen);
    if (openBtn.dataset.popoutOpen === "roster") closeRosterPopover();
    else closeSleeperQueuePopover();
    return;
  }
  if (e.target.closest("[data-popout-collapse]")) {
    window.close();
  }
});

function renderRosterBtn() {
  const n = lastSharedPicks.filter((p) => p.byMe).length;
  $("rosterBtn").textContent = `Roster (${n}) ▾`;
  $("rosterBtn").style.display = rosterPoppedOut ? "none" : "";
  if (!$("rosterPopover").hidden) renderRosterPopover();
}

// byKey lookup gives team abbreviation (not carried on the pick record
// itself, see poll() — only name/pos/pickNo/byMe/rosterId are) from
// whatever the current blended consensus rows already have.
function renderRosterPopover() {
  const panel = $("rosterPopover");
  if (myRosterId == null) {
    panel.innerHTML = `<div class="rosterEmptyMsg">Set your draft slot # in settings to track your own roster.</div>`;
    return;
  }
  // Full enabled-source blend — same rows Best Picks' own posRanks tags
  // (computePosRanks, "RB6"/"WR12") are built from, so a player's position
  // rank reads identically here and there. Deliberately NOT solo-filtered,
  // matching renderRecommendations' own reasoning for the same call.
  const blendRows = buildConsensus(sources.filter((s) => s.enabled), merges);
  const byKey = new Map(blendRows.map((r) => [r.key, r]));
  const posRanks = computePosRanks(blendRows);
  const mine = lastSharedPicks.filter((p) => p.byMe);
  const myTeamId = mine.find((p) => p.rosterId != null)?.rosterId;
  const { values: beerValues } = buildBeerValues(blendRows, projMap, takenKeySet());
  // Same DEF-uses-projected-points substitution as renderTeamCountsV2's
  // per-position badges — see buildPositionRankValueMap (shared.js).
  const posRankValues = buildPositionRankValueMap(blendRows, beerValues, projMap);
  const ranks = myTeamId != null ? buildTeamPositionRanks(lastSharedPicks, posRankValues) : {};
  const myRanks = myTeamId != null ? ranks[myTeamId] : null;

  const summaryHtml = activePositions(includeKdst).map((pos) => {
    const t = posTint(pos);
    const r = myRanks && myRanks[pos];
    const n = mine.filter((p) => p.pos === pos).length;
    const rankHtml = r && n > 0
      ? (() => { const { bg, fg } = rankColor(r.rank, r.of); return `<span class="rosterRankTag" style="background:${bg};color:${fg}">${esc(ordinal(r.rank).toUpperCase())}</span>`; })()
      : `<span class="rosterRankTag" style="color:var(--text-disabled)">—</span>`;
    return `<div class="sItem"><div class="sPos" style="color:${t.fg}">${esc(pos)}</div>${rankHtml}</div>`;
  }).join("");

  const slots = buildMyRosterSlots();
  const slotChipHtml = (slotLabel) => (slotLabel === "BN" ? badgeHtml("neutral", "BN") : posBadgeHtml(slotLabel, null, "sm"));
  const rowsHtml = slots.map(({ slotLabel, pick }) => {
    if (!pick) {
      return `<div class="rosterRow empty">
        ${slotChipHtml(slotLabel)}
        <span class="avatarCircle dashed">—</span>
        <div><div class="rosterName" style="color:var(--text-disabled)">Open</div></div>
        <div class="rosterPick dim">—</div>
      </div>`;
    }
    const row = byKey.get(pick.key);
    const team = row && row.team ? row.team : "";
    const dp = formatDraftPick(pick.pickNo);
    const dim = slotLabel === "BN" ? " dim" : "";
    // Position-rank tag ("WR 49") in place of a round/pick explainer — this
    // is what actually answers "did I get my RB2 and RB5, or my WR10 and
    // WR15", which the pick number alone can't.
    const pr = posRanks.get(pick.key);
    const prHtml = pr != null ? `<span class="rd">${esc(pick.pos)} ${pr}</span>` : "";
    return `<div class="rosterRow">
      ${slotChipHtml(slotLabel)}
      ${avatarHtml(pick.key, pick.name, pick.pos, team, "", sleeperIds)}
      <div><div class="rosterNameRow"><span class="rosterName">${esc(pick.name)}</span>${injuryBadge(injuries[pick.key])}</div><div class="rosterMeta">${esc(pick.pos)}${team ? " · " + esc(team) : ""}</div></div>
      <div class="rosterPick${dim}">${dp ? `${dp.label}${prHtml}` : "—"}</div>
    </div>`;
  }).join("");

  panel.innerHTML = `
    <div class="queueHeader">My roster (${mine.length}) · slot ${esc(myRosterId)} ${popoutToggleBtnHtml("roster")}</div>
    <div class="rosterSummary">${summaryHtml}</div>
    <div class="rosterList">${rowsHtml}</div>`;
}

function closeRosterPopover() {
  if (popoutView === "roster") return; // this IS the roster's own window — it never self-hides
  $("rosterPopover").hidden = true;
  document.removeEventListener("click", onRosterPopoverOutsideClick, true);
}
function onRosterPopoverOutsideClick(e) {
  if (e.target.closest("#rosterPopover") || e.target.closest("#rosterBtn")) return;
  closeRosterPopover();
}
// Same flip-above/below-and-clamp positioning as the Sleeper queue popover
// (openSleeperQueuePopover above) — see its comment for why a flat
// "always open below" breaks near the bottom of the window.
function openRosterPopover() {
  renderRosterPopover();
  const panel = $("rosterPopover");
  const btn = $("rosterBtn");
  panel.hidden = false;
  panel.style.top = "";
  panel.style.bottom = "";
  panel.style.maxHeight = "";
  const r = btn.getBoundingClientRect();
  const w = panel.offsetWidth;
  panel.style.left = `${Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4))}px`;
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
  setTimeout(() => document.addEventListener("click", onRosterPopoverOutsideClick, true), 0);
}
$("rosterBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!$("rosterPopover").hidden) { closeRosterPopover(); return; }
  openRosterPopover();
});

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
          ${avatarHtml(r.key, r.name, r.pos, r.team, "lg", sleeperIds)}
          ${ico("star", { size: 14, color: isFav ? "var(--accent)" : "var(--text-disabled)" })}
          <strong>${esc(r.name)}</strong>
          ${injuryBadge(injuries[r.key])}
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
  const consensusRows = filterActivePositions(buildConsensus(sources.filter((s) => s.enabled), merges));
  const takenSet = takenKeySet();
  // Same values feed both the team-rank chips below and buildBeerValues
  // callers elsewhere — one computation per render, not per widget.
  const { values: beerValues } = buildBeerValues(consensusRows, projMap, takenSet);
  // DEF has no real BEER value (see buildBeerValues) — this substitutes
  // summed projected points for DEF specifically, ONLY for the per-position
  // league-rank badge (buildTeamPositionRanks inside renderTeamCountsV2).
  // beerValues itself (unmodified, DEF absent) still drives the "Tot" overall
  // grade — see buildPositionRankValueMap's own comment for why the two must
  // stay separate.
  const posRankValues = buildPositionRankValueMap(consensusRows, beerValues, projMap);
  renderTeamCountsV2($("teamCounts"), { picks: lastSharedPicks, myRosterId, beerValues, posRankValues });
  renderSourceListV2($("sourceList"), {
    sources,
    soloSource,
    onSolo: (id) => { soloSource = id; renderAll(); },
  });
  let bestPicksRows = posFilter === "ALL" ? consensusRows : consensusRows.filter((r) => filterMatchesPos(r.pos, posFilter));
  // Best Picks Right Now defaults to never recommending a kicker/defense —
  // real draft strategy says don't reach for one, and surfacing it here
  // would actively encourage that. includeKdstInBestPicks (default false) is
  // the explicit opt-in for anyone who wants them considered anyway.
  if (!includeKdstInBestPicks) bestPicksRows = bestPicksRows.filter((r) => r.pos !== "K" && r.pos !== "DEF");
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
    renderRosterBtn();
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
  // Session-scoped: which Roster/Queue pop-out windows are currently open
  // (see "Queue/Roster pop-out windows" above). Only the MAIN board window
  // acts on this — a popout window ignores it, it only cares about its own
  // view. Lets the main window hide a button (and force-close its own local
  // popover) the instant its pop-out opens elsewhere, and restore it the
  // instant that window closes, without any direct window-to-window messaging.
  if (area === "session") {
    if (!popoutView && changes[K_POPOUT_WINDOWS]) {
      applyPopoutButtonVisibility(changes[K_POPOUT_WINDOWS].newValue || {});
    }
    return;
  }
  if (area !== "local") return;
  if (changes[K_DRAFT] && !echo.isEcho(K_DRAFT)) {
    const v = changes[K_DRAFT].newValue;
    if (v) {
      applyManualKeysFromStorage(v.manualKeys);
      // Picks themselves (not just manualKeys) only matter to sync here now
      // that a Roster pop-out window can exist — it never polls Sleeper
      // itself (see "Queue/Roster pop-out windows" above), it relies
      // entirely on the main board window's poll() writing K_DRAFT here.
      // Harmless no-op for the main window itself: its own writes are
      // always echo-guarded above, so this only ever fires for a genuinely
      // external change.
      if (Array.isArray(v.picks)) {
        lastSharedPicks = v.picks;
        renderRosterBtn(); // also re-renders the popover if it's open — see its own guard
      }
    }
  }
  // Queue pop-out window support, same reasoning as the picks sync just
  // above — the popped-out queue window needs to see additions/removals/
  // reorders made from the main board's row buttons, and vice versa.
  if (changes[K_SLEEPER_QUEUE] && !echo.isEcho(K_SLEEPER_QUEUE)) {
    sleeperQueueKeys = changes[K_SLEEPER_QUEUE].newValue || [];
    renderSleeperQueueBtn(); // also re-renders the popover if it's open — see its own guard
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
  if (changes[K_INJURIES]) {
    injuries = await loadInjuries();
    injuriesUpdatedAt = changes[K_INJURIES].newValue?.updatedAt || null;
    renderAll();
  }
  // Only meaningfully changed from THIS window's own Settings panel, but a
  // popout window (which hides its own Settings UI) still needs to pick up
  // the change to render its roster/queue consistently with the main window.
  if (changes[K_INCLUDE_KDST]) {
    includeKdst = changes[K_INCLUDE_KDST].newValue !== false;
    $("includeKdstToggle").classList.toggle("on", includeKdst);
    $("includeKdstToggle").setAttribute("aria-checked", String(includeKdst));
    $("includeKdstBestPicksField").style.display = includeKdst ? "" : "none";
    applyKdstFilterVisibility();
    renderAll();
  }
  if (changes[K_INCLUDE_KDST_BEST_PICKS]) {
    includeKdstInBestPicks = !!changes[K_INCLUDE_KDST_BEST_PICKS].newValue;
    $("includeKdstBestPicksToggle").classList.toggle("on", includeKdstInBestPicks);
    $("includeKdstBestPicksToggle").setAttribute("aria-checked", String(includeKdstInBestPicks));
    renderRecommendations();
  }
  if (changes[K_SCORING_FORMAT_OVERRIDE]) {
    const prevFormat = SCORING_FORMAT;
    const val = changes[K_SCORING_FORMAT_OVERRIDE].newValue;
    setScoringFormatOverride(val);
    $("scoringFormatSelect").value = SCORING_FORMAT_OVERRIDE || "";
    if (SCORING_FORMAT !== prevFormat) {
      renderStatusPanel();
      autoRefreshAdpAndStats();
      autoRefreshProjections().then((map) => { if (map) { projMap = map; renderAll(); } });
    }
  }
  // Only the main window ever WRITES this (see poll()'s fetchDraftSettings
  // callback), but every window — including a popped-out Roster window,
  // which never polls Sleeper itself — needs to pick it up to get the real
  // per-draft slot counts (was previously stuck on the hardcoded default
  // forever in a popout; see K_DRAFT_SETTINGS's own comment above).
  if (changes[K_DRAFT_SETTINGS]) {
    const v = changes[K_DRAFT_SETTINGS].newValue;
    if (v) {
      if (v.settings) {
        draftSettings = v.settings;
        draftSettingsForId = v.draftId;
        applySyncedLeagueSettings(v.settings);
      }
      if (v.slotToRoster) draftSlotToRoster = v.slotToRoster;
      // Same "did this actually change anything" check as poll()'s own
      // callback — in the main window this mostly re-applies what its own
      // write already set directly (harmless, idempotent); in a popped-out
      // window this is the ONLY way it ever learns the real scoring format,
      // same reasoning as league shape above.
      const prevFormat = SCORING_FORMAT;
      applySyncedScoringFormat(v.scoringType);
      if (SCORING_FORMAT !== prevFormat) {
        renderStatusPanel();
        autoRefreshAdpAndStats();
        autoRefreshProjections().then((map) => { if (map) { projMap = map; renderAll(); } });
      }
      renderRosterBtn();
      renderAll();
    }
  }
});

// ---------- Sleeper sync ----------
function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function poll(draftId, { manual = false } = {}) {
  if (inFlight) return; // never stack requests
  inFlight = true;
  // Fire-and-forget, once per draftId (not every ~3s poll tick) — a
  // separate, cheap endpoint from the picks poll above, so it doesn't block
  // or throttle that loop. Silent on failure, same pattern as every other
  // auto-refresh in this app: the roster popover just keeps using whatever
  // slot counts it already had (the ROSTER_BENCH_SLOTS guess, or a
  // previous draft's settings) until this resolves.
  //
  // `|| manual` — a real league's settings changing MID-DRAFT (someone edits
  // Sleeper's draft settings after the room's already open) is a genuinely
  // rare scenario, not worth polling for on every tick — but it should be
  // recoverable without reconnecting entirely. The existing "Refresh now"
  // button (already the answer to "I think something's stale, force a
  // fresh pull") now also forces a fresh settings pull, not just picks.
  if (manual || draftSettingsForId !== draftId) {
    draftSettingsForId = draftId;
    fetchDraftSettings(draftId)
      .then(({ settings: s, scoringType, slotToRoster }) => {
        draftSlotToRoster = slotToRoster;
        if (s) {
          draftSettings = s;
          // League-shape sync (K/DST support) — makes BEER's replacement-
          // level math reflect THIS draft's real team count/starter slots
          // instead of staying hardcoded to this project's own league. Only
          // overwrites LEAGUE_SETTINGS fields Sleeper actually provided a
          // finite number for (see applySyncedLeagueSettings, shared.js);
          // everything else keeps whatever it already had.
          applySyncedLeagueSettings(s);
        }
        // Scoring format sync — separate from the settings-object check
        // above since a draft could plausibly expose one without the other.
        // If this actually CHANGES the effective format (not just confirms
        // what was already active), every points/ADP-based fetch that
        // already ran was computed off the wrong field — re-run them now
        // rather than leaving stale PPR-based numbers up until the next
        // window reopen.
        const prevFormat = SCORING_FORMAT;
        applySyncedScoringFormat(scoringType);
        const formatChanged = SCORING_FORMAT !== prevFormat;
        if (formatChanged) {
          renderStatusPanel();
          autoRefreshAdpAndStats();
          autoRefreshProjections().then((map) => { if (map) { projMap = map; renderAll(); } });
        }
        if (s || formatChanged || slotToRoster) {
          // Relay to any popped-out Roster window (and this window's own
          // next reload) — see K_DRAFT_SETTINGS's comment above for why this
          // can't just stay in memory.
          chrome.storage.local.set({ [K_DRAFT_SETTINGS]: { draftId, settings: s, scoringType, slotToRoster } });
          renderRosterBtn();
          renderAll(); // BEER values/replacement ranks everywhere just changed
        }
        // slotToRoster just resolved (or changed) — the picks already
        // processed by THIS poll() call may have matched "mine" using the
        // old fallback (raw myRosterId treated as a roster_id), which is
        // exactly the bug this was built to fix. Re-poll picks immediately
        // rather than waiting for the next ~3s tick, so the roster popover/
        // board correct themselves right away instead of looking broken for
        // a few more seconds.
        if (slotToRoster && myRosterId != null) poll(draftId);
      })
      .catch((e) => console.warn("[4th&Go] draft settings fetch failed:", e.message));
  }
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
    // Picks dropped for not being an active position — normally means K/DST
    // with the master toggle off (see includeKdst), but ALL of them means
    // wrong sport (see wrongSport below).
    let skippedPos = 0;
    const activePos = activePositions(includeKdst);
    picks.forEach((pk) => {
      const md = pk.metadata || {};
      const first = md.first_name || "";
      const last = md.last_name || "";
      const pos = (md.position || "").toUpperCase();
      if (!first && !last) return;
      if (!activePos.includes(pos)) { skippedPos++; return; }
      // A pick is "mine" if its roster_id matches what the user entered —
      // roster_id is Sleeper's permanent, non-reused team identity, so it's
      // authoritative whenever present. draft_slot is only used as a
      // fallback for drafts where roster_id is genuinely absent (some mock
      // drafts don't populate it) — NOT as an additional OR check, which was
      // a real bug: draft_slot can coincidentally equal a different team's
      // roster_id-based myRosterId value, and once that happens even once,
      // every one of THAT team's picks (and, cumulatively round after
      // round, other teams too) gets misattributed as "mine" — a real user
      // hit this live: their entire draft's picks ended up on their own
      // roster, and rage bait (which refuses to fire right after "your own"
      // pick) stopped firing at all as a direct symptom of the same bug.
      const pickRosterId = pk.roster_id != null ? Number(pk.roster_id) : null;
      const resolvedMine = myRosterIdResolved();
      const mine =
        resolvedMine !== null &&
        (pickRosterId != null ? pickRosterId === resolvedMine : Number(pk.draft_slot) === myRosterId);
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
        // Same roster_id-first rule as the main "mine" check above — must
        // stay consistent with it, or this "was that my own pick" guard
        // could disagree with what the board/roster popover just decided.
        const newestRosterId = newest.roster_id != null ? Number(newest.roster_id) : null;
        const resolvedMineNewest = myRosterIdResolved();
        const newestWasMine =
          resolvedMineNewest !== null &&
          (newestRosterId != null ? newestRosterId === resolvedMineNewest : Number(newest.draft_slot) === myRosterId);
        maybeFireRageBait(picks.length, newestWasMine);
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
      msg = `${picks.length} picks synced, but none are ${activePos.join("/")} — is this an NFL draft? Check the draft ID.`;
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
  // Connecting to a genuinely different draft than last time — reset the
  // scoring-format sync state so a stale confirmation from the PREVIOUS
  // draft can't leak into this one (and misreport itself as "synced") if
  // this new draft's object happens not to expose scoring_type at all. The
  // very next poll() will re-sync for real regardless (draftSettingsForId
  // already won't match), this just closes the gap in between.
  if (currentDraftId !== draftId) resetSyncedScoringFormat();
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
  // CORE_POSITIONS, not POSITIONS — K/DEF have no STAT_OPTION_DEFS entries
  // (see claude.md's K/DST section) — nothing to pick for them.
  panel.innerHTML = CORE_POSITIONS.map((pos) => {
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
// echo-guarded (added alongside the Queue pop-out window) — with a second
// live window now possible (panel.html?popout=queue reading this same key,
// see the storage listener below), this write needs to be distinguishable
// from an external one the same way K_DRAFT/K_FLAGS/etc already are, so this
// window doesn't redundantly reprocess its own change.
function saveSleeperQueueKeys() {
  echo.write(K_SLEEPER_QUEUE, () => chrome.storage.local.set({ [K_SLEEPER_QUEUE]: sleeperQueueKeys }));
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
  // A popout window can't check its own sleeperWriteReady()/currentDraftId —
  // both are meaningless there (see the relay comment above) — so those
  // checks happen in the MAIN window's relay handler instead when popped
  // out; only guard locally in the normal (non-popout) case.
  if (!popoutView) {
    if (!sleeperWriteReady()) { toast("Turn on Draft actions and paste your Sleeper token first.", true); return; }
    if (!currentDraftId) { toast("Sync a draft first.", true); return; }
  }
  const prev = sleeperQueueKeys;
  sleeperQueueKeys = newKeys;
  saveSleeperQueueKeys();
  renderAll();
  const playerIds = sleeperQueueKeys.map((k) => sleeperIds[k]).filter(Boolean);
  try {
    const t0 = performance.now(); // see draftOnSleeper's identical timing note
    if (popoutView) {
      await execViaMainWindow("updateQueue", { playerIds });
    } else {
      const res = await chrome.runtime.sendMessage({
        type: "sleeperUpdateDraftQueue",
        payload: { draftId: currentDraftId, playerIds, token: sleeperToken() },
      });
      if (!res || !res.ok) throw new Error((res && res.error) || "Unknown error");
    }
    const ms = Math.round(performance.now() - t0);
    console.debug(`[4th&Go] update_draft_queue round-trip: ${ms}ms`);
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
  btn.style.display = queuePoppedOut ? "none" : "";
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
    panel.innerHTML = `<div class="queueHeader">Sleeper queue ${popoutToggleBtnHtml("queue")}</div><div class="queueEmpty">Empty — use the queue button on any player row to add one.</div>`;
    return;
  }
  const allRows = buildConsensus(activeSources(sources, soloSource), merges);
  const byKey = new Map(allRows.map((r) => [r.key, r]));
  const last = sleeperQueueKeys.length - 1;
  const rowsHtml = sleeperQueueKeys.map((key, i) => {
    const r = byKey.get(key);
    const name = r ? r.name : key.split("|")[0];
    const pos = r ? r.pos : key.split("|")[1] || "";
    const team = r && r.team ? r.team : "";
    return `<div class="queueRow" draggable="true" data-key="${esc(key)}">
      <span class="queueDrag" aria-hidden="true">⠿</span>
      <span class="queueMoveBtns">
        <button class="queueMoveBtn" data-key="${esc(key)}" data-dir="up" aria-label="Move ${esc(name)} up" data-tip="Move up"${i === 0 ? " disabled" : ""}>${ico("chevron-up", { size: 12 })}</button>
        <button class="queueMoveBtn" data-key="${esc(key)}" data-dir="down" aria-label="Move ${esc(name)} down" data-tip="Move down"${i === last ? " disabled" : ""}>${ico("chevron-down", { size: 12 })}</button>
      </span>
      <span class="queueNum">${i + 1}</span>
      ${avatarHtml(key, name, pos, team, "sm", sleeperIds)}
      <span class="queueName">${esc(name)}</span>
      ${injuryBadge(injuries[key])}
      ${posBadgeHtml(pos, null, "sm")}
      <button class="queueDraftBtn" data-key="${esc(key)}" aria-label="Draft ${esc(name)} on Sleeper" data-tip="${draftTipText()}">${ico("circle-check", { size: 15 })}</button>
      <button class="queueRemoveBtn" data-key="${esc(key)}" aria-label="Remove ${esc(name)} from queue" data-tip="Remove">${ico("circle-x", { size: 15 })}</button>
    </div>`;
  }).join("");
  panel.innerHTML = `<div class="queueHeader">Sleeper queue (${sleeperQueueKeys.length}) ${popoutToggleBtnHtml("queue")}</div><div class="queueList">${rowsHtml}</div>`;
}

function closeSleeperQueuePopover() {
  if (popoutView === "queue") return; // this IS the queue's own window — it never self-hides
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
  const playerId = sleeperIds[key];
  if (!playerId) { toast("No Sleeper player ID matched for this player.", true); return; }
  // Same "these checks are meaningless in a popout window" reasoning as
  // applySleeperQueueChange above — the main window's relay handler makes
  // the equivalent checks with its own live state when popped out.
  if (!popoutView) {
    if (!sleeperWriteReady()) { toast("Turn on Draft actions and paste your Sleeper token first.", true); return; }
    if (!currentDraftId || currentPickNo == null) { toast("Sync a draft first.", true); return; }
  }
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
    if (popoutView) {
      await execViaMainWindow("draftPlayer", { playerId });
    } else {
      const res = await chrome.runtime.sendMessage({
        type: "sleeperDraftPlayer",
        payload: { draftId: currentDraftId, playerId, pickNo: currentPickNo, token: sleeperToken() },
      });
      if (!res || !res.ok) throw new Error((res && res.error) || "Unknown error");
    }
    const ms = Math.round(performance.now() - t0);
    console.debug(`[4th&Go] draft_pick_player round-trip: ${ms}ms`);
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
    // A stat-column sort only makes sense while filtered to the position it
    // belongs to (see renderStatHeaderGroups in shared.js) — switching to
    // ALL, a different position, or a multi-position filter clears it rather
    // than leaving a "phantom" active sort with no visible arrow anywhere.
    if (sortColumn && sortColumn.startsWith("stat:") && sortColumn.split(":")[1] !== posFilter) {
      sortColumn = null;
      sortDir = 1;
    }
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

// Stat-column sorting (positional filter only) — same cycle as the block
// above, but delegated on #statHead's parent since renderBoard() rebuilds
// the stat header's innerHTML on every render (a one-time queryAll like the
// block above would only ever bind to the FIRST render's elements).
$("statHead").addEventListener("click", (e) => {
  const el = e.target.closest(".statHeadCol.sortCol");
  if (!el) return;
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

// ---------- K/DST support settings ----------
// Hides the K/DEF position-filter buttons the instant the master toggle is
// off, and drops out of a now-hidden K/DEF filter back to ALL rather than
// leaving the board stuck on a filter with no visible button for it.
function applyKdstFilterVisibility() {
  document.querySelectorAll("[data-kdst]").forEach((btn) => { btn.style.display = includeKdst ? "" : "none"; });
  if (!includeKdst && (posFilter === "K" || posFilter === "DEF")) {
    document.querySelectorAll(".pf[data-pos]").forEach((b) => b.classList.toggle("active", b.dataset.pos === "ALL"));
    posFilter = "ALL";
  }
}
$("includeKdstToggle").addEventListener("click", () => {
  includeKdst = !includeKdst;
  saveIncludeKdst(includeKdst);
  $("includeKdstToggle").classList.toggle("on", includeKdst);
  $("includeKdstToggle").setAttribute("aria-checked", String(includeKdst));
  $("includeKdstBestPicksField").style.display = includeKdst ? "" : "none";
  applyKdstFilterVisibility();
  renderAll(); // team counts / roster slots / pick-sync allowlist all depend on this
});
$("includeKdstBestPicksToggle").addEventListener("click", () => {
  includeKdstInBestPicks = !includeKdstInBestPicks;
  saveIncludeKdstInBestPicks(includeKdstInBestPicks);
  $("includeKdstBestPicksToggle").classList.toggle("on", includeKdstInBestPicks);
  $("includeKdstBestPicksToggle").setAttribute("aria-checked", String(includeKdstInBestPicks));
  renderRecommendations();
});

// ---------- License status readout in Settings (added 2026-08-26) ----------
// Activation itself happens at the full-app lock screen (showLicenseLock,
// above) before init() ever gets this far — this field is just a status
// display + a way to deactivate/switch keys. Deactivating reloads immediately
// into the lock screen rather than leaving an unlicensed app running.
function renderLicenseStatus() {
  const status = $("licenseStatus");
  status.className = "testStatus ok";
  status.textContent = "License active.";
  $("licenseInput").value = "••••-••••-••••-••••";
  $("licenseInput").disabled = true;
}

$("licenseActivateBtn").addEventListener("click", async () => {
  await clearLicenseKey();
  location.reload();
});

// ---------- Send Feedback popover (added 2026-08-26, switched to Web3Forms
// 2026-08-27) ----------
// Drops down from the header's mail icon, no email client redirect. "Send"
// posts to Web3Forms (a free form-relay — no backend of our own), which
// forwards it to the developer's inbox. Only the message text + type + a
// little diagnostic info (+ any attached screenshots) leaves the browser —
// see PRIVACY.md for the disclosure this needs once that file exists.
//
// FormSubmit was tried first and rejected every real request with
// {"success":"false","message":"Make sure you open this page through a web
// server..."} — it hard-blocks any origin that isn't a real http(s) page,
// which a chrome-extension:// page can never be. Web3Forms is built for
// exactly this case (static sites/apps/extensions with non-standard
// origins) and has no such check.
//
// SETUP REQUIRED: get a free Access Key at web3forms.com (enter the
// destination email, they email you the key — it's a public key, safe to
// ship in client code, it only routes submissions to that inbox) and set
// WEB3FORMS_ACCESS_KEY below. Until that's set, sends will fail with a
// clear "not configured" status rather than silently no-opping.
const WEB3FORMS_ACCESS_KEY = "a0c9d9e3-e88f-4e01-add9-b2d55add4bfb";
const FEEDBACK_ENDPOINT = "https://api.web3forms.com/submit";
const FEEDBACK_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB/file — keep individual images reasonably small
const FEEDBACK_MAX_FILES = 3;
let feedbackType = "Bug";
let feedbackAttachments = []; // File objects picked via #feedbackFileInput

function renderFeedbackAttachments() {
  $("feedbackAttachCount").textContent = feedbackAttachments.length ? `${feedbackAttachments.length}/${FEEDBACK_MAX_FILES}` : "";
  $("feedbackAttachList").innerHTML = feedbackAttachments.map((f, i) => `
    <div class="fbAttachItem">
      <span class="fbAttachName">${esc(f.name)}</span>
      <span class="fbAttachRemove" data-idx="${i}">✕</span>
    </div>
  `).join("");
  $("feedbackAttachList").querySelectorAll(".fbAttachRemove").forEach(el => {
    el.addEventListener("click", () => {
      feedbackAttachments.splice(Number(el.dataset.idx), 1);
      renderFeedbackAttachments();
    });
  });
}
$("feedbackAttachBtn").addEventListener("click", () => $("feedbackFileInput").click());
$("feedbackFileInput").addEventListener("change", (e) => {
  const status = $("feedbackStatus");
  const picked = Array.from(e.target.files || []);
  for (const f of picked) {
    if (feedbackAttachments.length >= FEEDBACK_MAX_FILES) {
      status.className = "testStatus err";
      status.textContent = `Only up to ${FEEDBACK_MAX_FILES} images at a time.`;
      break;
    }
    if (f.size > FEEDBACK_MAX_FILE_BYTES) {
      status.className = "testStatus err";
      status.textContent = `${f.name} is too large (max 5MB).`;
      continue;
    }
    feedbackAttachments.push(f);
  }
  e.target.value = ""; // allow picking the same file again after removing it
  renderFeedbackAttachments();
});

function closeFeedbackPopover() {
  $("feedbackPopover").hidden = true;
  document.removeEventListener("click", onFeedbackPopoverOutsideClick, true);
}
function onFeedbackPopoverOutsideClick(e) {
  if (e.target.closest("#feedbackPopover") || e.target.closest("#sendFeedbackBtn")) return;
  closeFeedbackPopover();
}
function openFeedbackPopover() {
  $("feedbackStatus").className = "testStatus";
  $("feedbackStatus").textContent = "";
  feedbackAttachments = [];
  renderFeedbackAttachments();
  const panel = $("feedbackPopover");
  const btn = $("sendFeedbackBtn");
  panel.hidden = false;
  panel.style.top = "";
  panel.style.bottom = "";
  const r = btn.getBoundingClientRect();
  const w = panel.offsetWidth;
  panel.style.left = `${Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4))}px`;
  const margin = 8;
  const spaceBelow = window.innerHeight - r.bottom - margin;
  const spaceAbove = r.top - margin;
  if (spaceBelow >= spaceAbove) panel.style.top = `${r.bottom + 6}px`;
  else panel.style.bottom = `${window.innerHeight - r.top + 6}px`;
  setTimeout(() => document.addEventListener("click", onFeedbackPopoverOutsideClick, true), 0);
}
$("sendFeedbackBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!$("feedbackPopover").hidden) { closeFeedbackPopover(); return; }
  openFeedbackPopover();
});
$("feedbackPopoverClose").addEventListener("click", () => closeFeedbackPopover());

$("feedbackTypeRow").addEventListener("click", (e) => {
  const seg = e.target.closest(".seg");
  if (!seg) return;
  feedbackType = seg.dataset.type;
  $("feedbackTypeRow").querySelectorAll(".seg").forEach(s => s.classList.toggle("active", s === seg));
});

$("feedbackSendBtn").addEventListener("click", async () => {
  const status = $("feedbackStatus");
  const message = $("feedbackMessage").value.trim();
  if (!message) {
    status.className = "testStatus err";
    status.textContent = "Write a message first.";
    return;
  }
  if (!WEB3FORMS_ACCESS_KEY) {
    status.className = "testStatus err";
    status.textContent = "Feedback isn't configured yet — missing Web3Forms access key.";
    return;
  }
  status.className = "testStatus";
  status.textContent = "Sending...";
  $("feedbackSendBtn").disabled = true;
  try {
    // FormData (multipart) — required for the file attachments, and
    // Web3Forms accepts it the same as a plain HTML form post would.
    const form = new FormData();
    form.append("access_key", WEB3FORMS_ACCESS_KEY);
    form.append("subject", `4th&Go feedback: ${feedbackType}`);
    form.append("type", feedbackType);
    form.append("message", message);
    form.append("extensionVersion", chrome.runtime.getManifest().version);
    form.append("userAgent", navigator.userAgent);
    feedbackAttachments.forEach(f => form.append("attachment", f, f.name));
    const resp = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Accept": "application/json" }, // no Content-Type — browser sets the multipart boundary itself
      body: form,
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data || data.success !== true) throw new Error((data && data.message) || "bad response");
    status.className = "testStatus ok";
    status.textContent = "Sent — thanks!";
    $("feedbackMessage").value = "";
    feedbackAttachments = [];
    renderFeedbackAttachments();
    setTimeout(closeFeedbackPopover, 1200);
  } catch (e) {
    status.className = "testStatus err";
    status.textContent = "Couldn't send — check your connection and try again.";
  } finally {
    $("feedbackSendBtn").disabled = false;
  }
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
  $("rageBaitField").style.display = sleeperWriteEnabled ? "" : "none";
  $("rageBaitMessagesField").style.display = sleeperWriteEnabled && rageBaitEnabled ? "" : "none";
  $("rageBaitTestField").style.display = sleeperWriteEnabled && rageBaitEnabled ? "" : "none";
  if (!sleeperWriteEnabled) { closeSleeperQueuePopover(); closeRageBaitPopover(); } // don't leave either open with a now-hidden trigger button
  renderAll(); // every queue/draft button (board rows + both Best widgets) needs to pick up/drop at once
});

$("sleeperDblClickToggle").addEventListener("click", () => {
  sleeperDoubleClickDraft = !sleeperDoubleClickDraft;
  chrome.storage.local.set({ [K_SLEEPER_DBLCLICK_DRAFT]: sleeperDoubleClickDraft });
  $("sleeperDblClickToggle").classList.toggle("on", sleeperDoubleClickDraft);
  $("sleeperDblClickToggle").setAttribute("aria-checked", String(sleeperDoubleClickDraft));
  renderAll(); // draft buttons' tooltip text (draftTipText()) depends on this
});

// ---------- EXPERIMENTAL, for fun only: Rage bait mode ----------
$("rageBaitToggle").addEventListener("click", () => {
  rageBaitEnabled = !rageBaitEnabled;
  chrome.storage.local.set({ [K_RAGEBAIT_ENABLED]: rageBaitEnabled });
  $("rageBaitToggle").classList.toggle("on", rageBaitEnabled);
  $("rageBaitToggle").setAttribute("aria-checked", String(rageBaitEnabled));
  $("rageBaitMessagesField").style.display = rageBaitEnabled ? "" : "none";
  $("rageBaitTestField").style.display = rageBaitEnabled ? "" : "none";
  if (!rageBaitEnabled) closeRageBaitPopover(); // don't leave it open with a now-hidden trigger button
  rageBaitNextAt = null; // start counting a fresh random gap from whenever it was just turned on
});

// One row per message, each its own input — replaces an earlier one-per-line
// textarea version. That textarea looked broken in practice: a long message
// word-wraps onto a second visual line inside the box, which reads exactly
// like a second, separate message even though it's really one line of text
// (a real report: "disturbance" wrapping to its own line looked like the
// message pool had split mid-sentence). Individual rows can't have that
// ambiguity — one input, one message, no line-splitting to misread.
function persistRageBaitMessages() {
  chrome.storage.local.set({ [K_RAGEBAIT_MESSAGES]: rageBaitMessages });
  $("rageBaitCount").textContent = String(currentRageBaitMessages().length);
}
function renderRageBaitMessagesList() {
  $("rageBaitCount").textContent = String(currentRageBaitMessages().length);
  const list = $("rageBaitMessagesList");
  const msgs = currentRageBaitMessages();
  list.innerHTML = msgs.map((m, i) => `
    <div class="rbMsgRow" data-i="${i}">
      <input class="input2 sm rbMsgInput" value="${esc(m)}" data-i="${i}" placeholder="A rage bait message" />
      <button type="button" class="rbMsgRemove" data-i="${i}" aria-label="Remove this message" data-tip="Remove this message">${ico("circle-x", { size: 15 })}</button>
    </div>`).join("");
  list.querySelectorAll(".rbMsgInput").forEach((el) => {
    el.addEventListener("change", () => {
      const i = Number(el.dataset.i);
      const msgs2 = currentRageBaitMessages().slice();
      msgs2[i] = el.value.trim();
      rageBaitMessages = msgs2.filter(Boolean);
      persistRageBaitMessages();
      if (!el.value.trim()) renderRageBaitMessagesList(); // an emptied row collapses out rather than leaving a blank one
    });
  });
  list.querySelectorAll(".rbMsgRemove").forEach((el) => {
    el.addEventListener("click", () => {
      const i = Number(el.dataset.i);
      rageBaitMessages = currentRageBaitMessages().filter((_, idx) => idx !== i);
      persistRageBaitMessages();
      renderRageBaitMessagesList();
    });
  });
}

$("rageBaitAddBtn").addEventListener("click", () => {
  rageBaitMessages = [...currentRageBaitMessages(), ""];
  persistRageBaitMessages();
  renderRageBaitMessagesList();
  const inputs = $("rageBaitMessagesList").querySelectorAll(".rbMsgInput");
  if (inputs.length) inputs[inputs.length - 1].focus();
});

$("rageBaitResetBtn").addEventListener("click", () => {
  rageBaitMessages = [];
  persistRageBaitMessages();
  renderRageBaitMessagesList();
  toast("Reset to the default rage bait messages.");
});

// User-adjustable trigger interval — defaults to 10-13 picks
// (RAGEBAIT_MIN_GAP_DEFAULT/RAGEBAIT_MAX_GAP_DEFAULT, shared.js) but can be
// widened/narrowed here. Clamped so min is always >=1 and max is always
// >=min, since rageBaitRandomGap()'s Math.random() spread would otherwise go
// negative or degenerate. Changing either value re-rolls rageBaitNextAt
// immediately (same as toggling the mode on) so a new interval takes effect
// on the very next check rather than only after the current countdown
// finishes with the OLD range.
function persistRageBaitGap() {
  chrome.storage.local.set({ [K_RAGEBAIT_MIN_GAP]: rageBaitMinGap, [K_RAGEBAIT_MAX_GAP]: rageBaitMaxGap });
  rageBaitNextAt = null;
}
$("rageBaitMinGap").addEventListener("change", () => {
  const v = Math.max(1, Math.round(Number($("rageBaitMinGap").value)) || RAGEBAIT_MIN_GAP_DEFAULT);
  rageBaitMinGap = v;
  if (rageBaitMaxGap < rageBaitMinGap) rageBaitMaxGap = rageBaitMinGap;
  $("rageBaitMinGap").value = rageBaitMinGap;
  $("rageBaitMaxGap").value = rageBaitMaxGap;
  persistRageBaitGap();
});
$("rageBaitMaxGap").addEventListener("change", () => {
  const v = Math.max(1, Math.round(Number($("rageBaitMaxGap").value)) || RAGEBAIT_MAX_GAP_DEFAULT);
  rageBaitMaxGap = Math.max(v, rageBaitMinGap);
  $("rageBaitMaxGap").value = rageBaitMaxGap;
  persistRageBaitGap();
});

// Same flip-above/below-and-clamp positioning as the Roster/Sleeper queue
// popovers (openRosterPopover) — the message list can run to a dozen-plus
// rows, so it needs the same "flip upward near the bottom of the window"
// handling those already have, not the simpler fixed-dropdown positioning
// Settings/Status use.
function closeRageBaitPopover() {
  $("rageBaitPopover").hidden = true;
  document.removeEventListener("click", onRageBaitPopoverOutsideClick, true);
}
function onRageBaitPopoverOutsideClick(e) {
  if (e.target.closest("#rageBaitPopover") || e.target.closest("#rageBaitManageBtn")) return;
  closeRageBaitPopover();
}
function openRageBaitPopover() {
  renderRageBaitMessagesList();
  $("rageBaitMinGap").value = rageBaitMinGap;
  $("rageBaitMaxGap").value = rageBaitMaxGap;
  const panel = $("rageBaitPopover");
  const btn = $("rageBaitManageBtn");
  panel.hidden = false;
  panel.style.top = "";
  panel.style.bottom = "";
  panel.style.maxHeight = "";
  const r = btn.getBoundingClientRect();
  const w = panel.offsetWidth;
  panel.style.left = `${Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4))}px`;
  const margin = 8;
  const spaceBelow = window.innerHeight - r.bottom - margin;
  const spaceAbove = r.top - margin;
  if (spaceBelow >= spaceAbove) {
    panel.style.top = `${r.bottom + 6}px`;
    panel.style.maxHeight = `${Math.max(160, spaceBelow - 6)}px`;
  } else {
    panel.style.bottom = `${window.innerHeight - r.top + 6}px`;
    panel.style.maxHeight = `${Math.max(160, spaceAbove - 6)}px`;
  }
  setTimeout(() => document.addEventListener("click", onRageBaitPopoverOutsideClick, true), 0);
}
$("rageBaitManageBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!$("rageBaitPopover").hidden) { closeRageBaitPopover(); return; }
  openRageBaitPopover();
});
$("rageBaitPopoverClose").addEventListener("click", () => closeRageBaitPopover());

// Real send, same as the auto-fire path — first click ever this session
// always says "Hello, everyone!" (a known-good message to confirm the whole
// pipe works), every click after that is a random pick from the list, same
// as a real auto-fire would send.
$("rageBaitTestBtn").addEventListener("click", async () => {
  const status = $("rageBaitTestStatus");
  if (!sleeperWriteEnabled) { status.className = "testStatus err"; status.textContent = "Turn on Draft actions first."; return; }
  if (!sleeperToken()) { status.className = "testStatus err"; status.textContent = "Paste your token first."; return; }
  if (!currentDraftId) { status.className = "testStatus err"; status.textContent = "Sync a draft first."; return; }
  status.className = "testStatus";
  status.textContent = "Sending…";
  const message = rageBaitTested
    ? currentRageBaitMessages()[Math.floor(Math.random() * currentRageBaitMessages().length)]
    : "Hello, everyone!";
  const ok = await sendRageBaitMessage(message);
  if (ok) {
    rageBaitTested = true;
    status.className = "testStatus ok";
    status.textContent = `Sent: "${message}"`;
  } else {
    status.className = "testStatus err";
    status.textContent = "Failed — see toast.";
  }
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

// Same click-to-open pattern as sleeperTokenInfo above, for the Scoring
// format field — explains that this is a backup, not the primary path.
let scoringInfoEl = null;
function closeScoringInfo() {
  if (scoringInfoEl) { scoringInfoEl.remove(); scoringInfoEl = null; }
  document.removeEventListener("click", onScoringInfoOutsideClick);
}
function onScoringInfoOutsideClick(e) {
  if (!e.target.closest(".infoPopover") && !e.target.closest("#scoringFormatInfo")) closeScoringInfo();
}
$("scoringFormatInfo").addEventListener("click", (e) => {
  e.stopPropagation();
  if (scoringInfoEl) { closeScoringInfo(); return; }
  const el = document.createElement("div");
  el.className = "infoPopover";
  el.innerHTML = `<b>Scoring format</b>
    <p>This should sync automatically the moment you Sync — every BEER value, projected points, and ADP number gets computed off whichever scoring format the draft you're synced to actually uses.</p>
    <p>This dropdown is a backup, not the normal path. Only change it if the auto-detected format looks wrong, or you're not synced to a draft yet.</p>`;
  document.body.appendChild(el);
  const r = $("scoringFormatInfo").getBoundingClientRect();
  const w = el.offsetWidth;
  el.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - w - 6))}px`;
  el.style.top = `${r.bottom + 6}px`;
  scoringInfoEl = el;
  setTimeout(() => document.addEventListener("click", onScoringInfoOutsideClick), 0);
});

// Manual backup for scoring format — Auto (empty value) means "trust
// whatever the synced draft says" (applySyncedScoringFormat); an explicit
// choice overrides that until set back to Auto. Same "did this actually
// change the EFFECTIVE format" gate as the sync paths, so picking the format
// that's already active (e.g. forcing PPR when the synced draft is already
// PPR) doesn't trigger a pointless re-fetch.
$("scoringFormatSelect").addEventListener("change", () => {
  const prevFormat = SCORING_FORMAT;
  const val = $("scoringFormatSelect").value;
  setScoringFormatOverride(val);
  saveScoringFormatOverride(val);
  if (SCORING_FORMAT !== prevFormat) {
    renderStatusPanel();
    autoRefreshAdpAndStats();
    autoRefreshProjections().then((map) => { if (map) { projMap = map; renderAll(); } });
  }
});

// ---------- init: restore settings, then load the curated sources ----------
// ---------- Full-app license lock (added 2026-08-26) ----------
// Checked before ANYTHING else in init() below — no board, no Manager link,
// no storage reads beyond the license key itself happen until this passes.
// All-or-nothing paid unlock, no freemium tier (see claude.md's licensing
// section). Deliberately reloads the page on successful activation rather
// than trying to resume init() mid-flight — simplest robust option at this
// app's size, and it's a one-time cost per install.
function showLicenseLock() {
  $("licenseLock").hidden = false;
}
function hideLicenseLock() {
  $("licenseLock").hidden = true;
}
$("lockActivateBtn").addEventListener("click", async () => {
  const status = $("lockLicenseStatus");
  const btn = $("lockActivateBtn");
  const raw = $("lockLicenseInput").value;
  status.className = "testStatus";
  status.textContent = "Verifying with Gumroad...";
  btn.disabled = true;
  const result = await saveLicenseKey(raw);
  btn.disabled = false;
  if (!result.valid) {
    status.className = "testStatus err";
    status.textContent = result.error;
    return;
  }
  status.className = "testStatus ok";
  status.textContent = "License valid — loading...";
  location.reload();
});
$("lockLicenseInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("lockActivateBtn").click();
});

(async function init() {
  await refreshLicenseCache();
  if (!isLicensed()) {
    showLicenseLock();
    return; // nothing else in this app runs until a valid key is entered
  }
  hideLicenseLock();

  $("settingsBtn").innerHTML = ico("settings", { size: 15 });
  $("statusBtn").innerHTML = ico("activity", { size: 15 });
  $("sendFeedbackBtn").innerHTML = ico("mail", { size: 15 });
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

  // Same resume path as picks above, for the real per-draft slot counts —
  // matters most for a popped-out Roster window, which never fetches this
  // itself (see K_DRAFT_SETTINGS's comment near draftSettings). Without this,
  // a popout opened after the main window already synced would still show
  // the hardcoded default shape until the NEXT live fetch happens to resolve
  // (once per draftId, so possibly never again this session).
  //
  // Deliberately does NOT set draftSettingsForId here — a real bug, found
  // live-testing: setting it at restore time made poll()'s own `if (manual
  // || draftSettingsForId !== draftId)` guard believe a fresh fetch had
  // already happened for this session, so reconnecting to a draft whose
  // settings changed since the last time this window was open (a mid-draft
  // Sleeper settings edit, exactly the "highly rare" scenario just tested)
  // silently kept showing the STALE restored shape until a manual Refresh
  // forced it, instead of the fresh one Syncing should have pulled. This
  // restore is a placeholder for "something reasonable to show before the
  // real fetch," not a substitute for that fetch — draftSettingsForId should
  // only ever be set by poll()'s own live fetch actually resolving.
  const dsv = await chrome.storage.local.get([K_DRAFT_SETTINGS]);
  const savedDs = dsv[K_DRAFT_SETTINGS];
  if (savedDs && id && String(savedDs.draftId) === String(id)) {
    if (savedDs.settings) {
      draftSettings = savedDs.settings;
      applySyncedLeagueSettings(savedDs.settings);
    }
    applySyncedScoringFormat(savedDs.scoringType);
    if (savedDs.slotToRoster) draftSlotToRoster = savedDs.slotToRoster;
  }
  const savedOverride = await loadScoringFormatOverride();
  setScoringFormatOverride(savedOverride);
  $("scoringFormatSelect").value = savedOverride || "";

  sources = await loadSources();
  adp = await loadAdp();
  adpSources = await loadAdpSources();
  flags = await loadFlags();
  merges = await loadMerges();
  includeKdst = await loadIncludeKdst();
  includeKdstInBestPicks = await loadIncludeKdstInBestPicks();
  $("includeKdstToggle").classList.toggle("on", includeKdst);
  $("includeKdstToggle").setAttribute("aria-checked", String(includeKdst));
  $("includeKdstBestPicksField").style.display = includeKdst ? "" : "none";
  $("includeKdstBestPicksToggle").classList.toggle("on", includeKdstInBestPicks);
  $("includeKdstBestPicksToggle").setAttribute("aria-checked", String(includeKdstInBestPicks));
  applyKdstFilterVisibility();
  projMap = await loadProjections();
  playerStats = await loadPlayerStats();
  visibleStats = await loadStatPrefs();
  sleeperIds = await loadSleeperIdMap();
  injuries = await loadInjuries();
  injuriesUpdatedAt = await loadInjuriesUpdatedAt();
  renderLicenseStatus(); // license itself was already checked/cached above, this just reflects it in Settings
  const qv = await chrome.storage.local.get([K_SLEEPER_QUEUE, K_SLEEPER_WRITE_ENABLED, K_SLEEPER_SKIP_CONFIRM, K_SLEEPER_DBLCLICK_DRAFT, K_RAGEBAIT_ENABLED, K_RAGEBAIT_MESSAGES, K_RAGEBAIT_MIN_GAP, K_RAGEBAIT_MAX_GAP]);
  sleeperQueueKeys = qv[K_SLEEPER_QUEUE] || [];
  sleeperWriteEnabled = !!qv[K_SLEEPER_WRITE_ENABLED];
  sleeperSkipDraftConfirmDraftId = qv[K_SLEEPER_SKIP_CONFIRM] || null;
  sleeperDoubleClickDraft = qv[K_SLEEPER_DBLCLICK_DRAFT] !== false; // defaults true — only an explicit false turns it off
  rageBaitEnabled = !!qv[K_RAGEBAIT_ENABLED];
  rageBaitMessages = Array.isArray(qv[K_RAGEBAIT_MESSAGES]) ? qv[K_RAGEBAIT_MESSAGES] : [];
  rageBaitMinGap = Number.isFinite(qv[K_RAGEBAIT_MIN_GAP]) ? qv[K_RAGEBAIT_MIN_GAP] : RAGEBAIT_MIN_GAP_DEFAULT;
  rageBaitMaxGap = Number.isFinite(qv[K_RAGEBAIT_MAX_GAP]) ? qv[K_RAGEBAIT_MAX_GAP] : RAGEBAIT_MAX_GAP_DEFAULT;
  $("sleeperWriteToggle").classList.toggle("on", sleeperWriteEnabled);
  $("sleeperWriteToggle").setAttribute("aria-checked", String(sleeperWriteEnabled));
  $("sleeperTokenField").style.display = sleeperWriteEnabled ? "" : "none";
  $("sleeperTestField").style.display = sleeperWriteEnabled ? "" : "none";
  $("sleeperDblClickField").style.display = sleeperWriteEnabled ? "" : "none";
  $("sleeperDblClickToggle").classList.toggle("on", sleeperDoubleClickDraft);
  $("sleeperDblClickToggle").setAttribute("aria-checked", String(sleeperDoubleClickDraft));
  $("rageBaitField").style.display = sleeperWriteEnabled ? "" : "none";
  $("rageBaitToggle").classList.toggle("on", rageBaitEnabled);
  $("rageBaitToggle").setAttribute("aria-checked", String(rageBaitEnabled));
  $("rageBaitMessagesField").style.display = sleeperWriteEnabled && rageBaitEnabled ? "" : "none";
  $("rageBaitTestField").style.display = sleeperWriteEnabled && rageBaitEnabled ? "" : "none";
  renderRageBaitMessagesList();

  const tv = await chrome.storage.local.get([K_THEME]);
  applyTheme(tv[K_THEME] || "dark");

  // Queue/Roster pop-out windows — see the "Queue/Roster pop-out windows"
  // block above for the full mechanism. A popout window forces its one
  // popover open and hides the rest of the UI (initPopoutMode); the normal
  // board window instead reads which popouts are currently open elsewhere
  // so it can hide their trigger buttons from the very first render, not
  // just once a storage.onChanged event happens to fire later.
  if (popoutView) {
    initPopoutMode();
  } else {
    const { [K_POPOUT_WINDOWS]: popoutIds } = await chrome.storage.session.get([K_POPOUT_WINDOWS]);
    applyPopoutButtonVisibility(popoutIds || {});
  }

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

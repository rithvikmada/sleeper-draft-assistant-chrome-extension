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
// text values are CSS vars (not literal hex) specifically so panel.html's
// light theme can substitute higher-contrast versions of this exact palette
// for text-on-white legibility, without touching rankings-manager.html
// (which has no light mode and keeps these vars at their default/original
// hex — see --legacy-pos-* in both files' :root).
const POS_COLORS = {
  QB:{ text:"var(--legacy-pos-qb)", bg:"rgba(245,194,66,.12)", border:"rgba(245,194,66,.35)" },
  RB:{ text:"var(--legacy-pos-rb)", bg:"rgba(95,207,138,.12)", border:"rgba(95,207,138,.35)" },
  WR:{ text:"var(--legacy-pos-wr)", bg:"rgba(95,168,232,.12)", border:"rgba(95,168,232,.35)" },
  TE:{ text:"var(--legacy-pos-te)", bg:"rgba(232,138,201,.12)", border:"rgba(232,138,201,.35)" },
  K:{ text:"var(--legacy-pos-k)", bg:"rgba(167,139,250,.12)", border:"rgba(167,139,250,.35)" },
  DEF:{ text:"var(--legacy-pos-def)", bg:"rgba(110,140,174,.12)", border:"rgba(110,140,174,.35)" },
};
// Every position this app can rank/track/draft. K/DEF were added 2026-08-26
// (see claude.md's "K/DST support" section) so the app works for the many
// leagues that use them, not just this project's own K/DST-less league.
// Structural recognition (parsing, matching, board grouping) is unconditional
// — whether K/DEF actually SHOW UP in the UI is a separate, user-facing
// toggle (see K_INCLUDE_KDST below), not a second "valid positions" list.
// CORE_POSITIONS is the narrower set with real stat groups, BEER replacement-
// level math, and the BEST-by-position grid — K/DEF deliberately don't
// participate in those (see claude.md for the reasoning: DEF is a team
// entity with no man-games/bye-week replacement model, and K/DEF getting
// their own "best pick" crown would actively encourage reaching for them).
const POSITIONS = ["QB","RB","WR","TE","K","DEF"];
const CORE_POSITIONS = ["QB","RB","WR","TE"];

// Colors handed out to user-added ranking sources, in order.
const SOURCE_PALETTE = ["#5FA8E8","#E88AC9","#F5C242","#9B8AE8","#5FCFC4","#E8A05F"];

// ---------- storage keys ----------
const K_SOURCES = "rankingSources"; // array of source objects (see makeSource)
const K_DRAFT   = "draftState";     // live picks + manual crossouts, shared by both surfaces
const K_ADP     = "adpData";        // array of ADP source objects (see makeAdpSource) — was a single {players,label} blob before multi-source ADP; old shape is discarded, not migrated
const K_ROSTER  = "myRosterId";     // which draft slot / roster id is the user's
const K_FLAGS   = "playerFlags";    // playerKey -> "favorite" | "avoid", set in the manager, shown everywhere
const K_MERGES  = "playerMerges";   // { variantKey: canonicalKey, ... } — unmatched player reconciliation
const K_PROJ    = "beerProjections"; // { year, fetchedAt, map: { playerKey: ptsPpr } } — see BEER/VBD section below
const K_STATS   = "playerStats";    // { updatedAt, year, players: { playerKey: { stats:[{label,value,display,pct,full}] } } }
                                     // — position-specific role/volume stat pairs, fetched from Sleeper's public
                                     // stats+projections endpoints (see fetchSleeperStats in rankings-manager.js)
const K_SLEEPER_IDS = "sleeperPlayerIds"; // { updatedAt, ids: { playerKey: sleeperPlayerId } } — EXPERIMENTAL, see
                                     // fetchSleeperPlayerIdMap below. Needed to queue/draft a player through
                                     // Sleeper's write API, which addresses players by Sleeper's own numeric
                                     // player_id, not this project's playerKey.
const K_INJURIES = "playerInjuries"; // { updatedAt, injuries: { playerKey: {status,bodyPart,updatedAt} } } —
                                     // read off the same projections response fetchSleeperPlayerIdMap already
                                     // walks. See INJURY_META/injuryBadge below.
const K_DRAFT_SETTINGS = "syncedDraftSettings"; // { draftId, settings, scoringType } — settings is Sleeper's
                                     // own /v1/draft/{id} `.settings` object verbatim, scoringType is
                                     // data.metadata.scoring_type off the same response. Written only by
                                     // panel.js's poll() (the only surface that ever polls Sleeper), but read
                                     // by both panel.js (a popped-out Roster window never fetches this itself)
                                     // and rankings-manager.js (so its own stats/ADP/projections auto-refresh
                                     // doesn't silently fetch the wrong scoring format) — see claude.md's
                                     // "League shape sync" / "Scoring format" sections.
const K_RAGEBAIT_ENABLED  = "rageBaitEnabled";  // bool — master on/off, only meaningful when Draft actions is also on
const K_RAGEBAIT_MESSAGES = "rageBaitMessages"; // string[] — the pool a random message gets picked from; falls back to DEFAULT_RAGE_BAIT_MESSAGES when empty/unset
const K_RAGEBAIT_MIN_GAP  = "rageBaitMinGap";    // number — min picks between auto-fires, user-adjustable in the Manage popover
const K_RAGEBAIT_MAX_GAP  = "rageBaitMaxGap";    // number — max picks between auto-fires
const RAGEBAIT_MIN_GAP_DEFAULT = 10;
const RAGEBAIT_MAX_GAP_DEFAULT = 13;

// For-fun only — no signal, no effect on rankings/consensus/anything else this
// tool computes. Sent verbatim into Sleeper's draft chat (see "Rage bait mode"
// in claude.md) to mess with leaguemates. Kept intentionally light — needling,
// not actually mean — since these get sent under the user's own Sleeper name.
const DEFAULT_RAGE_BAIT_MESSAGES = [
  "After the news? 🐐😭",
  "Does he know? 💀💀",
  "Already???? 🍆🍆",
  "Were you on autodraft? 😴",
  "That's your guy? 😂😂",
  "Holy reach… 🤡",
  "Are we drafting or donating a roster spot? 💩",
  "That pick was brought to you by vibes 🎪🧠",
  "I've seen better value at a garage sale 😂😂😂",
  "Respect for reaching THAT early. Truly brave 🫡☠️",
  "The waiver wire is going to LOVE that guy in December 📉💀🍿",
  "Adding that one to my list of picks to bring up in Week 12 🎯😤",
];
const K_CUSTOM_BOARDS = "customRankingBoards"; // array of Rankings Creator board objects — see rankings-manager.js's
                                     // creator section. A board is NOT a ranking source itself; "Save to draft
                                     // board" converts one into a normal source (via makeSource) on demand, so
                                     // saving can't silently drift from every other source's shape.

// ---------- K/DST support (added 2026-08-26) ----------
// Most leagues start a kicker and a defense; this project's own league is the
// exception, not the rule (see claude.md). K_INCLUDE_KDST is the master
// on/off — defaults ON so the majority of users get full K/DEF support with
// zero setup, with an explicit off-switch for leagues (like this one) that
// don't use them. Purely a UI/behavior filter, not a data-model one: POSITIONS
// always structurally includes K/DEF (parsing, matching, storage never
// change shape), this only controls whether they're shown/filterable/synced.
const K_INCLUDE_KDST = "includeKdst";
async function loadIncludeKdst() {
  const v = await chrome.storage.local.get([K_INCLUDE_KDST]);
  return v[K_INCLUDE_KDST] !== false; // default true — only an explicit false turns it off
}
async function saveIncludeKdst(val) {
  await chrome.storage.local.set({ [K_INCLUDE_KDST]: !!val });
}
// Best Picks Right Now (the top-3 consensus-rank widget) defaults to
// excluding K/DEF even when the master toggle above is on — real draft
// strategy says never reach for a kicker/defense early, and recommending one
// there would actively encourage exactly that. This is a second, narrower
// opt-IN for anyone who wants them considered anyway. Meaningless (and
// ignored by callers) when K_INCLUDE_KDST itself is off.
const K_INCLUDE_KDST_BEST_PICKS = "includeKdstInBestPicks";
async function loadIncludeKdstInBestPicks() {
  const v = await chrome.storage.local.get([K_INCLUDE_KDST_BEST_PICKS]);
  return !!v[K_INCLUDE_KDST_BEST_PICKS]; // default false
}
async function saveIncludeKdstInBestPicks(val) {
  await chrome.storage.local.set({ [K_INCLUDE_KDST_BEST_PICKS]: !!val });
}
// The one set of positions actually in play right now, respecting the master
// toggle — the single place every position-filter button list, board
// gate, and pick-sync allowlist should read from instead of branching on
// includeKdst individually.
function activePositions(includeKdst) {
  return includeKdst ? POSITIONS : CORE_POSITIONS;
}

// ---------- scoring format (added 2026-08-26) ----------
// Every points/ADP fetch in this app was hardcoded to Sleeper's PPR fields
// (`pts_ppr`/`adp_ppr`) — a reasonable default while this was built for one
// specific full-PPR league, but wrong for anyone else: confirmed live against
// a real user draft whose own `scoring_type` is `"std"` (Standard), meaning
// every BEER value/projection/ADP number was silently computed off the wrong
// scoring format the whole time. Sleeper's projections/stats responses carry
// pts_std/pts_half_ppr/pts_ppr and adp_std/adp_half_ppr/adp_ppr side by side
// on the SAME response already being fetched — no new endpoint, no new
// permission, same philosophy as everything else auto-fetched in this file.
//
// SYNCED_SCORING_FORMAT is what the current draft's own metadata says
// (`applySyncedScoringFormat`, fed by panel.js's fetchDraftSettings, which
// also reads `data.metadata.scoring_type` off the same /v1/draft/{id} call
// already used for league-shape sync). SCORING_FORMAT_OVERRIDE is a user
// setting (default null = "Auto") for the rare case the sync gets it wrong
// or a draft doesn't expose it — explicitly a backup, not the primary path,
// per direct instruction. SCORING_FORMAT is the one fetch functions actually
// read, recomputed whenever either input changes: override wins if set,
// otherwise whatever synced (or the safe "ppr" default if nothing has yet).
const SCORING_FORMATS = ["ppr", "half_ppr", "std"];
let SYNCED_SCORING_FORMAT = "ppr";
let SCORING_FORMAT_OVERRIDE = null;
let SCORING_FORMAT = "ppr";
// Distinct from SYNCED_SCORING_FORMAT actually holding a real value — before
// any draft has ever synced (or a restore never found a matching one),
// SYNCED_SCORING_FORMAT is just the untouched "ppr" default, not a real
// confirmation. Without this, the status panel would claim "PPR (synced
// from draft)" on a brand-new window that has never synced anything —
// caught in review, not a live bug report, but a real and avoidable false
// claim about where a number came from.
let SCORING_FORMAT_EVER_SYNCED = false;
function recomputeScoringFormat() {
  SCORING_FORMAT = SCORING_FORMAT_OVERRIDE || SYNCED_SCORING_FORMAT;
}
// Only overwrites the synced half when the value is one of the three known
// suffixes — an unrecognized/missing scoring_type (a custom scoring league,
// or a draft object that doesn't expose it) leaves whatever was already
// there rather than corrupting it, same fallback discipline as
// applySyncedLeagueSettings. Still marks a real sync as having happened
// even on a repeat call with the SAME value — this only tracks "has a real
// sync (or restore of one) ever landed," not "did the value just change."
function applySyncedScoringFormat(scoringType) {
  if (SCORING_FORMATS.includes(scoringType)) {
    SYNCED_SCORING_FORMAT = scoringType;
    SCORING_FORMAT_EVER_SYNCED = true;
  }
  recomputeScoringFormat();
}
function setScoringFormatOverride(val) {
  SCORING_FORMAT_OVERRIDE = SCORING_FORMATS.includes(val) ? val : null;
  recomputeScoringFormat();
}
// Called when connecting to a genuinely DIFFERENT draft mid-session (see
// startPolling in panel.js) — without this, switching drafts without
// reloading the whole window could leak the PREVIOUS draft's confirmed
// scoring format into the new one (if the new draft's object doesn't expose
// scoring_type at all, poll()'s sync call would just leave the stale value
// in place) and keep claiming "synced from draft" for a draft that never
// actually confirmed anything. Deliberately does NOT touch
// SCORING_FORMAT_OVERRIDE — a manual override is a standing preference,
// not something tied to one specific draft.
function resetSyncedScoringFormat() {
  SYNCED_SCORING_FORMAT = "ppr";
  SCORING_FORMAT_EVER_SYNCED = false;
  recomputeScoringFormat();
}
function scoringPtsField() { return `pts_${SCORING_FORMAT}`; }
function scoringAdpField() { return `adp_${SCORING_FORMAT}`; }

const K_SCORING_FORMAT_OVERRIDE = "scoringFormatOverride"; // null/unset = "Auto" (follow the synced draft)
async function loadScoringFormatOverride() {
  const v = await chrome.storage.local.get([K_SCORING_FORMAT_OVERRIDE]);
  return SCORING_FORMATS.includes(v[K_SCORING_FORMAT_OVERRIDE]) ? v[K_SCORING_FORMAT_OVERRIDE] : null;
}
async function saveScoringFormatOverride(val) {
  await chrome.storage.local.set({ [K_SCORING_FORMAT_OVERRIDE]: SCORING_FORMATS.includes(val) ? val : null });
}

// ---------- license key gating (added 2026-08-26, Gumroad-verified pass) ----------
// All-or-nothing paid unlock, no freemium tiers — a deliberate scope call, see
// claude.md's licensing section. Keys are issued and delivered automatically
// by Gumroad (its built-in "generate a license key per sale" feature — no
// manual key list to maintain, no re-shipping the extension per batch), and
// checked against Gumroad's free public verify endpoint. This is NOT
// tamper-proof (devtools can still flip cachedLicenseValid) — acceptable at
// this scale (~50 buyers); see claude.md for a real server-validated upgrade
// path if that's ever worth revisiting.
//
// SETUP REQUIRED before this works for real: create the product on Gumroad
// with "Generate a unique license key per sale" enabled, then set
// GUMROAD_PRODUCT_PERMALINK below to that product's permalink (the short slug
// in its Gumroad URL, e.g. "abcde" from gumroad.com/l/abcde). Until that's
// set, only the DEV_TEST_KEYS below validate, so local testing doesn't
// require a live Gumroad product.
const GUMROAD_PRODUCT_PERMALINK = "fourthandgo"; // rithmada.gumroad.com/l/fourthandgo
const GUMROAD_VERIFY_URL = "https://api.gumroad.com/v2/licenses/verify";

const K_LICENSE_KEY = "licenseKey"; // string — the raw key the user entered, persisted so it survives reload
const K_LICENSE_VERIFIED_AT = "licenseVerifiedAt"; // epoch ms of the last successful Gumroad verification for this key
const LICENSE_REVERIFY_MS = 7 * 24 * 60 * 60 * 1000; // re-check with Gumroad at most weekly when online; trust the cache otherwise (so a real draft with no wifi still works)

// Local-only bypass so this can be tested end-to-end before a Gumroad
// product exists / before shipping real keys. Remove or leave — these never
// touch Gumroad's API, they're recognized purely client-side.
const DEV_TEST_KEYS = new Set([
  "BETA-0001-TEST-KEY1",
  "BETA-0002-TEST-KEY2",
  "BETA-0003-TEST-KEY3",
]);

function normalizeLicenseKey(raw) {
  return String(raw || "").toUpperCase().trim();
}

// Hits Gumroad's public license-verify endpoint. increment_uses_count=false
// so re-checking on every extension load doesn't chew through Gumroad's own
// per-key use-count tracking — this call is purely "is this key valid",
// not "record an activation."
async function verifyLicenseKeyRemote(key) {
  if (DEV_TEST_KEYS.has(key)) return { valid: true };
  if (!GUMROAD_PRODUCT_PERMALINK) {
    return { valid: false, error: "License verification isn't configured yet (no Gumroad product linked). Use a dev test key, or contact the developer." };
  }
  try {
    const body = new URLSearchParams({
      product_permalink: GUMROAD_PRODUCT_PERMALINK,
      license_key: key,
      increment_uses_count: "false",
    });
    const resp = await fetch(GUMROAD_VERIFY_URL, { method: "POST", body });
    const data = await resp.json();
    if (!resp.ok || !data.success) {
      return { valid: false, error: "That key isn't recognized by Gumroad. Double-check it, or send feedback if you think this is wrong." };
    }
    // A refunded/disputed sale still comes back success:true but flagged —
    // treat either as invalid so a refund actually revokes access.
    if (data.purchase && (data.purchase.refunded || data.purchase.disputed || data.purchase.chargebacked)) {
      return { valid: false, error: "This license is no longer active (refunded or disputed). Contact the developer if that's unexpected." };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: "Couldn't reach the license server — check your connection and try again.", offline: true };
  }
}

async function loadLicenseKey() {
  const v = await chrome.storage.local.get(K_LICENSE_KEY);
  return v[K_LICENSE_KEY] || "";
}

// Activation flow: called from the lock screen with whatever the user typed.
// Always hits the network (or the dev-key bypass) — this is the one-time
// "prove this key is real" check. Once it passes, the result is cached
// locally (see refreshLicenseCache) so later app opens don't require
// connectivity.
async function saveLicenseKey(raw) {
  const key = normalizeLicenseKey(raw);
  if (!key) return { valid: false, error: "Enter a license key." };
  const result = await verifyLicenseKeyRemote(key);
  if (!result.valid) return result;
  await chrome.storage.local.set({ [K_LICENSE_KEY]: key, [K_LICENSE_VERIFIED_AT]: Date.now() });
  return { valid: true };
}

async function clearLicenseKey() {
  await chrome.storage.local.remove([K_LICENSE_KEY, K_LICENSE_VERIFIED_AT]);
}

// Cached synchronously after the async load in each surface's init() so hot
// paths can check licensing without awaiting storage on every call — same
// pattern as sleeperWriteEnabled etc. On a normal (online) load past
// LICENSE_REVERIFY_MS, silently re-checks with Gumroad in the background
// (so a refunded key eventually gets caught) without blocking startup on it;
// if that re-check fails for a network reason (not a real rejection), the
// cached "valid" state is left alone so drafting offline still works.
let cachedLicenseValid = false;
async function refreshLicenseCache() {
  const key = await loadLicenseKey();
  if (!key) { cachedLicenseValid = false; return false; }
  const stored = await chrome.storage.local.get(K_LICENSE_VERIFIED_AT);
  const verifiedAt = stored[K_LICENSE_VERIFIED_AT] || 0;
  if (Date.now() - verifiedAt < LICENSE_REVERIFY_MS) {
    cachedLicenseValid = true; // trust the cache, no network needed
    return true;
  }
  const result = await verifyLicenseKeyRemote(key);
  if (result.valid) {
    cachedLicenseValid = true;
    await chrome.storage.local.set({ [K_LICENSE_VERIFIED_AT]: Date.now() });
  } else if (result.offline) {
    cachedLicenseValid = true; // couldn't reach Gumroad — don't lock someone out over a bad connection
  } else {
    cachedLicenseValid = false; // an actual rejection (revoked/refunded) — lock it back
  }
  return cachedLicenseValid;
}
function isLicensed() { return cachedLicenseValid; }

// ---------- position/avatar helpers shared by the board window and the
// Rankings Creator (Rankings Manager) ----------
// Distinct object from POS_COLORS above (which the manager's older-style
// chips/table still use) — this is the 2026-08-24 redesign's token names.
const POS_V2 = {
  QB: { fg: "var(--pos-qb)", bg: "var(--pos-qb-tint)" },
  RB: { fg: "var(--pos-rb)", bg: "var(--pos-rb-tint)" },
  WR: { fg: "var(--pos-wr)", bg: "var(--pos-wr-tint)" },
  TE: { fg: "var(--pos-te)", bg: "var(--pos-te-tint)" },
  K: { fg: "var(--pos-k)", bg: "var(--pos-k-tint)" },
  DEF: { fg: "var(--pos-def)", bg: "var(--pos-def-tint)" },
};
function posTint(pos) { return POS_V2[pos] || { fg: "var(--pos-flex)", bg: "var(--chalk-a12)" }; }

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

// Headshot: Sleeper's own numeric player_id (idsMap, loaded from
// K_SLEEPER_IDS) against Sleeper's public thumb CDN. Team logo: same CDN,
// keyed off team abbreviation, lowercased (Sleeper's logo files use
// lowercase 3-letter codes). Both are plain background-images on a <span>,
// which MV3's default CSP doesn't restrict (script-src/object-src only) —
// no manifest.json change needed. Falls back to initials / plain team text
// when either is missing (unmatched player, or no team on file). `idsMap`
// is passed explicitly (not read off a module-level global) since the board
// window and the Rankings Manager each keep their own copy in memory.
// DEF is a deliberate exception: idsMap[key] for a defense is Sleeper's
// team-code pseudo-id ("LAR"), not a numeric player id — there's no headshot
// thumb at that path, so DEF always falls through to the initials+team-badge
// treatment regardless of what's in idsMap (the id is still real and correct
// for queue/draft purposes, see fetchSleeperPlayerIdMap — just not a photo).
function avatarHtml(key, name, pos, team, size = "", idsMap = {}) {
  const t = posTint(pos);
  const sleeperId = pos === "DEF" ? null : idsMap[key];
  const style = sleeperId
    ? `border-color:${t.fg};background-image:url('https://sleepercdn.com/content/nfl/players/thumb/${sleeperId}.jpg')`
    : `border-color:${t.fg}`;
  const inner = sleeperId ? "" : esc(initials(name));
  const badge = team
    ? `<span class="avatarBadge" style="background-image:url('https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png')">${sleeperId ? "" : esc(team)}</span>`
    : "";
  return `<span class="avatarCircle${size ? ` ${size}` : ""}" style="${style}">${inner}${badge}</span>`;
}

// ---------- Rankings Creator boards ----------
// A board is: { id, name, updatedAt, baseId ("adp" or a ranking source id),
// players: { key: {name,team,pos} } (the full universe snapshot the board
// was built from), order: [key,...] (placed/ranked players, in order),
// breaks: [key,...] (identity-keyed tier boundaries — a key in this list
// means "a new tier starts right before this player in `order`"; anchoring
// to identity rather than an index means a boundary survives a drag-reorder
// of the players around it, where an index would silently point at the
// wrong gap after any reorder). Unplaced players are simply every key in
// `players` not present in `order`.
async function loadCustomBoards() {
  const v = await chrome.storage.local.get([K_CUSTOM_BOARDS]);
  return Array.isArray(v[K_CUSTOM_BOARDS]) ? v[K_CUSTOM_BOARDS] : [];
}
async function saveCustomBoards(boards) {
  await chrome.storage.local.set({ [K_CUSTOM_BOARDS]: boards });
}
// Tier number (1-based) for the player at `idx` in board.order — every key
// in `breaks` seen at or before idx starts a new tier.
function boardTierAtIndex(board, idx) {
  const breakSet = new Set(board.breaks || []);
  let tier = 1;
  for (let i = 1; i <= idx; i++) if (breakSet.has(board.order[i])) tier++;
  return tier;
}
// Converts a board into the {name,team,pos,rank,tier} shape every ranking
// source's `players` array already uses — this is the ONLY thing "Save to
// draft board" does. No new storage schema, no new consensus-blending path:
// a saved custom board is indistinguishable from any other imported source
// once it lands in K_SOURCES.
function boardToSourcePlayers(board) {
  const breakSet = new Set(board.breaks || []);
  let tier = 1;
  return board.order.map((key, i) => {
    if (i > 0 && breakSet.has(key)) tier++;
    const p = board.players[key] || {};
    return { name: p.name, team: p.team, pos: p.pos, rank: i + 1, tier: String(tier) };
  });
}

// ---------- DOM helpers shared by both surfaces ----------
// Identical in panel.js and rankings-manager.js before this — both are
// classic scripts sharing one global scope, so moving them here just means
// declaring them once instead of twice and trusting them to stay in sync.
const $ = (id) => document.getElementById(id);

// Both HTML pages have a #toast element with the same CSS-driven show/hide
// transition (see the .show/.error classes in panel.html / rankings-manager.html).
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

// Solo-isolating a source (double-click a chip/dot) shows just that one
// source; otherwise every enabled source counts. Takes its state explicitly
// rather than closing over module-level variables, since each surface keeps
// its own `sources`/`soloSource`.
function activeSources(sources, soloSource) {
  return soloSource ? sources.filter((s) => s.id === soloSource) : sources.filter((s) => s.enabled);
}

// A grouped filter (currently just the board's RB/WR flex view) maps to a
// SET of positions instead of one — everything that filters by position
// should go through this rather than comparing r.pos === posFilter directly,
// so adding another grouped filter later is a one-line addition here instead
// of a second place to remember. Only panel.js currently exposes a button for
// this group; rankings-manager.js gets the same matching logic for free by
// routing through applyFilters below, without gaining a UI it never asked for.
const POS_FILTER_GROUPS = { "RB/WR": ["RB", "WR"] };
function filterMatchesPos(pos, posFilter) {
  const group = POS_FILTER_GROUPS[posFilter];
  return group ? group.includes(pos) : pos === posFilter;
}

// posFilter / showTaken / playerSearch were deliberately duplicated across
// both surfaces (see claude.md) — reasonable when they were three near-
// identical one-liners, less reasonable once panel.js grew the RB/WR group
// and rankings-manager.js quietly didn't, which is real, if minor, behavior
// drift between the two tables. `isGone` stays a caller-supplied predicate
// because the two surfaces track "taken" differently (panel.js: two plain
// objects; rankings-manager.js: a Map from takenMap()) and unifying THAT
// shape wasn't in scope here — only the filter logic itself.
function applyFilters(rows, { posFilter = "ALL", showTaken = false, playerSearch = "", isGone } = {}) {
  let list = rows;
  if (posFilter !== "ALL") list = list.filter((r) => filterMatchesPos(r.pos, posFilter));
  if (!showTaken && isGone) list = list.filter((r) => !isGone(r));
  if (playerSearch) {
    const q = playerSearch.toLowerCase();
    list = list.filter((r) => r.name.toLowerCase().includes(q) || (r.team || "").toLowerCase().includes(q));
  }
  return list;
}

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
    // Renamed from `builtin` (Stage 2 audit, batch 7) — that name read as
    // "ships with the extension," but it only ever controlled whether the
    // manager's ✕ button shows. It's genuinely a different question from
    // `codeSeeded` below: FantasyPros ECR is code-seeded (re-derived from
    // fp-rankings.js on every load) but NOT undeletable — it has a real ✕.
    undeletable: !!opts.undeletable,
    // True for the two sources whose player list is normally re-derived from
    // a bundled JS file on every load (this default source from rankings.js,
    // FantasyPros ECR from fp-rankings.js in rankings-manager.js) rather than
    // trusted from storage — UNLESS manualOverride (below) is set. Previously
    // there was no flag for this at all; loadSources()/ensureBuiltinSources()
    // and the edit modal each separately hardcoded `id === "default"` /
    // `id === "fp"` checks, so bundling a third code-seeded source meant
    // finding and updating that id list in two files rather than setting one
    // flag on the source itself.
    codeSeeded: !!opts.codeSeeded,
    icon: opts.icon || null, // small square data URL, set via the manager's edit modal — falls back to the color swatch when absent
    importedAt: opts.importedAt || Date.now(), // when the player list was last (re-)uploaded, shown in the edit modal
    // True once a user manually replaces a codeSeeded source's CSV through
    // the edit modal — tells loadSources()/ensureBuiltinSources() to stop
    // re-seeding from the bundled JS file and trust the stored upload
    // instead, so a manual replacement actually sticks rather than being
    // silently overwritten on the next load. Meaningless for a source that
    // isn't codeSeeded (there's nothing to override).
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
    id: "default", color: "#5FCF8A", undeletable: true, codeSeeded: true,
  });
}

async function loadSources() {
  const v = await chrome.storage.local.get([K_SOURCES]);
  const stored = Array.isArray(v[K_SOURCES]) ? v[K_SOURCES] : [];
  // Re-seed the default source from rankings.js so a code update to it
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
  // Persist the default source's enabled flag, icon, and — only once
  // manually overridden — its player list too (normally left as [] since
  // it's large and regenerable from rankings.js on every load). Keyed off
  // `codeSeeded` rather than the id directly would also cover a future
  // second built-in ranking source stored this way, but there's only ever
  // one non-manager-added ranking source in K_SOURCES (the id === "default"
  // check is still correct here, just no longer the ONLY place this
  // decision gets made — see codeSeeded in makeSource).
  const toStore = sources.map((s) =>
    s.id === "default"
      ? {
          id: "default", name: s.name, color: s.color, enabled: s.enabled,
          undeletable: true, codeSeeded: true,
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
    if (pos && !POSITIONS.includes(pos)) { skipped++; return; } // drop unrecognized positions (K/DEF are valid now — see POSITIONS)
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
  if (skipped) warnings.push(`${skipped} row(s) skipped (blank name, or an unrecognized position).`);
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
        `None of these ${total} rows have a position (QB/RB/WR/TE/K/DEF), so none of them can be ` +
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

// ---------- AI ranking/ADP source converter (skill + standalone prompt) ----------
// Every ranking/ADP source imported into this tool goes through parseRankings()
// above, and real-world exports vary wildly (multiple tabs, no combined rank,
// letter tiers vs numeric vs none, team/bye baked into the name cell, K/DEF
// rows that need their real (non-abbreviated) name kept as-is). Rather than
// teach every user that shape by hand,
// this is a single canonical set of conversion instructions, offered two ways
// from the Rankings Manager UI (see rankings-manager.js's
// downloadConverterSkill()/copyConverterPrompt()):
//   - a real Claude Code skill (SKILL.md) a Claude Code user drops into
//     .claude/skills/ so Claude can do the conversion inside a coding session
//   - a standalone prompt (plain .md) for pasting into any chat (claude.ai,
//     ChatGPT, etc.) alongside the raw export, for non-Claude-Code users
// Both share the same body text (CONVERTER_INSTRUCTIONS_MD below) so the
// actual rules can't drift between the two surfaces — only the wrapper
// (skill frontmatter vs. a plain instruction preamble) differs.
//
// Deliberately self-contained, no repo data: a fresh install of this
// extension ships with zero ranking/ADP sources (only the live Sleeper ADP
// API), so unlike the in-session conversion process this project's own dev
// history used (cross-referencing rankings.js/fp-rankings.js for abbreviated
// names), neither of these can assume any bundled name data exists to check
// against. Ambiguous/abbreviated names are flagged in the output for the
// user to resolve after import via the Rankings Manager's right-click
// "merge near matches" (see claude.md's Rankings Manager architecture
// section) instead.
const CONVERTER_INSTRUCTIONS_MD = `## What this does

Turns a raw fantasy football rankings or ADP export — pasted text, a copied
table, a CSV in a different shape, whatever you have — into a clean CSV file
ready to import into 4th&Go's Rankings Manager ("+ ADD SOURCE" / "+ ADD ADP
SOURCE").

## Output format

Produce a CSV with this exact header row, in this column order:

Rank,Name,Team,Position,Tier

- **Rank** — required. The player's rank *within this export*. If the export
  has no numeric rank column at all, number rows in the order they appear.
- **Name** — required. Full player name only. If the export bakes team and/or
  bye week into the name cell (e.g. "Jahmyr Gibbs DET (6)" or "Tyreek Hill FA
  ()"), strip that off — output just "Jahmyr Gibbs".
- **Team** — the player's NFL team abbreviation if the export has one.
  Leave blank if it doesn't; never guess one.
- **Position** — QB, RB, WR, TE, K, or DEF. Kickers and defenses ARE valid
  positions now (they weren't in an earlier version of this converter — don't
  drop them). A team defense's "name" is just its city + mascot (e.g. "San
  Francisco 49ers"), not a person — keep it exactly as the export writes it,
  don't reformat it into an abbreviation or vice versa. If a cell has a
  positional-tier suffix like "RB1" or "WR12", output just the base position
  ("RB", "WR") — the number is rank information, not part of the position.
- **Tier** — only include this column if the source export actually has tier
  information. If it has none, omit the Tier column entirely (don't invent
  tiers). Tiers can be numeric (1 = best) or letters (S,A,B,C,...,O, S = best)
  — either works, output whatever scheme the source itself uses, don't
  convert one to the other.

Always include a header row. Use plain comma-separated values, one player per
row, no extra commentary rows mixed into the CSV itself.

## Common shapes you'll see, and how to handle each

- **Combined rankings export, one player per row, one overall rank column** —
  the easy case. Map columns straight across.
- **Multiple side-by-side tables, one per position, each with its OWN 1..N
  rank and no combined/overall rank anywhere** (common for free creator
  guides — a "QB1-20" list, "RB1-19" list, etc., with no way to compare a QB
  to an RB). Do NOT invent a combined overall rank by interleaving them or
  guessing positional value — that would silently corrupt this tool's cross-
  position ranking math. Instead output each position's own 1..N rank as the
  Rank column exactly as given, and **tell the user explicitly, outside the
  CSV, that this is a position-only source** — they need to check the
  "Position-only source" box when importing it (this tool has a dedicated,
  safe way to handle exactly this shape).
- **Multi-analyst combined table** (one row per player, one rank column PER
  analyst, "-" or blank meaning that analyst didn't rank them, often an
  average/consensus column too). If asked to extract ONE specific analyst as
  its own source, use ONLY that analyst's column — never the average/
  consensus column (this tool computes its own blend across whatever sources
  get imported; pre-blending here would double-count that analyst's opinion).
  Drop any row where that analyst's cell is "-"/blank from that analyst's CSV.
- **Multiple tabs/sheets in one paste** — treat each tab as a separate
  source/CSV unless told otherwise; don't merge them into one file.
- **No position column at all** — if you can determine each player's real
  position from context (a section header, common knowledge is NOT enough —
  only use what's actually in the export), fill it in. If you genuinely can't
  tell, say so plainly rather than guessing; a row with no position imports
  as inert (it won't rank, tier, or show up anywhere) if left blank, so it's
  safer to flag it than fabricate a guess that's wrong.
- **Abbreviated or initial-only first names** ("K. Gainwell", "J. Chase") —
  keep the name exactly as given in the CSV; do not expand it from your own
  knowledge (a guess here can silently attach the wrong real player). Instead
  list every such name in the "Needs review" section below, so the user can
  fix it after import using the Rankings Manager's right-click "merge near
  matches" feature.

## What NOT to do

- Don't fabricate a player, a team, a position, or a tier that isn't actually
  present in the source.
- Don't average/blend multiple analysts' opinions into one number yourself —
  this tool already does that blending across whatever sources you import.
- Don't reorder or renumber a positional-only export into a fake combined
  rank.
- Don't silently drop players you're unsure about — flag them instead (see
  below) so the user can decide.

## Output shape — always give back both parts

1. The CSV itself, in its own fenced code block, ready to copy-paste into
   the Rankings Manager's "…or paste rows here" box (or save as a .csv and
   use the upload field).
2. A short plain-text summary immediately after it:
   - How many players were parsed, and the position breakdown.
   - Whether this is a normal or position-only source (and therefore whether
     the user needs to check that box on import).
   - A "Needs review" list of any abbreviated/ambiguous names, or anything
     you weren't confident about, with the row context — empty/omit this
     list if there's nothing to flag.

If the source clearly isn't a fantasy football rankings/ADP export at all
(e.g. it's prose, a webpage's unrelated content, or has no players in it),
say so instead of forcing something into the CSV format.`;

// Wrapping the shared body in a real Claude Code skill (SKILL.md format —
// YAML frontmatter + instructions) vs. a standalone prompt preamble for
// pasting into any chat. Keep both thin wrappers — the actual rules only
// live in CONVERTER_INSTRUCTIONS_MD above.
const RANKING_CONVERTER_SKILL_MD = `---
name: rankings-csv-converter
description: Converts a raw fantasy football rankings or ADP export (any layout — multiple tabs, no combined rank, letter or numeric tiers, no tiers at all) into a clean CSV ready to import into 4th&Go's Rankings Manager. Use whenever the user pastes or uploads a rankings/ADP export and wants it turned into an importable CSV.
---

# Rankings/ADP CSV converter

You are helping the user convert a raw fantasy football rankings or ADP
export — from any site or creator, in whatever shape it's in — into a CSV
file for 4th&Go's Rankings Manager. The user will provide the raw export
(pasted text, an uploaded file, or a screenshot transcribed to text) in their
next message, or has already included it above.

${CONVERTER_INSTRUCTIONS_MD}
`;

const RANKING_CONVERTER_PROMPT_MD = `# Rankings/ADP CSV converter

I have a raw fantasy football rankings or ADP export (pasted below, or in an
attached file) that I want turned into a CSV I can import into my draft
board tool. Please convert it following these exact rules.

${CONVERTER_INSTRUCTIONS_MD}

---

Here is my raw export:

[PASTE YOUR RANKINGS/ADP EXPORT HERE]
`;

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
  // Position-only sources: recorded into posOnlyTiers/posOnlyRanks (display-
  // only, as before) AND — new — a normalized within-position depth vote
  // pushed into the same e.depthVotes array blendSources' tiers feed (see
  // assignBlendedTiers below), so the source's positional opinion actually
  // participates in blended tier boundaries instead of sitting inert in a
  // reference column. Deliberately still never touches e.ranks/tierVotes —
  // a positional rank ("WR12") mixed directly into the cross-position rank
  // median would corrupt it for every other source at once (the original
  // reason position-only sources were excluded); depth is different because
  // it's already normalized to a 0..1 "how deep in this ranking" scale the
  // same way a full source's tier depth is, so it can blend on equal terms
  // without ever touching raw cross-position rank ordering.
  // Caveat, not fully solved: a position's 0..1 depth scale isn't perfectly
  // equivalent across positions (e.g. "top half of a 40-deep WR guide" isn't
  // exactly the same value tier as "top half of a 13-deep QB guide" — QBs
  // are shallower at replacement level). This is a pragmatic approximation,
  // same spirit as the tier-depth blending it reuses — not a rigorous
  // position-value model. Revisit if it visibly skews blended tiers for a
  // shallow position like QB/TE.
  const maxRankByPos = new Map();
  posOnlySources.forEach((src) => {
    const perPos = {};
    src.players.forEach((p) => {
      if (p.pos && isFinite(p.rank)) perPos[p.pos] = Math.max(perPos[p.pos] || 0, p.rank);
    });
    maxRankByPos.set(src.id, perPos);
  });
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
      if (isFinite(p.rank)) {
        e.posOnlyRanks[src.id] = p.rank;
        const maxRank = maxRankByPos.get(src.id)[p.pos];
        if (maxRank > 0) e.depthVotes.push((p.rank - 1) / maxRank);
      }
    });
  });
  // Whether tiers get depth-blended (assignBlendedTiers) vs. taken as-is from
  // a single source's own label (modeTier) now depends on how many sources
  // are voting on DEPTH at all, not just blendSources — a position-only
  // source's normalized depth vote (above) counts too, so e.g. one full
  // source + one position-only source still blends instead of just passing
  // the full source's raw tier through untouched.
  const totalVotingSources = blendSources.length + posOnlySources.length;
  const out = [...map.values()].map((e) => {
    const vals = Object.values(e.ranks).filter((v) => isFinite(v));
    return {
      key: e.key, name: e.name, team: e.team, pos: e.pos, ranks: e.ranks, posOnlyTiers: e.posOnlyTiers, posOnlyRanks: e.posOnlyRanks,
      // With exactly one voting source total (no position-only depth
      // contribution either), its own tier label is meaningful as-is. With
      // 2+, filled in below — see assignBlendedTiers.
      tier: totalVotingSources <= 1 ? modeTier(e.tierVotes) : "",
      depth: e.depthVotes.length ? median(e.depthVotes) : null,
      consensus: median(vals), sourceCount: vals.length,
    };
  });
  out.sort((a, b) => (a.consensus ?? 1e9) - (b.consensus ?? 1e9));
  if (totalVotingSources > 1) assignBlendedTiers(out);
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
//
// TIER_DEPTH_GAMMA (2026-08-27) — the equal-width bucketing above (plain
// `floor(depth * n)`) produces occasional huge combined-board tiers in
// practice: depth is `rank / that source's own max rank`, and when several
// sources with very different coverage (one ranks 150 players, another 450)
// get median-blended, the resulting depth values for hundreds of players
// often clump rather than spread evenly across 0..1 — an equal-width bucket
// sitting in a dense clump just sweeps up everyone in it. Rather than switch
// to equal-COUNT buckets (which would force every tier to the same size
// regardless of whether the data actually clusters that way, erasing real
// cliffs), depth is warped through `depth ** TIER_DEPTH_GAMMA` before
// bucketing. With gamma < 1, this stretches the resolution across LOW depth
// (the top of the draft, where per-source tier opinions are most granular
// and real cliffs matter most) and compresses it across HIGH depth (deep
// bench, where sources agree the least and blended depth is mushiest) — so
// early tiers are deliberately narrow and late tiers are deliberately wide,
// by design, rather than a huge late tier being an accident of where depth
// values happened to bunch up. 0.6 is a judgment call, not derived from
// data — tune it if early tiers still feel too coarse or too thin in
// practice.
const TIER_DEPTH_GAMMA = 0.6;
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
    const warped = Math.pow(r._depthEff, TIER_DEPTH_GAMMA);
    const idx = Math.min(Math.floor(warped * n), n - 1);
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
    const c = (POS_COLORS && POS_COLORS[pos]) || { text: "var(--dim2)", bg: "transparent", border: "var(--border-subtle)" };
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

// ---------- stat projections (backlog: "stats/projections board columns") ----------
// Which 3 stats to show per position, chosen for correlation with fantasy
// success (research done during this feature's planning, not a guess):
//   QB — projected pass yards + rush yards (rushing is what separates top-12
//        fantasy QBs from the rest; passing volume alone misses that signal)
//        + projected fantasy points (PROJ) as an overall-value tiebreaker
//   RB — target share % (a target is worth ~2.7x a rushing attempt in PPR,
//        and this is the stickiest volume signal year-over-year) + projected
//        rush attempts (total touches) + projected receptions (REC, the
//        pass-catching half of touches — a 3rd stat rather than one combined
//        "touches" number so both volume sources stay individually visible)
//   WR — target share % (~0.70 year-over-year correlation, the single
//        stickiest receiving metric) + prior-season air yards (separates a
//        real downfield role from a checkdown-only one) + projected
//        receptions (REC, the actual catch-volume forecast)
//   TE — target share % + prior-season red-zone targets (TE value is
//        concentrated near the end zone more than any other position) +
//        projected receptions (REC)
// Target share needs a team-wide target total to divide into, which isn't a
// per-player field — see buildTeamTargetTotals below for how that's computed
// from the same raw data. All 3 stats are always fetched together in one
// pass (fetchSleeperStatsPlayers) since the underlying endpoints already
// carry every field needed — no extra network calls per stat.
// Column-header labels + full name/unit (for the header's hover tooltip) for
// each group's 3 stat slots — the single source of truth
// fetchSleeperStatsPlayers uses when building each player's stats, so the
// header can never drift out of sync with what the rows actually contain.
// BASIC isn't a real position: it's a 4th "always relevant" group (years of
// experience + season-long and per-week projected points) that stays
// pinned in front of whichever position group the user has brought forward,
// so there's always a volume/production anchor visible no matter what's
// selected.
const STAT_META = {
  BASIC: [
    { label: "EXP", full: "Years of NFL experience", unit: "yrs" },
    { label: "PROJ", full: "Projected fantasy points, full season (your league's scoring)", unit: "pts" },
    { label: "P/WK", full: "Projected fantasy points per game (your league's scoring)", unit: "pts/gm" },
  ],
};

// Every SELECTABLE stat for each position — the original correlation-
// research set (PASS/RUSH/TGT%/etc, current-year projections + prior-year
// target share/air yards/red-zone) plus the later user-specified per-game/
// per-snap set (RU/G/AT/G/FPDB/etc), side by side as one pick list rather
// than two competing "the right 3" answers. `id` is the stable key stored
// in a player's `options` map (fetchSleeperStatsPlayers) and in
// DEFAULT_VISIBLE_STATS/K_STAT_PREFS; `label`/`full` feed the header exactly
// like STAT_META does for BASIC. A user can select any number (0+) per
// position via the "Stats" picker (panel.js's openStatPicker) — this is NOT
// capped at 3 the way the board used to be.
const STAT_OPTION_DEFS = {
  QB: [
    { id: "pass_proj", label: "PASS", full: "Projected passing yards" },
    { id: "rush_proj", label: "RUSH", full: "Projected rushing yards" },
    { id: "proj_ppr", label: "PROJ", full: "Projected fantasy points, full season (your league's scoring)" },
    { id: "rush_yd_g", label: "RU/G", full: "Rushing yards per game, prior season" },
    { id: "pass_att_g", label: "AT/G", full: "Pass attempts per game, prior season" },
    { id: "fpdb", label: "FPDB", full: "Fantasy points per dropback (your league's scoring), prior season — dropbacks approximated as pass attempts + sacks (no play-by-play dropback count in Sleeper's data)" },
  ],
  RB: [
    { id: "tgt_share", label: "TGT%", full: "Target share, prior season" },
    { id: "rush_att_proj", label: "ATT", full: "Projected rush attempts" },
    { id: "rec_proj", label: "REC", full: "Projected receptions" },
    { id: "rec_g", label: "RC/G", full: "Receptions per game, prior season" },
    { id: "snaps_g", label: "SN/G", full: "Offensive snaps per game, prior season — a proxy for routes per game, which isn't in Sleeper's data" },
    { id: "rush_att_g", label: "AT/G", full: "Rush attempts per game, prior season" },
  ],
  WR: [
    { id: "tgt_share", label: "TGT%", full: "Target share, prior season" },
    { id: "air_yd", label: "AIR", full: "Air yards, prior season" },
    { id: "rec_proj", label: "REC", full: "Projected receptions" },
    { id: "tgt_g", label: "TG/G", full: "Targets per game, prior season" },
    { id: "tgt_per_snap", label: "TPS", full: "Targets per offensive snap, prior season — a proxy for targets per route run, which isn't in Sleeper's data" },
    { id: "yd_per_snap", label: "YPS", full: "Receiving yards per offensive snap, prior season — a proxy for yards per route run" },
  ],
  TE: [
    { id: "tgt_share", label: "TGT%", full: "Target share, prior season" },
    { id: "rz_tgt", label: "RZ", full: "Red-zone targets, prior season" },
    { id: "rec_proj", label: "REC", full: "Projected receptions" },
    { id: "tgt_g", label: "TG/G", full: "Targets per game, prior season" },
    { id: "snap_share", label: "SNP%", full: "Offensive snap share, prior season — a proxy for route participation, which isn't in Sleeper's data" },
    { id: "yd_per_snap", label: "YPS", full: "Receiving yards per offensive snap, prior season — a proxy for yards per route run" },
  ],
};
// Whatever's currently shown by default — the later per-game/per-snap set —
// stays the default when the picker ships, per direct instruction ("leave
// the ones we have now as default").
const DEFAULT_VISIBLE_STATS = {
  QB: ["rush_yd_g", "pass_att_g", "fpdb"],
  RB: ["rec_g", "snaps_g", "rush_att_g"],
  WR: ["tgt_g", "tgt_share", "yd_per_snap"],
  TE: ["tgt_g", "tgt_share", "snap_share"],
};
const K_STAT_PREFS = "statColumnPrefs"; // { QB:[ids...], RB:[...], WR:[...], TE:[...] } — which STAT_OPTION_DEFS entries show, per position
async function loadStatPrefs() {
  const v = await chrome.storage.local.get([K_STAT_PREFS]);
  const stored = v[K_STAT_PREFS];
  if (!stored) return { ...DEFAULT_VISIBLE_STATS };
  // Guard against a stale id from a since-renamed/removed option (shouldn't
  // happen in practice, but a corrupted/hand-edited storage value silently
  // rendering nothing for a whole group would be a confusing dead end).
  const clean = {};
  // CORE_POSITIONS, not POSITIONS — K/DEF have no STAT_OPTION_DEFS entries at
  // all (only the pinned BASIC group applies to them, see claude.md's K/DST
  // section), so there's nothing to validate/store a preference for.
  CORE_POSITIONS.forEach((pos) => {
    const validIds = new Set(STAT_OPTION_DEFS[pos].map((o) => o.id));
    clean[pos] = Array.isArray(stored[pos]) ? stored[pos].filter((id) => validIds.has(id)) : [...DEFAULT_VISIBLE_STATS[pos]];
  });
  return clean;
}
async function saveStatPrefs(prefs) {
  await chrome.storage.local.set({ [K_STAT_PREFS]: prefs });
}

async function loadPlayerStats() {
  const v = await chrome.storage.local.get([K_STATS]);
  return (v[K_STATS] && v[K_STATS].players) || {};
}

// Percentile-only color scale (not diverging like valueColor — a stat has no
// "wrong direction", just elite/average/weak within its own position). Was a
// separate colored dot next to a plain-colored number; simplified to just
// color the number itself — one visual element instead of two saying the
// same thing.
function statTierColor(pct) {
  if (pct === null || pct === undefined) return "var(--dim)";
  if (pct >= 80) return "#5FCF8A";
  if (pct >= 50) return "#F5C242";
  if (pct >= 25) return "#8A8F8C";
  return "var(--dim2)";
}

// All 5 groups (the pinned BASIC group + all 4 positions) are always shown
// rather than collapsing to one generic slot — a row only has real values
// in BASIC (every position has season-long production) and its OWN
// position's group; the other 3 position groups show empty placeholders.
// The label lives in the column header (colored to match that position, via
// POS_COLORS) instead of repeating on every row.
//
// BASIC always occupies slot 0. The rest default to WR, RB, QB, TE — user's
// stated preference for which position to see first absent a selection.
// Selecting a player (panel.js) brings THEIR position to slot 1 (right
// after BASIC, not all the way to the front, since BASIC is pinned there);
// deselecting restores the WR/RB/QB/TE default.
const STAT_GROUP_SEQUENCE = ["BASIC", "QB", "RB", "WR", "TE"]; // fixed DOM order — see renderStatGroups
const DEFAULT_STAT_POS_ORDER = ["WR", "RB", "QB", "TE"];
const STAT_COL_WIDTH = 42; // px per individual stat column
const STAT_GROUP_PAD = 8;  // px horizontal padding per group (4 each side) — 0 if the group has no visible columns
function statGroupOrder(selectedPos) {
  // CORE_POSITIONS, not POSITIONS — K/DEF have no stat group in
  // STAT_GROUP_SEQUENCE at all, so treating one as a valid "bring this
  // position's group forward" target would insert an id with no configured
  // width into the offset math below (statGroupLayout), producing NaN
  // offsets for every group after it.
  const rest = selectedPos && CORE_POSITIONS.includes(selectedPos)
    ? [selectedPos, ...DEFAULT_STAT_POS_ORDER.filter((p) => p !== selectedPos)]
    : DEFAULT_STAT_POS_ORDER;
  return ["BASIC", ...rest];
}

// Group widths are no longer a fixed 134px each — since a user can pick any
// number of stats (0+) per position, a group's width is however many
// columns it actually has right now. Returns {widths:{pos:px}, offsets:
// {pos:px}, totalWidth} for the given order — offsets are cumulative, so
// each group's translateX is just its own offset, no per-slot math needed.
function statGroupLayout(order, visibleStats) {
  const widths = {};
  STAT_GROUP_SEQUENCE.forEach((pos) => {
    const count = pos === "BASIC" ? STAT_META.BASIC.length : (visibleStats[pos] || []).length;
    widths[pos] = count === 0 ? 0 : count * STAT_COL_WIDTH + STAT_GROUP_PAD;
  });
  const offsets = {};
  let x = 0;
  order.forEach((pos) => { offsets[pos] = x; x += widths[pos]; });
  return { widths, offsets, totalWidth: x };
}

// Header row for the stat block — BASIC + 4 position groups, each showing
// only the stats currently selected for that position (see STAT_OPTION_DEFS
// / loadStatPrefs), colored to match (POS_COLORS; BASIC gets the accent
// color since it's not tied to one position). DOM order is always
// STAT_GROUP_SEQUENCE; visual order/width come from inline transform/width
// instead, so an order CHANGE (selecting a player) can animate via CSS
// transition by updating just those values on the existing elements (see
// applyStatGroupOrder in panel.js) rather than re-rendering this HTML.
// Hovering a label shows its full name (data-tip, read by panel.js's
// generalized custom tooltip) instead of the native title="" attribute — a
// browser tooltip can't be styled to match the board and has its own
// built-in show delay.
// sortOpts (optional): { sortablePos, sortColumn, sortDir } — when the board
// is filtered to a single position (QB/RB/WR/TE), that position's OWN stat
// group becomes clickable-to-sort, same pattern as the Rank/ADP Value/Pos
// column headers (#colHead .sortCol in panel.js). Deliberately scoped to
// exactly the filtered position's group, not BASIC or the other 3 groups —
// those are blank for every visible row while filtered, so sorting by them
// would be meaningless. Not offered in ALL/RB+WR combined views, where more
// than one position's data is on screen at once and "sort by this stat"
// would silently ignore rows from other positions.
function renderStatHeaderGroups(order, visibleStats, sortOpts) {
  const { widths, offsets } = statGroupLayout(order, visibleStats);
  const { sortablePos = null, sortColumn = null, sortDir = 1 } = sortOpts || {};
  return STAT_GROUP_SEQUENCE.map((pos) => {
    const color = pos === "BASIC" ? "var(--accent)" : (POS_COLORS && POS_COLORS[pos] ? POS_COLORS[pos].text : "var(--text-primary)");
    const defs = pos === "BASIC" ? STAT_META.BASIC : STAT_OPTION_DEFS[pos].filter((o) => (visibleStats[pos] || []).includes(o.id));
    const sortableHere = pos !== "BASIC" && pos === sortablePos;
    const cells = defs.map((m) => {
      const sortKey = `stat:${pos}:${m.id}`;
      if (!sortableHere) return `<span class="statHeadCol" style="color:${color}" data-tip="${esc(m.full)}">${esc(m.label)}</span>`;
      const active = sortColumn === sortKey;
      const arrow = active ? (sortDir === 1 ? "▲" : "▼") : "";
      return `<span class="statHeadCol sortCol${active ? " active" : ""}" style="color:${color}" data-tip="Click to sort by ${esc(m.full)}" data-sort="${sortKey}">${esc(m.label)}<span class="sortArrow">${arrow}</span></span>`;
    }).join("");
    return `<span class="statHeadGroup" data-pos="${esc(pos)}" style="width:${widths[pos]}px;transform:translateX(${offsets[pos]}px)">${cells}</span>`;
  }).join("");
}

// Row cells for the stat block — same fixed-DOM/transform structure as the
// header above, showing only the position's currently-selected stats (in
// STAT_OPTION_DEFS order, not selection order, so re-picking doesn't
// reshuffle existing columns). BASIC always gets real values (every player
// has a projection); the other 4 groups only show real values for the
// row's OWN position, the rest are blank. Values render plain white (the
// per-stat percentile color-coding read as "too green" in practice) — the
// percentile is still computed and stored (st.pct) in case a more subtle
// treatment is wanted later, it's just not applied to text color right now.
function renderStatGroups(r, statsMap, order, visibleStats) {
  const entry = statsMap[r.key];
  const basicStats = (entry && entry.basic) || [];
  const options = (entry && entry.options) || {};
  const { widths, offsets } = statGroupLayout(order, visibleStats);
  return STAT_GROUP_SEQUENCE.map((pos) => {
    const isBasic = pos === "BASIC";
    const ids = isBasic ? null : (pos === r.pos ? (visibleStats[pos] || []) : []);
    const cells = isBasic
      ? basicStats.map((st) => `<span class="statCol">${esc(st.display)}</span>`).join("")
      : ids.map((id) => {
          const st = options[id];
          return st ? `<span class="statCol">${esc(st.display)}</span>` : `<span class="statCol empty">–</span>`;
        }).join("");
    return `<span class="statGroup" data-pos="${esc(pos)}" style="width:${widths[pos]}px;transform:translateX(${offsets[pos]}px)">${cells}</span>`;
  }).join("");
}

// Re-slots the already-rendered stat groups (header + every visible row) in
// place, without touching anything else — called on player selection/
// deselection (panel.js) instead of a full renderBoard(), so the existing
// DOM elements' transform changes and the CSS transition on
// .statGroup/.statHeadGroup actually animates the slide. A full re-render
// would create brand-new elements with no prior state to animate from.
// Widths don't change on a reorder (only order does), so this only ever
// updates transform, never width — a stat-picker change goes through a full
// renderBoard() instead, since the columns themselves are different.
function applyStatGroupOrder(order, visibleStats) {
  const { offsets } = statGroupLayout(order, visibleStats);
  document.querySelectorAll(".statGroup, .statHeadGroup").forEach((el) => {
    el.style.transform = `translateX(${offsets[el.dataset.pos]}px)`;
  });
}

// ---------- Sleeper auto-fetch (ADP + stats) ----------
// Pure network+parse functions, no DOM/button state — used both by the
// Rankings Manager's manual "⟳ FETCH…" buttons (which wrap these with
// disabled/text-swap UI) and by the board window's silent auto-refresh on
// every load (panel.js's autoRefreshAdpAndStats). Keeping the actual fetch
// logic here, in one place, means the two call sites can't drift.

const MIN_PLAUSIBLE_ADP_PLAYERS = 100; // below this, the response is partial/degraded, not a real ADP set
async function fetchSleeperAdpPlayers() {
  const year = new Date().getFullYear();
  const url = `https://api.sleeper.app/projections/nfl/${year}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF&order_by=pts_ppr`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const raw = Array.isArray(data) ? data : [];
  const adpField = scoringAdpField(); // adp_ppr/adp_half_ppr/adp_std — see "scoring format" above
  const players = raw
    .filter((p) => p.stats && isFinite(p.stats[adpField]) && p.player && POSITIONS.includes(p.player.position))
    .map((p) => ({
      name: `${p.player.first_name} ${p.player.last_name}`,
      pos: p.player.position,
      rank: Number(p.stats[adpField]), // coerced at the boundary — see median() above
    }));
  // Two very different failures used to share one message. If Sleeper ever
  // renames this field, every player fails the shape guard and the old code
  // reported "No ADP data for 2026 season yet" — which in August is an
  // entirely believable thing to read, so you'd shrug and move on instead of
  // noticing their API changed. Tell them apart by whether the response had
  // players in it at all.
  if (!players.length) {
    throw new Error(raw.length
      ? `Sleeper returned ${raw.length} players but none carried a usable ${adpField} value — their API may have changed`
      : `No ADP data for the ${year} season yet`);
  }
  return players;
}

// Storage-level upsert (loads/saves K_ADP directly) — used by the board
// window's silent auto-refresh, which has no local `adpSources` array of its
// own to keep in sync the way the Rankings Manager's button handler does.
// Both surfaces' storage.onChanged listeners pick up the resulting write.
async function upsertAdpSourceInStorage(id, name, color, players) {
  const list = await loadAdpSources();
  const idx = list.findIndex((s) => s.id === id);
  const enabled = idx !== -1 ? list[idx].enabled : true;
  const src = makeAdpSource(name, players, { id, color, enabled });
  if (idx !== -1) list[idx] = src; else list.push(src);
  await saveAdpSources(list);
}

// ---------- built-in K/DEF ranking source ----------
// Every other ranking source in this app (rankings.js, fp-rankings.js) has
// its K/DEF rows stripped on purpose — this project's own league doesn't use
// them, so there's never been bundled rank/tier data for kickers/defenses.
// With K/DST defaulting ON for most users (see K_INCLUDE_KDST above), a
// user who's never imported anything would otherwise see K/DEF players on
// the board with no rank or tier at all. This auto-generates one, refreshed
// the same silent way Sleeper Live ADP is (autoRefreshAdpAndStats below) —
// same source/no-auth endpoint, no CSV, no user action needed.
//
// Ranked by projected PPR points (not ADP) per the reasoning logged when
// this was scoped: ADP for K/DEF is thin/unreliable market data, whereas
// projected points is a real, if rough, quality signal this app already
// trusts elsewhere (BEER). K and DEF are sorted together into ONE combined
// list (not two separately-ranked groups spliced together) — simplest
// defensible ordering for "which of these bottom-of-draft options is better,"
// not a rigorous cross-position value model.
//
// KDST_BASELINE_RANK deliberately pushes every K/DEF player's rank/tier to
// the bottom of the board rather than wherever their raw point total would
// otherwise land them — a top-projected kicker or defense is NOT a real
// early-round-value pick the way that raw number might suggest next to
// skill players, and real draft strategy is "take these last." Tiers 15-16
// (the bottom two of TIER_ORDER's 16) are used for the same reason: it's
// this source's own tier opinion (see buildConsensus's single-source
// passthrough), so where it places them is what the board actually shows
// whenever no other source ranks K/DEF. Both numbers are judgment calls, not
// derived — revisit if real draft data ever suggests they should sit higher/
// lower or split into more than two tiers.
const KDST_BASELINE_RANK = 150;
async function fetchSleeperKdstPlayers() {
  const year = new Date().getFullYear();
  const url = `https://api.sleeper.app/projections/nfl/${year}?season_type=regular&position[]=K&position[]=DEF&order_by=pts_ppr`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const raw = Array.isArray(data) ? data : [];
  const ptsField = scoringPtsField();
  const combined = raw
    .filter((p) => p.player && (p.player.position === "K" || p.player.position === "DEF") && p.stats && isFinite(p.stats[ptsField]))
    .map((p) => ({
      name: `${p.player.first_name} ${p.player.last_name}`.trim(),
      team: p.player.team || "",
      pos: p.player.position,
      pts: p.stats[ptsField],
    }))
    .sort((a, b) => b.pts - a.pts);
  if (!combined.length) throw new Error(`No K/DEF projection data for the ${year} season yet`);
  const n = combined.length;
  return combined.map((p, i) => ({
    name: p.name, team: p.team, pos: p.pos,
    rank: KDST_BASELINE_RANK + i + 1,
    tier: i < n / 2 ? "15" : "16",
  }));
}

const KDST_SOURCE_ID = "kdst_auto";
async function upsertKdstSourceInStorage() {
  const players = await fetchSleeperKdstPlayers();
  const list = await loadSources();
  const idx = list.findIndex((s) => s.id === KDST_SOURCE_ID);
  const enabled = idx !== -1 ? list[idx].enabled : true;
  const src = makeSource("Kickers & Defenses (Sleeper)", players, { id: KDST_SOURCE_ID, color: "#6E8CAE", enabled });
  if (idx !== -1) list[idx] = src; else list.push(src);
  await saveSources(list);
}

// Percentile of each value within its own position group (0-100, higher =
// better) — small (~100-150 player) arrays, so a plain sort is plenty fast.
function percentileRanker(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return (v) => {
    if (n <= 1) return 50;
    // index of the first value >= v — ties land on the same percentile
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid; }
    return Math.round((lo / (n - 1)) * 100);
  };
}

const MIN_PLAUSIBLE_STATS_PLAYERS = 100;

// Computes each team's total pass-catcher targets from a /stats/ response —
// the denominator the "tgt_share" option needs, since no single player
// field carries it. Only summed across RB/WR/TE — QBs don't receive targets,
// and K/DEF are never fetched into statList in the first place (see
// fetchSleeperStatsPlayers's posQuery below, deliberately QB/RB/WR/TE only —
// K/DEF get BASIC stats from a separate fetch, not this per-position one).
function buildTeamTargetTotals(statPlayers) {
  const totals = new Map();
  statPlayers.forEach((p) => {
    const team = p.player && p.player.team;
    const tgt = p.stats && p.stats.rec_tgt;
    if (!team || !isFinite(tgt)) return;
    totals.set(team, (totals.get(team) || 0) + tgt);
  });
  return totals;
}

// Fetches EVERY selectable stat (STAT_OPTION_DEFS, all 6 per position) plus
// the pinned BASIC group — not just whichever ones are currently visible —
// so changing the stat picker's selection only needs a re-render, never a
// re-fetch. Pulls from two Sleeper endpoints, same domain/no-auth as the
// ADP fetch above:
//  - current-year /v1/projections — BASIC's years-of-experience/projected
//    points, plus the original correlation-research set's forward-looking
//    options (pass_proj/rush_proj/proj_ppr/rush_att_proj/rec_proj)
//  - prior-year /v1/stats — every per-game/per-snap usage rate, plus
//    target share/air yards/red-zone targets (that same original set's
//    prior-season role stats) — describing an established usage profile,
//    not a single-season point estimate the way BASIC's PROJ is
// Returns { year, players, playerCount } — throws on a degraded/failed fetch.
async function fetchSleeperStatsPlayers() {
  const year = new Date().getFullYear();
  // The prior-year role/usage stats (statRes below) only ever feed
  // STAT_OPTION_DEFS' per-position "options", which K/DEF don't have — no
  // need to fetch that data for them. The current-year projections (projRes)
  // DO need to include K/DEF, since that's where BASIC's EXP/PROJ/P-WK comes
  // from, and K/DEF get BASIC stats like every other position.
  const posQueryStat = "position[]=QB&position[]=RB&position[]=WR&position[]=TE";
  const posQueryProj = `${posQueryStat}&position[]=K&position[]=DEF`;
  const [projRes, statRes] = await Promise.all([
    fetch(`https://api.sleeper.app/projections/nfl/${year}?season_type=regular&${posQueryProj}&order_by=pts_ppr`),
    fetch(`https://api.sleeper.app/stats/nfl/${year - 1}?season_type=regular&${posQueryStat}&order_by=pts_ppr`),
  ]);
  if (!projRes.ok) throw new Error(`Projections HTTP ${projRes.status}`);
  if (!statRes.ok) throw new Error(`Stats HTTP ${statRes.status}`);
  const projRaw = await projRes.json();
  const statRaw = await statRes.json();
  const projList = Array.isArray(projRaw) ? projRaw : [];
  const statList = Array.isArray(statRaw) ? statRaw : [];

  if (!projList.length || !statList.length) {
    throw new Error(`Sleeper returned no usable data (${projList.length} projections, ${statList.length} stats) — the ${year - 1} season's stats may not be published yet`);
  }

  const teamTargetTotals = buildTeamTargetTotals(statList);
  // Scoring format (see the "scoring format" section above) — read once,
  // reused for both the current-year projection below (BASIC's PROJ/P-WK)
  // and the prior-year fpPerDropback rate further down. Property name stays
  // `ptsPpr` for both regardless of the actual format in use — an internal
  // identifier, not a claim about which field it came from.
  const ptsField = scoringPtsField();

  // Current-year projected volume, keyed by playerKey.
  const projByKey = new Map();
  projList.forEach((p) => {
    if (!p.player || !POSITIONS.includes(p.player.position) || !p.stats) return;
    const key = playerKey(`${p.player.first_name} ${p.player.last_name}`, p.player.position);
    projByKey.set(key, {
      pos: p.player.position,
      ptsPpr: isFinite(p.stats[ptsField]) ? p.stats[ptsField] : null,
      yearsExp: isFinite(p.player.years_exp) ? p.player.years_exp : null,
      passYd: isFinite(p.stats.pass_yd) ? p.stats.pass_yd : null,
      rushYd: isFinite(p.stats.rush_yd) ? p.stats.rush_yd : null,
      rushAtt: isFinite(p.stats.rush_att) ? p.stats.rush_att : null,
      rec: isFinite(p.stats.rec) ? p.stats.rec : null,
    });
  });

  // Prior-year role/usage stats, keyed by playerKey. `tm_off_snp` (team
  // offensive snap total) is already a precomputed field on every player
  // row, so the snap-share option needs no separate team-total pass the
  // way target share does above.
  const rateByKey = new Map();
  statList.forEach((p) => {
    if (!p.player || !POSITIONS.includes(p.player.position) || !p.stats) return;
    const key = playerKey(`${p.player.first_name} ${p.player.last_name}`, p.player.position);
    const s = p.stats;
    const team = p.player.team;
    const teamTgtTotal = team ? teamTargetTotals.get(team) : null;
    const gp = isFinite(s.gp) && s.gp > 0 ? s.gp : null;
    const offSnp = isFinite(s.off_snp) && s.off_snp > 0 ? s.off_snp : null;
    const dropbacks = isFinite(s.pass_att) ? s.pass_att + (isFinite(s.pass_sack) ? s.pass_sack : 0) : null;
    const tgt = s.rec_tgt;
    rateByKey.set(key, {
      pos: p.player.position,
      tgtShare: isFinite(tgt) && teamTgtTotal ? (tgt / teamTgtTotal) * 100 : null,
      airYd: isFinite(s.rec_air_yd) ? s.rec_air_yd : null,
      rzTgt: isFinite(s.rec_rz_tgt) ? s.rec_rz_tgt : null,
      rushYdPerG: gp && isFinite(s.rush_yd) ? s.rush_yd / gp : null,
      passAttPerG: gp && isFinite(s.pass_att) ? s.pass_att / gp : null,
      fpPerDropback: dropbacks && isFinite(s[ptsField]) ? s[ptsField] / dropbacks : null,
      recPerG: gp && isFinite(s.rec) ? s.rec / gp : null,
      snapsPerG: gp && offSnp ? offSnp / gp : null,
      rushAttPerG: gp && isFinite(s.rush_att) ? s.rush_att / gp : null,
      tgtPerG: gp && isFinite(s.rec_tgt) ? s.rec_tgt / gp : null,
      tgtPerSnap: offSnp && isFinite(s.rec_tgt) ? s.rec_tgt / offSnp : null,
      ydPerSnap: offSnp && isFinite(s.rec_yd) ? s.rec_yd / offSnp : null,
      snapShare: offSnp && isFinite(s.tm_off_snp) && s.tm_off_snp > 0 ? (offSnp / s.tm_off_snp) * 100 : null,
    });
  });

  // Maps a STAT_OPTION_DEFS id to its raw numeric value for one player,
  // pulling from whichever of proj/rate actually carries it. Centralizing
  // this instead of a per-position if/else block is what lets percentiles
  // and display formatting below iterate STAT_OPTION_DEFS generically,
  // regardless of which options a user has selected.
  function rawOptionValue(id, proj, rate) {
    switch (id) {
      case "pass_proj": return proj.passYd;
      case "rush_proj": return proj.rushYd;
      case "proj_ppr": return proj.ptsPpr;
      case "rush_att_proj": return proj.rushAtt;
      case "rec_proj": return proj.rec;
      case "tgt_share": return rate.tgtShare;
      case "air_yd": return rate.airYd;
      case "rz_tgt": return rate.rzTgt;
      case "rush_yd_g": return rate.rushYdPerG;
      case "pass_att_g": return rate.passAttPerG;
      case "fpdb": return rate.fpPerDropback;
      case "rec_g": return rate.recPerG;
      case "snaps_g": return rate.snapsPerG;
      case "rush_att_g": return rate.rushAttPerG;
      case "tgt_g": return rate.tgtPerG;
      case "tgt_per_snap": return rate.tgtPerSnap;
      case "yd_per_snap": return rate.ydPerSnap;
      case "snap_share": return rate.snapShare;
      default: return null;
    }
  }
  function rawBasicValue(id, proj) {
    if (id === "exp") return proj.yearsExp;
    if (id === "proj") return proj.ptsPpr;
    if (id === "perwk") return proj.ptsPpr != null ? proj.ptsPpr / 17 : null;
    return null;
  }
  const BASIC_IDS = ["exp", "proj", "perwk"]; // order matches STAT_META.BASIC

  // Per-label display formatting — whole numbers for season totals/counts
  // (EXP/PROJ/PASS/RUSH/ATT/REC/AIR/RZ), one decimal for per-game rates
  // (P/WK and every "X/G" label), a percent for the two share stats, two
  // decimals for the small per-snap/per-dropback ratios (TPS/YPS/FPDB),
  // which would round to 0 at 1 decimal.
  const formatDisplay = (label, value) => {
    if (label === "TGT%" || label === "SNP%") return `${value.toFixed(0)}%`;
    if (label === "TPS" || label === "YPS" || label === "FPDB") return value.toFixed(2);
    if (label === "P/WK" || label === "RU/G" || label === "AT/G" || label === "RC/G" || label === "SN/G" || label === "TG/G") return value.toFixed(1);
    return Math.round(value).toString();
  };

  // Every player who shows up in EITHER response — most starters/rotation
  // players are in both, but a rookie (no prior-year stats) or someone who
  // missed all of last season (no meaningful rate stats) legitimately isn't.
  const allKeys = new Set([...projByKey.keys(), ...rateByKey.keys()]);
  const byPos = {};
  POSITIONS.forEach((pos) => { byPos[pos] = []; });
  allKeys.forEach((key) => {
    const proj = projByKey.get(key);
    const rate = rateByKey.get(key);
    const pos = (proj && proj.pos) || (rate && rate.pos);
    if (pos && byPos[pos]) byPos[pos].push({ key, proj: proj || {}, rate: rate || {} });
  });

  const players = {};
  POSITIONS.forEach((pos) => {
    const entries = byPos[pos];

    // BASIC — percentiles computed within this position (a 10-year veteran
    // QB and a 10-year veteran TE aren't being compared to each other). Real
    // for every position including K/DEF (they just came from a narrower
    // fetch above — see posQueryProj — with no rate/options data attached).
    const basicRanks = BASIC_IDS.map((id) =>
      percentileRanker(entries.map((e) => rawBasicValue(id, e.proj)).filter((v) => v != null))
    );
    entries.forEach(({ key, proj }) => {
      const basic = STAT_META.BASIC.map((m, i) => {
        const v = rawBasicValue(BASIC_IDS[i], proj);
        return v == null ? null : { label: m.label, full: m.full, value: v, pct: basicRanks[i](v), display: formatDisplay(m.label, v) };
      }).filter(Boolean);
      if (basic.length) { players[key] = players[key] || {}; players[key].basic = basic; }
    });

    // Every selectable option for this position — always computed, so the
    // stat picker only changes what renderStatGroups reads, never what got
    // fetched. K/DEF have no STAT_OPTION_DEFS entry at all (see claude.md —
    // "no K or DEF stats other than EXP/PROJ/P-WK"), so optionDefs is simply
    // empty for them and `options` never gets set below — renderStatGroups
    // already shows a blank placeholder for any position with no options.
    const optionDefs = STAT_OPTION_DEFS[pos] || [];
    const optionRanks = {};
    optionDefs.forEach((def) => {
      optionRanks[def.id] = percentileRanker(
        entries.map((e) => rawOptionValue(def.id, e.proj, e.rate)).filter((v) => v != null)
      );
    });
    entries.forEach(({ key, proj, rate }) => {
      const options = {};
      optionDefs.forEach((def) => {
        const v = rawOptionValue(def.id, proj, rate);
        if (v == null) return;
        options[def.id] = { label: def.label, full: def.full, value: v, pct: optionRanks[def.id](v), display: formatDisplay(def.label, v) };
      });
      if (Object.keys(options).length) { players[key] = players[key] || {}; players[key].options = options; }
    });
  });

  return { year, players, playerCount: Object.keys(players).length };
}

async function saveStatsToStorage(year, players) {
  await chrome.storage.local.set({ [K_STATS]: { updatedAt: Date.now(), year, players } });
}

// EXPERIMENTAL (queue/draft-write branch) — playerKey -> Sleeper's own
// numeric player_id, built from the same projections endpoint
// fetchSleeperAdpPlayers/fetchSleeperStatsPlayers already call (each entry
// there carries a top-level player_id alongside the nested player object;
// confirmed via a direct query before wiring this in, not assumed). No new
// fetch, no new host permission — this just captures a field that request
// already returns and was previously discarded.
//
// Also captures injury_status/injury_body_part off the same nested `player`
// object, for the same reason (same request, previously discarded field) —
// see the injury-status feature's own comment above `INJURY_META` below.
// Sleeper does NOT expose the underlying news/story text on this endpoint —
// only status + body part, no reporting copy — so that's all this can ever
// surface; don't go looking for an `injury_notes` field to display, it's not
// reliably populated on the public projections response.
async function fetchSleeperPlayerIdMap() {
  const year = new Date().getFullYear();
  // Includes K/DEF: a DEF's "player_id" here is Sleeper's own team-code
  // pseudo-id (e.g. "LAR", confirmed by direct query) — that's the exact unit
  // Sleeper's draft-write API (draft_pick_player/update_draft_queue) expects
  // for drafting/queuing a defense, so it needs to flow through the same map
  // real players' numeric ids do. avatarHtml() knows not to treat it as a
  // headshot image id (see its own comment) — this map's contract is "the id
  // Sleeper uses to draft this", not "has a real headshot".
  const url = `https://api.sleeper.app/projections/nfl/${year}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF&order_by=pts_ppr`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const raw = Array.isArray(data) ? data : [];
  const ids = {};
  const injuries = {};
  raw.forEach((p) => {
    if (!p.player || !p.player_id || !POSITIONS.includes(p.player.position)) return;
    const key = playerKey(`${p.player.first_name} ${p.player.last_name}`, p.player.position);
    ids[key] = String(p.player_id);
    if (p.player.injury_status) {
      injuries[key] = {
        status: p.player.injury_status,
        bodyPart: p.player.injury_body_part || "",
        updatedAt: p.player.injury_start_date || null,
      };
    }
  });
  return { ids, injuries };
}

async function saveSleeperIdMapToStorage(ids) {
  await chrome.storage.local.set({ [K_SLEEPER_IDS]: { updatedAt: Date.now(), ids } });
}

async function loadSleeperIdMap() {
  const v = await chrome.storage.local.get([K_SLEEPER_IDS]);
  return (v[K_SLEEPER_IDS] && v[K_SLEEPER_IDS].ids) || {};
}

async function saveInjuriesToStorage(injuries) {
  await chrome.storage.local.set({ [K_INJURIES]: { updatedAt: Date.now(), injuries } });
}

async function loadInjuries() {
  const v = await chrome.storage.local.get([K_INJURIES]);
  return (v[K_INJURIES] && v[K_INJURIES].injuries) || {};
}

// Separate from loadInjuries() above (which every render site calls just for
// the map) — only the status dropdown's freshness line needs the timestamp,
// so this stays its own small read rather than changing loadInjuries()'s
// return shape for every caller.
async function loadInjuriesUpdatedAt() {
  const v = await chrome.storage.local.get([K_INJURIES]);
  return (v[K_INJURIES] && v[K_INJURIES].updatedAt) || null;
}

// ---------- injury status badge ----------
// Sleeper's own injury_status strings, mapped to a short code + a severity
// bucket that drives color. Anything not in this table (a status Sleeper
// adds later, or a typo'd value) falls back to a 3-letter clip of the raw
// string with the neutral "other" severity, rather than being dropped —
// same "unrecognized label passes through, doesn't vanish" principle as
// normalizeTierLabel() elsewhere in this file.
const INJURY_META = {
  Questionable: { code: "Q", sev: "q", label: "Questionable" },
  Doubtful: { code: "D", sev: "d", label: "Doubtful" },
  Out: { code: "O", sev: "o", label: "Out" },
  IR: { code: "IR", sev: "ir", label: "Injured Reserve" },
  PUP: { code: "PUP", sev: "other", label: "Physically Unable to Perform" },
  NA: { code: "NA", sev: "other", label: "Not Active" },
  Suspended: { code: "SUS", sev: "other", label: "Suspended" },
  DNR: { code: "DNR", sev: "other", label: "Did Not Report" },
  COV: { code: "COV", sev: "other", label: "COVID-19" },
};

// inj: { status, bodyPart, updatedAt } | undefined, from the K_INJURIES map.
// opts.useTitle: rankings-manager.js has no data-tip hover-tooltip infra (see
// panel.js's showTip/hideTip), so it renders a plain native title="" instead —
// same fallback flagBadge's callers already split on per-surface.
function injuryBadge(inj, opts) {
  if (!inj || !inj.status) return "";
  const meta = INJURY_META[inj.status] || { code: inj.status.slice(0, 3).toUpperCase(), sev: "other", label: inj.status };
  const tipText = inj.bodyPart ? `${meta.label} — ${inj.bodyPart}` : meta.label;
  const { useTitle = false } = opts || {};
  const attr = useTitle ? `title="${esc(tipText)}"` : `data-tip="${esc(tipText)}"`;
  return `<span class="injBadge t-${meta.sev}" ${attr}>${esc(meta.code)}</span>`;
}

// Silent auto-refresh, called on load by both surfaces (panel.js's board
// window and rankings-manager.js's init) so ADP/usage data doesn't go stale
// between manual button clicks. Failures are logged, not toasted/thrown —
// callers already rendered with whatever was last saved, and each surface's
// storage.onChanged listener re-renders once (if) fresh data lands.
async function autoRefreshAdpAndStats() {
  try {
    const players = await fetchSleeperAdpPlayers();
    await upsertAdpSourceInStorage("adp_sleeper_live", "Sleeper Live ADP", "#5FA8E8", players);
  } catch (e) {
    console.warn("[4th&Go] auto-refresh of Sleeper ADP failed", e);
  }
  try {
    const { year, players } = await fetchSleeperStatsPlayers();
    await saveStatsToStorage(year, players);
  } catch (e) {
    console.warn("[4th&Go] auto-refresh of stat columns failed", e);
  }
  try {
    const { ids, injuries } = await fetchSleeperPlayerIdMap();
    await saveSleeperIdMapToStorage(ids);
    await saveInjuriesToStorage(injuries);
  } catch (e) {
    console.warn("[4th&Go] auto-refresh of Sleeper player IDs/injuries failed", e);
  }
  // Gated on the master toggle (default true) — a user who's turned K/DST
  // off shouldn't have this quietly refetching/upserting in the background.
  try {
    if (await loadIncludeKdst()) await upsertKdstSourceInStorage();
  } catch (e) {
    console.warn("[4th&Go] auto-refresh of the built-in K/DEF source failed", e);
  }
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

// Finds pairs of DIFFERENT player identities (post-merge) that look like the
// same real person under two different name spellings — same last name +
// first initial + position, the same fallback rule findNearMatchOrphans and
// matchPick already trust elsewhere. Added 2026-08-27 after a real gap was
// found live: findOrphans (above) only ever flags a name that appears in
// EXACTLY ONE source, so it's blind to a name variant that happens to be
// used by TWO OR MORE sources at once (e.g. two different creators who both
// abbreviate "Puka Nacua" as "P. Nacua") — that variant looks like a fully
// corroborated, legitimate player to findOrphans, not a lone anomaly, even
// though it's really the same person as "Puka Nacua" sitting in a separate
// row. This scans every DISTINCT identity actually on the board (not just
// single-source orphans), so it catches that case too.
//
// Ambiguity-safety, same discipline as findNearMatchOrphans: a pair is only
// reported when it's a TRUE MUTUAL match — each side's own name search finds
// the other as its one and only candidate. A one-directional match (e.g.
// "Jaylen Gibbs" and "Jahmyr Gibbs" would both separately look like a match
// for "J. Gibbs", but "J. Gibbs" itself can't tell which) is deliberately
// left alone rather than guessed.
//
// Fixed 2026-08-27, same day this shipped — a real user hit this immediately:
// "last name + first initial" alone is FAR too loose applied across an entire
// board's worth of real players (350+), since plenty of genuinely different
// people legitimately share a last name and first initial (two different
// "D. Johnson"s, "A. Brown"s, etc. across real rankings) — that produced
// "hundreds" of false-positive pairs, not the rare true duplicate this was
// built for. The actual signal that makes this safe (and matches
// findNearMatchOrphans's own real use, which is always "is THIS ONE
// specific known orphan name an abbreviation of something else," not a
// full-board sweep) is an ABBREVIATION collision specifically: one side's
// first name is a bare single-letter initial ("P.", "K.") and the other
// side spells the same initial out in full. Two full names that happen to
// share a last name + initial (neither one abbreviated) are just as likely
// to be two different real players and are no longer matched at all.
function isAbbreviatedFirstName(name) {
  const first = norm(name).split(" ")[0] || "";
  return first.length === 1;
}
function findPossibleDuplicates(sources, merges = {}) {
  const enabled = usableSources(sources).filter((s) => s.enabled);
  const byPos = {}; // pos -> Map<key, {key,name,pos,teams:Set}>, one entry per distinct post-merge identity
  enabled.forEach((src) => {
    src.players.forEach((p) => {
      if (!p.pos) return;
      const key = applyMerge(playerKey(p.name, p.pos), merges);
      if (!byPos[p.pos]) byPos[p.pos] = new Map();
      if (!byPos[p.pos].has(key)) byPos[p.pos].set(key, { key, name: p.name, pos: p.pos, teams: new Set() });
      // Collect every team seen for this identity across ALL enabled sources
      // (not just the first) — this is what lets team-based disambiguation
      // below work regardless of how many/which sources happen to be enabled.
      if (p.team) byPos[p.pos].get(key).teams.add(String(p.team).toUpperCase().trim());
    });
  });

  const pairs = [];
  Object.values(byPos).forEach((posMap) => {
    const entries = [...posMap.values()];
    // Each entry's own single unique near-match candidate, if any — same
    // rule as findNearMatchOrphans, applied within this one position's pool.
    const candidateOf = new Map(); // key -> the one other key it looks like, or absent if none/ambiguous
    entries.forEach((a) => {
      const normA = norm(a.name);
      const lastA = normA.split(" ").slice(-1)[0];
      const firstA = normA.charAt(0);
      const aAbbrev = isAbbreviatedFirstName(a.name);
      let matches = entries.filter((b) => {
        if (b.key === a.key) return false;
        if (norm(b.name).charAt(0) !== firstA || !norm(b.name).endsWith(" " + lastA)) return false;
        // Require exactly one side to be a bare initial — two full names
        // sharing a last name + initial are a coincidence, not a duplicate.
        return aAbbrev !== isAbbreviatedFirstName(b.name);
      });
      // Fixed 2026-08-27, same day — with MANY sources enabled, a common
      // last name + initial (e.g. "J. Gibbs") can coincidentally match more
      // than one real full name (Jahmyr AND Jaylen Gibbs), which correctly
      // fails the "exactly one candidate" ambiguity check — but that same
      // ambiguity check was also silently swallowing genuinely real
      // duplicates the moment a board had enough sources/players enabled for
      // any coincidental third name to exist, which is why toggling sources
      // on/off changed how many pairs showed up: fewer sources enabled meant
      // a smaller, less ambiguous pool, so real dupes started passing again.
      // Team is real disambiguating signal that doesn't shrink or grow with
      // how many sources are enabled — if exactly one of several same-name
      // candidates shares a known team with `a`, that's the real match,
      // full stop, regardless of how many other same-last-name people exist
      // elsewhere in the league.
      if (matches.length > 1 && a.teams.size) {
        const teamMatches = matches.filter((b) => [...b.teams].some((t) => a.teams.has(t)));
        if (teamMatches.length === 1) matches = teamMatches;
      }
      if (matches.length === 1) candidateOf.set(a.key, matches[0].key);
    });
    const seen = new Set();
    entries.forEach((a) => {
      const bKey = candidateOf.get(a.key);
      if (!bKey || candidateOf.get(bKey) !== a.key) return; // require a true mutual match, not one-directional
      const pairId = [a.key, bKey].sort().join("~~");
      if (seen.has(pairId)) return;
      seen.add(pairId);
      const b = entries.find((e) => e.key === bKey);
      pairs.push({ keyA: a.key, nameA: a.name, keyB: b.key, nameB: b.name, pos: a.pos });
    });
  });
  return pairs;
}

// ---------- BEER / VBD (backlog #8) ----------
// Value-Based Drafting, BEER (man-games) baseline. See claude.md for the full
// writeup, including why BEER (not VOLS/BEER+) is the target and what's
// deliberately out of scope (risk-adjustment, QB streaming, roster-need
// discounting). Plain summary: value = a player's projected PPR points minus
// the projected points of the "replacement-level" player at their position —
// the player you could still get for free at that spot. That subtraction is
// what makes values comparable ACROSS positions (raw point totals aren't:
// a QB's raw total dwarfs a TE's and says nothing about relative value).

// This league's DEFAULT shape (10 teams, full PPR, 1QB/2RB/2WR/1TE/2FLEX/1K,
// no DEF — see claude.md) — used until a real draft's own settings sync in
// (see applySyncedLeagueSettings below), and as the permanent fallback for
// any field a synced draft doesn't provide. `let`, not `const`: unlike when
// this was first built for one specific league, other users' leagues have
// different team counts/starter slots, and REPLACEMENT_RANK needs to reflect
// THEIR league, not this project's own — see applySyncedLeagueSettings.
let LEAGUE_SETTINGS = {
  teams: 10,
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1 },
  flexSlots: 2, // FLEX-eligible: RB/WR/TE
};

// No authoritative real-world number exists for how FLEX starts actually
// split across RB/WR/TE. Documented assumption, not derived: full PPR
// flattens RB/WR value enough that flex usage skews roughly even between
// them; TE sees much less flex usage in practice since a flex-worthy TE
// is almost always started outright at the TE slot instead. Revisit if
// replacement ranks below look off against real draft behavior. K is never
// FLEX-eligible in a standard league, so it has no entry here — its
// replacement rank below comes from its own starter slots only.
const FLEX_SHARE = { RB: 0.45, WR: 0.45, TE: 0.10 };

const SEASON_GAMES = 17;

// The "man-games" piece of BEER: converts "how many starter-slots does the
// league need" into "how many players deep do you actually need to draft to
// cover a full season," by dividing total starter man-games needed by the
// average games a rostered player around THAT DEPTH actually plays.
// Starters alone undercount replacement depth — byes, injuries, and
// in-season bench churn pull more than just the nominal starter count into
// starting lineups over a season.
//
// Used to be one guessed flat constant per position (QB 14, RB 11.5, WR/TE
// 13.5) — replaced (2026-08-25) with GAMES_PLAYED_CURVE (games-played-data.js),
// a real games-played-by-finish-rank curve built from 3 seasons of Sleeper's
// own stats (see build-games-played-data.js). Real data overturned part of
// the original guess: QB's curve drops off steeply (a rank-40 QB is almost
// always a backup who only played because a starter got hurt, averaging
// ~7 games), but RB/WR/TE stay much flatter through rank 60 (~14-15 games)
// than assumed — a mid/low-rank RB is usually a healthy committee/timeshare
// player, not an injured one, so "RB misses the most games" was wrong as a
// blanket assumption. This is why RB's replacement rank changed materially
// once real data replaced the guess — see claude.md for the honest before/
// after comparison and the caveat about what this curve does and doesn't
// measure (season-end finish rank blends injury attrition with committee/
// opportunity share, especially at RB — it is NOT a pure health/availability
// measure, just the closest real proxy available without deeper play-by-play
// data).
//
// K (added for K/DST support, 2026-08-26) uses this exact same real-data
// pipeline, not a guess — confirmed live that Sleeper's stats endpoint
// carries the same gp/pos_rank_ppr fields for kickers, so
// build-games-played-data.js just fetches K alongside QB/RB/WR/TE. The real
// curve shows something a flat guess never would have: kickers play almost
// every game through roughly the top 30 (16-17), then fall off a cliff
// (streaming/committee kickers barely play at all) — a much sharper cutoff
// than any other position. DEF has no entry here and never will: see
// BEER_POSITIONS below for why a team defense doesn't fit this man-games
// model in the first place.
function gamesPlayedAt(pos, rank) {
  const curve = GAMES_PLAYED_CURVE[pos];
  const idx = Math.min(curve.length, Math.max(1, Math.round(rank))) - 1;
  return curve[idx];
}

// Every position BEER's replacement-level math actually applies to — every
// CORE_POSITIONS entry plus K (added for K/DST support: kickers are
// individual players who can be benched/injured/have byes, so the same
// man-games replacement model reasonably applies, now backed by K's own
// real games-played curve above rather than a guess). DEF is deliberately
// excluded, permanently: a team defense is a fixed 32-entity pool with no
// waiver-replenishment churn the way an individual player has, so "how many
// man-games deep before you hit replacement level" isn't a coherent question
// for it. buildBeerValues below never computes a DEF entry as a result —
// there is no workaround planned for this, DEF just doesn't participate in
// BEER (see claude.md's K/DST section for the full reasoning, including the
// separate raw-points-based league-rank substitute used elsewhere instead).
const BEER_POSITIONS = [...CORE_POSITIONS, "K"];

// REPLACEMENT_RANK[pos] = how many players deep (by projected points) you
// have to go at that position before you hit "replacement level" for this
// league's exact shape. Recomputed whenever LEAGUE_SETTINGS changes (see
// applySyncedLeagueSettings) — the depth itself is a function of league
// shape, but WHICH player sits at that depth is not (see buildBeerValues
// below, which recomputes live off the current draft state).
//
// Games-played varies BY rank (the curve above), not a single constant,
// which makes this circular — the answer depends on which games-played
// value you look up, which depends on the answer. Solved by iterating a
// few times: start from a reasonable guess, look up games-played AT that
// depth, recompute the depth, repeat until it stops moving (in practice
// this converges in 2-3 iterations since the curve is smooth, not a cliff).
function computeReplacementRanks() {
  const flexSlotsTotal = LEAGUE_SETTINGS.flexSlots * LEAGUE_SETTINGS.teams;
  const ranks = {};
  BEER_POSITIONS.forEach((pos) => {
    const base = (LEAGUE_SETTINGS.starters[pos] || 0) * LEAGUE_SETTINGS.teams;
    const flexShare = Math.round(flexSlotsTotal * (FLEX_SHARE[pos] || 0));
    const starterSlots = base + flexShare;
    let rank = 20; // starting guess, refined below
    for (let i = 0; i < 5; i++) {
      const gamesPlayed = gamesPlayedAt(pos, rank);
      rank = Math.max(1, Math.ceil((starterSlots * SEASON_GAMES) / gamesPlayed));
    }
    ranks[pos] = rank;
  });
  return ranks;
}
let REPLACEMENT_RANK = computeReplacementRanks();

// Syncs LEAGUE_SETTINGS from a real draft's own settings (Sleeper's
// GET /v1/draft/{id} response, already fetched by panel.js's
// fetchDraftSettings for the Roster popover's slot counts) and recomputes
// REPLACEMENT_RANK off the result — this is what makes BEER's replacement-
// level math work for OTHER leagues' shapes, not just this project's own
// 10-team/1QB/2RB/2WR/1TE/2FLEX default. Only overwrites a field when the
// synced value is actually a finite number; anything missing/malformed keeps
// whatever LEAGUE_SETTINGS already had (this project's own league's shape,
// or whatever a previous successful sync left it at) rather than corrupting
// it with a partial/bad response. `teams` is read straight from Sleeper's
// settings object — confirmed present on a real draft's settings alongside
// slots_qb/rb/wr/te/flex/bn (same response fetchDraftSettings already
// trusts for those). Callers must re-render after calling this — it doesn't
// trigger one itself, same as every other pure data function in this file.
function applySyncedLeagueSettings(draftSettings) {
  if (!draftSettings) return;
  const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
  LEAGUE_SETTINGS = {
    teams: num(draftSettings.teams, LEAGUE_SETTINGS.teams),
    starters: {
      QB: num(draftSettings.slots_qb, LEAGUE_SETTINGS.starters.QB),
      RB: num(draftSettings.slots_rb, LEAGUE_SETTINGS.starters.RB),
      WR: num(draftSettings.slots_wr, LEAGUE_SETTINGS.starters.WR),
      TE: num(draftSettings.slots_te, LEAGUE_SETTINGS.starters.TE),
      K: num(draftSettings.slots_k, LEAGUE_SETTINGS.starters.K),
    },
    flexSlots: num(draftSettings.slots_flex, LEAGUE_SETTINGS.flexSlots),
  };
  REPLACEMENT_RANK = computeReplacementRanks();
}

// Sleeper's projections endpoint — same domain, same no-auth public endpoint
// fetchSleeperAdp() already calls in rankings-manager.js for adp_ppr, just
// reading pts_ppr off the same response shape instead. No new host
// permission, no new import mechanism — this was a deliberate choice (see
// claude.md) to keep ADP and projections on one consistent philosophy rather
// than inventing a CSV path for one and a live fetch for the other.
async function fetchSleeperProjections() {
  const year = new Date().getFullYear();
  // Includes K/DEF, even though DEF never gets a real BEER value (see
  // BEER_POSITIONS/REPLACEMENT_RANK above) — DEF's raw projected points are
  // still needed as the substitute metric for its league-rank badge
  // (buildPositionRankValueMap below), so projMap has to carry them too.
  const url = `https://api.sleeper.app/projections/nfl/${year}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF&order_by=pts_ppr`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const raw = Array.isArray(data) ? data : [];
  const ptsField = scoringPtsField();
  const players = raw
    .filter((p) => p.stats && isFinite(p.stats[ptsField]) && p.player && POSITIONS.includes(p.player.position))
    .map((p) => ({
      key: playerKey(`${p.player.first_name} ${p.player.last_name}`, p.player.position),
      pts: Number(p.stats[ptsField]),
    }));
  if (!players.length) {
    throw new Error(raw.length
      ? `Sleeper returned ${raw.length} players but none carried a usable ${ptsField} projection — their API may have changed`
      : `No projections for the ${year} season yet`);
  }
  return players;
}

async function loadProjections() {
  const store = await chrome.storage.local.get(K_PROJ);
  return (store[K_PROJ] && store[K_PROJ].map) || {};
}

async function saveProjections(map) {
  await chrome.storage.local.set({ [K_PROJ]: { year: new Date().getFullYear(), fetchedAt: Date.now(), map } });
}

// Silent background refresh, same pattern as the ADP/stat auto-fetches —
// logs and gives up quietly on failure rather than surfacing a toast on
// every board-window open.
async function autoRefreshProjections() {
  try {
    const players = await fetchSleeperProjections();
    const map = {};
    players.forEach((p) => { map[p.key] = p.pts; });
    await saveProjections(map);
    return map;
  } catch (err) {
    console.warn("[4th&Go] BEER projections auto-fetch failed:", err.message);
    return null;
  }
}

// The live part of BEER: replacement level for a position is the projection
// of the Nth-best player who is STILL AVAILABLE there (N = REPLACEMENT_RANK,
// fixed by league shape). As players at a position get drafted off the top,
// the player occupying that Nth-deepest available slot gets worse — so
// replacement level, and therefore every remaining player's value at that
// position, degrades in real time as the draft progresses. No separate
// polling needed: this just reads whatever draft state (taken/manualTaken)
// the existing pick-sync plumbing already has, recomputed on every render.
function buildBeerValues(rows, projMap, takenKeySet = new Set()) {
  const byPos = {};
  rows.forEach((r) => {
    // DEF never gets a BEER value, full stop — see BEER_POSITIONS/
    // REPLACEMENT_RANK above for why a team defense doesn't fit the
    // man-games replacement model. Gating on REPLACEMENT_RANK having an
    // entry (rather than relying on the `|| available.length` fallback
    // below) means a position with no entry is silently skipped entirely,
    // not given a degenerate "replacement = worst available" value.
    if (REPLACEMENT_RANK[r.pos] === undefined) return;
    const pts = projMap[r.key];
    if (pts === undefined) return;
    (byPos[r.pos] = byPos[r.pos] || []).push({ key: r.key, pts, taken: takenKeySet.has(r.key) });
  });
  const replacementByPos = {};
  Object.keys(byPos).forEach((pos) => {
    const available = byPos[pos].filter((p) => !p.taken).sort((a, b) => b.pts - a.pts);
    const n = REPLACEMENT_RANK[pos] || available.length;
    const idx = Math.min(n - 1, available.length - 1);
    replacementByPos[pos] = idx >= 0 ? available[idx].pts : 0;
  });
  const values = new Map();
  Object.keys(byPos).forEach((pos) => {
    byPos[pos].forEach((p) => {
      values.set(p.key, p.pts - replacementByPos[pos]);
    });
  });
  return { values, replacementByPos };
}

// DEF never gets a BEER value (see buildBeerValues), so it needs a different
// metric to answer "how do my defenses rank against the league's" at all —
// otherwise buildTeamPositionRanks below would just silently show nothing
// for DEF, since beerValues.get() always misses for a DEF key. Summed
// PROJECTED POINTS (not BEER value) is the substitute: comparable within
// DEF-vs-DEF, which is the only comparison this specific badge ever makes,
// even though it isn't on the same normalized scale a real replacement-value
// number would be. Deliberately NOT used for buildTeamOverallRanks (the "Tot"
// grade) — mixing DEF's raw points into a total-BEER-value sum would
// conflate two different units; that rollup should keep calling
// buildTeamOverallRanks with the plain (unmodified) beerValues map, where DEF
// is simply and correctly absent from the sum.
function buildPositionRankValueMap(rows, beerValues, projMap) {
  const map = new Map(beerValues);
  rows.forEach((r) => {
    if (r.pos !== "DEF") return;
    const pts = projMap[r.key];
    if (pts !== undefined) map.set(r.key, pts);
  });
  return map;
}

// Team-level positional value ranking — backlog #13 ("team grade vs.
// league-mates"), unblocked by BEER being built. Groups every drafted
// player by which roster took them, sums each team's BEER value at each
// position, and ranks all teams against each other — "your QBs rank 3rd of
// 10 in the league" etc. Deliberately LIVE, not a snapshot at pick time:
// every player's value here comes from the SAME beerValues map the rest of
// the board uses, evaluated against the CURRENT replacement level, so a
// team's positional rank can shift even with no new picks at that position
// — exactly like every other BEER number in this tool (see claude.md for
// the reasoning behind choosing live over pick-time snapshots).
//
// Sum of every drafted player's value at a position (not just the best
// starter) was a deliberate choice: it rewards bench depth too, and avoids
// having to guess who's a "starter" at any given moment — same philosophy
// as the man-games replacement calc itself.
//
// `picks` needs a `rosterId` field per pick (roster_id, falling back to
// draft_slot — same acceptance the existing "is this pick mine" check uses,
// since Sleeper populates these differently across real vs. mock drafts).
// Picks with no rosterId, or for a player with no computed BEER value, are
// skipped rather than guessed at.
function buildTeamPositionRanks(picks, beerValues) {
  const byTeamPos = {}; // rosterId -> pos -> summed value
  picks.forEach((p) => {
    if (p.rosterId == null) return;
    const val = beerValues.get(p.key);
    if (val === undefined) return;
    byTeamPos[p.rosterId] = byTeamPos[p.rosterId] || {};
    byTeamPos[p.rosterId][p.pos] = (byTeamPos[p.rosterId][p.pos] || 0) + val;
  });
  // "of" (the denominator) is every team seen ANYWHERE in picks, not just
  // teams with a pick at this specific position — a team with zero RBs so
  // far should count toward the total and rank last, not be excluded from
  // the denominator entirely (which would misleadingly shrink "of N" as the
  // draft goes and make an empty position at a team look like it doesn't
  // exist yet, rather than like the last-place gap it actually is).
  const teamIds = Object.keys(byTeamPos).map(Number);
  const ranks = {}; // rosterId -> pos -> { rank, of, total }
  POSITIONS.forEach((pos) => {
    const totals = teamIds
      .map((id) => ({ id, total: byTeamPos[id][pos] || 0 }))
      .sort((a, b) => b.total - a.total);
    totals.forEach((t, i) => {
      ranks[t.id] = ranks[t.id] || {};
      ranks[t.id][pos] = { rank: i + 1, of: totals.length, total: t.total };
    });
  });
  return ranks;
}

// Overall team grade — the rollup across all four positions that
// buildTeamPositionRanks (above) deliberately left for a separate pass (see
// claude.md's #13 write-up). Sums a team's BEER value across EVERY drafted
// player, any position, and ranks all teams against that one number.
//
// No position-weighting scheme needed here, and that's not a shortcut — a
// player's BEER value is ALREADY normalized to replacement level at their
// own position (that's the entire point of VBD: it makes value comparable
// ACROSS positions), so summing raw values across positions is a real
// combined-value number, not an arbitrary blend. If this ever needs
// weighting after all (e.g. discounting bench depth beyond what a team can
// actually start), that's a deliberate future change — don't add it
// silently.
function buildTeamOverallRanks(picks, beerValues) {
  const byTeam = {};
  picks.forEach((p) => {
    if (p.rosterId == null) return;
    const val = beerValues.get(p.key);
    if (val === undefined) return;
    byTeam[p.rosterId] = (byTeam[p.rosterId] || 0) + val;
  });
  const teamIds = Object.keys(byTeam).map(Number);
  const totals = teamIds
    .map((id) => ({ id, total: byTeam[id] || 0 }))
    .sort((a, b) => b.total - a.total);
  const ranks = {};
  totals.forEach((t, i) => {
    ranks[t.id] = { rank: i + 1, of: totals.length, total: t.total };
  });
  return ranks;
}

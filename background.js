// The board only ever lives in its own resizable window now — no docked side
// panel (dropped 2026-08-23: the docked panel's ~380px width couldn't fit
// projection/stat columns, and side panels can't be resized programmatically
// the way a normal window can). One window, remembered at whatever size/
// position the user last left it, opened via the toolbar icon.
const K_WINDOW_ID = "boardWindowId";       // chrome.storage.session — only meaningful within this browser session
const K_WINDOW_BOUNDS = "boardWindowBounds"; // chrome.storage.local — survives browser restarts
// Widened repeatedly as the stat block grew (2026-08-24: 1000 -> 1200 -> 1500
// -> 1650 across the first stat column, then all 4 position groups, then the
// pinned BASIC group — see shared.js's STAT_GROUP_SEQUENCE), then set back
// down to 1280x970 the same day at the user's explicit request to match a
// specific window size they were actually using — the stat block itself
// still renders fine narrower than its "ideal" width, it just leaves less
// slack in the name column. Don't re-widen this without asking first; it's
// a preference, not a layout constraint being violated.
const DEFAULT_BOUNDS = { width: 1280, height: 970 };

async function openOrFocusBoardWindow() {
  const { [K_WINDOW_ID]: windowId } = await chrome.storage.session.get([K_WINDOW_ID]);
  if (windowId) {
    try {
      await chrome.windows.update(windowId, { focused: true });
      return;
    } catch (e) {
      // Window was closed since we last saw it — fall through and open a new one.
    }
  }
  const { [K_WINDOW_BOUNDS]: bounds } = await chrome.storage.local.get([K_WINDOW_BOUNDS]);
  // A saved position from a monitor/display arrangement that's since changed
  // (unplugged second monitor, different resolution) can put left/top
  // off-screen — the window still opens, it's just invisible, which reads
  // identically to "nothing happened" when you click the icon. Only trust
  // saved left/top if they're plausibly on some screen; always keep the
  // saved width/height since those can't go off-screen the same way.
  const safeBounds = { ...DEFAULT_BOUNDS };
  if (bounds) {
    if (isFinite(bounds.width) && bounds.width > 0) safeBounds.width = bounds.width;
    if (isFinite(bounds.height) && bounds.height > 0) safeBounds.height = bounds.height;
    if (isFinite(bounds.left) && bounds.left >= 0 && bounds.left < 10000) safeBounds.left = bounds.left;
    if (isFinite(bounds.top) && bounds.top >= 0 && bounds.top < 10000) safeBounds.top = bounds.top;
  }
  try {
    const win = await chrome.windows.create({
      url: chrome.runtime.getURL("panel.html"),
      type: "popup",
      ...safeBounds,
    });
    await chrome.storage.session.set({ [K_WINDOW_ID]: win.id });
  } catch (e) {
    // Saved bounds were rejected outright (rare, but possible with a stale
    // multi-monitor position) — retry once with just the safe default size,
    // no position, rather than leaving the icon click looking like a no-op.
    console.error("[4th&Go] window create failed with saved bounds, retrying with defaults", e);
    const win = await chrome.windows.create({
      url: chrome.runtime.getURL("panel.html"),
      type: "popup",
      ...DEFAULT_BOUNDS,
    });
    await chrome.storage.session.set({ [K_WINDOW_ID]: win.id });
  }
}
chrome.action.onClicked.addListener(() => {
  openOrFocusBoardWindow().catch((e) => console.error("[4th&Go] openOrFocusBoardWindow failed", e));
});

// Persist the window's size/position on every move/resize so the next open
// reuses it — the whole point of dropping the fixed-size docked panel was to
// let the board grow into whatever space the user actually wants it to have.
chrome.windows.onBoundsChanged.addListener(async (win) => {
  const { [K_WINDOW_ID]: windowId } = await chrome.storage.session.get([K_WINDOW_ID]);
  if (win.id !== windowId) return;
  const { left, top, width, height } = win;
  await chrome.storage.local.set({ [K_WINDOW_BOUNDS]: { left, top, width, height } });
});
chrome.windows.onRemoved.addListener(async (closedId) => {
  const { [K_WINDOW_ID]: windowId } = await chrome.storage.session.get([K_WINDOW_ID]);
  if (closedId === windowId) await chrome.storage.session.remove([K_WINDOW_ID]);
});

// When the active tab is a Sleeper draft page, stash the draft ID so the
// panel can auto-fill it. Draft URLs look like:
//   https://sleeper.com/draft/nfl/<draft_id>
function extractDraftId(url) {
  if (!url) return null;
  const m = url.match(/sleeper\.com\/draft\/nfl\/(\d+)/);
  return m ? m[1] : null;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const id = extractDraftId(tab.url);
  if (id) chrome.storage.local.set({ detectedDraftId: id });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    const id = extractDraftId(tab.url);
    if (id) chrome.storage.local.set({ detectedDraftId: id });
  } catch (e) {}
});

// ---------- Sleeper WRITE actions (queue / draft a player) — EXPERIMENTAL ----------
// This is the exploratory branch's whole point: can the extension actually
// act on your Sleeper draft (queue/draft a player), not just read it?
// Sleeper's write API is undocumented GraphQL (sleeper.com/graphql) and
// requires your logged-in session. The deliberate design choice here is that
// this extension NEVER sees, stores, or transmits your Sleeper session/token
// itself — that's a long-lived (~1yr) bearer credential and storing it in
// chrome.storage would be a bad trade for what this feature is worth. Instead
// every write is executed BY INJECTING A SCRIPT INTO YOUR OWN ALREADY-OPEN,
// ALREADY-LOGGED-IN SLEEPER TAB (chrome.scripting.executeScript) — the fetch
// call runs same-origin inside that tab and rides its existing cookies
// exactly the way Sleeper's own UI does. If you don't have a Sleeper draft
// tab open, these actions simply fail with a clear error; nothing silently
// falls back to a stored credential because there isn't one.
//
// The exact GraphQL query text below (argument names, inlined-not-variabled
// shape, the x-sleeper-graphql-op header) was captured from Sleeper's real
// web client via live network traffic during a real mock draft — see
// claude.md. draft_pick_player's shape is confirmed against a captured curl
// request. update_draft_queue's shape is inferred (same sport/draft_id
// convention as draft_pick_player, response was observed as
// {update_draft_queue:[...player_ids]}) but its exact request args were
// never directly captured — if Sleeper rejects it, the error surfaces
// through the toast in panel.js so it's visible rather than silently no-op.

function extractSleeperDraftId(url) {
  if (!url) return null;
  const m = url.match(/sleeper\.com\/draft\/nfl\/(\d+)/);
  return m ? m[1] : null;
}

async function findSleeperDraftTab(draftId) {
  const tabs = await chrome.tabs.query({ url: "https://sleeper.com/draft/nfl/*" });
  if (!tabs.length) return null;
  if (!draftId) return tabs[0];
  return tabs.find((t) => extractSleeperDraftId(t.url) === String(draftId)) || tabs[0];
}

// Runs INSIDE the Sleeper tab's own page context — chrome.scripting
// serializes this function and executes it fresh there, so it can't close
// over anything from background.js. Catches internally and returns a plain
// {ok, data|error} object rather than throwing, since an exception here
// surfaces awkwardly across the executeScript boundary.
function injectedSleeperGraphQL(operationName, query) {
  return fetch("https://sleeper.com/graphql", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-sleeper-graphql-op": operationName,
    },
    body: JSON.stringify({ operationName, variables: {}, query }),
  })
    .then((res) => res.json())
    .then((json) => {
      if (json.errors && json.errors.length) {
        return { ok: false, error: json.errors.map((e) => e.message).join("; ") };
      }
      return { ok: true, data: json.data };
    })
    .catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
}

async function execSleeperGraphQL(draftId, operationName, query) {
  const tab = await findSleeperDraftTab(draftId);
  if (!tab) throw new Error("No open Sleeper draft tab found. Open your draft on sleeper.com and try again.");
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: injectedSleeperGraphQL,
    args: [operationName, query],
  });
  const out = results && results[0] && results[0].result;
  if (!out) throw new Error("No response from the Sleeper tab.");
  if (!out.ok) throw new Error(out.error || "Sleeper rejected the request.");
  return out.data;
}

// player_id/draft_id are always digit-strings straight from Sleeper's own
// data (never free-typed by the user) — validated here anyway before they
// get spliced into a GraphQL query string, since these are inlined args, not
// bound variables.
function assertDigits(v, label) {
  if (!/^\d+$/.test(String(v))) throw new Error(`Invalid ${label}.`);
}

async function sleeperDraftPlayer({ draftId, playerId, pickNo }) {
  assertDigits(draftId, "draft ID");
  assertDigits(playerId, "player ID");
  assertDigits(pickNo, "pick number");
  const query = `mutation draft_pick_player {
        draft_pick_player(sport: "nfl", player_id: "${playerId}", draft_id: "${draftId}", pick_no: ${pickNo}) {
          draft_id
          pick_no
          player_id
          picked_by
          is_keeper
          metadata
          reactions
        }
      }`;
  return execSleeperGraphQL(draftId, "draft_pick_player", query);
}

async function sleeperUpdateDraftQueue({ draftId, playerIds }) {
  assertDigits(draftId, "draft ID");
  playerIds.forEach((id) => assertDigits(id, "player ID"));
  const idList = playerIds.map((id) => `"${id}"`).join(", ");
  const query = `mutation update_draft_queue {
        update_draft_queue(sport: "nfl", draft_id: "${draftId}", player_ids: [${idList}])
      }`;
  return execSleeperGraphQL(draftId, "update_draft_queue", query);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  if (msg.type === "sleeperDraftPlayer") {
    sleeperDraftPlayer(msg.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true; // keep the message channel open for the async response
  }
  if (msg.type === "sleeperUpdateDraftQueue") {
    sleeperUpdateDraftQueue(msg.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

// The board only ever lives in its own resizable window now — no docked side
// panel (dropped 2026-08-23: the docked panel's ~380px width couldn't fit
// projection/stat columns, and side panels can't be resized programmatically
// the way a normal window can). One window, remembered at whatever size/
// position the user last left it, opened via the toolbar icon.
const K_WINDOW_ID = "boardWindowId";       // chrome.storage.session — only meaningful within this browser session
const K_WINDOW_BOUNDS = "boardWindowBounds"; // chrome.storage.local — survives browser restarts
const DEFAULT_BOUNDS = { width: 1000, height: 900 };

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

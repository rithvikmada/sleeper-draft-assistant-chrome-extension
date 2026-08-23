// Open the side panel when the toolbar icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

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

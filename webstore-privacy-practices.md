# Chrome Web Store — Privacy practices questionnaire (draft answers)

Not shipped code — reference copy for the "Privacy practices" tab in the
Chrome Web Store Developer Dashboard when submitting. This tab requires a
written justification per permission, plus a data-use disclosure; both must
match what the code actually does or the listing gets flagged/rejected. Copy
these in, adjusting wording as the dashboard's exact fields require.

## Single purpose description

4th&Go is a live draft-tracking board for Sleeper fantasy football drafts.
It syncs to a Sleeper draft via Sleeper's public API, blends user-imported
ranking sources into a tiered board, and crosses off players automatically
as picks come in.

## Permission justifications

**`storage`**
Used to save the user's imported ranking sources, custom rankings boards,
draft state/crossouts, license key, and preferences locally in
`chrome.storage.local`, so they persist between sessions. No data leaves the
browser via this permission.

**`tabs`**
Used only to read the URL of the user's currently open browser tabs, to
auto-detect a Sleeper draft ID when one is open (matching the pattern
`sleeper.com/draft/nfl/<id>`) so the user doesn't have to copy/paste it
manually. No tab content is read, and no tab's content script access is
granted by this permission alone.

**`scripting`**
Used, only when the user has an already-open, already-logged-in Sleeper
draft tab, to run a small injected script in that tab that makes an
authenticated request using the browser's own existing Sleeper session —
this is what powers the optional queue/draft-write feature (off by default).
No page content is read or modified; the injected script only issues a
network request and returns the response.

**Host permission: `https://api.sleeper.app/*`**
The core data source — draft picks, ADP, and player projections/stats, all
via Sleeper's public, unauthenticated API.

**Host permission: `https://sleeper.com/*`**
Needed for the `tabs`/`scripting` uses above (draft-ID auto-detection, and
the optional authenticated-request injection).

**Host permission: `https://api.gumroad.com/*`**
Used only when a user activates a license key, to verify it against
Gumroad's public license-verification endpoint (this product is sold via
Gumroad). No other Gumroad account access.

**Host permission: `https://api.web3forms.com/*`**
Used only when a user clicks "Send Feedback," to relay their message (plus
an optional screenshot attachment) to the developer's email inbox. No
network request happens unless the user explicitly submits feedback.

## Data usage disclosure (the "does your extension collect/use..." checklist)

| Data type | Collected? | Notes |
|---|---|---|
| Personally identifiable information | No | No accounts, no names/emails collected by the extension itself |
| Health information | No | |
| Financial information | No | Payment is handled entirely by Gumroad, off-extension |
| Authentication information | Session-only | The optional Sleeper session token (draft-write feature) is held in memory only, never written to storage, cleared when the window closes |
| Personal communications | No | |
| Location | No | |
| Web history | No | Only the currently active tab's URL is read for draft-ID auto-detection — not browsing history |
| User activity | No | |
| Website content | No | |

**Certify**: data is not sold to third parties. Data is not used for
purposes unrelated to the extension's single purpose. Data is not used to
determine creditworthiness or for lending purposes.

## Remote code

No remote code is executed. All JavaScript ships inside the extension
package. Fetch calls to Sleeper/Gumroad/Web3Forms only exchange data, never
executable code.

# Privacy Policy — 4th&Go Sleeper Draft Board

Last updated: 2026-08-27

This extension does not run its own server and does not sell, share, or
monetize any user data. Everything it stores lives in your own browser
(`chrome.storage.local`) unless described otherwise below.

## What this extension reads

- **Sleeper's public draft API** (`api.sleeper.app`) — draft picks, ADP,
  player projections/stats, and (only if you turn on the optional Draft
  actions feature and paste your own Sleeper session token) queue/draft
  write requests made through Sleeper's own GraphQL API using your own
  Sleeper session. That token is kept in memory only for the current window
  session — it is never written to storage and is cleared when the board
  window closes.
- **Your open Sleeper draft tab's URL** — read once by the background script
  to auto-detect a draft ID, via the `tabs` permission. No page content is
  read.
- **CSV files you paste or upload** — ranking/ADP sources you import,
  processed entirely locally.

## What gets sent to a third party, and why

- **Gumroad** (`api.gumroad.com`) — when you activate a license key, that
  key and this product's identifier are sent to Gumroad's public license
  verification endpoint to confirm it's a valid, unrefunded purchase. No
  other personal information is sent. The result is cached locally so the
  extension works offline afterward, re-checking with Gumroad only
  periodically.
- **Web3Forms** (`api.web3forms.com`) — only when you use the "Send
  Feedback" button. Whatever you type, the feedback category you selected
  (Bug/Feature request/Other), the extension's version number, your
  browser's user-agent string, and any screenshots you choose to attach are
  sent to Web3Forms, which relays them to the developer's email inbox.
  Nothing is sent unless you click Send.

## What is stored locally and never leaves your browser

- Your imported ranking/ADP sources, custom rankings boards, flags
  (favorite/avoid), draft state/crossouts, stat/theme preferences, and your
  license key — all in `chrome.storage.local`, tied to your own browser
  profile.

## What this extension does not do

- No analytics, tracking pixels, or third-party advertising SDKs.
- No account system of its own — there is nothing to sign up for beyond
  purchasing a license key through Gumroad.
- No access to any Sleeper data beyond the public draft-related endpoints
  described above.

## Questions

Use the feedback button inside the extension, or contact the developer
directly.

# 4th&Go — Sleeper Draft Board

A tiered fantasy football ranking board that auto-syncs to a live Sleeper
draft. Import your own rankings (or build them from scratch), and players get
crossed off automatically as picks come in.

Tuned for a 10-team, full PPR, 1QB/2RB/2WR/1TE/2FLEX league — no K/DST.

## What it does

- Live-syncs to any Sleeper draft (real or mock) by polling Sleeper's public
  read-only API — no login to Sleeper required for basic use.
- Import ranking sources (CSV) and blend them into a consensus tier board.
- ADP columns (Sleeper's live ADP, plus any ranking-site ADP you import) with
  a value bar showing where the market is drafting a player relative to your
  baseline.
- BEER/VBD value — a replacement-level value number per player, recalculated
  live as the draft goes.
- Best Picks Right Now, team position-need tracking, and a full Roster
  review popover.
- A drag-and-drop Rankings Creator for building your own board from scratch,
  starting from ADP or any existing source.
- Optional (off by default) draft-write actions — queue and one-click draft
  through your own Sleeper session — plus a for-fun "rage bait" chat mode.

## Requiring a license key

This is a paid, one-time-purchase extension — every feature is locked behind
a license key until one is entered and verified. Purchase a key at
**[rithmada.gumroad.com/l/fourthandgo](https://rithmada.gumroad.com/l/fourthandgo)**,
then enter it on the lock screen the first time you open the board or the
Rankings Manager. Verification runs once against Gumroad and is then cached
locally, so the extension works fully offline mid-draft afterward.

## Installing (unpacked, for testing/development)

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Click the extension's icon to open the board window

## Support / feedback

Use the mail icon in the board window's header to send a bug report or
feature request directly from the extension — no email client required.

## Privacy

See [PRIVACY.md](PRIVACY.md) for what data this extension touches and where
it goes.

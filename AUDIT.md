# 4th&Go — Engineering Audit (Stage 1)

Written 2026-08-23. **No code was changed to produce this report.**

Every claim below was checked against the actual code, and where a claim was
testable it was tested — the parser and consensus functions were run against the
real bundled data in Node, and Sleeper's API was probed directly for its error
behavior. Where something is *unverified* (because it needs a live draft or a
real browser), it says so explicitly instead of guessing.

**How to read the severities.** This tool gets used live, once, under time
pressure, on draft day. So the ratings aren't generic:

- **must-fix** — could break the tool mid-draft in a way you couldn't recover
  from with a pick clock running, or is already showing users wrong information.
- **worth-fixing** — real defect with a real trigger. Won't sink a draft on its
  own, but it's the kind of thing you'd be angry about at 8:47pm on draft night.
- **minor-polish** — genuine, but only costs you tidiness or a future reader's
  time.

---

## Executive summary

**The codebase is in better shape than the file count suggests.** The polling
loop, the consensus math, the storage schema, and the two-surface split are all
deliberate and well-reasoned, and the inline comments explaining *why* things are
the way they are are genuinely excellent — better than most professional
codebases. Nothing here is a rewrite.

The findings cluster into four themes:

1. **Silent failures beat loud ones, and this codebase has several silent ones.**
   The recurring pattern: something goes wrong, the UI reports success, and you
   only find out by noticing a number looks off. Importing a CSV with no position
   column, importing entirely the wrong file, syncing a non-football draft ID,
   and the manager's 400-row cutoff all fail this way. This is the single most
   important theme, because a silent failure is the one you *can't* debug during
   a draft.
2. **Untrusted text goes into HTML without escaping.** Confirmed across three
   files. It is **not** a hacking risk — Chrome's extension security policy blocks
   the code-execution path entirely — but it is a real "the board renders garbage
   if you paste the wrong thing" risk. Rated honestly below.
3. **Documentation has drifted out of sync with the code**, and specifically
   `4thGo-feature-backlog.md` — the file you've told future sessions to trust for
   priorities — still contains the exact stale claim ("Sleeper has no ADP
   endpoint") that the audit brief was written to stamp out. That matters right
   now, because the next build reads it.
4. **Duplication is real but mostly cheap.** The one place it has already caused
   an actual behavior difference is the filter code, which has quietly drifted
   apart between the two surfaces.

**If you only do five things, do these:**

| # | Fix | Category | Why this one |
|---|---|---|---|
| 1 | Warn loudly (or refuse) when an imported source has no position column | §4 | Import "succeeds", chip shows the count, and **zero** of those players ever appear anywhere. Verified. |
| 2 | Fix the three stale user-facing strings ("try FFC", "side panel" ×2) | §5 | Users are being told to use things that don't exist. Trivial fix. |
| 3 | Add one HTML-escape helper and apply it | §3 | Turns "the board is mangled" into "the name looks weird". |
| 4 | Make `median()` coerce to numbers | §11d | Latent today, but the failure is a *silently wrong blended rank* or a blank board. One line. VORP will add exactly the kind of numeric field that trips it. |
| 5 | Bring `4thGo-feature-backlog.md` in line with reality | §7 | It's the file the VORP build is going to read first, and it's wrong about VORP's data source. |

---

## 1. Project structure

**Verdict: leave it flat. A restructure is not worth the churn at this size.**

The numbers:

| | Lines |
|---|---|
| Actual code (`panel.js`, `rankings-manager.js`, `shared.js`, `background.js`) | 2,634 |
| Markup + CSS (`panel.html`, `rankings-manager.html`) | 605 |
| Data files (`rankings.js`, `fp-rankings.js`) | 4,851 |
| Docs / prompts / backlog | 1,232 |
| **Tracked files total** | **18** |

Roughly half the repo by line count is two generated data files that nobody
reads. The real code is ~2,600 lines across four files. Folders start paying for
themselves somewhere around 30–50 source files; you have six. A `shared/` folder
holding one file, or a `surfaces/` folder holding two pairs, would add path
churn and a round of "where did that go?" for zero navigational benefit. **Don't
do it.**

Two structural notes that *are* worth something:

- **`shared.js` is 937 lines and holds four unrelated jobs**: constants, CSV
  parsing, consensus math, and HTML-rendering widgets. That's the one file where
  the seams are real — "the math" and "the pixels" have genuinely different
  reasons to change. Because these are plain `<script>` tags sharing one global
  scope, splitting it is nearly free (add one more `<script src>` to each HTML
  file, in order). **The right moment is when you build VORP**, since that work
  lands squarely in the math half. Not before, and not as its own task.
  *(minor-polish, revisit at VORP)*
- Two junk files should be deleted rather than filed anywhere — see §5.

---

## 2. Duplication

### 2a. CSS duplication — confirmed, and larger than described

**Measured:** `panel.html` has a 214-line `<style>` block, `rankings-manager.html`
has a 204-line one, and **37 selectors are defined in both**:

```
:root  body  button  button.alt  button.alt:hover  button.ghost  button:active
.brand  .sub  .empty  .pf  .pf:hover  .pf.active  #filters
#playerSearch  #playerSearch:focus  #playerSearch::placeholder
#toast  #toast.show  #toast.error
.vbig  .vbig-num  .vbig-track  .vbig-track::after  .vbig-fill  .vbig-empty
.flagMark  .flagMark.fav  .flagMark.avoid
.cnt  .cnt b  #teamCounts  #best  .bestCard  .bestName  .medal  .srcDots  .dot
```

The `:root` palette block is **byte-for-byte identical** in both files — all ten
color tokens, duplicated. The other 36 are *near*-identical, and that's the part
that actually costs you. Some differences are deliberate (the `.vbig` value bar is
smaller in the board window than in the manager table — `claude.md` documents that
as intentional). Others look like plain drift: `.flagMark` is `margin-right: 3px`
in one file and `4px` in the other, which nobody decided.

**Why it matters practically:** you cannot look at these two blocks and tell which
differences are design and which are accidents. Every future style change is a
"remember to edit both files, and decide for each rule whether it's supposed to
match" task — which is exactly the kind of thing that gets half-done at 11pm.

**Recommended fix:** one `theme.css` holding the genuinely shared layer (`:root`
tokens, `body`, the `button`/`button.alt`/`button.ghost` family, `.pf` filters,
`#toast`, `.empty`, `.flagMark`), linked from both HTML files. Leave
surface-specific sizing (the `.vbig` dimensions, `#bestPicks` grid) in each page's
own block, where the difference is then obviously deliberate. *(worth-fixing)*

### 2b. Duplicated logic — and it has already drifted

Identical or near-identical code living in both `panel.js` and
`rankings-manager.js`:

| What | Status |
|---|---|
| `const $ = (id) => document.getElementById(id)` | identical, both files |
| `toast()` (11 lines, timers and all) | identical, both files |
| `activeSources()` | identical, both files |
| `posFilter` / `showTaken` / `playerSearch` filter trio | **has diverged — see below** |
| the storage-echo guard | same idea, two different names (`suppressEcho` vs `suppressStorageEcho`) |

**The filter trio is the one that proves the point.** `claude.md` records the
duplication as a deliberate choice. Since then, `panel.js` grew a grouped
`RB/WR` filter with a `filterMatchesPos()` helper and a `POS_FILTER_GROUPS`
table; `rankings-manager.js` still does a bare `r.pos === posFilter` and has no
RB/WR button at all. So the two surfaces now filter differently, and the manager
silently can't do something the board can.

That's not fatal — arguably the manager doesn't need an RB/WR view — but it's the
predicted failure mode of copy-paste arriving on schedule. **The deliberate-
duplication call was reasonable when made; it has now expired.**

**Recommended fix:** move `toast()`, `$`, `activeSources()`, and a single
`applyFilters(rows, {posFilter, showTaken, playerSearch, takenSet})` into
`shared.js`. That's ~60 lines removed and one behavioral inconsistency closed.
*(worth-fixing)*

---

## 3. Security

**Rating: worth-fixing — as a robustness bug, not as a hacking risk.** Here is
the honest picture, because both the alarmist and the dismissive version would be
wrong.

### What's confirmed

- **20 `innerHTML` assignments** across three files: `panel.js` (4),
  `rankings-manager.js` (10), `shared.js` (6). Confirmed exactly as the brief
  stated.
- **No HTML-escaping helper exists anywhere in the codebase.** Confirmed.
- Player names (from pasted CSVs and from Sleeper's API) and source names (typed
  by you) flow straight into template strings, including into HTML *attributes*:
  `title="${s.name}"`, `data-key="${r.key}"`, `data-name="${r.name}"`,
  `data-pname="${r.name}"`, `style="background:${s.color}"`.

### What the actual risk is — and isn't

**It is not a code-execution risk.** Chrome extensions on Manifest V3 run under a
security policy (`script-src 'self'`) that blocks inline scripts *and* inline
event handlers, and MV3 doesn't let an extension relax it. So the classic
`<img onerror=...>` payload does not fire here. `manifest.json` declares no
custom policy, so the strict default applies. Anyone telling you this is "an XSS
hole" is overstating it.

**What it actually is: a rendering-corruption bug**, and I confirmed it by running
real input through the real parser:

- Pasting an HTML page into the import box (easy mistake — you copied from a
  website and got markup instead of a table) produces a player literally named
  `<!DOCTYPE html><html><body><h1>Not a CSV</h1></body></html>`. That string is
  then injected into the board as markup.
- A name containing `<b>Bold</b>` survives parsing intact and renders as actual
  bold HTML in the row. Confirmed.
- A `<` or `>` landing mid-row can break the row's own `<div>` structure, and the
  board's rows are a CSS grid whose columns are set per-row. Broken markup there
  doesn't degrade gracefully — it garbles the layout.

### The highest-risk site, specifically

**Source names, not player names.** The CSV parser strips double-quotes as part
of parsing quoted fields, so a `"` is hard to get into a *player* name. But a
**source name is typed directly into a text box** and never goes through the
parser at all — so it can contain anything. Verified output for a source named
`Boone" style="display:none`:

```html
<span style="color:#fff" title="Boone" style="display:none">BS</span>
```

The attribute breaks out cleanly and injects a real `style` attribute. You'd have
to do this to yourself, so it isn't a threat — but it's a live demonstration that
the attribute contexts are unescaped, and attributes are the easier context to
trip.

Ranked by risk:

| Site | Risk | Note |
|---|---|---|
| `title="${s.name}"` (`panel.js:170`, `shared.js:491`, `rankings-manager.js:64,77`) | highest | source names bypass the CSV parser entirely |
| `${r.name}` in row/card/table bodies (`panel.js:218`, `shared.js:610`, `rankings-manager.js:251`) | high | reachable by pasting the wrong file |
| `data-key` / `data-name` / `data-pname` attributes | high | if these break, **crossing players off stops working** — a silent functional failure, not just a visual one |
| `style="background:${s.color}"` | low today | colors only ever come from the fixed `SOURCE_PALETTE`; not user-editable in the UI |
| `<img src="${s.icon}">` | low | icons are re-encoded locally through a canvas, so the value is always a data URL this code generated |

### Recommended fix

Add one helper to `shared.js` and apply it at every interpolation of a name or
source name:

```js
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
```

Escape-at-interpolation is the right call here rather than converting everything
to `textContent`/DOM methods — the row templates build a dozen elements at once
and rewriting them as DOM calls would be a much bigger, riskier change for the
same benefit. Use `textContent` only where a lone value is being written (several
places already do).

Do this **before** the VORP build, for the reason the brief already gives: that
work extends `shared.js` and `rankings-manager.js`, and adding the helper first
means the new code is written escaped rather than needing a second sweep.

---

## 4. Error handling

### Already good — not re-flagged

- **The polling loop.** Self-rescheduling `setTimeout` chain, `inFlight` guard so
  requests never stack, exponential backoff capped at 8s, streak reset on
  recovery. This is correct and well-built.
- **Fetch failure degrades gracefully.** On a failed poll, `renderAll()` is *not*
  called, so the board keeps showing the last-known-good state instead of
  blanking. The status line turns red with the reason. That's the right behavior
  and it looks deliberate.
- **A bad draft ID gives a decent message.** I probed Sleeper directly: a
  nonexistent draft ID returns **HTTP 404** with a `null` body, so `res.ok` is
  false and the user sees `Sync error: HTTP 404. Check the draft ID. Retrying…`.
  Clear enough. (It retries forever at 8s intervals rather than giving up, which
  is arguably right for a draft-day tool.)
- **Draft-ID format is validated** before syncing (`/^\d{6,}$/`).
- **`fetchSleeperAdp` is well-guarded** — see §10.

### 4a. A CSV with no position column imports "successfully" and then does nothing — **must-fix**

This is the most important finding in the report.

**Verified by running the real code:** a source parsed from
`Player,Rank\nJa'Marr Chase,1\n…` yields 3 players and a soft warning. The chip
in the manager shows the source name and the player count. Everything looks fine.

But `buildConsensus()` starts every player loop with `if (!p.pos) return;` — so a
source with no position column contributes **zero rows and zero rank votes**.
Measured directly:

```
no-pos source: parsed 3 players  ->  consensus rows: 0
alongside the default source:    ->  any row citing it? false
```

So: import succeeds, the count is right, and the source has **literally no effect
on anything** — not the board, not Best Picks, not the blend. There is a warning
(`"No position column found — position filters won't work for this source."`) but
it (a) understates the consequence enormously — it says filters won't work, not
that the entire source is inert — and (b) renders in the same yellow note area as
harmless warnings, then the user clicks SAVE anyway.

**Why this is must-fix:** the realistic moment to hit it is day-of-draft, pasting
a source you just found. You'd see the chip, assume it's working, and draft
against a blend that silently doesn't include it. There is no symptom to notice.

**Recommended fix:** block the save (or require an explicit override) when zero
parsed players have a position, with a message that says the real consequence:
*"None of these rows have a position, so none of them can be matched to players
or appear on the board. Add a Position column."*

### 4b. Garbage input imports as real data — **worth-fixing**

Related but distinct. Verified outputs:

| Pasted content | Result |
|---|---|
| A recipe (`Ingredients / 2 cups flour / …`) | "Parsed 4 players" |
| An HTML page | "Parsed 1 player" named `<!DOCTYPE html>…` |
| `1,2,3 / 4,5,6 / 7,8,9` | "Parsed 3 players" named `2`, `5`, `8` |
| A JSON blob | "Parsed 1 player" named `{a:1` |
| Empty / whitespace | correctly rejected ✓ |

The parser's forgiving-by-design nature is a *feature* — it's why real exports
import without reformatting — so the fix isn't to make it strict. The fix is a
**sanity check on the result**: if fewer than, say, half the parsed rows have a
recognized position, that's not a rankings file, and the preview should say so
in red rather than green. Cheap, and it catches 4a as a side effect.

### 4c. Syncing a non-football draft looks completely healthy — **worth-fixing**

`poll()` skips any pick whose position isn't QB/RB/WR/TE (correct — this league
has no K/DST). But it skips them with an early `return` *before* they're counted
as unmatched. So if you paste a basketball or soccer draft ID, or a Sleeper draft
for another sport:

- every pick is skipped,
- `unmatched` stays empty, so no warning appears,
- the status line reads **`● LIVE — 137 picks synced`** in green,
- and nothing on your board ever crosses off.

You'd sit there watching a green "LIVE" indicator wondering why the board isn't
updating. **Fix:** count the skipped-by-position picks separately, and if
*substantially all* picks were skipped, say so: *"137 picks synced, but none were
QB/RB/WR/TE — is this an NFL draft?"*

### 4d. Corrupted storage takes the whole board down, permanently — **worth-fixing**

`loadSources()` checks that the stored value is an array, but never checks the
shape of the objects inside it. Tested:

| Stored source shape | Result |
|---|---|
| `players` missing | **throws** `Cannot read properties of undefined (reading 'forEach')` |
| `players: null` | **throws** |
| `players` is an object, not an array | **throws** `src.players.forEach is not a function` |
| player rows are strings | survives (ignored) ✓ |
| player row missing `pos` | survives (ignored) ✓ |

A throw inside `buildConsensus()` propagates up through `renderAll()`. On the
board that means **every render fails, on every load** — the board is blank and
stays blank, and there is no in-app way to recover, because the code that would
draw the "clear your data" button is the code that's crashing. You'd need
DevTools and `chrome.storage.local.clear()` to get out.

Likelihood is low (it needs storage to be corrupted or written by an older schema
version), but the consequence is total and unrecoverable-without-a-console, which
in a draft-day tool is what pushes this above "theoretical." **Fix:** one
defensive filter in `loadSources()`/`loadAdpSources()` that drops any entry
without an array `players`, and a `try/catch` around the top-level `renderAll()`
that shows a readable "your saved data looks corrupted — reset?" state.

Related, smaller: none of the storage *writes* (`saveSources`, `saveFlags`,
`saveMerges`, `saveDraftState`) check for failure. `persistDraftState()` attaches
`.finally()` with no `.catch()`, so a rejected write becomes an unhandled promise
rejection that only appears in the console. *(minor-polish)*

### 4e. Storage quota — **not a real risk, measured**

The brief asked about this. Measured actual sizes:

| Item | Size |
|---|---|
| A full ranking source (356 players) as stored JSON | ~26 KB |
| The FantasyPros ECR source | ~24 KB |
| An ADP source (250 players) | ~12 KB |
| A downscaled 48×48 icon data URL | ~3 KB |

`chrome.storage.local` gives 10 MB by default. You'd need on the order of **300+
ranking sources** to approach it. The `manualOverride` player-array persistence
and the data-URL icons both grow storage, but from a base so small it doesn't
matter. The 48×48 canvas downscale was already the right call. **No action
needed** — worth saying plainly so it doesn't get re-raised later.

### 4f. Pressing STOP mid-request flips the status back to "LIVE" — **minor-polish**

If a fetch is in flight when you hit STOP, `stopPolling()` sets the status to
"Sync stopped", then the in-flight response lands and overwrites it with
`● LIVE — N picks synced` in green. No further polls are scheduled (that part is
guarded correctly), so it's cosmetic — but it reads as "STOP didn't work."

---

## 5. Dead code and stale strings

### Confirmed dead — safe to delete

- **`test-fp-parse.js` and `test-fp-parse2.js`** — confirmed disposable, and
  worse than the brief said. They hardcode `/Users/rithvikmada/Repos/sleeper-draft-ext 4/`
  (a path that no longer exists) *and* `test-fp-parse.js` is outright broken: it
  calls `result.length` on `parseRankings()`'s return value, which is an object
  `{players, warnings}`, not an array. It could never have printed a correct
  count. **Delete both.** *(minor-polish, but do it — a tracked file named
  `test-*.js` implies tests exist)*
- **Dead CSS in `rankings-manager.html`** — confirmed, and the brief's list was
  both incomplete and partly wrong:
  - Actually dead (~24 lines, no matching markup or JS anywhere in that surface):
    `#teamCounts`, `.cnt`, `.cnt b`, `#teamHint`, `#best`, `.bestCard`, `.medal`,
    `.bestName`, `.bestMeta`, `.srcDots`, `.dot`, `.dot.off`, `.nearMergeMenu .nmm-empty`
  - **`.posChip` is NOT dead** — it's used at `rankings-manager.js:252`. The brief
    listed it in error; don't delete it.
- **`rankings-manager-prompt.md`** — confirmed fully superseded by the shipped
  code. Keeping it for history is a defensible call; if you keep it, add one line
  at the top saying it's historical, because its filename reads like a live spec.

### Stale user-facing strings — **worth-fixing, all three**

These are the ones users actually see:

1. **Confirmed — `rankings-manager.js:197`.** The ADP fetch failure toast reads
   `"Sleeper ADP fetch failed: … — try FFC or pasting instead"`. FFC was fully
   removed (button, fetch function, host permission). A user hitting a failed
   fetch is told to use a feature that doesn't exist. Reachable mid-draft.
2. **New — `rankings-manager.js:56`.** When not synced, the manager displays
   **`NOT SYNCED — START A SYNC IN THE SIDE PANEL`**. There is no side panel
   anymore. This is the recovery instruction shown at exactly the moment
   something's wrong.
3. **New — `rankings-manager.html:219`.** The manager's header text reads
   *"Live picks and recommendations live in the side panel."* Same problem.

### Stale comments — confirmed, plus more

2. **Confirmed — `shared.js:674`** still lists `"Sleeper live, FFC live"` as the
   current ADP options.

Beyond that, "side panel" / "pop-out" / "docked panel" language survives in
comments at `panel.js:307`, `panel.js:628`, `panel.js:722`, `shared.js:3`,
`shared.js:471`, `shared.js:765`, `rankings-manager.js:6`, `rankings-manager.js:488`,
`rankings-manager.js:800`, `rankings-manager.js:813`, and `panel.html:98`.
`panel.js:722` is the most misleading — it explains logic in terms of "the pop-out
window and the docked panel each poll independently," an architecture that no
longer exists, which would send a future reader chasing a concurrency concern
that's been designed away. *(minor-polish as a batch; the comments are wrong, not
harmful)*

### `build-fp-source.js` — **worth-fixing**

Not dead, but not runnable as documented. It hardcodes
`/Users/rithvikmada/Downloads/FantasyPros_2026_Draft_ALL_Rankings (1).csv` —
including the `(1)` that Chrome appends to a duplicate download. `claude.md`
documents the workflow as "`node build-fp-source.js` after replacing the source
CSV," which doesn't match what the script does: it reads one specific file in
Downloads, not one in the repo. The file happens to still exist today, so this
works by luck. **Fix:** take the CSV path as a command-line argument, or read it
from a known path inside the repo.

---

## 6. Naming and consistency

*(All minor-polish unless noted.)*

- **The same concept, two names.** `suppressStorageEcho` (`panel.js`) and
  `suppressEcho` (`rankings-manager.js`) are the same guard. Pick one.
- **`builtin` doesn't mean what it sounds like.** The default source is created
  with `builtin: true`; the FantasyPros ECR source is code-seeded from
  `fp-rankings.js` but created with `builtin: false`. So `builtin` actually means
  "cannot be deleted," not "ships with the extension." The genuinely code-seeded
  ones are identified by a **hardcoded id check** — `id === "default" || id === "fp"`
  — written out in both `rankings-manager.js:604` and again as separate logic in
  `shared.js`'s `loadSources()`. Adding a third bundled source means finding and
  updating a hardcoded id list in two files. **Recommended:** rename `builtin` to
  `undeletable` and add a real `codeSeeded` flag. *(worth-fixing — this is the
  kind of thing that quietly breaks the next time you bundle a source)*
- **`rank` means "ADP value" on ADP sources.** Documented in a comment, but it
  means `p.rank` means two different things depending on which array you're in.
  A future reader will trip on it once.
- **`claude.md` vs `CLAUDE.md`.** The file is tracked in git as lowercase
  `claude.md`. macOS's filesystem is case-insensitive by default, so it resolves
  either way *on your machine* — but on a case-sensitive filesystem (most Linux
  setups, or macOS configured case-sensitively) tooling looking for `CLAUDE.md`
  would not find it. A one-line `git mv claude.md CLAUDE.md` removes the trap.
  Note the repo already refers to it inconsistently — `4thGo-feature-backlog.md:203`
  says "CLAUDE.md" while `codebase-audit-prompt.md` says "claude.md".
- **`panel.html` has no `<title>`.** The manager has one; the board window
  doesn't, so its window title falls back to something unhelpful. One line.

---

## 7. Documentation

### 7a. No README — **worth-fixing**

Confirmed. A stranger (or you, in eight months) cloning this repo has no entry
point at all: nothing states that it's a Chrome extension, that you install it
via `chrome://extensions` → Developer mode → Load unpacked, that the toolbar icon
opens the board, that you need a Sleeper draft ID, or that the league format it's
tuned for is 10-team full PPR.

All of that *is* documented — inside `claude.md`, a 55 KB file written for an AI
agent, mixed with things like "don't re-attempt the exact-pair tiering
algorithm." That's the wrong document for a human orienting themselves.

**Recommended:** a genuinely short `README.md` — what it is, how to install it,
how to use it on draft day, and a one-line pointer to `claude.md` for
architecture. Half a page.

### 7b. `4thGo-feature-backlog.md` actively contradicts reality — **must-fix**

This is the documentation finding that matters, because `claude.md` explicitly
tells future sessions *"Don't re-derive priorities from scratch; read that file"*
— and that file is wrong about the thing the next build depends on.

| Backlog says | Reality |
|---|---|
| Line 3: *"Nothing here is built yet"* | The same file has eight `✅ BUILT` markers below it |
| **#9:** *"the assumption that Sleeper exposes ADP was wrong… there is nothing to poll, and this is NOT a matter of finding the right URL"* | **`fetchSleeperAdp()` polls Sleeper for ADP and has since the last release.** This is the exact stale premise the audit brief's verified-facts table exists to kill — it was corrected in `claude.md` but never here |
| **#8 (VORP):** still says a projections source is needed, suggests checking FantasyPros | `claude.md` records VORP as **unblocked** — Sleeper's projections endpoint (already being called) returns `pts_ppr` |
| **#4 and #5:** listed as live items | `claude.md` records both as **dropped (2026-08-23)** |
| Dependency order (bottom): leads with items #1/#6/#3 | #1 and #3 are built; #6 was renumbered to #9 |

The practical harm is concrete: **the next session builds VORP, reads the backlog
for context, and is told the data source it needs doesn't exist.** Fix this before
Stage 2 finishes, not after.

### 7c. Are load-bearing decisions commented in the code? Mostly yes — **minor-polish**

The brief asked specifically. Checked each:

| Decision | In-code? |
|---|---|
| Cloudflare 15s cache floor | ✅ `panel.js:66` |
| ADP endpoint correction | ✅ `rankings-manager.js:164–173`, thorough |
| Tiering algorithm's failure history | ✅ `shared.js:~430–460`, excellent — the full account of what was tried and why it failed |
| `positionOnly` isolation from blend math | ✅ `shared.js`, in both `makeSource` and `buildConsensus`, including the solo-source exception |
| Grid-track sizing (why every track is fixed) | ✅ `panel.js:150–158` |
| Why `windows.getAll` instead of `tabs.create` | ✅ `panel.js:654–670`, unusually good |
| **The `suppressEcho` storage-echo guard** | ⚠️ **Thin.** One inline comment (`// ignore the onChanged event fired by our own write`) and nothing about the ordering assumption it rests on — see §11c |

So: one gap, and it happens to be the mechanism with the actual soundness
question. Worth a proper comment once §11c is decided.

### 7d. `claude.md` is 55 KB / 795 lines — **worth-fixing, carefully**

Confirmed. It's loaded into every session's context.

**Don't gut it.** Most of its bulk is genuinely load-bearing: the "don't
re-attempt this" entries (exact-pair tiering, percent-of-baseline value scaling,
the rejected ADP sources, the `tabs.create` window-targeting saga) are exactly the
history that stops a future session burning hours re-deriving a dead end. That's
the file doing its job.

The problem is that it's *one* file mixing two kinds of content with different
shelf lives: **stable architecture** (what the files are, what the storage schema
is, what the surfaces do) and **dated session history** (what was tried on
2026-08-23 and why it was reverted). The first should be read every time; the
second only matters when you're about to touch that specific thing.

**Recommended split**, keeping essentially all the content:

- `claude.md` — the stable half: what this is, file structure, surface split,
  storage schema, design language, the API constraints, and a short "hard-won
  lessons: don't re-attempt these" index that *names* each dead end in one line
  and links to detail.
- `docs/decisions.md` (or similar) — the long-form accounts of what was tried and
  failed, moved out of the auto-loaded path.

Also: several entries are now dated by the architecture change and could be
compressed — the side-panel-width math ("content width 340px, minus rank 34px…")
is preserved with a note that it no longer applies, which is a paragraph of dead
arithmetic. Compress, don't delete.

---

## 8. Git hygiene

**Verdict: good. Genuinely nothing committed that shouldn't be.**

- `.gitignore` exists (`.DS_Store`, `node_modules/`) and works — verified
  `.DS_Store` is present on disk and correctly ignored.
- 18 tracked files, all intentional. No secrets, keys, tokens, or credentials
  anywhere (swept for them explicitly). No `node_modules`, no build output, no
  `.env`.
- Untracked and correctly so: `.claude/`, `codebase-audit-prompt.md`. **Note:**
  you'll probably want to commit `codebase-audit-prompt.md` and this `AUDIT.md`
  alongside the Stage 2 work, since they're project history now.

**On the `600` permissions:** `rankings-manager-prompt.md` is indeed `-rw-------`
on disk. But git only records the executable bit — the file is staged as `100644`
like everything else, so **the unusual permission doesn't propagate to anyone who
clones the repo**. It's a local-disk oddity (probably from however the file was
originally created), not a repo problem. A `chmod 644` is harmless tidying; it
changes nothing about the repository.

**On commit messages: these are excellent** and I'd say so unprompted. All four
explain *why*, not just *what* — commit `9295086` walks through two failed tiering
iterations and why each was replaced, which is exactly the context you'd want
when reading it back in a year. The only nit: commit bodies mention "side panel"
throughout, which is accurate history but will read oddly once you've forgotten
that architecture existed. That's fine — commit messages should describe the world
as it was.

One process note: four commits for a project this far along means each commit is
large. `e9dfcd2` alone covers the window architecture, position-only sources,
letter-tier fixes, the merge menu, the edit modal, and a reverted algorithm.
Smaller commits would make `git bisect` useful when something breaks. The Stage 2
plan (one category per commit) is the right correction.

---

## 9. Manifest and versioning

**`manifest.json` is still `1.0.0`.** Confirmed.

**Recommend bumping to `1.3.0` now**, and adopting a simple rule going forward.
Full semantic versioning is overkill for a personal extension with one user, so
use the useful half of it:

- **Minor bump (`1.3.0` → `1.4.0`)** for each shipped feature batch — roughly one
  per commit under the Stage 2 plan.
- **Patch bump (`1.3.0` → `1.3.1`)** for a bug fix on its own.
- **Major bump** only if the storage schema changes in a way that would break
  existing saved data.

`1.3.0` reflects the three feature releases after the MVP. The practical payoff
is small but real: when the board misbehaves mid-draft, `chrome://extensions`
shows the version, and you can tell instantly whether the browser is running the
code you think it is — which `claude.md` records as having caused genuine
confusion before.

**Separately — one permission worth narrowing.** *(worth-fixing)*

`manifest.json` requests `"permissions": ["storage", "tabs"]`. The `tabs`
permission is broad: it grants the ability to read the URL and title of **every
tab you have open**. It's requested here for one narrow purpose — reading
`tab.url` in `background.js` to spot a `sleeper.com/draft/nfl/<id>` URL and
auto-fill the draft ID.

The narrower alternative is to drop `tabs` and add `"https://sleeper.com/*"` to
`host_permissions`, which grants URL access **only for Sleeper tabs** — exactly
what the feature needs, and nothing else. (`chrome.tabs.create` and
`chrome.windows.getAll`, used elsewhere, don't require the `tabs` permission at
all.) This costs nothing functionally and matters if this is ever shared or
published. **Verify against a real extension reload before shipping the change**,
since permission changes are exactly the kind of thing that works in theory and
fails in practice.

---

## 10. Live ADP implementation — verification

Every point in the brief re-checked against the current code. **All confirmed;
nothing has diverged.**

| Claim | Status |
|---|---|
| Endpoint `api.sleeper.app/projections/nfl/{year}?season_type=regular&position[]=…&order_by=pts_ppr`, plain `fetch()`, no auth, in `fetchSleeperAdp()` | ✅ confirmed, `rankings-manager.js:180` |
| ADP value read from `p.stats.adp_ppr` (not the `pts_ppr` ordering key) | ✅ confirmed, line 189 |
| Not the GraphQL endpoint | ✅ confirmed — nothing in the codebase references GraphQL |
| Host permission already covers it (`https://api.sleeper.app/*`) — nothing missing | ✅ confirmed |
| `res.ok` check | ✅ line 183 |
| Per-player shape guard (`p.stats && isFinite(p.stats.adp_ppr) && p.player && POSITIONS.includes(…)`) | ✅ line 186 |
| Empty-result guard that throws a readable message | ✅ line 192 |
| `catch` that toasts the failure | ✅ line 196 (**but see the stale "try FFC" string, §5**) |
| `finally` that always re-enables the button | ✅ line 198 |
| Manual button press, not a poll — mitigates the lack of rate-limiting | ✅ confirmed |

**Agreed: worth-fixing at most, not must-fix.** The two must-fix triggers named in
the original scoping (missing host permission, no failure handling) genuinely
don't apply.

The brief asked two sharper questions. Answers:

**Q: Is the shape-guard coverage sufficient if Sleeper renames a field
mid-season?** *Sufficient to prevent a crash; insufficient to tell you the truth.*
If `adp_ppr` is renamed, `isFinite(undefined)` is `false` for every player, the
filter empties the array, and the empty-result guard fires with:

> `No ADP data for 2026 season yet`

That message is **actively misleading** — it tells you Sleeper hasn't published
ADP yet, when in fact Sleeper published it under a different name. In August
that's a completely plausible-sounding message, so you'd shrug and move on rather
than investigating. **Fix:** distinguish the two cases. If the response contained
players but none had a usable `adp_ppr`, say *"Sleeper returned N players but no
`adp_ppr` field — their API may have changed."* *(worth-fixing)*

**Q: Would a silent partial result be noticed?** *Partially.* The success toast
reports the count (`ADP fetched — 12 players from Sleeper's own PPR ADP`), so the
information is on screen — but it appears in a green success toast that vanishes
in 2.6 seconds, and there's no baseline to compare against. Downstream, a 12-player
ADP source shows real numbers for 12 rows and `·` for everything else, which
looks identical to "these players aren't in this source," which is a normal state.
**Fix:** flag an implausibly small result as a warning-colored toast — under ~100
players from this endpoint is not a real ADP set. *(worth-fixing)*

---

## 11. Everything else

### 11a. Testing — **worth-fixing**, and here's the minimum that pays for itself

Confirmed: no automated test suite. The two `test-fp-parse*.js` files are broken
one-offs (§5).

The argument for adding tests isn't abstract — **this project's own history is the
argument.** The source-vote-boundary tiering rewrite passed a hand-written
simulation against bundled data (16 tiers, 10–61 players each: looked great) and
then failed on real data (an 11-player tier 1 followed by a 112-player tier 2).
The simulation was *the problem*, not the safety net: it tested synthetic
conditions that flattered the algorithm.

So the recommendation is deliberately **not** "add a test framework." It's:

**One file, `test.js`, no dependencies, run with `node test.js`.** ~150 lines.
`shared.js` is unusually testable because it's pure functions over plain data —
I ran every finding in this report through exactly this setup in about a minute of
work, so the setup cost is genuinely near zero. Cover:

1. **`parseRankings`** — the four real export shapes you actually use (bundled
   default, FantasyPros ECR, FantasyPros Real-Time ADP with its caption row and
   embedded team/bye, a plain analyst table), **plus the garbage cases from §4b**
   asserting they're *rejected*. This is where regressions have historically bitten
   (the `TIERS`-plural header bug, the caption-row bug, the `RK`-vs-`REAL-TIME`
   bug — three separate parser bugs in this project's history).
2. **`norm` / `playerKey`** — suffixes (Jr./III), punctuation (Ja'Marr), casing.
3. **`median`** — including the numeric-string case in §11d, which is currently
   broken.
4. **`buildConsensus` invariants** — a position-only source contributes nothing to
   `ranks`; a solo'd position-only source *does* get a real consensus (the bug
   fixed on 2026-08-23, worth locking down); a player missing from a source isn't
   penalized.
5. **`buildValueComparison` sign convention** — you verified this by hand once
   with a worked example; make that permanent so nobody "fixes" the sign.
6. **`findNearMatchOrphans` ambiguity rule** — two same-initial same-lastname
   players at one position must produce *zero* matches, not a guess.

**And the one that would actually have caught the tiering failure:** a script that
loads **your real exported storage** (dump `chrome.storage.local` to a JSON file
once) and asserts *distribution sanity* on the output — no tier holding more than
~25% of the board, no tier empty in the middle, consensus monotonic with rank.
Synthetic data will keep flattering algorithms; your real four-source blend won't.

### 11b. Render performance — **not a problem, with one exception**

Measured at realistic scale (3 ranking sources ≈ 950 player rows in, 371 merged
rows out; 2 ADP sources):

| Operation | Time |
|---|---|
| `buildConsensus` | **1.2 ms** |
| `buildAdpConsensus` + `buildValueComparison` | 0.65 ms |
| `findOrphans` | 0.6 ms |

`renderAll()` calls `buildConsensus` three times, and a poll tick calls it a
fourth for the match index — **~5 ms of math every 3 seconds.** That is nothing.
The full-`innerHTML` board rebuild costs more than the math does, but at ~370
rows it's still comfortably inside a frame. **Don't optimize this.** The
recompute-everything-every-tick design is buying real simplicity for a cost you
can't measure.

**The exception, and it's a real one:** `panel.js` writes `draftState` to storage
on **every** successful poll, and `saveDraftState()` always stamps a fresh
`updatedAt: Date.now()`. So the value always differs, so `chrome.storage.onChanged`
always fires, so **the Rankings Manager tab rebuilds its entire source bar and its
entire ~400-row table every 3 seconds for the whole draft** — even when no pick
has come in and nothing has changed. Consequences: any text selection in the table
is destroyed every 3 seconds, hover states reset, and you're burning CPU on a
laptop for a table nobody is looking at. **Fix:** skip the write when the picks
actually haven't changed (compare pick count or the last pick number before
persisting). *(worth-fixing)*

### 11c. The 400-row truncation IS reachable — **worth-fixing**

`renderTable` does `list.slice(0, 400)` with no indication that anything was cut.
Tested against your actual described setup:

| Sources | Merged rows |
|---|---|
| The two bundled sources (Flock + FantasyPros ECR) | **371** |
| Four sources, two using abbreviated first names (the Boone/Smyth shape) | **651** |

Abbreviated-name sources don't match existing players, so each one adds mostly
*new* rows rather than merging into existing ones. At 651 rows the manager
silently shows the first 400 and drops 251 — and the dropped tail is precisely
where deep-bench and unmatched players live, which is exactly what you'd open the
manager to investigate. **Fix:** either raise the cap substantially (rendering 651
rows is cheap — see 11b) or show *"showing 400 of 651 — narrow the filter"*. The
silence is the bug, not the number.

### 11d. `median()` mishandles numeric strings — **worth-fixing (latent but nasty)**

Found while testing corrupted-input resilience. `median()` sorts and averages
without coercing to `Number`, and the guard in front of it uses the loose global
`isFinite()`, which accepts numeric strings:

```
isFinite("3")         -> true    (Number.isFinite("3") -> false)
median([1, "3"])      -> 6.5     (expected 2)   // because 1 + "3" === "13"
median([1, "3", "5"]) -> "3"     (a string, not a number)
```

Two distinct failure modes, both bad:

- **Even number of sources:** string concatenation instead of addition produces a
  plausible-looking but completely wrong blended rank. No error, no warning.
- **Odd number of sources:** `median` returns a *string*, and the very next thing
  the board does is `r.consensus.toFixed(1)` — which throws, blanking the entire
  board.

**Is it reachable today?** No — `parseRankings` coerces with `Number()`, and
Sleeper's `adp_ppr` arrives as a JSON number. It is **latent**. I'm still rating
it worth-fixing for three reasons: the fix is one line (`Number(v)` in the sort
and the average, `Number.isFinite` in the guard); a latent bug whose symptom is
"a wrong number that looks right" is the worst kind to hit under time pressure;
and **VORP is about to introduce a batch of new numeric fields from a JSON API**,
which is precisely the path that would trip it.

### 11e. The `suppressEcho` guard — one definite flaw, one open question

Both surfaces write to shared storage and both listen for changes, so each needs
to ignore the echo of its own write. Both use a boolean.

**The definite flaw: it's one boolean guarding six different storage keys.**
In `rankings-manager.js`, `persistSources()` sets `suppressEcho = true` for the
duration of its write — and while it's true, the listener drops **every** change,
including a genuine `draftState` update written by the board window. So if a pick
lands in the same instant you toggle a source chip, the manager silently misses it
and stays stale until the *next* write (which during a real draft could be a
minute away). Small window, but a real one, and the failure is invisible.

**Fix:** make the guard per-key — track which keys this surface just wrote
(`suppressed.add(K_SOURCES)`), or better, compare the incoming `newValue` against
what this surface already has and skip if identical. The comparison approach is
more robust because it doesn't depend on timing at all.

**The open question I could not resolve here:** the guard assumes
`chrome.storage.onChanged` fires *before* the `set()` promise resolves. Chrome
does not document that ordering. If the event actually fires *after*, the flag is
already back to `false` and the guard never works — the surface just re-loads and
re-renders on its own writes. That's harmless correctness-wise (the reloaded data
is identical), but it means a redundant full re-render on every write, which
compounds with 11b's every-3-seconds re-render. **This needs a 30-second check in
a real loaded extension** (log inside the listener, watch whether it fires while
the flag is set) — I flag it rather than assert it. **The comparison-based fix
above sidesteps the question entirely**, which is a good reason to prefer it.

Smaller related item: `panel.js`'s `setFlag()` writes flags **without** setting
its guard, so the panel reloads flags and calls `renderAll()` a second time on
every flag change. Harmless, but it's the guard being applied inconsistently
within one file. *(minor-polish)*

### 11f. Discoverability and accessibility — **worth-fixing as a pattern**

**Confirmed: zero `aria-*` attributes, zero `role=`, zero `tabindex` across both
HTML files.** The only keyboard handling anywhere is `Escape` to close the two
floating menus.

The pattern the brief asks about is real and it's broader than the two named
cases:

| Feature | How you find it | Keyboard path |
|---|---|---|
| Favorite/avoid on the board | right-click a name | none |
| "Merge near matches" | right-click a name in the manager | none |
| Isolate a source | **double**-click a chip | none |
| Cross a player off the board | **double**-click a row | none |
| Un-cross a player | double-click again | none |
| Collapse/expand unmatched players | click a header that doesn't look clickable | none |

Six features, none discoverable without being told, none reachable by keyboard.
Several *do* have `title` tooltips (the source chips say "Click to enable/disable
· double-click to isolate," which is good), but a tooltip is only found by
hovering something you already suspect is interactive.

Compounding it: the interactive elements are mostly `<span>`s (chips, the ✕/★/⊘
buttons, source dots, merge-candidate rows), which browsers don't make focusable
or keyboard-activatable at all. So even a user who *knows* the feature exists
can't reach it without a mouse.

**And the case that already bit you** — the unmatched-players section hiding
itself completely (`display:none`) when nothing clears the rank-150 cutoff, so
you couldn't find it at all — is the same root cause: **the UI gives no signal
that a capability exists.** The right-click merge menu was shipped as the fix for
that specific instance, but it was itself shipped as a right-click-only,
invisible affordance. The pattern reproduced itself.

**Recommended, in priority order:**
1. **Make hidden things visible in their empty state.** Show "UNMATCHED PLAYERS
   (0)" rather than removing the section. Never `display:none` a whole feature.
2. **Add one visible affordance per hidden gesture** — a small ⋯ on row hover
   opening the same menu right-click opens. One change, covers both right-click
   features.
3. **Make the span-buttons real `<button>`s** (or add `tabindex="0"` + an Enter
   handler). This is also the entire accessibility fix, essentially for free.
4. Keyboard shortcuts (`/` to focus search, arrows through the board) would be
   genuinely useful on draft day, but that's a feature, not a fix — put it in the
   backlog.

### 11g. Draft-day failure modes — walking the live path

The highest-value lens. Walking a real draft start to finish:

**Degrades gracefully (good — don't change these):**

| Situation | What happens |
|---|---|
| Sleeper API blips | Backoff to 8s, board keeps showing last-known-good state, red status explains it. Recovers on its own. |
| Sleeper is slow | `inFlight` prevents request pile-up. |
| A pick is a player you don't have ranked | Counted and reported in the status line, ignored otherwise. |
| K/DST picks | Skipped by design. |
| A source disagrees on a player's name | Player appears twice; annoying, not broken; two merge paths exist. |
| Board window moved/resized | Persisted, and off-screen coordinates are sanity-checked before reuse (`background.js` — a nice catch by whoever wrote it). |
| A wrong draft ID | HTTP 404 → clear red error. |

**Would break badly, and you couldn't fix it with a clock running:**

| Risk | Severity | Why |
|---|---|---|
| **A source imported without positions is silently inert** (§4a) | **must-fix** | No symptom. You draft against a blend missing a source you think is in it. |
| **Corrupted storage blanks the board permanently** (§4d) | worth-fixing | Every render throws, on every load. Needs DevTools to escape — not something you do mid-draft. |
| **A wrong-sport draft ID reads as healthy** (§4c) | worth-fixing | Green "LIVE", nothing crosses off, no explanation. |
| **Closing the board window stops everything** | worth-fixing (see below) | Nothing polls in the background; reopening requires clicking SYNC again. |
| **Timer throttling when the window is behind others** | **unverified — please test** (see below) | Potentially the worst one on this list. |

**The throttling risk, stated carefully because I could not verify it here.**
During a real draft your Sleeper draft room is in front and the board window is
behind it. Chrome throttles JavaScript timers in pages it considers hidden — and
on macOS it tracks window *occlusion*, so a fully-covered window can be treated as
hidden. After a stretch of being hidden, Chrome's "intensive throttling" can
reduce timers to roughly **once per minute**. Both your poll loop and your
cache-expiry countdown run on exactly the kind of timer this affects.

If that happens, the board silently falls behind by up to a minute during the
part of the draft where seconds matter, and the only visible clue is the
`checked 8:47:03 (#412)` timestamp in small grey text, which nobody watches.

> **TESTED 2026-08-23 — not throttled. This finding is closed.**
> Over roughly ten minutes the check counter went from **#9 to #213** — 204
> polls, about **2.9 seconds each**, which is the full `FAST_INTERVAL_MS` rate.
> Intensive throttling would have produced ~10 polls (about `#19`) over the same
> span. Chrome is not throttling this window's timers.
>
> The staleness indicator was still built (below), because it costs almost
> nothing and converts *every* silent-stall failure mode into a visible one —
> including causes nobody has thought of yet. But it is no longer urgent, and
> the conditional must-fix is withdrawn.

If it does throttle, the fix is small and worth doing regardless: listen for
`document.visibilitychange`, force an immediate poll when the window becomes
visible again, and turn the sync line red once the last successful check is more
than ~30 seconds old. **That staleness indicator is worth adding either way** —
it converts every silent-stall failure mode on this list into a visible one,
including ones nobody has thought of yet. Given how much of this section is about
silent failures, it may be the single highest-leverage change in the report.

**On closing the board window:** nothing polls while it's closed
(`background.js` only manages windows), and reopening restores the draft ID but
requires clicking SYNC again. Reasonable — but consider auto-resuming when a saved
draft ID is restored and the last sync was recent, since the state you're in when
you accidentally close that window mid-draft is not one where you want an extra
step.

---

## Findings index

**must-fix (2, plus 1 closed by testing)**

| § | Finding |
|---|---|
| 4a | A source imported with no position column is silently inert — import reports success, contributes nothing |
| 7b | `4thGo-feature-backlog.md` contradicts reality, including telling the next build that Sleeper has no ADP endpoint |
| ~~11g~~ | ~~Timer throttling of the background board window~~ — **TESTED AND CLOSED**: 204 polls in ~10 min (#9 → #213) is the full 3s rate, not throttled |

**worth-fixing (20)**

| § | Finding |
|---|---|
| 2a | CSS palette and base styles duplicated across both HTML files (37 shared selectors, `:root` byte-identical) |
| 2b | `toast()`/`$`/`activeSources()` duplicated; the filter trio has already drifted apart |
| 3 | No HTML escaping anywhere — 20 `innerHTML` sites; rendering corruption, not code execution |
| 4b | Garbage input (recipes, HTML pages, number grids) imports as real players |
| 4c | A non-football draft ID displays as a healthy green "LIVE" sync |
| 4d | Malformed stored source data throws and blanks the board on every load, unrecoverably |
| 5 | Three stale user-facing strings: "try FFC", and "side panel" ×2 |
| 5 | `build-fp-source.js` hardcodes a personal Downloads path; documented workflow doesn't match what it does |
| 6 | `builtin` misnamed; code-seeded sources identified by a hardcoded id list in two places |
| 7a | No README |
| 7d | `claude.md` at 55 KB auto-loads every session — split stable architecture from dated history |
| 9 | Version stuck at `1.0.0`; adopt a bump rule |
| 9 | `tabs` permission is broader than needed; `host_permissions` for sleeper.com would be narrower |
| 10 | A renamed Sleeper field would report "no ADP data yet" — misleading; and a tiny partial result reads as normal |
| 11a | No tests, on a codebase whose own history shows a simulation passing where real data failed |
| 11b | Manager rebuilds its full table every 3 seconds because `updatedAt` always changes |
| 11c | 400-row table cap is reachable (651 rows measured with 4 sources) and silent |
| 11d | `median()` mishandles numeric strings — silently wrong result, or a blank board |
| 11e | `suppressEcho` is one boolean guarding six keys; drops other surfaces' genuine updates |
| 11f | Six features are right-click/double-click-only with no visible affordance and no keyboard path |

**minor-polish (10)**

| § | Finding |
|---|---|
| 1 | `shared.js` mixes math and rendering — split when VORP lands, not before |
| 4d | Storage writes never check for failure; `persistDraftState` has no `.catch()` |
| 4f | STOP mid-request lets the status flip back to green "LIVE" |
| 5 | `test-fp-parse.js` / `test-fp-parse2.js` are broken one-offs — delete |
| 5 | ~24 lines of dead CSS in `rankings-manager.html` (**`.posChip` is NOT dead — brief was wrong**) |
| 5 | Stale "side panel"/"pop-out" comments in 11 places |
| 6 | `suppressEcho` vs `suppressStorageEcho`; `rank` means "ADP value" on ADP sources |
| 6 | `claude.md` vs `CLAUDE.md` casing; `panel.html` has no `<title>` |
| 8 | `rankings-manager-prompt.md` is `600` on disk (harmless — git doesn't record it) |
| 11e | `setFlag()` skips the echo guard, causing a double render |

**Explicitly checked and NOT a problem** *(recorded so these don't get re-raised)*

- Project structure — flat layout is correct at this size; don't restructure (§1)
- `chrome.storage.local` quota — measured; you'd need 300+ sources to approach it (§4e)
- Consensus/render math performance — 1.2 ms per `buildConsensus`; don't optimize (§11b)
- The polling loop's backoff and `inFlight` guard — correct as built (§4)
- Live ADP implementation — all ten brief claims verified, nothing diverged (§10)
- Git hygiene — no secrets, nothing committed that shouldn't be; commit messages are genuinely good (§8)
- `.gitignore` — exists and works (§8)

**Corrections to the brief**

- **`.posChip` is not dead CSS** — it's used at `rankings-manager.js:252`. The
  dead set is different and larger; see §5.
- **The `600` permission on `rankings-manager-prompt.md` doesn't propagate.** Git
  records only the executable bit; the file is staged `100644` like everything
  else. Local-disk oddity, not a repo issue.
- **"BEER"/"VBD" confirmed absent** from the entire repo (the only match is the
  brief's own verified-facts table saying so). The backlog calls this **VORP
  (#8)**. Naming mismatch confirmed; nothing was invented about the nonexistent
  file's contents.
- **Three stale user-facing strings, not one.** The brief identified the "try FFC"
  toast; two more "side panel" references are also user-visible (§5).
- Everything else in the verified-facts table held up against the code.

---

## Suggested Stage 2 order

Proposed sequence — one batch per commit, pausing between. Ordered so the
highest-consequence and lowest-risk work lands first, and so nothing later is
built on top of something being changed.

1. **Stale strings and dead code** — the three user-facing strings, the two dead
   test files, the dead CSS, the "side panel" comments. Zero risk, immediately
   removes wrong information. *(§5)*
2. **Silent-failure fixes** — the no-position import block, the garbage-input
   sanity check, the wrong-sport warning, the 400-row disclosure, the ADP
   field-rename message, and the **staleness indicator on the sync line**. This
   is the batch that most changes how the tool behaves when something goes wrong.
   *(§4a, §4b, §4c, §10, §11c, §11g)*
3. **The escape helper** — add `esc()` and apply it at every site. Mechanical,
   but touches a lot of lines, so it wants its own reviewable commit — and it
   must land **before** VORP touches these files. *(§3)*
4. **Robustness** — `median()` coercion, defensive source-shape filtering, the
   `renderAll()` guard, the per-key echo guard, the redundant `draftState` write.
   *(§4d, §11b, §11d, §11e)*
5. **`test.js`** — write it *after* batches 2–4 so the tests lock in the new
   behavior rather than the old. *(§11a)*
6. **Documentation** — backlog reconciliation, the README, the `claude.md` split,
   the version bump. *(§7, §9)*
7. **Duplication and naming** — shared CSS, shared helpers, the `builtin` rename.
   Deliberately last: it's the batch with the most churn and the least urgency.
   *(§2, §6)*

**Not in Stage 2:** the discoverability/accessibility work (§11f) is a design
task, not a fix — it belongs with the deferred UI redesign (backlog #2), except
for the two cheap parts (never `display:none` a whole feature; make the span-
buttons real buttons), which fit in batch 1.

**Before any of it:** run the 5-minute throttling test in §11g. If timers are
being throttled when the board window is behind others, that jumps to the top of
the list and everything else waits.

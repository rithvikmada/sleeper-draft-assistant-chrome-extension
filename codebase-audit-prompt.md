# Codebase audit prompt — 4th&Go

Paste/point a fresh Claude Code session at this file to run the audit. It is a
**floor, not a ceiling** — the categories below are the known asks; anything
else a real dev team would flag belongs in the report too.

`claude.md` (read automatically at session start) and `4thGo-feature-backlog.md`
have the full project context — confirm you've picked both up before starting.

---

## READ THIS FIRST — verified facts, do not re-derive or contradict

These were checked against the real code on 2026-08-23, immediately before this
audit was scoped. An earlier draft of this prompt asserted several things that
were **already false**. Treat the list below as ground truth; if you find it
disagrees with the code, the code wins — say so explicitly rather than silently
following either one.

| Claim | Status |
|---|---|
| `claude.md`'s ADP section says "no public ADP endpoint exists" | **FALSE — already corrected.** The ADP section and the "Sleeper's public API" section both document the live projections endpoint correctly, including that it's undocumented-but-public. There is no contradiction left to fix. Do not "correct" it again. |
| The ADP fetch might need a `host_permissions` change | **FALSE — no change needed, none missing.** See the ADP section below. |
| The ADP fetch might use the internal GraphQL endpoint | **FALSE.** GraphQL was investigated and rejected; nothing calls it. |
| The XSS/`innerHTML` finding is a `rankings-manager.js` problem | **UNDERSTATED.** It spans three files — see Category 3. |
| There is no `.gitignore` | **FALSE.** One exists (`.DS_Store`, `node_modules/`) and is working — `.DS_Store` is present on disk and correctly untracked. |
| `beer-vbd-prompt.md` sequences after this audit | **That file does not exist** anywhere. The backlog calls this concept **VORP (#8)**; "BEER"/"VBD" appear nowhere in the repo. Flag the naming mismatch; don't invent the file's contents. |

**Sequencing note (corrected):** this audit happens before the next major
feature build — the value-over-replacement work tracked as **backlog #8 (VORP)**,
which #13 (team grade) is blocked on. That build will heavily modify
`rankings-manager.js` and `shared.js` — the same files carrying the `innerHTML`
finding below — so fixing the foundation first means the new feature is built
clean rather than extending an existing anti-pattern into more code.

---

## Framing

We're at ~65% of the planned feature set, MVP-functional, and committed to GitHub
a few times. Before adding more features, I want a full engineering review — the
kind a real dev team would do before calling something production-ready. **I'm not
an engineer, so explain findings in plain language, not just jargon.**

For EACH finding: what it is in plain language, why it matters *practically*
(not just "best practice"), and a severity — **must-fix / worth-fixing /
minor-polish**.

One extra lens that matters more than usual here: **this tool gets used live,
once, under time pressure, on draft day.** A bug that's a minor annoyance in
normal software is severe here if it strikes mid-draft and can't be debugged
with a pick clock running. Weight severity accordingly, and call it out when
that's what's driving a rating.

## Do this in TWO STAGES. Do not start fixing anything in Stage 1.

---

### STAGE 1 — Audit report only, no code changes

Go through every file and produce a written report as a new file, `AUDIT.md`.

**1. Project structure** — is the flat file layout still appropriate at this
size, or should things be grouped into folders (e.g. `shared/`, or separating
the two surfaces' assets)? Don't assume a restructure is needed just because
it's possible — say whether it's actually worth the churn at this size, and if
not, say that plainly.

**2. Duplication** — anywhere the same logic, styles, or constants are written
more than once instead of shared. Known and confirmed: `panel.html` and
`rankings-manager.html` each redefine the full `:root` color palette, button
base styles, and the `.vbig`/`.vbadge` value-bar family in separate `<style>`
blocks, kept in sync by hand. Confirm the real extent and find anything similar
— including duplicated *logic*, not just CSS (the `posFilter`/`showTaken`/
`playerSearch` filter trio is deliberately duplicated across both surfaces;
assess whether that's still the right call or now worth sharing).

**3. Security** — check every place user-imported or external data (CSV
imports, player names, source names, Sleeper API responses) reaches the page.

Verified scope to start from: **~20 `innerHTML` assignments across three files**
— `panel.js` (4), `rankings-manager.js` (10), `shared.js` (6) — and **no HTML-
escaping helper exists anywhere in the codebase.** Player names and source names
flow straight into template strings from CSVs the user pastes in and from the
Sleeper API.

Assess it honestly rather than either dismissing or inflating it: the realistic
threat model is a malicious/malformed CSV or a surprising API response, not a
remote attacker. But note that source names and player names also land inside
HTML *attributes* (`title="..."`, `data-*`, inline `style="color:${s.color}"`),
which is a different and easier-to-trip escaping context than element text.
Recommend a concrete fix (single escape helper + apply at every interpolation
site, vs. `textContent`/DOM methods where practical) and say which sites are
highest-risk. Rate it, don't just flag it.

**4. Error handling** — what happens on: malformed/garbage CSV import, a failed
Sleeper fetch beyond the existing backoff, missing or corrupted
`chrome.storage` data, a draft ID that doesn't exist or belongs to another
sport, and `chrome.storage.local` hitting its quota (the default source's
player array is persisted when `manualOverride` is set, and icons are stored as
data URLs — both grow storage). Note what's already handled well vs. what would
currently fail silently or ugly. The polling loop's backoff and `inFlight`
guard are known-good — say so, don't re-flag them.

**5. Dead code** — anything left from earlier iterations that nothing calls.
Known candidates to verify: `test-fp-parse.js` / `test-fp-parse2.js` (documented
as disposable one-offs with a stale hardcoded absolute path, still tracked in
git), `rankings-manager-prompt.md` (documented as fully superseded, kept for
history), and dead `.bestCard`/`.bestMeta`/`.posChip` CSS in
`rankings-manager.html`. Also check for stale *strings and comments*, not just
unreachable code — see the pre-identified findings section below.

**6. Naming & consistency** — inconsistent naming across files, unclear
variable/function names, anything that would confuse a new reader. Include the
`claude.md` vs conventional `CLAUDE.md` filename casing.

**7. Documentation gaps** — there is **no README** (confirmed). Assess what a
stranger would need to install and understand this, and whether non-obvious
decisions are commented *in the code itself* rather than only in `claude.md`.
Note that the Cloudflare 15s cache finding and the ADP-endpoint correction
*are* already commented inline — check whether other load-bearing decisions
(the tiering algorithm's failure history, `positionOnly`'s isolation from blend
math, the `suppressEcho` storage-echo guard) are similarly covered.

**Do not** re-correct the ADP section — see the verified-facts table above.

**8. Git hygiene** — `.gitignore` exists and works; verify nothing else is
committed that shouldn't be. Comment on whether past commit messages are clear
enough to reconstruct history later. Note `rankings-manager-prompt.md` is
tracked with unusual `600` file permissions.

**9. Manifest/versioning** — `manifest.json` is still `1.0.0` despite
significant feature growth. Recommend a versioning approach to adopt going
forward, and whether anything should bump now.

**10. Live ADP implementation — VERIFY, don't re-discover.** Already checked;
confirm each point and flag only if the code has since diverged:

- **Endpoint:** `GET https://api.sleeper.app/projections/nfl/{year}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&order_by=pts_ppr` — plain `fetch()`, no auth, in `fetchSleeperAdp()` (`rankings-manager.js`).
- **ADP value read from:** `p.stats.adp_ppr` (not the `pts_ppr` ordering key).
- **Documented?** No — `docs.sleeper.com` lists no ADP route. Undocumented but public, open CORS.
- **Host permission:** hits `api.sleeper.app`, already covered by
  `"host_permissions": ["https://api.sleeper.app/*"]`. **No change was needed
  and none is missing.** Not the GraphQL endpoint.
- **Caution treatment:** has `res.ok` check, per-player shape guard
  (`p.stats && isFinite(p.stats.adp_ppr) && p.player && POSITIONS.includes(...)`),
  an empty-result guard that throws a readable message, a `catch` that toasts
  the failure, and a `finally` that always re-enables the button. No caching or
  rate-limiting — but it's a **manual button press, not a poll**, which is the
  mitigating factor.

Given the above, this lands at **worth-fixing at most, not must-fix** — the two
must-fix triggers named in the original scoping (missing host permission, no
failure handling) both turned out not to apply. Judge whether the shape-guard
coverage is genuinely sufficient if Sleeper renames a field mid-season, and
whether a silent partial result (e.g. 12 players returned instead of 400)
would be noticed by the user — the empty-result guard only catches *zero*.

**11. Anything else a team would flag** — floor, not ceiling. In particular,
consider these, which the original list didn't cover:

- **Testing.** There is no automated test suite (`claude.md` says so
  explicitly). But `shared.js` holds pure, highly testable functions —
  `parseRankings`, `buildConsensus`, `assignBlendedTiers`, `norm`/`playerKey`,
  `buildValueComparison`, `findNearMatchOrphans`. This session's own history is
  the argument: a tiering rewrite passed a hand-written simulation and still
  failed on real data. Recommend the *minimum* worthwhile coverage, not a
  wholesale testing strategy.
- **Render performance.** The board re-renders via full `innerHTML` replacement,
  and `buildConsensus` re-runs, on every poll tick (~3s) plus every filter
  change. Assess whether that's actually a problem at real data sizes (~370
  merged players, several sources) or a non-issue. Also: `renderTable` silently
  truncates to 400 rows — is that reachable, and would a user notice?
- **Two-surface state consistency.** Both surfaces read/write the same
  `chrome.storage.local` keys and guard against their own echo with a
  `suppressEcho`/`suppressStorageEcho` boolean. Assess whether that guard is
  actually sound or has a race.
- **Discoverability / accessibility.** Several features are **right-click-only
  with no keyboard path and no visible affordance**: favorite/avoid on the
  board, and "merge near matches" in the manager. This is not theoretical — the
  user could not find the unmatched-players section at all in this same session,
  because it hides itself entirely when nothing clears its rank-150 cutoff.
  Flag the pattern, not just the one instance.
- **Draft-day failure modes.** The highest-value lens: walk the path of a live
  draft and name what would break badly and unrecoverably mid-draft, versus what
  degrades gracefully.

---

## Pre-identified findings — verify and fold into `AUDIT.md`

Noticed while gathering the facts above. Confirm each still exists, then include
it in the report with your own severity rating (don't just copy these in
unverified, and don't fix them in Stage 1):

1. **Stale user-facing error string.** `rankings-manager.js:197` — the ADP fetch
   failure toast reads `"... — try FFC or pasting instead"`, but **FFC was
   removed from the extension entirely** (button, fetch function, and host
   permission all deleted). A user hitting a failed fetch is told to use a
   feature that no longer exists. User-visible, mid-draft-reachable.
2. **Stale comment** — `shared.js:674` still describes "Sleeper live, FFC live"
   as current ADP options.
3. **No HTML-escaping helper exists** anywhere — see Category 3.
4. **`claude.md` is ~53KB / 700+ lines** and growing every session. It is the
   file that gets auto-loaded into *every* session's context. Assess whether
   it needs splitting (e.g. stable architecture vs. dated session history) or
   pruning of superseded detail — and weigh that honestly against its clear
   value, since much of its bulk is genuinely load-bearing "don't re-attempt
   this" history.

---

### STAGE 2 — only after I review `AUDIT.md` and confirm priorities

We'll go through the report together, I'll tell you what to tackle and in what
order, and you'll fix things in **small reviewable batches** — one category or
one related group of fixes per commit, with a clear commit message each time,
not one giant sweeping change. **Pause for my confirmation between batches**
rather than running through the whole list unattended.

After Stage 2 work, update `claude.md` and `4thGo-feature-backlog.md` to reflect
what changed, same as after any other build session.

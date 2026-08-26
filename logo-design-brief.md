# 4th&Go — Logo & Brand Animation Design Brief

Not shipped code — a design brief for a designer, or a prompt to paste into
Claude Design / another AI design tool. Written to be comprehensive enough
to hand off as-is.

## The product, in one line

4th&Go is a paid Chrome extension: a live draft cockpit for fantasy football
that syncs to a Sleeper draft in real time, blends ranking sources into a
tiered board, and auto-crosses off players as picks land.

## Name meaning (use this — don't reinvent it)

"4th & Go" is football's most all-in down-and-distance call: 4th down, no
choice but to go for it. That's the emotional register to design toward —
decisive, high-stakes-but-in-control, not playful/cartoonish. Someone using
this is mid-draft, under a pick clock, trying to make the right call. The
mark should feel confident and precise, not like a mascot.

## Existing visual language — the mark must live inside this system, not fight it

The app already has a full, shipped design system (imported from a Claude
Design project, "4th&Go Draft Board Redesign"). The logo is the one piece
still missing from it — everything else should be treated as fixed
constraints, not inspiration to deviate from:

- **Palette**: a dark ink/chalk theme with a faint field-green cast.
  - Ink scale: near-black `#070908` up through `#C9D2CD`, 11 steps
  - Primary accent — **chalk gold**, `#FFD84D` (muted-to-bright range
    available) — this is the brand's signature color, already used for the
    "&" in the existing wordmark and for primary buttons throughout the app
  - Signal colors (secondary, not primary brand color): cyan `#22D3EE`,
    green `#35D07F`, red `#FF5A5A`, orange `#FF8A3D`, violet `#A78BFA`
  - Position colors (used elsewhere in-app, available if relevant): QB pink
    `#F4527A`, RB green `#35D07F`, WR cyan `#22D3EE`, TE orange `#FF8A3D`
- **Typography**: Chivo (sans-serif, several weights) for all UI/wordmark
  text; JetBrains Mono for data/numeric contexts. The existing in-app
  wordmark is `4th<span style="color:#FFD84D">&</span>Go` in Chivo bold —
  keep the gold ampersand as the one color accent in the wordmark; it's
  already a recognizable detail.
- **Iconography**: Lucide-style icons throughout the app — 24px grid,
  1.5–2px stroke, rounded line caps, no fill (outline-only). If the symbol
  mark uses linework rather than a solid shape, match this exact stroke
  language so it doesn't read as a foreign style next to the app's own UI
  icons.
- **Shape language**: rounded corners (3px–14px radius scale), no sharp
  edges anywhere in the existing UI. Nothing skeuomorphic, no gradients-as-
  decoration (the one deliberate exception already in the app: a slow
  animated gold gradient ring was tried for a "top pick" UI highlight and
  was reverted after user feedback that it distractingly pulled the eye —
  see "motion philosophy" below, this is directly relevant).

## Deliverables

### 1. Wordmark (typeface lockup)
Refine/finalize the existing "4th&Go" treatment — Chivo bold, gold "&",
rest in the ink-scale white/near-white used for primary text. This already
exists informally in the app; treat this as "make it a real, exported,
production asset" rather than "invent something new." Provide as scalable
vector (SVG), both light-background and dark-background versions if the
color needs any adjustment for contrast.

### 2. Symbol / icon mark (the part that's actually missing)
A standalone mark that works with **no text at all** — this is the piece
that has to survive being shrunk to a 16×16px browser toolbar icon and a
favicon, where the wordmark is illegible. Requirements:
- Must read clearly at 16px, not just look fine at large sizes then get
  muddy small — design and test at 16/32/48px explicitly, not just 512px
  down-scaled.
- Should evoke "4th & Go" without literally being a football (avoid a
  literal pigskin icon — too generic/cliché for a data/analytics tool).
  Consider: a down-marker/chain-gang motif, a "4" integrated with a
  directional/forward arrow or chevron (matches the "go for it, no turning
  back" meaning and doubles as reading as data/progress), or an abstracted
  yard-marker line. Open to other directions that hit the same meaning —
  this is the one part of the brief with real creative latitude.
- Must work as a single-color mark (for contexts needing one flat color —
  e.g. a monochrome favicon fallback) in addition to any full-color version.
- Use the same Lucide-style linework (1.5–2px stroke, rounded caps) if the
  direction is line-based, so it feels native to the rest of the app's
  iconography rather than an imported sticker.

### 3. Combined lockup (symbol + wordmark)
Horizontal lockup (icon left, wordmark right) — this is what renders in the
app's header top-left and the landing page's nav/hero. Provide spacing
rules (minimum clear space around the mark) and a compact/stacked variant
in case a narrower layout ever needs it.

### 4. Animated version
Needed in **two different contexts with different motion budgets** — treat
these as two separate specs, not one animation reused everywhere:

**A. In-app header (top-left of the extension window)**
- This runs in front of a user for the ENTIRE length of a live draft —
  often an hour or more. **Motion here must be restrained**, or it becomes
  fatiguing/distracting exactly the way a prior in-app animation attempt
  was (see "motion philosophy" below — direct precedent from this same
  product).
- Recommended: a single **one-time entrance animation on window open**
  (roughly 400–800ms — a subtle draw-on/fade-up/settle of the mark), then
  **fully static** for the rest of the session. No continuous loop, no
  idle "breathing" animation, no periodic re-trigger.
  - Acceptable idle detail: a small hover micro-interaction (e.g., a
    slight color shift or a tiny settle-bounce) IF the user's mouse is
    actually over the mark — never ambient/automatic.
- Deliver as: an SVG with CSS `@keyframes`/transition-friendly structure
  (separate `<path>`/`<g>` elements the engineer can animate independently)
  is strongly preferred over a baked video/GIF, since it needs to sit
  inline in an existing HTML/CSS codebase (Chivo/JetBrains Mono web fonts,
  CSS custom properties already defined) and match the current theme
  (light/dark mode swap) live.

**B. Landing page hero**
- More motion budget here — this is a one-time viewing (someone deciding
  whether to buy), not something staring at it for an hour. A longer,
  more expressive animation is fine: e.g., the symbol assembling itself
  from lines/segments, a subtle parallax on scroll, or a looping idle
  animation that's slow and understated (think: a slow gradient shimmer or
  a soft glow pulse, several seconds per cycle, never fast/attention-
  grabbing).
- Should still avoid anything that reads as "trying too hard" — the brand
  tone is confident/precise, not flashy.

**Format for both**: prefer **Lottie JSON** or **hand-authored SVG + CSS**
over an MP4/GIF — both need to render crisply at arbitrary sizes, support
transparent backgrounds, and (ideally) respect `prefers-reduced-motion` for
accessibility. If Lottie, also provide the source (After Effects file or
equivalent) in case timing/easing needs adjustment later.

### 5. Export package
- Wordmark: SVG (vector, editable)
- Symbol mark: SVG (vector, editable), single-color variant included
- Combined lockup: SVG
- Rasterized icon set: 16×16, 32×32, 48×48, 128×128, 512×512 PNG
  (transparent background) — these map directly to the extension's
  `manifest.json` icon slots and Chrome Web Store listing requirements
- Favicon: `.ico` (multi-resolution) for the landing page
- Animated asset: Lottie JSON (preferred) or SVG+CSS source, for both the
  in-app-header version and the landing-page-hero version separately
- A one-page style reference showing minimum size, clear space, and
  correct/incorrect usage examples (e.g., don't recolor the "&", don't
  stretch/skew, minimum contrast requirements against the ink background)

## Motion philosophy — read this before designing any animation

This isn't a hypothetical concern — it already happened once in this exact
product and is documented as a real lesson: an animated gold gradient ring
was added to a "this is the best pick" UI highlight, and **direct user
feedback was that it kept pulling the eye back to that spot for the
majority of a multi-hour draft session** — the opposite of what a passive,
always-visible UI element should do. It was reverted to fully static. The
one exception kept: a *rare*, threshold-crossing state still gets a brief
animated highlight, specifically because earning attention occasionally is
different from constant motion.

**Apply the same logic to the logo**: anything visible continuously during
a draft (the in-app header mark) should default to static/one-time-only
motion. Save genuine looping/ambient animation for the landing page, where
it's a first impression, not a background presence for an hour.

## Context for tools like Claude Design

If generating exploratory directions with an AI design tool: ask for 3-4
distinct symbol-mark directions first (before any animation or lockup
work), each shown at both large size and actual 16px scale, before
committing to one. Reference the palette/typography/shape constraints above
verbatim — don't let the tool invent a new color system or typeface.

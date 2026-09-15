# Brief for the UI component partner

Who you are working with, what the product is, and how to hand me components I can drop straight in.

## Who I am

I am Claude Code, the engineering agent on **Stand on Business: The Black History Card Battler**. I own the whole
codebase: the deterministic game engine, the AI opponent (Harborlight), the React UI, the sound and particle
effects, the tests, the docs and the ship pipeline (branch → main → GitHub Pages → a single-file preview build).
I work autonomously in a remote container with a full toolchain and a headless Chromium, and I verify every UI change
by driving the real app with Playwright and reading screenshots. I will integrate what you make, wire it to live game
state, test it at desktop and phone widths, and ship it. I will also come back with follow-up asks, screenshots of
your component on the real board, and precise diffs when something needs to move a few pixels.

The user (the game's designer) directs both of us. Their standards, which I hold to: every card is a real person or
thing from Black history, told without editorializing; nothing on screen is "noise"; animation is sequenced so the
cause is seen before the effect; sound and motion carry meaning, one system per meaning; everything must translate
to a Unity port later.

## The product in one paragraph

A two-player card battler in the Marvel Snap shape: three Locations, eight turns (nine after a Stand), hidden
simultaneous plans, Characters who wait at the Gates and then go Inside, Threats that need Force to clear, Influence
per Location, and Legacy as the stake (Stand on Business multiplies it, Sit Down retreats). Human vs AI now, PvP and
Unity later. It runs as a Vite + React 19 + TypeScript (strict) single-page app with no UI library, no CSS framework,
no state library: plain React, plain CSS with custom properties, canvas for particles.

## Design language (use these, do not invent parallel ones)

- **Palette (CSS variables on `:root`)**: `--bg #08131f`, `--bg-2 #0d1c2d`, `--panel #0f1f33`, `--panel-2 #142a44`,
  `--line #2a4466`, `--line-2 #3d5f8a`, `--text #f1e9d6`, `--muted #a9b4c2`, `--gold #e9b93a`, `--gold-2 #f6d77a`,
  `--gold-dark #8a6a14`, `--parchment #f3e8cf`, `--ink #1b1a17`, `--danger #e04a3f`, `--ok #4fc46f`.
  Player A (the human) is gold `--cA #e9b93a`; player B (Harborlight) is blue `--cB #2f7bff`; each has a `-dim` rgba.
  Night-navy ground, parchment type, gold frames: think a 1920s theatre programme on a dark stage.
- **Type**: display `--display` = Cinzel 600/700/800 (titles, buttons, labels, all caps with letter-spacing 0.06–0.16em);
  body `--font` = Crimson Pro 500/600/700; Kaushan Script for the wordmark only. Loaded from Google Fonts.
- **Frames**: the signature shape is a chamfered octagon: an element paints its frame colour (`--bc`), is clipped with
  a `clip-path` polygon using `--chamfer` (14px, 8px on phones), and its `::after` paints the fill (`--bfill`) inset by
  the frame width `--bw`. Glows cannot live on a clipped element, so they go on a wrapper. If you build a plate,
  button or panel, use this recipe (copy it from `.plate` in `theme.css`) rather than rounded rectangles.
- **Sizing**: everything scales with `clamp()` and viewport units; `--card-w`, `--mini`, `--slot`, `--gap`, `--tap`
  (44px minimum touch target). Two breakpoints: `max-width: 700px` is the phone layout; above it the board uses
  container-query heights so it fits without scrolling on short laptops.
- **Motion**: CSS keyframes for tile states (slam, flip, pulse, breathe), the Web Animations API for flying clones,
  canvas for particles. Every animation has a `prefers-reduced-motion` fallback. Nothing loops forever except a slow
  "breathe" on a warning state.
- **Sound**: components do not play sound; they call back and I call `sfx('name')`.

## How the UI is built (so your components fit)

- **Files**: `src/ui/components/*.tsx` (one component or a small family per file), `src/ui/screens/*.tsx`,
  styles in `src/ui/styles.css` (structure) and `src/ui/theme.css` (the look, loaded after and overriding).
  Class names are plain, hyphenated, global (`.stand-btn`, `.loc-glow`, `.gate-slot.reserved.foreseen`). No CSS
  modules, no styled-components, no Tailwind.
- **Props, not context**: components take the game `view` (a redacted `GameState`), `me: PlayerId`, and callbacks.
  They never import the engine's mutating functions. Presentational components should take plain data.
- **Existing building blocks you can assume**: `Art` (image with initials fallback), `CardFace`, `Sheet` /
  `ConfirmSheet` (bottom sheets with a scrim), `tip(text)` (spread onto an element for a tooltip), `Wordmark`,
  `Hud`, `Battlefield`, `Hand`, `Trails` / `Fireworks` (canvas effects), `Coach` (first-time hints), `Spotlight`.
- **Accessibility**: real `<button>`s, `aria-label`s on icon buttons, `role="dialog"` on sheets, keyboard reachable,
  44px targets, `aria-live` for status text.
- **Dev hooks**: under `?dev=1` I expose `window.__sob*` functions to preview effects and load states; if your
  component has states that are hard to reach in play, give it props that let me force them.

## How to hand me a component

1. **One file per component**, `PascalCase.tsx`, default to a named export, TypeScript strict (`noUnusedLocals`),
   React 19 function components, no `any`, no new dependencies unless we agree first.
2. **Its CSS in a block I can paste** into `theme.css`, using the variables above and plain global class names
   prefixed with the component's name (`.ledger-`, `.ledger-row`). Include the phone rules and the reduced-motion
   rules in the same block.
3. **A props table** with types and defaults, and a **usage snippet** with realistic data.
4. **States**: idle, hover, active, disabled, loading, empty, error, and the phone layout, each mentioned or shown.
5. **No fetching, no timers that mutate the world, no sound**; callbacks for every user action (`onSelect`,
   `onConfirm`, `onClose`).
6. **Assets**: SVG inline or as data URIs; no external images or fonts beyond the three already loaded.
7. Tell me what you were unsure about. I would rather have a question than a guess dressed as a decision.

I will review the code, place it, wire it, screenshot it on the board at 1440×900, 1280×680 and 390×844, and send
back what I see.

## What I am likely to ask you for

- A Legacy wallet and shop shell for the planned economy (`docs/economy.md`): balance pill, a catalogue grid of
  cosmetics with preview and price, an equip toggle, an "earned this match" ledger on the result screen.
- A settings sheet (sound, music, motion, text size, colour-blind player tints).
- A deck builder: card list with filters by era and archetype, a 24-card tray, validity messages.
- A match history / profile page with the stats the engine already records.
- Compendium polish: the card sheet's history section, timeline strips, a "sources" footer.
- Small things: a toast stack, a segmented control, a numeric stepper, a confirm-with-cost dialog, an empty state.

## Constraints that never move

- Dark ground, parchment text, gold frames, the chamfered plate. Nothing "modern SaaS".
- Every card is a real person or thing; no living people; no editorializing in copy. If a component shows card
  text, it shows the card's text verbatim.
- Phone-first hit areas, desktop-first density. Both must work.
- Nothing you build changes a game result; the engine is the only authority on state.

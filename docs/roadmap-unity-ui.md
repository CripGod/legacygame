# Roadmap: the UI through UI Kit Maker, on the web first, then Unity

Written 2026-09-15 by Master Control, the coordinating session that sits between UI Kit Maker
(the app that makes the UI) and Stand on Business (the game). The owner relays between the three of us.
This document is the plan and the contract. The paste-ready requests live in `docs/ui-kit-maker/`.

## The short answer

Yes: the UI can be built in UI Kit Maker, tested on the web, then brought into Unity, on one condition.
The web game must consume the *same artefact* Unity gets (sprites cut with nine-slice insets from one look),
not a hand-drawn CSS imitation of it. Today the game paints its gold chamfered frames in CSS (`theme.css`,
"beveled gold frames"). If the web keeps doing that, a web test proves nothing about Unity. If the web
switches to the kit's exported sprites, then what you see on GitHub Pages is what lands in the Unity prefab,
to the pixel, and the web becomes the fast preview for the Unity build.

Two things stay outside UI Kit Maker's job, on both platforms: the particles and flying clones (the game's
effects library, which becomes Unity ParticleSystems) and the historical art (portraits, Location banners,
which go straight to Unity as sprites). UI Kit Maker makes the chrome: frames, buttons, bars, readouts,
sheets, cards, tags.

## Who does what

| Role | Owns | Delivers |
|---|---|---|
| **Master Control** (this session) | The contract between the two, the order of work, acceptance | Requests written for the owner to relay, acceptance notes, this roadmap |
| **UI Kit Maker session** (PatternBreakAI/ui-kit-maker) | The look, the components, the boards, the exporter | Preview links, kit pages, export ZIPs (game kit, SVG pack, Unity), `settings.json` |
| **Game session** (CripGod/legacygame) | The engine, the web UI, the tests, the Pages deploy, later the C# port | A kit importer, kit-driven components, screenshots at three sizes, the Unity project |
| **Owner** | Direction, taste, the word "blessed" | Relays requests and replies; decides what ships |

If both repositories are attached to Master Control's session, it can read UI Kit Maker's exporter and write
the game's importer against the real manifest instead of a described one. Recommended.

## The contract: one look, one manifest, two renderers

1. **The look** is named `stand-on-business`. Its palette, fonts and silhouette are fixed by the game's
   design language (below) and saved in UI Kit Maker as a look, exported as `settings.json` and committed
   to the game repo at `kit/settings.json` so it can always be restored exactly.
2. **The silhouette** is the chamfered octagon: corners cut at 14 px (at 1x), frame 2 px gold on the
   navy panel fill, with a second, smaller cut of 8 px for cards and gate slots. Nine-slice insets equal
   the chamfer plus the frame, so corners stay crisp at any size.
3. **Naming**: components are named as the game names them (`stand-btn`, `lock-btn`, `sit-down`, `plate`,
   `coin`, `legend-pill`, `location`, `gate-slot`, `turn-panel`, `sheet`, `cta`, `small`, `toast`).
   The exported manifest's component keys are those names, so the importer needs no mapping table.
4. **States**: every interactive piece ships `idle`, `hover`, `pressed`, `disabled`, and where the game
   has one, `on` (the Stand button while standing, a toggle that is set), `danger` (Sit Down, locked).
5. **Tints**: the two player colours (gold A `#e9b93a`, blue B `#2f7bff`) are a tint on a neutral frame,
   never two separately drawn frames. On the web the tint is a CSS filter or a `currentColor` SVG; in
   Unity it is the Image colour. One asset, two players.
6. **Text is live** everywhere: labels in the web are DOM text, in Unity TextMeshPro. Nothing with words
   is exported as a picture. Same for icons: swappable SVG on the web, swappable sprites in Unity.
7. **The web ingests** the SVG pack (one SVG per component and state) plus the game-kit JSON manifest for
   the insets; a script in the game repo (`scripts/kit.ts`) turns those into `src/ui/kit.css`
   (`border-image` rules with the manifest's insets, custom properties per component). The kit is a build
   input, never hand-pasted CSS.
8. **Unity ingests** the Unity ZIP as exported (sprites, TMP fonts, prefab per component with uGUI
   sprite-swap states, a scene per board, the bundled importer). The game session wires prefabs to the
   C# event stream; nothing in the prefab is redrawn by hand.
9. **Fonts**: Cinzel (display), Crimson Pro (body), Kaushan Script (wordmark only). All SIL Open Font
   License, so they may ship inside a Unity build as TMP font assets.
10. **Nothing in the kit changes a game result.** The engine is the only authority on state, on both
    platforms.

## Unity target (decided here so both sides build to the same thing)

| Setting | Value | Why |
|---|---|---|
| Unity version | Unity 6 LTS (6000.x) | UI Kit Maker's export is verified 2022.3 through 6.5; start on the current LTS |
| UI system | uGUI + TextMeshPro | That is what the exporter produces; UI Toolkit would mean redrawing |
| Orientations | Landscape and portrait, both | The web game is desktop-first density, phone-first hit areas |
| Reference resolutions | Landscape 1920×1080; portrait 1080×2340 | Match the game's screenshot sizes (1440×900, 1280×680, 390×844 at 3x) |
| Canvas scaling | Scale With Screen Size, match 0.5 landscape, match 1 (height) portrait | Keeps the 44 px touch minimum honest |
| Safe area | Respect device safe area on portrait; HUD and the hand sit inside it | Phones |
| Input | Touch, mouse, keyboard; gamepad later | Same as the web today |
| Sprites | 2x (the exporter's native), nine-sliced by the bundled importer | Crisp on 1080p and phones |

## The phases

Durations are rough and assume one relay round per day. Phases 4 and 5 run alongside 1 to 3.

### Phase 0. Contracts and access (this week)

- Owner attaches both repositories to Master Control's session (or shares the exporter's manifest
  schema and one Brightside export).
- Master Control freezes the **component inventory**: every piece of chrome on screen today, its states,
  the words on it, and what the game drives at runtime (`docs/ui-kit-maker/inventory.md`).
- UI Kit Maker answers the open questions in request 01 (custom fonts as TMP, the chamfer as a silhouette,
  the manifest schema, tinting).
- Done: request 01 is answered and the look exists on a preview link.

### Phase 1. The look (about a week)

- UI Kit Maker builds the `stand-on-business` look and the **first batch**: plate, CTA button, small button,
  danger button, the Stand on Business button (with its `on` state), Lock In, a pill readout (the Legacy
  coin, the Legend pill), a toggle, a slider, a segmented control, a stepper, a toast, a sheet (bottom
  panel with a title bar and a close), a confirm dialog with a cost line.
- Composed on two boards: the match HUD at 1920×1080 and at 1080×2340, with real words.
- Done: preview link, then the three exports (SVG pack, game kit, Unity ZIP) and `settings.json`.
  Acceptance: Master Control puts the board screenshot beside the live game at 1440×900 and lists every
  difference in one note. Nothing is "close enough"; the differences are either fixed in the kit or
  accepted in writing as the new look.

### Phase 2. The web pipeline (about a week, game side)

- Game session adds `scripts/kit.ts` (manifest and SVG pack in, `src/ui/kit.css` out), a `?kit=1` flag
  that loads `kit.css` after `theme.css`, and moves the Stand button, the plates and the Lock In button
  onto kit sprites first. The CSS-drawn frames stay as the fallback until the kit version is blessed.
- Screenshots at 1440×900, 1280×680, 390×844, kit on and off, sent back through the owner.
- Done: the flag becomes the default, the old frame CSS is deleted, GitHub Pages shows the kit.
  This is the moment "test it on the web" becomes true: from here every kit change is a re-export,
  a re-run of the importer and a deploy.

### Phase 3. The screens the game does not have yet (three to four weeks, in batches)

Each batch is one request to UI Kit Maker, one board per screen at both sizes, one export, one game-side
wiring pass. Order by what the game needs most:

1. **Settings sheet**: sound, music, motion, text size, colour-blind tints. (Toggles, sliders, segmented control.)
2. **Result screen and ledger**: the verdict plate, the earned-this-match ledger, Play again, Rematch, Menu.
3. **Card face**: UI Kit Maker's card face with the darkroom, holding the portrait as a swappable sprite,
   the name, era, Force, Influence, ability text and the history as live text. Replaces `CardFace` on the
   web and becomes the card prefab in Unity. This is the piece with the most words, so it is where
   "text is live" pays most.
4. **Deck builder**: filters by era and archetype, a 24-card tray, validity messages.
5. **Shop shell and wallet**: balance pill, catalogue grid with preview and price, equip toggle.
   (The economy is designed in `docs/economy.md`, not built; the shell can exist before the wallet does.)
6. **Match history and profile**; Compendium polish (history section, timeline strips, sources footer).

### Phase 4. Unity foundation (starts now, in parallel; four to six weeks)

Independent of the kit. This is the game session's work and it is the long pole.

1. **Smoke scene first.** As soon as the first Unity ZIP exists (end of phase 1), open it in Unity 6, run
   the bundled importer, place the HUD board in a scene, drive the Legacy coin and the Stand button from a
   fake state. This tests the exporter and the target settings before any engine code exists.
2. **Engine port**, TypeScript to C#, in the README's order: `tests/engine.test.ts` first as the spec,
   then `types`, `rng`, `setup`, `query`, `resolve`, `view`. Same seed, same plans, same state.
3. **Parity harness**: a script plays N seeded matches in TypeScript and in C# and compares a hash of every
   turn's state. Until the hashes match, nothing else in Unity is trusted. This also lets balance work
   continue in TypeScript (the sim, Harborlight) while the port catches up; the TypeScript engine stays
   the source of truth until the Unity build ships.
4. **Content tables** as ScriptableObjects generated from `src/engine/content` by a script, never typed
   by hand.
5. **Harborlight** ported last; it reads only the redacted view, so it ports as a plain class.

### Phase 5. Unity UI on the event stream (three to four weeks, after phases 2 and 4.1)

- Import each blessed board's Unity export; the game session wires prefabs to `resolveTurn`'s ordered
  events, the same beats the web replays. Clash strikes, trails, fireworks and the wave become
  ParticleSystems per the README's effects table; the hand becomes the one-machine hand the README
  describes; sound keeps the `SFX_EVENTS` names as an `AudioEvent` enum.
- Every screen is compared against the web at the same reference size. Differences go back to UI Kit
  Maker as "lands differently in Unity" fixes, which is inside its remit.
- Done: a Unity build plays a full match against Harborlight with the kit UI, on desktop and on a phone.

### Phase 6. Balance and polish, continuous

The game is about 70% there and not fully balanced. None of this waits on Unity: balance lives in the
engine and content tables, which both platforms share. The sim (`npm run sim`) measures it; the parity
harness carries every change into C#. Keep a short changelog of rule changes so the port never drifts.

## The relay loop (how a week runs)

1. Master Control writes a request (a file in `docs/ui-kit-maker/`, numbered) and a game-side work order.
2. Owner pastes the request into the UI Kit Maker chat. UI Kit Maker replies with questions or a preview link.
3. Owner pastes the reply (and the link, and the ZIP once exported) to Master Control.
4. Master Control accepts, or lists differences, in one note. Owner blesses in UI Kit Maker.
5. Owner hands the export to the game session (attach the ZIP, or commit it under `kit/`). The game
   session runs the importer, wires, screenshots, deploys, and sends screenshots back.
6. Master Control compares the web and the board, closes the request, opens the next.

Rules that keep it clean:

- One request, one batch, one number. Nothing is asked twice in two places.
- Every request names the screen the way the game names it, the target, the pieces and their states, the
  words, what is driven at runtime, and what done looks like. (This is the shape UI Kit Maker asked for.)
- Every reply comes with a picture. No one describes a component in words when a screenshot exists.
- Master Control never pastes UI Kit Maker's raw exports into the game by hand, and the game session never
  redraws a kit piece in CSS. The importer is the only path.
- Exports are committed to the game repo under `kit/<request-number>/` with the `settings.json`, so any
  version of the look can be restored and any screenshot reproduced.

## Risks and how the plan handles them

- **Two engines drift** during the port. The parity harness (4.3) and the rule changelog (phase 6).
- **The exporter cannot do something the game needs** (a custom font, the chamfer, a tint). Asked up
  front in request 01 as questions, not assumptions; the smoke scene (4.1) proves the export early.
- **The web and Unity disagree** on a piece. Both consume the same manifest; a disagreement is a bug in
  one importer, found by the side-by-side screenshots the loop requires.
- **Scope creep in the kit.** The inventory (phase 0) is the shopping list; new pieces are added as new
  numbered requests, never slipped into a batch.
- **The owner's time.** Every relay is a paste. Attaching both repos to Master Control removes most of
  the copying; the owner keeps the blessing.

## Open decisions for the owner

1. Attach both repositories to Master Control's session? (Recommended.)
2. Unity 6 LTS, uGUI and TextMeshPro, as decided above? Say so once and both sides build to it.
3. Portrait on phones, or landscape only, for the first Unity build? The web supports both; two boards
   per screen doubles UI Kit Maker's composition work, not its component work.
4. Does the card face move to UI Kit Maker (phase 3.3) or stay the game's own component? Recommended:
   move it, because of the live-text rule and the darkroom.

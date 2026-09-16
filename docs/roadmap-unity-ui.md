# Roadmap: the UI through UI Kit Maker, on the web first, then Unity

Written 2026-09-15, revised 2026-09-16, by Master Control, the coordinating session that sits between
UI Kit Maker (the app that makes the UI) and Stand on Business (the game). The owner relays between the
three of us. This document is the plan and the contract. The paste-ready requests live in `docs/ui-kit-maker/`.

## Decisions already made by the owner

- **Landscape only.** No portrait boards, no portrait Unity build, for now.
- **The cards are the game's.** The card face, the card frames (the ten ranked frames and four finishes in
  `public/art/frames`, colours baked in), the card back and the Codex card stay as the game has crafted
  them. UI Kit Maker does not draw cards. This may change later; if it does, it is a new numbered request.
- **Colours are baked, not tinted.** The designer's frames carry their colours in the pixels. The kit
  follows the same rule: where a piece exists in two player colours, it is exported twice (A gold, B blue),
  never as one neutral frame tinted at runtime. What the web shows is what Unity shows.

## The short answer

Yes: the UI chrome can be built in UI Kit Maker, tested on the web, then brought into Unity, on one
condition. The web game must consume the *same artefact* Unity gets (the kit's sprites, cut with the
kit's nine-slice insets), not a hand-drawn CSS imitation of it. The card frames already work this way:
they are the designer's WebP files, laid out in percentages of the card's width so one geometry serves the
web and the Unity prefab (`docs/card-template.md`). The HUD chrome does not yet: the plates, the Stand
button, Lock In, the Location panels and the sheets are still painted in CSS as chamfered octagons
(`theme.css`, "beveled gold frames"). Phase 2 moves that chrome onto kit sprites. From then on, what you
see on GitHub Pages is what lands in the Unity prefab, and the web is the fast preview for Unity.

Three things stay outside UI Kit Maker on both platforms: the cards (above), the particles and flying
clones (the game's effects library, which becomes Unity ParticleSystems), and the historical art
(portraits, Location banners, which go straight to Unity as sprites). UI Kit Maker makes the chrome:
frames, buttons, bars, readouts, sheets, tags, menus.

## Who does what

| Role | Owns | Delivers |
|---|---|---|
| **Master Control** (this session) | The contract between the two, the order of work, acceptance | Requests written for the owner to relay, acceptance notes, this roadmap |
| **UI Kit Maker session** (PatternBreakAI/ui-kit-maker) | The look, the components, the boards, the exporter | Preview links, kit pages, export ZIPs (game kit, SVG pack, Unity), `settings.json` |
| **Game session** (CripGod/legacygame) | The engine, the web UI, the cards, the tests, the Pages deploy, later the C# port | A kit importer, kit-driven chrome, screenshots, the Unity project |
| **Owner** | Direction, taste, the word "blessed" | Relays requests and replies; decides what ships |

With both repositories attached to Master Control's session, it can read UI Kit Maker's exporter and
write the game's importer against the real manifest instead of a described one.

## The contract: one look, one manifest, two renderers

1. **The look** is named `stand-on-business`. Its palette, fonts and silhouette are fixed by the game's
   design language and saved in UI Kit Maker as a look, exported as `settings.json` and committed to the
   game repo at `kit/settings.json` so it can always be restored exactly.
2. **The silhouette** is the chamfered octagon: corners cut at 14 px (at 1x), frame 2 px gold on the
   navy panel fill. Nine-slice insets equal the chamfer plus the frame, so corners stay crisp at any size.
3. **Naming**: components are named as the game names them (`plate`, `stand-btn`, `coin`, `legend-pill`,
   `lock-btn`, `sit-down`, `turn-panel`, `location`, `sheet`, `cta`, `small`, `toast`, `settings-row`,
   `switch`). The exported manifest's keys are those names, so the importer needs no mapping table.
4. **States**: every interactive piece ships `idle`, `hover`, `pressed`, `disabled`, and where the game
   has one, `on` (the Stand button while standing, a switch that is set) and `danger` (Sit Down).
5. **Player colours are baked.** A piece that comes in a player colour is exported as `<name>-A` and
   `<name>-B`. No runtime tinting on either platform.
6. **Text is live** everywhere: labels on the web are DOM text, in Unity TextMeshPro. Nothing with words
   is exported as a picture. Icons are swappable: inline SVG on the web, sprites in Unity.
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
| Orientation | Landscape only | Owner's decision, 2026-09-16 |
| Reference resolution | 1920×1080 | Matches the game's desktop screenshot sizes (1440×900, 1280×680 scale from it) |
| Canvas scaling | Scale With Screen Size, match 0.5 | Holds the board's proportions on 16:10 and 16:9 laptops |
| Input | Mouse, keyboard, touch on landscape tablets; gamepad later | Same as the web today |
| Sprites | 2x (the exporter's native), nine-sliced by the bundled importer | Crisp on 1080p and 4K |

## The phases

Durations are rough and assume one relay round per day. Phases 4 and 5 run alongside 1 to 3.

### Phase 0. Contracts and access (this week)

- Owner attaches the UI Kit Maker repository to Master Control's session (the game's is attached already).
- The **component inventory** is frozen: every piece of chrome on screen today, its states, the words on
  it, and what the game drives at runtime (`docs/ui-kit-maker/inventory.md`).
- UI Kit Maker answers the open questions in request 01 (custom fonts as TMP, the chamfer as a silhouette,
  the manifest schema, per-player exports).
- Done: request 01 is answered and the look exists on a preview link.

### Phase 1. The look (about a week)

- UI Kit Maker builds the `stand-on-business` look and the **first batch**: plate (A and B), the Legend
  pill, the Stand on Business button (with its `on` state), the Legacy coin, Lock In, Sit Down, the turn
  panel, the timer bar, the Location panel frame, the CTA button, the small button, a toast, the sheet, a
  confirm dialog with a cost line, the settings gear and its switch rows, a slider, a segmented control,
  a stepper.
- Composed on one board: the match HUD at 1920×1080, with real words.
- Done: preview link, then the three exports (SVG pack, game kit, Unity ZIP) and `settings.json`.
  Acceptance: Master Control puts the board screenshot beside the live game at 1440×900 and lists every
  difference in one note. Nothing is "close enough"; the differences are either fixed in the kit or
  accepted in writing as the new look.

### Phase 2. The web pipeline (about a week, game side)

- Game session adds `scripts/kit.ts` (manifest and SVG pack in, `src/ui/kit.css` out), a `?kit=1` flag
  that loads `kit.css` after `theme.css`, and moves the Stand button, the plates and Lock In onto kit
  sprites first. The CSS-drawn chamfers stay as the fallback until the kit version is blessed.
- Screenshots at 1440×900 and 1280×680, kit on and off, sent back through the owner. (The phone layout
  at 390×844 stays the game's own concern; nine-sliced sprites scale down without new assets.)
- Done: the flag becomes the default, the old chamfer CSS is deleted, GitHub Pages shows the kit.
  This is the moment "test it on the web" becomes true: from here every kit change is a re-export,
  a re-run of the importer and a deploy.

### Phase 3. The screens the game does not have yet (three to four weeks, in batches)

Each batch is one request to UI Kit Maker, one board, one export, one game-side wiring pass.
Order by what the game needs most:

1. **Settings, full**: the gear menu today has two switches (music, sound effects). Grow it to motion,
   text size and colour-blind tints on the kit's switch, slider and segmented control.
2. **Result screen and ledger**: the verdict plate, the earned-this-match ledger rows, Play again,
   Rematch, Menu. The Legacy ledger exists (`src/ui/legacy.ts`); the result screen does not yet show it.
3. **Wallet and the finishes store**: the rank ladder is built (the Codex sells Bronze to Diamond for
   Legacy); the four finishes are designed for a store that is not built. Balance pill, catalogue tile
   with preview and price, equip toggle, confirm-with-cost. The card previews inside the tiles are the
   game's own card face.
4. **Deck builder**: filters by era and archetype, a 24-card tray, validity messages. Card thumbnails are
   the game's.
5. **Match history and profile**; Compendium chrome (the `cx-` plates, chapter heads, chips, the
   References modal) moved onto the kit so the Compendium and the match share one set of frames.

### Phase 4. Unity foundation (starts now, in parallel; four to six weeks)

Independent of the kit. This is the game session's work and it is the long pole.

1. **Smoke scene first.** As soon as the first Unity ZIP exists (end of phase 1), open it in Unity 6, run
   the bundled importer, place the HUD board in a scene, drive the Legacy coin and the Stand button from a
   fake state. This tests the exporter and the target settings before any engine code exists.
2. **Card prefab** from `docs/card-template.md`: the ten frame sprites on one RectTransform layout with
   percentage anchors, the portrait under the knocked-out window, TMP text in every slot. The game
   session owns this; it is the one piece of UI that is not from the kit.
3. **Engine port**, TypeScript to C#, in the README's order: `tests/engine.test.ts` first as the spec,
   then `types`, `rng`, `setup`, `query`, `resolve`, `view`. Same seed, same plans, same state.
4. **Parity harness**: a script plays N seeded matches in TypeScript and in C# and compares a hash of every
   turn's state. Until the hashes match, nothing else in Unity is trusted. This also lets balance work
   continue in TypeScript (the sim, Harborlight) while the port catches up; the TypeScript engine stays
   the source of truth until the Unity build ships.
5. **Content tables** as ScriptableObjects generated from `src/engine/content` by a script, never typed
   by hand. The Legacy ledger becomes a save file of the same shape.
6. **Harborlight** ported last; it reads only the redacted view, so it ports as a plain class.

### Phase 5. Unity UI on the event stream (three to four weeks, after phases 2 and 4.1)

- Import each blessed board's Unity export; the game session wires prefabs to `resolveTurn`'s ordered
  events, the same beats the web replays. Clash strikes, trails, fireworks and the wave become
  ParticleSystems per the README's effects table; the hand becomes the one-machine hand the README
  describes; sound keeps the `SFX_EVENTS` names as an `AudioEvent` enum.
- Every screen is compared against the web at 1920×1080. Differences go back to UI Kit Maker as
  "lands differently in Unity" fixes, which is inside its remit.
- Done: a Unity build plays a full match against Harborlight with the kit chrome and the game's cards.

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

- **Two engines drift** during the port. The parity harness (4.4) and the rule changelog (phase 6).
- **The exporter cannot do something the game needs** (a custom font, the chamfer, two-colour exports).
  Asked up front in request 01 as questions, not assumptions; the smoke scene (4.1) proves the export early.
- **The web and Unity disagree** on a piece. Both consume the same manifest; a disagreement is a bug in
  one importer, found by the side-by-side screenshots the loop requires.
- **The cards and the chrome drift apart** in look, since two hands draw them. The look's palette and
  the chamfer geometry are taken from the card frames, not the other way round, and the acceptance
  screenshot always shows a card on the board beside the chrome.
- **Scope creep in the kit.** The inventory (phase 0) is the shopping list; new pieces are added as new
  numbered requests, never slipped into a batch.
- **The owner's time.** Every relay is a paste. Attaching the UI Kit Maker repo to Master Control removes
  most of the copying; the owner keeps the blessing.

## Open decisions for the owner

1. Attach the UI Kit Maker repository to Master Control's session (see the access walkthrough in chat).
2. Unity 6 LTS, uGUI and TextMeshPro, landscape 1920×1080, as decided above? Say so once and both sides
   build to it.

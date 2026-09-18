# Roadmap: the UI through UI Kit Maker, on the web first, then Unity

Written 2026-09-15, revised 2026-09-18, by Master Control, the coordinating session that sits between
UI Kit Maker (the app that makes the UI) and Stand on Business (the game). The owner relays between the
three of us. This document is the plan and the contract. The paste-ready requests live in `docs/ui-kit-maker/`.

## Decisions already made by the owner

- **It is a redesign.** Everything except the cards is designed new in UI Kit Maker: look, fonts,
  silhouettes, palette of the chrome, and the layout of every screen. The current web chrome is not a
  target. The request tells UI Kit Maker *what* to build and what each piece must do, not how it looks.
- **A board per screen.** UI Kit Maker composes every screen the game has or needs as a board on the
  1920×1080 stage, so the owner tweaks in the app instead of building from scratch. Eleven boards
  (`docs/ui-kit-maker/request-01-the-redesign.md`).
- **Landscape only.** No portrait boards, no portrait Unity build, for now.
- **The cards are the game's.** The card face, the ten ranked frames and four finishes in
  `public/art/frames` (colours baked in), the card back and the Codex card stay as crafted. They are the
  anchor the new chrome sits beside. Their printed text faces (Cinzel, Crimson Pro) can change to match
  the new chrome if the owner wants, since that text is live.
- **Colours are baked, not tinted.** Where a piece exists in two player colours, it is exported twice
  (A, B), never as one neutral frame tinted at runtime. What the web shows is what Unity shows.
- **Order of delivery.** Boards first, then the assets into the current web build for testing, then the
  Unity port. Three months are set aside for the Unity build (see "The three months" below).

## The short answer

Yes: the UI can be designed on boards in UI Kit Maker, pushed into the current web build, tested there,
then brought into Unity, on one condition. The web game must consume the *same artefact* Unity gets
(the kit's sprites, cut with the kit's nine-slice insets, laid out from the boards' positions), not a
CSS imitation of it. The card frames already work this way: they are the designer's WebP files, laid
out in percentages so one geometry serves the web and the Unity prefab (`docs/card-template.md`). The
chrome does not yet: it is painted in CSS. Phase 2 replaces that CSS with the kit's sprites and the
boards' layout. From then on, what you see on GitHub Pages is what lands in the Unity scene, and the
web is the fast preview for Unity.

The web step is cheap because the boards ride in `settings.json` with every item's position, scale and
stretch on the 1920×1080 stage. A script turns that into the web layout (percent positions in a 16:9
stage) and the manifest into `border-image` CSS. The game session does not redraw anything by eye.

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

UI Kit Maker's repository is public, so Master Control reads its exporter directly (a read-only clone;
`docs/ui-kit-maker/what-the-exporter-does.md` records what was verified) and writes the game's importer
against the real manifest. Nothing is pushed to that repository from here; requests go through the owner.

## The contract: one look, one manifest, two renderers

1. **The look** is named `stand-on-business`. Its palette, fonts and silhouettes are the owner's and UI
   Kit Maker's to design, anchored to the cards; once blessed it is saved in UI Kit Maker as a look,
   exported as `settings.json` (with the boards) and committed to the game repo at `kit/settings.json`
   so it can always be restored exactly.
2. **The boards are the layout.** Each screen is one board on the 1920×1080 stage; the game reads the
   items' positions, scale and stretch from `settings.json` for the web layout, and the Unity scene is
   generated from the same board. A layout change is a board change, never a hand edit on either side.
3. **Naming**: components are named as the game names them (`plate`, `stand-btn`, `coin`, `legend-pill`,
   `lock-btn`, `sit-down`, `turn-panel`, `location`, `sheet`, `cta`, `small`, `toast`, `settings-row`,
   `switch`). The exported manifest's keys are those names, so the importer needs no mapping table.
4. **States**: every interactive piece ships `idle`, `hover`, `pressed`, `disabled`, and where the game
   has one, `on` (the Stand button while standing, a switch that is set) and `danger` (Sit Down).
5. **Player colours are baked.** A piece that comes in a player colour is exported as `<name>-A` and
   `<name>-B`. No runtime tinting on either platform.
6. **Text is live** everywhere: labels on the web are DOM text, in Unity TextMeshPro. Nothing with words
   is exported as a picture. Icons are swappable: inline SVG on the web, sprites in Unity.
7. **The web ingests** the engine kit: the atomic 2x PNGs under `assets/` and `kit-manifest.json`, whose
   rows carry each part's nine-slice insets and shell box (`docs/ui-kit-maker/what-the-exporter-does.md`).
   A script in the game repo (`scripts/kit.ts`) turns those into `src/ui/kit.css` (`border-image` rules
   from the manifest's insets, custom properties per component). The same files feed Unity, so the web
   and the prefab are cut from identical pixels. The kit is a build input, never hand-pasted CSS.
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

- Master Control reads UI Kit Maker's exporter (done 2026-09-16) and keeps the facts file current.
- The **component inventory** is frozen: every piece of chrome on screen today, its states, the words on
  it, and what the game drives at runtime (`docs/ui-kit-maker/inventory.md`).
- UI Kit Maker answers the open questions in request 01 (custom fonts as TMP, the chamfer as a silhouette,
  the manifest schema, per-player exports).
- Done: request 01 is answered and the look exists on a preview link.

### Phase 1. The redesign on boards (weeks 1 to 4)

- UI Kit Maker builds the look and all eleven boards from request 01 in one pass: landing, match,
  sheets, result, compendium, rules, settings, tutorial, deck builder, store, history. Every piece with
  its four states and the game's own states; holes where the cards, art and effects go.
- The owner tweaks in the app. Master Control reviews each board against the request (every piece
  present, every word right, every hook live) and against the cards (a card on the match board in the
  screenshot). Differences are fixed or accepted in writing.
- Done: the owner blesses the boards; UI Kit Maker exports the engine kit, the Unity ZIP and
  `settings.json`. **Bless every board before the first Unity import**: the importer never rewrites a
  generated scene, so a board changed later arrives as a new scene, not an edit.

### Phase 2. Into the web build (weeks 3 to 7, game side, overlapping phase 1)

- Week 3, before the boards are final: the game session writes `scripts/kit.ts` against a draft export.
  It reads `kit-manifest.json` (insets, shell boxes) and the boards in `settings.json` (positions) and
  emits `src/ui/kit.css` plus a layout table per screen. A `?kit=1` flag loads the kit after `theme.css`.
- Weeks 4 to 6: screen by screen, the existing React components take the kit's classes and the boards'
  positions; the hand, the tiles, the cards, the sheets' behaviour and every animation stay as they are.
  The new screens (settings in full, the result ledger, deck builder, store, history) are built as new
  React components on the kit; the engine and the ledger already carry their data.
- Week 7: screenshots at 1440×900 and 1280×680 of every screen beside its board; the owner tests on
  GitHub Pages; the flag becomes the default and the old chrome CSS is deleted.
- Done: the web build runs on the kit. Every later kit change is a re-export, a re-run of the importer
  and a deploy.

### Phase 3. Unity UI on the event stream (weeks 6 to 12)

See "The three months" below for the week plan. In short: the smoke scene first, the card prefab, the
match screen on the C# event stream, then landing, result and the sheets, then the rest as time allows.

### Phase 4. Unity foundation (weeks 1 to 6, in parallel with everything above)

Independent of the kit. This is the game session's work and it is the long pole. One rule makes it
tractable: **the engine is a plain C# class library with no Unity dependency**, built and tested with
the .NET SDK in the game session's container, so the port and its tests run without the Unity Editor.
Only the UI layer needs the editor, and the owner runs that loop.

1. **Smoke scene first.** As soon as a draft Unity ZIP exists (week 3), the owner opens it in Unity 6,
   runs the bundled importer, and the game session drives the Legacy coin and the Stand button from a
   fake state. This tests the exporter, the target settings and the owner's editor loop before any
   engine code lands in Unity.
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

### Phase 5. Balance and polish, continuous

The game is about 70% there and not fully balanced. None of this waits on Unity: balance lives in the
engine and content tables, which both platforms share. The sim (`npm run sim`) measures it; the parity
harness carries every change into C#. Keep a short changelog of rule changes so the port never drifts.

## The three months

The owner has set three months for the Unity build. Thirteen weeks, three lanes, one cut line.

| Week | UI lane (UI Kit Maker, owner, web) | Engine lane (game session, plain C#) | Unity lane (game session writes, owner runs the editor) |
|---|---|---|---|
| 1 | Request 01 answered; the look and the match board drafted | Port `types`, `rng`, `setup`; port the first tests | Owner installs Unity 6 LTS; empty project with the target settings |
| 2 | All eleven boards drafted on a preview | Port `query`, `resolve` | |
| 3 | Owner tweaks; draft export for the importer | Port `view`, the rest of the tests; parity harness starts | Smoke scene from the draft ZIP |
| 4 | Boards blessed; final export | Parity green on 1,000 seeded matches | Card prefab from `docs/card-template.md` |
| 5 | Web: match and landing on the kit | Content tables generated as ScriptableObjects | Import the blessed kit; scenes generated |
| 6 | Web: sheets, result, compendium, settings | Harborlight ported; parity for AI plans | Match screen: board, tiles, HUD wired to the event stream |
| 7 | Web: deck builder, store, history; the flag becomes default | Save file (the ledger) | Match screen: the hand machine, plans and Lock In |
| 8 | Web bless; kit fixes from Unity feed back | | Replay: clash, showdown, arrival beats as world-space clones |
| 9 | | | Effects: trails, sprays, fireworks, wave as ParticleSystems |
| 10 | | | Audio: the `SFX_EVENTS` enum, clips, place sounds, music |
| 11 | | Balance pass in TypeScript carried across by parity | Landing, result, the sheets, settings, tutorial |
| 12 | | | Deck builder, store, history if on schedule; else cut |
| 13 | | | Stabilise: a full match on desktop with no console errors; a build |

**The cut line at week 13**: a Unity build that plays a full match against Harborlight with the new
chrome, the game's cards, the replay and effects, sound, landing, result and the sheets, landscape,
desktop. Deck builder, store, history, tablet touch, PvP and the balance to "done" are after the three
months unless the lanes run ahead. That is achievable in thirteen weeks on three conditions:

1. The boards are blessed by the end of week 4. Every week of slip there is a week off the Unity end.
2. The engine port starts in week 1 as plain C# with the tests as the spec, and the parity harness is
   green before any UI is wired. The port is mechanical (about 3,200 lines of TypeScript); the harness
   is what makes it safe to keep balancing in TypeScript meanwhile.
3. The owner runs the Unity Editor loop from week 3: open the project, press play, send screenshots
   and the console. The game session cannot run the editor in its container, so every Unity check is a
   relay, and the match screen (the hand, the flying clones, the staged replay) is the part that needs
   the most of them. Budget an hour a day for it in weeks 6 to 13.

What would break the schedule: a second design pass after the first Unity import (scenes do not
regenerate), a mid-port rules change without the harness, or the editor loop running at one relay a
day instead of several.

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
- **The exporter cannot do something the game needs.** Read from its code first (the facts file), then
  asked in request 01 as specific questions; the smoke scene (4.1) proves the export early.
- **The web and Unity disagree** on a piece. Both consume the same manifest; a disagreement is a bug in
  one importer, found by the side-by-side screenshots the loop requires.
- **The cards and the chrome drift apart** in look, since two hands draw them. The cards are the
  anchor; the acceptance screenshot of every board that holds a card shows one, and the card text
  faces can change to match the chrome if the owner prefers.
- **Scope creep in the kit.** The inventory (phase 0) is the shopping list; new pieces are added as new
  numbered requests, never slipped into a batch.
- **The owner's time.** Every relay is a paste. Attaching the UI Kit Maker repo to Master Control removes
  most of the copying; the owner keeps the blessing.

## Open decisions for the owner

1. Unity 6 LTS, uGUI and TextMeshPro, landscape 1920×1080, as decided above? Say so once and both sides
   build to it.
2. Whether the cards' printed text faces change to match the new chrome, once the chrome's faces are
   chosen. The game's side of that is one line per face.
3. The week-13 cut line above: agree it now so the lanes are planned to it.

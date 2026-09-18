# What UI Kit Maker's exporter does (read from its code, 2026-09-16)

Verified against `PatternBreakAI/ui-kit-maker` at `main` on 2026-09-16 and corrected from UI Kit Maker's
reply 01 and its `claude/app-tweaks` branch on 2026-09-18 (`src/generator/engineExport.ts`, `exportUtils.ts`,
`model.ts`, `silhouettes.ts`, `store.ts`). The game's importer is written against this, not against the
marketing copy. Re-check when the exporter changes.

## The one ZIP (the engine kit and the Unity importer travel together)

- One download. `UIKitMaker/<kit>/` holds `assets/` (atomic, transparent PNGs at 2x, one per component,
  part and state), `kit-manifest.json`, `fonts/` (the TTFs, with licences) and the board stamps;
  `UIKitMaker/Editor/` and `UIKitMaker/Runtime/` hold the importer and the runtime scripts. The web
  importer reads `assets/` and the manifest and ignores the rest. The old `atlas/catalog.png` has left
  the ZIP (it is a paged download on the kit page now); nothing to slice either way.
- Prefabs land in chapter folders under plain names (`Buttons/ButtonPrimary`,
  `Buttons/ButtonPrimary_BOOST`, `HUD and Data/DataRow`); the Playground scene captions every piece with
  its folder and prefab name.
- `kit-manifest.json` carries `kit` (name), `idle` (the shine dials), `typography` (the face, weight, the
  shipped TTF and the label style recipe), **`boards`** (below) and one row per asset:

  | Field | Meaning |
  |---|---|
  | `file` | path under `assets/` |
  | `component` | the kit component id (`primary`, `nameplate`, `currency`, …) |
  | `part` | which layer: the shell, a fill, a glow, a knob, a cap … |
  | `nativeW`, `nativeH` | file pixels at 2x |
  | `nineSlice` | `{left, right, top, bottom}` in file pixels, or `null` for a part that never stretches |
  | `pivot` | `{x, y}` 0–1 |
  | `tintable` | whether Unity may tint this part (we bake colours, so we ignore it) |
  | `shell` | the silhouette's box inside the sprite; the glow pads outside it. Size pieces shell-to-shell |
  | `track`, `body` | bar family only: where the well and the mercury sit |
  | `sha256` | content hash, for restyle-in-place |

- **`boards`**: one entry per board, each item with `component`, `cx`, `cy`, `w`, `h` in 1920×1080 stage
  pixels, `rot`, the per-copy `label` and `value`, and a zone anchor `ax`, `ay` (Unity convention). This
  is what the Unity scene is built from. **The web layout reads this, not `settings.json`.**
  `settings.json` carries the raw board (each item's top-left `x`, `y`, `scale`, `rot`, `stretch`,
  `stretchY`, per-copy `label`, `v`, `ov`, `opacity`) and is for restoring the kit in the app.
- **Web rule that follows:** `border-image-source` is the shell PNG, `border-image-slice` is `nineSlice`
  (in 2x file pixels, so the CSS `border-image-width` is half), the element's box is the `shell` box, and
  its place on screen is the board item's `cx`, `cy`, `w`, `h` as percentages of 1920×1080. The glow
  part is a separate image on a wrapper, exactly as `theme.css` already puts glows on `.loc-glow`.

## The Unity export

- `Editor/PatternBreakKitImporter.cs` (the Sprite Editor typing, nine-slice from the manifest),
  `Runtime/*.cs` (removable components: `PatternBreakStateFx` for hover, pressed and disabled swaps,
  `PatternBreakKitBarFill` for bars, `PatternBreakKitTimer` and `PatternBreakCountdownLabel`,
  `PatternBreakKitStepper`, `PatternBreakSwitchGlide`, `PatternBreakPopNumber`, `PatternBreakSafeArea`,
  `PatternBreakIdleShine`), a prefab per component with the uGUI Button sprite swap wired, a scene per
  board, `Documentation/QuickStart.md`.
- Labels are live TextMeshPro; each family carries the app's rendered font size and label seat.
- A board copy whose proportions diverge from the family sprite ships as a posed render with its own
  state skins. Per-copy labels typed on the board arrive in the scene.
- Nine-sliced families skip the edge shine in Unity (the app still plays it). We turn idle shine off anyway.
- Fonts: fetched from Google Fonts as static-weight TTFs. TextMeshPro cannot select a variable font's
  weights, so the exporter ships a static cut per designed weight from a baked table.

## The SVG pack

One SVG per component and state, layered, text live, SVG 1.1 filters; each carries `width`, `height`
and a `viewBox` at 1x.

## What the app offers today

- **States**: `default`, `hover`, `pressed`, `disabled`. There is no fifth "set" state on a button.
  Toggles, tabs, checkboxes and radios carry their own set state.
- **Shapes**: procedural silhouettes include `chamfer` ("hard-edged chamfer, no rounding") and
  `deepchamfer`; users can import flat-vector silhouettes; imported silhouettes travel with designs.
- **Boards**: two stages, landscape 1920×1080 and phone 390×844. Copies on a board can carry their own
  label; saved components (from a board) become editable kit clones and can be promoted to live pieces.
- **Fonts** (`GAME_FONTS`): a curated Google Fonts list. **Cinzel and Crimson Pro are in it** (Crimson
  Pro added on the `claude/app-tweaks` branch, 200–900 variable with true italics). Kaushan Script is
  not and is not needed (the wordmark is the game's own). Adding a Google family is about an hour of
  engine work (one entry plus two bakes); a family not on Google Fonts is a bigger job.
- **Saved components**: a board copy can be restyled and saved as its own component; it keeps its base's
  silhouette, carries its own design and exports as its own prefab with all four states. This is the
  road for `stand-btn-on`, `plate-A` / `plate-B`, and `location-hidden`.
- **No horizontal flip** for a board copy (it would flip text and icon seats). Mirror a composition by
  placing its parts the other way round.
- **`dialog`** is one fixed-proportion piece (title, body, two action capsules): right for `confirm`,
  wrong for anything that grows. **`panel` + `header`** (+ `iconbtn` for a close) is the road for
  Location panels and sheets.
- **Components the game maps to**: `primary`, `secondary`, `small`, `ghost`, `iconbtn`, `chip`, `badge`,
  `segment`, `header`, `toggle`, `slider`, `progress`, `panel`, `dialog`, `toast`, `tooltip`, `setrow`,
  `avatarframe`, `nameplate`, `currency`, `stepper`, `endturn`, `movecounter`, `scorebug`, `chatbubble`,
  `emotewheel`, `bignum`, `pricebtn`, `listmenu`, `choicelist`, `cardface`, `cardback`.

## Working agreements over there (from their `CLAUDE.md`)

Preview then bless: every change is a branch and a PR with a Vercel preview; nothing merges without
the owner's word. New components and silhouettes ship staged, admin-only, until released. Never the
four-point sparkle icon. Maximum editability: no icon, image or word burned into a component's art.

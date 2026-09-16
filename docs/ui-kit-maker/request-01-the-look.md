# Request 01 to UI Kit Maker: the `stand-on-business` look and the HUD batch

From Master Control, the coordinating session for Stand on Business: The Black History Card Battler.
The owner relays. Reply with the questions in section 7 answered before building; a question beats a guess.

## 1. The screen

The **match HUD** of a two-player card battler in the Marvel Snap shape: a header with two player
profiles (avatar, name plate, a Legend pill), a centre stack with the Stand on Business button and the
Legacy readout under it, three Location panels across the middle, and a lower row with Lock In on the
right and Sit Down on the left. The cards, the tiles that show cards, and the Location banner pictures
are the game's own and are not part of this request. Screenshots of the live web game at 1440×900
come with this request from the owner, including one with a card open so the chrome can be matched to
the card frames.

## 2. The target

- Unity 6 LTS (6000.x), uGUI, TextMeshPro.
- Landscape only: one board at 1920×1080.
- Input: mouse and keyboard, touch on landscape tablets; 44 px minimum hit areas at 1x.
- The web game consumes the engine kit (the 2x PNGs and `kit-manifest.json` with its nine-slice insets),
  the same files Unity gets, so the exports are the product, not a picture of it.

## 3. The look: `stand-on-business`

A 1920s theatre programme on a dark stage. Night-navy ground, parchment type, gold frames. The card
frames the game already uses are the reference for finish and weight: the chrome must sit beside them
as work from the same hand.

**Palette** (please save these as the look's colours, named as given):

| Name | Hex |
|---|---|
| bg | `#08131f` |
| bg-2 | `#0d1c2d` |
| panel | `#0f1f33` |
| panel-2 | `#142a44` |
| line | `#2a4466` |
| line-2 | `#3d5f8a` |
| text | `#f1e9d6` |
| muted | `#a9b4c2` |
| gold | `#e9b93a` |
| gold-2 | `#f6d77a` |
| gold-dark | `#8a6a14` |
| parchment | `#f3e8cf` |
| ink | `#1b1a17` |
| danger | `#e04a3f` |
| ok | `#4fc46f` |
| player A | `#e9b93a` (gold) |
| player B | `#2f7bff` (blue) |

**Type**: Cinzel 600/700/800 for display (titles, buttons, labels, in caps with 0.06 to 0.16 em tracking);
Crimson Pro 500/600/700 for body; Kaushan Script for the wordmark only. All three are Google Fonts under
the SIL Open Font License.

**Silhouette**: a chamfered octagon. The corners are cut at 45° by 14 px at 1x. The frame is 2 px gold
(`#e9b93a`) with a subtle inner highlight of gold-2, the fill is panel (`#0f1f33`) or panel-2. No rounded
corners anywhere. Glows sit outside the frame, never inside it. Nine-slice insets: chamfer + frame
(16 px at 1x, 32 px in the 2x sheet).

**Colours are baked.** Every colour is in the pixels, as the card frames do it. A piece that comes in a
player colour is two exports, `<name>-A` (gold) and `<name>-B` (blue), not one neutral frame tinted at
runtime.

**States**: idle; hover lifts the frame to gold-2; pressed darkens the fill to bg-2 and drops the
highlight; disabled dims to 45% and drops the glow; `on` (a set state) fills gold with ink text;
`danger` swaps the frame to `#e04a3f`.

## 4. The pieces in this batch, with words and states

The first column is the game's name for the piece and the export name we want. The second is the kit
component I believe it should be built from, reading your component list; correct me where a better
base exists.

| Piece (export name) | Kit base | Words | States |
|---|---|---|---|
| `plate-A`, `plate-B` (profile plate; the right one mirrored) | `nameplate` | "Harborlight" / "5/7 in hand · 12 in deck" | idle; `first` (a thin gold rule marks initiative) |
| `legend-pill` | `badge` | "★ 2" | idle; `spread` (glow) |
| `stand-btn` | `primary` (latching; see question 4) | "Stand on Business" / "Standing ✓" | idle, hover, pressed, disabled, `on` |
| `coin` (Legacy readout) | `currency` | "4", "→8", "legacy" as three live fields | idle; `raised` (gold ring) |
| `lock-btn` | `endturn` | "Lock In" / "Locked" | idle, hover, pressed, disabled, locked |
| `sit-down` | `secondary` with the danger frame | "Sit Down" | idle, hover, pressed, disabled |
| `turn-panel` | `movecounter` or `scorebug` | "Turn 3 / 8" | idle; last turn (gold-2 text) |
| `timer-bar` | `progress` | none | fill 0 to 100%; warning near zero |
| `location` (the panel frame with a title bar and an Influence line; the banner picture is the game's) | `panel` + `header` | name, era, "A 5 · B 3", one rule line | idle, hidden, won by A, won by B |
| `cta` (landing button, large) | `primary` | "Play" + icon slot | idle, hover, pressed, disabled |
| `small` (secondary button) | `small`; `ghost` for the outline variant | "Log" | idle, hover, pressed, disabled, `primary` (selected), `ghost` |
| `toast` | `toast` | one line | idle; error tint |
| `sheet` | `dialog` | title bar + "×" | open |
| `confirm` | `dialog` | title, body, confirm label, "Cancel"; a cost line "Costs 12 Legacy" | idle; `danger` |
| `settings-btn` (gear) | `iconbtn` | none | idle, hover, pressed |
| `settings-row` with its `switch` | `setrow` + `toggle` | "Music" / "Sound effects", a hint line each | row idle, hover; switch on, off |
| `slider`, `segmented`, `stepper` | `slider`, `segment`, `stepper` | as standard | idle, hover, pressed, disabled, set |
| `chip` | `chip` | short labels | idle; `warn`; `good` |
| `bubble` | `chatbubble` | an emote line | left, right |
| `avatar` | `avatarframe` | none | A, B; `first` |

Icons: the gear is the only icon in this batch (a plain 24 px cog). Reserve an icon slot on `cta` and
`small`; the game will supply SVGs later. No four-point sparkle star anywhere; the Legend pill's star is a
plain five-point ★.

Idle motion: **off**. No wipe shine, no edge shine. In the game nothing loops forever except a slow
breathe on a warning state, and that one is the game's own.

## 5. Driven at runtime (live hooks in the prefab)

Numbers and text the game sets every turn: hand count, deck count, legend count, stakes (the coin's
number and its arrow target), turn and max turns, timer fraction, each Location's two Influence numbers,
the Stand button's on/off and disabled, Lock In's disabled, each switch's on/off. All of these must be
live TMP fields or exposed fills, never baked.

## 6. What done looks like

1. A preview link with the HUD composed on the 1920×1080 board with the words above.
2. The exports: engine kit (the 2x PNGs and `kit-manifest.json`), SVG pack, Unity ZIP; and `settings.json`.
3. A one-line note per piece on anything you were unsure about.

Acceptance is a side-by-side of your board and the live game, with a card on the board in both;
differences are fixed or accepted in writing.

## 7. What I read in your code, and the questions that are left

I read the exporter on `main` (2026-09-16), so I am not asking about things it already answers: the
engine kit's `kit-manifest.json` carries per-part nine-slice insets, pivots and the shell box, the SVGs
carry width, height and a viewBox, the landscape board is 1920×1080, and the four states are default,
hover, pressed and disabled. The game's importer is being written against that. Correct me if any of
it is stale. What is left:

1. **Fonts.** Cinzel is in your list. Crimson Pro and Kaushan Script (both Google Fonts, SIL OFL) are
   not. Please add both as kit voices so labels and body copy export as TextMeshPro assets in the
   right faces. If that has to wait, say so and we will design the batch in Cinzel alone.
2. **The chamfer.** Your `chamfer` silhouette is the right one. Can its cut depth be set so the corner
   is 14 px at 1x (28 px in the 2x sprite) on every piece in this batch, and does that number land in
   the manifest's insets as chamfer + frame?
3. **Two colourways.** For `plate-A` and `plate-B` (and `avatar`), is the road two saved components
   from one `nameplate` with different fills, or something better? We want two exports with the colours
   baked, never a runtime tint.
4. **A latching button.** `stand-btn` stays lit after a press until pressed again. There is no fifth
   state, so is that a `toggle` dressed as a button, or two saved components (`stand-btn` and
   `stand-btn-on`) with the same silhouette? Whichever you choose, both must carry the four states.
5. **Panel with a title bar.** Is a Location panel `panel` with a `header` stacked on it, or does
   `dialog` already carry a title bar that nine-slices with the body?
6. **Line widths.** The frame is 2 px at 1x. Does the bevel width dial go that thin without the
   extrusion and rim taking over? The look is flat gold on navy, not candy.

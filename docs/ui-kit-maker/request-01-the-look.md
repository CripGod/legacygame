# Request 01 to UI Kit Maker: the `stand-on-business` look and the HUD batch

From Master Control, the coordinating session for Stand on Business: The Black History Card Battler.
The owner relays. Reply with questions first if anything below is unclear or not possible; a question
beats a guess.

## 1. The screen

The **match HUD** of a two-player card battler in the Marvel Snap shape: a header with two player
profiles (avatar, name plate, a Legend pill), a centre stack with the Stand on Business button and the
Legacy readout under it, three Location panels across the middle, Character slots at each Location's
Gates, and a lower row with Lock In on the right and Sit Down on the left. Screenshots of the live web
game at 1440×900 and 390×844 come with this request from the owner.

## 2. The target

- Unity 6 LTS (6000.x), uGUI, TextMeshPro.
- Two boards per screen: landscape 1920×1080 and portrait 1080×2340. Portrait respects the device safe area.
- Input: touch and mouse; keyboard reachable; 44 px minimum hit areas at 1x.
- The web game consumes the same exports (SVG per component and state, plus the game-kit JSON manifest for
  nine-slice insets), so the exports are the product, not a picture of it.

## 3. The look: `stand-on-business`

A 1920s theatre programme on a dark stage. Night-navy ground, parchment type, gold frames.

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

**Silhouette**: a chamfered octagon. The corners are cut at 45° by 14 px at 1x (8 px on the small
variant used for cards and slots). The frame is 2 px gold (`#e9b93a`) with a subtle inner highlight of
gold-2, the fill is panel (`#0f1f33`) or panel-2. No rounded corners anywhere. Glows sit outside the
frame, never inside it. Nine-slice insets: chamfer + frame (16 px at 1x, 32 px in the 2x sheet).

**States**: idle; hover lifts the frame to gold-2; pressed darkens the fill to bg-2 and drops the
highlight; disabled dims to 45% and drops the glow; `on` (a set state) fills gold with ink text;
`danger` swaps the frame to `#e04a3f`. Player tint: one neutral frame tinted gold for A or blue for B,
never two drawn frames.

## 4. The pieces in this batch, with words and states

| Piece (export name) | Words | States |
|---|---|---|
| `plate` (profile plate) | "Harborlight" / "5/7 in hand · 12 in deck" | idle; tint A, tint B; `first` (a thin gold rule marks initiative) |
| `legend-pill` | "★ 2" | idle; `spread` (glow) |
| `stand-btn` | "Stand on Business" / "Standing ✓" | idle, hover, pressed, disabled, `on` |
| `coin` (Legacy readout) | "4", "→8", "legacy" as three live fields | idle; `raised` (gold ring) |
| `lock-btn` | "Lock In" / "Locked" | idle, hover, pressed, disabled, locked |
| `sit-down` (danger button) | "Sit Down" | idle, hover, pressed, disabled |
| `turn-panel` | "Turn 3 / 8" | idle; last turn (gold-2 text) |
| `timer-bar` | none | fill 0 to 100%; warning near zero |
| `location` (panel frame only; the banner picture is the game's) | name, era, "A 5 · B 3" | idle, hidden, won by A, won by B |
| `gate-slot` (small chamfer) | Force "3" | empty, filled, reserved; tint A, tint B |
| `event-slot` | Event name | empty, filled (purple line `#7a5cff`) |
| `force-bar` | "Force 3" | fill; red flash; green flash |
| `cta` (landing button, large) | "Play" + icon slot | idle, hover, pressed, disabled |
| `small` (secondary button) | "Log" | idle, hover, pressed, disabled, `primary`, `ghost` |
| `toast` | one line | idle; error tint |
| `sheet` | title bar + "×" | open; phone full-width, desktop centred |
| `confirm` (dialog) | title, body, confirm label, "Cancel"; a cost line "Costs 12 Legacy" | idle; `danger` |
| `toggle`, `slider`, `segmented`, `stepper` | as standard | idle, hover, pressed, disabled, set |

Icons: none custom in this batch. Reserve an icon slot on `cta` and `small`; the game will supply SVGs
later. Please do not use the four-point sparkle star anywhere (the Legend pill's star is a plain
five-point ★).

## 5. Driven at runtime (live hooks in the prefab)

Numbers and text the game sets every turn: hand count, deck count, legend count, stakes (the coin's
number and its arrow target), turn and max turns, timer fraction, each Location's two Influence numbers,
each slot's Force, the Threat's Force and bar fraction, the Stand button's on/off and disabled, Lock In's
disabled. All of these must be live TMP fields or exposed fills, never baked.

## 6. What done looks like

1. A preview link with the HUD composed on both boards with the words above.
2. The three exports: SVG pack, game kit (sprite sheet + JSON manifest), Unity ZIP; and `settings.json`.
3. A one-line note per piece on anything you were unsure about.

Acceptance is a side-by-side of your board and the live game; differences are fixed or accepted in writing.

## 7. Questions before you build

1. Can the look use Cinzel, Crimson Pro and Kaushan Script, and do they export as TMP font assets?
   If custom fonts need an upload, say what format.
2. Is the chamfered octagon a silhouette the engine has, or does it need importing as SVG? If import,
   confirm the nine-slice insets survive to the manifest and to the Unity Sprite Editor.
3. Please share one exported game-kit JSON manifest (Brightside is fine) so the game's importer is
   written against the real schema: component keys, per-state rects, insets, sheet scale.
4. Can a component export one neutral frame with a tint applied at runtime (Image colour in Unity,
   `currentColor` or a filter in SVG), rather than one drawn frame per player colour?
5. Do the SVG exports carry width and height attributes and a viewBox at 1x, so `border-image` on
   the web can use them directly?
6. Is a "set" state (`on`) supported as a fifth state on a button, or is that composed as a toggle?

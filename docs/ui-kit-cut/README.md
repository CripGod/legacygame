# Stand on Business, web prototype cut

Six buttons and the plan timer bar from the Stand on Business kit, cut from the kit's engine export for the Black History Card Battler web prototype. Not a Unity package.

## What is in here

- `pieces/<id>/default.png, hover.png, pressed.png, disabled.png`: transparent PNGs at 2x, no words baked. All four states of one piece share one crop, so a state swap never moves the art.
- `pieces/<id>/glow.png`: the piece's white blurred silhouette, optional, for the hover and pressed glow (tint and opacity in the manifest).
- `bar/timer-track.png` and `bar/timer-fill.png`: the plan timer as two atomics.
- `manifest.json`: per piece and state, sprite size, shell rect, nine-slice margins, pivot, and the label face (family, weight, size, letter spacing, fill per state, shadow per state, seat). Everything under `at1x` is in 1x design px; `nineSlicePx` and `spritePx` are 2x sprite px.
- `fonts/Cinzel-Bold.ttf`: the label face, weight 700 static cut, with its notice.
- `settings.json`: the kit document (look, saved variants, the match board), restorable in UI Kit Maker. Not needed by the game.

## Pieces

| id | word | from |
| --- | --- | --- |
| primary | Stand on Business | the kit's primary button |
| stand-btn-on | Standing ✓ | the lit saved variant |
| secondary | Lock In | the kit's secondary button (parchment, navy word) |
| lock-locked | Locked | the dim saved variant |
| small | Sit Down | the kit's small button (red) |
| sit-down | Sit Down | the saved variant; same design and word as small, same files |

## Drawing a button

1. Draw the state sprite nine-sliced at 1x (sprite px divided by 2). The default width is `at1x.size.w`; stretch wider through the centre cell, never taller (the height is the design).
2. Put the word in Cinzel 700, upper case, `label.fontSize` px at 1x, letter spacing 0.03em, fill `label.fill` for the state, anchored middle and central at the shell centre plus `label.seat` (dx, dy). The pressed sprite's shell sits `pressLift1x` px lower in the same crop; the word rides with it.
3. Text shadow: `label.dropShadow` is the kit's cast shadow (where the state draws one; the disabled and pressed states of some pieces draw it in place of the emboss). `label.embossLights` are the app's two thin inner-bevel lights on the letters (one light, one dark, each about a pixel off); `cssTextShadow` folds all of them into one CSS `text-shadow` value (blur radius doubled from the SVG standard deviation). Skipping the emboss lights is fine.
4. Hover: swap to the hover sprite; optionally draw `glow.png` behind, centred, tinted `hoverGlow.tint` at `hoverGlow.opacityByState`.
5. Disabled: swap the sprite and the label fill; the piece is inert.

## The bar

Draw `timer-track.png` at 1x (900.4 by 36), then the fill inside it: rect x = inset, y = inset, width = value times `fillFullWidth`, height = track height minus twice the inset, nine-sliced from `timer-fill.png` so the ends stay round at any width. The gold gradient is baked in the fill sprite; the warn pose is the same sprite in red (`bar.fill.colors.warn`), tint or recolour to taste. There is no amber variant in this kit.

## Lock In and the bar

The match board does not put a bar inside Lock In: the plan timer is a full-width bar at the top of the stage, and Lock In stands alone at the bottom-right. `composition.lockInAndBar` gives the Lock In frame at 1x, its stretch-safe inner rect (the nine-slice centre cell) and a suggested seat along the bottom of that rect, marked as a suggestion. `composition.placements` gives where every piece sits on the match board in stage px.

## Skipped on purpose

Idle motion (wipe and edge shine), the celebration words and claim burst, every other component and board.

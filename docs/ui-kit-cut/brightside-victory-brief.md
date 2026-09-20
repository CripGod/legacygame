# Brief for UI Kit Maker: the match-end ribbon and three stars, Brightside kit

For the Black History Card Battler web prototype (Stand on Business). This is an asset request only. Use the **Brightside** kit exactly as it is: no changes to its look, colours, faces or shapes. Cut what is listed below from the kit as it stands and deliver one zip in the same shape as the earlier "Stand on Business, web prototype cut" (`pieces/<id>/*.png` at 2x, `manifest.json`, `fonts/`).

## Where it goes

At the end of a match a word slams onto the centre of the screen over the board: VICTORY, DEFEAT or DRAW. It is drawn on a 1920 by 1080 stage at about 900 design px wide (1x) and sits at 42% of the height. Three stars pop up above it one after another (left, middle, right). Nothing else changes.

## Assets

### 1. The ribbon banner (`pieces/ribbon-banner/`)

The kit's **Ribbon banner** (the "re-worded" one with the flat plate and the folded tails).

- `default.png`: transparent PNG at 2x, **no word baked in**. The word is live text in the app, so it can read VICTORY, DEFEAT or DRAW.
- If the kit has a **loss or defeat pose** of the banner, or a **neutral or draw pose**, include each as its own file in the same crop (`loss.png`, `draw.png`). If it has none, deliver the one banner and say so in the manifest; the app will use it for all three.
- `glow.png`: the banner's white blurred silhouette, as with the buttons, so the app can draw the kit's glow behind it. Optional.
- In the manifest, as for the buttons: `spritePx`, `at1x.size`, the **plate rect** (where the word sits) and a **nine-slice** if the plate can stretch wider for a longer word (DEFEAT and VICTORY differ in length; DRAW is shorter). If the banner does not stretch, say `nineSlice: null` and give the plate rect only.
- The **word face**: family, font file (with its licence notice), weight, case, letter spacing, size at 1x, fill and shadow, and the seat (dx, dy) of the word on the plate, exactly the way `pieces[].states[].label` was given for the buttons. If the kit has a different fill for the loss pose, give both.

### 2. The star (`pieces/star/`)

The kit's **star**, the one it uses for ratings or rewards.

- `lit.png`: the star as it looks when earned.
- `unlit.png`: the star's empty, dim or outline state, if the kit has one; in the same crop as `lit.png` so a swap never moves the art.
- `glow.png`: the lit star's white blurred silhouette. Optional.
- Sizes at 1x in the manifest as usual. The app will draw each star at about 140 design px wide (1x); export at whatever 2x size the kit's star is drawn at, do not upscale.
- If the kit already has a **three-star arrangement** (a row or an arc with the outer stars tilted or smaller), give its layout in the manifest under `composition.threeStars`: for each of the three, centre (x, y) relative to the banner's centre at 1x, rotation in degrees and scale. If it has none, say so; the app will lay them out.

### 3. Pop or burst (`pieces/star-burst/`), only if the kit has one

If the kit has a **sparkle, burst or confetti atomic** it uses when something is earned, include the single particle sprite (`burst.png`, 2x, transparent) and its size at 1x. Skip this section if the kit has nothing of the kind; do not draw a new one.

## Manifest

`manifest.json` in the same format as the earlier cut: `kit: "Brightside"`, `pngScale: 2`, `pieces[]` with `id`, `spritePx`, `at1x` (size, shell or plate rect, nineSlice, pivot), `label` for the banner's word face, and `composition.threeStars` if the kit has it. Add a short `notes` string per piece where anything above says "say so".

## Not needed

Any other Brightside component, board or screen; idle motion; sounds; a Unity package. The word is never baked into the banner.

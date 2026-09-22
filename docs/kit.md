# UI Kit Maker cuts: from export to the board

The board's plates come from Chevon's UI Kit Maker (UIKM) as cuts: a zip with a `manifest.json`, a README and
`pieces/<piece>/<file>.png`, sprites at 2x with every number at 1x, sometimes with SVGs (the strip's shines). One
command takes a cut into the game.

```
npm run kit -- ~/Downloads/stand-on-business-turn-tracker.zip
```

What it does:

1. Unpacks the zip (a folder with a `manifest.json` works too).
2. For every piece the game knows, converts the files the game draws to WebP under `public/art/kit/` as
   `<prefix>-<name>.webp` (SVGs are copied as they are) and reports the files it leaves out.
3. Writes the piece's numbers (canvas, shell, seats) to `src/ui/kit-geometry.json` and prints every number that
   changed.
4. Refreshes `src/ui/art-manifest.json`, so every replaced picture gets a new address.

Then look (`npm run dev`), and commit the assets, the geometry and the manifest together.

## What lays itself out

`kitVars()` in `src/ui/art.ts` turns every number in `kit-geometry.json` into a CSS variable named
`--kit-<prefix>-<path>` (`--kit-tt-shell-w`, `--kit-sob-wordmark-dx`), and the CSS for these pieces reads those
variables instead of carrying numbers of its own. A re-export with a different shell, seat or canvas lays itself
out; a re-export with the same numbers is only new pictures.

| Piece id in the cut | Prefix | Files drawn | Numbers read by the CSS |
| --- | --- | --- | --- |
| `sob-button` | `sob` | default, hover, pressed, disabled, wordmark, shineEdge, shineWipe, plateStill | canvas, shell, lift, the wordmark's seat, the shine SVGs' viewBox offset |
| `turn-tracker` | `tt` | plate, plateDisabled, coinLit, coinUnlit | canvas, shell, the title seat and size, the coin row |
| `sob-button-silver` | `sob-silver` | default, hover, disabled, wordmark, shineEdge, shineWipe, plateStill | the same numbers (the CSS reads `--kit-sob-*` for both finishes) |
| `nameplate-you` | `np-you` | strip, ring, levelChip (as `chip`) | the strip's canvas and shell; the avatar's canvas, shell, portrait well, level chip and level text seat (written, not yet read by the CSS: the name plates still carry their numbers in `theme.css`) |
| `nameplate-opponent` | `np-opp` | as above | as above |

Options: `--only sob-button,turn-tracker` imports some pieces of a cut; `--skip plate,plate-disabled` leaves named
files out, by their asset names (the tracker's plate is a hand-made one for now, see below); `--dry` prints what
would happen, the numbers that would change included. A piece or file the cut does not have is an error, not a
silent no-op, and nothing is written if any piece's numbers fail to read.

## What still takes a hand

- A new piece needs a row in `PIECES` in `scripts/kit.ts` (its prefix, its files, which numbers to read) and CSS
  that reads its numbers.
- The name plates: `theme.css` still holds their numbers (`--u` is the strip's px per 1x unit, the avatar ring at
  -56.1u and so on). The importer writes their geometry; a later pass points the CSS at it. The opponent's ring in
  the game is the gold ring recoloured to blue and the you-chip reused, so a top-bar re-export is imported with
  `--only nameplate-you` until the cut carries a blue ring.
- The tracker's plate: the cut's plate has the kit's wall and extrusion; the owner wants the wall at Sit Down's
  width and no extrusion, and the strip's notched, glassy look. Until UIKM exports the tracker that way (its wall
  and extrusion are UIKM parameters; the PNG bakes them, there is no knob in the game), `tt-plate.webp` and
  `tt-plate-disabled.webp` are rendered by hand from the strip plate onto the tracker cut's canvas, so the CSS and
  the geometry are the cut's and only the picture is ours. Import the next tracker cut whole and the hand-made
  plate goes.
- The tracker's title: the cut says 26.3 and the owner wants it bigger, so `theme.css` scales it by 1.37 until the
  next export carries the size.
- The wordmark's vertical seat: the cut sits it 20.95 below the shell's centre; the reference lockup centres it on
  the shell (the crown clears the frame), so the CSS reads `dx` and not `dy`.
- A second finish of a piece is a second cut (a second set of states) imported under its own prefix and faded
  between in the CSS; the game never recolours a sprite in code, so Unity reads the same pictures. The strip's silver
  (its resting finish; gold is hover and Standing) is such a cut, made from the gold cut by one colour map (its
  README says how, and the ramp) rather than exported from UIKM; it lives at the same numbers.

## Unity

`kit-geometry.json` and `public/art/kit/` are the source for the Unity board as well: the same shells and seats,
the same pictures (Unity reads the WebP or the cut's PNGs), copied at the next sync checkpoint.

# Brightside, match-end cut

The ribbon banner, the star and the burst particle from the Brightside kit, for the Black History Card Battler web prototype, in the same shape as the Stand on Business web cut. Not a Unity package. The kit was not changed, and nothing else from it is in here.

- `pieces/ribbon-banner/default.png`: the banner at 2x, transparent, no word baked. There is no loss or draw pose in the kit; use this one for VICTORY, DEFEAT and DRAW. `glow.png` is its white blurred silhouette for the glow behind it (optional).
- `pieces/star/lit.png` and `unlit.png`: the rating star, earned and unearned, one crop. `glyph-lit.png`: the glyph-fleet star the kit's own Victory board uses (resting look only). `flare.png`: the rating piece's celebration flare.
- `pieces/star-burst/burst.png`: the dot the kit throws when something is earned (a white radial blob, tint it); the recipe is in the manifest.
- `manifest.json`: sizes, shell and plate rects, pivot, the word face (Fredoka 700, size, fill, shadow, seat, fit rule) and `composition.threeStars` from the Victory board.
- `fonts/`: the shipped Fredoka cut with its notice.

The word: Fredoka, weight 700, 64.4 px at 1x, letter spacing 0.010em, fill #22304A, anchored middle and central at the banner's shell centre plus the seat (dx 0, dy -28.7), which is 78.65 px below the plate's top. A word wider than 543.66 px at that size shrinks to fit; VICTORY, DEFEAT and DRAW do not.

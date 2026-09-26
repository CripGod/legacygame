# Effects: the particle runtime and its editor

Every particle effect is data: a preset in `src/ui/fx/presets/<id>.json`, played by one runtime (`src/ui/fx/engine.ts`)
on the web and, to come, by the same maths in C# for Unity. The editor at `?fx=1` tunes a preset live and saves it.

## A preset

```
{ id, name, anchor, duration, emitters: [ … ] }
```

`anchor` says what the effect plays over (a Location panel, a tile, the Stand button, the screen); the editor uses it
for its stand-in. `duration` cuts everything past it. Each emitter:

| Field | Meaning |
|---|---|
| `count` | particles in all |
| `spawn` | when they are born, ms after the effect starts (a min–max range) |
| `origin` | where, as fractions of the anchor rect: `x` and `y` ranges, 0 = left/top, 1 = right/bottom, outside allowed |
| `life` | ms each lives |
| `angle` | launch direction in degrees, screen-wise: 0 right, 90 down, 180 left, 270 up |
| `speed` | px per ms at birth |
| `drag` | the speed decays by this share per ms; distance = speed·(1 − e^(−drag·t))/drag |
| `gravity` | px per ms² (negative lifts) |
| `sway` | side-to-side wander: `amp` px, `freq` cycles per second |
| `size` | diameter at birth, px |
| `sizeOver`, `alphaOver` | polylines over the particle's life, `[[t, value], …]` with t from 0 to 1 |
| `color` | a gradient over life, `[[t, "#rrggbb" or "$tint"], …]`; `$tint` is the colour the effect is asked to wear (the owner's) |
| `sprite` | `glow` (soft disc), `puff` (dense cloud), `spark` (hot head, drawn along its travel), `star` (four points, spins) |
| `spin` | turns per second (star) |
| `blend` | `add` for light (sparks, embers), `normal` for paint (smoke) |
| `trail` | a streak behind a moving particle, 0–1 of its last 40 ms of travel |

A particle's whole life is a closed form of its birth values, so a frame at time t is the same on every machine and in
every port, and the editor can scrub. The seed fixes the birth values; the game seeds each shot so a replay repeats.

## Playing one

- On a shared canvas: `const sim = makeSim(preset, rect, { tint, seed })`, then `drawSim(ctx, sim, msSinceStart)` each
  frame (`Trails.tsx` does this for the ribbon's landing embers).
- On its own: `<Fx preset={…} at={rect} tint speed freezeAt loop onDone />` (a fixed canvas over the viewport).

## The editor

Open it from the landing page's footer (**Effects editor**) or with `?fx=1`. Pick a preset, play or loop it over the stand-in, scrub with the slider, slow it to 0.5,
0.25 or 0.1×, pick a tint, change any value and watch, **reset to saved** to go back, **copy JSON**, or **save**. Save always keeps a copy in this browser, which the game there plays from then on (so the preview
and the live site are working editors); on the dev server it also writes `src/ui/fx/presets/<id>.json`. **Back to
shipped** drops the browser copy. To make a tuned preset permanent from the preview, copy the JSON and hand it over. A new effect is a new file listed in
`src/ui/fx/presets.ts`. `tests/fx.test.ts` validates every preset.

## Presets

| Preset | Plays when | Anchor |
|---|---|---|
| `ember-landing` | a ribbon lands on a Location: embers rise off its lower half in the shot's colour | location |

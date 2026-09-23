# Card cinematics: the direction

A few cards have a moment of their own: when the card is played, either side, a short clip with a transparent
background rises out of the card's tile, the board goes still under a veil, a line of the person's own words sits
under their name, and when the clip ends the board picks up where it froze. The sequence was worked out on Paul
Laurence Dunbar and every clip since follows it; the code reads one table (`src/ui/cinematics.ts`), so a new clip is
one command and one line.

## The sequence

The play beat is the 1.8-second turn Harborlight's cards get (your own card, which needs no turn, gets the swell only under a clip); the clip grows out of it. Times are from the beat's start.

| When | What happens |
| --- | --- |
| 0.0s | The beat opens. Harborlight's card turns face up in its Gate slot: a moment on the back, the tile swells to 1.32×, turns at the top of the swell, holds the face, settles. Your own card, which you already know, takes the same beat face up, with no back shown. |
| 1.0s | With the face up and big, the clip rises out of the tile's rectangle to the middle of the board (0.55s), a veil comes over the board (0.5s, 72% dark), and the board holds: the backdrop video pauses, every animation on the board freezes in place, the strip's shines go still. Nothing else moves until the clip is done. |
| 1.25s | The caption fades in under the clip: a plate in Harborlight's blue saying who played the card, when it is their play; the card's name (gold for you, blue for Harborlight); the line; the card's summary. |
| the clip | Plays to its end at up to 480px tall (42% of the viewport's height). About three seconds is the direction; the board stops waiting at 6.5s and pauses whatever is still playing. Its sound, if it carries one, plays at the game's sound-effects setting, muted when that is off (a toggle mid-clip takes at once). |
| the clip done | The caption rises to the vertical centre of where the picture was (0.6s), where the eye is resting, and holds there to be read: three seconds in all. The board stays held. |
| the end | The veil and the caption fade (0.4s), the board resumes where it froze, the tile's turn runs its rest and settles, and the beat moves on. A click does not skip the clip. |

Under reduced motion, and on WebKit (Safari, and every browser on iOS: they play VP9 WebM but not its alpha, so the
clip would show as an opaque square), there is no clip: the card takes its ordinary turn and the beat moves on. The
WebKit skip is by vendor, since no browser API reports alpha support.

The moment is the card being played from hand. A card arriving Inside, relocating, or coming back does not play it.

## Delivering a clip

- **Square, 720×720**, 24 fps, **about three seconds** (six at most: the board stops waiting at 6.5s). 400×400 plays
  but is scaled up on a big screen, 250×250 visibly so; nothing is scaled up in the encode, so what is delivered is
  what shows. A clip taller than 720 is brought down to 720 tall, a wide one wider than 1280 to 1280; a long clip is
  not shortened. **A 16:9 clip** (1280×720) is drawn wide, up to 72% of the viewport's width, with `wide: true` on
  its entry.
- **An alpha channel**, transparent wherever the board should show through. From Premiere or Media Encoder: Export,
  Format QuickTime, Apple ProRes 4444, Depth "8-bpc + alpha" (or 16-bpc). From After Effects: Channels RGB + Alpha,
  Color Straight. A clip without alpha is refused with that setting named. A clip delivered over black can be keyed
  first: `python3 scripts/cine-key.py in.mov out.mov` cuts out the black that touches the frame's edge (the picture's
  own darks stay) and writes a ProRes 4444 with alpha for the import. It needs numpy and scipy.
- **No fade needed.** The game fades the clip in over a quarter second and out over three quarters, picture and
  sound together, so the clip can be delivered running from frame one to its last frame.
- **Sound is optional.** Stereo, in the clip. It is brought to one level (about -20 LUFS; one pass over a short clip
  lands within a couple of LU of it), cut with the picture, faded with it, and plays at 0.6 of full scale, level with
  the game's own cues.
- **Size.** ProRes 4444 is large: three seconds at 400² is about 30 MB, at 720² about 90 MB. When an upload limit
  is in the way, a colour pass over black plus a matte pass (white on black, from a Track Matte Key) in H.264 come
  to a few MB each; the key is then made by hand (Dunbar's was, from a colour pass alone).
- **Safari** needs the same clip as HEVC with alpha (Media Encoder on a Mac: the "HEVC with alpha" preset). Not
  wired yet: when such a file exists it goes first in the video element's sources, ahead of the WebM.

## Bringing it in

```
npm run cine -- ~/Downloads/harriet.mov harriet
```

`scripts/cine.ts` reads the clip (ffmpeg and ffprobe on the PATH), refuses one without alpha, and writes the two
files the game plays: `public/art/video/harriet.webm` (VP9 with alpha, Opus when there is sound) for the web and
`unity/StandOnBusiness/Assets/StandOnBusiness/Resources/video/harriet.webm` (VP8 with alpha, Vorbis) for Unity. The
fades and the sound level are baked in there. `--dry` prints what it would do.

Then the card's entry in `src/ui/cinematics.ts`: the clip's file name, the line under the name (the person's own
words, a real quotation, never ours; when none is attested, an `epithet`, a plain fact set without quotation marks),
`sound: true` when the clip carries sound, and `wide: true` for a 16:9 clip. The read hold after the clip is
`CINE_READ_MS` in the same file, the longest wait `CINE_MAX_MS`, and a clip's volume `CINE_VOLUME`. The test in
`tests/cinematics.test.ts` checks that every entry names a real card and that both files exist. In `?dev=1`,
`window.__sobCine('harriet_tubman')` plays the moment out of her tile on the spot, and `__sobCine('harriet_tubman', true)`
plays it as Harborlight's.

The single-file build for the artifact does not inline video: the clips are published as files beside the page, so
a new clip goes up with it.

## Unity

The VP8 twin is copied into the Unity project's Resources at import; the Unity board's own player for these moments
(VideoPlayer with transparency, the same hold and caption) is still to build. The direction above is the spec for it.

## The clips so far

| Card | Clip | Line | Sound | Source |
| --- | --- | --- | --- | --- |
| Paul Laurence Dunbar | `dunbar.webm` | "We wear the mask that grins and lies." | none | A 1080² colour pass over black, keyed by hand and played at twice its speed (six seconds became three) |
| Harriet Tubman | `harriet.webm` | "I never ran my train off the track, and I never lost a passenger." | yes | ProRes 4444 with alpha, 400², through `npm run cine` |
| Frederick Douglass | `douglass.webm` | "If there is no struggle, there is no progress." | yes | ProRes 4444 with alpha, 400², 6s, through `npm run cine` |
| Bass Reeves | `reeves.webm` | Deputy U.S. Marshal in the Indian Territory for thirty-two years (an epithet: no quotation of his is well attested) | yes | 16:9, 1280×720, 5.6s, delivered over black, keyed with `cine-key.py`, drawn wide |

/**
 * Card cinematics: the clip that rises out of a card's tile when the card is played, either side, and holds the board
 * while it plays (Snap freezes the table for a card's moment). The direction, the sequence and its timings, and how a
 * clip is delivered and brought in are in `docs/cinematics.md`; `npm run cine -- <clip.mov> <name>` writes the files.
 * The runner in MatchScreen reads this table: a card with an entry here has the moment, every other card has its turn.
 */
export interface Cinematic {
  /** The file under public/art/video (VP9 with alpha; Unity plays the VP8 twin from its Resources/video). */
  clip: string;
  /** The line under the name: the card's own words, a real quotation, never ours. */
  line: string;
  /** The clip carries sound: it plays at CINE_VOLUME when sound effects are on, muted when they are off. */
  sound?: boolean;
}

export const CINEMATICS: Record<string, Cinematic> = {
  // "We Wear the Mask" (1895), the poem's first line.
  paul_laurence_dunbar: { clip: 'dunbar.webm', line: 'We wear the mask that grins and lies.' },
  // Her account of the Railroad years, as Sarah Bradford recorded it.
  harriet_tubman: { clip: 'harriet.webm', line: 'I never ran my train off the track, and I never lost a passenger.', sound: true },
};

/** A clip's sound, brought to -20 LUFS by `npm run cine`, plays at this volume: level with the game's own cues. */
export const CINE_VOLUME = 0.6;

/** After the clip, the caption rises and holds this long to be read: the eye was on the picture while it played. */
export const CINE_READ_MS = 2000;

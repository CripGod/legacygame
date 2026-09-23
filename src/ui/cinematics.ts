/**
 * Card cinematics: the clip that rises out of a card's tile when the card is played, either side, and holds the board
 * while it plays (Snap freezes the table for a card's moment). The direction, the sequence and its timings, and how a
 * clip is delivered and brought in are in `docs/cinematics.md`; `npm run cine -- <clip.mov> <name>` writes the files.
 * The runner in MatchScreen reads this table: a card with an entry here has the moment, every other card has its turn.
 */
export interface Cinematic {
  /** The file under public/art/video (VP9 with alpha; Unity plays the VP8 twin from its Resources/video). */
  clip: string;
  /** The line under the name: the card's own words, a real quotation, never ours. Absent when none is attested. */
  line?: string;
  /** In place of a line, a plain fact about the person, set without quotation marks. */
  epithet?: string;
  /** A 16:9 clip: the board draws it wide (up to 1280 by 720 in the file, 72% of the viewport's width on the board). */
  wide?: boolean;
  /** The clip carries sound: it plays at CINE_VOLUME when sound effects are on, muted when they are off. */
  sound?: boolean;
}

export const CINEMATICS: Record<string, Cinematic> = {
  // "We Wear the Mask" (1895), the poem's first line.
  paul_laurence_dunbar: { clip: 'dunbar.webm', line: 'We wear the mask that grins and lies.' },
  // Her account of the Railroad years as Sarah Bradford recorded it (1886), in Bradford's dialect rendering; this is the standard modern wording.
  harriet_tubman: { clip: 'harriet.webm', line: 'I never ran my train off the track, and I never lost a passenger.', sound: true },
  // The West India Emancipation speech, Canandaigua, 1857.
  frederick_douglass: { clip: 'douglass.webm', line: 'If there is no struggle, there is no progress.', sound: true },
  // No quotation of Reeves's own is well attested (he could not read or write; the papers paraphrased him), so a fact.
  bass_reeves: { clip: 'reeves.webm', epithet: 'Deputy U.S. Marshal in the Indian Territory for thirty-two years.', sound: true, wide: true },
};

/** A clip's sound, brought to -20 LUFS by `npm run cine`, plays at this volume: level with the game's own cues. */
export const CINE_VOLUME = 0.6;

/** After the clip, the caption rises and holds this long to be read: the eye was on the picture while it played. */
export const CINE_READ_MS = 2500;

/** The longest the board waits for a clip: a clip still playing then is paused, and the caption reads over the still. Six seconds of clip fit. */
export const CINE_MAX_MS = 6500;

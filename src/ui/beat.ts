/**
 * The readout's short form of a beat. The engine's labels and event texts are whole sentences ("Harborlight plays John
 * Russwurm at the Gates of Montgomery, Alabama"); the readout above Lock In is 300px wide, so it shows a compressed
 * line and leaves the sentence to the log: your handle becomes "You", people take their short names, Locations lose
 * their state or year, the stock phrases shrink to a glance ("You: Russwurm → Montgomery"), a beat keeps only its first
 * clause, and what is still long is cut at a word. The full sentence is in the log.
 */
import { CARD_BY_ID, LOCATION_BY_ID, type GameState, type PlayerId } from '../engine';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Full name to short name, longest names first so "Mary Ellen Pleasant" is replaced before any shorter overlap. */
const CHARACTERS: [RegExp, string][] = Object.values(CARD_BY_ID)
  .filter((d) => d.kind === 'character' && d.short && d.short !== d.name)
  .sort((a, b) => b.name.length - a.name.length)
  .map((d) => [new RegExp(escape(d.name), 'g'), d.short]);

const LOCATIONS: [RegExp, string][] = Object.values(LOCATION_BY_ID)
  .map((d) => [d.name, d.name.split(',')[0]] as [string, string])
  .filter(([a, b]) => a !== b)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([a, b]) => [new RegExp(escape(a), 'g'), b]);

const PHRASES: [RegExp, string][] = [
  [/ and knocks them away to the Gates of another Location\./g, ': knocked away.'],
  [/ and knocks them away to the Gates of /g, ' → '],
  [/ to the Gates of /g, ' to '],
  [/ at the Gates of /g, ' at '],
  [/ relocates to /g, ' → '],
  [/ comes down at /g, ' at '],
  [/^The match is now worth (\d+) Legacy$/g, 'Legacy ×$1'],
  [/^Turn (\d+) is counted$/g, 'Turn $1 counted'],
  [/ is revealed$/g, ' revealed'],
  [/ for the rest of the match/g, ' for good'],
  [/\((\d+) Force against (\d+)\)/g, '($1 vs $2)'],
  [/ stands? on business/g, ' Stand on Business'],
  [/ Established Character/g, ' Established'],
  [/straight Inside/g, 'Inside'],
  [/^(.+?) plays? (.+?) Inside (.+)$/g, '$1: $2 → $3, Inside'],
  [/^(.+?) plays? (.+?) at (.+)$/g, '$1: $2 → $3'],
  [/^You plant (.+?) at (.+)$/g, 'You plant $1 → $2'],
  [/^(.+?) plants (.+?) at (.+)$/g, '$1 plants $2 → $3'],
  [/^(.+?) is torn up at .+$/g, '$1 torn up'],
  [/^(.+?) closes at .+: proved up$/g, '$1 proved up'],
  [/^First Location bonus at .+$/g, 'First Location bonus'],
  [/ on business$/g, ' on Business'],
];

const MAX = 40;

export function shortBeat(text: string, view: GameState, me: PlayerId, placeholders: boolean): string {
  let t = text;
  const mine = view.players[me].handle;
  if (mine) {
    const h = escape(mine);
    t = t
      .replace(new RegExp(`${h}'s`, 'g'), 'Your')
      .replace(new RegExp(`${h} plays`, 'g'), 'You play')
      .replace(new RegExp(`${h} plants`, 'g'), 'You plant')
      .replace(new RegExp(`${h} stands`, 'g'), 'You stand')
      .replace(new RegExp(h, 'g'), 'You');
  }
  if (!placeholders) {
    for (const [re, short] of CHARACTERS) t = t.replace(re, short);
    for (const [re, short] of LOCATIONS) t = t.replace(re, short);
  }
  for (const [re, short] of PHRASES) t = t.replace(re, short);
  t = t.replace(/\s+/g, ' ').trim();
  // The first sentence only (a reveal's "Name: what happened." keeps the what; the why and the aside go to the log).
  const stop = t.search(/[.;] |\. ?$/);
  if (stop > 0) t = t.slice(0, stop);
  if (t.length > MAX) {
    const cut = t.lastIndexOf(' ', MAX - 1);
    t = `${t.slice(0, cut > 16 ? cut : MAX - 1).replace(/[,.;:(]$/, '')}…`;
  }
  return t.replace(/[.]$/, '');
}

import { influenceRows, type GameState, type InfluencePart, type PlayerId } from '../engine';

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/** "4 printed, +1 Inside, −1 Anansi's web (costs 3 or more)": the lines that make one Character's number. */
export function partsText(parts: InfluencePart[]): string {
  return parts.map((p, i) => (i === 0 && p.why.startsWith('printed') ? `${p.amount} ${p.why}` : `${signed(p.amount)} ${p.why}`)).join(', ');
}

/**
 * The Influence sum at a Location for one player as plain lines, for the score circle's tooltip: who counts for
 * how much and why, what the Location itself adds, and what the leader modifiers take. The last line is the total.
 */
export function influenceLines(view: GameState, index: number, p: PlayerId, me: PlayerId): string[] {
  const { rows, total } = influenceRows(view, index, p);
  const who = p === me ? 'You' : view.players[p].handle;
  const lines = [`${who}: ${total} Influence here`];
  if (!rows.length) lines.push('Nobody here yet.');
  for (const r of rows) {
    if (r.parts) lines.push(`${r.label} ${r.amount}${r.parts.length > 1 || !r.parts[0]?.why.startsWith('printed') ? ` (${partsText(r.parts)})` : ''}`);
    else lines.push(`${signed(r.amount)} ${r.label}`);
  }
  return lines;
}

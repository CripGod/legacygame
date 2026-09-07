/**
 * Presentation helpers: names (with the "generic placeholder" Test A mode), colors, text.
 */
import { createContext, useContext } from 'react';
import { CARD_BY_ID, LOCATION_BY_ID, THREAT_BY_ID, type CardDef, type CharacterDef, type PlayerId } from '../engine';

export interface DisplaySettings {
  placeholders: boolean;
}

export const DisplayContext = createContext<DisplaySettings>({ placeholders: false });
export const useDisplay = () => useContext(DisplayContext);

const cardIndex: Record<string, number> = {};
Object.keys(CARD_BY_ID)
  .sort()
  .forEach((id, i) => (cardIndex[id] = i + 1));
const locIndex: Record<string, number> = {};
Object.keys(LOCATION_BY_ID)
  .sort()
  .forEach((id, i) => (locIndex[id] = i + 1));

export function cardName(id: string, placeholders: boolean): string {
  const def = CARD_BY_ID[id];
  if (!def) return id;
  if (!placeholders) return def.name;
  return def.kind === 'character' ? `Figure ${String(cardIndex[id]).padStart(2, '0')}` : `Event ${cardIndex[id]}`;
}

export function cardShort(id: string, placeholders: boolean): string {
  const def = CARD_BY_ID[id];
  if (!def) return id;
  if (!placeholders) return def.short;
  return def.kind === 'character' ? `F${cardIndex[id]}` : `E${cardIndex[id]}`;
}

export function locationName(id: string, placeholders: boolean): string {
  const def = LOCATION_BY_ID[id];
  if (!def) return id;
  if (def.hidden) return 'Hidden Location';
  return placeholders ? `Site ${locIndex[id]}` : def.name;
}

export function threatLabel(id: string, placeholders: boolean): string {
  const def = THREAT_BY_ID[id];
  if (!def) return id;
  return placeholders ? `Threat ${def.family[0]}` : def.name;
}

export function initials(id: string, placeholders: boolean): string {
  const def = CARD_BY_ID[id];
  if (!def) return '?';
  if (placeholders) return cardShort(id, true);
  const parts = def.name.split(/\s+/).filter(Boolean);
  if (def.kind === 'event') return parts[0].slice(0, 2).toUpperCase();
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable pastel hue per card, used for placeholder "portraits". */
export function hueFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 62%)`;
}

export function playerColor(p: PlayerId): string {
  return p === 'A' ? 'var(--cA)' : 'var(--cB)';
}

export function abilityLines(def: CardDef): { label: string; text: string }[] {
  if (def.kind === 'event') return [{ label: 'Event', text: def.text }];
  const out: { label: string; text: string }[] = [];
  if (def.keywords.includes('DIRECT_ENTRY')) out.push({ label: 'Direct Entry', text: 'May go Inside the turn it is played. Your choice: tap the planned card to switch between Gates and Inside.' });
  if (def.keywords.includes('STRAIGHT_INSIDE')) out.push({ label: 'Straight Inside', text: 'Always goes Inside the turn it is played.' });
  if (def.reveal) out.push({ label: 'Reveal', text: def.reveal.text });
  if (def.established) out.push({ label: 'Established', text: def.established.text });
  if (def.passive) out.push({ label: 'Always', text: def.passive.text });
  if (def.spawn) out.push({ label: 'Arrives', text: spawnText(def.spawn) });
  return out;
}

export function spawnText(rule: NonNullable<CharacterDef['spawn']>): string {
  const loc = LOCATION_BY_ID[rule.locationId]?.name ?? rule.locationId;
  const odds = rule.chance !== undefined ? ` Only ${Math.round(rule.chance * 100)}% of matches have it at all.` : '';
  if (rule.type === 'onReveal') return `Not in any deck. When ${loc} is revealed, one arrives Ready at each player's Gates there (if there is room).${odds}`;
  if (rule.type === 'setAt') return `Not in any deck. When ${rule.cardIds.map((id) => CARD_BY_ID[id]?.name ?? id).join(', ')} are all Established at ${loc}, it appears there for you. Once per match.`;
  if (rule.type === 'insideAt') return `Not in any deck. When you have ${rule.count} Characters Inside at ${loc}, it comes to your hand. Once per match.${odds}`;
  return `Not in any deck. When you have ${rule.count} Established Characters at ${loc}, it arrives there for you (Inside if there is room, else at the Gates). Once per match.`;
}

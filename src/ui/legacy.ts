import { useSyncExternalStore } from 'react';
import { CARD_BY_ID, PRESET_DECKS } from '../engine';

/**
 * The Legacy ledger: what the player has won, what they have spent, and the rank of every card they have promoted.
 * Legacy is only earned (a match won pays its Legacy); it buys card ranks, which are cosmetic: a bronze, silver or
 * gold frame on the same card, the same numbers. A card's cost sets where it starts; Legacy raises it from there. Local for now (localStorage); the account is meant to own it later
 * (docs/economy.md). Unity: the same shape as a save file, the ranks a dictionary keyed by card id.
 */
export type Rank = 'wood' | 'bronze' | 'silver' | 'gold' | 'emerald' | 'ruby' | 'diamond';
/** The ladder, bought with Legacy. */
export const RANKS: Rank[] = ['wood', 'bronze', 'silver', 'gold', 'emerald', 'ruby', 'diamond'];
/** What the next rank costs, in Legacy. A plain win pays 1; a Stand taken early pays 4 to 16. No card starts at Diamond. */
export const RANK_PRICE: Record<Rank, number> = { wood: 0, bronze: 3, silver: 8, gold: 12, emerald: 16, ruby: 22, diamond: 30 };
export const RANK_LABEL: Record<Rank, string> = { wood: 'Wood', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', emerald: 'Emerald', ruby: 'Ruby', diamond: 'Diamond' };
/**
 * Finishes: frames outside the ladder, cosmetic, for the store later. Shown now on a few cards so the decks carry a
 * mix. The frame can never outrank the card: a finish is assumed won, bought or granted, and says nothing about rank.
 */
export type Finish = 'tigers-eye' | 'turquoise' | 'amethyst' | 'onyx' | 'marble' | 'ice' | 'camouflage' | 'lava' | 'usa' | 'jungle';
export const FINISHES: Finish[] = ['tigers-eye', 'turquoise', 'amethyst', 'onyx', 'marble', 'ice', 'camouflage', 'lava', 'usa', 'jungle'];
export const FINISH_LABEL: Record<Finish, string> = { 'tigers-eye': "Tiger's Eye", turquoise: 'Turquoise', amethyst: 'Amethyst', onyx: 'Onyx', marble: 'Marble', ice: 'Ice', camouflage: 'Camouflage', lava: 'Lava', usa: 'Stars and Stripes', jungle: 'Jungle' };
/** The finishes the preview rotation deals out; Jungle is reserved and placed by name instead, so adding it moved nothing. */
const ROTATION: Finish[] = FINISHES.filter((f) => f !== 'jungle');
/** Every frame a card can wear. */
export type FrameId = Rank | Finish;

export interface Ledger {
  banked: number;
  spent: number;
  ranks: Record<string, Rank>;
  log: { at: string; delta: number; why: string }[];
}

const KEY = 'bhcb.legacy.v1';
const EMPTY: Ledger = { banked: 0, spent: 0, ranks: {}, log: [] };

function load(): Ledger {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<Ledger>;
      return { banked: Math.max(0, Number(j.banked) || 0), spent: Math.max(0, Number(j.spent) || 0), ranks: j.ranks && typeof j.ranks === 'object' ? j.ranks : {}, log: Array.isArray(j.log) ? j.log.slice(-50) : [] };
    }
  } catch {
    /* private mode or blocked storage: a fresh ledger */
  }
  return { ...EMPTY };
}

let ledger: Ledger = typeof window !== 'undefined' ? load() : { ...EMPTY };
const listeners = new Set<() => void>();
function commit(next: Ledger): void {
  ledger = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(ledger));
  } catch {
    /* fine */
  }
  for (const l of listeners) l();
}

export function getLedger(): Ledger {
  return ledger;
}
export function subscribeLedger(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function useLedger(): Ledger {
  return useSyncExternalStore(subscribeLedger, getLedger, getLedger);
}
/** Legacy in hand: won minus spent. */
export function balance(): number {
  return ledger.banked - ledger.spent;
}
/** Legacy won: a match, a grant. */
export function bank(delta: number, why: string): void {
  if (!(delta > 0)) return;
  commit({ ...ledger, banked: ledger.banked + delta, log: [...ledger.log, { at: new Date().toISOString(), delta, why }].slice(-50) });
}
/** Where a card starts: its printed cost sets the rank (0-1 Wood, 2 Bronze, 3 Silver, 4 Gold, 5 Emerald, 6 and up Ruby; never Diamond); Legacy raises it. */
export function baseRank(cardId: string): Rank {
  const cost = (CARD_BY_ID[cardId] as { cost?: number } | undefined)?.cost ?? 1;
  return cost >= 6 ? 'ruby' : cost >= 5 ? 'emerald' : cost >= 4 ? 'gold' : cost >= 3 ? 'silver' : cost >= 2 ? 'bronze' : 'wood';
}
/** A small stable hash of a card id, 0..1. */
function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}
/** Cards that come in one rank only, outside the ladder: never promoted, never finished. Black Jesus only comes in Wood. */
const FIXED_RANK: Record<string, Rank> = { black_jesus: 'wood' };
export function fixedRank(cardId: string): Rank | null {
  return FIXED_RANK[cardId] ?? null;
}
/**
 * The finishes a card wears for now, a preview of the store's frames until finishes are owned and equipped: every
 * fourth Character of each preset deck, in deck order, takes the next finish in the list, each deck starting two
 * further along, so every deck shows a few (the first card of each row among them) and every finish is worn by at
 * least two cards. Cards outside the decks fall to a stable hash, about one in five. Once finishes are owned this
 * reads the profile instead.
 */
/** Finishes that only some cards may wear. Stars and Stripes: American political figures only, for now. */
const USA_POLITICAL = new Set(['abraham_lincoln', 'thaddeus_stevens', 'charles_sumner', 'robert_smalls', 'henry_mcneal_turner', 'roger_taney', 'frederick_douglass']);
/** Camouflage: soldiers, rebels, war leaders and the war-involved, by tag or by name. */
const MILITARY_TAGS = new Set(['Military', 'Soldier', 'Rebellion', 'Revolution', 'Defense', 'Spy', 'Maroon']);
const MILITARY_IDS = new Set(['john_brown', 'harriet_tubman', 'robert_smalls', 'henry_mcneal_turner', 'lewis_hayden', 'ogun', 'shango', 'mary_seacole', 'abraham_lincoln']);
function isMilitary(cardId: string): boolean {
  const def = CARD_BY_ID[cardId] as { tags?: string[] } | undefined;
  return MILITARY_IDS.has(cardId) || !!def?.tags?.some((t) => MILITARY_TAGS.has(t));
}
/** Jungle: the forest and the maroon, whose ground was the bush, the hills and the quilombo, by tag or by name. */
const JUNGLE_IDS = new Set(['anansi', 'nanny_of_the_maroons', 'zumbi_dos_palmares', 'yaa_asantewaa', 'queen_nzinga', 'boukman_dutty', 'cecile_fatiman', 'nehanda', 'harriet_tubman']);
function isJungle(cardId: string): boolean {
  const def = CARD_BY_ID[cardId] as { tags?: string[] } | undefined;
  return JUNGLE_IDS.has(cardId) || !!def?.tags?.includes('Maroon');
}
export function mayWear(cardId: string, finish: Finish): boolean {
  if (finish === 'usa') return USA_POLITICAL.has(cardId);
  if (finish === 'camouflage') return isMilitary(cardId);
  if (finish === 'jungle') return isJungle(cardId);
  return true;
}
/** Finishes a card wears no matter the rotation: the Adwa pair in Camouflage, Lincoln in Stars and Stripes, the forest four in Jungle (Anansi carries it in the Railroad deck). */
const FORCED_FINISH: Record<string, Finish> = { menelik_ii: 'camouflage', taytu_betul: 'camouflage', abraham_lincoln: 'usa', anansi: 'jungle', nanny_of_the_maroons: 'jungle', zumbi_dos_palmares: 'jungle', yaa_asantewaa: 'jungle' };
const IN_DECK = new Set<string>();
const PREVIEW: Record<string, Finish> = (() => {
  const out: Record<string, Finish> = { ...FORCED_FINISH };
  Object.values(PRESET_DECKS).forEach((deck, d) => {
    const chars = deck.cards.filter((id) => CARD_BY_ID[id]?.kind === 'character' && !FIXED_RANK[id]);
    let k = d * 2;
    chars.forEach((id, i) => {
      IN_DECK.add(id);
      if (i % 4 !== 0 || out[id]) return;
      let f = ROTATION[k % ROTATION.length];
      if (!mayWear(id, f)) f = ROTATION[(k + 1) % ROTATION.length];
      out[id] = f;
      k++;
    });
  });
  // A restricted finish still shows on a couple of cards: eligible deck cards without a finish of their own wear it.
  for (const f of FINISHES) {
    const deckCards = [...new Set(Object.values(PRESET_DECKS).flatMap((deck) => deck.cards))];
    while (Object.values(out).filter((x) => x === f).length < 2) {
      const id = deckCards.find((c) => CARD_BY_ID[c]?.kind === 'character' && !FIXED_RANK[c] && !out[c] && mayWear(c, f));
      if (!id) break;
      out[id] = f;
    }
  }
  return out;
})();
function hashedFinish(cardId: string): Finish | null {
  if (IN_DECK.has(cardId)) return null;
  const r = hash01(cardId);
  const f = r < 0.2 ? ROTATION[Math.floor((r / 0.2) * ROTATION.length)] : null;
  return f && mayWear(cardId, f) ? f : null;
}
export function finishOf(cardId: string): Finish | null {
  if (FIXED_RANK[cardId]) return null;
  return FORCED_FINISH[cardId] ?? PREVIEW[cardId] ?? hashedFinish(cardId);
}
/** The frame on the card: a finish if it wears one, otherwise its rank. */
export function frameOf(cardId: string): FrameId {
  return finishOf(cardId) ?? rankOf(cardId);
}
/** The rank a card holds: what was bought for it, or its starting rank, whichever is higher. The ladder frame never sits above this. */
export function rankOf(cardId: string): Rank {
  const fixed = FIXED_RANK[cardId];
  if (fixed) return fixed;
  const bought = ledger.ranks[cardId];
  const base = baseRank(cardId);
  return bought && RANKS.indexOf(bought) > RANKS.indexOf(base) ? bought : base;
}
export function nextRank(cardId: string): Rank | null {
  if (FIXED_RANK[cardId]) return null;
  const i = RANKS.indexOf(rankOf(cardId));
  return i < RANKS.length - 1 ? RANKS[i + 1] : null;
}
/** Promote a card one rank, paying the next rank's price. */
export function promote(cardId: string): 'ok' | 'short' | 'max' {
  const next = nextRank(cardId);
  if (!next) return 'max';
  const price = RANK_PRICE[next];
  if (balance() < price) return 'short';
  commit({ ...ledger, spent: ledger.spent + price, ranks: { ...ledger.ranks, [cardId]: next }, log: [...ledger.log, { at: new Date().toISOString(), delta: -price, why: `${cardId} to ${next}` }].slice(-50) });
  return 'ok';
}
export function resetLedger(): void {
  commit({ ...EMPTY, ranks: {}, log: [] });
}

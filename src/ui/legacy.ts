import { useSyncExternalStore } from 'react';

/**
 * The Legacy ledger: what the player has won, what they have spent, and the rank of every card they have promoted.
 * Legacy is only earned (a match won pays its Legacy); it buys card ranks, which are cosmetic: a bronze, silver or
 * gold frame on the same card, the same numbers. Local for now (localStorage); the account is meant to own it later
 * (docs/economy.md). Unity: the same shape as a save file, the ranks a dictionary keyed by card id.
 */
export type Rank = 'bronze' | 'silver' | 'gold';
export const RANKS: Rank[] = ['bronze', 'silver', 'gold'];
/** What the next rank costs, in Legacy. A plain win pays 1; a Stand taken early pays 4 to 16. */
export const RANK_PRICE: Record<Rank, number> = { bronze: 0, silver: 3, gold: 8 };
export const RANK_LABEL: Record<Rank, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

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
export function rankOf(cardId: string): Rank {
  return ledger.ranks[cardId] ?? 'bronze';
}
export function nextRank(cardId: string): Rank | null {
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

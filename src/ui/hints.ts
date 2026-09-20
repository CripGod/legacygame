import { useSyncExternalStore } from 'react';

/**
 * Hints: the hover/focus explanations under every meter, chip and button. Off by default; the switch lives in the
 * settings menu next to Music and Sound effects and is remembered in localStorage. The same text is always reachable
 * by tap in the sheets and the Compendium, so hints off never hides a rule.
 */
const KEY = 'bhcb.hints.v1';

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

let on = load();
const listeners = new Set<() => void>();

export function hintsOn(): boolean {
  return on;
}

export function setHints(next: boolean): void {
  on = next;
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off');
  } catch {
    /* fine */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useHints(): boolean {
  return useSyncExternalStore(subscribe, hintsOn, hintsOn);
}

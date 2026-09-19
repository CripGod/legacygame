/**
 * FLIP animation for board tiles: after each render, any element with a
 * data-uid that changed position glides from its previous position. New tiles
 * fly in from an origin element (owner avatar, planned ghost, or hand card).
 */
import { useLayoutEffect, useRef } from 'react';

export interface FlipOptions {
  /** Per-tile stagger in ms. */
  delayFor: (uid: string) => number;
  /** Per-tile glide duration in ms. */
  durationFor?: (uid: string) => number;
  /** Bump to force a pass (e.g. state version). */
  version: unknown;
}

export function useFlip(container: React.RefObject<HTMLElement | null>, opts: FlipOptions): void {
  const rects = useRef(new Map<string, DOMRect>());
  const places = useRef(new Map<string, string>());
  const optsRef = useRef(opts);
  optsRef.current = opts;
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, DOMRect>();
    const nextPlaces = new Map<string, string>();
    const els = root.querySelectorAll<HTMLElement>('[data-uid]');
    els.forEach((el) => {
      next.set(el.dataset.uid!, el.getBoundingClientRect());
      nextPlaces.set(el.dataset.uid!, el.dataset.place ?? '');
    });
    if (!reduce) {
      els.forEach((el) => {
        const uid = el.dataset.uid!;
        const rect = next.get(uid)!;
        const prev = rects.current.get(uid);
        // Only a change of place (Gate↔Inside, Location→Location) animates; new tiles simply appear.
        if (!prev || places.current.get(uid) === nextPlaces.get(uid)) return;
        const dx = prev.left + prev.width / 2 - (rect.left + rect.width / 2);
        const dy = prev.top + prev.height / 2 - (rect.top + rect.height / 2);
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        const scale = Math.max(0.3, Math.min(3, prev.width / rect.width));
        const delay = optsRef.current.delayFor(uid);
        const duration = optsRef.current.durationFor?.(uid) ?? 620;
        if (duration <= 0) return;
        // The glow box beside the piece (its sibling in the .tile-glow wrapper, on the plane beneath every tile)
        // glides with it, so the halo travels and no lit frame waits at the destination.
        const glow = el.parentElement?.classList.contains('tile-glow') ? el.parentElement.querySelector<HTMLElement>(':scope > i.glow') : null;
        const both = glow ? [el, glow] : [el];
        for (const t of both) {
          t.style.transition = 'none';
          t.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
        }
        el.style.zIndex = '40';
        el.style.opacity = delay > 0 && !rects.current.has(uid) ? '0' : '1';
        if (glow) glow.style.opacity = el.style.opacity;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            for (const t of both) {
              t.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1) ${delay}ms, opacity 120ms linear ${delay}ms`;
              t.style.transform = '';
              t.style.opacity = '1';
            }
            window.setTimeout(() => {
              for (const t of both) t.style.transition = '';
              el.style.zIndex = '';
              if (glow) glow.style.opacity = '';
            }, duration + 80 + delay);
          });
        });
      });
    }
    rects.current = next;
    places.current = nextPlaces;
  });
}

/**
 * FLIP animation for board tiles: after each render, any element with a
 * data-uid that changed position glides from its previous position. New tiles
 * fly in from an origin element (owner avatar, planned ghost, or hand card).
 */
import { useLayoutEffect, useRef } from 'react';

export interface FlipOptions {
  /** Where a tile with no previous position should start from. */
  originFor: (uid: string, prevRects: Map<string, DOMRect>) => DOMRect | null;
  /** Per-tile stagger in ms. */
  delayFor: (uid: string) => number;
  /** Per-tile glide duration in ms. */
  durationFor?: (uid: string) => number;
  /** Bump to force a pass (e.g. state version). */
  version: unknown;
}

export function useFlip(container: React.RefObject<HTMLElement | null>, opts: FlipOptions): void {
  const rects = useRef(new Map<string, DOMRect>());
  const optsRef = useRef(opts);
  optsRef.current = opts;
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, DOMRect>();
    const els = root.querySelectorAll<HTMLElement>('[data-uid]');
    els.forEach((el) => next.set(el.dataset.uid!, el.getBoundingClientRect()));
    if (!reduce) {
      els.forEach((el) => {
        const uid = el.dataset.uid!;
        const rect = next.get(uid)!;
        const prev = rects.current.get(uid) ?? optsRef.current.originFor(uid, rects.current);
        if (!prev) return;
        const dx = prev.left + prev.width / 2 - (rect.left + rect.width / 2);
        const dy = prev.top + prev.height / 2 - (rect.top + rect.height / 2);
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        const scale = Math.max(0.3, Math.min(3, prev.width / rect.width));
        const delay = optsRef.current.delayFor(uid);
        const duration = optsRef.current.durationFor?.(uid) ?? 620;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
        el.style.zIndex = '40';
        el.style.opacity = delay > 0 && !rects.current.has(uid) ? '0' : '1';
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1) ${delay}ms, opacity 120ms linear ${delay}ms`;
            el.style.transform = '';
            el.style.opacity = '1';
            window.setTimeout(() => {
              el.style.transition = '';
              el.style.zIndex = '';
            }, duration + 80 + delay);
          });
        });
      });
    }
    rects.current = next;
  });
}

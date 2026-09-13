/**
 * Pointer-based drag and drop (mouse and touch). Tap behaviour is preserved:
 * a press that moves less than the threshold is a normal click.
 */
import { sfx } from './audio';
import { useCallback, useEffect, useRef, useState } from 'react';

export type DragPayload = { kind: 'card'; cardId: string } | { kind: 'char'; uid: string };

export type DropTarget = { type: 'location'; index: number } | { type: 'inside'; index: number } | { type: 'gates'; index: number } | { type: 'threat'; uid: string } | { type: 'hand' };

export interface DragState {
  payload: DragPayload;
  x: number;
  y: number;
  over: DropTarget | null;
  pointerType: string;
  /** Where the drag started: the ghost flies back here when a drop is refused. */
  from: DOMRect;
  /** The ghost is on its way back to `from`. */
  returning?: boolean;
  /** The ghost is fading where it was dropped (a cancelled drag with nothing to fly). */
  snap?: boolean;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function targetAt(x: number, y: number): DropTarget | null {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const d = (el as HTMLElement).closest?.('[data-drop]') as HTMLElement | null;
    if (!d) continue;
    const type = d.dataset.drop as DropTarget['type'];
    if (type === 'threat') return { type, uid: d.dataset.threat! };
    if (type === 'hand') return { type };
    return { type, index: Number(d.dataset.index) };
  }
  return null;
}

export function targetKey(t: DropTarget | null): string {
  if (!t) return '';
  if (t.type === 'hand') return 'hand';
  return t.type === 'threat' ? `threat:${t.uid}` : `${t.type}:${t.index}`;
}

/**
 * `onDrop` returns false when it refuses the drop: a card ghost then flies back to its slot. The payload is locked at
 * pointerdown and the hand is never re-hit-tested mid-drag. On touch and pen a still press of 500 ms is a hold
 * (`onHold`: read the card) rather than a drag. `onSettle` fires when a drag ends, however it ended.
 */
export function useDrag(onDrop: (payload: DragPayload, target: DropTarget) => boolean | void, enabled: boolean, onBlocked?: () => void, onHold?: (payload: DragPayload) => void, onSettle?: () => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const start = useRef<{ payload: DragPayload; x: number; y: number; dragging: boolean; blocked: boolean; pointerType: string; from: DOMRect; hold?: number } | null>(null);
  const suppress = useRef(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const onBlockedRef = useRef(onBlocked);
  onBlockedRef.current = onBlocked;
  const onHoldRef = useRef(onHold);
  onHoldRef.current = onHold;
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  /** Send the ghost home: flown back over 180 ms for a card, faded for a tile, at once under reduced motion. */
  const flyBack = (s: { payload: DragPayload }) => {
    if (s.payload.kind === 'card' && !reducedMotion()) {
      setDrag((d) => (d ? { ...d, over: null, returning: true } : null));
      window.setTimeout(() => {
        setDrag(null);
        onSettleRef.current?.();
      }, 180);
    } else {
      setDrag((d) => (d ? { ...d, over: null, snap: true } : null));
      window.setTimeout(() => {
        setDrag(null);
        onSettleRef.current?.();
      }, 120);
    }
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      if (!s.dragging) {
        const threshold = s.pointerType === 'mouse' ? 8 : 12;
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < threshold) return;
        if (s.hold) {
          window.clearTimeout(s.hold);
          s.hold = undefined;
        }
        s.dragging = true;
        // Not planning: nothing lifts, the click that would follow the release is swallowed, and the screen says why.
        if (s.blocked) {
          onBlockedRef.current?.();
          return;
        }
        sfx('card.pick');
      }
      if (s.blocked) return;
      e.preventDefault();
      setDrag({ payload: s.payload, x: e.clientX, y: e.clientY, over: targetAt(e.clientX, e.clientY), pointerType: s.pointerType, from: s.from });
    };
    const up = (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (s?.hold) window.clearTimeout(s.hold);
      if (!s?.dragging) return;
      suppress.current = true;
      window.setTimeout(() => (suppress.current = false), 300);
      if (s.blocked) return;
      const t = targetAt(e.clientX, e.clientY);
      const accepted = t ? onDropRef.current(s.payload, t) !== false : false;
      if (accepted) {
        setDrag(null);
        onSettleRef.current?.();
        return;
      }
      flyBack(s);
    };
    const cancel = () => {
      const s = start.current;
      start.current = null;
      if (s?.hold) window.clearTimeout(s.hold);
      if (s?.dragging && !s.blocked) {
        suppress.current = true;
        window.setTimeout(() => (suppress.current = false), 300);
        flyBack(s);
        return;
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);

  /** Cancel a live drag from outside (Escape, right-click): the ghost flies home and the click that follows is swallowed. */
  const cancelDrag = useCallback(() => {
    const s = start.current;
    start.current = null;
    if (s?.hold) window.clearTimeout(s.hold);
    if (!s?.dragging || s.blocked) {
      setDrag(null);
      return;
    }
    suppress.current = true;
    window.setTimeout(() => (suppress.current = false), 300);
    flyBack(s);
  }, []);

  const dragProps = useCallback(
    (payload: DragPayload) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const s = { payload, x: e.clientX, y: e.clientY, dragging: false, blocked: !enabledRef.current, pointerType: e.pointerType, from: (e.currentTarget as HTMLElement).getBoundingClientRect(), hold: undefined as number | undefined };
        start.current = s;
        // Touch and pen: a still press of 500 ms reads the card instead of dragging it.
        if (e.pointerType !== 'mouse' && !s.blocked && onHoldRef.current) {
          s.hold = window.setTimeout(() => {
            if (start.current !== s || s.dragging) return;
            start.current = null;
            suppress.current = true;
            window.setTimeout(() => (suppress.current = false), 300);
            onHoldRef.current?.(payload);
          }, 500);
        }
      },
      onClickCapture: (e: React.MouseEvent) => {
        if (suppress.current) {
          suppress.current = false;
          e.stopPropagation();
          e.preventDefault();
        }
      },
      style: { touchAction: 'none' } as React.CSSProperties,
    }),
    [],
  );

  return { drag, dragProps, cancelDrag };
}

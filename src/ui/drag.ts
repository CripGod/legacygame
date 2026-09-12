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
}

const THRESHOLD = 8;

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

export function useDrag(onDrop: (payload: DragPayload, target: DropTarget) => void, enabled: boolean) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const start = useRef<{ payload: DragPayload; x: number; y: number; dragging: boolean } | null>(null);
  const suppress = useRef(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      if (!s.dragging) {
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < THRESHOLD) return;
        s.dragging = true;
        sfx('card.pick');
      }
      e.preventDefault();
      setDrag({ payload: s.payload, x: e.clientX, y: e.clientY, over: targetAt(e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s?.dragging) return;
      suppress.current = true;
      window.setTimeout(() => (suppress.current = false), 300);
      const t = targetAt(e.clientX, e.clientY);
      setDrag(null);
      if (t) onDropRef.current(s.payload, t);
    };
    const cancel = () => {
      start.current = null;
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

  const dragProps = useCallback(
    (payload: DragPayload) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (!enabled) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        start.current = { payload, x: e.clientX, y: e.clientY, dragging: false };
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
    [enabled],
  );

  return { drag, dragProps };
}

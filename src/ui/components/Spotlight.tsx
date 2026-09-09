import { useEffect, useState } from 'react';

type Box = { x: number; y: number; w: number; h: number; pts?: [number, number][] };

/**
 * Tutorial spotlight: dims the whole screen except the elements the coach is pointing at
 * (anything carrying `.ftue-flash`). Pointer events pass straight through, so drag and tap
 * keep working; the holes track the elements every frame while a tip is showing.
 */
export function Spotlight({ active }: { active: boolean }) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  useEffect(() => {
    if (!active) {
      setBoxes([]);
      return;
    }
    let raf = 0;
    let last = '';
    const measure = () => {
      const next: Box[] = [];
      document.querySelectorAll<HTMLElement>('.ftue-flash').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        // A fanned card is rotated: cut out its real outline, not the box around it. The element's own transform
        // (matrix about its transform-origin) is undone from the measured box to find the untransformed corner.
        const cs = getComputedStyle(el);
        const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const [ox, oy] = cs.transformOrigin.split(' ').map((v) => parseFloat(v) || 0);
        const local = [
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ].map(([x, y]) => {
          const pt = m.transformPoint(new DOMPoint(x - ox, y - oy));
          return [pt.x + ox, pt.y + oy] as [number, number];
        });
        const minX = Math.min(...local.map((c) => c[0]));
        const minY = Math.min(...local.map((c) => c[1]));
        const pts = local.map(([x, y]) => [r.left + (x - minX), r.top + (y - minY)] as [number, number]);
        next.push({ x: r.left, y: r.top, w: r.width, h: r.height, pts });
      });
      const key = next.map((b) => (b.pts ?? [[b.x, b.y], [b.w, b.h]]).map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(';')).join('|');
      if (key !== last) {
        last = key;
        setBoxes(next);
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  if (!active || boxes.length === 0) return null;
  const pad = 8;
  return (
    <svg className="spotlight" aria-hidden width="100%" height="100%">
      <defs>
        <filter id="spot-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <mask id="spot-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
          <rect width="100%" height="100%" fill="#fff" />
          <g filter="url(#spot-soft)">
            {boxes.map((b, i) =>
              b.pts ? (
                <polygon key={i} points={b.pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="#000" stroke="#000" strokeWidth={pad * 2} strokeLinejoin="round" />
              ) : (
                <rect key={i} x={b.x - pad} y={b.y - pad} width={b.w + pad * 2} height={b.h + pad * 2} rx={12} fill="#000" />
              ),
            )}
          </g>
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask="url(#spot-mask)" />
    </svg>
  );
}

/**
 * Ghost flights: a board tile is cloned into a fixed layer over the page and flown from place to place with the
 * Web Animations API, while the real tile sits hidden in its slot. Tiles live inside Location panels that clip and
 * stack, so a tile could never cross the board itself; its ghost can. Used for the clash choreography: the striker
 * charges the victim, the victim is knocked to its new Gates or off the board, the striker comes back.
 */
let layer: HTMLElement | null = null;

function layerEl(): HTMLElement {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'fly-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  return layer;
}

export function centre(r: DOMRect): { x: number; y: number } {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** A ghost: the clone, the rect it was cloned at (its base), and where it is now relative to that base. */
export interface Ghost {
  el: HTMLElement;
  base: DOMRect;
  at: { x: number; y: number; r: number; s: number };
}

const transformOf = (p: { x: number; y: number; r: number; s: number }) => `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg) scale(${p.s})`;

/** A fixed-position clone of a board tile at the tile's current place, carrying the tile's look (border colour, chamfer). */
export function ghostOf(el: Element): Ghost {
  const base = el.getBoundingClientRect();
  const g = el.cloneNode(true) as HTMLElement;
  g.removeAttribute('data-uid');
  g.removeAttribute('data-place');
  g.removeAttribute('data-threat');
  g.removeAttribute('draggable');
  g.classList.add('ghost-fly');
  g.classList.remove('fx-hidden', 'ftue-flash');
  // The clone must not carry the real tile's moment: no focus ring, no wind-up, no flash.
  g.querySelectorAll<HTMLElement>('.pic').forEach((pic) => {
    for (const c of Array.from(pic.classList)) if (c.startsWith('fx-') || c === 'focus') pic.classList.remove(c);
  });
  const cs = getComputedStyle(el);
  for (const p of ['--bc', '--bfill', '--bw', '--chamfer', '--mini', '--mini-h', '--slot']) {
    const v = cs.getPropertyValue(p);
    if (v) g.style.setProperty(p, v);
  }
  Object.assign(g.style, {
    position: 'fixed',
    left: `${base.left}px`,
    top: `${base.top}px`,
    width: `${base.width}px`,
    height: `${base.height}px`,
    margin: '0',
    transform: 'none',
    transition: 'none',
    opacity: '1',
    visibility: 'visible',
    zIndex: '60',
    pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>);
  layerEl().appendChild(g);
  return { el: g, base, at: { x: 0, y: 0, r: 0, s: 1 } };
}

export interface FlightOptions {
  ms: number;
  easing?: string;
  /** Lift at mid-flight in px (a lob), positive = up. */
  arc?: number;
  /** Extra rotation over the flight in degrees; half of it at mid-flight. */
  spin?: number;
  /** Size at mid-flight relative to the tile's base size (1.15 = swells as it comes forward). */
  swell?: number;
  /** Fade out over the flight. */
  fade?: boolean;
  /** Remove the ghost when the flight ends. */
  remove?: boolean;
}

/** Fly a ghost from where it is to `to` (a viewport rect). Resolves when the animation ends; at once without animation support. */
export function fly(g: Ghost, to: DOMRect, opts: FlightOptions): Promise<void> {
  const a = centre(g.base);
  const b = centre(to);
  const end = { x: b.x - a.x, y: b.y - a.y, r: g.at.r + (opts.spin ?? 0), s: g.base.width ? to.width / g.base.width : 1 };
  const mid = { x: (g.at.x + end.x) / 2, y: (g.at.y + end.y) / 2 - (opts.arc ?? 0), r: (g.at.r + end.r) / 2, s: ((g.at.s + end.s) / 2) * (opts.swell ?? 1) };
  const frames: Keyframe[] = [
    { transform: transformOf(g.at), opacity: 1, offset: 0 },
    { transform: transformOf(mid), opacity: opts.fade ? 0.75 : 1, offset: 0.5 },
    { transform: transformOf(end), opacity: opts.fade ? 0 : 1, offset: 1 },
  ];
  g.at = end;
  if (typeof g.el.animate !== 'function') {
    g.el.style.transform = transformOf(end);
    if (opts.remove) g.el.remove();
    return Promise.resolve();
  }
  const anim = g.el.animate(frames, { duration: opts.ms, easing: opts.easing ?? 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' });
  const done = () => {
    if (opts.remove) g.el.remove();
  };
  // A lost `finished` (a hidden tab, a removed node) must never hold the replay: the flight is over when its time is.
  return Promise.race([anim.finished.then(() => undefined, () => undefined), wait(opts.ms * 3 + 400)]).then(done, done);
}

/** The rect `k` of the way from `a` to `b` (0.8: a striker stops just short of the victim, overlapping its edge). */
export function partWay(a: DOMRect, b: DOMRect, k: number): DOMRect {
  const ca = centre(a);
  const cb = centre(b);
  const x = ca.x + (cb.x - ca.x) * k;
  const y = ca.y + (cb.y - ca.y) * k;
  return new DOMRect(x - b.width / 2, y - b.height / 2, b.width, b.height);
}

/** A short shudder in place, on top of wherever the ghost is (the striker holding on impact, the victim taking the hit). */
export function jolt(g: Ghost, ms: number, px = 6): Promise<void> {
  if (typeof g.el.animate !== 'function') return Promise.resolve();
  const frames: Keyframe[] = [
    { transform: 'translate(0px, 0px)', offset: 0 },
    { transform: `translate(${px}px, ${-px * 0.5}px)`, offset: 0.2 },
    { transform: `translate(${-px}px, ${px * 0.5}px)`, offset: 0.4 },
    { transform: `translate(${px * 0.6}px, 0px)`, offset: 0.6 },
    { transform: `translate(${-px * 0.3}px, 0px)`, offset: 0.8 },
    { transform: 'translate(0px, 0px)', offset: 1 },
  ];
  const anim = g.el.animate(frames, { duration: ms, easing: 'linear', composite: 'add' });
  return anim.finished.then(() => undefined, () => undefined);
}

/** Remove every ghost still on the page (a skipped replay, a cancelled beat). */
export function clearGhosts(): void {
  layer?.replaceChildren();
}

export const wait = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

/** Two frames on: React has painted the state set before the call. */
export const painted = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

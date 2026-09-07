/**
 * Lightweight hover/focus tooltip. One fixed-position element for the whole app.
 * Hints are never hover-only: the same text is available by tap in the sheets.
 */
let el: HTMLDivElement | null = null;

function ensure(): HTMLDivElement {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'tip';
  el.setAttribute('role', 'tooltip');
  document.body.appendChild(el);
  return el;
}

export function showTip(target: Element, text: string): void {
  const t = ensure();
  t.textContent = text;
  t.style.display = 'block';
  const r = target.getBoundingClientRect();
  const w = t.offsetWidth;
  const h = t.offsetHeight;
  let x = r.left + r.width / 2 - w / 2;
  x = Math.max(6, Math.min(window.innerWidth - w - 6, x));
  let y = r.top - h - 8;
  if (y < 6) y = r.bottom + 8;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

export function hideTip(): void {
  if (el) el.style.display = 'none';
}

/** Spread onto any element: `<span {...tip('Influence …')}>`. */
export function tip(text: string) {
  return {
    onMouseEnter: (e: React.MouseEvent) => showTip(e.currentTarget, text),
    onMouseLeave: hideTip,
    onFocus: (e: React.FocusEvent) => showTip(e.currentTarget, text),
    onBlur: hideTip,
    'aria-label': text,
  };
}

export const HINTS = {
  influence: 'Influence: how much this Character counts toward controlling its Location. Gate and Inside Characters both count.',
  force: 'Force: strength when confronting Threats or answering a challenge. Force never attacks players directly.',
  dayNight: 'Odd turns are day, even turns are night. At night a Location with a curfew (Sundown Town) lets nobody relocate out until morning. A Curfew Threat holds a Location day and night. Harriet Tubman is the only one who can move a Character out.',
  locked: 'Held here: cannot relocate out. Curfew, a Curfew Threat or The Justice System. Harriet Tubman can still move them.',
  event: 'Event: a one-shot card. Drop it on a Location with an open Gate slot: it works everywhere, and the Location it lands on adds a little more.',
  currentInfluence: 'Influence this Character currently contributes here, including bonuses and penalties.',
  ready: 'Ready: waited a turn at the Gates. Tap to send it Inside this turn.',
  fresh: 'Fresh: arrived this turn. It waits one turn at the Gates before it can enter.',
  blocked: 'Blocked: an effect stops this Character from entering this turn.',
  entering: 'Entering: will move Inside when you Lock It In.',
  moving: 'Relocating: will move to another Location\'s Gates when you Lock It In.',
  confront: 'Confronting a Threat this turn. It cannot enter or relocate.',
  planned: 'Planned: this card will be played here when you Lock It In.',
  scoreA: 'Silverlake Slayer\'s Influence at this Location.',
  scoreB: 'Harborlight\'s Influence at this Location.',
  line: 'The Influence Line: leans toward whoever leads. Lead at two of three Locations after the final turn to win.',
  energy: 'Energy: the crystals up here are what you can spend on cards this turn. You get one more each turn (Turn 3 = 3), Organizer adds one, and unspent Energy does not carry over. Lit crystals are still unspent; dim ones are spent; hollow ones come on later turns.',
  cost: 'Cost: the Energy this card takes to play. Energy equals the turn number, so expensive cards wait for later turns, unless something brings the price down: a green cost means a discount is on right now.',
  stakes: 'Legacy: what the match is worth. Stand on Business doubles it (1 → 2 → 4) one turn later, adds an 8th turn, and means you cannot Sit Down. The other side gets one turn to Sit Down at the old price.',
  stakesPending: 'Someone Stood on Business. The raise lands after this turn: Sit Down now to lose only the current Legacy.',
  timer: 'Planning timer. At zero your current plan locks automatically.',
  noStepOff: 'You Stood on Business. There is no backing out of this match.',
  directEntry: 'Direct Entry: may go Inside the turn it is played. Tap ⇅ on the planned move to choose Gates or Inside.',
};

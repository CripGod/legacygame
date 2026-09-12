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
  influence: 'Influence: how much this Character counts toward controlling its Location. Gate Characters count; Established Characters (Inside) count +1 more.',
  force: 'Force: strength when confronting Threats or answering a challenge. Force never attacks players directly.',
  webbed: "Webbed: Anansi retold this Location into a random one not in the match and spun his web over it. Characters that cost 1 or less gain +2 Influence here; 3 or more lose 1. Both players.",
  lastWord: 'THE LAST WORD: the ninth turn, here only because somebody stood on business. Both sides get 10 Energy and an extra card. Whatever stands after this turn is the legacy.',
  rebuilt: 'Rebuilt: this Location was Lost, and the people who stayed put it back up. It is back in play, and everyone who stayed gained +1 Influence.',
  finalTurn: 'Last scheduled turn. A Stand on Business now adds a 9th turn; otherwise whatever stands after this one is counted: two Locations of three, then total Influence, then total Force.',
  dayNight: 'This Location has a curfew. Odd turns are day, even turns are night: at night nobody relocates out until morning. Harriet Tubman is the only one who can move a Character out.',
  locked: 'Held here: cannot relocate out. A curfew at night, or The Justice System. Harriet Tubman can still move them.',
  informant: 'Informant: a Character played onto the other side\'s Gates. It is theirs, its Influence counts against them there, it never becomes Ready and never enters. Relocate it, slide it with Robert Smalls, or dump it at Charleston, 1822, where it is found out and sent back to the planter\'s hand. Or find it out yourself: David Ruggles and Lewis Hayden send it back to the planter\'s hand, William Parker has it arrested, and William Still, Established there, writes it down so it counts 0.',
  event: 'Event: a one-shot card, and a deck carries at most two. Drop it on a Location: it goes in the purple Event slot beside your Gates (one per Location per turn), works everywhere, and the Location it lands on adds a little more.',
  currentInfluence: 'Influence this Character currently contributes here, including bonuses and penalties.',
  home: 'Home ground: this is where the story happened, so the Character counts +1 Influence here.',
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
  stakes: 'Legacy: what the match is worth. Stand on Business doubles it (1 → 2 → 4) one turn later, adds a 9th turn, and means you cannot Sit Down. The other side gets one turn to Sit Down at the old price.',
  stakesPending: 'Someone Stood on Business. The raise lands after this turn: Sit Down now to lose only the current Legacy.',
  timer: 'Planning timer. At zero your current plan locks automatically.',
  noStepOff: 'You Stood on Business. There is no backing out of this match.',
  directEntry: 'Direct Entry: may go Inside the turn it is played. Tap ⇅ on the planned move to choose Gates or Inside.',
};

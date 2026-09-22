import { sfx } from '../audio';
import { useEffect, useState, type ReactNode } from 'react';
import type { GameEvent } from '../../engine';
import {
  isNight,
  CARD_BY_ID,
  LOCATION_BY_ID,
  THREAT_BY_ID,
  confrontForce,
  threatForceNeeded,
  charsAt,
  legalOptions,
  locDef,
  other,
  type GameState,
  type PlayerId,
  type TurnPlan,
  isProtected,
  shielded,
} from '../../engine';
import { cardName, initials, locationName, threatLabel, useDisplay, spawnText } from '../display';
import { RECONSTRUCTION_TURNS } from '../../engine/types';
import { CardFace } from './CardFace';
import { CodexSheet } from './CodexSheet';
import { HINTS } from '../tip';
import { Stage } from './Stage';
import { tip } from '../tip';
import { Art } from './Art';
import { SkyTag } from './Sky';

export function Sheet({ children, onClose, title }: { children: ReactNode; onClose: () => void; title?: string }) {
  useEffect(() => {
    sfx('sheet.open');
    return () => sfx('sheet.close');
  }, []);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>{title ?? ''}</h3>
          <button className="small ghost close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Inspect a hand card: the card alone, with its History. Playing it is a drag (tap, then tap a Location, stays as the accessibility path). */
export function CardSheet({
  id,
  onClose,
  extra,
  actions,
}: {
  id: string;
  onClose: () => void;
  /** A live readout for cards that track the match (Reparations: what it would pay right now). */
  extra?: React.ReactNode;
  /** While the card stands in the hand: "Play at …" buttons and "Put back", the no-drag way to commit. Shown only in assist mode (src/ui/assist.ts, docs/accessibility.md). */
  actions?: React.ReactNode;
}) {
  return (
    <CodexSheet id={id} label="In hand" onClose={onClose} flat>
      {actions || extra ? (
        <>
          {actions}
          {extra}
        </>
      ) : undefined}
    </CodexSheet>
  );
}

/** Inspect a Character on the board: the card alone, with its History. Moving it is a drag. */
export function CharSheet({ view, uid, onClose }: { view: GameState; uid: string; onClose: () => void }) {
  const c = view.characters[uid];
  if (!c) return null;
  // The piece's standing on the board: under protection (the veil on its tile), shielded from Reveals, or neither.
  const guarded = isProtected(view, c);
  const shield = !guarded && shielded(view, c);
  const status = guarded || shield ? (
    <div className="cx-chips cx-status">
      {guarded && <span className="cx-chip cx-shield">🛡 {HINTS.protected}</span>}
      {shield && <span className="cx-chip cx-shield">🛡 {HINTS.shielded}</span>}
    </div>
  ) : undefined;
  return <CodexSheet id={c.defId} label={view.players[c.owner].handle} onClose={onClose} flat status={status} />;
}

/** A Threat on the board: its plate on the dark stage, the story beside it, and what you can send against it in the tray. */
export function ThreatSheet({
  view,
  me,
  threatUid,
  plan,
  locked,
  onClose,
  onToggle,
}: {
  view: GameState;
  me: PlayerId;
  threatUid: string;
  plan: TurnPlan;
  locked: boolean;
  onClose: () => void;
  onToggle: (uid: string, threatUid: string) => void;
}) {
  const { placeholders } = useDisplay();
  const loc = view.locations.find((l) => l.threats.some((t) => t.uid === threatUid));
  const t = loc?.threats.find((x) => x.uid === threatUid);
  if (!loc || !t) return null;
  const def = THREAT_BY_ID[t.defId];
  const name = threatLabel(t.defId, placeholders);
  const where = locationName(locDef(view, loc.index).id, placeholders);
  const opt = legalOptions(view, me).confronts.find((c) => c.threatUid === threatUid);
  const committed = plan.confronts.filter((c) => c.threatUid === threatUid);
  const total = committed.reduce((s, c) => s + confrontForce(view, view.characters[c.uid], t), 0);
  const busy = new Set([...plan.enters, ...plan.relocations.map((r) => r.uid), ...plan.confronts.filter((c) => c.threatUid !== threatUid).map((c) => c.uid)]);
  const family = def.family === 'Systemic Pressure' ? 'systemic' : def.family === 'Complicit Beneficiary' || def.family === 'Collaborator' ? 'complicit' : def.family === 'Crisis' ? 'crisis' : '';
  const standing = t.spawnedTurn !== undefined ? view.turn - t.spawnedTurn : 0;
  const panel = (
    <div className={`cx-plate is-threat ${family}`}>
      <div className="cx-plate-art square">
        {placeholders ? <span className="cx-plate-ini">{initials(t.defId, true)}</span> : <Art kind="threats" id={t.defId} className="cx-plate-img" fallback={<span className="cx-plate-ini">{initials(t.defId, false)}</span>} alt={name} />}
        <span className="cx-plate-orb" {...tip('Force it takes to neutralize, in one turn.')}>{threatForceNeeded(view, t)}</span>
      </div>
    </div>
  );
  const info = (
    <div className="cx-info">
      <div className="cx-plate-meta">
        {!placeholders && <span className={`cx-family ${family}`}>{def.family}</span>}
        <span className="cx-plate-where">at {where}{t.target ? ` · hunting ${view.players[t.target].handle}` : ''}</span>
      </div>
      <p>{def.text}</p>
      <div className="cx-stats">
        <span className="cx-stat">Needs <b>{def.requiresBoth ? 'at least 1 Force from each player in the same turn' : `${threatForceNeeded(view, t)} Force in one turn`}</b></span>
        {def.lostAfterTurns && <span className="cx-chip warn">{Math.max(0, def.lostAfterTurns - standing)} turn{def.lostAfterTurns - standing === 1 ? '' : 's'} until the Location is Lost</span>}
        {def.firesAfterTurns && <span className="cx-chip warn">Comes down in {Math.max(0, def.firesAfterTurns - standing)} turn{def.firesAfterTurns - standing === 1 ? '' : 's'}</span>}
        {def.window && <span className="cx-chip warn">Office open {Math.max(0, def.window - standing)} more turn{def.window - standing === 1 ? '' : 's'}</span>}
        {def.split && <span className="cx-chip">One per player</span>}
      </div>
      {!placeholders && <p className="cx-info-blurb">{def.blurb}</p>}
    </div>
  );
  return (
    <Stage name={name} label={`Threat · ${where}`} onClose={onClose} flat panel={panel} info={info} history={placeholders ? undefined : def.history} refsId={placeholders ? undefined : t.defId}>
      {opt && !locked && view.phase === 'planning' ? (
        <>
          <div className="cx-tray-lbl">{opt.assist ? 'Assist? This Threat hunts your opponent' : 'Confront with'}</div>
          {opt.chars.map((uid) => {
            const c = view.characters[uid];
            const on = committed.some((x) => x.uid === uid);
            const f = confrontForce(view, c, t);
            return (
              <div key={uid} className={`option ${on ? 'on' : ''}`}>
                <span>
                  {cardName(c.defId, placeholders)} <span className="muted">({c.zone === 'gate' ? 'Gates' : 'Inside'}) · Force {f}</span>
                </span>
                <button className={`small ${on ? 'primary' : ''}`} disabled={busy.has(uid)} onClick={() => onToggle(uid, threatUid)}>
                  {on ? (opt.assist ? 'Yes ✓' : 'Committed ✓') : opt.assist ? 'Yes' : 'Confront'}
                </button>
              </div>
            );
          })}
          <div className="muted">
            Committed Force: {total}
            {def.requiresBoth ? '' : ` / ${threatForceNeeded(view, t)}`} · confronting Characters cannot enter or relocate this turn.
            {opt.assist ? ' Assisting earns Solidarity (cosmetic).' : ''}
          </div>
        </>
      ) : (
        <div className="muted center">{opt ? 'Plans are locked.' : 'You have no eligible Characters here.'}</div>
      )}
    </Stage>
  );
}

/** A Location: its plate on the dark stage (the painting, the rule, what stands over it), the story beside it, and the Influence sum in the tray. */
export function LocationSheet({ view, index, onClose }: { view: GameState; index: number; onClose: () => void }) {
  const { placeholders } = useDisplay();
  const loc = view.locations[index];
  const me = view.viewFor ?? 'A';
  const known = view.players[me].knownNextReveal;
  const foretold = !loc.revealed && known === index && loc.defId !== 'unknown';
  const shown = loc.revealed || foretold;
  const def = LOCATION_BY_ID[shown ? loc.defId : 'unknown'];
  const name = loc.revealed ? locationName(def.id, placeholders) : foretold ? `${locationName(def.id, placeholders)} (opens next)` : `Location ${index + 1} (hidden)`;
  const night = !!def.curfew && isNight(view);
  const region = def.region === 'americas' ? 'The Americas' : def.region === 'africa' ? 'Africa' : def.region ? 'The Atlantic' : '';
  const panel = (
    <div className={`cx-plate is-location ${loc.lost ? 'lost' : ''}`}>
      <div className="cx-plate-art wide">
        {shown && !placeholders ? (
          night ? (
            <Art kind="locations" id={`${def.id}_night`} className="cx-plate-img" fallback={<Art kind="locations" id={def.id} className="cx-plate-img" fallback={<span className="cx-plate-ini">{def.name}</span>} alt={def.name} />} alt={`${def.name} at night`} />
          ) : (
            <Art kind="locations" id={def.id} className="cx-plate-img" fallback={<span className="cx-plate-ini">{def.name}</span>} alt={def.name} />
          )
        ) : (
          <span className="cx-plate-ini">{shown ? initials(def.id, true) : '?'}</span>
        )}
        {def.curfew && shown && <span className="cx-plate-sky"><SkyTag night={night} /></span>}
      </div>
    </div>
  );
  const info = (
    <div className="cx-info">
      {shown && !placeholders && (def.era || region) && (
        <div className="cx-plate-meta">
          {def.era && <span>{def.era}</span>}
          {region && <span className="cx-plate-where">{region}</span>}
        </div>
      )}
      <p>{def.rule}</p>
      {shown && !placeholders && <p className="cx-info-blurb">{def.blurb}</p>}
      <div className="cx-stats">
        {!loc.revealed && known === index && <span className="cx-chip">✦ Dunbar: {foretold ? 'opens here' : 'this Location opens'} at the end of next turn. Only you know.</span>}
        {loc.revealed && def.transformsInto && loc.revealedTurn !== undefined && <span className="cx-chip">⛵ Arrives in {Math.max(0, loc.revealedTurn + def.transformsInto.afterTurns - view.turn)} turn(s) as {LOCATION_BY_ID[def.transformsInto.id]?.name}</span>}
        {loc.lost && <span className="cx-chip warn">LOST: {loc.lostReason ?? 'an unresolved crisis.'} Nobody can win here; its Influence no longer counts. The people who stayed rebuild it in {RECONSTRUCTION_TURNS} turns.</span>}
        {loc.webbed && <span className="cx-chip">🕸 Webbed: Anansi retold {loc.retoldFrom ? LOCATION_BY_ID[loc.retoldFrom]?.name ?? 'this place' : 'this place'} into {def.name}. Cost 1 or less: +2 Influence; 3 or more: −1.</span>}
        {!loc.lost && loc.rebuilt && <span className="cx-chip good">🔨 Rebuilt on Turn {loc.rebuiltTurn}: back in play, everyone who stayed +1 Influence</span>}
      </div>
    </div>
  );
  return (
    <Stage name={name} label="Location" onClose={onClose} flat panel={panel} info={info} history={shown && !placeholders ? def.history : undefined} refsId={shown && !placeholders && def.id !== 'unknown' ? def.id : undefined} />
  );
}

/** Harriet Tubman's Reveal needs a friendly Gate Character and a destination. */

export function ProfileSheet({ view, p, me, onClose, peek }: { view: GameState; p: PlayerId; me: PlayerId; onClose: () => void; /** Omar ibn Said's last look at this player's hand. */ peek?: { turn: number; cards: string[]; by: string } }) {
  const { placeholders } = useDisplay();
  const ps = view.players[p];
  const av = CARD_BY_ID[ps.avatarDefId];
  return (
    <Sheet onClose={onClose} title={ps.handle}>
      <div className="muted">Avatar: {av ? cardName(av.id, placeholders) : '—'} (cosmetic)</div>
      <table className="stats">
        <tbody>
          <tr>
            <td>Cards in hand</td>
            <td>{ps.hand.length}</td>
          </tr>
          <tr>
            <td>Cards in deck</td>
            <td>{ps.deckCount}</td>
          </tr>
          <tr>
            <td>Discarded</td>
            <td>{ps.discard.length ? ps.discard.map((id) => cardName(id, placeholders)).join(', ') : '—'}</td>
          </tr>
          <tr>
            <td>Setbacks (neutral)</td>
            <td>{ps.setbacks}</td>
          </tr>
          <tr>
            <td>Solidarity</td>
            <td>{ps.solidarity}</td>
          </tr>
          <tr>
            <td>Stand on Business</td>
            <td>{ps.standUsed ? 'used' : 'available'}</td>
          </tr>
        </tbody>
      </table>
      {p === me && ps.hand.length > 0 && (
        <div className="muted">Your hand: {ps.hand.map((id) => cardName(id, placeholders)).join(', ')}</div>
      )}
      {p !== me && peek && (
        <>
          <div className="muted">
            {peek.by} read the room on turn {peek.turn}: {peek.cards.length ? `${ps.handle} was holding ${peek.cards.length} card${peek.cards.length > 1 ? 's' : ''}. They draw one each turn.` : `${ps.handle} was holding nothing.`}
          </div>
          <div className="card-grid">
            {peek.cards.map((id, i) => (
              <CardFace key={`${id}-${i}`} id={id} />
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

export function LogSheet({ events, turn, onClose }: { events: GameEvent[]; turn: number; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} title={`Turn ${turn}, step by step`}>
      {events.length === 0 && <div className="muted">Nothing has happened yet.</div>}
      <div className="log">
        {events.map((e, i) => (
          <div key={i} className={`log-line ${e.type}`}>
            {e.text}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function ChatSheet({ onClose, emotes, onEmote, summonable, onSummon, chat }: { onClose: () => void; emotes: string[]; onEmote: (t: string) => void; summonable: { index: number; label: string }[]; onSummon: (i: number) => void; chat: { from: string; text: string }[] }) {
  return (
    <Sheet onClose={onClose} title="Quick chat">
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontWeight: 800 }}>Summon?</div>
        <div className="muted">Call the other side to a joint Summon at a Location with a Threat. If you both commit and reach 6 Force together, Obatala manifests there for everyone.</div>
        <div className="actions">
          {summonable.map((s) => (
            <button key={s.index} className="primary" onClick={() => onSummon(s.index)}>
              Summon at {s.label}?
            </button>
          ))}
          {summonable.length === 0 && <span className="muted">No Location qualifies right now (you need a Character at a Location with a Threat, and no Summon already planned).</span>}
        </div>
      </div>
      <div className="actions">
        {emotes.map((e) => (
          <button key={e} onClick={() => onEmote(e)}>
            {e}
          </button>
        ))}
      </div>
      {chat.length > 0 && (
        <div className="log">
          {chat.slice(-8).map((c, i) => (
            <div key={i} className="log-line">
              <b>{c.from}:</b> {c.text}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** Fanfare for a Gathering that just arrived. */
export function SpawnSheet({ ev, view, me, onClose }: { ev: GameEvent; view: GameState; me: PlayerId; onClose: () => void }) {
  const def = CARD_BY_ID[ev.cardId ?? ''] as { name?: string; blurb?: string; spawn?: { headline: string; cta: string } } | undefined;
  if (!def || ev.player === undefined) return null;
  const mine = ev.player === me;
  const loc = ev.location !== undefined ? view.locations[ev.location] : undefined;
  const zone = (ev.data as { zone?: string } | undefined)?.zone;
  return (
    <div className="scrim">
      <div className="sheet fanfare">
        <div className={`stand-title ${mine ? 'pA' : 'pB'}`}>{def.name?.toUpperCase()}</div>
        <div className="center">{def.spawn?.headline}</div>
        {(def as { spawn?: Parameters<typeof spawnText>[0] }).spawn && <div className="showdown-rule beat center">{mine ? 'Yours now. ' : 'Theirs. '}{spawnText((def as { spawn: Parameters<typeof spawnText>[0] }).spawn).replace('Not in any deck. ', '')}</div>}
        <div className="row" style={{ justifyContent: 'center' }}>
          <CardFace id={ev.cardId!} big />
        </div>
        <div className="center muted">
          {zone === 'hand'
            ? 'It is in your hand now. It costs nothing. Play it when you want to know what is coming.'
            : `${mine ? 'Yours.' : `${view.players[ev.player].handle}'s.`} It is ${zone === 'inside' ? 'Established' : 'Ready at the Gates'} at ${loc ? locationName(loc.defId, false) : 'a Location'} and plays like any Character from now on.`}
        </div>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={onClose} autoFocus>
            {mine ? def.spawn?.cta ?? 'Continue' : 'Noted'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmSheet({ title, body, confirmLabel, danger, onConfirm, onClose }: { title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} title={title}>
      <div>{body}</div>
      <div className="actions">
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
        <button className={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}


/** What the Ancestors see coming: hidden Locations, timed Threats, transformations, closing Threats, a raise, the turns left. */
export function ancestorsDangers(view: GameState, me: PlayerId, placeholders: boolean): string[] {
  const opp = other(me);
  const locLabel = (i: number) => (view.locations[i].revealed ? locationName(view.locations[i].defId, placeholders) : `Location ${i + 1}`);
  const dangers: string[] = [];
  for (const l of view.locations) {
    if (!l.revealed) {
      dangers.push(`${locLabel(l.index)} is still hidden.`);
      continue;
    }
    const def = LOCATION_BY_ID[l.defId];
    if (def?.timedThreat && view.turn < def.timedThreat.turn) dangers.push(`${def.name}: ${THREAT_BY_ID[def.timedThreat.threatId]?.name ?? 'a Threat'} arrives on Turn ${def.timedThreat.turn}.`);
    if (def?.transformsInto && l.revealedTurn !== undefined) {
      const left = l.revealedTurn + def.transformsInto.afterTurns - view.turn;
      if (left > 0) dangers.push(`${def.name} becomes ${LOCATION_BY_ID[def.transformsInto.id]?.name ?? 'something else'} in ${left} turn${left > 1 ? 's' : ''}.`);
    }
    for (const t of l.threats) {
      const td = THREAT_BY_ID[t.defId];
      if (td?.firesAfterTurns && !l.lost) {
        const fires = t.spawnedTurn + td.firesAfterTurns - 1;
        dangers.push(`${def?.name ?? locLabel(l.index)}: ${td.name} comes down at the end of Turn ${fires}: everyone here, both sides, is turned out to open Gates elsewhere unless ${t.forceRequired} Force stops it in one turn. Protected Characters stay.`);
      }
      if (td?.window && !l.lost) {
        const closes = t.spawnedTurn + td.window - 1;
        dangers.push(view.turn <= closes ? `${def?.name ?? locLabel(l.index)}: ${td.name} closes at the end of Turn ${closes}. Hold two Inside by then to prove up, or ${t.forceRequired} Force clears it; the Inside shrinks by a seat each turn until then.` : `${def?.name ?? locLabel(l.index)}: ${td.name} has closed. Nobody enters until ${t.forceRequired} Force clears it in one turn.`);
      }
      if (td?.lostAfterTurns && !l.lost) dangers.push(`${def?.name ?? locLabel(l.index)}: ${td.name} closes the Location at the end of Turn ${t.spawnedTurn + td.lostAfterTurns - 1} unless ${t.forceRequired} Force answers it in one turn.`);
    }
  }
  if (view.pendingRaises.some((r) => r.by === opp)) dangers.push(`${view.players[opp].handle} Stood on Business: the Legacy doubles after this turn.`);
  if (view.turn >= 3 && view.turn < view.maxTurns) dangers.push(`${view.maxTurns - view.turn} turn${view.maxTurns - view.turn > 1 ? 's' : ''} remain after this one.`);
  return dangers;
}

/** A confrontation replayed as a showdown: fighters on one side, the Threat on the other, and a plain-words account of why it broke or held. */
/** The showdown's one-sentence why, as the board's banner tells it (and the sheet before it). */
export type ShowdownData = { threatUid: string; defId: string; needed: number; requiresBoth: boolean; force: { A: number; B: number }; fighters: { uid: string; defId: string; owner: PlayerId; force: number }[]; cleared: boolean };
export function showdownWhy(d: ShowdownData, view: GameState, placeholders: boolean): string {
  const total = d.force.A + d.force.B;
  const handle = (p: PlayerId) => view.players[p].handle;
  const names = (p: PlayerId) =>
    d.fighters
      .filter((f) => f.owner === p)
      .map((f) => `${cardName(f.defId, placeholders)} ${f.force}`)
      .join(', ');
  const tname = threatLabel(d.defId, placeholders);
  if (d.requiresBoth) {
    const showedA = d.force.A > 0;
    if (d.cleared) return `${tname} only breaks when both players confront it in the same turn. Both did: ${handle('A')} sent ${names('A')} and ${handle('B')} sent ${names('B')}.`;
    const who: PlayerId = showedA ? 'A' : 'B';
    return `${tname} only breaks when both players confront it in the same turn. ${handle(who)} showed up (${names(who)}) but ${handle(other(who))} sent nobody. Force does not carry over.`;
  }
  const parts = (['A', 'B'] as PlayerId[]).filter((p) => d.force[p] > 0).map((p) => `${handle(p)}: ${names(p)}`);
  if (d.cleared) return `It needed ${d.needed} Force in one turn and got ${total}. ${parts.join('. ')}.`;
  return `It needed ${d.needed} Force in one turn and only got ${total} (${parts.join('; ')}). Force does not carry over: next time commit ${d.needed - total} more, from either side or both.`;
}

export function ShowdownSheet({ ev, view, me, onClose }: { ev: GameEvent; view: GameState; me: PlayerId; onClose: () => void }) {
  const [dap] = useState(() => Math.floor(Math.random() * DAP.length));
  const { placeholders } = useDisplay();
  const d = ev.data as { threatUid: string; defId: string; needed: number; requiresBoth: boolean; force: { A: number; B: number }; fighters: { uid: string; defId: string; owner: PlayerId; force: number }[]; cleared: boolean };
  const tdef = THREAT_BY_ID[d.defId];
  const total = d.force.A + d.force.B;
  const pct = Math.min(100, Math.round((total / Math.max(1, d.needed)) * 100));
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 200);
    const t2 = setTimeout(() => setStage(2), 1300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  const loc = ev.location !== undefined ? view.locations[ev.location] : undefined;
  const handle = (p: PlayerId) => view.players[p].handle;
  const names = (p: PlayerId) =>
    d.fighters
      .filter((f) => f.owner === p)
      .map((f) => `${cardName(f.defId, placeholders)} ${f.force}`)
      .join(', ');
  const tname = threatLabel(d.defId, placeholders);
  let why: string;
  if (d.requiresBoth) {
    const showedA = d.force.A > 0;
    if (d.cleared) why = `${tname} only breaks when both players confront it in the same turn. Both did: ${handle('A')} sent ${names('A')} and ${handle('B')} sent ${names('B')}.`;
    else {
      const who: PlayerId = showedA ? 'A' : 'B';
      why = `${tname} only breaks when both players confront it in the same turn. ${handle(who)} showed up (${names(who)}) but ${handle(other(who))} sent nobody, so nothing happened. Force does not carry over: both sides have to commit on the same turn.`;
    }
  } else if (d.cleared) {
    const parts = (['A', 'B'] as PlayerId[]).filter((p) => d.force[p] > 0).map((p) => `${handle(p)}: ${names(p)}`);
    why = `It needed ${d.needed} Force in one turn and got ${total}. ${parts.join('. ')}.`;
  } else {
    const parts = (['A', 'B'] as PlayerId[]).filter((p) => d.force[p] > 0).map((p) => `${handle(p)}: ${names(p)}`);
    why = `It needed ${d.needed} Force in one turn and only got ${total} (${parts.join('; ')}). Force does not carry over between turns: next time commit ${d.needed - total} more, from either side or both together.`;
  }
  return (
    <div className="scrim">
      <div className={`sheet fanfare showdown ${d.cleared ? 'win' : 'hold'}`}>
        <div className="stand-title">SHOWDOWN</div>
        <div className="center muted">{loc ? locationName(loc.defId, placeholders) : ''}</div>
        <div className="showdown-row">
          <div className="showdown-side fighters">
            {d.fighters.map((f) => (
              <div key={f.uid} className={`fighter p${f.owner}`} title={cardName(f.defId, placeholders)}>
                <div className="fighter-pic">{placeholders ? <span className="ini">{initials(f.defId, true)}</span> : <Art kind="characters" id={f.defId} className="fighter-img" fallback={<span className="ini">{initials(f.defId, false)}</span>} alt={cardName(f.defId, placeholders)} />}</div>
                <b>{f.force}</b>
                <small>{cardName(f.defId, placeholders)}</small>
              </div>
            ))}
          </div>
          <div className="showdown-vs">VS</div>
          <div className="showdown-side threat-side">
            <div className={`fighter-pic big ${d.cleared && stage >= 2 ? 'neutralized' : ''}`}>
              {placeholders ? <span className="ini">{initials(d.defId, true)}</span> : <Art kind="threats" id={d.defId} className="fighter-img" fallback={<span className="ini">{initials(d.defId, false)}</span>} alt={tdef?.name} />}
              {d.cleared && stage >= 2 && <div className="stamp big">Neutralized</div>}
            </div>
            <b>{d.requiresBoth ? 'both' : d.needed}</b>
            <small>{d.requiresBoth ? 'needs both players' : `needs ${d.needed} Force`}</small>
          </div>
        </div>
        <div className="center" style={{ fontWeight: 800 }}>{tname}</div>
        {d.requiresBoth ? (
          <div className="force-bar split">
            {(['A', 'B'] as PlayerId[]).map((p) => (
              <div key={p} className={`force-half p${p} ${stage >= 1 && d.force[p] > 0 ? 'on' : ''}`}>
                {handle(p)} {d.force[p] > 0 ? `${d.force[p]} Force` : 'nobody'}
              </div>
            ))}
          </div>
        ) : (
          <div className="force-bar">
            <div className="force-fill" style={{ width: stage >= 1 ? `${pct}%` : '0%' }} />
            <span className="force-label">
              {total} / {d.needed} Force
            </span>
          </div>
        )}
        <div className={`verdict ${stage >= 2 ? 'show' : ''}`}>{d.cleared ? 'NEUTRALIZED' : 'IT HOLDS'}</div>
        <div className="showdown-why">{why}</div>
        {!d.cleared && tdef && <div className="showdown-rule muted">While it stands: {tdef.text}</div>}
        {!d.cleared && tdef && ev.location !== undefined && <div className="showdown-rule beat">{adviceFor(view, me, { kind: 'threat', id: d.defId }, 'held', ev.location, placeholders)}</div>}
        <div className="actions" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={onClose} autoFocus>
            {d.cleared && d.force[me] === 0 && d.force[other(me)] > 0 ? DAP[dap] : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The other player handled a Threat on their own: close the sheet with some love. */
const DAP = ['High five', 'Fist bump', "Give 'em some skin", 'Firm handshake', 'Dap', 'Salute', 'Tip of the hat', 'Much respect'];

/** Omar ibn Said: the opponent's hand, laid out. */
export function PeekHandSheet({ cards, by, opponent, onClose }: { cards: string[]; by: string; opponent: string; onClose: () => void }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3>{by} reads the room</h3>
          <button className="close small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="muted">{cards.length ? `${opponent} is holding ${cards.length} card${cards.length > 1 ? 's' : ''}. They still draw one each turn.` : `${opponent} is holding nothing.`}</div>
        <div className="card-grid">
          {cards.map((id, i) => (
            <CardFace key={`${id}-${i}`} id={id} />
          ))}
        </div>
        <div className="actions">
          <button className="primary" onClick={onClose}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}


/** One line of advice computed from the board: what it takes, and where you stand. No hand-holding. */
export function adviceFor(view: GameState, me: PlayerId, actor: { kind: 'character' | 'threat' | 'location' | 'event'; id: string; force?: number }, _outcome: string, location: number, placeholders: boolean): string {
  const nm = (id: string) => cardName(id, placeholders);
  const locName = locationName(view.locations[location].revealed ? view.locations[location].defId : 'unknown', placeholders);
  if (actor.kind === 'threat') {
    const t = view.locations[location].threats.find((x) => x.defId === actor.id);
    const tdef = THREAT_BY_ID[actor.id];
    if (!t || !tdef) return '';
    const need = threatForceNeeded(view, t);
    const mine = charsAt(view, location, me).map((c) => ({ c, f: confrontForce(view, c, t) })).filter((x) => x.f > 0);
    const have = mine.reduce((sum, x) => sum + x.f, 0);
    const names = mine.map((x) => `${nm(x.c.defId)} (${x.f})`).join(' + ');
    if (tdef.requiresBoth) return `It only breaks if both players confront it in the same turn.`;
    if (have >= need) return `${names} give you ${have} Force at ${locName}; it needs ${need}.`;
    return mine.length ? `${names} give${mine.length > 1 ? '' : 's'} you ${have} of ${need} Force at ${locName}; you need ${need - have} more.` : `It needs ${need} Force in one turn at ${locName}; you have nobody there.`;
  }
  if (actor.kind === 'location') {
    const fresh = charsAt(view, location, me, 'gate').filter((c) => !c.ready && !(CARD_BY_ID[c.defId] as { keywords?: string[] } | undefined)?.keywords?.includes('INFORMANT'));
    if (LOCATION_BY_ID[actor.id]?.effect.type === 'turncoatAtEnd') {
      return fresh.length ? `At the end of next turn the lowest Waiting Gate Character here changes sides again. ${fresh.map((c) => nm(c.defId)).join(' and ')} ${fresh.length > 1 ? 'are' : 'is'} Waiting at ${locName}: send them Inside or move them, or keep something lower beside them.` : `Anything Waiting at the Gates of ${locName} at the end of a turn is at risk; the lowest Influence goes.`;
    }
    return fresh.length ? `${fresh.map((c) => nm(c.defId)).join(' and ')} will be run out too unless they enter or move.` : '';
  }
  if (actor.kind === 'event') {
    const exposed = charsAt(view, location, me, 'gate');
    return exposed.length ? `${exposed.map((c) => nm(c.defId)).join(' and ')} at the Gates of ${locName} can be taken the same way.` : '';
  }
  const def = CARD_BY_ID[actor.id];
  const eff = def?.kind === 'character' ? def.reveal?.effect.type : undefined;
  const force = actor.force ?? 0;
  switch (eff) {
    case 'challengeGate':
    case 'challengeAllGates':
      return `${nm(actor.id)} has ${force} Force: a Gate Character with ${force} or more holds ${eff === 'challengeGate' ? 'her' : 'him'} off.`;
    case 'challengeInside':
      return `${nm(actor.id)} has ${force} Force: an Established Character with ${force} or more holds him off.`;
    case 'challengeAllInside':
      return `${nm(actor.id)} has ${force} Force: every Established Character with ${force} or more keeps its seat.`;
    case 'siegeInside':
      return 'The siege does not lift. Only protection stops it.';
    case 'foundOut':
      return (def?.kind === 'character' ? (def.reveal?.effect as { mode?: string } | undefined)?.mode : undefined) === 'amnesty'
        ? 'No Force check. The Informant stays, Waiting, and is yours from now on: its Influence counts for you and it can go Inside.'
        : 'No Force check: an Informant at your own Gates has no protection from you.';
    case 'displaceOpposingGate':
      return 'No Force check. Only protection stops her.';
    case 'blockOneOpposingGate':
    case 'blockOpposingGatesHere':
      return 'Blocked Characters can try again next turn.';
    case 'suppressInside':
      return 'It wears off at the end of next turn.';
    case 'refreshOpposingGate':
      return 'They are Ready again next turn.';
    case 'hexGate': {
      const exposed = charsAt(view, location, me, 'gate');
      return exposed.length ? `Gris-gris does not wear off. ${exposed.map((c) => nm(c.defId)).join(' and ')} at the Gates of ${locName} could be next.` : 'Gris-gris does not wear off.';
    }
    default:
      return '';
  }
}

/** A Character knocks, blocks, holds off or turns another: the beat that explains the tally. */
/** The verdict of a clash, as stamped on the board and titled on the Clash card. */
export const CLASH_TITLES: Record<'displaced' | 'held' | 'blocked' | 'sentBack' | 'suppressed' | 'turned' | 'tricked' | 'rose' | 'hexed' | 'defected' | 'exposed' | 'arrested' | 'amnestied' | 'perished', string> = {
  displaced: 'BANISHED',
  held: 'HOLDS',
  blocked: 'BLOCKED',
  sentBack: 'SENT BACK',
  suppressed: 'SUPPRESSED',
  turned: 'TURNED',
  tricked: 'TRICKED',
  rose: 'BACK TO HAND',
  hexed: 'HEXED',
  defected: 'CHANGES SIDES',
  exposed: 'FOUND OUT',
  arrested: 'ARRESTED',
  amnestied: 'AMNESTIED',
  perished: 'LOST AT SEA',
};

export function ClashSheet({ ev, view, me, onClose }: { ev: GameEvent; view: GameState; me: PlayerId; onClose: () => void }) {
  const { placeholders } = useDisplay();
  const d = ev.data as {
    actor: { kind: 'character' | 'threat' | 'location' | 'event'; id: string; owner?: PlayerId; force?: number };
    victim: { uid: string; defId: string; owner: PlayerId; force: number };
    outcome: 'displaced' | 'held' | 'blocked' | 'sentBack' | 'suppressed' | 'turned' | 'tricked' | 'rose' | 'hexed' | 'defected' | 'exposed' | 'arrested' | 'amnestied' | 'perished';
    from: number;
    to?: number;
    theirForce?: number;
    intent?: string;
    note?: string;
  };
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 350);
    const t2 = setTimeout(() => setStage(2), 900);
    const t3 = setTimeout(() => setStage(3), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);
  const actorName =
    d.actor.kind === 'character' ? cardName(d.actor.id, placeholders) : d.actor.kind === 'threat' ? threatLabel(d.actor.id, placeholders) : d.actor.kind === 'location' ? locationName(d.actor.id, placeholders) : cardName(d.actor.id, placeholders);
  const victimName = cardName(d.victim.defId, placeholders);
  const title = CLASH_TITLES;
  const attackerWins = d.outcome !== 'held' && d.outcome !== 'amnestied';
  const artKind = d.actor.kind === 'character' ? 'characters' : d.actor.kind === 'threat' ? 'threats' : d.actor.kind === 'location' ? 'locations' : 'events';
  const where = d.to !== undefined ? locationName(view.locations[d.to].revealed ? view.locations[d.to].defId : 'unknown', placeholders) : '';
  const whereText = d.to !== undefined && !view.locations[d.to].revealed ? `Location ${d.to + 1}` : where;
  const owner = (p?: PlayerId) => (p ? view.players[p].handle : '');
  return (
    <div className="scrim">
      <div className={`sheet fanfare clash ${attackerWins ? 'hit' : 'miss'} stage-${stage}`}>
        <div className="stand-title">{title[d.outcome]}</div>
        <div className="center muted">{locationName(view.locations[d.from].revealed ? view.locations[d.from].defId : 'unknown', placeholders)}</div>
        <div className="clash-row">
          <div className={`clash-side actor p${d.actor.owner ?? ''}`}>
            <div className="fighter-pic big">
              {placeholders ? <span className="ini">{initials(d.actor.id, true)}</span> : <Art kind={artKind} id={d.actor.id} className="fighter-img" fallback={<span className="ini">{initials(d.actor.id, false)}</span>} alt={actorName} />}
            </div>
            <b>{actorName}</b>
            <small>{d.actor.owner ? owner(d.actor.owner) : d.actor.kind === 'threat' ? 'Threat' : d.actor.kind === 'location' ? 'Location' : 'Event'}{d.actor.force !== undefined ? ` · ${d.actor.force} Force` : ''}</small>
          </div>
          <div className="clash-strike" aria-hidden>
            {attackerWins ? '⚡' : '🛡'}
          </div>
          <div className={`clash-side victim p${d.victim.owner}`}>
            <div className="fighter-pic big">
              {placeholders ? <span className="ini">{initials(d.victim.defId, true)}</span> : <Art kind="characters" id={d.victim.defId} className="fighter-img" fallback={<span className="ini">{initials(d.victim.defId, false)}</span>} alt={victimName} />}
            </div>
            <b>{victimName}</b>
            <small>{owner(d.victim.owner)}{d.theirForce !== undefined && d.outcome !== 'hexed' ? ` · ${d.theirForce} Force` : ` · ${d.victim.force} Force`}</small>
          </div>
        </div>
        <div className={`verdict ${stage >= 3 ? 'show' : ''}`}>{title[d.outcome]}</div>
        {d.intent && <div className="showdown-rule muted clash-intent">{d.intent}</div>}
        <div className="showdown-why">
          <b>{ev.text}</b>
          {d.note ? ` ${d.note}` : ''}
          {d.outcome === 'displaced' && whereText ? ` ${victimName} now waits Waiting at the Gates of ${whereText}.` : ''}
        </div>
        {adviceFor(view, me, d.actor, d.outcome, d.from, placeholders) && <div className="showdown-rule beat">{adviceFor(view, me, d.actor, d.outcome, d.from, placeholders)}</div>}
        <div className="actions" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={onClose} autoFocus>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

/** The reckoning: each Location resolves one at a time, the decisive one last, then the verdict. */
export function TallySheet({ view, me, onResult, onBoard }: { view: GameState; me: PlayerId; onResult: () => void; onBoard: () => void }) {
  const { placeholders } = useDisplay();
  const r = view.result;
  const [stage, setStage] = useState(0);
  const winner = r?.winner ?? null;
  // Reveal the loser's Locations first so the last one shown is the one that decides it.
  const order = [0, 1, 2].sort((a, b) => {
    const rank = (i: number) => {
      const w = r?.locationWinners[i];
      if (winner && w === winner) return 2;
      if (w === 'lost' || w === null) return 1;
      return 0;
    };
    return rank(a) - rank(b) || a - b;
  });
  useEffect(() => {
    const beats = [600, 1900, 3200, 4500, 5400];
    const ts = beats.map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, []);
  if (!r) return null;
  const handle = (p: PlayerId) => view.players[p].handle;
  const mineWon = winner === me;
  const reasonText =
    r.reason === 'locations' ? 'Two of three Locations.' : r.reason === 'tiebreak-influence' ? 'One Location each: total Influence decides.' : r.reason === 'tiebreak-force' ? 'Tied on Influence: total Force decides.' : r.reason === 'stepOff' ? 'The other side sat down.' : 'Nothing separates them.';
  return (
    <div className="scrim">
      <div className={`sheet fanfare tally stage-${stage} ${stage >= 5 ? (winner ? (mineWon ? 'win' : 'loss') : 'draw') : ''}`}>
        <div className="stand-title">{stage < 5 ? 'THE RECKONING' : winner ? (mineWon ? 'VICTORY' : 'DEFEAT') : 'DRAW'}</div>
        <div className="center muted">{stage < 5 ? `Turn ${r.turn}. Three Locations, ${r.stakes} Legacy on the line.` : reasonText}</div>
        <div className="tally-rows">
          {order.map((i, k) => {
            const shown = stage >= k + 1;
            const a = r.influence.A[i];
            const b = r.influence.B[i];
            const w = r.locationWinners[i];
            const loc = view.locations[i];
            const total = a + b;
            const fracA = shown ? (total === 0 ? 0.5 : a / total) : 0.5;
            const label = !shown ? '' : w === 'lost' ? 'LOST' : w ? `${handle(w)} takes it` : 'Tied';
            return (
              <div key={i} className={`tally-row ${shown ? 'shown' : ''} ${shown && w && w !== 'lost' ? `won-${w}` : ''} ${shown && w === 'lost' ? 'lost' : ''} ${shown && w === me ? 'mine' : ''}`}>
                <div className="tally-name">{locationName(loc.revealed ? loc.defId : 'unknown', placeholders)}</div>
                <div className="tally-bar">
                  <span className="score pA">{shown ? a : '·'}</span>
                  <div className="line">
                    <div className="fillA" style={{ width: `${fracA * 100}%` }} />
                    <div className="fillB" style={{ width: `${(1 - fracA) * 100}%` }} />
                    <div className="mark" style={{ left: `${fracA * 100}%` }} />
                  </div>
                  <span className="score pB">{shown ? b : '·'}</span>
                </div>
                <div className="tally-verdict">{label}</div>
              </div>
            );
          })}
        </div>
        <div className={`verdict ${stage >= 5 ? 'show' : ''}`}>
          {winner ? `${handle(winner)} wins ${r.payout} Legacy${r.sweep ? ` (clean sweep, +${r.bonus})` : ''}` : 'Nobody wins the Legacy'}
        </div>
        {stage >= 5 && (
          <div className="actions" style={{ justifyContent: 'center' }}>
            <button className="primary" onClick={onResult} autoFocus>
              See result
            </button>
            <button className="ghost" onClick={onBoard}>
              Look at the board
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import type { GameEvent } from '../../engine';
import {
  CARD_BY_ID,
  LOCATION_BY_ID,
  THREAT_BY_ID,
  charsAt,
  charsOf,
  confrontForce,
  legalOptions,
  locDef,
  type GameState,
  type PlayerId,
  type TurnPlan,
} from '../../engine';
import { cardName, locationName, threatLabel, useDisplay } from '../display';
import { CardFace } from './CardFace';
import { HINTS } from '../tip';

export function Sheet({ children, onClose, title }: { children: ReactNode; onClose: () => void; title?: string }) {
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

/** Inspect a hand card and, while planning, send it straight to a Location. */
export function CardSheet({
  id,
  onClose,
  sendTo,
  planned,
  onCancelPlay,
}: {
  id: string;
  onClose: () => void;
  /** Legal destinations while planning; undefined when the card cannot be played now. */
  sendTo?: { options: { index: number; label: string }[]; needsLocation: boolean; onSend: (index: number) => void };
  planned?: boolean;
  onCancelPlay?: () => void;
}) {
  const { placeholders } = useDisplay();
  return (
    <Sheet onClose={onClose} title={cardName(id, placeholders)}>
      <div className="row" style={{ justifyContent: 'center' }}>
        <CardFace id={id} big />
      </div>
      {planned && (
        <div className="actions">
          <span className="muted">Planned for this turn.</span>
          {onCancelPlay && (
            <button className="ghost" onClick={onCancelPlay}>
              Cancel play
            </button>
          )}
        </div>
      )}
      {!planned && sendTo && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontWeight: 800 }}>{sendTo.needsLocation ? 'Send to:' : 'Play this Event:'}</div>
          <div className="actions">
            {sendTo.needsLocation ? (
              sendTo.options.map((o) => (
                <button key={o.index} className="primary" onClick={() => sendTo.onSend(o.index)}>
                  {o.label}
                </button>
              ))
            ) : (
              <button className="primary" onClick={() => sendTo.onSend(0)}>
                Play {cardName(id, placeholders)}
              </button>
            )}
            {sendTo.needsLocation && sendTo.options.length === 0 && <span className="muted">No Location has an open Gate for this card.</span>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Inspect a Character on the board, with its available actions. */
export function CharSheet({
  view,
  me,
  uid,
  plan,
  locked,
  onClose,
  onToggleEnter,
  onRelocate,
}: {
  view: GameState;
  me: PlayerId;
  uid: string;
  plan: TurnPlan;
  locked: boolean;
  onClose: () => void;
  onToggleEnter: (uid: string) => void;
  onRelocate: (uid: string, to: number | null) => void;
}) {
  const { placeholders } = useDisplay();
  const c = view.characters[uid];
  if (!c) return null;
  const mine = c.owner === me && !locked && view.phase === 'planning';
  const opts = legalOptions(view, me);
  const canEnter = mine && opts.enters.includes(uid);
  const reloc = mine ? opts.relocations.find((r) => r.uid === uid) : undefined;
  const current = plan.relocations.find((r) => r.uid === uid);
  const entering = plan.enters.includes(uid);
  const confronting = plan.confronts.some((x) => x.uid === uid);
  const harrietMove = plan.plays.find((pl) => pl.target?.charUid === uid);
  const status = harrietMove ? `Moving with Harriet Tubman to Location ${(harrietMove.target!.location ?? 0) + 1} when you Lock It In` : c.zone === 'inside' ? 'Established: Inside, Established ability active' : c.blockedEnterTurn === view.turn ? `At the Gates · ${HINTS.blocked}` : c.ready ? `At the Gates · ${HINTS.ready}` : `At the Gates · ${HINTS.fresh}`;
  return (
    <Sheet onClose={onClose} title={`${cardName(c.defId, placeholders)} · ${view.players[c.owner].handle}`}>
      <div className="row" style={{ justifyContent: 'center' }}>
        <CardFace id={c.defId} big />
      </div>
      <div className="muted center">
        {status} at {locationName(locDef(view, c.location).id, placeholders)}
        {c.suppressedUntilTurn !== undefined && c.suppressedUntilTurn >= view.turn ? ' · Suppressed' : ''}
        {c.permInfluence ? ` · +${c.permInfluence} Influence` : ''}
        {c.tempInfluence ? ` · +${c.tempInfluence} this turn` : ''}
      </div>
      {mine && c.zone === 'gate' && (
        <div className="actions">
          <button className={entering ? 'primary' : ''} disabled={!canEnter && !entering || confronting} onClick={() => onToggleEnter(uid)}>
            {entering ? 'Entering ✓ (tap to cancel)' : canEnter ? 'Enter this Location' : 'Not Ready yet'}
          </button>
        </div>
      )}
      {mine && c.zone === 'inside' && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="muted">Relocate to another Location's Gates (arrives Fresh):</div>
          <div className="actions">
            {reloc?.destinations.map((d) => (
              <button key={d} className={current?.to === d ? 'primary' : ''} disabled={confronting || (!current && locDef(view, c.location).effect.type !== 'hub' && plan.relocations.length >= opts.relocationsAllowed)} onClick={() => onRelocate(uid, current?.to === d ? null : d)}>
                {locationName(locDef(view, d).id, placeholders)}
                {!view.locations[d].revealed ? ` (Location ${d + 1})` : ''}
              </button>
            ))}
            {!reloc && <span className="muted">No open Gate to relocate to.</span>}
          </div>
          {plan.relocations.length >= opts.relocationsAllowed && !current && <div className="muted">Relocations used this turn: {plan.relocations.length}/{opts.relocationsAllowed}</div>}
        </div>
      )}
      {confronting && <div className="muted center">This Character is confronting a Threat this turn and cannot move.</div>}
    </Sheet>
  );
}

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
  const opt = legalOptions(view, me).confronts.find((c) => c.threatUid === threatUid);
  const committed = plan.confronts.filter((c) => c.threatUid === threatUid);
  const total = committed.reduce((s, c) => s + confrontForce(view, view.characters[c.uid], t), 0);
  const busy = new Set([...plan.enters, ...plan.relocations.map((r) => r.uid), ...plan.confronts.filter((c) => c.threatUid !== threatUid).map((c) => c.uid)]);
  return (
    <Sheet onClose={onClose} title={`${threatLabel(t.defId, placeholders)}${t.target ? ` · hunting ${view.players[t.target].handle}` : ''}`}>
      <div className="muted">{def.family} · at {locationName(locDef(view, loc.index).id, placeholders)}</div>
      <div>{def.text}</div>
      {!placeholders && <div className="muted" style={{ fontStyle: 'italic' }}>{def.blurb}</div>}
      <div>
        Needs: <b>{def.requiresBoth ? 'at least 1 Force from each player in the same turn' : `${t.forceRequired} Force in one turn`}</b>
      </div>
      {opt && !locked && view.phase === 'planning' ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontWeight: 800 }}>{opt.assist ? 'ASSIST? This Threat hunts your opponent.' : 'Confront with:'}</div>
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
            {def.requiresBoth ? '' : ` / ${t.forceRequired}`} · confronting Characters cannot enter or relocate this turn.
            {opt.assist ? ' Assisting earns Solidarity (cosmetic).' : ''}
          </div>
        </div>
      ) : (
        <div className="muted">{opt ? 'Plans are locked.' : 'You have no eligible Characters here.'}</div>
      )}
    </Sheet>
  );
}

export function LocationSheet({ view, index, onClose }: { view: GameState; index: number; onClose: () => void }) {
  const { placeholders } = useDisplay();
  const loc = view.locations[index];
  const def = LOCATION_BY_ID[loc.revealed ? loc.defId : 'unknown'];
  const known = view.players[view.viewFor ?? 'A'].knownNextReveal;
  return (
    <Sheet onClose={onClose} title={loc.revealed ? locationName(def.id, placeholders) : `Location ${index + 1} (hidden)`}>
      {loc.revealed && !placeholders && <div className="muted">{def.era}</div>}
      <div>{def.rule}</div>
      {loc.revealed && !placeholders && <div className="muted" style={{ fontStyle: 'italic' }}>{def.blurb}</div>}
      {!loc.revealed && known === index && <div className="pA">Katherine Johnson: this Location reveals next.</div>}
      {loc.revealed && def.transformsInto && loc.revealedTurn !== undefined && (
        <div className="pA">⛵ Arrives in {Math.max(0, loc.revealedTurn + def.transformsInto.afterTurns - view.turn)} turn(s) as {LOCATION_BY_ID[def.transformsInto.id]?.name}.</div>
      )}
      {loc.lost && <div style={{ color: 'var(--danger)' }}>LOST: {loc.lostReason ?? 'an unresolved crisis.'} Neither player can win this Location; its Influence no longer counts toward the match.</div>}
      <div className="muted">
        Gates: 2 per player · Inside: 5 per player · Characters at both count toward Influence.
      </div>
    </Sheet>
  );
}

/** Harriet Tubman's Reveal needs a friendly Gate Character and a destination. */
export function TargetSheet({
  view,
  me,
  cardId,
  location,
  onClose,
  onConfirm,
}: {
  view: GameState;
  me: PlayerId;
  cardId: string;
  location: number;
  onClose: () => void;
  onConfirm: (target?: { charUid: string; location: number }) => void;
}) {
  const { placeholders } = useDisplay();
  const needs = (CARD_BY_ID[cardId] as { reveal?: { needsTarget?: string } })?.reveal?.needsTarget;
  if (needs === 'friendlyInsideChar') {
    const insideChars = charsOf(view, me).filter((c) => c.zone === 'inside' && c.location !== location);
    return (
      <Sheet onClose={onClose} title={`${cardName(cardId, placeholders)}: choose who to bring across`}>
        <div className="muted">Bring one friendly Established Character from another Location here. It arrives Inside if there is room, otherwise Ready at the Gates.</div>
        {insideChars.length === 0 && <div>No Established Characters elsewhere. The Reveal will do nothing.</div>}
        <div className="actions">
          {insideChars.map((c) => (
            <button key={c.uid} className="primary" onClick={() => onConfirm({ charUid: c.uid, location })}>
              {cardName(c.defId, placeholders)} <span className="muted">from {locationName(locDef(view, c.location).id, placeholders)}</span>
            </button>
          ))}
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => onConfirm(undefined)}>
            Play without bringing anyone
          </button>
        </div>
      </Sheet>
    );
  }
  const gateChars = charsOf(view, me).filter((c) => c.zone === 'gate');
  return (
    <Sheet onClose={onClose} title={`${cardName(cardId, placeholders)}: choose a Character to move`}>
      <div className="muted">Move one friendly Gate Character to another Location's open Gate. Waiting progress is preserved.</div>
      {gateChars.length === 0 && <div>No friendly Gate Characters to move. Harriet's Reveal will do nothing.</div>}
      {gateChars.map((c) => (
        <div key={c.uid} style={{ display: 'grid', gap: 4 }}>
          <div>
            <b>{cardName(c.defId, placeholders)}</b> <span className="muted">at {locationName(locDef(view, c.location).id, placeholders)} · {c.ready ? 'Ready' : 'Fresh'}</span>
          </div>
          <div className="actions">
            {view.locations
              .filter((l) => l.index !== c.location && !l.lost && charsAt(view, l.index, me, 'gate').length + (l.index === location ? 1 : 0) < 2)
              .map((l) => (
                <button key={l.index} onClick={() => onConfirm({ charUid: c.uid, location: l.index })}>
                  → {l.revealed ? locationName(l.defId, placeholders) : `Location ${l.index + 1}`}
                </button>
              ))}
          </div>
        </div>
      ))}
      <div className="actions">
        <button className="ghost" onClick={() => onConfirm(undefined)}>
          Play without moving anyone
        </button>
      </div>
    </Sheet>
  );
}

export function ProfileSheet({ view, p, me, onClose }: { view: GameState; p: PlayerId; me: PlayerId; onClose: () => void }) {
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

export function StandResponseSheet({ view, me, onRespond }: { view: GameState; me: PlayerId; onRespond: (cont: boolean) => void }) {
  const ps = view.pendingStand!;
  const canStepOff = !view.players[me].cannotStepOff;
  return (
    <div className="scrim">
      <div className="sheet">
        <div className="stand-title pA">STAND ON BUSINESS</div>
        <div className="center">
          <b>{view.players[ps.by].handle}</b> raises the match from {view.stakes} to <b>{ps.proposed}</b> Stakes. The match now runs {view.maxTurns} turns.
        </div>
        <div className="center muted">{canStepOff ? `Continue at ${ps.proposed} Stakes, or Step Off now and lose ${view.stakes}.` : 'You Stood on Business earlier, so there is no backing out.'}</div>
        <div className="actions" style={{ justifyContent: 'center' }}>
          {canStepOff && (
            <button className="danger" onClick={() => onRespond(false)}>
              Step Off (lose {view.stakes})
            </button>
          )}
          <button className="primary" onClick={() => onRespond(true)}>
            Continue at {ps.proposed}
          </button>
        </div>
        <div className="muted center">{view.players[me].handle}, this is your call.</div>
      </div>
    </div>
  );
}

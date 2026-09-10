/**
 * Card sheets with an action tray: a keyboard- and screen-reader-friendly path.
 *
 * The match plays by drag (or tap, then tap a Location). These are the same card stages with every action
 * spelled out as buttons under the card: send a hand card to a named Location, play an Event, enter,
 * relocate, Harriet's free move, Yemoja's bring-across, cancel a planned play. They are not mounted anywhere
 * right now; they are kept here so an accessible, pointer-free way to play can be explored later
 * (see README.md in this folder). The tray styles live in compendium.css under `.cx-tray`.
 */
import { CARD_BY_ID, legalOptions, lockReason, locDef, type GameState, type PlayerId, type TurnPlan } from '../../engine';
import { cardName, locationName, useDisplay } from '../display';
import { CodexSheet } from '../components/CodexSheet';
import { HINTS } from '../tip';

/** Inspect a hand card and, while planning, send it straight to a Location. */
export function CardSheetWithTray({
  id,
  onClose,
  sendTo,
  planned,
  onCancelPlay,
  extra,
}: {
  id: string;
  onClose: () => void;
  /** Legal destinations while planning; undefined when the card cannot be played now. */
  sendTo?: { options: { index: number; label: string }[]; needsLocation: boolean; onSend: (index: number) => void };
  planned?: boolean;
  onCancelPlay?: () => void;
  /** A live readout for cards that track the match (Reparations: what it would pay right now). */
  extra?: React.ReactNode;
}) {
  const { placeholders } = useDisplay();
  const tray = planned || sendTo || extra;
  return (
    <CodexSheet id={id} label="In hand" onClose={onClose}>
      {tray && (
        <>
          {extra}
          {planned && (
            <div className="actions center">
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
              <div className="cx-tray-lbl">{sendTo.needsLocation ? 'Send to' : 'Play this Event'}</div>
              <div className="actions center">
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
                {sendTo.needsLocation && sendTo.options.length === 0 && <span className="muted">No Location has an open Gate slot for this card. Events need one too.</span>}
              </div>
            </div>
          )}
        </>
      )}
    </CodexSheet>
  );
}

/** Inspect a Character on the board, with its available actions. */
export function CharSheetWithTray({
  view,
  me,
  uid,
  plan,
  locked,
  onClose,
  onToggleEnter,
  onRelocate,
  tubman,
  yemoja,
}: {
  view: GameState;
  me: PlayerId;
  uid: string;
  plan: TurnPlan;
  locked: boolean;
  onClose: () => void;
  onToggleEnter: (uid: string) => void;
  onRelocate: (uid: string, to: number | null) => void;
  /** Harriet Tubman is planned: Gate Characters may take a free move. */
  tubman?: { name: string; dests: number[]; onMove: (to: number | null) => void };
  /** Yemoja is planned: an Established Character elsewhere may be brought across. */
  yemoja?: { name: string; location: number; onBring: (on: boolean) => void };
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
  const informant = !!(CARD_BY_ID[c.defId] as { keywords?: string[] } | undefined)?.keywords?.includes('INFORMANT');
  const status = harrietMove ? `Moving with Harriet Tubman to Location ${(harrietMove.target!.location ?? 0) + 1} when you Lock It In` : informant ? `At the Gates · ${HINTS.informant}` : c.zone === 'inside' ? 'Established: Inside, Established ability active' : c.blockedEnterTurn === view.turn ? `At the Gates · ${HINTS.blocked}` : c.ready ? `At the Gates · ${HINTS.ready}` : `At the Gates · ${HINTS.fresh}`;
  return (
    <CodexSheet id={c.defId} label={view.players[c.owner].handle} onClose={onClose}>
      <div className="muted center">
        <b className={c.owner === me ? 'pA' : 'pB'}>{view.players[c.owner].handle}</b> · {status} at {locationName(locDef(view, c.location).id, placeholders)}
        {c.suppressedUntilTurn !== undefined && c.suppressedUntilTurn >= view.turn ? ' · Suppressed' : ''}
        {c.permInfluence ? ` · ${c.permInfluence > 0 ? '+' : ''}${c.permInfluence} Influence` : ''}
        {c.tempInfluence ? ` · ${c.tempInfluence > 0 ? '+' : ''}${c.tempInfluence} this turn` : ''}
      </div>
      {mine && tubman && !informant && !entering && !confronting && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="muted">{tubman.name} can conduct this Character to another Gate for free{lockReason(view, c) ? ', even though ' + lockReason(view, c) : ''} ({c.zone === 'inside' ? 'arrives Ready' : 'waiting progress kept'}):</div>
          <div className="actions">
            {tubman.dests.map((d) => (
              <button key={d} className={harrietMove?.target?.location === d ? 'primary' : ''} onClick={() => tubman.onMove(harrietMove?.target?.location === d ? null : d)}>
                {locationName(locDef(view, d).id, placeholders)}
                {!view.locations[d].revealed ? ` (Location ${d + 1})` : ''}
              </button>
            ))}
            {tubman.dests.length === 0 && <span className="muted">No other Gate has room.</span>}
          </div>
        </div>
      )}
      {mine && c.zone === 'inside' && yemoja && yemoja.location !== c.location && !confronting && (
        <div className="actions">
          <button className={plan.plays.some((pl) => pl.target?.charUid === uid) ? 'primary' : ''} onClick={() => yemoja.onBring(!plan.plays.some((pl) => pl.target?.charUid === uid))}>
            {plan.plays.some((pl) => pl.target?.charUid === uid) ? `Coming with ${yemoja.name} ✓ (tap to cancel)` : `Bring across with ${yemoja.name}`}
          </button>
        </div>
      )}
      {mine && c.zone === 'gate' && !informant && (
        <div className="actions">
          <button className={entering ? 'primary' : ''} disabled={!canEnter && !entering || confronting} onClick={() => onToggleEnter(uid)}>
            {entering ? 'Entering ✓ (tap to cancel)' : canEnter ? 'Enter this Location' : 'Not Ready yet'}
          </button>
        </div>
      )}
      {mine && !view.locations[c.location].lost && lockReason(view, c) && !tubman && (
        <div className="muted">Held: {lockReason(view, c)}. Only Harriet Tubman's Reveal can move this Character out.</div>
      )}
      {mine && !view.locations[c.location].lost && !lockReason(view, c) && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="muted">{c.zone === 'gate' ? `Relocate to another Location's Gates (stays ${c.ready ? 'Ready' : 'Fresh'}):` : "Relocate to another Location's Gates (arrives Fresh):"}</div>
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
    </CodexSheet>
  );
}


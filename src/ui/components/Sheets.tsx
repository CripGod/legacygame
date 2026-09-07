import { useEffect, useState, type ReactNode } from 'react';
import type { GameEvent } from '../../engine';
import {
  CARD_BY_ID,
  LOCATION_BY_ID,
  THREAT_BY_ID,
  confrontForce,
  legalOptions,
  locDef,
  other,
  type GameState,
  type PlayerId,
  type TurnPlan,
} from '../../engine';
import { cardName, initials, locationName, threatLabel, useDisplay } from '../display';
import { CardFace } from './CardFace';
import { liveAbilities } from './Battlefield';
import { Art } from './Art';
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
/** ⓘ History: the real story behind a Character, or the origins of a Mythic figure. */
export function HistoryNote({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const { placeholders } = useDisplay();
  const def = CARD_BY_ID[id] as { kind?: string; category?: string; history?: string } | undefined;
  if (!def || placeholders || !def.history) return null;
  const mythic = def.category === 'mythic';
  const label = mythic ? 'Origins' : 'History';
  return (
    <div className="history">
      <button className={`ghost info ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        ⓘ {label}
      </button>
      {open && (
        <div className="history-body">
          {mythic && <div className="history-tag">Mythic · a figure of faith and folklore, not a historical person. Here is where the story comes from.</div>}
          <p>{def.history}</p>
        </div>
      )}
    </div>
  );
}

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
      <HistoryNote id={id} />
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
  const status = harrietMove ? `Moving with Harriet Tubman to Location ${(harrietMove.target!.location ?? 0) + 1} when you Lock It In` : c.zone === 'inside' ? 'Established: Inside, Established ability active' : c.blockedEnterTurn === view.turn ? `At the Gates · ${HINTS.blocked}` : c.ready ? `At the Gates · ${HINTS.ready}` : `At the Gates · ${HINTS.fresh}`;
  return (
    <Sheet onClose={onClose} title={`${cardName(c.defId, placeholders)} · ${view.players[c.owner].handle}`}>
      <div className="row" style={{ justifyContent: 'center' }}>
        <CardFace id={c.defId} big />
      </div>
      <HistoryNote id={c.defId} />
      <div className="muted center">
        {status} at {locationName(locDef(view, c.location).id, placeholders)}
        {c.suppressedUntilTurn !== undefined && c.suppressedUntilTurn >= view.turn ? ' · Suppressed' : ''}
        {c.permInfluence ? ` · +${c.permInfluence} Influence` : ''}
        {c.tempInfluence ? ` · +${c.tempInfluence} this turn` : ''}
      </div>
      {mine && c.zone === 'gate' && tubman && !entering && !confronting && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="muted">{tubman.name} can move this Character to another Gate for free (waiting progress kept):</div>
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
      {!placeholders && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <Art kind="threats" id={t.defId} className="threat-art" fallback={null} alt={def.name} />
        </div>
      )}
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
      {(['A', 'B'] as PlayerId[]).map((p) => {
        const items = liveAbilities(view, index, p);
        if (!items.length) return null;
        return (
          <div key={p} className="fx-list">
            <div className={`fx-title p${p}`}>✦ In effect · {p === (view.viewFor ?? 'A') ? 'You' : view.players[p].handle}</div>
            {items.map((it) => (
              <div key={it.uid} className="fx-row">
                <b>{cardName(it.defId, placeholders)}</b> <span className="muted">{it.text}</span>
              </div>
            ))}
          </div>
        );
      })}
      <div className="muted">
        Gates: 2 per player · Inside: 5 per player · Characters at both count toward Influence.
      </div>
    </Sheet>
  );
}

/** Harriet Tubman's Reveal needs a friendly Gate Character and a destination. */

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


/** The Ancestors: the opponent's plan for this turn (AI mode) and every danger the board is about to spring. */
export function AncestorsSheet({ view, me, plan, onClose }: { view: GameState; me: PlayerId; plan: TurnPlan | null; onClose: () => void }) {
  const { placeholders } = useDisplay();
  const opp = other(me);
  const locLabel = (i: number) => (view.locations[i].revealed ? locationName(view.locations[i].defId, placeholders) : `Location ${i + 1}`);
  const who = (uid: string) => {
    const c = view.characters[uid];
    return c ? cardName(c.defId, placeholders) : 'a Character';
  };
  const moves: string[] = [];
  if (plan) {
    for (const pl of plan.plays) {
      const d = CARD_BY_ID[pl.cardId];
      moves.push(d?.kind === 'event' && !d.needsLocation ? `Plays ${cardName(pl.cardId, placeholders)}.` : `Plays ${cardName(pl.cardId, placeholders)} at ${locLabel(pl.location)}${pl.enter ? ', straight Inside' : ''}.`);
    }
    for (const uid of plan.enters) moves.push(`${who(uid)} enters at ${locLabel(view.characters[uid]?.location ?? 0)}.`);
    for (const r of plan.relocations) moves.push(`${who(r.uid)} relocates to ${locLabel(r.to)}.`);
    for (const cf of plan.confronts) moves.push(`${who(cf.uid)} confronts a Threat.`);
    if (plan.summon) moves.push(`Proposes a Summon at ${locLabel(plan.summon.location)}.`);
    if (plan.standOnBusiness) moves.push('Stands on Business.');
    if (plan.stepOff) moves.push('Steps Off.');
    if (!moves.length) moves.push('Does nothing this turn.');
  }
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
      if (td?.lostAfterTurns && !l.lost) dangers.push(`${def?.name ?? locLabel(l.index)}: ${td.name} closes the Location at the end of Turn ${t.spawnedTurn + td.lostAfterTurns - 1} unless ${t.forceRequired} Force answers it in one turn.`);
    }
  }
  if (view.pendingRaises.some((r) => r.by === opp)) dangers.push(`${view.players[opp].handle} Stood on Business: the Legacy doubles after this turn.`);
  if (view.turn >= 3 && view.turn < view.maxTurns) dangers.push(`${view.maxTurns - view.turn} turn${view.maxTurns - view.turn > 1 ? 's' : ''} remain after this one.`);
  return (
    <Sheet onClose={onClose} title="The Ancestors speak">
      <div className="fx-list">
        <div className="fx-title pB">{view.players[opp].handle}'s plan this turn</div>
        {plan ? moves.map((t, i) => <div key={i} className="fx-row">{t}</div>) : <div className="fx-row muted">Only the board speaks in a pass-the-device match.</div>}
      </div>
      <div className="fx-list">
        <div className="fx-title pA">What is coming</div>
        {dangers.length ? dangers.map((t, i) => <div key={i} className="fx-row">{t}</div>) : <div className="fx-row muted">Nothing the Ancestors can see.</div>}
      </div>
      <div className="actions">
        <button className="primary" onClick={onClose} autoFocus>
          Plan accordingly
        </button>
      </div>
    </Sheet>
  );
}

/** A confrontation replayed as a showdown: fighters on one side, the Threat on the other, the Force bar filling toward what it needs. */
export function ShowdownSheet({ ev, view, onClose }: { ev: GameEvent; view: GameState; onClose: () => void }) {
  const { placeholders } = useDisplay();
  const d = ev.data as { threatUid: string; defId: string; needed: number; requiresBoth: boolean; force: { A: number; B: number }; fighters: { uid: string; defId: string; owner: PlayerId; force: number }[]; cleared: boolean };
  const tdef = THREAT_BY_ID[d.defId];
  const total = d.force.A + d.force.B;
  const pct = d.requiresBoth ? (d.cleared ? 100 : 50) : Math.min(100, Math.round((total / Math.max(1, d.needed)) * 100));
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
              </div>
            ))}
          </div>
          <div className="showdown-vs">VS</div>
          <div className="showdown-side threat-side">
            <div className="fighter-pic big">{placeholders ? <span className="ini">{initials(d.defId, true)}</span> : <Art kind="threats" id={d.defId} className="fighter-img" fallback={<span className="ini">{initials(d.defId, false)}</span>} alt={tdef?.name} />}</div>
            <b>{d.requiresBoth ? 'both' : d.needed}</b>
          </div>
        </div>
        <div className="center" style={{ fontWeight: 800 }}>{threatLabel(d.defId, placeholders)}</div>
        <div className="force-bar">
          <div className="force-fill" style={{ width: stage >= 1 ? `${pct}%` : '0%' }} />
          <span className="force-label">
            {total} / {d.requiresBoth ? 'both sides' : d.needed} Force
          </span>
        </div>
        <div className={`verdict ${stage >= 2 ? 'show' : ''}`}>{d.cleared ? 'NEUTRALIZED' : 'IT HOLDS'}</div>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={onClose} autoFocus>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

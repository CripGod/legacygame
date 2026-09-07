import { useState } from 'react';
import { CHARACTERS, EVENTS, LOCATIONS, THREATS, type CardDef } from '../../engine';
import { CardFace } from '../components/CardFace';
import { CardSheet } from '../components/Sheets';

/** Every card by cost, then the ones the board hands out, then Locations and Threats. */
export function CardsScreen({ onBack }: { onBack: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const inDecks: CardDef[] = [...CHARACTERS.filter((c) => c.category !== 'gathering' && !c.spawn), ...EVENTS.filter((e) => !e.spawn)];
  const arrivals: CardDef[] = [...CHARACTERS.filter((c) => c.category === 'gathering' || c.spawn), ...EVENTS.filter((e) => e.spawn)];
  const costs = [...new Set(inDecks.map((c) => c.cost))].sort((a, b) => a - b);
  return (
    <div className="screen">
      <div className="inner cards-screen">
        <button className="small ghost" onClick={onBack} style={{ justifySelf: 'start' }}>
          ← Back
        </button>
        <h1 className="title">
          Cards<small>Every card, by Energy cost</small>
        </h1>
        {costs.map((cost) => (
          <section key={cost}>
            <h2>Cost {cost}</h2>
            <div className="card-grid">
              {inDecks
                .filter((c) => c.cost === cost)
                .map((c) => (
                  <CardFace key={c.id} id={c.id} onClick={() => setOpen(c.id)} />
                ))}
            </div>
          </section>
        ))}
        <section>
          <h2>Arrive on their own</h2>
          <div className="muted">Never in a deck. The board hands them out when a condition is met.</div>
          <div className="card-grid">
            {arrivals.map((c) => (
              <CardFace key={c.id} id={c.id} onClick={() => setOpen(c.id)} />
            ))}
          </div>
        </section>
        <section>
          <h2>Locations</h2>
          <ul className="compendium">
            {LOCATIONS.map((l) => (
              <li key={l.id}>
                <b>{l.name}</b> <span className="muted">{l.era}</span>
                <div>{l.rule}</div>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2>Threats</h2>
          <ul className="compendium">
            {THREATS.map((t) => (
              <li key={t.id}>
                <b>{t.name}</b> <span className="muted">{t.family}</span>
                <div>{t.text}</div>
              </li>
            ))}
          </ul>
        </section>
        {open && <CardSheet id={open} onClose={() => setOpen(null)} />}
      </div>
    </div>
  );
}

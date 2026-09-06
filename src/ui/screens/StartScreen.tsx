import { useState } from 'react';
import { resetCoach } from '../components/Coach';
import { resetGuide } from '../guide';
import { PRESET_DECKS, CARD_BY_ID } from '../../engine';

export interface StartOptions {
  seed?: number;
  mode: 'ai' | 'hotseat';
  placeholders: boolean;
  dev: boolean;
  coach: boolean;
  deckA: string;
  deckB: string;
}

export function StartScreen({ onPlay, onRules, initialDev }: { onPlay: (o: StartOptions) => void; onRules: () => void; initialDev: boolean }) {
  const [dev, setDev] = useState(initialDev);
  const [seed, setSeed] = useState('');
  const [placeholders, setPlaceholders] = useState(false);
  const [coach, setCoach] = useState(true);
  const [deckA, setDeckA] = useState('railroad');
  const [deckB, setDeckB] = useState('blackstar');
  const opts = (mode: 'ai' | 'hotseat'): StartOptions => ({ seed: seed.trim() ? Number(seed) : undefined, mode, placeholders, dev, coach, deckA, deckB });
  const deckOptions = [...Object.entries(PRESET_DECKS).map(([k, d]) => ({ key: k, name: d.name, style: d.style, cards: d.cards })), { key: 'random', name: 'Random draft', style: 'Ten random Characters from the whole pool plus both Events. Different every match.', cards: [] as string[] }];
  const DeckPicker = ({ label, value, onChange }: { label: string; value: string; onChange: (k: string) => void }) => {
    const d = deckOptions.find((o) => o.key === value)!;
    return (
      <div className="deck-pick">
        <div className="lbl">{label}</div>
        <div className="deck-tabs">
          {deckOptions.map((o) => (
            <button key={o.key} className={`small ${o.key === value ? 'primary' : ''}`} onClick={() => onChange(o.key)}>
              {o.name}
            </button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>{d.style}</div>
        {d.cards.length > 0 && <div className="muted" style={{ fontSize: 12 }}>{d.cards.map((id) => CARD_BY_ID[id]?.name ?? id).join(' · ')}</div>}
      </div>
    );
  };
  return (
    <div className="screen">
      <div className="inner">
        <h1 className="title">
          Black History Card Battler
          <small>Systems prototype · v0.2</small>
        </h1>
        <div className="muted">
          Deploy historical figures across three Locations. Win Influence at two of them. Six turns. Three to six minutes.
        </div>
        <DeckPicker label="Your deck" value={deckA} onChange={setDeckA} />
        <DeckPicker label="Harborlight's deck" value={deckB} onChange={setDeckB} />
        <div className="menu">
          <button className="primary" onClick={() => onPlay(opts('ai'))}>
            Play vs Harborlight
          </button>
          <button onClick={onRules}>Rules</button>
          <button className="ghost" onClick={() => setDev((d) => !d)}>
            {dev ? 'Hide developer tools' : 'Developer tools'}
          </button>
        </div>
        {dev && (
          <div className="dev">
            <label>
              Seed <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="random" />
            </label>
            <label>
              <input type="checkbox" checked={placeholders} onChange={(e) => setPlaceholders(e.target.checked)} /> Generic placeholder names (Test A: is it still fun?)
            </label>
            <label>
              <input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} /> First-match coach tips
            </label>
            <div className="actions" style={{ justifyContent: 'flex-start' }}>
              <button className="small" onClick={() => onPlay(opts('hotseat'))}>
                Local two-player debug (pass the device)
              </button>
              <button className="small ghost" onClick={() => { resetCoach(); resetGuide(); }}>
                Reset coach tips
              </button>
            </div>
            <div className="muted">In-match: the ⚙ button opens AI reasoning, analytics and the event log. Also enabled with ?dev=1.</div>
          </div>
        )}
      </div>
    </div>
  );
}

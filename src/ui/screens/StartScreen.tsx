import { useState } from 'react';
import { resetCoach } from '../components/Coach';

export interface StartOptions {
  seed?: number;
  mode: 'ai' | 'hotseat';
  placeholders: boolean;
  dev: boolean;
  coach: boolean;
}

export function StartScreen({ onPlay, onRules, initialDev }: { onPlay: (o: StartOptions) => void; onRules: () => void; initialDev: boolean }) {
  const [dev, setDev] = useState(initialDev);
  const [seed, setSeed] = useState('');
  const [placeholders, setPlaceholders] = useState(false);
  const [coach, setCoach] = useState(true);
  const opts = (mode: 'ai' | 'hotseat'): StartOptions => ({ seed: seed.trim() ? Number(seed) : undefined, mode, placeholders, dev, coach });
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
              <button className="small ghost" onClick={resetCoach}>
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

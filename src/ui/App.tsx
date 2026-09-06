import { useState } from 'react';
import { DisplayContext } from './display';
import { StartScreen, type StartOptions } from './screens/StartScreen';
import { RulesScreen } from './screens/RulesScreen';
import { ResultScreen } from './screens/ResultScreen';
import { MatchScreen } from './screens/MatchScreen';
import { useMatch, type Mode } from './useMatch';
import { DevPanel } from './components/DevPanel';

type Screen = 'start' | 'rules' | 'match' | 'result';

function MatchHost({ seed, mode, dev, coach, onMenu }: { seed: number; mode: Mode; dev: boolean; coach: boolean; onMenu: () => void }) {
  const m = useMatch(seed, mode);
  const [screen, setScreen] = useState<'match' | 'result'>('match');
  const [devOpen, setDevOpen] = useState(false);
  if (m.handoff) {
    return (
      <div className="handoff">
        <div>
          <div className="muted">Pass the device to</div>
          <div className={`big p${m.handoff}`}>{m.trueState.players[m.handoff].handle}</div>
          <div className="muted" style={{ margin: '12px 0 20px' }}>The other player's plan is hidden.</div>
          <button className="primary" onClick={m.takeDevice}>
            I'm {m.trueState.players[m.handoff].handle}
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      {screen === 'match' ? (
        <MatchScreen m={m} coach={coach} onExit={() => setScreen('result')} />
      ) : (
        <ResultScreen
          state={m.trueState}
          onAgain={() => {
            m.newMatch();
            setScreen('match');
          }}
          onRematch={() => {
            m.newMatch(m.seed);
            setScreen('match');
          }}
          onMenu={onMenu}
        />
      )}
      {dev && (
        <button className="small dev-toggle" onClick={() => setDevOpen((o) => !o)} title="Developer tools">
          ⚙
        </button>
      )}
      {dev && devOpen && <DevPanel trueState={m.trueState} log={m.log} onClose={() => setDevOpen(false)} />}
    </>
  );
}

export function App() {
  const initialDev = new URLSearchParams(window.location.search).get('dev') === '1';
  const [screen, setScreen] = useState<Screen>('start');
  const [opts, setOpts] = useState<StartOptions>({ mode: 'ai', placeholders: false, dev: initialDev, coach: true });
  const [seed, setSeed] = useState(0);
  const [matchKey, setMatchKey] = useState(0);
  const start = (o: StartOptions) => {
    setOpts(o);
    setSeed(o.seed ?? Math.floor(Math.random() * 1_000_000));
    setMatchKey((k) => k + 1);
    setScreen('match');
  };
  return (
    <DisplayContext.Provider value={{ placeholders: opts.placeholders }}>
      {screen === 'start' && <StartScreen onPlay={start} onRules={() => setScreen('rules')} initialDev={opts.dev} />}
      {screen === 'rules' && <RulesScreen onBack={() => setScreen('start')} />}
      {screen === 'match' && <MatchHost key={matchKey} seed={seed} mode={opts.mode} dev={opts.dev} coach={opts.coach} onMenu={() => setScreen('start')} />}
    </DisplayContext.Provider>
  );
}

import { Component, useState, type ReactNode } from 'react';
import { DisplayContext } from './display';
import { StartScreen, type StartOptions } from './screens/StartScreen';
import { RulesScreen } from './screens/RulesScreen';
import { ResultScreen } from './screens/ResultScreen';
import { MatchScreen } from './screens/MatchScreen';
import { useMatch, type Mode } from './useMatch';
import { DevPanel } from './components/DevPanel';

type Screen = 'start' | 'rules' | 'match' | 'result';

class ErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="screen">
          <div className="inner">
            <h1 className="title">Something broke</h1>
            <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--danger)' }}>{String(this.state.error?.message ?? this.state.error)}</pre>
            <div className="muted">This is a prototype bug, not something you did. The match state is lost; please report what you tapped.</div>
            <div className="menu">
              <button className="primary" onClick={() => { this.setState({ error: null }); this.props.onReset(); }}>
                Back to menu
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function MatchHost({ seed, mode, dev, coach, decks, onMenu }: { seed: number; mode: Mode; dev: boolean; coach: boolean; decks: Record<'A' | 'B', string>; onMenu: () => void }) {
  const m = useMatch(seed, mode, decks);
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
  const [opts, setOpts] = useState<StartOptions>({ mode: 'ai', placeholders: false, dev: initialDev, coach: true, deckA: 'railroad', deckB: 'blackstar' });
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
      {screen === 'match' && (
        <ErrorBoundary onReset={() => setScreen('start')}>
          <MatchHost key={matchKey} seed={seed} mode={opts.mode} dev={opts.dev} coach={opts.coach} decks={{ A: opts.deckA, B: opts.deckB }} onMenu={() => setScreen('start')} />
        </ErrorBoundary>
      )}
    </DisplayContext.Provider>
  );
}

/**
 * Local playtest analytics. Stored in localStorage as JSON.
 */
import type { GameState, PlayerId } from '../engine';
import { influenceAt, LOCATION_BY_ID } from '../engine';

export interface MatchRecord {
  at: string;
  seed: number;
  mode: 'ai' | 'hotseat';
  winner: PlayerId | null;
  reason: string;
  stakes: number;
  endTurn: number;
  locations: { id: string; winner: PlayerId | null | 'lost'; influence: Record<PlayerId, number> }[];
  plays: Record<PlayerId, string[]>;
  relocations: Record<PlayerId, number>;
  assists: Record<PlayerId, { offered: number; taken: number }>;
  leadChanges: number;
  finalTurnFlips: number;
  standTurns: { player: PlayerId; turn: number; proposed: number; accepted: boolean }[];
  stepOffTurn?: { player: PlayerId; turn: number };
  gateTurns: number;
  insideTurns: number;
  setbacks: Record<PlayerId, number>;
}

const KEY = 'bhcb.matches.v1';

function read(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MatchRecord[]) : [];
  } catch {
    return [];
  }
}

function write(records: MatchRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    /* storage unavailable */
  }
}

export function recordMatch(state: GameState, mode: 'ai' | 'hotseat'): MatchRecord | null {
  if (!state.result) return null;
  const r = state.result;
  const rec: MatchRecord = {
    at: new Date().toISOString(),
    seed: state.seed,
    mode,
    winner: r.winner,
    reason: r.reason,
    stakes: r.stakes,
    endTurn: r.turn,
    locations: state.locations.map((l, i) => ({ id: l.defId, winner: r.locationWinners[i], influence: influenceAt(state, i) })),
    plays: state.stats.plays,
    relocations: state.stats.relocations,
    assists: state.stats.assists,
    leadChanges: state.stats.leadChanges,
    finalTurnFlips: state.stats.finalTurnFlips,
    standTurns: state.stats.standTurns,
    stepOffTurn: state.stats.stepOffTurn,
    gateTurns: state.stats.gateTurns,
    insideTurns: state.stats.insideTurns,
    setbacks: { A: state.players.A.setbacks, B: state.players.B.setbacks },
  };
  const all = read();
  all.push(rec);
  write(all);
  return rec;
}

export function allMatches(): MatchRecord[] {
  return read();
}

export function clearMatches(): void {
  write([]);
}

export function exportJson(): string {
  return JSON.stringify(read(), null, 2);
}

export interface Summary {
  matches: number;
  aiWinRate: number;
  humanWinRate: number;
  avgLeadChanges: number;
  avgFinalTurnFlips: number;
  avgRelocations: number;
  assistRate: number;
  standFrequency: number;
  stepOffs: number;
  avgGateTurns: number;
  avgInsideTurns: number;
  cards: { id: string; played: number; winRate: number }[];
  locations: { id: string; name: string; avgInfluence: number; played: number }[];
}

export function summarize(records: MatchRecord[] = read()): Summary {
  const n = records.length || 1;
  const ai = records.filter((r) => r.mode === 'ai');
  const cards: Record<string, { played: number; won: number }> = {};
  const locs: Record<string, { total: number; count: number }> = {};
  let assistsOffered = 0;
  let assistsTaken = 0;
  for (const r of records) {
    for (const p of ['A', 'B'] as PlayerId[]) {
      for (const id of r.plays[p]) {
        cards[id] = cards[id] ?? { played: 0, won: 0 };
        cards[id].played++;
        if (r.winner === p) cards[id].won++;
      }
      assistsOffered += r.assists[p].offered;
      assistsTaken += r.assists[p].taken;
    }
    for (const l of r.locations) {
      locs[l.id] = locs[l.id] ?? { total: 0, count: 0 };
      locs[l.id].total += l.influence.A + l.influence.B;
      locs[l.id].count++;
    }
  }
  return {
    matches: records.length,
    aiWinRate: ai.length ? ai.filter((r) => r.winner === 'B').length / ai.length : 0,
    humanWinRate: ai.length ? ai.filter((r) => r.winner === 'A').length / ai.length : 0,
    avgLeadChanges: records.reduce((s, r) => s + r.leadChanges, 0) / n,
    avgFinalTurnFlips: records.reduce((s, r) => s + r.finalTurnFlips, 0) / n,
    avgRelocations: records.reduce((s, r) => s + r.relocations.A + r.relocations.B, 0) / n,
    assistRate: assistsOffered ? assistsTaken / assistsOffered : 0,
    standFrequency: records.reduce((s, r) => s + r.standTurns.length, 0) / n,
    stepOffs: records.filter((r) => r.stepOffTurn).length,
    avgGateTurns: records.reduce((s, r) => s + r.gateTurns, 0) / n,
    avgInsideTurns: records.reduce((s, r) => s + r.insideTurns, 0) / n,
    cards: Object.entries(cards)
      .map(([id, c]) => ({ id, played: c.played, winRate: c.won / c.played }))
      .sort((a, b) => b.played - a.played),
    locations: Object.entries(locs).map(([id, l]) => ({ id, name: LOCATION_BY_ID[id]?.name ?? id, avgInfluence: l.total / l.count, played: l.count })),
  };
}

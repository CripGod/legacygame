/**
 * Core game types. Pure data — no React, no DOM.
 */
import type { RngState } from './rng';

export type PlayerId = 'A' | 'B';
export const PLAYERS: readonly PlayerId[] = ['A', 'B'];
export const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A');

export type Zone = 'gate' | 'inside';

export const TURNS = 9;
/** Stand on Business extends the match to this many turns. */
export const EXTENDED_TURNS = 10;
export const GATE_CAPACITY = 2;
export const INSIDE_CAPACITY = 5;
export const STARTING_HAND = 4;
export const DECK_SIZE = 12;
export const MAX_EVENTS = 2;
export const PLANNING_SECONDS = 120;
export const MAX_STAKES = 4;

// ---------- Card definitions (data-driven) ----------

export type Keyword = 'DIRECT_ENTRY';

export type RevealEffect =
  | { type: 'none' }
  | { type: 'moveFriendlyGate' } // Harriet — needs target
  | { type: 'tempInfluenceOther'; amount: number } // Douglass
  | { type: 'tempInfluenceAllOthersHere'; amount: number } // Garvey
  | { type: 'confrontThreat'; bonus: number } // John Brown
  | { type: 'peekNextReveal' } // Katherine Johnson
  | { type: 'hiddenBonus'; amount: number } // Mansa Musa
  | { type: 'draw'; count: number } // Zora
  | { type: 'blockOneOpposingGate' } // Karen
  | { type: 'blockOpposingGatesHere' } // OG
  | { type: 'readyFriendly' } // Organizer
  | { type: 'weakenThreat'; amount: number } // Ida B. Wells
  | { type: 'challengeGate' } // Nzinga
  | { type: 'challengeInside' } // Toussaint
  | { type: 'suppressInside' }; // Sojourner Truth

export type EstablishedEffect =
  | { type: 'readyRelocatedIn' } // Harriet
  | { type: 'auraInfluenceOthersHere'; amount: number } // Douglass
  | { type: 'assistForceBonus'; amount: number } // John Brown
  | { type: 'relocatedNoDisplace' } // Katherine
  | { type: 'blessNextEstablished'; amount: number } // Mansa Musa
  | { type: 'gateInfluenceHere'; amount: number } // Zora
  | { type: 'extraRelocation'; amount: number } // Pullman Porter
  | { type: 'extraPlay'; amount: number } // Organizer
  | { type: 'opposingGateInfluence'; amount: number } // OG
  | { type: 'influenceOnThreatCleared'; amount: number } // Ida
  | { type: 'forceAuraHere'; amount: number } // Nzinga
  | { type: 'noDisplaceHere' } // Toussaint
  | { type: 'relocatedOutReady' } // Garvey
  | { type: 'noBlockHere' } // Bessie Coleman
  | { type: 'noSuppressHere' } // Sojourner Truth
  | { type: 'relocatedOutInside' }; // Victor Hugo Green

export interface CharacterDef {
  kind: 'character';
  id: string;
  name: string;
  /** Short name used on thumbnails. */
  short: string;
  influence: number;
  force: number;
  tags: string[];
  keywords: Keyword[];
  reveal?: { text: string; effect: RevealEffect; needsTarget?: 'friendlyGateCharAndLocation' };
  established?: { text: string; effect: EstablishedEffect };
  /** Always-on quirks (Karen). */
  passive?: { text: string; unstable?: boolean; leaderPenalty?: number };
  identity: string[];
  era: string;
  blurb: string;
}

export type EventEffect = { type: 'reparations'; max: number } | { type: 'communityDefense'; force: number };

export interface EventDef {
  kind: 'event';
  id: string;
  name: string;
  short: string;
  text: string;
  effect: EventEffect;
  needsLocation: boolean;
  blurb: string;
}

export type CardDef = CharacterDef | EventDef;

export type LocationEffect =
  | { type: 'none' }
  | { type: 'insideInfluence'; amount: number } // Greenwood
  | { type: 'confrontForce'; amount: number } // Harpers Ferry
  | { type: 'relocatedOutReady' } // The Black Star
  | { type: 'firstRelocatedEnters' } // Great Migration
  | { type: 'readyOnArrival' } // Juneteenth
  | { type: 'displaceFreshAtEnd' }; // Sundown Town

export interface LocationDef {
  id: string;
  name: string;
  era: string;
  rule: string;
  blurb: string;
  effect: LocationEffect;
  spawnOnReveal?: string;
  timedThreat?: { turn: number; threatId: string };
  /** True only for the redacted placeholder used in player views. */
  hidden?: boolean;
}

export type ThreatFamily = 'Open Hostility' | 'Systemic Pressure' | 'Complicit Beneficiary' | 'Collaborator' | 'Crisis';

export type ThreatEffect = 'blockEntry' | 'leaderBonus' | 'capacity' | 'mobDisplace' | 'zeroGateInfluence';

export interface ThreatDef {
  id: string;
  name: string;
  family: ThreatFamily;
  text: string;
  /** One instance per player, each player must clear their own. */
  split: boolean;
  /** Force required in a single turn to neutralize. */
  force: number;
  /** Both players must contribute at least 1 Force in the same turn. */
  requiresBoth?: boolean;
  effect: ThreatEffect;
  /** If unresolved for this many full turns, the Location becomes LOST. */
  lostAfterTurns?: number;
  blurb: string;
}

// ---------- Instances / state ----------

export interface CharacterInstance {
  uid: string;
  defId: string;
  owner: PlayerId;
  location: number;
  zone: Zone;
  /** Gate only: may enter during planning. */
  ready: boolean;
  /** Turn the Character arrived at its current Gate (or entered Inside). */
  arrivedTurn: number;
  /** Turn it was relocated (Katherine protection). */
  relocatedTurn?: number;
  permInfluence: number;
  tempInfluence: number;
  blockedEnterTurn?: number;
  suppressedUntilTurn?: number;
  unstable?: boolean;
  /** Mansa Musa: uid of the Character he has blessed. */
  blessedUid?: string | null;
  /** Committed while the Location was hidden (Mansa Musa). */
  wasHiddenAtCommit?: boolean;
  pendingRevealBonus?: number;
  /** Community Defense protection this turn. */
  protectedTurn?: number;
}

export interface ThreatInstance {
  uid: string;
  defId: string;
  location: number;
  /** Split threats target one player. */
  target?: PlayerId;
  forceRequired: number;
  spawnedTurn: number;
}

export interface LocationState {
  index: number;
  defId: string; // 'unknown' in redacted views
  revealed: boolean;
  revealedTurn?: number;
  threats: ThreatInstance[];
  lost: boolean;
  /** Great Migration: uid of first relocated Character this turn. */
  firstRelocatedThisTurn?: string;
  /** Harriet: uid of first relocated Character per owner this turn. */
  firstRelocatedByOwner?: Partial<Record<PlayerId, string>>;
  /** Reparations / temporary location influence per player this turn. */
  tempInfluence: Record<PlayerId, number>;
}

export interface PlayerState {
  id: PlayerId;
  handle: string;
  avatarDefId: string;
  deck: string[]; // ordered card ids; [] in redacted views
  deckCount: number;
  hand: string[]; // 'hidden' entries in redacted views
  discard: string[];
  setbacks: number;
  standUsed: boolean;
  /** Once you Stand on Business you cannot Step Off. */
  cannotStepOff?: boolean;
  solidarity: number;
  /** Katherine Johnson: index of the next Location to reveal. */
  knownNextReveal?: number;
  /** Community Defense: location protected this turn. */
  defendedLocation?: number;
}

export type Phase = 'planning' | 'standResponse' | 'ended';

export interface MatchResult {
  winner: PlayerId | null; // null = draw
  reason: 'locations' | 'tiebreak-influence' | 'tiebreak-force' | 'draw' | 'stepOff';
  locationWinners: (PlayerId | null | 'lost')[];
  influence: Record<PlayerId, number[]>;
  stakes: number;
  turn: number;
}

export interface GameEvent {
  type:
    | 'turnStart'
    | 'draw'
    | 'locationRevealed'
    | 'played'
    | 'eventPlayed'
    | 'reveal'
    | 'moved'
    | 'entered'
    | 'blocked'
    | 'threatSpawned'
    | 'threatNeutralized'
    | 'threatActs'
    | 'locationLost'
    | 'setback'
    | 'ready'
    | 'influence'
    | 'stand'
    | 'standResponse'
    | 'stepOff'
    | 'ended'
    | 'info';
  text: string;
  player?: PlayerId;
  location?: number;
  uid?: string;
  cardId?: string;
  /** True if the event contains information private to `player`. */
  privateTo?: PlayerId;
  data?: Record<string, unknown>;
}

export interface LeadRecord {
  turn: number;
  leaders: (PlayerId | null)[];
}

export interface GameState {
  seed: number;
  rng: RngState;
  turn: number;
  phase: Phase;
  players: Record<PlayerId, PlayerState>;
  locations: LocationState[];
  /** Location indexes in the order they reveal. [] in redacted views. */
  revealOrder: number[];
  characters: Record<string, CharacterInstance>;
  initiative: PlayerId;
  stakes: number;
  /** Number of turns in this match (6, or 7 after Stand on Business). */
  maxTurns: number;
  pendingStand?: { by: PlayerId; proposed: number };
  result?: MatchResult;
  leadHistory: LeadRecord[];
  /** Counter for generating uids. */
  nextUid: number;
  /** Events from the most recent resolution. */
  lastEvents: GameEvent[];
  /** Analytics: per-match counters. */
  stats: MatchStats;
  /** Set on redacted views. */
  viewFor?: PlayerId;
}

export interface MatchStats {
  plays: Record<PlayerId, string[]>;
  relocations: Record<PlayerId, number>;
  assists: Record<PlayerId, { offered: number; taken: number }>;
  leadChanges: number;
  finalTurnFlips: number;
  standTurns: { player: PlayerId; turn: number; proposed: number; accepted: boolean }[];
  stepOffTurn?: { player: PlayerId; turn: number };
  gateTurns: number;
  insideTurns: number;
}

// ---------- Plans (hidden action bundles) ----------

export interface PlayAction {
  cardId: string;
  location: number;
  target?: { charUid?: string; location?: number };
}

export interface TurnPlan {
  /** Cards played this turn, in order. Limited by playsAllowed(). */
  plays: PlayAction[];
  enters: string[];
  relocations: { uid: string; to: number }[];
  confronts: { uid: string; threatUid: string }[];
  standOnBusiness?: boolean;
  stepOff?: boolean;
}

export const emptyPlan = (): TurnPlan => ({ plays: [], enters: [], relocations: [], confronts: [] });

export interface ResolveOutput {
  state: GameState;
  events: GameEvent[];
}

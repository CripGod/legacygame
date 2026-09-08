/**
 * Core game types. Pure data — no React, no DOM.
 */
import type { RngState } from './rng';

export type PlayerId = 'A' | 'B';
export const PLAYERS: readonly PlayerId[] = ['A', 'B'];
export const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A');

export type Zone = 'gate' | 'inside';

export const TURNS = 7;
/** Stand on Business extends the match to this many turns. */
export const EXTENDED_TURNS = 8;
export const GATE_CAPACITY = 2;
export const INSIDE_CAPACITY = 5;
export const STARTING_HAND = 4;
/** Deck size: opening hand plus one draw per turn, with a card to spare after an extended match. */
export const DECK_SIZE = 18;
/** Hand limit: a card drawn into a full hand is discarded. */
export const MAX_HAND = 7;
export const MAX_EVENTS = 2;
export const PLANNING_SECONDS = 120;
export const MAX_STAKES = 4;

// ---------- Card definitions (data-driven) ----------

/** DIRECT_ENTRY: may enter Inside the turn it is played (the player chooses). STRAIGHT_INSIDE: always goes Inside when played. */
export type Keyword = 'DIRECT_ENTRY' | 'STRAIGHT_INSIDE' | 'INFORMANT';

export type RevealEffect =
  | { type: 'none' }
  | { type: 'conductor' } // Harriet: move any friendly Character anywhere, even out of a locked Location — needs target
  | { type: 'moveFriendlyGate' } // Robert Smalls: move a friendly Gate Character for free; cannot break a lock — needs target
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
  | { type: 'suppressInside' } // Sojourner Truth
  | { type: 'refreshOpposingGate' } // Anansi
  | { type: 'challengeAllGates' } // Shango
  | { type: 'permInfluenceOther'; amount: number } // Oshun
  | { type: 'moveFriendlyInsideHere' } // Yemoja — needs target
  | { type: 'confrontAllThreats'; bonus: number } // Ogun
  | { type: 'displaceOpposingGate' } // Mami Wata
  | { type: 'sanctuaryReveal' } // Black Jesus
  | { type: 'holdSeat' } // Claudette Colvin: cannot be displaced this turn
  | { type: 'massEnter' } // Boukman Dutty: every Ready friendly Gate Character everywhere enters now
  | { type: 'hexGate'; amount: number } // Marie Laveau: the strongest opposing Gate Character here loses Influence for good
  | { type: 'returnFriendlyToHand' } // Ayuba Suleiman Diallo: bounce an Established Character to hand at cost 0 — needs target
  | { type: 'peekHand' } // Omar ibn Said: see the opponent's hand
  | { type: 'reduceHandCost'; amount: number } // Cécile Fatiman: the most expensive card in hand costs less
  | { type: 'monument'; amount: number; perOtherHere?: boolean; max?: number; everywhereEstablished?: boolean; underdogBonus?: number } // Artists: underdogBonus applies when the player trails at the Location
  | { type: 'dig'; count: number } // Zora: look at the top cards, keep the dearest, bottom the rest
  | { type: 'energyNext'; amount: number } // Madam C.J. Walker: Energy next turn
  | { type: 'nextCharacterDiscount'; amount: number } // Daniel Payne: your next Character costs less
  | { type: 'relocationNextTurn'; amount: number } // Victor Hugo Green: extra Relocation next turn
  | { type: 'drawPerFriendHere'; max: number }; // Denmark Vesey: draw per other friendly Character here: permanent Influence on the Location itself, which stays when the artist leaves

export type EstablishedEffect =
  | { type: 'readyRelocatedIn' } // Harriet
  | { type: 'auraInfluenceOthersHere'; amount: number } // Douglass
  | { type: 'assistForceBonus'; amount: number } // John Brown
  | { type: 'relocatedNoDisplace' } // Katherine
  | { type: 'blessNextEstablished'; amount: number } // Mansa Musa
  | { type: 'gateInfluenceHere'; amount: number } // Zora
  | { type: 'extraRelocation'; amount: number } // Pullman Porter
  | { type: 'extraEnergy'; amount: number } // Organizer
  | { type: 'opposingGateInfluence'; amount: number } // OG
  | { type: 'influenceOnThreatCleared'; amount: number } // Ida
  | { type: 'forceAuraHere'; amount: number } // Nzinga
  | { type: 'noDisplaceHere' } // Toussaint
  | { type: 'relocatedOutReady' } // Garvey
  | { type: 'noBlockHere' } // Bessie Coleman
  | { type: 'noSuppressHere' } // Sojourner Truth
  | { type: 'relocatedOutInside' } // Victor Hugo Green
  | { type: 'drawOnOpposingPlay' } // Anansi
  | { type: 'confrontForceHere'; amount: number } // Shango
  | { type: 'freshReadyHere' } // Oshun
  | { type: 'relocatedInInside' } // Yemoja
  | { type: 'weakenThreatsHere'; amount: number } // Ogun
  | { type: 'sanctuary'; blessing?: number } // Black Jesus: Threats cannot touch you here; blessing = +Influence to all your Characters everywhere
  | { type: 'cookout'; amount: number } // The Cookout: friends here +Influence, arrivals Ready
  | { type: 'freeDeparture' } // Barber: leaving here never counts against the Relocation limit
  | { type: 'allyBonus'; amount: number } // +Influence while another friendly Character is here
  | { type: 'discountCharacters'; amount: number } // Booker T. Washington: your Characters cost less
  | { type: 'discountEvents'; amount: number } // Omar ibn Said: your Events cost less
  | { type: 'discountTag'; tag: string; amount: number } // Cécile Fatiman: Characters with a tag cost less
  | { type: 'ripen' } // George Washington Carver: each turn the most expensive card in hand gets cheaper
  | { type: 'monumentEachTurn'; amount: number } // Henry Ossawa Tanner
  | { type: 'drawOnEnterHere' } // Richard Allen: draw when one of yours goes Inside here
  | { type: 'drawOnThreatCleared'; count: number } // Callie House: draw when a Threat here is neutralized
  | { type: 'growLowestHere'; amount: number } // Oshun: each turn your weakest Character here grows: the Location gains permanent Influence for you every turn he stays
  | { type: 'shieldHere' }; // Nanny of the Maroons: opposing Reveals cannot target your Characters here

/** Gatherings are never in a deck: they spawn on the board when the world earns them. */
export type CharacterCategory = 'historical' | 'archetype' | 'mythic' | 'gathering' | 'artist';

/** `chance`: the arrival only exists in that fraction of matches, rolled once when the match is created. */
export type SpawnRule = { chance?: number } & (
  | { type: 'establishedAt'; locationId: string; count: number; headline: string; cta: string; unique?: boolean }
  | { type: 'onReveal'; locationId: string; headline: string; cta: string }
  /** A named set of Characters all Established at one Location (the church set). */
  | { type: 'setAt'; locationId: string; cardIds: string[]; headline: string; cta: string }
  /** Arrives in the hand once you have `count` Characters Inside at the Location. */
  | { type: 'insideAt'; locationId: string; count: number; headline: string; cta: string; into: 'hand' }
);

export interface CharacterDef {
  kind: 'character';
  id: string;
  name: string;
  category: CharacterCategory;
  /** Energy to play. Energy each turn equals the turn number. */
  cost: number;
  /** Short name used on thumbnails. */
  short: string;
  /** One plain line for the small card; the full text shows on expand. */
  summary?: string;
  influence: number;
  force: number;
  tags: string[];
  keywords: Keyword[];
  /** Kept in the content but out of decks, galleries and docs for now. */
  hidden?: boolean;
  reveal?: { text: string; effect: RevealEffect; needsTarget?: 'friendlyCharAndLocation' | 'friendlyInsideChar' };
  established?: { text: string; effect: EstablishedEffect };
  /** Always-on quirks (Karen). */
  passive?: {
    text: string;
    unstable?: boolean;
    leaderPenalty?: number;
    regionBonus?: { region: 'africa' | 'americas' | 'atlantic'; influence: number };
    locationBonus?: { locationId: string; influence: number };
    /** Costs `amount` less for each of your Characters on the board with `tag`. */
    tagDiscount?: { tag: string; amount: number };
    /** If displaced, returns to your hand and costs 0 the next time. */
    risesAgain?: boolean;
    /** Curfew never holds this Character, and Sundown Town never runs them out. */
    curfewImmune?: boolean;
    /** Sundown Town: this many friendly Characters who would be run out hide with them overnight instead. */
    shelter?: number;
  };
  /** Gatherings: how and where the card arrives on its own. */
  spawn?: SpawnRule;
  identity: string[];
  era: string;
  blurb: string;
  /** Longer factual history, or origins and tradition for Mythic characters. */
  history?: string;
}

/** Every Event is played into the Event slot under a Location (one per Location per player per turn). It resolves everywhere, and `bonus` says what the Location adds. */
export type EventEffect =
  | { type: 'reparations'; max: number; bonus: { region: 'africa' | 'americas' | 'atlantic'; influence: number } }
  | { type: 'communityDefense'; force: number }
  | { type: 'ancestors'; bonus: { region: 'africa' | 'americas' | 'atlantic'; influence: number } }
  | { type: 'draw'; count: number; bonus: { crowd: number; extra: number } };

export interface EventDef {
  kind: 'event';
  id: string;
  name: string;
  short: string;
  /** Energy to play. */
  cost: number;
  /** One plain line for the small card; the full text shows on expand. */
  summary?: string;
  text: string;
  effect: EventEffect;
  needsLocation: boolean;
  blurb: string;
  /** Where the card comes from. */
  history?: string;
  /** Never in a deck: the board puts it in your hand. */
  spawn?: SpawnRule;
  /** Curses act on the opponent's Characters. Styled dark. */
  curse?: boolean;
}

export type CardDef = CharacterDef | EventDef;

export type LocationEffect =
  | { type: 'none' }
  | { type: 'insideInfluence'; amount: number } // Greenwood
  | { type: 'confrontForce'; amount: number } // Harpers Ferry
  | { type: 'relocatedOutReady' } // The Black Star
  | { type: 'firstRelocatedEnters' } // Great Migration
  | { type: 'readyOnArrival' } // Juneteenth
  | { type: 'displaceFreshAtEnd' } // Sundown Town
  | { type: 'steelAndSoul'; force: number; fiveBonus: number } // Gary, Indiana
  | { type: 'relocatedInReady' } // Accra, Ghana
  | { type: 'hub' } // Lagos
  | { type: 'lockInside'; turns: number } // The Justice System
  | { type: 'noDisplace' } // The Tabernacle
  | { type: 'restEnergy'; count: number; amount: number } // Oak Bluffs: players with `count` Inside gain Energy next turn
  | { type: 'turncoatAtEnd' }; // Charleston, 1822: the Fresh Gate Character here with the lowest Influence changes sides at the end of the turn

export interface LocationDef {
  id: string;
  name: string;
  era: string;
  rule: string;
  blurb: string;
  effect: LocationEffect;
  spawnOnReveal?: string;
  timedThreat?: { turn: number; threatId: string };
  /** Relative chance of being drawn into a match (default 1). */
  weight?: number;
  /** Not drawn directly; reached by transformation. */
  notInPool?: boolean;
  /** Becomes another Location this many turns after it reveals. */
  transformsInto?: { id: string; afterTurns: number };
  /** Neutral Threats never appear here. */
  noThreats?: boolean;
  /** Threat ids that can never appear here. */
  immuneThreats?: string[];
  /** Broad region, for cards with a home-ground bonus. */
  region?: 'africa' | 'americas' | 'atlantic';
  /** At night (even turns) nobody relocates out of here. Only Harriet Tubman can move them. */
  curfew?: boolean;
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
  /** Informants: the player who planted this Character on the other side. */
  plantedBy?: PlayerId;
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
  /** Why the Location became Lost. */
  lostReason?: string;
  /** Great Migration: uid of first relocated Character this turn. */
  firstRelocatedThisTurn?: string;
  /** Harriet: uid of first relocated Character per owner this turn. */
  firstRelocatedByOwner?: Partial<Record<PlayerId, string>>;
  /** Reparations / temporary location influence per player this turn. */
  tempInfluence: Record<PlayerId, number>;
  /** Permanent per-player Influence modifiers at this Location (broken pacts). */
  permInfluence?: Record<PlayerId, number>;
  /** Obatala has manifested here: no Threats, cannot be Lost. */
  sanctified?: boolean;
  /** A Summon was agreed here and failed; losing the Location now costs both players. */
  pactFailed?: boolean;
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
  /** Gathering cards that already arrived for this player this match. */
  spawned: string[];
  /** Permanent extra Energy per turn (tests and future cards). */
  energyBonus?: number;
  /** Extra Energy on the coming turn only (Oak Bluffs). */
  energyNextTurn?: number;
  /** Energy granted by a Reveal this turn, paid out next turn (survives the end-of-turn reset). */
  energyBanked?: number;
  /** Daniel Payne: the next Character played on a later turn costs this much less. */
  nextCharacterDiscount?: { amount: number; since: number };
  /** Victor Hugo Green: extra Relocations granted for next turn, and the ones live this turn. */
  relocationsNextTurn?: number;
  relocationsBonus?: number;
  /** Energy discounts earned while a card sits in hand (card id → amount). Cleared when the card leaves the hand. */
  discounts?: Record<string, number>;
  /** Once you Stand on Business you cannot Sit Down. */
  cannotStepOff?: boolean;
  solidarity: number;
  /** Katherine Johnson: index of the next Location to reveal. */
  knownNextReveal?: number;
  /** Community Defense: Location where your Characters confront with extra Force this turn. */
  defendedLocation?: number;
  /** Community Defense: turn on which none of your Characters can be blocked or displaced. */
  defendedTurn?: number;
  /** Chairteenth: location where +Force lands against one Threat this turn. */
  chairLocation?: number;
}

export type Phase = 'planning' | 'ended';

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
    | 'locationTransformed'
    | 'summon'
    | 'played'
    | 'eventPlayed'
    | 'spawned'
    | 'reveal'
    | 'moved'
    | 'entered'
    | 'blocked'
    | 'threatSpawned'
    | 'threatNeutralized'
    | 'showdown'
    | 'clash'
    | 'threatActs'
    | 'locationLost'
    | 'setback'
    | 'ready'
    | 'influence'
    | 'stand'
    | 'stakes'
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
  /** Stands on Business that have not taken effect yet: each doubles the Stakes at the end of the turn after it was declared. */
  pendingRaises: { by: PlayerId; declaredTurn: number }[];
  /** Once-per-match dice for arrivals that only happen some matches (card id -> rolled true). Hidden from views. */
  spawnRolls: Record<string, boolean>;
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
  /** accepted = the raise took effect (the other side did not Sit Down first). */
  standTurns: { player: PlayerId; turn: number; proposed: number; accepted: boolean }[];
  summons: { turn: number; location: number; success: boolean }[];
  stepOffTurn?: { player: PlayerId; turn: number };
  gateTurns: number;
  insideTurns: number;
}

// ---------- Plans (hidden action bundles) ----------

export interface PlayAction {
  cardId: string;
  location: number;
  target?: { charUid?: string; location?: number };
  /** Direct Entry only: go Inside this turn instead of waiting at the Gates. */
  enter?: boolean;
}

export interface TurnPlan {
  /** Cards played this turn, in order. Limited by playsAllowed(). */
  plays: PlayAction[];
  enters: string[];
  relocations: { uid: string; to: number }[];
  confronts: { uid: string; threatUid: string }[];
  standOnBusiness?: boolean;
  stepOff?: boolean;
  /** Commit to a joint Summon at this Location this turn. Both players must commit for it to happen. */
  summon?: { location: number };
}

export const emptyPlan = (): TurnPlan => ({ plays: [], enters: [], relocations: [], confronts: [] });

/** One beat of a turn's resolution, for the UI to replay: the board as it stood right after this beat. */
export interface TraceStep {
  kind: 'stand' | 'reveal' | 'play' | 'event' | 'revealFx' | 'enter' | 'move' | 'showdown' | 'summon' | 'threat' | 'spawn' | 'ready' | 'sundown' | 'turncoat' | 'info' | 'tally' | 'stakes';
  label: string;
  state: GameState;
  /** Events produced by this beat alone. */
  events: GameEvent[];
  uids?: string[];
  location?: number;
  player?: PlayerId;
  cardId?: string;
  /** Event cards played this turn that have not resolved yet at this beat (they sit at the Gates until they do). */
  pendingEvents?: { cardId: string; player: PlayerId; location: number }[];
}

export interface ResolveOptions {
  /** Record a TraceStep after every beat. Costs clones; the AI never asks for it. */
  trace?: boolean;
}

export interface ResolveOutput {
  state: GameState;
  events: GameEvent[];
  trace?: TraceStep[];
}

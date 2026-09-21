/**
 * Writes the content tables as JSON for the Unity port: every Character (hidden ones flagged), Event, Threat, Location,
 * the preset decks, the team-ups, the summon, the references and the rule constants. One file, loaded by the port at
 * startup (a TextAsset under Resources). Run: npm run export
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CHARACTERS, EVENTS, THREATS, LOCATIONS, UNKNOWN_LOCATION, PRESET_DECKS, RANDOM_THREAT_POOL, TEAM_UPS, SUMMON, referencesFor } from '../src/engine/content';
import * as T from '../src/engine/types';
import { SECOND_WAVE_TURN, SECOND_WAVE_CHANCE, THIRD_WAVE_TURN, THIRD_WAVE_CHANCE } from '../src/engine/setup';

const root = process.cwd();
const out = path.join(root, 'unity/StandOnBusiness/Assets/StandOnBusiness/Resources/content.json');
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  /* no git */
}

const constants = {
  TURNS: T.TURNS,
  EXTENDED_TURNS: T.EXTENDED_TURNS,
  INSIDE_INFLUENCE_BONUS: T.INSIDE_INFLUENCE_BONUS,
  ENERGY_CURVE: T.ENERGY_CURVE,
  ENERGY_CAP: T.ENERGY_CAP,
  LAST_WORD_ENERGY: T.LAST_WORD_ENERGY,
  MAX_ENERGY: T.MAX_ENERGY,
  LAST_WORD_DRAW: T.LAST_WORD_DRAW,
  WEB_SMALL: T.WEB_SMALL,
  WEB_LARGE: T.WEB_LARGE,
  RECONSTRUCTION_TURNS: T.RECONSTRUCTION_TURNS,
  GATE_CAPACITY: T.GATE_CAPACITY,
  INSIDE_CAPACITY: T.INSIDE_CAPACITY,
  STARTING_HAND: T.STARTING_HAND,
  DECK_SIZE: T.DECK_SIZE,
  MAX_HAND: T.MAX_HAND,
  LEGEND_READY: T.LEGEND_READY,
  MAX_EVENTS: T.MAX_EVENTS,
  PLANNING_SECONDS: T.PLANNING_SECONDS,
  MAX_STAKES: T.MAX_STAKES,
  STAND_MULTIPLIERS: T.STAND_MULTIPLIERS,
  SECOND_WAVE_TURN,
  SECOND_WAVE_CHANCE,
  THIRD_WAVE_TURN,
  THIRD_WAVE_CHANCE,
};

const ids = [...CHARACTERS, ...EVENTS, ...THREATS, ...LOCATIONS].map((d) => d.id);
const references = Object.fromEntries(ids.map((id) => [id, referencesFor(id)]).filter(([, r]) => (r as unknown[]).length));

const content = {
  format: 1,
  source: { commit, generator: 'scripts/export.ts' },
  constants,
  characters: CHARACTERS.map((c) => ({ ...c, hidden: c.hidden ?? false })),
  events: EVENTS,
  threats: THREATS,
  randomThreatPool: RANDOM_THREAT_POOL,
  locations: LOCATIONS,
  unknownLocation: UNKNOWN_LOCATION,
  decks: Object.fromEntries(Object.entries(PRESET_DECKS).map(([k, d]) => [k, { key: k, ...d }])),
  teamUps: TEAM_UPS,
  summon: SUMMON,
  references,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
const json = JSON.stringify(content, null, 1);
fs.writeFileSync(out, json);
console.log(path.relative(root, out), `${(json.length / 1024).toFixed(0)}KB ·`, `${content.characters.length} characters, ${content.events.length} events, ${content.threats.length} threats, ${content.locations.length} locations, ${Object.keys(content.decks).length} decks, ${content.teamUps.length} team-ups`);

/** Every particle preset, by id. Add a JSON file under presets/ and list it here; the editor (?fx=1) tunes and saves them. */
import type { FxPreset } from './schema';
import emberLanding from './presets/ember-landing.json';

export const PRESETS: Record<string, FxPreset> = {
  [emberLanding.id]: emberLanding as FxPreset,
};

export const PRESET_IDS = Object.keys(PRESETS);

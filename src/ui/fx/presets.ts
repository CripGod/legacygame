/**
 * Every particle preset, by id. Add a JSON file under presets/ and list it here; the editor (?fx=1) tunes and saves them.
 * A copy saved in this browser (the editor's Save where there is no dev server: the preview, the live site) wins over the
 * shipped file, so a match played there shows the tuned effect; Copy JSON carries it into the repo.
 */
import { validatePreset, type FxPreset } from './schema';
import emberLanding from './presets/ember-landing.json';
import influenceFlow from './presets/influence-flow.json';

export const PRESETS: Record<string, FxPreset> = {
  [emberLanding.id]: emberLanding as FxPreset,
  [influenceFlow.id]: influenceFlow as FxPreset,
};

export const PRESET_IDS = Object.keys(PRESETS);

const KEY = (id: string) => `sob.fx.${id}`;

/** The preset in force: this browser's saved copy if it has one and it is sound, else the shipped one. */
export function getPreset(id: string): FxPreset {
  const shipped = PRESETS[id];
  try {
    const raw = localStorage.getItem(KEY(id));
    if (raw) {
      const p = JSON.parse(raw) as FxPreset;
      if (p && p.id === id && validatePreset(p).length === 0) return p;
    }
  } catch {
    /* no storage: the shipped preset */
  }
  return shipped;
}

export function hasBrowserCopy(id: string): boolean {
  try {
    return !!localStorage.getItem(KEY(id));
  } catch {
    return false;
  }
}

export function saveBrowserCopy(p: FxPreset): boolean {
  try {
    localStorage.setItem(KEY(p.id), JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function clearBrowserCopy(id: string): void {
  try {
    localStorage.removeItem(KEY(id));
  } catch {
    /* nothing to clear */
  }
}

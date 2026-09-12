import { useSyncExternalStore } from 'react';

/**
 * Audio preferences: music and sound effects, each with its own switch, remembered in localStorage.
 * Nothing here touches the engine; the audio layer is UI-only and a Unity port keeps the same two switches.
 */
export interface AudioSettings {
  music: boolean;
  sfx: boolean;
}

const KEY = 'bhcb.audio.v1';

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<AudioSettings>;
      return { music: j.music !== false, sfx: j.sfx !== false };
    }
  } catch {
    /* private mode or blocked storage: defaults */
  }
  return { music: true, sfx: true };
}

let settings: AudioSettings = load();
const listeners = new Set<() => void>();

export function getAudioSettings(): AudioSettings {
  return settings;
}

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* fine */
  }
  for (const l of listeners) l();
}

export function subscribeAudio(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribeAudio, getAudioSettings, getAudioSettings);
}

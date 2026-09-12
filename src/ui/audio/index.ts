import { musicUnlock, musicWanted, syncMusic, MUSIC_TRACK, musicIsPlaying } from './music';
import { sfx, sfxUnlock, sfxReady, SFX_EVENTS, type SfxName } from './sfx';
import { getAudioSettings, setAudioSettings, useAudioSettings, type AudioSettings } from './settings';

export { sfx, sfxUnlock, sfxReady, SFX_EVENTS, musicWanted, syncMusic, MUSIC_TRACK, musicIsPlaying, getAudioSettings, setAudioSettings, useAudioSettings };
export type { SfxName, AudioSettings };

let installed = false;

/**
 * Wire the audio layer to the document once: the first gesture unlocks music and effects
 * (browsers allow sound only after one), and every button click plays its `data-sfx` sound,
 * or `tap` when it has none. `data-sfx="off"` keeps a button silent.
 */
export function installAudio(): () => void {
  if (installed || typeof window === 'undefined') return () => undefined;
  installed = true;
  const unlock = () => {
    sfxUnlock();
    musicUnlock();
  };
  const unlockOpts: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener('pointerdown', unlock, unlockOpts);
  window.addEventListener('keydown', unlock, unlockOpts);
  const onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    const el = target?.closest?.('button, [role="button"], [data-sfx]');
    if (!el) return;
    if ((el as HTMLButtonElement).disabled) return;
    const name = el.getAttribute('data-sfx');
    if (name === 'off') return;
    sfx((name as SfxName | null) ?? 'tap');
  };
  document.addEventListener('click', onClick, true);
  return () => {
    installed = false;
    window.removeEventListener('pointerdown', unlock, unlockOpts);
    window.removeEventListener('keydown', unlock, unlockOpts);
    document.removeEventListener('click', onClick, true);
  };
}

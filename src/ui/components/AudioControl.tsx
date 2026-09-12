import { MUSIC_TRACK, setAudioSettings, sfx, useAudioSettings } from '../audio';
import { tip } from '../tip';

/** Two small switches: music and sound effects. Lives on the landing page and in the match HUD. */
export function AudioControl({ className }: { className?: string }) {
  const s = useAudioSettings();
  return (
    <div className={`audio-ctl ${className ?? ''}`} role="group" aria-label="Sound">
      <button
        className={`audio-btn ${s.music ? 'on' : ''}`}
        data-sfx="toggle"
        aria-pressed={s.music}
        onClick={() => setAudioSettings({ music: !s.music })}
        {...tip(s.music ? `Music on: ${MUSIC_TRACK.title}. Tap to mute.` : `Music off. Tap to play ${MUSIC_TRACK.title}.`)}
      >
        ♪
      </button>
      <button
        className={`audio-btn ${s.sfx ? 'on' : ''}`}
        data-sfx="off"
        aria-pressed={s.sfx}
        onClick={() => {
          setAudioSettings({ sfx: !s.sfx });
          if (!s.sfx) sfx('toggle');
        }}
        {...tip(s.sfx ? 'Sound effects on. Tap to mute.' : 'Sound effects off. Tap to turn them on.')}
      >
        {s.sfx ? '🔊' : '🔇'}
      </button>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { MUSIC_TRACK, setAudioSettings, sfx, useAudioSettings } from '../audio';
import { tip } from '../tip';

/**
 * A gear that opens a small menu of switches: music and sound effects. Lives in the landing page's corner and under
 * the Stand button in the match, so the switches themselves stay out of the way.
 */
export function SettingsMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const s = useAudioSettings();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className={`settings ${open ? 'open' : ''} ${className ?? ''}`} ref={root}>
      <button className="settings-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} {...tip('Settings: music and sound.')}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 3.5a8.6 8.6 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a8 8 0 0 0-2.1-1.2L15.4 3h-4l-.4 2.6a8 8 0 0 0-2.1 1.2l-2.4-1-2 3.4 2 1.6a8.6 8.6 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 2.1 1.2l.4 2.6h4l.4-2.6a8 8 0 0 0 2.1-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
        </svg>
      </button>
      {open && (
        <div className="settings-menu" role="menu" aria-label="Settings">
          <button className="settings-row" role="menuitemcheckbox" aria-checked={s.music} data-sfx="toggle" onClick={() => setAudioSettings({ music: !s.music })}>
            <span className="settings-lbl">Music</span>
            <span className="settings-hint">{MUSIC_TRACK.title}</span>
            <span className={`switch ${s.music ? 'on' : ''}`} aria-hidden />
          </button>
          <button
            className="settings-row"
            role="menuitemcheckbox"
            aria-checked={s.sfx}
            data-sfx="off"
            onClick={() => {
              setAudioSettings({ sfx: !s.sfx });
              if (!s.sfx) sfx('toggle');
            }}
          >
            <span className="settings-lbl">Sound effects</span>
            <span className="settings-hint">Cards, clashes, the crowd</span>
            <span className={`switch ${s.sfx ? 'on' : ''}`} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

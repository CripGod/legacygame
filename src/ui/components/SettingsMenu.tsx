import { useEffect, useRef, useState } from 'react';
import { MUSIC_TRACK, setAudioSettings, sfx, useAudioSettings } from '../audio';
import { hideTip, tip } from '../tip';
import { setHints, useHints } from '../hints';

/**
 * A speaker that opens a small menu of switches: music, sound effects and hints. Lives in the landing page's corner and under
 * the Stand button in the match, so the switches themselves stay out of the way.
 */
export function SettingsMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const s = useAudioSettings();
  const hints = useHints();
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
      <button className="settings-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} {...tip('Settings: sound and hints.')}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M3 9.5v5h3.6L12 19V5L6.6 9.5H3zm11.5-1.2v7.4a3.9 3.9 0 0 0 0-7.4zm0-3.6v2.1a5.6 5.6 0 0 1 0 10.4v2.1a7.6 7.6 0 0 0 0-14.6z" />
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
          <button
            className="settings-row"
            role="menuitemcheckbox"
            aria-checked={hints}
            data-sfx="toggle"
            onClick={() => {
              setHints(!hints);
              if (hints) hideTip();
            }}
          >
            <span className="settings-lbl">Hints</span>
            <span className="settings-hint">Explanations on hover</span>
            <span className={`switch ${hints ? 'on' : ''}`} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

import { HINTS, tip } from '../tip';

/** A crescent moon, drawn rather than an emoji so it matches the frames. */
export function MoonIcon() {
  return (
    <svg className="sky-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 2.5a9.5 9.5 0 1 0 7 15.8A8 8 0 0 1 14.5 2.5z" fill="currentColor" />
      <circle cx="18.5" cy="5.5" r="1" fill="currentColor" />
      <circle cx="21.5" cy="9" r="0.7" fill="currentColor" />
    </svg>
  );
}

/** A sun with eight rays. */
export function SunIcon() {
  return (
    <svg className="sky-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </svg>
  );
}

/**
 * The sky over a curfew Location: an engraved badge on the title band. Night carries the curfew with it
 * (nobody relocates out until morning); day is the all-clear.
 */
export function SkyTag({ night }: { night: boolean }) {
  return night ? (
    <span className="sky-tag night" {...tip(HINTS.locked)}>
      <MoonIcon />
      Night
      <i>Curfew</i>
    </span>
  ) : (
    <span className="sky-tag day" {...tip(HINTS.dayNight)}>
      <SunIcon />
      Day
    </span>
  );
}

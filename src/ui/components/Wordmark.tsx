import { LOGO_MASK, LOGO_RATIO } from '../logo';

/** The 'Stand on Business' script wordmark. It is an alpha mask, so the surrounding CSS decides its colour. */
export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`logo ${className}`} role="img" aria-label="Stand on Business" style={{ WebkitMaskImage: `url(${LOGO_MASK})`, maskImage: `url(${LOGO_MASK})`, aspectRatio: String(LOGO_RATIO) }} />;
}

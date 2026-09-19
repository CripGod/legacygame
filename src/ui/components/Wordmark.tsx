import { artUrl } from '../art';
import { LOGO_RATIO } from '../logo';

/**
 * The 'Stand on Business' brush wordmark. By default the art itself: gold brush lettering with the crown. `ink`
 * renders the lettering as an alpha mask instead, so the surrounding CSS paints it in one colour (the Compendium's
 * flat navy on parchment).
 */
export function Wordmark({ className = '', ink = false }: { className?: string; ink?: boolean }) {
  if (ink) {
    const mask = `url(${artUrl('landing', 'sob-logo-mask', 'png')})`;
    return <span className={`logo ink ${className}`} role="img" aria-label="Stand on Business" style={{ WebkitMaskImage: mask, maskImage: mask, aspectRatio: String(LOGO_RATIO) }} />;
  }
  return <img className={`logo ${className}`} src={artUrl('landing', 'sob-logo', 'webp')} alt="Stand on Business" draggable={false} style={{ aspectRatio: String(LOGO_RATIO) }} />;
}

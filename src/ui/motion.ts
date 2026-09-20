/** The user asked the OS for less motion: the big moves are skipped or shortened. */
export const reduceMotion = (): boolean => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) || false;

/** Мгновенные программные скроллы, когда пользователь просит меньше движения. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

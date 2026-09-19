import { type RefObject, useLayoutEffect, useRef } from 'react';

const SETTLE_FRAMES = 2;
const STABLE_PX = 1;
const VIEWPORT_SELECTOR = '[data-slot="message-scroller-viewport"]';

/**
 * Держит шапку сворачиваемой строки на том же уровне вьюпорта.
 * MessageScroller при прибитом низе тянет ленту к концу на любое изменение высоты,
 * поэтому после переключения возвращаем шапку на место остаточным сдвигом.
 * Замер остаточный: нативное scroll anchoring уже учтено, правим только рывок примитива.
 * Удержать физически нельзя, когда схлопывается последний бокс у низа (clamp):
 * тогда выходит мгновенная посадка вместо догоняющей анимации.
 */
export function useScrollAnchor(targetRef: RefObject<HTMLElement | null>, key: boolean): void {
  const prevKey = useRef(key);
  const anchor = useRef<number | null>(null);

  if (prevKey.current !== key) {
    prevKey.current = key;
    // Render-фаза: DOM ещё отражает старое состояние, считываем позицию шапки до мутации.
    const target = targetRef.current;
    anchor.current = target ? target.getBoundingClientRect().top : null;
  }

  // Без deps: эффект идёт на каждый коммит, работает только когда render-фаза
  // зафиксировала смену ключа в anchor.
  useLayoutEffect(() => {
    const saved = anchor.current;
    anchor.current = null;
    if (saved === null) {
      return;
    }
    const target = targetRef.current;
    const viewport = target?.closest(VIEWPORT_SELECTOR);
    if (!target || !(viewport instanceof HTMLElement)) {
      return;
    }
    let frame = 0;
    let raf = 0;
    const settle = () => {
      raf = 0;
      // Второй кадр ловит запоздалый scrollTo примитива: ResizeObserver отрабатывает до rAF.
      const delta = target.getBoundingClientRect().top - saved;
      if (Math.abs(delta) > STABLE_PX) {
        viewport.scrollTop += delta;
      }
      frame += 1;
      if (frame < SETTLE_FRAMES) {
        raf = requestAnimationFrame(settle);
      }
    };
    raf = requestAnimationFrame(settle);
    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  });
}

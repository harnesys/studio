const IDLE_MS = 600;

const timers = new WeakMap<Element, number>();

function reveal(el: Element) {
  el.setAttribute('data-scrolling', '');
  const prev = timers.get(el);
  if (prev !== undefined) {
    clearTimeout(prev);
  }
  timers.set(
    el,
    window.setTimeout(() => {
      el.removeAttribute('data-scrolling');
      timers.delete(el);
    }, IDLE_MS),
  );
}

document.addEventListener(
  'scroll',
  (event) => {
    const target = event.target;
    if (target instanceof Element) {
      reveal(target);
    } else if (target instanceof Document) {
      reveal(target.documentElement);
    }
  },
  { capture: true, passive: true },
);

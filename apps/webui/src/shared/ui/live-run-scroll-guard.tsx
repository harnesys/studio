import { useEffect, useRef } from 'react';

const TAIL_MS = 1500;
const END_EPS = 2;
const MOVE_EPS = 1;
const PAD_CAP = 0.9;

export function LiveRunScrollGuard({ active }: { active: boolean }) {
  const padRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const pad = padRef.current;
    const content = pad?.parentElement;
    const viewport = pad?.closest('[data-slot="message-scroller-viewport"]');
    if (!pad || !(content instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
      return;
    }
    const state = {
      prevTop: null as number | null,
      pad: Number.parseFloat(pad.style.height) || 0,
      gap: rowGap(content),
      until: 0,
      frame: 0,
    };
    const setPad = (value: number) => {
      state.pad = Math.max(0, Math.ceil(value));
      pad.hidden = state.pad === 0;
      pad.style.height = `${state.pad}px`;
      pad.style.marginTop = state.pad > 0 ? `${-state.gap}px` : '';
    };
    const step = () => {
      state.frame = 0;
      const top = viewport.scrollTop;
      const height = viewport.scrollHeight;
      const client = viewport.clientHeight;
      const now = performance.now();
      if (activeRef.current) {
        state.until = now + TAIL_MS;
      }
      if (state.prevTop === null) {
        state.prevTop = top;
        return;
      }
      const enforce = activeRef.current || now < state.until;
      const slack = height - top - client;
      const atEnd = slack <= END_EPS;
      if (enforce && atEnd && top < state.prevTop - MOVE_EPS) {
        const missing = state.prevTop + client - height;
        const cap = client * PAD_CAP;
        if (missing > 0 && state.pad < cap) {
          setPad(Math.min(cap, state.pad + missing));
        }
        viewport.scrollTo({
          top: Math.min(state.prevTop, viewport.scrollHeight - client),
          behavior: 'instant',
        });
      } else if (state.pad > 0 && slack > 0) {
        setPad(state.pad - Math.min(state.pad, slack));
      }
      state.prevTop = viewport.scrollTop;
    };
    const schedule = () => {
      if (!state.frame) {
        state.frame = requestAnimationFrame(step);
      }
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(content);
    viewport.addEventListener('scroll', schedule, { passive: true });
    schedule();
    return () => {
      observer.disconnect();
      viewport.removeEventListener('scroll', schedule);
      if (state.frame) {
        cancelAnimationFrame(state.frame);
        state.frame = 0;
      }
    };
  }, []);
  return <div ref={padRef} aria-hidden data-slot="live-run-pad" hidden className="shrink-0" />;
}

function rowGap(el: HTMLElement): number {
  const style = window.getComputedStyle(el);
  const raw = style.rowGap === 'normal' ? style.gap : style.rowGap;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

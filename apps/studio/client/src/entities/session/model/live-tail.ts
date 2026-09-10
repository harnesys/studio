import type { SessionEvent } from '@harnesys/studio-shared';
import { useSyncExternalStore } from 'react';

export type LiveTailKind = 'reasoning' | 'text' | null;

export type LiveTail = {
  kind: LiveTailKind;
  id: string | undefined;
  text: string;
};

const EMPTY: LiveTail = { kind: null, id: undefined, text: '' };

const tails = new Map<string, LiveTail>();
const sealed = new Set<string>();
const listeners = new Map<string, Set<() => void>>();
const scheduled = new Set<string>();

export function getLiveTail(threadId: string | undefined): LiveTail {
  if (!threadId) {
    return EMPTY;
  }
  return tails.get(threadId) ?? EMPTY;
}

export function subscribeLiveTail(
  threadId: string | undefined,
  onStoreChange: () => void,
): () => void {
  if (!threadId) {
    return () => {};
  }
  let set = listeners.get(threadId);
  if (!set) {
    set = new Set();
    listeners.set(threadId, set);
  }
  set.add(onStoreChange);
  return () => {
    set.delete(onStoreChange);
    if (set.size === 0) {
      listeners.delete(threadId);
    }
  };
}

function notify(threadId: string): void {
  if (scheduled.has(threadId)) {
    return;
  }
  scheduled.add(threadId);
  const run = () => {
    scheduled.delete(threadId);
    const set = listeners.get(threadId);
    if (!set) {
      return;
    }
    for (const cb of set) {
      cb();
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
    return;
  }
  setTimeout(run, 16);
}

/**
 * Пишет открытый text/reasoning-блок. `continue` — тот же слот,
 * `open` — новый блок (первый токен или слот после seal).
 */
export function ingestLiveDelta(threadId: string, event: SessionEvent): 'open' | 'continue' {
  if (event.type !== 'reasoning-delta' && event.type !== 'text-delta') {
    return 'continue';
  }
  const kind: LiveTailKind = event.type === 'reasoning-delta' ? 'reasoning' : 'text';
  const id = event.id;
  const prev = tails.get(threadId);
  const sameSlot = prev !== undefined && prev.kind === kind && prev.id === id;
  if (!sealed.has(threadId) && sameSlot) {
    tails.set(threadId, { kind, id, text: prev.text + event.text });
    notify(threadId);
    return 'continue';
  }
  sealed.delete(threadId);
  tails.set(threadId, { kind, id, text: event.text });
  notify(threadId);
  return 'open';
}

/** Следующая дельта с тем же id — новый блок (между ними был tool/start/end). */
export function sealLiveTail(threadId: string): void {
  sealed.add(threadId);
}

export function clearLiveTail(threadId: string): void {
  tails.delete(threadId);
  sealed.delete(threadId);
  notify(threadId);
}

export function clearLiveTails(threadIds: string[]): void {
  for (const id of threadIds) {
    tails.delete(id);
    sealed.delete(id);
    notify(id);
  }
}

/** Подписка только у живого листа (Thought, последний markdown). Без threadId — пусто. */
export function useLiveTail(threadId: string | undefined): LiveTail {
  return useSyncExternalStore(
    (onStoreChange) => subscribeLiveTail(threadId, onStoreChange),
    () => getLiveTail(threadId),
    () => EMPTY,
  );
}

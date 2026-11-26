export type UnlockLevel = 'B2' | 'C1';

type Listener = (level: UnlockLevel | null) => void;
const listeners = new Set<Listener>();
const queue: UnlockLevel[] = [];
let showing = false;

export function subscribeLevelUnlock(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(level: UnlockLevel | null) {
  listeners.forEach((listener) => listener(level));
}

export function publishLevelUnlocks(levels: readonly UnlockLevel[]) {
  for (const level of levels) {
    if (!queue.includes(level)) queue.push(level);
  }
  if (!showing && queue[0]) {
    showing = true;
    emit(queue[0]);
  }
}

export function dismissLevelUnlock() {
  queue.shift();
  showing = Boolean(queue[0]);
  emit(queue[0] ?? null);
}

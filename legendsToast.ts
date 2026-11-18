type Listener = (id: string | null) => void;
const listeners = new Set<Listener>();
const queue: string[] = [];
let showing = false;

export function subscribeLegendUnlock(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(id: string | null) {
  listeners.forEach((listener) => listener(id));
}

export function enqueueLegendUnlocks(ids: readonly string[]) {
  for (const id of ids) {
    if (id && !queue.includes(id)) queue.push(id);
  }
  if (!showing && queue[0]) {
    showing = true;
    emit(queue[0]);
  }
}

export function dismissLegendUnlock() {
  queue.shift();
  showing = Boolean(queue[0]);
  emit(queue[0] ?? null);
}

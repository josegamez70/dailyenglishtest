let retro = false;
const listeners = new Set<() => void>();

export function setRetroActive(on: boolean) {
  if (retro === on) return;
  retro = on;
  listeners.forEach((listener) => listener());
}

export function useRetro(): boolean {
  return retro;
}

export function subscribeRetro(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

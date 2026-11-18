import { freshBadges, type BadgeId, type BadgeStats } from './badges.ts';

type Listener = (id: BadgeId | null) => void;
const listeners = new Set<Listener>();
const queue: BadgeId[] = [];
let showing = false;

export function subscribeBadgeUnlock(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(id: BadgeId | null) {
  listeners.forEach((listener) => listener(id));
}

export function enqueueBadgeUnlocks(ids: readonly BadgeId[]) {
  for (const id of ids) {
    if (!queue.includes(id)) queue.push(id);
  }
  if (!showing && queue[0]) {
    showing = true;
    emit(queue[0]);
  }
}

export function dismissBadgeUnlock() {
  queue.shift();
  showing = Boolean(queue[0]);
  emit(queue[0] ?? null);
}

export function publishBadgeProgress(before: BadgeStats, after: BadgeStats, now = new Date()) {
  enqueueBadgeUnlocks(freshBadges(before, after, now));
}

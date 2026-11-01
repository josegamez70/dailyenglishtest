export const VOICE_LIST_TIMEOUT_MS = 700;

/** Slower is 70% of the saved profile speed. Pitch is not part of this. */
export function slowerPlaybackRate(profileSpeed: number): number {
  return profileSpeed * 0.7;
}

type VoiceSource<T> = {
  getVoices: () => T[];
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

/**
 * Resolves with the device voice list.
 * A non-empty list resolves immediately. An empty list waits for voiceschanged.
 * After the timeout, the promise resolves with whatever is available, including an empty list,
 * so playback can continue with lang en-US and no voice selected.
 */
export function whenVoicesReady<T>(
  speech: VoiceSource<T>,
  schedule: (callback: () => void, delayMs: number) => void = (callback, delayMs) => {
    setTimeout(callback, delayMs);
  },
  timeoutMs = VOICE_LIST_TIMEOUT_MS,
): Promise<T[]> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (list: T[]) => {
      if (settled) return;
      settled = true;
      try {
        speech.removeEventListener('voiceschanged', onVoices);
      } catch {
        /* the list can still be used */
      }
      resolve(list);
    };
    const read = (): T[] => {
      try {
        return speech.getVoices() ?? [];
      } catch {
        return [];
      }
    };
    const onVoices = () => {
      const list = read();
      if (list.length) finish(list);
    };
    try {
      const ready = read();
      if (ready.length) {
        resolve(ready);
        return;
      }
      speech.addEventListener('voiceschanged', onVoices);
      schedule(() => finish(read()), timeoutMs);
    } catch {
      resolve([]);
    }
  });
}

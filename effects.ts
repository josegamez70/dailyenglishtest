const SOUND_KEY = 'sound-effects';

type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type EffectName = 'correct' | 'wrong' | 'complete';

function memory(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Off until the learner turns it on. A missing value stays off. */
export function soundEffectsEnabled(store?: Store | null): boolean {
  const box = store === undefined ? memory() : store;
  if (!box) return false;
  try {
    return box.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeSoundEffects(on: boolean, store?: Store | null) {
  const box = store === undefined ? memory() : store;
  if (!box) return;
  box.setItem(SOUND_KEY, on ? 'on' : 'off');
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let ctx: AudioContext | null = null;

/** Create the audio context during a click. Later tones can use it without a new gesture. */
export function primeAudio() {
  if (!soundEffectsEnabled()) return;
  if (typeof window === 'undefined') return;
  const Ctx = window.AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === 'suspended') void ctx.resume();
}

function beep(freq: number, at: number, dur: number, type: OscillatorType, gain: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + at);
  amp.gain.setValueAtTime(0.0001, ctx.currentTime + at);
  amp.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), ctx.currentTime + at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(ctx.currentTime + at);
  osc.stop(ctx.currentTime + at + dur + 0.02);
}

/** No sound unless the profile toggle is on. Retro uses square waves; the other themes use quiet sines. */
export function playEffect(kind: EffectName, retro: boolean) {
  if (!soundEffectsEnabled()) return;
  primeAudio();
  if (!ctx) return;
  const wave: OscillatorType = retro ? 'square' : 'sine';
  const gain = retro ? 0.045 : 0.028;
  if (kind === 'correct') {
    beep(retro ? 523 : 494, 0, 0.07, wave, gain);
    beep(retro ? 784 : 659, 0.08, 0.09, wave, gain);
    return;
  }
  if (kind === 'wrong') {
    beep(retro ? 196 : 233, 0, 0.12, retro ? 'square' : 'triangle', gain);
    return;
  }
  beep(retro ? 523 : 440, 0, 0.07, wave, gain);
  beep(retro ? 659 : 554, 0.09, 0.07, wave, gain);
  beep(retro ? 784 : 659, 0.18, 0.12, wave, gain);
}

/** Schedule answer tones, then the finish tone. The timers do not block the buttons. */
export function playResultSounds(marks: boolean[] | null, retro: boolean): () => void {
  if (!soundEffectsEnabled()) return () => {};
  primeAudio();
  if (typeof window === 'undefined') return () => {};
  const timers: number[] = [];
  const list = marks ?? [];
  list.forEach((ok, index) => {
    timers.push(window.setTimeout(() => playEffect(ok ? 'correct' : 'wrong', retro), index * 80));
  });
  timers.push(window.setTimeout(() => playEffect('complete', retro), list.length * 80));
  return () => { timers.forEach((id) => window.clearTimeout(id)); };
}

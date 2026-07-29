/**
 * เสียงเอฟเฟกต์แบบสังเคราะห์ด้วย Web Audio — ไม่ต้องโหลดไฟล์เสียงเลย
 * (เว็บ static บน GitHub Pages จะได้ไม่ต้องแบกไฟล์ mp3)
 */

type Voice =
  | "tick"
  | "roll"
  | "reveal"
  | "teamComplete"
  | "finish"
  | "click"
  | "undo"
  | "donate";

const MUTE_KEY = "rov-randomizer/muted";
const VOLUME = 0.28;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let mutedCache: boolean | null = null;
const listeners = new Set<() => void>();

function isMuted(): boolean {
  if (mutedCache !== null) return mutedCache;
  if (typeof window === "undefined") return false;
  try {
    mutedCache = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    mutedCache = false;
  }
  return mutedCache;
}

function applyGain() {
  if (master) master.gain.value = isMuted() ? 0 : VOLUME;
}

/** external store สำหรับ useSyncExternalStore — เก็บสถานะปิดเสียงไว้ใน localStorage */
export const muteStore = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
  getSnapshot: () => isMuted(),
  getServerSnapshot: () => false,
  set(value: boolean) {
    mutedCache = value;
    try {
      localStorage.setItem(MUTE_KEY, value ? "1" : "0");
    } catch {
      /* โหมดส่วนตัวก็ปล่อยไป */
    }
    applyGain();
    listeners.forEach((listener) => listener());
  },
  toggle() {
    muteStore.set(!isMuted());
  },
};

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = isMuted() ? 0 : VOLUME;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type ToneOptions = {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  sweepTo?: number;
};

function tone({
  freq,
  duration,
  type = "sine",
  gain = 0.6,
  delay = 0,
  sweepTo,
}: ToneOptions) {
  const audio = ensureContext();
  if (!audio || !master) return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const env = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noiseBurst(duration = 0.35, gain = 0.25) {
  const audio = ensureContext();
  if (!audio || !master) return;
  const frames = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2400;
  const env = audio.createGain();
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(master);
  src.start();
}

const RECIPES: Record<Voice, () => void> = {
  tick: () => tone({ freq: 880, duration: 0.045, type: "square", gain: 0.16 }),
  roll: () => tone({ freq: 320, duration: 0.08, type: "sawtooth", gain: 0.12 }),
  click: () => tone({ freq: 520, duration: 0.07, type: "triangle", gain: 0.3 }),
  undo: () => tone({ freq: 420, duration: 0.18, type: "triangle", gain: 0.3, sweepTo: 180 }),
  reveal: () => {
    noiseBurst(0.28, 0.16);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ freq: f, duration: 0.32, type: "triangle", gain: 0.34, delay: i * 0.055 }),
    );
  },
  teamComplete: () => {
    [392, 523.25, 659.25, 880].forEach((f, i) =>
      tone({ freq: f, duration: 0.5, type: "sine", gain: 0.3, delay: i * 0.08 }),
    );
    noiseBurst(0.5, 0.1);
  },
  // เสียงเหรียญตอนมีคนโดเนท
  donate: () => {
    [1046.5, 1396.9, 1760, 2093].forEach((f, i) =>
      tone({ freq: f, duration: 0.4, type: "triangle", gain: 0.34, delay: i * 0.07 }),
    );
    tone({ freq: 523.25, duration: 0.7, type: "sine", gain: 0.22, delay: 0.1 });
    noiseBurst(0.3, 0.08);
  },
  finish: () => {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      tone({ freq: f, duration: 0.75, type: "sine", gain: 0.32, delay: i * 0.1 }),
    );
    tone({ freq: 130, duration: 1.2, type: "sawtooth", gain: 0.18, delay: 0.1 });
    noiseBurst(0.8, 0.12);
  },
};

export const sfx = {
  play(voice: Voice) {
    if (isMuted()) return;
    try {
      RECIPES[voice]();
    } catch {
      /* เบราว์เซอร์บางตัวบล็อกเสียงก่อนมี user gesture — ปล่อยผ่าน */
    }
  },
  setMuted(value: boolean) {
    muteStore.set(value);
  },
  isMuted,
  /** เรียกครั้งแรกตอนผู้ใช้กดอะไรสักอย่าง เพื่อปลดล็อก AudioContext */
  unlock() {
    ensureContext();
  },
};

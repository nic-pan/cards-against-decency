"use client";

// Game sounds. Short files from Pixabay (see README, "Sound credits") play through the
// Web Audio API. If a file does not load, the turn sound falls back to a generated one.

export type SoundStyle = "funny" | "gentle" | "off";

const KEY = "bs.sound";

export function getSoundStyle(): SoundStyle {
  try {
    const v = localStorage.getItem(KEY);
    return v === "gentle" || v === "off" ? v : "funny";
  } catch {
    return "funny";
  }
}

export function setSoundStyle(style: SoundStyle): void {
  try {
    localStorage.setItem(KEY, style);
  } catch {}
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    // Browsers start audio only after the player has clicked something on the page.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One tone with a pitch slide and a short fade. */
function tone(
  a: AudioContext,
  opts: { type: OscillatorType; from: number; to: number; start: number; length: number; volume: number },
) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = opts.type;
  const t = a.currentTime + opts.start;
  osc.frequency.setValueAtTime(opts.from, t);
  osc.frequency.exponentialRampToValueAtTime(opts.to, t + opts.length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(opts.volume, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.length);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + opts.length + 0.05);
}

let unlockInstalled = false;

/**
 * Browsers (Safari above all) play sound only after the player has tapped or
 * clicked on the page. On the first tap, click or key press, start the audio
 * engine and play a silent sample, so later sounds from game events can play.
 */
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const events = ["pointerdown", "touchend", "keydown"] as const;
  const unlock = () => {
    const a = audio();
    if (!a) return;
    try {
      const silent = a.createBuffer(1, 1, 22050);
      const source = a.createBufferSource();
      source.buffer = silent;
      source.connect(a.destination);
      source.start();
    } catch {}
    if (a.state === "running") for (const e of events) window.removeEventListener(e, unlock, true);
  };
  for (const e of events) window.addEventListener(e, unlock, true);
}

const FILES = {
  turnFunny: "/sounds/turn-funny.mp3",
  idleWarning: "/sounds/idle-warning.mp3",
  removed: "/sounds/removed.mp3",
} as const;

type SoundFile = keyof typeof FILES;
const buffers = new Map<SoundFile, Promise<AudioBuffer | null>>();

/** Loads and decodes a sound file once. Resolves to null when it fails. */
function load(name: SoundFile): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    const a = audio();
    p = a
      ? fetch(FILES[name])
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((data) => a.decodeAudioData(data))
          .catch(() => null)
      : Promise.resolve(null);
    buffers.set(name, p);
  }
  return p;
}

/** Loads the sound files ahead of time, so the first sound plays at once. */
export function preloadSounds(): void {
  for (const name of Object.keys(FILES) as SoundFile[]) void load(name);
}

async function playFile(name: SoundFile, volume: number): Promise<boolean> {
  const a = audio();
  const buffer = await load(name);
  if (!a || !buffer) return false;
  const source = a.createBufferSource();
  const gain = a.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain).connect(a.destination);
  source.start();
  return true;
}

/** Sounds for game events. They follow the turn sound choice: nothing plays when it is "Off". */
export function playEventSound(event: "idleWarning" | "removed"): void {
  if (getSoundStyle() === "off") return;
  void playFile(event, 0.7);
}

export function playTurnSound(style: SoundStyle = getSoundStyle()): void {
  if (style === "off") return;
  if (style === "funny") {
    void playFile("turnFunny", 0.6).then((played) => {
      if (!played) playGenerated("funny");
    });
    return;
  }
  playGenerated(style);
}

function playGenerated(style: "funny" | "gentle"): void {
  const a = audio();
  if (!a) return;
  if (style === "gentle") {
    // A short two-tone chime.
    tone(a, { type: "sine", from: 880, to: 880, start: 0, length: 0.35, volume: 0.12 });
    tone(a, { type: "sine", from: 1320, to: 1320, start: 0.14, length: 0.45, volume: 0.1 });
    return;
  }
  // A cartoon slide whistle up and down, then a little horn honk.
  tone(a, { type: "sine", from: 320, to: 1100, start: 0, length: 0.18, volume: 0.14 });
  tone(a, { type: "sine", from: 1100, to: 260, start: 0.18, length: 0.22, volume: 0.14 });
  tone(a, { type: "sawtooth", from: 240, to: 170, start: 0.46, length: 0.14, volume: 0.07 });
  tone(a, { type: "sawtooth", from: 240, to: 170, start: 0.64, length: 0.16, volume: 0.07 });
}

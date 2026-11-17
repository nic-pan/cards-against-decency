"use client";

// Turn reminder sounds. The browser makes them with the Web Audio API,
// so there are no audio files and nothing to license.

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

export function playTurnSound(style: SoundStyle = getSoundStyle()): void {
  if (style === "off") return;
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

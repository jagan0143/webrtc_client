// Ringtone and ringback generated with Web Audio, so there are no audio files to ship.

let ctx = null;

/** Browsers only allow audio after a user gesture; main.jsx calls this on the first tap. */
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

function beep(out, freqs, start, duration, volume) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.setValueAtTime(volume, start + duration - 0.03);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  gain.connect(out);
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration);
  }
}

function loop(pattern, periodMs) {
  unlockAudio();
  if (!ctx) return () => {};
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const play = () => pattern(out, ctx.currentTime + 0.05);
  play();
  const id = setInterval(play, periodMs);
  return () => {
    clearInterval(id);
    out.disconnect();
  };
}

/** What the caller hears while the other phone rings (440+480 Hz, 2s on / 4s off). */
export const startRingback = () => loop((out, t) => beep(out, [440, 480], t, 2, 0.06), 4000);

/** What the callee hears for an incoming call. */
export function startRingtone() {
  const vibrate = () => navigator.vibrate?.([400, 200, 400]);
  vibrate();
  const vib = setInterval(vibrate, 2500);
  const stop = loop((out, t) => {
    for (const offset of [0, 0.5]) {
      beep(out, [1046.5], t + offset, 0.16, 0.12);
      beep(out, [1318.5], t + offset + 0.18, 0.16, 0.12);
    }
  }, 2500);
  return () => {
    clearInterval(vib);
    navigator.vibrate?.(0);
    stop();
  };
}

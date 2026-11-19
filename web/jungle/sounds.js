// Optional audio cues for ambient monitoring. Off by default; toggled in settings.
// Uses Web Audio API only — no external files.
//
// Sounds:
//   needsYou: a soft two-tone chime that grabs attention
//   done:     a single quiet note, like a task completing

let _ctx = null;
function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

function tone(freq, startTime, dur, vol, type) {
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(vol, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
  osc.start(startTime);
  osc.stop(startTime + dur + 0.01);
}

export function playNeedsYou() {
  try {
    const c = ctx(), t = c.currentTime;
    tone(880, t,        0.18, 0.12);
    tone(1108, t + 0.19, 0.22, 0.09);
  } catch(e) {}
}

export function playDone() {
  try {
    const c = ctx(), t = c.currentTime;
    tone(660, t, 0.28, 0.07);
  } catch(e) {}
}

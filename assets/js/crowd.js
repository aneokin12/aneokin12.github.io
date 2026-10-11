// Crowd noise for the stadium, from two recordings in ./audio: a bed of crowd ambience that loops,
// and a cheer for the goal. The page moves the bed between a handful of scenes:
//
//   aerial     heard from outside the ground: quieter and muffled
//   freeze     inside, turned down while a card is being read
//   live       the ball is moving: the noise comes up
//   full-time  after the goal
//
// roar() plays the cheer over the top. Browsers only allow sound after a click or a key press, so
// start() is called from one; nothing is downloaded before that.

const SCENES = {
  aerial: { level: .4, air: 900, over: 1.4 },
  freeze: { level: .22, air: 3200, over: 1.1 },
  live: { level: .7, air: 16000, over: .6 },
  'full-time': { level: .42, air: 9000, over: 2 },
};
const FILES = { bed: new URL('../audio/ambient-crowd.mp3', import.meta.url), cheer: new URL('../audio/crowd-cheer.mp3', import.meta.url) };

export function createCrowd() {
  let ctx = null, out, air, cheerOut, cheerBuf = null, cheering = null, scene = 'aerial', muted = false, loaded = false;

  const fetchSound = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url} ${r.status}`); return r.arrayBuffer(); }).then(data => ctx.decodeAudioData(data));
  // A recording does not end where it began, so fold its last second and a half into its start;
  // the shortened result loops without a bump.
  function seamless(buf, overlap = 1.5) {
    const n = Math.floor(overlap * buf.sampleRate), len = buf.length - n, loop = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const from = buf.getChannelData(ch), to = loop.getChannelData(ch);
      to.set(from.subarray(0, len));
      for (let i = 0; i < n; i++) { const k = i / n; to[i] = from[i] * Math.sin(k * Math.PI / 2) + from[len + i] * Math.cos(k * Math.PI / 2); }
    }
    return loop;
  }
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    out = ctx.createGain(); out.gain.value = 0;
    air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.Q.value = .3; air.frequency.value = SCENES[scene].air;
    cheerOut = ctx.createGain(); cheerOut.gain.value = 0;
    air.connect(out).connect(ctx.destination); cheerOut.connect(ctx.destination);
    fetchSound(FILES.bed).then(buf => { const s = ctx.createBufferSource(); s.buffer = seamless(buf); s.loop = true; s.connect(air); s.start(); loaded = true; apply(.8); })
      .catch(err => console.warn('Crowd ambience unavailable:', err));
    fetchSound(FILES.cheer).then(buf => { cheerBuf = buf; }).catch(err => console.warn('Crowd cheer unavailable:', err));
  }
  function apply(over) {
    if (!ctx) return;
    const s = SCENES[scene], t = ctx.currentTime, tc = (over ?? s.over) / 3;
    out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(muted || !loaded ? 0 : s.level, t, muted ? .08 : tc);
    air.frequency.cancelScheduledValues(t); air.frequency.setTargetAtTime(s.air, t, tc);
  }
  function hush(over = .25) {                       // fade the cheer away and stop it
    if (!cheering) return;
    const s = cheering, t = ctx.currentTime; cheering = null;
    cheerOut.gain.cancelScheduledValues(t); cheerOut.gain.setTargetAtTime(0, t, over / 3);
    try { s.stop(t + over * 2); } catch {}
  }

  return {
    get on() { return !!ctx && !muted; },
    // For checking by hand: what the audio graph is doing right now.
    get info() { return ctx ? { state: ctx.state, scene, loaded, level: +out.gain.value.toFixed(3), cheer: +cheerOut.gain.value.toFixed(3), cheering: !!cheering, air: Math.round(air.frequency.value) } : { state: 'not started', scene }; },
    // Call from a click or key press. Safe to call again.
    start() { if (muted) return; if (!ctx) { try { build(); } catch (err) { console.warn('Crowd noise unavailable:', err); ctx = null; muted = true; } } else if (ctx.state === 'suspended') ctx.resume(); },
    set(name) { if (!SCENES[name] || name === scene) return; scene = name; apply(); if (name === 'aerial' || name === 'freeze') hush(1.2); },
    mute(yes) { muted = yes; apply(.3); if (yes && ctx) hush(); },
    // The ball is in the net: the cheer over the top, with the bed pushed up underneath it.
    roar() {
      if (!ctx || muted || !cheerBuf) return;
      hush(.1);
      const s = ctx.createBufferSource(), t = ctx.currentTime; s.buffer = cheerBuf; s.connect(cheerOut); s.start();
      s.onended = () => { if (cheering === s) cheering = null; };
      cheering = s;
      cheerOut.gain.cancelScheduledValues(t); cheerOut.gain.setValueAtTime(cheerOut.gain.value, t); cheerOut.gain.linearRampToValueAtTime(1, t + .08);
      cheerOut.gain.setTargetAtTime(0, t + Math.max(2, cheerBuf.duration - 3.5), 1);        // let it die away before the recording runs out
      out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(.85, t, .15); out.gain.setTargetAtTime(SCENES['full-time'].level, t + 5, 1.5);
      air.frequency.cancelScheduledValues(t); air.frequency.setTargetAtTime(16000, t, .1);
    },
    pause(yes) { if (ctx) yes ? ctx.suspend() : (!muted && ctx.resume()); },
  };
}

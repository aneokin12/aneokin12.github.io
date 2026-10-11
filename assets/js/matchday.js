// Matchday: a three.js stadium (modelled loosely on Stamford Bridge) and an eight-a-side team of
// faceless mannequins, one per stop in Neo's career. The ball moves 1 → 8 and each player takes it
// in a way that suits the position. Every move is a pure function of time, so it can be frozen,
// skipped to its end, or sought to any moment.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { drawKit, loadLogo } from './kits.js';

const TAU = Math.PI * 2;
const BALL_R = .11;
const HIP = .93;                               // hip height of the rig before it is scaled
const BODY = .95;                              // rig scale: about 1.82 m tall
const UP = Math.PI;                            // yaw that faces up the pitch (towards -z, the north goal)
const GOAL_Z = -52.5;
// Home positions [x, z]. The team attacks -z, so the left flank is -x.
const SPOTS = [[0, 46.5], [-21, 29], [-1, 24], [21, 18], [2, 1], [-18, -21], [11, -36], [-2, -41]];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = k => { k = clamp(k); return k * k * (3 - 2 * k); };
const EASE = [smooth, k => k * k, k => 1 - (1 - k) * (1 - k), k => k];
const turn = (a, b, k) => a + (((b - a) % TAU + TAU * 1.5) % TAU - Math.PI) * k;
const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
// A point given in a player's own frame (x to their left, z ahead) as a world position.
const frameAt = (p, yaw, l) => { const s = Math.sin(yaw), c = Math.cos(yaw); return V(p.x + l[0] * c + l[2] * s, l[1], p.z - l[0] * s + l[2] * c); };

function canvasTex(w, h, draw, wrap) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// ---------------------------------------------------------------------------------------------
// Poses. A pose is a bag of joint angles in radians; anything left out takes the idle value.
//   hy hz           hips up / forward (metres)      hx hyaw hroll   hips lean, twist, roll
//   sx sy sz        spine lean forward, twist, roll nx ny           head nod, turn
//   lf lo lt lk lft left leg: swing forward, out to the side, toe-out twist, knee bend, foot pitch
//   laf lao le      left arm: swing forward, out to the side, elbow bend       (r… for the right)
// ---------------------------------------------------------------------------------------------
const KEYS = ['hy', 'hz', 'hx', 'hyaw', 'hroll', 'sx', 'sy', 'sz', 'nx', 'ny', 'lf', 'lo', 'lt', 'lk', 'lft', 'rf', 'ro', 'rt', 'rk', 'rft', 'laf', 'lao', 'le', 'raf', 'rao', 're'];
const IDLE = { lao: .14, rao: .14, le: .28, re: .28, lk: .08, rk: .08, lf: .04, rf: .04 };
const P = o => ({ ...IDLE, ...o });
const mix = (a, b, k) => { const o = {}; for (const key of KEYS) o[key] = lerp(a[key] || 0, b[key] || 0, k); return o; };
// frames: [time, pose, ease into this frame (0 smooth, 1 accelerate, 2 settle, 3 linear)]
function sample(frames, t) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let n = 1; n < frames.length; n++) {
    const [t1, p1, e = 0] = frames[n];
    if (t <= t1) { const [t0, p0] = frames[n - 1]; return mix(p0, p1, EASE[e]((t - t0) / (t1 - t0))); }
  }
  return frames.at(-1)[1];
}
function runPose(ph, a = 1) {
  const s = Math.sin(ph), c = Math.cos(ph);
  return mix(IDLE, P({ hx: .16, hy: -.03 + .03 * Math.abs(c), lf: .75 * s, rf: -.75 * s, lk: .25 + .95 * Math.max(0, c), rk: .25 + .95 * Math.max(0, -c), laf: -.7 * s, raf: .7 * s, le: 1.3, re: 1.3 }), a);
}

// Keeper: ball held in two hands, then an overarm sling. The right arm goes back, over the top,
// and all the way round (-2π), which is the same place as hanging by his side.
const HOLD = P({ laf: .5, raf: .5, lao: -.1, rao: -.1, le: .8, re: .8 });
const THROW = [
  [0, HOLD],
  [.3, P({ lf: .45, lk: .2, rf: -.25, rk: .15, sy: -.7, raf: -1.3, rao: .35, re: .5, laf: 1.3, lao: .1, le: .15, hx: -.05 })],
  [.5, P({ lf: .5, lk: .35, rf: -.4, rk: .3, sy: -.2, raf: -2.9, rao: .2, re: .25, laf: .9, le: .2, sx: .05, hy: -.03 }), 1],
  [.62, P({ lf: .5, lk: .4, rf: -.5, rk: .45, sy: .35, sx: .25, raf: -4.0, rao: .1, re: .05, laf: .2, le: .3, hy: -.05 }), 3],
  [.85, P({ lf: .5, lk: .4, rf: -.4, rk: .6, sy: .6, sx: .4, raf: -5.4, rao: -.2, re: .3, laf: -.4, le: .4, hy: -.06 }), 2],
  [1.3, P({ raf: -TAU })],
];
// Full-backs and the centre-half: a firm pass off the laces.
const DRIVE = [
  [0, P({})],
  [.22, P({ lf: .35, lk: .25, rf: -.8, rk: 1.3, sx: .12, sy: -.25, lao: .95, laf: .3, raf: -.5, rao: .3, hy: -.04 })],
  [.40, P({ lf: -.1, lk: .2, rf: .45, rk: .25, sx: .18, sy: .2, lao: .8, raf: .2, hy: -.04 }), 1],
  [.58, P({ lf: -.3, lk: .15, rf: 1.1, rk: .1, sx: .05, sy: .35, lao: .6, laf: -.4, raf: .6, hy: .02 }), 2],
  [.95, P({})],
];
// Midfield: short backlift, inside of the foot, follow through at the target.
const SIDEFOOT = [
  [0, P({})],
  [.2, P({ lf: .25, lk: .2, rf: -.45, rk: .5, rt: -.9, sx: .06, lao: .4, rao: .3, hy: -.03 })],
  [.36, P({ lf: -.05, lk: .22, rf: .3, rk: .12, rt: -1.25, sx: .1, lao: .4, rao: .3, hy: -.03 }), 1],
  [.52, P({ lf: -.15, lk: .15, rf: .75, rk: .08, rt: -1.25, sx: .04, lao: .45, rao: .35 }), 2],
  [.9, P({})],
];
// Left forward: the right foot wraps behind the standing leg.
const RABONA = [
  [0, P({})],
  [.25, P({ lk: .45, lf: .2, rf: -.55, ro: -.2, rk: 1.7, sz: .2, lao: 1.2, rao: 1.0, hy: -.08 })],
  [.42, P({ lk: .5, lf: .15, rf: -.18, ro: -.75, rk: .35, rt: .5, sz: .3, sy: .3, lao: 1.3, rao: .9, hy: -.1 }), 1],
  [.6, P({ lk: .35, rf: .0, ro: -.95, rk: .15, sz: .2, sy: .4, lao: 1.1, rao: .8, hy: -.05 }), 2],
  [1.05, P({})],
];
// Striker: the ball has come off his chest and is hanging in front of him.
const POISE = P({ sx: -.16, sy: -.12, lao: .7, rao: .55, le: .4, re: .4, lf: .14, rf: -.16, lk: .26, rk: .3, hy: -.05, nx: -.32 });
const HANG = [-.36, 1.5, .52];                 // where the ball stops for the freeze frame
const HIT = [-.4, .5, .6];                     // where the volley meets it
// Side-on volley: the right leg comes round from the hip, the body falls away to the left.
const VOLLEY = [
  [0, POISE],
  [.26, P({ lf: .2, lk: .32, rf: -.75, ro: .55, rk: 1.45, sz: .28, sy: -.4, lao: 1.25, rao: .9, laf: .3, hy: -.04, nx: .2 })],
  [.42, P({ lf: -.05, lk: .26, rf: 1.0, ro: .5, rk: .2, rft: -.4, sz: .36, sy: .25, lao: 1.25, rao: .7, hy: -.03, nx: .2 }), 1],
  [.62, P({ lf: -.28, lk: .2, rf: 1.4, ro: .28, rk: .08, rft: -.4, sz: .22, sy: .5, lao: .95, raf: .6, hy: .03 }), 2],
  [1.0, P({})],
];
// On the knees, leaning back. Each of the three gets his own arms.
const SLIDE = { hy: -.48, hx: -.08, lf: .5, rf: .5, lo: .13, ro: .13, lk: 2.0, rk: 2.0, lft: .8, rft: .8, sx: -.34, nx: -.34 };
const SLIDES = [
  { ...SLIDE, laf: .35, raf: .35, lao: 1.4, rao: 1.4, le: .1, re: .1 },                  // arms flung wide
  { ...SLIDE, laf: 2.75, raf: 2.75, lao: .45, rao: .45, le: .15, re: .15 },              // both arms up
  { ...SLIDE, sx: -.22, laf: .3, lao: .5, le: 1.5, raf: 2.6, rao: .3, re: .9 },          // one fist pumping
];

export async function createMatch({ canvas, squad, panel, calm, onEvent = () => {} }) {
  await Promise.all([document.fonts.load('800 60px Anybody'), document.fonts.load('900 60px Anybody')]).catch(() => {});
  const crests = await Promise.all(squad.map(p => loadLogo(p.crest, p.kit.tint)));
  const N = squad.length;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b1020, .0011);
  const camera = new THREE.PerspectiveCamera(50, 1, .25, 3000);

  const lam = color => new THREE.MeshLambertMaterial({ color });
  const glow = (color, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), fog: false });
  const box = (parent, mat, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const flat = (parent, mat, w, d, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); parent.add(m); return m; };
  // Day and night. `tone` registers a material with a colour for each; `swaps` are materials whose
  // texture changes; `nightOnly` and `dayOnly` are things that only exist in one of them.
  const toned = [], swaps = [], nightOnly = [], dayOnly = [];
  const tone = (mat, night, day) => { toned.push([mat.color, night, day]); return mat; };
  const rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();   // seeded, so the coast is the same every visit

  // --- Sky and light: an evening kick-off under the roof lights ---
  const skyTex = stops => canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); stops.forEach(([at, c]) => gr.addColorStop(at, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false });
  swaps.push([skyMat, skyTex([[0, '#03050c'], [.42, '#0a1124'], [.5, '#27213c'], [.53, '#0b1020'], [1, '#0b1020']]), skyTex([[0, '#2c68b8'], [.3, '#5c9bdc'], [.46, '#a9d0f0'], [.5, '#e3f0f9'], [.53, '#c3d9ea'], [1, '#c3d9ea']])]);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), skyMat));
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x24402c, 1.5); scene.add(hemi);
  const floods = [[60, 70], [-60, 70], [60, -70], [-60, -70]].map(([x, z]) => { const d = new THREE.DirectionalLight(0xffffff, .62); d.position.set(x, 55, z); scene.add(d); return d; });
  const sun = new THREE.DirectionalLight(0xfff3dc, 0); sun.position.set(520, 300, -1150); scene.add(sun);
  // Stars for the night, a few clouds for the day
  const stars = new THREE.Points(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 700 }, () => { const a = rand() * TAU, e = .08 + rand() * 1.4; return V(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(1400); })), new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: .8 }));
  scene.add(stars); nightOnly.push(stars);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: .92 }), puff = new THREE.SphereGeometry(1, 12, 8);
  for (let n = 0; n < 16; n++) {
    const c = new THREE.Group(), a = rand() * TAU, r = 520 + rand() * 760; c.position.set(Math.cos(a) * r, 250 + rand() * 150, Math.sin(a) * r);
    for (let k = 0, count = 4 + (rand() * 4 | 0); k < count; k++) { const p = new THREE.Mesh(puff, cloudMat); p.position.set((k - count / 2) * 34 + rand() * 14, rand() * 10, rand() * 26 - 13); p.scale.set(34 + rand() * 26, 15 + rand() * 11, 26 + rand() * 16); c.add(p); }
    scene.add(c); dayOnly.push(c);
  }

  // --- Pitch ---
  const world = new THREE.Group(); scene.add(world);
    flat(world, tone(lam(0x171c27), 0x171c27, 0x8e96a3), 170, 215, 0, -.06, 0);                                  // concourse
  flat(world, lam(0x256f39), 78, 117, 0, -.03, 0);                                  // run-off
  flat(world, new THREE.MeshLambertMaterial({ map: canvasTex(680, 1050, (g, w, h) => {
    for (let n = 0; n < 14; n++) { g.fillStyle = n % 2 ? '#2e8b45' : '#29793c'; g.fillRect(0, n * h / 14, w, h / 14 + 1); }
    for (let n = 0; n < 9000; n++) { g.fillStyle = `rgb(${n % 2 ? '255 255 255' : '0 0 0'} / .035)`; g.fillRect(rand() * w, rand() * h, 3, 3); }
    g.strokeStyle = 'rgb(255 255 255 / .86)'; g.fillStyle = g.strokeStyle; g.lineWidth = 1.6;
    g.strokeRect(1, 1, w - 2, h - 2);
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 91.5, 0, TAU); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 2.5, 0, TAU); g.fill();
    for (const s of [0, 1]) {
      const y = v => s ? h - v : v;
      g.strokeRect(w / 2 - 201.6, Math.min(y(0), y(165)), 403.2, 165);
      g.strokeRect(w / 2 - 91.6, Math.min(y(0), y(55)), 183.2, 55);
      g.beginPath(); g.arc(w / 2, y(110), 2.5, 0, TAU); g.fill();
      g.beginPath(); s ? g.arc(w / 2, y(110), 91.5, Math.PI + .645, TAU - .645) : g.arc(w / 2, y(110), 91.5, .645, Math.PI - .645); g.stroke();
    }
  }) }), 68, 105, 0, 0, 0);

  // Goals and pitch-side boards
  const netTex = canvasTex(64, 64, (g, w, h) => { g.strokeStyle = 'rgb(255 255 255 / .55)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); }, true);
  // The back of the north net is a cloth: push it out by `depth` metres around a point and it
  // stretches there, held where it is tied to the frame.
  let backNet = null, bulged = false;
  function bulge(x, y, depth) {
    if (!depth && !bulged) return;
    const at = backNet.geometry.attributes.position;
    for (let i = 0; i < at.count; i++) {
      const vx = at.getX(i), vy = at.getY(i) + 1.22, tied = Math.min(1, (3.66 - Math.abs(vx)) / .5, (2.44 - vy) / .4, vy / .4);
      at.setZ(i, -depth * tied * Math.exp(-((vx - x) ** 2 + (vy - y) ** 2) / .9));
    }
    at.needsUpdate = true; bulged = depth !== 0;
  }
  for (const s of [1, -1]) {
    const z = s * 52.5, post = glow(0xf4f6fa, .9);
    for (const x of [-3.66, 3.66]) box(world, post, .12, 2.44, .12, x, 1.22, z);
    box(world, post, 7.44, .12, .12, 0, 2.44, z);
    const net = (w, h, x, y, zz, rx, ry, seg = 1) => { const t = netTex.clone(); t.repeat.set(w * 2.4, h * 2.4); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, seg * 3, seg), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false })); m.position.set(x, y, zz); m.rotation.set(rx, ry, 0); world.add(m); return m; };
    const back = net(7.32, 2.44, 0, 1.22, z + s * 2, 0, 0, s < 0 ? 14 : 1); if (s < 0) backNet = back;
    net(7.32, 2, 0, 2.44, z + s, Math.PI / 2, 0);
    net(2, 2.44, -3.66, 1.22, z + s, 0, Math.PI / 2); net(2, 2.44, 3.66, 1.22, z + s, 0, Math.PI / 2);
  }
  for (const x of [-34, 34]) for (const z of [-52.5, 52.5]) {
    box(world, glow(0xf4f6fa, .5), .04, 1.5, .04, x, .75, z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(.42, .3), new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide }));
    flag.position.set(x - Math.sign(x) * .23, 1.34, z); world.add(flag);
  }
  const boards = canvasTex(2048, 64, (g, w, h) => {
    g.fillStyle = '#061a4a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f7ff'; g.font = '800 40px Anybody, sans-serif'; g.textBaseline = 'middle';
    const line = 'NEO SUD   ·   SOFTWARE ENGINEER   ·   BAY AREA   ·   AI EVALUATION   ·   DEVELOPER TOOLS   ·   ML INFRASTRUCTURE   ·   ';
    g.fillText(line + line, 12, h / 2 + 2);
  }, true);
  boards.repeat.set(2, 1);
  const boardMat = new THREE.MeshBasicMaterial({ map: boards, color: 0xb9c2d6 });
  for (const s of [1, -1]) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(104, .95), boardMat); a.position.set(s * 37.2, .5, 0); a.rotation.y = -s * Math.PI / 2; world.add(a);
    for (const side of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(26, .95), boardMat); b.position.set(side * 20, .5, s * 56.4); b.rotation.y = s > 0 ? Math.PI : 0; world.add(b); }
  }

  // --- Stands: tiers of seats as sloping planes, with the concrete, fascia and roof as boxes ---
  const concrete = tone(lam(0x1a2030), 0x1a2030, 0x9aa3b2), shell = tone(lam(0x2a3a5e), 0x2a3a5e, 0x3156a6), band = glow(0x2f66d8, 1.1), fascia = lam(0xb9c4d6), roofMat = lam(0xc4cddb), lamp = glow(0xdcebff, 1.5);
  const crowd = (w, h, text) => canvasTex(w, h, (g) => {
    g.fillStyle = '#0a3791'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 7) { g.fillStyle = 'rgb(0 0 0 / .2)'; g.fillRect(0, y, w, 2); }
    const fans = ['#0d47b5', '#2a66dc', '#e8ecf3', '#c9a27e', '#1a1e27', '#3b6fe0', '#8d6748', '#2a66dc', '#dfe5f0'];
    const dots = n => { for (let k = 0; k < n; k++) { g.fillStyle = fans[(rand() * fans.length) | 0]; g.fillRect(rand() * w, rand() * h, 2.4, 3); } };
    dots(w * h / 34);
    if (text) { g.fillStyle = 'rgb(244 247 255 / .92)'; g.font = `900 ${h * .6}px Anybody, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h * .53, w * .8); dots(w * h / 160); }
    for (let x = w / 9; x < w - 4; x += w / 9) { g.fillStyle = 'rgb(210 220 240 / .5)'; g.fillRect(x, 0, 3, h); }                 // aisles
  });
  const plainCrowd = [crowd(1024, 128), crowd(1024, 128)];
  function stand({ at, out, len, tiers, text, roof = true }) {
    const s = new THREE.Group();
    let back = 0, top = 0;
    tiers.forEach(([d0, h0, d1, h1], n) => {
      const run = Math.hypot(d1 - d0, h1 - h0), th = Math.atan2(h1 - h0, d1 - d0);
      const geo = new THREE.PlaneGeometry(len, run); geo.rotateZ(Math.PI);
      const map = text && n === tiers.length - 1 ? crowd(2048, 256, text) : plainCrowd[n % 2];
      const m = new THREE.Mesh(geo, tone(new THREE.MeshBasicMaterial({ map, color: 0xa9b3c8 }), 0xa9b3c8, 0xeef1f7));
      m.rotation.x = -(Math.PI / 2 + th); m.position.set(0, (h0 + h1) / 2, (d0 + d1) / 2); s.add(m);
      box(s, concrete, len, h0, d1 - d0, 0, h0 / 2, (d0 + d1) / 2 + .3);
      box(s, fascia, len, 1.1, .4, 0, h0 - .45, d0);
      back = Math.max(back, d1); top = Math.max(top, h1);
    });
    box(s, shell, len, top + 1.5, 1.4, 0, (top + 1.5) / 2, back + .7);
    box(s, band, len, 1.2, .3, 0, top * .55, back + 1.5); box(s, band, len, .5, .3, 0, top * .25, back + 1.5);
    if (roof) {
      const front = tiers.at(-1)[0] + (tiers.at(-1)[2] - tiers.at(-1)[0]) * .45, span = back + 2.5 - front, r = new THREE.Group();
      r.position.set(0, top + 5.2, (front + back + 2.5) / 2); r.rotation.x = Math.atan2(2.4, span);
      box(r, roofMat, len + 1.5, .5, span, 0, 0, 0);
      box(r, lamp, len - 4, .28, .7, 0, -.4, -span / 2 + .6);                                                                    // lights along the front edge
      for (let x = -len / 2 + 4; x <= len / 2 - 3; x += 13) box(r, fascia, .5, 1.5, span, x, .9, 0);                               // trusses
      s.add(r);
    }
    s.position.set(at[0], 0, at[1]); s.rotation.y = Math.atan2(out[0], out[1]);
    world.add(s);
  }
  const end = [[0, 1.5, 13, 7.5], [10, 10.5, 25, 24]], shed = [[0, 1.5, 12, 7], [9, 10, 21, 20]];
  stand({ at: [39, 0], out: [1, 0], len: 117, text: 'NEO SUD', tiers: [[0, 1.5, 9, 5.5], [7.5, 8, 13, 11.5], [11, 14.5, 25, 27]] });           // East Stand
  stand({ at: [-39, 0], out: [-1, 0], len: 117, text: 'SOFTWARE ENGINEER', tiers: [[0, 1.5, 12, 7], [10.5, 9.5, 14, 11.5], [12, 14.5, 28, 29]] }); // West Stand
  stand({ at: [0, -58.5], out: [0, -1], len: 78, tiers: end });                                                                                // Matthew Harding Stand
  stand({ at: [0, 58.5], out: [0, 1], len: 78, tiers: shed });                                                                                 // Shed End
  stand({ at: [46, -65.5], out: [1, -1], len: 30, tiers: end });
  stand({ at: [-46, -65.5], out: [-1, -1], len: 30, tiers: end });
  stand({ at: [46, 65.5], out: [1, 1], len: 30, tiers: shed });
  stand({ at: [-45, 64.5], out: [-1, 1], len: 26, tiers: [[0, 1.5, 10, 6]], roof: false });

  // --- The setting: a headland on the coast. Sea to the north and east, a lighthouse on the point,
  // a pier, and a small town and hills inland. ---
  const coast = [[-1500, -260], [-700, -250], [-420, -300], [-250, -240], [-170, -262], [-60, -218], [60, -226], [150, -192], [205, -112], [216, -10], [190, 92], [232, 172], [332, 212], [420, 330], [400, 520], [520, 800], [480, 1500]];
  const landShape = k => { const sh = new THREE.Shape(); sh.moveTo(-1500, -1500); sh.lineTo(coast[0][0] * k, -coast[0][1] * k); sh.splineThru(coast.slice(1).map(([x, z]) => new THREE.Vector2(x * k, -z * k))); sh.lineTo(-1500, -1500); return sh; };
  const outline = landShape(1).getPoints(8);
  const onLand = (x, z) => { let inside = false; for (let a = 0, b = outline.length - 1; a < outline.length; b = a++) { const p = outline[a], q = outline[b]; if ((p.y > -z) !== (q.y > -z) && x < (q.x - p.x) * (-z - p.y) / (q.y - p.y) + p.x) inside = !inside; } return inside; };
  const slab = (k, depth, top, mat) => { const m = new THREE.Mesh(new THREE.ExtrudeGeometry(landShape(k), { depth, bevelEnabled: false, curveSegments: 8 }), mat); m.rotation.x = -Math.PI / 2; m.position.y = top - depth; world.add(m); };
  slab(1, 12, -.1, tone(lam(0x1f3d2a), 0x1f3d2a, 0x86a868));                         // the headland, with a cliff edge
  slab(1.045, 3, -7.2, tone(lam(0x6f6a56), 0x6f6a56, 0xe2d5aa));                     // beach
  const SEA = -8;
  const sea = (base, crest) => { const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let n = 0; n < 420; n++) { const y = rand() * h, x = rand() * w, l = 8 + rand() * 34; g.fillStyle = `rgb(${crest} / ${.08 + rand() * .2})`; g.fillRect(x, y, l, 1.6); g.fillRect(x - w, y, l, 1.6); }
  }, true); t.repeat.set(26, 26); return t; };
  const waves = sea('#0a2140', '120 160 215'), wavesDay = sea('#2f7fb8', '235 246 255'), seaMat = new THREE.MeshBasicMaterial({ map: waves });
  swaps.push([seaMat, waves, wavesDay]);
  flat(world, seaMat, 3200, 3200, 0, SEA, 0);
  const surf = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(landShape(1.058).getPoints(8).map(p => V(p.x, SEA + .15, -p.y))), new THREE.LineBasicMaterial({ color: 0xcfe0f2, transparent: true, opacity: .55 }));
  world.add(surf);
  // Moon, and its path on the water
  const moonAt = V(520, 300, -1150);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(34, 24, 16), glow(0xf3f0e2, 1.25)); moon.position.copy(moonAt); world.add(moon);
  const glitter = new THREE.Mesh(new THREE.PlaneGeometry(150, 820), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, map: canvasTex(128, 512, (g, w, h) => {
    for (let n = 0; n < 520; n++) { const y = rand() * h, k = 1 - y / h, half = (6 + 54 * (1 - k)) * rand(), l = 3 + rand() * 12; g.fillStyle = `rgb(240 236 215 / ${.1 + .5 * k * rand()})`; g.fillRect(w / 2 + (rand() > .5 ? half : -half - l), y, l, 1.5); }
  }) }));
  glitter.rotation.x = -Math.PI / 2; glitter.rotation.z = -Math.atan2(moonAt.x - 120, -moonAt.z - 330); glitter.position.set(120 + (moonAt.x - 120) * .42, SEA + .2, -330 + (moonAt.z + 330) * .42); world.add(glitter);
  // Lighthouse on the point
  const tower = new THREE.Group(); tower.position.set(196, 0, -22); world.add(tower);
  const cyl = (parent, mat, r0, r1, h, y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 20), mat); m.position.y = y; parent.add(m); return m; };
  cyl(tower, lam(0xe6e9ee), 2.3, 3.4, 22, 11); cyl(tower, lam(0xb5302c), 2.72, 2.92, 4, 13); cyl(tower, lam(0x1c212b), 3, 3, .5, 22.2); cyl(tower, glow(0xfff0b8, 1.7), 1.5, 1.5, 2.4, 23.6); cyl(tower, lam(0xb5302c), .3, 2.2, 1.8, 25.6);
  const beam = new THREE.Group(); beam.position.y = 23.6; tower.add(beam);
  nightOnly.push(beam);
  for (const s of [1, -1]) { const b = new THREE.Mesh(new THREE.ConeGeometry(7, 150, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0b8, transparent: true, opacity: .028, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })); b.rotation.z = s * Math.PI / 2; b.position.x = s * 75; beam.add(b); }
  // Pier off the north shore
  const wood = tone(lam(0x4a3626), 0x4a3626, 0x8a6846), pier = new THREE.Group(); pier.position.set(-20, 0, -215); world.add(pier);
  box(pier, wood, 9, .8, 210, 0, -2.4, -105);
  for (let z = -8; z > -208; z -= 14) { for (const x of [-3.6, 3.6]) box(pier, wood, .7, 7, .7, x, -5.5, z); box(pier, glow(0xffd69a, 1.3), .35, .35, .35, z % 28 ? 4.1 : -4.1, -.4, z); }
  box(pier, lam(0xcdd3dc), 13, 5, 16, 0, .5, -198); box(pier, lam(0x7a2a26), 14, 1, 17, 0, 3.4, -198); box(pier, glow(0xffd69a, 1.2), 13.1, 1.6, 9, 0, .4, -198);
  // Boats at anchor
  const boats = [[70, -330], [-150, -390], [300, -80], [330, 60], [150, -470], [-330, -420]].map(([x, z], n) => {
    const b = new THREE.Group(); b.position.set(x, SEA, z); b.rotation.y = n * 1.3; world.add(b);
    box(b, lam(0xdfe4ea), 3.2, 1.6, 10, 0, .7, 0); box(b, lam(0x24406e), 2.4, 1.6, 4, 0, 2.2, -1); box(b, lam(0x9aa3ae), .15, 7, .15, 0, 5, 1.5); box(b, glow(n % 2 ? 0xff5a4a : 0x7dffb0, 1.6), .4, .4, .4, 0, 8.6, 1.5); box(b, glow(0xffe2a8, 1.2), 2.45, .6, 3, 0, 2.3, -1);
    return b;
  });
  // --- The city. Every 38 m block of land gets something: towers in three downtown clusters,
  // terraced houses along the shore, sheds by the railway, mid-rise streets and parks in between. ---
  const dummy = new THREE.Object3D();
  const pickc = list => list[(rand() * list.length) | 0];
  // Five kinds of facade, each drawn twice: lit windows for the night, glass and stone for the day.
  // A texture is 8 windows by 8 floors; one window is 4 m of wall.
  const facade = (bg, draw) => { const t = canvasTex(128, 128, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) draw(g, x * 16, y * 16, y); }, true); t.anisotropy = 4; return t; };
  const floors = Array.from({ length: 8 }, () => rand());
  const FACADES = [
    { // flats: a scatter of warm rooms
      night: facade('#10141d', (g, x, y) => { g.fillStyle = rand() > .62 ? pickc(['#ffd99a', '#ffc070', '#ffe9c4']) : '#232a38'; g.fillRect(x + 4, y + 4, 8, 10); }),
      day: facade('#d9d2c4', (g, x, y) => { g.fillStyle = '#f2efe8'; g.fillRect(x + 3, y + 3, 10, 12); g.fillStyle = rand() > .8 ? '#7d93ad' : '#4a5d73'; g.fillRect(x + 4, y + 4, 8, 10); }) },
    { // offices: whole floors left on, in cold white
      night: facade('#0d1220', (g, x, y, f) => { g.fillStyle = floors[f] > .5 && rand() > .12 ? (floors[f] > .8 ? '#e4eeff' : '#b7cdf2') : '#182134'; g.fillRect(x + 1, y + 5, 14, 8); }),
      day: facade('#c9ced6', (g, x, y) => { g.fillStyle = rand() > .7 ? '#55789f' : '#3d5f85'; g.fillRect(x, y + 4, 16, 9); }) },
    { // glass towers: mostly dark, a few panes of cyan
      night: facade('#0a1626', (g, x, y) => { const r = rand(); g.fillStyle = r > .86 ? '#9fe0ff' : r > .8 ? '#5fa8d8' : '#10243c'; g.fillRect(x + 1, y + 1, 14, 14); }),
      day: facade('#dfe9f2', (g, x, y) => { g.fillStyle = pickc(['#6fa6cf', '#7fb3d9', '#8fc0e2', '#5f98c4']); g.fillRect(x + 1, y + 1, 14, 14); }) },
    { // hotels: nearly every room lit amber, with balconies
      night: facade('#15110f', (g, x, y) => { g.fillStyle = rand() > .3 ? pickc(['#ffb648', '#ffa53a', '#ffc66e']) : '#2a231d'; g.fillRect(x + 5, y + 3, 6, 10); g.fillStyle = '#3a3029'; g.fillRect(x + 2, y + 13, 12, 1.5); }),
      day: facade('#e8dcc8', (g, x, y) => { g.fillStyle = '#5a6a7a'; g.fillRect(x + 5, y + 3, 6, 10); g.fillStyle = '#a89c86'; g.fillRect(x + 2, y + 13, 12, 2); }) },
    { // old brick streets: paired sashes, televisions and coloured blinds
      night: facade('#120f14', (g, x, y) => { g.fillStyle = rand() > .6 ? pickc(['#ffd99a', '#ff9f5a', '#8fe3ff', '#c9b6ff', '#9dffcf', '#ff8fb0', '#fff1cf']) : '#241f29'; g.fillRect(x + 3, y + 4, 4, 9); g.fillRect(x + 9, y + 4, 4, 9); }),
      day: facade('#b9684c', (g, x, y) => { g.fillStyle = '#f0e8dc'; g.fillRect(x + 2, y + 3, 6, 11); g.fillRect(x + 8, y + 3, 6, 11); g.fillStyle = '#39485a'; g.fillRect(x + 3, y + 4, 4, 9); g.fillRect(x + 9, y + 4, 4, 9); }) },
  ];
  // Windows keep their size whatever the building: the shader counts how many fit on each wall
  // from the instance's scale, and by day shades the walls that face away from the sun.
  const dayU = { value: 0 };
  function facadeMat(style, round) {
    const m = tone(new THREE.MeshBasicMaterial({ map: FACADES[style].night }), 0x9aa3b8, 0xf4f4f4);
    swaps.push([m, FACADES[style].night, FACADES[style].day]);
    m.onBeforeCompile = sh => {
      sh.uniforms.uDay = dayU;
      sh.vertexShader = 'uniform float uDay;\nvarying float vShade;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_INSTANCING
          float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz), sz = length(instanceMatrix[2].xyz);
          float faceW = ${round ? '3.1416 * sx' : 'abs(normal.x) > .5 ? sz : sx'};
          vec2 cells = max(vec2(1.), floor(vec2(faceW, sy) / 4. + .5));
          vec2 shift = floor(fract(instanceMatrix[3].xz * vec2(.137, .291)) * 8.);
          vMapUv = (uv * cells + shift) / 8.;
          vec3 facing = normalize((instanceMatrix * vec4(normal, 0.)).xyz);
          vShade = mix(1., .8 + .2 * dot(facing, normalize(vec3(.42, .24, -.87))), uDay);
        #else
          vShade = 1.;
        #endif`);
      sh.fragmentShader = 'varying float vShade;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= vShade;');
    };
    m.customProgramCacheKey = () => 'facade' + (round ? 'r' : 'b');
    return m;
  }
  // Unit shapes, all standing on y = 0.
  const up = g => g.translate(0, .5, 0);
  const prism = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-.5, 0), new THREE.Vector2(.5, 0), new THREE.Vector2(0, 1)]), { depth: 1, bevelEnabled: false }); prism.translate(0, 0, -.5);
  const barrel = new THREE.CylinderGeometry(.5, .5, 1, 14, 1, false, 0, Math.PI); barrel.rotateX(Math.PI / 2); barrel.rotateZ(Math.PI / 2); barrel.scale(1, 2, 1);
  const GEO = {
    box: up(new THREE.BoxGeometry(1, 1, 1)), round: up(new THREE.CylinderGeometry(.5, .5, 1, 28)), hex: up(new THREE.CylinderGeometry(.5, .5, 1, 6)),
    taper: up(new THREE.CylinderGeometry(.3, .5, 1, 4)).rotateY(Math.PI / 4), prism, barrel,
    dome: new THREE.SphereGeometry(.5, 20, 10, 0, TAU, 0, Math.PI / 2).scale(1, 2, 1), spire: up(new THREE.ConeGeometry(.5, 1, 4)).rotateY(Math.PI / 4), cone: up(new THREE.ConeGeometry(.5, 1, 14)),
    ball: up(new THREE.IcosahedronGeometry(.5, 1)),
  };
  const roofTop = tone(lam(0x161b26), 0x161b26, 0x9aa0a8);
  const solid = tone(lam(0xffffff), 0x4c5563, 0xffffff);                 // painted things: the instance colour is the daytime colour
  const lit = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const buckets = {};
  // key is "shape|kind", kind being a facade number, "solid" (lit by the sky) or "glow" (lights, night only)
  const put = (key, x, y, z, w, h, d, ry = 0, color = 0xffffff) => (buckets[key] ||= []).push([x, y, z, w, h, d, ry, color]);
  const TINT = [0xffffff, 0xf3e8d8, 0xe6edf5, 0xf5dfcf, 0xe3ead9, 0xf3efe6, 0xe9d2c0, 0xd9dfe8];
  const wall = (shape, style, x, y, z, w, h, d, ry = 0) => put(`${shape}|${style}`, x, y, z, w, h, d, ry, pickc(TINT));
  const NEON = [0x6fe6ff, 0xff5fb0, 0xffc04a, 0xf2f6ff, 0x7dffb0, 0xb48cff];
  const beacons = [];
  const mast = (x, y, z, h = 9) => { put('box|solid', x, y, z, .5, h, .5, 0, 0xb9c0c9); beacons.push([x, y + h + .5, z]); };

  const RAIL_X = -150, onRail = (x, z) => Math.abs(x - RAIL_X - z * .1) < 17;
  const DOWNTOWN = [[-400, 60], [-120, 470], [250, 430]];
  // Parks, as [x0, x1, z0, z1] in blocks: the common west of the tracks, the playing fields south of
  // the ground, and the green behind the lighthouse.
  const PARKS = [[-9, -6, 5, 8], [0, 3, 6, 7], [3, 4, -3, -1]];
  const lawns = [], lanes = [], firs = [], pond = [[-285, 247, 34, 24], [140, -76, 16, 12]];
  const tree = (x, z, k = 1) => { put('box|solid', x, 0, z, .8 * k, 3.4 * k, .8 * k, 0, 0x6b4a32); put('ball|solid', x, 2.4 * k, z, (6 + rand() * 4) * k, (7 + rand() * 4) * k, (6 + rand() * 4) * k, rand() * 3, rand() > .93 ? 0xc9a23f : pickc([0x3f8a45, 0x4f9a4a, 0x2f7a3f, 0x6aa84f, 0x3a7f52])); };
  function parkBlock(x, z, big) {
    put('box|solid', x, -.1, z, 35.6, .25, 35.6, 0, big ? 0x6fb558 : 0x66a955);
    if (big === 1) return;                                                         // playing fields: pitches are laid on afterwards
    if (pond.some(([px, pz, a, b]) => ((x - px) / (a + 14)) ** 2 + ((z - pz) / (b + 14)) ** 2 < 1)) { for (let n = 0; n < 2; n++) tree(x + (rand() - .5) * 30, z + (n ? 15 : -15) + (rand() - .5) * 4); return; }
    put('box|solid', x, .15, z, 48, .12, 1.6, Math.PI / 4, 0xd8c9a3); put('box|solid', x, .15, z, 48, .12, 1.6, -Math.PI / 4, 0xd8c9a3);          // paths
    for (let n = 0, count = 5 + (rand() * 5 | 0); n < count; n++) { const a = rand() * TAU, r = 7 + rand() * 10; tree(x + Math.cos(a) * r * 1.2, z + Math.sin(a) * r * 1.2, .8 + rand() * .5); }
    if (rand() > .7) { put('hex|solid', x, 0, z, 7, 3, 7, 0, 0xf1ece0); put('cone|solid', x, 3, z, 9, 3, 9, 0, 0x9a4a3a); }                               // bandstand
  }
  function towerBlock(x, z, H) {
    const r = rand(), crown = pickc(NEON);
    if (r < .22) {                                   // round tower with a lit ring under the roof
      const w = 17 + rand() * 7; wall('round', rand() > .4 ? 2 : 1, x, 0, z, w, H, w);
      put('round|glow', x, H - 4, z, w + .5, 1.1, w + .5, 0, crown); put('round|solid', x, H, z, w * .5, 3, w * .5, 0, 0xaab2bc); mast(x, H + 3, z);
    } else if (r < .38) {                            // six-sided tower
      const w = 20 + rand() * 6; wall('hex', pickc([1, 3, 2]), x, 0, z, w, H, w, rand());
      put('hex|solid', x, H, z, w * .6, 4, w * .6, 0, 0x9fa8b3); if (H > 60) mast(x, H + 4, z, 12);
    } else if (r < .58) {                            // stepped, with a spire and a lit crown
      const s = pickc([3, 0, 4]), w = 24 + rand() * 4;
      wall('box', s, x, 0, z, w, H * .55, w); wall('box', s, x, H * .55, z, w * .7, H * .3, w * .7); wall('box', s, x, H * .85, z, w * .42, H * .15, w * .42);
      put('box|glow', x, H * .85 - .8, z, w * .7 + .6, .8, w * .7 + .6, 0, crown); put('spire|solid', x, H, z, w * .42, 13, w * .42, 0, 0x6fae9a); beacons.push([x, H + 13.5, z]);
    } else if (r < .72) {                            // tapering glass shard
      const w = 30 + rand() * 6; wall('taper', 2, x, 0, z, w, H * 1.15, w); beacons.push([x, H * 1.15 + .8, z]);
    } else if (r < .88) {                            // twin slabs joined by a bridge
      const a = H * (.7 + rand() * .3), b = H * (.6 + rand() * .4), turn = rand() > .5 ? Math.PI / 2 : 0, o = turn ? [0, 9] : [9, 0];
      wall('box', 1, x - o[0], 0, z - o[1], 10, a, 28, turn); wall('box', 2, x + o[0], 0, z + o[1], 10, b, 28, turn);
      put('box|solid', x, Math.min(a, b) * .6, z, turn ? 6 : 10, 3, turn ? 10 : 6, 0, 0xc9d2de); put(`box|glow`, x - o[0], a, z - o[1], 10.4, .7, 28.4, turn, crown);
    } else {                                         // a tower set back on a plaza, with a low pavilion
      put('box|solid', x, -.1, z, 35, .25, 35, 0, 0xcfc8ba); wall('round', 2, x - 6, 0, z - 6, 15, H * .9, 15); wall('box', 1, x + 9, 0, z + 9, 13, 6, 13);
      tree(x - 12, z + 12, .8); tree(x + 12, z - 12, .8); mast(x - 6, H * .9, z - 6, 7);
    }
  }
  const terrace = (x, z, w, d, h, style, turn) => { wall('box', style, x, 0, z, w, h, d, turn); put('prism|solid', x, h, z, w + .8, 3.6, d + .8, turn, pickc([0xb5533c, 0x9a4a38, 0x5a6470, 0x7a6a5a, 0xa85a40])); };
  function streetBlock(x, z, far, shore, sheds) {
    const r = rand(), h0 = 6 + far * .012;
    if (sheds) {                                     // goods sheds and works by the line
      const turn = rand() > .5 ? Math.PI / 2 : 0, c = pickc([0xa9b0b8, 0x8c9aa6, 0xb7a48c, 0x9c6f5a]);
      if (r < .55) { put('box|solid', x, 0, z, 27, 7, 21, turn, c); put('barrel|solid', x, 7, z, 27, 4, 21, turn, 0xc4cbd3); }
      else { put('box|solid', x, 0, z, 28, 8, 22, turn, c); for (const o of [-9.3, 0, 9.3]) put('prism|solid', x + (turn ? 0 : o), 8, z + (turn ? o : 0), 9.3, 3, 22, turn, 0x7f8892); }
      if (r > .8) { put('round|solid', x + 11, 0, z + 11, 3, 30, 3, 0, 0xa0553f); beacons.push([x + 11, 30.6, z + 11]); }
      put('box|glow', x - 10, 2, z + (turn ? 0 : 11.2), 1.4, 1.2, .5, 0, 0xffc880);
    } else if (shore) {                              // terraces under pitched roofs
      const turn = rand() > .5 ? Math.PI / 2 : 0;
      for (const row of [-9, 9]) for (const o of [-10, 0, 10]) terrace(x + (turn ? row : o), z + (turn ? o : row), 9, 10, 5.5 + rand() * 2.5, pickc([4, 0, 0]), turn);
    } else if (r < .3) {                             // four small buildings, each its own height
      for (const [a, b] of [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]]) wall('box', pickc([0, 3, 4, 0, 1]), x + a, 0, z + b, 12 + rand() * 3, h0 * (.6 + rand() * 1.4), 12 + rand() * 3);
    } else if (r < .5) {                             // L-shaped block round a yard
      const s = pickc([0, 4, 3]), h = h0 * (.9 + rand()); wall('box', s, x - 9, 0, z, 11, h, 30); wall('box', s, x + 5.5, 0, z - 9.5, 18, h * (.7 + rand() * .3), 11); tree(x + 7, z + 6, .8);
    } else if (r < .64) {                            // courtyard block, open to one side
      const s = pickc([0, 3, 1]), h = h0 * (1 + rand() * .8); wall('box', s, x - 10.5, 0, z, 9, h, 30); wall('box', s, x + 10.5, 0, z, 9, h, 30); wall('box', s, x, 0, z - 10.5, 12, h * .85, 9); put('box|solid', x, -.1, z + 4, 12, .25, 20, 0, 0x66a955);
    } else if (r < .76) {                            // slab with plant on the roof
      const turn = rand() > .5 ? Math.PI / 2 : 0, h = h0 * (1.3 + rand() * 1.6); wall('box', pickc([1, 0, 3]), x, 0, z, 30, h, 13, turn); put('box|solid', x, h, z, 8, 2.2, 6, turn, 0x9aa3ad);
    } else if (r < .82) {                            // church
      const turn = rand() > .5 ? Math.PI / 2 : 0, f = turn ? [0, 1] : [1, 0];
      terrace(x, z, 26, 11, 9, 4, turn); wall('box', 4, x - f[0] * 16, 0, z - f[1] * 16, 6.5, 20, 6.5); put('spire|solid', x - f[0] * 16, 20, z - f[1] * 16, 7, 12, 7, 0, 0x5a6470);
    } else if (r < .88) {                            // domed hall
      wall('box', 3, x, 0, z, 26, 9, 26); put('dome|solid', x, 9, z, 16, 8, 16, 0, 0x6fae9a); put('box|glow', x, 8.4, z, 26.5, .5, 26.5, 0, 0xffd69a);
    } else if (r < .94) parkBlock(x, z, 0);          // pocket park
    else wall('box', pickc([3, 1]), x, 0, z, 22 + rand() * 8, h0 * (1.6 + rand() * 1.4), 22 + rand() * 8);
  }
  for (let gx = -22; gx <= 14; gx++) for (let gz = -9; gz <= 24; gz++) {
    const x = gx * 38, z = gz * 38;
    if (!onLand(x * 1.07 + 6, z * 1.07 - 6) || !onLand(x + 26, z - 26) || !onLand(x - 20, z - 26)) { if (onLand(x * 1.03, z * 1.03) && rand() > .4) firs.push([x + rand() * 20 - 10, z + rand() * 20 - 10, .6 + rand() * .8]); continue; }
    lanes.push([x + 19, z, 2.4, 38], [x, z + 19, 38, 2.4]);
    if ((x / 122) ** 2 + (z / 146) ** 2 < 1 || onRail(x, z) || Math.hypot(x - 196, z + 22) < 60) continue;
    const park = PARKS.findIndex(([a, b, c, d]) => gx >= a && gx <= b && gz >= c && gz <= d);
    if (park >= 0) { parkBlock(x, z, park === 1 ? 1 : 2); continue; }
    const far = Math.hypot(x, z), core = Math.max(...DOWNTOWN.map(([cx, cz]) => Math.exp(-(((x - cx) ** 2 + (z - cz) ** 2) / 150 ** 2))));
    const shore = [[115, 0], [-115, 0], [0, 115], [0, -115]].some(([a, b]) => !onLand(x + a, z + b));
    if (core > .3 && rand() < core + .25) towerBlock(x, z, Math.min(24 + core * (30 + rand() * 90), 10 + far * .32));
    else streetBlock(x, z, far, shore && core < .2, Math.abs(x - RAIL_X - z * .1) < 62 && rand() > .25);
  }
  // Playing fields south of the ground, with their own small floodlights
  const fieldTex = canvasTex(128, 192, (g, w, h) => { for (let n = 0; n < 6; n++) { g.fillStyle = n % 2 ? '#4fa05a' : '#47934f'; g.fillRect(0, n * h / 6, w, h / 6 + 1); } g.strokeStyle = 'rgb(255 255 255 / .85)'; g.lineWidth = 2; g.strokeRect(5, 5, w - 10, h - 10); g.beginPath(); g.moveTo(5, h / 2); g.lineTo(w - 5, h / 2); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2, 16, 0, TAU); g.stroke(); g.strokeRect(w / 2 - 24, 5, 48, 22); g.strokeRect(w / 2 - 24, h - 27, 48, 22); });
  const fieldMat = tone(new THREE.MeshLambertMaterial({ map: fieldTex }), 0x8f98a6, 0xffffff);
  for (const [x, z] of [[19, 247], [95, 247]]) {
    flat(world, fieldMat, 50, 64, x, .3, z);
    for (const a of [-27, 27]) for (const b of [-34, 34]) { put('box|solid', x + a, 0, z + b, .5, 11, .5, 0, 0xb9c0c9); put('box|glow', x + a, 11, z + b, 2.2, 1, .8, 0, 0xeaf2ff); }
  }
  for (const z of [216, 247, 278]) for (const x of [-14, 57, 128]) tree(x, z, 1.1);
  for (const [px, pz, a, b] of pond) { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), tone(new THREE.MeshBasicMaterial({ color: 0x10294a }), 0x12305a, 0x5fa8d8)); m.rotation.x = -Math.PI / 2; m.scale.set(a, b, 1); m.position.set(px, .3, pz); world.add(m); }

  const paint = new THREE.Color();
  for (const [key, list] of Object.entries(buckets)) {
    const [shape, kind] = key.split('|'), round = shape !== 'box';
    let mat = kind === 'solid' ? solid : lit;
    if (kind !== 'solid' && kind !== 'glow') { const m = facadeMat(+kind, round); mat = round ? [m, roofTop, roofTop] : [m, m, roofTop, roofTop, m, m]; }
    const mesh = new THREE.InstancedMesh(GEO[shape], mat, list.length);
    list.forEach(([x, y, z, w, h, d, ry, color], n) => { dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(w, h, d); dummy.updateMatrix(); mesh.setMatrixAt(n, dummy.matrix); mesh.setColorAt(n, paint.set(color)); });
    world.add(mesh);
    if (kind === 'glow') nightOnly.push(mesh);
  }
  dummy.rotation.set(0, 0, 0);
  // Red lights on the tall masts, blinking together
  const blink = new THREE.InstancedMesh(new THREE.SphereGeometry(.9, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30, fog: false }), beacons.length);
  beacons.forEach(([x, y, z], n) => { dummy.position.set(x, y, z); dummy.scale.setScalar(1); dummy.updateMatrix(); blink.setMatrixAt(n, dummy.matrix); });
  world.add(blink);
  const streets = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), tone(glow(0x40301a), 0x40301a, 0x8b9099), lanes.length);
  lanes.forEach(([x, z, w, d], n) => { dummy.position.set(x, -.08, z); dummy.scale.set(w, .06, d); dummy.updateMatrix(); streets.setMatrixAt(n, dummy.matrix); });
  world.add(streets);
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2, 15, 7), tone(lam(0x163d29), 0x163d29, 0x2f6b3c), firs.length);
  firs.forEach(([x, z, k], n) => { dummy.position.set(x, 7.5 * k - .1, z); dummy.scale.setScalar(k); dummy.updateMatrix(); trees.setMatrixAt(n, dummy.matrix); });
  world.add(trees);
  // The railway: through the city past the west side of the ground, then out over the bay on a viaduct.
  const pierMat = tone(lam(0x2a303c), 0x2a303c, 0x9a9fa8), hillMat = tone(lam(0x0d1a16), 0x0d1a16, 0x6f9468);
  const rail = new THREE.Group(); rail.position.set(RAIL_X, 0, 0); rail.rotation.y = Math.atan(.1); world.add(rail);
  box(rail, tone(lam(0x1a1e27), 0x1a1e27, 0x6a6f78), 11, 1.2, 1700, 0, -.4, -150);
  for (const x of [-3.4, -2, 2, 3.4]) box(rail, glow(0x56607a), .14, .1, 1700, x, .3, -150);
  for (let z = -250; z > -1000; z -= 34) box(rail, pierMat, 7, 9, 3, 0, -4.6, z);
  const train = new THREE.Group(); train.position.x = -2.7; rail.add(train);
  for (let n = 0; n < 6; n++) { box(train, lam(0xc9d2de), 2.8, 3.1, 17, 0, 2, n * 18); box(train, glow(0xffe2a8, 1.2), 2.86, .8, 15, 0, 2.5, n * 18); box(train, lam(0x1f4fc4), 2.84, .5, 17, 0, .9, n * 18); }
  for (const [x, z, r, h] of [[-900, 300, 420, 150], [-520, 900, 480, 190], [-1150, -150, 380, 120], [120, 1150, 520, 170], [-300, 1300, 420, 230], [-1300, 800, 500, 210]]) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), hillMat); m.position.set(x, h / 2 - 2, z); world.add(m); }

  // --- Players ---
  // A body of stacked elliptical rings [y, half-width, half-depth], skinned as one smooth surface.
  // u runs once around (0 at the front), v from the first ring to the ring at height vTop.
  function ringBody(rings, vTop) {
    const seg = 36, pos = [], nor = [], uv = [], idx = [], y0 = rings[0][0];
    rings.forEach(([y, rx, rz], r) => {
      const [py, prx] = rings[Math.max(0, r - 1)], [ny, nrx] = rings[Math.min(rings.length - 1, r + 1)], slope = -(nrx - prx) / Math.max(.001, ny - py);
      for (let k = 0; k <= seg; k++) { const a = k / seg * TAU, s = Math.sin(a), c = Math.cos(a), n = V(s / rx, 0, c / rz).normalize(); n.y = slope; n.normalize(); pos.push(rx * s, y, rz * c); nor.push(n.x, n.y, n.z); uv.push(k / seg, clamp((y - y0) / (vTop - y0))); }
    });
    for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < seg; k++) { const a = r * (seg + 1) + k, b = a + seg + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    return geo;
  }
  // A limb hanging down from its joint: tapers from r0 to r1 with an optional muscle bulge, round at both ends.
  function limbGeo(r0, r1, len, bulge = 0) {
    const pts = [];
    for (let k = 0; k <= 5; k++) { const a = k / 5 * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r0, Math.cos(a) * r0)); }
    for (let k = 1; k < 12; k++) { const t = k / 12; pts.push(new THREE.Vector2(lerp(r0, r1, t) + bulge * Math.sin(Math.PI * Math.min(1, t * 1.5)), -len * t)); }
    for (let k = 0; k <= 5; k++) { const a = k / 5 * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, -len - Math.sin(a) * r1)); }
    return new THREE.LatheGeometry(pts.reverse(), 20);
  }
  const TORSO = ringBody([[-.07, .178, .118], [.0, .172, .112], [.1, .17, .11], [.2, .19, .122], [.3, .215, .138], [.38, .232, .142], [.45, .24, .132], [.5, .225, .112], [.535, .16, .09], [.56, .085, .072], [.6, .056, .056], [.66, .052, .052]], .56);
  const SHORTS = ringBody([[-.2, .03, .03], [-.185, .12, .085], [-.14, .182, .122], [-.05, .196, .132], [.03, .186, .124], [.06, .176, .116]], .06);
  const G = { thigh: limbGeo(.084, .062, .42, .006), hem: new THREE.CylinderGeometry(.094, .108, .25, 20, 1, true), shin: limbGeo(.058, .042, .4, .014), sock: limbGeo(.062, .046, .36, .015),
    upper: limbGeo(.056, .044, .29, .004), sleeve: limbGeo(.07, .064, .13), longSleeve: limbGeo(.066, .05, .29, .004), fore: limbGeo(.045, .034, .27, .004), cuff: new THREE.CylinderGeometry(.068, .068, .028, 20, 1, true),
    boot: new THREE.CapsuleGeometry(.05, .16, 6, 14), head: new THREE.SphereGeometry(.118, 28, 20), hand: new THREE.SphereGeometry(.045, 14, 10), glove: new THREE.SphereGeometry(.066, 14, 10), band: new THREE.CylinderGeometry(.064, .064, .04, 20, 1, true) };
  function buildRig(p, n) {
    const kit = p.kit;
    const soft = color => new THREE.MeshStandardMaterial({ color, roughness: .78, metalness: 0 });
    const skin = soft(0xd6dade), shirt = soft(kit.c[0]), shorts = soft(kit.shorts), socks = soft(kit.socks), boots = soft(kit.boots || 0x15181d), trim = soft(kit.c[2]);
    const part = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    const grp = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
    const root = new THREE.Group(), body = grp(root, 0, 0, 0); body.scale.setScalar(BODY);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.5, 24), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .34, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; root.add(shadow);
    const hips = grp(body, 0, HIP, 0);
    part(hips, SHORTS, shorts);
    const leg = s => {
      const top = grp(hips, s * .1, -.04, 0);
      part(top, G.thigh, skin); part(top, G.hem, shorts, 0, -.115, 0);
      const shin = grp(top, 0, -.42, 0);
      part(shin, G.shin, skin); part(shin, G.sock, socks, 0, -.05, 0); part(shin, G.band, trim, 0, -.075, 0);
      const foot = grp(shin, 0, -.4, 0);
      const boot = part(foot, G.boot, boots, 0, -.02, .065); boot.rotation.x = Math.PI / 2; boot.scale.set(1, 1, .82);
      return [top, shin, foot];
    };
    const [legL, shinL, footL] = leg(1), [legR, shinR, footR] = leg(-1);
    const spine = grp(hips, 0, .1, 0);
    const tex = new THREE.CanvasTexture(drawKit(kit, crests[n], p.n, sharp)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.wrapS = THREE.RepeatWrapping; tex.offset.x = .5;
    part(spine, TORSO, new THREE.MeshStandardMaterial({ map: tex, roughness: .78, metalness: 0 }));
    const neck = grp(spine, 0, .56, 0);
    part(neck, limbGeo(.052, .05, .1), skin, 0, .1, 0);
    const head = part(neck, G.head, skin, 0, .2, .008); head.scale.set(.9, 1.12, .98);
    const arm = s => {
      const top = grp(spine, s * .262, .455, 0);
      if (kit.long) part(top, G.longSleeve, shirt); else { part(top, G.upper, skin); part(top, G.sleeve, shirt); part(top, G.cuff, trim, 0, -.125, 0); }
      const fore = grp(top, 0, -.29, 0);
      part(fore, G.fore, kit.long ? shirt : skin);
      const hand = part(fore, kit.gloves ? G.glove : G.hand, kit.gloves ? soft(kit.gloves) : skin, 0, -.3, 0); hand.scale.set(.8, 1.2, 1);
      return [top, fore, hand];
    };
    const [armL, foreL, handL] = arm(1), [armR, foreR, handR] = arm(-1);
    scene.add(root);
    return {
      root, shadow,
      hand: s => (s > 0 ? handL : handR).getWorldPosition(V()),
      apply(q) {
        const g = k => q[k] || 0;
        hips.position.set(0, HIP + g('hy'), g('hz')); hips.rotation.set(g('hx'), g('hyaw'), g('hroll'));
        spine.rotation.set(g('sx'), g('sy'), g('sz')); neck.rotation.set(g('nx'), g('ny'), 0);
        legL.rotation.set(-g('lf'), g('lt'), g('lo')); shinL.rotation.x = g('lk'); footL.rotation.x = g('lft');
        legR.rotation.set(-g('rf'), g('rt'), -g('ro')); shinR.rotation.x = g('rk'); footR.rotation.x = g('rft');
        armL.rotation.set(-g('laf'), 0, g('lao')); foreL.rotation.x = -g('le');
        armR.rotation.set(-g('raf'), 0, -g('rao')); foreR.rotation.x = -g('re');
      },
    };
  }
  const sharp = Math.min(innerWidth, innerHeight) < 600 ? 2 : 3;        // kit texture scale: 3072 px around the body on larger screens
  const rigs = squad.map(buildRig);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshLambertMaterial({ map: canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#f6f7f9'; g.fillRect(0, 0, w, h); g.fillStyle = '#14171c';
    for (const [x, y] of [[16, 16], [48, 44], [80, 16], [112, 44], [48, 4], [112, 4], [16, 60], [80, 60]]) { g.beginPath(); g.arc(x, y, 8, 0, TAU); g.fill(); }
  }) }));
  scene.add(ball);
  const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(.16, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .4, depthWrite: false }));
  ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);

  // Where each player ends up facing once the ball is under control: towards the next pass.
  const homeOf = n => ({ x: SPOTS[n][0], z: SPOTS[n][1] });
  const CORNER = { x: -2.85, z: GOAL_Z };      // the striker aims for the top left corner
  const faceOf = n => [UP, UP, yawTo(homeOf(2), homeOf(3)), UP, yawTo(homeOf(4), homeOf(5)), yawTo(homeOf(5), homeOf(6)), yawTo(homeOf(6), homeOf(7)), yawTo(homeOf(7), CORNER)][n];
  const REST = [-.12, BALL_R, .42];           // ball at the right foot
  let cur = [];                               // where each player is standing and facing right now
  const place = (rig, p, yaw) => { rig.root.position.set(p.x, 0, p.z); rig.root.rotation.y = yaw; };
  const setBall = p => { ball.position.copy(p); ball.position.y = Math.max(BALL_R, p.y); ballShadow.position.set(p.x, .025, p.z); ballShadow.scale.setScalar(clamp(1.1 - p.y * .12, .35, 1.1)); };
  function holdBall(rig) { const a = rig.hand(1), b = rig.hand(-1); const f = rig.root.rotation.y; return a.lerp(b, .5).add(V(Math.sin(f) * .07, -.02, Math.cos(f) * .07)); }

  // --- Passes: how each player moves the ball on ---
  function kick(n, target, { strike, contact, carry = 0, carryYaw = UP, spot = [-.13, BALL_R, .4], loft = 0, speed = 18 }) {
    const me = cur[n], yaw0 = me.yaw, t1 = .32, ts = t1 + (carry ? carry / 3.3 : .05);
    const end = { x: me.x + Math.sin(carryYaw) * carry, z: me.z + Math.cos(carryYaw) * carry };
    const passYaw = yawTo(end, target), rest0 = frameAt(me, yaw0, REST), spotW = frameAt(end, passYaw, spot);
    return {
      dur: ts + strike.at(-1)[0], release: ts + contact, end, passYaw, loft, speed,
      yaw: t => carry ? (t < ts - .28 ? turn(yaw0, carryYaw, smooth(t / t1)) : turn(carryYaw, passYaw, smooth((t - (ts - .28)) / .3))) : turn(yaw0, passYaw, smooth(t / t1)),
      pos: t => { const k = carry ? smooth((t - .2) / (ts - .2)) : 0; return { x: lerp(me.x, end.x, k), z: lerp(me.z, end.z, k) }; },
      pose: t => carry ? mix(runPose((t - .2) * 11, Math.sin(Math.PI * clamp((t - .2) / (ts - .2))) ** .5 || 0), sample(strike, t - ts), smooth((t - (ts - .12)) / .12)) : sample(strike, t - ts),
      ball: t => rest0.clone().lerp(spotW, carry ? 1 - (1 - clamp((t - .3) / (ts - .4))) ** 2 : smooth(t / t1)),
    };
  }
  const PASS = [
    () => {                                    // 1 Keeper: overarm sling
      const me = cur[0], yaw0 = me.yaw, passYaw = yawTo(me, cur[1]);
      return { dur: 1.3, release: .62, end: me, passYaw, loft: 3.4, speed: 16, yaw: t => turn(yaw0, passYaw, smooth(t / .3)), pos: () => me, pose: t => sample(THROW, t),
        ball: (t, rig) => { const k = smooth(t / .2), a = rig.hand(1), b = rig.hand(-1), f = rig.root.rotation.y; return a.lerp(b, .5 + .5 * k).add(V(Math.sin(f) * .07 * (1 - k), .1 * k - .02, Math.cos(f) * .07 * (1 - k))); } };
    },
    () => kick(1, cur[2], { strike: DRIVE, contact: .4, carry: 3.6, speed: 19 }),                              // 2 Left-back: steps up, then inside
    () => kick(2, cur[3], { strike: DRIVE, contact: .4, speed: 21 }),                                          // 3 Centre-half: no fuss
    () => kick(3, cur[4], { strike: DRIVE, contact: .4, carry: 3, speed: 20, loft: .35 }),                     // 4 Right-back: drives it into midfield
    () => kick(4, cur[5], { strike: SIDEFOOT, contact: .36, speed: 17, loft: 3.1 }),                           // 5 Midfield: clipped with the inside of the foot
    () => kick(5, cur[6], { strike: RABONA, contact: .42, spot: [.27, BALL_R, .12], speed: 17, loft: 5.2 }),   // 6 Left forward: rabona cross
    () => kick(6, cur[7], { strike: SIDEFOOT, contact: .36, speed: 14, loft: 2.3 }),                           // 7 Right forward: dinked back to the striker's chest
    () => {                                    // 8 Striker: lets it drop and volleys it
      const me = cur[7], passYaw = yawTo(me, CORNER), hang = frameAt(me, me.yaw, HANG), hit = frameAt(me, passYaw, HIT), p = V();
      return { dur: 1.0, release: .42, end: me, passYaw, loft: .22, speed: 26, yaw: t => turn(me.yaw, passYaw, smooth(t / .3)), pos: () => me, pose: t => sample(VOLLEY, t),
        ball: t => { const k = clamp(t / .42); p.lerpVectors(hang, hit, k); p.y = lerp(hang.y, hit.y, k * k); return p; } };
    },
  ];

  // --- First touches: how each player takes the ball. `at` is the contact point in the frame that
  // faces the ball; `after` lists [seconds, point, frame, arc height, ease] until it is at their feet. ---
  const one = k => () => k;
  const RECV = [
    null,
    {   // 2 Left-back: on the chest, down, and under the studs
      contact: .5, dur: 1.95, at: [0, 1.25, .2], yawK: t => smooth((t - 1.1) / .7), move: one(0),
      frames: [[0, P({})], [.35, P({ sx: -.2, hx: -.06, lao: 1.0, rao: 1.0, le: .5, re: .5, lk: .3, rk: .3, hy: -.07, nx: -.15 })], [.5, P({ sx: -.3, hx: -.06, lao: 1.05, rao: 1.05, le: .5, re: .5, lk: .3, rk: .3, hy: -.05, nx: -.1 })],
        [.78, P({ sx: .12, lao: .6, rao: .6, lk: .35, rk: .35, hy: -.1, nx: .35 })], [1.2, P({ rf: .45, rk: .6, lk: .2, sx: .1, nx: .4, lao: .4, rao: .4 })], [1.7, P({})]],
      after: [[.62, [-.08, BALL_R, .5], 'in', .24, 1], [.24, [-.1, BALL_R, .48], 'in', .1], [.5, REST, 'out', 0, 2]],
    },
    {   // 3 Centre-half: stopped dead with the inside of the foot
      contact: .45, dur: 1.35, at: [-.14, BALL_R, .38], yawK: t => smooth((t - .6) / .6), move: one(0),
      frames: [[0, P({})], [.3, P({ rf: .3, rt: -1.1, rk: .25, lk: .15, lao: .5, rao: .5, hy: -.02 })], [.45, P({ rf: .3, rt: -1.1, rk: .25, lk: .15, lao: .5, rao: .5, hy: -.02 })], [.62, P({ rf: .1, rt: -1.1, rk: .3, lk: .18, lao: .4, rao: .4 })], [1.05, P({ lao: .3, rao: .3 })]],
      after: [[.2, [-.13, BALL_R, .3], 'in', 0], [.5, REST, 'out', 0, 2]],
    },
    {   // 4 Right-back: first touch out of his feet and after it
      contact: .45, dur: 1.75, at: [-.1, BALL_R, .4], yawK: t => smooth((t - .25) / .4), move: t => smooth((t - .55) / .9), run: 2.2,
      frames: [[0, P({})], [.3, P({ rf: .3, rt: -.9, rk: .3, sy: .3, lk: .15, lao: .5, rao: .4 })], [.45, P({ rf: .35, rt: -.9, rk: .25, sy: .3, lk: .2, lao: .5, rao: .4 })], [.6, P({ hx: .1 })]],
      jog: [.55, 1.45],
      after: [[.95, REST, 'out', 0, 2]],
    },
    {   // 5 Midfield: checks both shoulders, takes it on the half-turn
      contact: .7, dur: 1.75, at: [.16, BALL_R, .36], yawK: t => smooth((t - .6) / .8), move: one(0),
      frames: [[0, P({})], [.2, P({ ny: .9 })], [.45, P({ ny: -.7, lao: .3, rao: .3, hy: -.03, lk: .2, rk: .2 })], [.7, P({ lf: .3, lt: 1.0, lk: .25, rk: .2, sy: .35, hy: -.04, ny: .2, lao: .5, rao: .4 })],
        [1.15, P({ rf: .1, lk: .15, lao: .35, rao: .35 })], [1.6, P({})]],
      after: [[.75, REST, 'out', 0, 2]],
    },
    {   // 6 Left forward: killed behind the standing leg
      contact: .55, dur: 2.0, at: [.4, .3, -.04], yawK: t => smooth((t - 1.1) / .7), move: one(0),
      frames: [[0, P({})], [.3, P({ lk: .3, rf: -.15, ro: -.3, rk: .6, lao: 1.1, rao: .9, hy: -.05, nx: -.2 })], [.55, P({ lk: .42, rf: -.3, ro: -.72, rk: .85, sz: .28, lao: 1.35, rao: 1.0, le: .3, re: .3, hy: -.09, ny: .6, nx: .25 })],
        [.82, P({ lk: .35, rf: -.2, ro: -.6, rk: .5, sz: .18, lao: 1.1, rao: .9, hy: -.07, ny: .5 })], [1.35, P({ lao: .5, rao: .5 })], [1.85, P({})]],
      after: [[.4, [.3, BALL_R, .35], 'in', .3], [.28, [.25, BALL_R, .42], 'in', .08], [.6, REST, 'out', 0, 2]],
    },
    {   // 7 Right forward: plucked out of the air on the laces
      contact: .5, dur: 1.9, at: [-.1, .82, .76], yawK: t => smooth((t - .9) / .7), move: one(0),
      frames: [[0, P({})], [.3, P({ rf: .9, rk: .9, lk: .15, sx: -.1, lao: .9, rao: .8 })], [.5, P({ rf: 1.3, rk: .12, rft: -.5, lk: .12, sx: -.22, lao: 1.2, rao: 1.0, hy: .02 })],
        [.9, P({ rf: .45, rk: .35, lk: .2, lao: .7, rao: .6 })], [1.3, P({ rf: .2, rk: .2 })], [1.7, P({})]],
      after: [[.4, [-.12, .3, .5], 'in', 0, 1], [.25, [-.12, BALL_R, .45], 'in', 0], [.5, REST, 'out', 0, 2]],
    },
    {   // 8 Striker: chest out, and it sits up in front of him
      contact: .5, dur: 1.1, at: [0, 1.25, .2], yawK: t => smooth((t - .5) / .55), move: one(0), hold: true,
      frames: [[0, P({})], [.35, P({ sx: -.2, hx: -.06, lao: 1.0, rao: 1.0, le: .5, re: .5, lk: .3, rk: .3, hy: -.07, nx: -.15 })], [.5, P({ sx: -.32, hx: -.06, lao: 1.1, rao: 1.1, le: .5, re: .5, lk: .3, rk: .3, hy: -.04, nx: -.2 })], [1.05, POISE]],
      after: [[.58, HANG, 'out', .12, 2]],
    },
  ];

  // --- Camera ---
  let size = { w: 1, h: 1 }, upright = false;
  const camPos = V(), camLook = V();
  function setCam(pos, look, shift) {
    camPos.copy(pos); camLook.copy(look);
    camera.position.copy(pos); camera.lookAt(look);
    const pan = panel();
    if (shift > .002) camera.setViewOffset(size.w, size.h, pan.x * shift, pan.y * shift, size.w, size.h); else camera.clearViewOffset();
  }
  function closeUp(s, back = 1) {
    const f = V(Math.sin(s.yaw), 0, Math.cos(s.yaw)), d = (upright ? 4.6 : 3.3) * back;
    return { pos: V(s.x, 1.32 + (back - 1) * .9, s.z).addScaledVector(f, d).add(V(f.z * .9, 0, -f.x * .9)), look: V(s.x, 1.02, s.z) };
  }
  let orbit = .9;
  const orbitPose = () => { const r = upright ? 265 : 196, h = upright ? 130 : 74; return { pos: V(Math.sin(orbit) * r, h, Math.cos(orbit) * r), look: V(0, upright ? -6 : 4, 0) }; };

  // --- After the goal: sprint for the corner flag and finish on the knees. Returns where a player is
  // and how he is posed `c` seconds after the ball hits the net, or nothing while he is still watching it. ---
  const SLOW = .3, PUSH = .13;                 // slow-motion rate, and how long the net stretches before it gives the ball back
  function runner(from, to, speed, delay, knees) {
    const L = Math.hypot(to.x - from.x, to.z - from.z), yaw = yawTo(from, to), D = 1.2, slide = speed * D / 2, tr = (L - slide) / speed + .3;
    return c => {
      const tt = c - delay; if (tt <= 0) return null;
      let d, pose;
      if (tt < tr) { d = tt < .6 ? speed * tt * tt / 1.2 : speed * (tt - .3); pose = runPose(tt * 12, smooth(tt / .3)); }
      else { const u = clamp((tt - tr) / D); d = L - slide * (1 - u) ** 2; pose = mix(runPose(tr * 12), knees, smooth((tt - tr) / .3)); }
      return { x: lerp(from.x, to.x, d / L), z: lerp(from.z, to.z, d / L), yaw: turn(from.yaw, yaw, smooth(tt / .4)), pose, tt };
    };
  }

  // --- A move: player n passes to n + 1 (or shoots, if n is the last player) ---
  function buildMove(n) {
    const j = n + 1, shot = j === N, passer = rigs[n], pass = PASS[n]();
    const camA = closeUp(cur[n]);
    const posePasser = t => { place(passer, pass.pos(t), pass.yaw(t)); passer.apply(t < pass.dur ? pass.pose(t) : IDLE); };
    posePasser(pass.release);
    const p0 = pass.ball(pass.release, passer).clone(), tA = pass.release;
    let p1, tB, T, recv = null, yaw0 = 0, endState, track = [], t0r = 0, tNet = 0, party = [], scored = false;
    const start = shot ? null : { ...cur[j] };
    if (shot) {
      p1 = V(-2.7, 1.9, GOAL_Z - 2 + BALL_R); tB = tA + p0.distanceTo(p1) / pass.speed;
      track = [[PUSH, V(-2.72, 1.88, p1.z - .75), 0, 2], [.55, V(-2.55, BALL_R, GOAL_Z - 1.45), 0, 1], [.45, V(-2.4, BALL_R, GOAL_Z - 1.15), .1, 0]];
      endState = { ...pass.end, yaw: pass.passYaw };
      // The flight runs in slow motion so the camera can go with it; then three of them are off to the corner flag.
      tNet = tA + (tB + PUSH - tA) / SLOW;
      party = [[n, [-29.6, -49.2], 8.6, .2], [n - 2, [-26.2, -45.4], 8.8, .35], [n - 1, [-25.6, -49.9], 10.2, .3]]
        .map(([who, to, speed, delay], k) => [rigs[who], runner(who === n ? endState : cur[who], { x: to[0], z: to[1] }, speed, delay, SLIDES[k])]);
      T = tNet + 5.9;
    } else {
      recv = RECV[j]; yaw0 = yawTo(start, { x: p0.x, z: p0.z });
      const yaw1 = faceOf(j), run = recv.run || 0;
      endState = { x: start.x + Math.sin(yaw1) * run, z: start.z + Math.cos(yaw1) * run, yaw: yaw1 };
      p1 = frameAt(start, yaw0, recv.at); tB = tA + Math.hypot(p1.x - p0.x, p1.z - p0.z) / pass.speed; t0r = tB - recv.contact;
      track = recv.after.map(([dt, l, f, arc = 0, e = 3]) => [dt, f === 'in' ? frameAt(start, yaw0, l) : frameAt(endState, yaw1, l), arc, e]);
      T = t0r + recv.dur + .15;
    }
    const camC = closeUp(endState), camB = closeUp(endState, shot ? 1.5 : 1.9);
    const mid = V((pass.end.x + endState.x) / 2, 0, (pass.end.z + endState.z) / 2), dist = Math.hypot(endState.x - pass.end.x, endState.z - pass.end.z);
    let camW;
    if (!shot) { const dx = (endState.x - pass.end.x) / dist, dz = (endState.z - pass.end.z) / dist; let nx = -dz, nz = dx; if (nz > 0) { nx = -nx; nz = -nz; } const off = (4.5 + dist * .32) * (upright ? 1.7 : 1); camW = mid.clone().add(V(nx * off, 2.6 + dist * .12, nz * off)); }

    const bp = V(), look = V(), pos = V();
    function ballAt(t) {
      if (t < tA) return bp.copy(pass.ball(t, passer));
      if (t < tB) { const u = (t - tA) / (tB - tA), k = pass.loft > .5 || shot ? u : 1 - (1 - u) ** 1.45; bp.lerpVectors(p0, p1, k); bp.y = lerp(p0.y, p1.y, k) + pass.loft * 4 * u * (1 - u); return bp; }
      let from = p1, tt = t - tB;
      for (const [dt, to, arc, e] of track) { if (tt < dt) { const u = tt / dt, k = EASE[e](u); bp.lerpVectors(from, to, k); bp.y = lerp(from.y, to.y, k) + arc * 4 * u * (1 - u); return bp; } tt -= dt; from = to; }
      return bp.copy(from);
    }
    const flight = shot ? V(p1.x - p0.x, 0, p1.z - p0.z).normalize() : null, chase = V(), who = V();
    const camF = upright ? { pos: V(-38.2, 1.9, -54), look: V(-27.8, .8, -48.4) } : { pos: V(-36.5, 1.2, -52.9), look: V(-27.6, .8, -48.6) };
    function atShot(t) {
      // Game time: normal until the strike, slowed while the ball is in the air, normal again once it is in.
      const s = t < tA ? t : t < tNet ? tA + (t - tA) * SLOW : tB + PUSH + (t - tNet), c = s - tB;
      if (c > 0 && !scored && mode === 'move') { scored = true; onEvent('goal'); }      // the ball has hit the net
      posePasser(s);
      for (const [rig, run] of party) {
        const r = run(c); if (!r) continue;
        place(rig, r, r.yaw); rig.apply(rig === passer ? mix(pass.pose(s), r.pose, smooth(r.tt / .2)) : r.pose);
        if (rig === passer) who.set(r.x, 1, r.z);
      }
      if (c <= .2) who.set(pass.end.x, 1, pass.end.z);
      const b = ballAt(s);
      ball.rotation.set(s * 9, s * 5, 0);
      setBall(b);
      // The net takes the ball, stretches with it, then springs back and settles.
      bulge(p1.x, p1.y, c <= 0 ? 0 : c < PUSH ? .78 * (1 - (1 - c / PUSH) ** 2) : c > 3 ? 0 : .78 * Math.exp(-3.4 * (c - PUSH)) * Math.cos(10 * (c - PUSH)));
      chase.copy(b).addScaledVector(flight, -2.9).add(V(flight.z * .45, .5, -flight.x * .45)); chase.y = clamp(chase.y, .7, 1.75); chase.z = Math.max(chase.z, GOAL_Z + 1.9);   // stays out on the pitch, looking in under the bar
      const w1 = smooth((s - tA) / ((tB - tA) * .55)), w2 = smooth((c - .75) / 1.5);
      pos.lerpVectors(camA.pos, chase, w1).lerp(camF.pos, w2);
      look.lerpVectors(camA.look, b, smooth(t / .3)).lerp(who, smooth((c - .6) / .8)).lerp(camF.look, smooth((c - 3.2) / 1.6));
      setCam(pos, look, Math.max(1 - smooth(t / .5), smooth((t - (T - .7)) / .6)));
    }
    function at(t) {
      if (shot) return atShot(t);
      posePasser(t);
      if (recv) {
        const tr = t - t0r, k = tr < 0 ? 0 : recv.move(tr), rig = rigs[j];
        place(rig, { x: lerp(start.x, endState.x, k), z: lerp(start.z, endState.z, k) }, tr < 0 ? turn(start.yaw, yaw0, smooth(t / Math.max(.3, t0r))) : turn(yaw0, endState.yaw, recv.yawK(tr)));
        let pose = tr < 0 ? IDLE : tr < recv.dur || recv.hold ? sample(recv.frames, tr) : IDLE;
        if (recv.jog && tr > recv.jog[0] - .1) { const [a, b] = recv.jog, u = clamp((tr - a) / (b - a)); pose = mix(pose, runPose((tr - a) * 11), smooth((tr - a + .1) / .15) * smooth((b + .25 - tr) / .25)); if (u >= 1 && tr > b + .25) pose = IDLE; }
        rig.apply(pose);
      }
      const b = ballAt(t);
      ball.rotation.set(t * 9, t * 5, 0);
      setBall(b);
      // Camera: leave the passer, travel with the ball, settle in front of whoever has it.
      const w1 = .3 * smooth(t / tA) + .7 * smooth((t - tA) / ((tB - tA) * .6 + .2));
      // Be near the receiver before the ball arrives so the first touch is in frame, then push in.
      const w2 = smooth((t - (tA + (tB - tA) * .3)) / ((tB - tA) * .7 + .15)), w3 = smooth((t - (T - 1)) / .85);
      pos.lerpVectors(camA.pos, camW, w1).lerp(camB.pos, w2).lerp(camC.pos, w3);
      look.lerpVectors(camA.look, V(b.x, Math.max(.9, b.y * .55 + .5), b.z), w1).lerp(camC.look, w2);
      setCam(pos, look, Math.max(1 - smooth(t / .5), smooth((t - (T - .7)) / .6)));
    }
    return { T, at, done() { cur[n] = { ...pass.end, yaw: pass.passYaw }; if (!shot) cur[j] = endState; } };
  }

  // --- State: what is on screen right now ---
  let mode = 'orbit', move = null, mt = 0, finish = null, fly = null, last = 0, dirty = true, running = false;
  function reset() {
    cur = squad.map((_, n) => ({ ...homeOf(n), yaw: faceOf(n) }));
    rigs.forEach((rig, n) => { place(rig, cur[n], cur[n].yaw); rig.apply(n ? IDLE : HOLD); });
    ball.rotation.set(0, 0, 0); bulge(0, 0, 0);
  }
  // Jump straight to "player n has the ball" (n === N is after the goal).
  function cut(n) {
    reset();
    if (n === 0) setBall(holdBall(rigs[0]));
    else if (n === N - 1) { rigs[0].apply(IDLE); rigs[n].apply(POISE); setBall(frameAt(cur[n], cur[n].yaw, HANG)); }
    else if (n < N) { rigs[0].apply(IDLE); setBall(frameAt(cur[n], cur[n].yaw, REST)); }
    else { rigs[0].apply(IDLE); const m = buildMove(N - 1); m.at(m.T); m.done(); mode = 'frozen'; dirty = true; return; }
    const c = closeUp(cur[n]); setCam(c.pos, c.look, 1);
    mode = 'frozen'; dirty = true;
  }
  function settle() { const f = finish; finish = null; move = null; fly = null; mode = 'frozen'; dirty = true; f?.(); }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), .32, .7, .82));
  composer.addPass(new OutputPass());

  function layout() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    size = { w, h }; upright = h > w;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.fov = upright ? 62 : 50; camera.updateProjectionMatrix();
    if (mode === 'frozen') setCam(camPos.clone(), camLook.clone(), 1);
    dirty = true;
  }
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (mode === 'frozen' && !dirty) return;                       // a freeze frame really is frozen
    if (mode !== 'frozen') { const s = now / 1000; train.position.z = ((s * 22) % 1500) - 950; waves.offset.set(s * .004, s * .009); beam.rotation.y = s * .5; boats.forEach((b, n) => { b.position.y = SEA + Math.sin(s * .9 + n * 2) * .25; b.rotation.z = Math.sin(s * .7 + n) * .05; }); boards.offset.x = now / 1000 * .012; wavesDay.offset.copy(waves.offset); blink.visible = !day && s % 1.8 < 1.1; }
    if (mode === 'orbit') { orbit += dt * .06; const o = orbitPose(); setCam(o.pos, o.look, 0); }
    else if (mode === 'fly') {
      fly.t += dt; const k = smooth(fly.t / fly.T), lift = Math.sin(Math.PI * k) * fly.lift;
      setCam(V().lerpVectors(fly.a.pos, fly.b.pos, k).add(V(0, lift, 0)), V().lerpVectors(fly.a.look, fly.b.look, smooth(fly.t / (fly.T * .8))), fly.shift ? smooth((fly.t - fly.T + .8) / .7) : 1 - smooth(fly.t / .6));
      if (fly.t >= fly.T) { if (fly.then === 'orbit') { const f = finish; finish = null; fly = null; mode = 'orbit'; f?.(); } else settle(); }
    } else if (mode === 'move') { mt = Math.min(move.T, mt + dt); move.at(mt); if (mt >= move.T) { move.done(); settle(); } }
    dirty = false;
    composer.render();
  }
  addEventListener('resize', layout);
  reset(); setBall(holdBall(rigs[0])); layout();

  let day = false, bloomPass = composer.passes[1];
  function setTheme(toDay) {
    day = !!toDay;
    for (const [color, n, d] of toned) color.set(day ? d : n);
    for (const [mat, n, d] of swaps) { mat.map = day ? d : n; mat.needsUpdate = true; }
    nightOnly.forEach(o => { o.visible = !day; }); dayOnly.forEach(o => { o.visible = day; });
    dayU.value = day ? 1 : 0;
    scene.fog.color.set(day ? 0xcfe0ee : 0x0b1020);
    hemi.color.set(day ? 0xe6f1ff : 0xcfe0ff); hemi.groundColor.set(day ? 0x8a9a78 : 0x24402c); hemi.intensity = day ? 1.75 : 1.5;
    floods.forEach(f => { f.intensity = day ? .22 : .62; }); sun.intensity = day ? 1.7 : 0;
    moon.material.color.set(day ? 0xfff6d0 : 0xf3f0e2).multiplyScalar(day ? 1.8 : 1.25); moon.scale.setScalar(day ? 1.5 : 1);
    glitter.material.opacity = day ? .7 : 1;
    bloomPass.strength = day ? .1 : .32;
    blink.visible = !day;
    dirty = true;
  }
  setTheme(false);

  const api = {
    setTheme,
    start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } },
    layout,
    // Fly down from the aerial view to the keeper.
    enter() { return new Promise(done => { cut(0); const b = closeUp(cur[0]); if (calm) return done(); fly = { t: 0, T: 3.6, a: orbitPose(), b, lift: 6, shift: true }; mode = 'fly'; finish = done; }); },
    aerial() { return new Promise(done => { reset(); setBall(holdBall(rigs[0])); const a = { pos: camPos.clone(), look: camLook.clone() }; if (calm) { mode = 'orbit'; return done(); } fly = { t: 0, T: 2.6, a, b: orbitPose(), lift: 10, shift: false, then: 'orbit' }; mode = 'fly'; finish = done; }); },
    // Player n plays it to n + 1; the last player shoots. Resolves on the freeze frame.
    play(n) { return new Promise(done => { cut(n); if (calm) { cut(n + 1); return done(); } move = buildMove(n); mt = 0; mode = 'move'; finish = done; }); },
    skip() { if (mode === 'move') mt = move.T; else if (mode === 'fly') fly.t = fly.T; },
    cut,
    // For tuning: pose move n at time t (seconds) and hold it.
    seek(n, t) { cut(n); const m = buildMove(n); m.at(Math.min(t, m.T)); mode = 'frozen'; dirty = true; return m.T; },
    look(pos, at) { setCam(V(...pos), V(...at), 0); mode = 'frozen'; dirty = true; },
  };
  return api;
}

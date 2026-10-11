// The kit room: a three.js scene with a wall of shirts (one per club in Neo's career) and a
// shelf of trophies (projects). The camera starts back in the room and pans over to the wall.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { drawKit, loadLogo } from './kits.js';

const TAU = Math.PI * 2;
const WALL_Z = -6.95;          // back wall, where the kits hang
const RAIL_Y = 3.15;           // centre height of a hanging shirt
const GAP = 1.02;              // spacing between shirts on the rail
const SHELF_Y = 1.06;          // top of the counter the trophies stand on
const FLIGHT_MS = 2400;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const loadImage = src => new Promise(done => { if (!src) return done(null); const i = new Image(); i.onload = () => done(i); i.onerror = () => done(null); i.src = src; });

function shirtPath(g, w, h, back) {
  const pts = [[.39, .05], [.24, .09], [.02, .27], [.13, .42], [.26, .32], [.25, .97], [.75, .97], [.74, .32], [.87, .42], [.98, .27], [.76, .09], [.61, .05]];
  g.beginPath();
  pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x * w, y * h));
  g.quadraticCurveTo(.5 * w, (back ? .1 : .2) * h, .39 * w, .05 * h);
  g.closePath();
}

// One side of a shirt. c is [top colour, bottom colour, trim and print colour].
function shirtTex({ c, front = '', back = 'SUD', num = '' }, crest, isBack) {
  return canvasTex(512, 560, (g, w, h) => {
    shirtPath(g, w, h, isBack);
    g.save(); g.clip();
    const body = g.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, c[0]); body.addColorStop(1, c[1]);
    g.fillStyle = body; g.fillRect(0, 0, w, h);
    // Cuffs, side panels, and a few soft folds
    g.strokeStyle = c[2]; g.lineWidth = 30;
    for (const [a, b] of [[[.0, .25], [.12, .43]], [[1, .25], [.88, .43]]]) { g.beginPath(); g.moveTo(a[0] * w, a[1] * h); g.lineTo(b[0] * w, b[1] * h); g.stroke(); }
    g.fillStyle = 'rgb(0 0 0 / .16)'; g.fillRect(.25 * w, .32 * h, .035 * w, h); g.fillRect(.715 * w, .32 * h, .035 * w, h);
    for (const x of [.36, .52, .66]) { const f = g.createLinearGradient((x - .05) * w, 0, (x + .05) * w, 0); f.addColorStop(0, 'rgb(0 0 0 / 0)'); f.addColorStop(.5, 'rgb(0 0 0 / .1)'); f.addColorStop(1, 'rgb(255 255 255 / .05)'); g.fillStyle = f; g.fillRect((x - .05) * w, .3 * h, .1 * w, h); }
    g.fillStyle = c[2]; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (isBack) {
      g.font = '800 54px Anybody, sans-serif'; g.fillText(back, w / 2, .27 * h, w * .42);
      g.font = '900 200px Anybody, sans-serif'; g.fillText(num, w / 2, .58 * h, w * .44);
    } else {
      g.font = '800 44px Anybody, sans-serif'; g.fillText(front.toUpperCase(), w / 2, .56 * h, w * .42);
      g.font = '800 40px Anybody, sans-serif'; g.fillText(num, .37 * w, .31 * h);
      if (crest) {
        g.fillStyle = '#fff'; g.beginPath(); g.roundRect(.57 * w, .24 * h, .12 * w, .12 * w, 8); g.fill();
        g.drawImage(crest, .58 * w, .24 * h + .01 * w, .1 * w, .1 * w);
      }
    }
    g.restore();
    // Collar and outline
    g.strokeStyle = c[2]; g.lineWidth = 12; g.beginPath(); g.moveTo(.39 * w, .05 * h); g.quadraticCurveTo(.5 * w, (isBack ? .1 : .2) * h, .61 * w, .05 * h); g.stroke();
    g.strokeStyle = 'rgb(0 0 0 / .4)'; g.lineWidth = 3; shirtPath(g, w, h, isBack); g.stroke();
  });
}

// A squad kit on a hanger: the same strip the players wear in the stadium, cut to a shirt shape.
// The strip wraps the body, so the front is its middle half and the back is its two ends.
function kitShirtTex(spec, logo, isBack) {
  const strip = drawKit(spec.kit, logo, spec.num, 3), q = strip.width / 4;
  return canvasTex(1536, 1680, (g) => {
    const w = 512, h = 560;
    g.scale(3, 3); g.imageSmoothingQuality = 'high';
    shirtPath(g, w, h, isBack);
    g.save(); g.clip();
    g.fillStyle = spec.kit.c[0]; g.fillRect(0, 0, w, h);
    const x = 38, dw = 436, y = .04 * h, dh = .94 * h;
    if (isBack) { g.drawImage(strip, 3 * q, 0, q, strip.height, x, y, dw / 2, dh); g.drawImage(strip, 0, 0, q, strip.height, x + dw / 2, y, dw / 2, dh); }
    else g.drawImage(strip, q, 0, 2 * q, strip.height, x, y, dw, dh);
    g.strokeStyle = spec.kit.c[2]; g.lineWidth = 30;
    for (const [a, b] of [[[.0, .25], [.12, .43]], [[1, .25], [.88, .43]]]) { g.beginPath(); g.moveTo(a[0] * w, a[1] * h); g.lineTo(b[0] * w, b[1] * h); g.stroke(); }
    for (const fx of [.36, .52, .66]) { const f = g.createLinearGradient((fx - .05) * w, 0, (fx + .05) * w, 0); f.addColorStop(0, 'rgb(0 0 0 / 0)'); f.addColorStop(.5, 'rgb(0 0 0 / .1)'); f.addColorStop(1, 'rgb(255 255 255 / .05)'); g.fillStyle = f; g.fillRect((fx - .05) * w, .3 * h, .1 * w, h); }
    g.restore();
    g.strokeStyle = spec.kit.c[2]; g.lineWidth = 12; g.beginPath(); g.moveTo(.39 * w, .05 * h); g.quadraticCurveTo(.5 * w, (isBack ? .1 : .2) * h, .61 * w, .05 * h); g.stroke();
    g.strokeStyle = 'rgb(0 0 0 / .4)'; g.lineWidth = 3; shirtPath(g, w, h, isBack); g.stroke();
  });
}

// The back of a favourite player's shirt, for a frame: drawn at three times the size so it stays
// sharp when the camera walks up to it. c is [shirt, collar and cuffs, name and number]. A second colour
// goes on as upright stripes, as hoops, as halves (one side of the body and the other side's sleeve), or
// as piping along the shoulder seams.
function heroTex({ c, stripes, hoops, halves, piping, name, num }) {
  return canvasTex(1536, 1680, (g) => {
    const w = 512, h = 560;
    g.scale(3, 3);
    shirtPath(g, w, h, true);
    g.save(); g.clip();
    g.fillStyle = c[0]; g.fillRect(0, 0, w, h);
    if (stripes) { g.fillStyle = stripes; for (let x = 38 + 31; x < 474; x += 62) g.fillRect(x, 0, 31, h); }
    if (hoops) { g.fillStyle = hoops; for (let y = 16; y < h; y += 32) g.fillRect(0, y, w, 16); }
    if (halves) { g.fillStyle = halves; g.fillRect(0, 0, .25 * w, h); g.fillRect(.5 * w, 0, .25 * w, h); }
    if (piping) { g.strokeStyle = piping; g.lineWidth = 7; for (const s of [-1, 1]) { g.beginPath(); g.moveTo((.5 + s * .105) * w, .06 * h); g.lineTo((.5 + s * .24) * w, .32 * h); g.stroke(); } }
    const shade = g.createLinearGradient(0, 0, 0, h); shade.addColorStop(0, 'rgb(255 255 255 / .07)'); shade.addColorStop(1, 'rgb(0 0 0 / .2)');
    g.fillStyle = shade; g.fillRect(0, 0, w, h);
    g.strokeStyle = c[1]; g.lineWidth = 30;
    for (const [a, b] of [[[.0, .25], [.12, .43]], [[1, .25], [.88, .43]]]) { g.beginPath(); g.moveTo(a[0] * w, a[1] * h); g.lineTo(b[0] * w, b[1] * h); g.stroke(); }
    g.fillStyle = 'rgb(0 0 0 / .14)'; g.fillRect(.25 * w, .32 * h, .03 * w, h); g.fillRect(.72 * w, .32 * h, .03 * w, h);
    for (const fx of [.36, .52, .66]) { const f = g.createLinearGradient((fx - .05) * w, 0, (fx + .05) * w, 0); f.addColorStop(0, 'rgb(0 0 0 / 0)'); f.addColorStop(.5, 'rgb(0 0 0 / .1)'); f.addColorStop(1, 'rgb(255 255 255 / .05)'); g.fillStyle = f; g.fillRect((fx - .05) * w, .3 * h, .1 * w, h); }
    g.fillStyle = c[2]; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (name) { g.font = '800 46px Anybody, sans-serif'; g.fillText(name, w / 2, .27 * h, w * .44); }
    g.font = '900 210px Anybody, sans-serif'; g.fillText(num, w / 2, (name ? .58 : .54) * h, w * .46);
    g.restore();
    g.strokeStyle = c[1]; g.lineWidth = 14; g.beginPath(); g.moveTo(.39 * w, .05 * h); g.quadraticCurveTo(.5 * w, .1 * h, .61 * w, .05 * h); g.stroke();
    g.strokeStyle = 'rgb(0 0 0 / .4)'; g.lineWidth = 3; shirtPath(g, w, h, true); g.stroke();
  });
}

const label = (text, w = 512, h = 64, color = '#eaf4ff', font = '600 30px "Martian Mono", monospace') => canvasTex(w, h, (g) => { g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font; g.fillText(text, w / 2, h / 2, w * .96); });

export async function createKitRoom({ canvas, items, heroes, panelWidth, onPick, calm }) {
  await Promise.all([document.fonts.load('800 60px Anybody'), document.fonts.load('600 20px "Martian Mono"')]).catch(() => {});
  const crests = await Promise.all(items.map(i => i.kit ? loadLogo(i.crest, i.kit.tint) : loadImage(i.crest)));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080a);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
  const probe = camera.clone();

  // --- Materials and small builders ---
  const std = (color, roughness = .6, metalness = .15) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const glow = (color, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
  const pic = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, ...extra });
  const M = {
    wall: std(0x14191d, .9, .05), dark: std(0x12161a, .5, .3), bronze: std(0xa8743c, .4, .35), wood: std(0x7a4b29, .75, 0),
    gold: new THREE.MeshStandardMaterial({ color: 0xe0ab3c, roughness: .3, metalness: .25, emissive: 0x5a3c08 }),
    white: glow(0xeaf4ff, 1.2), teal: glow(0xffd23f, 1.1), purple: glow(0x2f66d8, 1.3),
  };
  const box = (parent, mat, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const unit = new THREE.PlaneGeometry(1, 1);
  const plane = (parent, mat, w, h, x, y, z, ry = 0) => { const m = new THREE.Mesh(unit, mat); m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; };
  const light = (color, power, x, y, z, reach = 14) => { const l = new THREE.PointLight(color, power, reach, 1.6); l.position.set(x, y, z); scene.add(l); return l; };
  const fade = (from, to) => canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, from); gr.addColorStop(1, to); g.fillStyle = gr; g.fillRect(0, 0, w, h); });

  // Cloth: a plane bowed out in the middle, used front and back so a shirt has some body.
  const cloth = new THREE.PlaneGeometry(1, 1.09, 10, 1);
  for (let i = 0, p = cloth.attributes.position; i < p.count; i++) p.setZ(i, .07 * (1 - (2 * p.getX(i)) ** 2));
  // Unlit, so the print stays readable whatever the room lights are doing.
  const clothMat = map => new THREE.MeshBasicMaterial({ map, alphaTest: .5 });
  function makeShirt(spec, crest) {
    const g = new THREE.Group();
    const tex = spec.kit ? kitShirtTex : shirtTex;
    const front = new THREE.Mesh(cloth, clothMat(tex(spec, crest, false)));
    const back = new THREE.Mesh(cloth, clothMat(tex(spec, crest, true)));
    back.rotation.y = Math.PI;
    g.add(front, back);
    return g;
  }

  // --- Shell: floor, walls, ceiling with the lit fascia ---
  const tiles = canvasTex(256, 256, (g) => { g.fillStyle = '#171c20'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#0b0e10'; g.lineWidth = 5; g.strokeRect(0, 0, 256, 256); });
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping; tiles.repeat.set(10, 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 17), new THREE.MeshStandardMaterial({ map: tiles, roughness: .55, metalness: .1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  box(scene, M.wall, 20, 6, .2, 0, 3, -7.1);
  box(scene, M.wall, .2, 6, 17, -8.1, 3, 0);
  box(scene, M.wall, .2, 6, 17, 8.1, 3, 0);
  box(scene, M.wall, 20, .2, 17, 0, 5.1, 0);
  box(scene, M.wall, 14, 1.1, .3, 0, 4.5, -1.6);
  box(scene, M.white, 13.4, .025, .04, 0, 3.93, -1.44);
  // The sign on the fascia: a brushed gold placard.
  const placard = new THREE.Group(); placard.position.set(0, 4.5, -1.45); scene.add(placard);
  box(placard, new THREE.MeshStandardMaterial({ color: 0xf0c04a, roughness: .22, metalness: .4, emissive: 0x8a5c10 }), 5.9, .64, .07, 0, 0, 0);
  plane(placard, pic(canvasTex(3072, 296, (g, w, h) => {
    const gold = g.createLinearGradient(0, 0, 0, h);
    for (const [at, c] of [[0, '#fff1a8'], [.16, '#f3cb55'], [.45, '#c8922a'], [.52, '#a87618'], [.6, '#d9a738'], [.86, '#f6d970'], [1, '#b98422']]) gold.addColorStop(at, c);
    g.fillStyle = gold; g.fillRect(0, 0, w, h);
    const brushed = g.createLinearGradient(0, 0, w, 0);
    for (let n = 0; n <= 36; n++) brushed.addColorStop(n / 36, `rgb(255 255 255 / ${n % 2 ? .0 : .07})`);
    g.fillStyle = brushed; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgb(255 248 200 / .9)'; g.lineWidth = 6; g.strokeRect(20, 20, w - 40, h - 40);
    g.strokeStyle = 'rgb(110 70 8 / .7)'; g.lineWidth = 3; g.strokeRect(28, 28, w - 56, h - 56);
    g.font = 'italic 800 164px Anybody, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgb(84 50 0 / .85)'; g.shadowBlur = 16; g.shadowOffsetY = 6;
    g.fillStyle = '#ffffff'; g.fillText('WELCOME TO THE KIT ROOM', w / 2, h / 2 + 7, w * .9);
  })), 5.8, .56, 0, 0, .04);
  // A band of light that sweeps across the placard every few seconds.
  const sheen = canvasTex(256, 8, (g, w, h) => { const s = g.createLinearGradient(w * .4, 0, w * .6, 0); s.addColorStop(0, 'rgb(255 255 255 / 0)'); s.addColorStop(.5, 'rgb(255 255 255 / .75)'); s.addColorStop(1, 'rgb(255 255 255 / 0)'); g.fillStyle = s; g.fillRect(0, 0, w, h); });
  plane(placard, new THREE.MeshBasicMaterial({ map: sheen, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 5.8, .56, 0, 0, .045);

  // --- Floor platform with its lit edge, a bench, and a ball ---
  box(scene, M.dark, 7.4, .14, 4.6, -1.2, .07, 4.2);
  box(scene, M.white, 7.4, .02, .045, -1.2, .15, 1.93);
  box(scene, M.white, .045, .02, 4.6, 2.47, .15, 4.2);
  box(scene, M.bronze, 7.6, .06, .12, -1.2, .1, 1.84);
  box(scene, M.wood, 3.4, .09, .62, 3.6, .55, 1.2);
  for (const x of [2.2, 5.0]) box(scene, M.dark, .08, .5, .56, x, .26, 1.2);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.17, 24, 16), std(0xe8ecef, .5, 0)); ball.position.set(1.4, .17, 1.0); scene.add(ball);

  // --- A record player on the bench. The page plays the music; this just spins while it does. ---
  const deck = new THREE.Group(); deck.position.set(2.75, .595, 1.2); deck.rotation.y = -.35; scene.add(deck);
  box(deck, M.wood, .86, .11, .62, 0, .055, 0);
  box(deck, M.bronze, .88, .02, .64, 0, .012, 0);
  const cyl = (parent, mat, r, h, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), mat); m.position.set(x, y, z); parent.add(m); return m; };
  cyl(deck, M.dark, .27, .03, -.1, .125, 0);
  const vinyl = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#0b0c0f'; g.fillRect(0, 0, w, w);
    for (let r = 100; r < 250; r += 5) { g.strokeStyle = `rgb(255 255 255 / ${r % 20 ? .05 : .13})`; g.lineWidth = 1.5; g.beginPath(); g.arc(w / 2, w / 2, r, 0, TAU); g.stroke(); }
    const shine = g.createConicGradient(0, w / 2, w / 2); for (const [at, a] of [[0, .16], [.12, 0], [.38, 0], [.5, .16], [.62, 0], [.88, 0], [1, .16]]) shine.addColorStop(at, `rgb(255 255 255 / ${a})`);
    g.fillStyle = shine; g.beginPath(); g.arc(w / 2, w / 2, 250, 0, TAU); g.fill();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(w / 2, w / 2, 88, 0, TAU); g.fill();
    g.fillStyle = '#1b1500'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic 900 44px Anybody, sans-serif'; g.fillText('FIFA', w / 2, w / 2 - 34); g.font = '800 26px Anybody, sans-serif'; g.fillText('HITS', w / 2, w / 2 + 40);
    g.fillStyle = '#0b0c0f'; g.beginPath(); g.arc(w / 2, w / 2, 9, 0, TAU); g.fill();
  });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .012, 48), [std(0x0b0c0f, .4, .2), new THREE.MeshBasicMaterial({ map: vinyl }), std(0x0b0c0f, .4, .2)]);
  disc.position.set(-.1, .148, 0); deck.add(disc);
  const arm = new THREE.Group(); arm.position.set(.3, .15, -.2); deck.add(arm);
  cyl(arm, M.bronze, .04, .07, 0, 0, 0); box(arm, glow(0xdfe6ee, .9), .022, .018, .4, 0, .04, .19); box(arm, M.dark, .05, .03, .08, 0, .03, .4);
  cyl(deck, M.teal, .022, .02, .34, .12, .22);                                          // power light
  deck.traverse(m => { m.userData.id = 'deck'; });
  let spinning = false;
  // Notes that drift up off the record while it plays and thin out like vapour.
  // Drawn as shapes, not typed, so they look the same whatever fonts the visitor has: a single
  // quaver, and a beamed pair.
  const glyph = pair => { const t = canvasTex(128, 128, g => {
    g.fillStyle = g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round';
    const head = (x, y) => { g.save(); g.translate(x, y); g.rotate(-.35); g.beginPath(); g.ellipse(0, 0, 15, 11, 0, 0, TAU); g.fill(); g.restore(); };
    if (pair) { head(34, 98); head(88, 88); g.beginPath(); g.moveTo(46, 96); g.lineTo(46, 32); g.moveTo(100, 86); g.lineTo(100, 22); g.stroke(); g.lineWidth = 13; g.lineCap = 'butt'; g.beginPath(); g.moveTo(43, 36); g.lineTo(103, 26); g.stroke(); }
    else { head(48, 96); g.beginPath(); g.moveTo(60, 94); g.lineTo(60, 24); g.stroke(); g.lineWidth = 9; g.beginPath(); g.moveTo(60, 26); g.quadraticCurveTo(92, 36, 86, 66); g.stroke(); }
  }); t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t; };
  const glyphs = [glyph(false), glyph(true)];
  const notes = Array.from({ length: 12 }, (_, n) => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphs[n % glyphs.length], color: n % 3 ? 0xffffff : 0xffd23f, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.visible = false; m.renderOrder = 5; scene.add(m);
    return { m, age: 1, life: 1, x: 0, z: 0, sway: 0, size: .1 };
  });
  let noteClock = 0;
  function driftNotes(dt, t) {
    if (spinning && !calm && (noteClock -= dt) <= 0) {
      noteClock = .38 + Math.random() * .3;
      const note = notes.find(q => q.age >= q.life);
      if (note) Object.assign(note, { age: 0, life: 2.6 + Math.random() * 1.2, x: 2.66 + (Math.random() - .5) * .3, z: 1.2 + (Math.random() - .5) * .25, sway: Math.random() * 6, size: .09 + Math.random() * .05 });
    }
    for (const q of notes) {
      if (q.age >= q.life) { q.m.visible = false; continue; }
      q.age += dt; const k = Math.min(1, q.age / q.life);      // never past the end: a negative fade is not a number, and one bad pixel blooms into a black patch
      if (k >= 1) { q.m.visible = false; q.m.material.opacity = 0; continue; }
      q.m.visible = true;
      q.m.position.set(q.x + Math.sin(t * 1.3 + q.sway) * .07 * (.4 + k), .78 + k * .5, q.z + Math.cos(t * .9 + q.sway) * .04);     // stays well below the camera when it is leaning over the deck
      q.m.scale.setScalar(q.size * (.7 + k * 1.1));
      q.m.material.opacity = Math.min(1, k * 6) * (1 - k) ** 1.6 * .95;                // quick in, long thin out
      q.m.material.rotation = Math.sin(t + q.sway) * .25;
    }
  }

  // --- Lockers down the left wall ---
  for (let i = 0; i < 5; i++) {
    box(scene, M.dark, .7, 2.5, 1.02, -7.6, 1.25, -1.6 + i * 1.1);
    box(scene, M.teal, .03, .03, .9, -7.24, 2.42, -1.6 + i * 1.1);
    box(scene, M.bronze, .03, .22, .05, -7.24, 1.3, -1.25 + i * 1.1);
  }

  // --- The kit wall: wood panel, rail of shirts, counter of trophies ---
  const wall = new THREE.Group(); wall.position.set(0, 0, WALL_Z); scene.add(wall);
  box(wall, M.wood, 8.8, 3.3, .1, 0, 2.75, .06);
  box(wall, M.dark, 9.2, 1.0, 1.5, 0, .5, .75);
  box(wall, M.bronze, 9.3, .06, 1.6, 0, 1.03, .75);
  box(wall, M.purple, 2.2, .03, .05, 0, 1.08, 1.56);
  box(wall, M.bronze, 8.4, .04, .04, 0, RAIL_Y + .66, .5);
  for (const side of [-1, 1]) box(wall, M.dark, .5, 3.5, .6, side * 4.65, 2.75, .3);

  const shirts = items.filter(i => i.kind === 'shirt'), trophies = items.filter(i => i.kind === 'trophy');
  // Three trophies, each shaped after a famous one without copying it: a globe carried up on two
  // spiralling figures, a tall silver cup with big looping handles, and a lidded urn with a crown.
  const silver = new THREE.MeshStandardMaterial({ color: 0xd5dbe3, roughness: .22, metalness: .35, emissive: 0x2a3038 });
  const malachite = new THREE.MeshStandardMaterial({ color: 0x1f8a55, roughness: .35, metalness: .1, emissive: 0x06231a });
  const lathe = (parent, mat, pts) => { const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 40), mat); parent.add(m); return m; };
  const CUPS = {
    globe(g) {
      lathe(g, M.gold, [[0, 0], [.105, 0], [.105, .025], [.092, .03], [.092, .1], [.08, .11], [.062, .16], [.05, .24], [.056, .31], [.078, .37], [.09, .4], [0, .4]]);
      for (const y of [.045, .08]) lathe(g, malachite, [[.094, y - .012], [.097, y - .012], [.097, y + .012], [.094, y + .012]]);
      // the two figures: ribbons winding up the stem to hold the ball
      for (const turn of [0, Math.PI]) {
        const path = new THREE.CatmullRomCurve3(Array.from({ length: 24 }, (_, n) => { const t = n / 23, y = .1 + t * .32, r = .058 + .034 * Math.abs(t - .45) * 2 * (t > .45 ? 1 : .5), a = turn + t * 4.2; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); }));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 60, .022, 10), M.gold));
      }
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.088, 28, 20), M.gold); ball.position.y = .47; g.add(ball);
    },
    ears(g) {
      lathe(g, silver, [[0, 0], [.1, 0], [.1, .018], [.06, .035], [.03, .06], [.026, .1], [.045, .125], [.085, .16], [.108, .22], [.112, .3], [.118, .42], [.135, .52], [.128, .52], [.108, .42], [.1, .3], [.09, .2], [0, .15]]);
      for (const s of [1, -1]) {       // the big ears: handles that leave the rim and curl back in low on the bowl
        const path = new THREE.CatmullRomCurve3([[.118, .46], [.19, .5], [.245, .43], [.235, .31], [.17, .22], [.105, .2]].map(([x, y]) => new THREE.Vector3(s * x, y, 0)));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 40, .014, 10), silver));
      }
    },
    crown(g) {
      lathe(g, malachite, [[0, 0], [.115, 0], [.115, .05], [.1, .06], [0, .06]]);
      lathe(g, silver, [[0, .06], [.085, .06], [.07, .08], [.03, .1], [.026, .14], [.05, .165], [.1, .2], [.122, .26], [.118, .34], [.1, .385], [.104, .395], [.09, .41], [.05, .44], [.03, .455], [0, .455]]);
      lathe(g, M.gold, [[.118, .3], [.126, .3], [.126, .318], [.118, .318]]);
      lathe(g, M.gold, [[0, .45], [.05, .45], [.058, .5], [.05, .5], [0, .47]]);                      // crown band
      for (let n = 0; n < 7; n++) { const a = n / 7 * TAU, p = new THREE.Mesh(new THREE.ConeGeometry(.014, .04, 8), M.gold); p.position.set(Math.cos(a) * .054, .515, Math.sin(a) * .054); g.add(p); }
      for (const s of [1, -1]) {
        const path = new THREE.CatmullRomCurve3([[.112, .33], [.165, .345], [.185, .29], [.16, .235], [.108, .225]].map(([x, y]) => new THREE.Vector3(s * x, y, 0)));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 30, .012, 10), silver));
      }
    },
  };

  const objects = items.map((item, n) => {
    const g = new THREE.Group();
    let home;
    if (item.kind === 'shirt') {
      const i = shirts.indexOf(item);
      g.add(makeShirt(item, crests[n]));
      box(g, M.bronze, .5, .02, .02, 0, .57, 0); box(g, M.bronze, .02, .1, .02, 0, .62, 0);
      home = new THREE.Vector3((i - (shirts.length - 1) / 2) * GAP, RAIL_Y, .5);
      plane(wall, pic(label(item.plaque), { transparent: true }), .9, .11, home.x, RAIL_Y - .72, .13);
    } else {
      const i = trophies.indexOf(item);
      const cup = new THREE.Group(); cup.position.y = .1; g.add(cup);
      (CUPS[item.cup] || CUPS.globe)(cup);
      box(g, M.dark, .34, .1, .34, 0, .05, 0);
      plane(g, pic(label(item.plaque, 512, 96, '#f4d47c'), { transparent: true }), .32, .06, 0, .05, .172);
      home = new THREE.Vector3((i - (trophies.length - 1) / 2) * 2.2, SHELF_Y, 1.15);
    }
    g.position.copy(home);
    g.traverse(m => { m.userData.id = item.id; });
    wall.add(g);
    return { item, g, home, turn: 0, spin: 0 };
  });
  const byId = Object.fromEntries(objects.map(o => [o.item.id, o]));

  // --- Doorways, and framed shirts of favourite players around the room ---
  const doorway = (x, w, from, to) => {
    plane(scene, pic(fade(from, to)), w, 3.5, x, 1.75, -6.96);
    for (const side of [-1, 1]) box(scene, M.bronze, .14, 3.7, .3, x + side * (w / 2 + .07), 1.85, -6.9);
    box(scene, M.bronze, w + .28, .14, .3, x, 3.67, -6.9);
  };
  doorway(-6.4, 2.0, '#1aa598', '#0a2440');
  doorway(6.4, 2.0, '#17806f', '#0b2a33');
  // A gallery on the right-hand wall, hung in rows under the lettering; hero.spot is [column, row] from the
  // top left. Each frame can be walked up to (see `standing` below). The frames are a little under full size
  // so that two rows fit below the lettering, which is as high as it can go and still be seen from the doorway.
  const HUNG = .8, COL_Z = 1.24, ROW_Y = 1.45, TOP_Y = 2.74, MID_Z = -3.66;
  const cols = Math.max(...heroes.map(h => h.spot[0])) + 1, rows = Math.max(...heroes.map(h => h.spot[1])) + 1;
  const LOW_Y = TOP_Y - (rows - 1) * ROW_Y - .81 * HUNG;          // bottom edge of the lowest frame
  const frames = heroes.map(hero => {
    const frame = new THREE.Group(); frame.position.set(7.96, TOP_Y - hero.spot[1] * ROW_Y, MID_Z + (hero.spot[0] - (cols - 1) / 2) * COL_Z); frame.rotation.y = -Math.PI / 2; frame.scale.setScalar(HUNG); scene.add(frame);
    box(frame, M.bronze, 1.26, 1.62, .05, 0, 0, 0);
    box(frame, M.dark, 1.18, 1.54, .06, 0, 0, .01);
    box(frame, std(0x222a30, .85, 0), 1.06, 1.42, .02, 0, 0, .04);
    box(frame, M.white, .62, .018, .04, 0, .86, .1);
    const tex = heroTex(hero); tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    plane(frame, new THREE.MeshBasicMaterial({ map: tex, alphaTest: .5 }), .94, 1.03, 0, .1, .06);
    plane(frame, pic(label(hero.plaque, 1024, 128, '#c9d6de', '600 50px "Martian Mono", monospace'), { transparent: true }), .96, .12, 0, -.56, .06);
    frame.traverse(m => { m.userData.id = hero.id; });
    return { id: hero.id, frame, at: frame.position, size: HUNG };
  });
  // HALL OF FAME over the gallery, in raised gold letters: a stack of cut-outs stepping off the wall for the
  // depth, a bright face on top, and a halo behind. Clicking it stands the camera back far enough to see every frame.
  const sign = new THREE.Group();
  sign.position.set(7.96, 3.84, MID_Z); sign.rotation.y = -Math.PI / 2; scene.add(sign);
  const letters = paint => canvasTex(2048, 360, (g, w, h) => {
    g.font = 'italic 800 190px Anybody, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    paint(g, h); g.fillText('HALL OF FAME', w / 2, h / 2 + 8, w * .86);
  });
  const halo = plane(sign, new THREE.MeshBasicMaterial({ map: letters(g => { g.fillStyle = g.shadowColor = '#ffb81f'; g.shadowBlur = 46; }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 3.3, .58, 0, -.02, .008);
  const side = letters(g => { g.fillStyle = '#ffffff'; });
  for (let n = 0; n < 9; n++) plane(sign, new THREE.MeshBasicMaterial({ map: side, alphaTest: .5, color: new THREE.Color(0xc98a1e).multiplyScalar(.42 + n * .07) }), 3.3, .58, 0, (n - 9) * .0045, .014 + n * .01);
  const face = letters((g, h) => { const f = g.createLinearGradient(0, h * .2, 0, h * .8); f.addColorStop(0, '#fffdf2'); f.addColorStop(.55, '#ffeeb0'); f.addColorStop(1, '#f7c84a'); g.fillStyle = f; });
  plane(sign, new THREE.MeshBasicMaterial({ map: face, transparent: true, alphaTest: .05, color: new THREE.Color(0xffffff).multiplyScalar(1.15) }), 3.3, .58, 0, 0, .106).renderOrder = 2;
  sign.traverse(m => { m.userData.id = 'hall'; });
  frames.push({ id: 'hall', frame: sign, at: new THREE.Vector3(7.96, (LOW_Y + 4.14) / 2, MID_Z), wide: true });
  const frameById = Object.fromEntries(frames.map(f => [f.id, f]));
  const NORMAL = new THREE.Vector3(-1, 0, 0), RIGHT = new THREE.Vector3(0, 0, 1);

  // --- Lights ---
  scene.add(new THREE.AmbientLight(0xa9bccd, .42));
  light(0xfff0d8, 26, 0, 4.3, -4.2);
  light(0xfff0d8, 7, -3.2, 3.6, -5.0, 8);
  light(0xfff0d8, 7, 3.2, 3.6, -5.0, 8);
  light(0xffd23f, 12, -6.4, 2.4, -5.6);
  light(0xffd23f, 12, 6.4, 2.4, -5.6);
  light(0xffd23f, 6, -6.4, 2.6, 1.0, 7);
  light(0x2f66d8, 5, 0, 1.5, -4.9, 5);
  light(0xdfeeff, 5, -1.2, 1.0, 3.2, 6);
  const key = light(0xffffff, 0, 0, 3.2, -4.2, 6);   // follows the selected kit

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .38, .5, .9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // --- Framing the wall: face it square on, leaving room for the page's side panel ---
  // On upright screens only a few shirts fit, so the camera tracks the selected one along the rail.
  const view = { dist: 8, shift: 0, track: .1, y: 2.12, near: 2.6, nearShift: 0, nearDrop: 0, far: 6, farShift: 0, farDrop: 0 };
  function layout() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight, upright = w < h;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.fov = upright ? 60 : 50; camera.updateProjectionMatrix();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
    const panel = panelWidth(), free = Math.max(240, w - panel - 48);
    const compact = !upright && h < 520;        // a phone on its side: too short for the whole rail, so show a few kits and follow the chosen one
    const across = upright ? 3.1 : compact ? 4.2 : 9.7, tall = upright ? 3.0 : RAIL_Y - SHELF_Y + 2;
    view.dist = Math.max(across / (2 * tanH) * (w / free), tall / (2 * tanV) * (h / Math.max(240, h - 170)));
    view.shift = (panel / 2 / w) * 2 * view.dist * tanH;
    view.track = upright || compact ? 1 : 0;
    // Wide screens hold still unless the chosen kit, which hangs nearer and larger, would leave the space beside the panel.
    const deep = view.dist - 1.75;
    view.off = (panel / w) * tanH * (view.dist - deep); view.reach = Math.max(0, (free / w) * deep * tanH - 1.0);
    // Upright phones: the details sheet takes the lower half, and whatever sits at the camera's own height lands on the
    // sheet's top edge. So the camera hangs just under the shirts' plaques (or a trophy's base), far enough back for the hanger to clear the header.
    view.y = upright ? RAIL_Y - .83 : (SHELF_Y + RAIL_Y + .66) / 2; view.yCup = upright ? SHELF_Y - .05 : view.y;      // wide screens sit midway between the shelf and the rail
    if (upright) view.dist = Math.max(view.dist, 1.75 + (RAIL_Y + .9 - view.y) / (tanV * (1 - 150 / h)));
    // Standing in front of a framed shirt: close enough that it fills the space beside the panel.
    view.near = Math.max(2.0 * HUNG / (2 * tanV) * (h / Math.max(240, h - 170)), 1.6 * HUNG / (2 * tanH) * (w / free));
    view.nearShift = (panel / 2 / w) * 2 * view.near * tanH;
    view.nearDrop = upright ? view.near * tanV * .42 : 0;
    // Standing back from the whole gallery, lettering and all.
    view.far = Math.max((4.14 - LOW_Y + .65) / (2 * tanV) * (h / Math.max(240, h - 170)), (cols * COL_Z + .5) / (2 * tanH) * (w / free));
    view.farShift = (panel / 2 / w) * 2 * view.far * tanH;
    view.farDrop = upright ? view.far * tanV * .42 : 0;
    view.upright = upright; view.deckShift = (panel / 2 / w) * 2 * 1.5 * tanH;
  }
  layout();
  addEventListener('resize', layout);

  // --- Animation ---
  const HOME = new THREE.Vector3(-2.2, 1.8, 7.6), LOOK = new THREE.Vector3(.3, 1.9, -5);
  const pointer = new THREE.Vector2(), eye = new THREE.Vector3(), aim = new THREE.Vector3(), at = new THREE.Vector3(), goal = new THREE.Vector3(), FACING = new THREE.Quaternion();
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  let running = false, raw = 0, flight = null, sel = null, flipped = false, follow = 0, last = 0, standing = null, near = 0, away = true, level = view.y;
  const nearPos = new THREE.Vector3(), nearGoal = new THREE.Vector3(), deckQuat = new THREE.Quaternion(), DECK = { id: 'deck' }; let nearSet = false, overDeck = false, hover = null;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000 || 0), t = now / 1000, rate = calm ? 1 : 1 - Math.pow(.001, dt);
    last = now;
    if (flight) {
      const p = calm ? 1 : Math.min(1, (now - flight.t0) / FLIGHT_MS);
      raw = flight.from + (flight.to - flight.from) * p;
      if (p === 1) { flight.done(); flight = null; }
    }
    const k = ease(raw), chosen = away ? null : byId[sel];        // from the doorway nothing is singled out: every kit hangs in its place
    eye.set(HOME.x + pointer.x * .5 + Math.sin(t * .35) * .08, HOME.y - pointer.y * .2 + Math.sin(t * .5) * .03, HOME.z);
    aim.set(LOOK.x + pointer.x * .4, LOOK.y - pointer.y * .3, LOOK.z);
    probe.position.copy(eye); probe.lookAt(aim);
    const cx = chosen ? chosen.home.x : 0, rel = cx - view.off;
    follow += ((view.track ? cx : chosen ? rel - Math.max(-view.reach, Math.min(view.reach, rel)) : 0) - follow) * rate;
    level += ((chosen && chosen.item.kind !== 'shirt' ? view.yCup : view.y) - level) * rate;
    at.set(follow + view.shift + pointer.x * .15 * k, level - pointer.y * .08 * k, WALL_Z + view.dist);
    camera.position.lerpVectors(eye, at, k);
    camera.quaternion.slerpQuaternions(probe.quaternion, FACING, k);
    // A favourite player's frame: walk over and stand in front of it, wherever the camera was.
    const want = overDeck ? DECK : frameById[sel] && !away ? frameById[sel] : null;
    if (want) standing = want;
    near += ((want ? 1 : 0) - near) * (calm ? 1 : 1 - Math.pow(.02, dt));
    const n = ease(near);
    if (standing && n > .001) {
      const far = standing.wide;
      if (standing === DECK) {                       // lean over the turntable, the record to the left of the panel
        const d = view.upright ? 1.9 : 1.35, shift = view.deckShift;
        nearGoal.set(2.68 + shift, .62 + d * .78, 1.2 + d * .62); aim.set(2.68 + shift, .66 - (view.upright ? .42 : 0), 1.2);
        probe.position.copy(nearGoal); probe.lookAt(aim); deckQuat.copy(probe.quaternion);
      } else { nearGoal.copy(standing.at).addScaledVector(NORMAL, far ? view.far : view.near).addScaledVector(RIGHT, far ? view.farShift : view.nearShift); nearGoal.y -= far ? view.farDrop : view.nearDrop; }
      if (!nearSet || calm) { nearPos.copy(nearGoal); nearSet = true; } else nearPos.lerp(nearGoal, rate);     // glide between frames
      camera.position.lerp(nearPos, n); camera.quaternion.slerp(standing === DECK ? deckQuat : standing.frame.quaternion, n);
    }
    if (spinning && !calm) disc.rotation.y -= dt * 3.5;                                  // 33 and a third
    arm.rotation.y += ((spinning ? -.42 : .12) - arm.rotation.y) * rate;
    driftNotes(dt, t);
    if (n < .002) nearSet = false;
    sheen.offset.x = calm ? 2 : 1.2 - (t * .45) % 3.2;
    halo.material.opacity = calm ? .85 : .8 + Math.sin(t * 1.4) * .15;
    bloom.strength = (.38 - .3 * k) * (1 - .8 * n);   // less glow up close, where it would wash out the print

    // The selected kit comes off the wall toward the camera; a selected trophy lifts and turns.
    for (const o of objects) {
      const on = o === chosen, shirt = o.item.kind === 'shirt', near = !on && o.item.id === hover;
      goal.copy(o.home);
      if (on) shirt ? goal.set(o.home.x, o.home.y - .06, 1.75) : goal.set(o.home.x, o.home.y + .2, 1.5);
      else if (near) shirt ? goal.set(o.home.x, o.home.y - .02, o.home.z + .34) : goal.set(o.home.x, o.home.y + .06, o.home.z + .12);   // under the pointer: forward a little
      o.g.position.lerp(goal, rate);
      const size = on ? (shirt ? 1.25 : 1.35) : near ? 1.07 : 1;
      o.g.scale.setScalar(o.g.scale.x + (size - o.g.scale.x) * rate);
      if (shirt) {
        o.turn += ((on && flipped ? Math.PI : 0) - o.turn) * rate;
        o.g.rotation.y = o.turn + (calm ? 0 : Math.sin(t * .9 + o.home.x * 2) * .035);
      } else {
        o.spin = on && !calm ? o.spin + dt * 1.1 : o.spin + (Math.round(o.spin / (Math.PI * 2)) * Math.PI * 2 - o.spin) * rate;
        o.g.rotation.y = o.spin;
      }
    }
    // Framed shirts and the lettering ease off the wall under the pointer too.
    for (const f of frames) {
      const out = f.id === hover ? 1 : 0;
      f.lift = (f.lift || 0) + (out - (f.lift || 0)) * rate;
      f.frame.position.x = 7.96 - f.lift * .13; f.frame.scale.setScalar((f.size || 1) * (1 + f.lift * .04));
    }
    key.intensity += ((chosen ? 5 : 0) * k - key.intensity) * rate;
    if (chosen) key.position.x += (chosen.home.x - key.position.x) * rate;
    composer.render();
  }

  // --- Picking kits with the pointer ---
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const hit = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.x) / r.width * 2 - 1, -((e.clientY - r.y) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const found = ray.intersectObjects([...objects.map(o => o.g), ...frames.map(f => f.frame), deck], true)[0];
    return found ? found.object.userData.id : null;
  };
  addEventListener('pointermove', e => {
    pointer.set(e.clientX / innerWidth - .5, e.clientY / innerHeight - .5);
    hover = e.target === canvas ? hit(e) : null;
    canvas.style.cursor = hover ? 'pointer' : '';
  });
  document.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('click', e => { const id = hit(e); if (id) onPick(id); });

  const fly = to => new Promise(done => { layout(); flight = { from: raw, to, t0: performance.now(), done }; });
  return {
    start() { if (!running) { running = true; requestAnimationFrame(frame); } },
    stop() { running = false; },
    // The record turns while the page says music is playing.
    spin(on) { spinning = !!on; },
    // Walk over to the turntable and look down at the record, or step away again.
    overDeck(on) { overDeck = !!on; if (on) layout(); },
    // Where a point in the room is on screen right now, for labels the page lays over the canvas.
    project(x, y, z) { goal.set(x, y, z).project(camera); return { x: (goal.x + 1) / 2 * canvas.clientWidth, y: (1 - goal.y) / 2 * canvas.clientHeight, on: goal.z < 1 && Math.abs(goal.x) < .97 && Math.abs(goal.y) < .9 }; },
    toWall: () => { away = false; return fly(1); },
    toRoom: () => { away = true; return fly(0); },
    layout,
    select(id) { if (id !== sel) flipped = false; sel = id; },
    flip() { if (byId[sel]?.item.kind === 'shirt') flipped = !flipped; return flipped; },
    // Fade everything except the given ids; pass null to clear.
    dim(ids) {
      for (const o of objects) {
        const off = ids && !ids.has(o.item.id);
        o.g.traverse(m => {
          if (!m.material) return;
          // Materials are shared between kits, so each mesh gets its own copy the first time it is dimmed.
          if (!m.material.userData.base) { m.material = m.material.clone(); m.material.userData = { base: m.material.color.clone(), glow: m.material.emissiveIntensity }; }
          m.material.color.copy(m.material.userData.base).multiplyScalar(off ? .22 : 1);
          if (m.material.emissiveMap) m.material.emissiveIntensity = off ? .04 : m.material.userData.glow;
        });
      }
    },
  };
}

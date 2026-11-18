import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { HOTSPOTS, STATUS, MILESTONE_UTC, LIGHT_DAY_KM, SPEED_KMS, REAL_SCALE, RECORD, WHIPS, BUS_CENTER } from './data.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// mm Z-up (print frame) -> metres Y-up (three)
const v3 = (p) => new THREE.Vector3(p[0] / 1000, p[2] / 1000, -p[1] / 1000);
const d3 = (d) => new THREE.Vector3(d[0], d[2], -d[1]).normalize();

const $ = (s) => document.querySelector(s);
const ui = {
  overlay: $('#overlay'), start: $('#start'), gesture: $('#gesture'), hs: $('#hotspots'),
  hint: $('#hint'), align: $('#alignbar'), bar: $('#bar'), card: $('#card'), hud: $('#hud'), sunLabel: $('#sunlabel'),
};

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.xr.enabled = true;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 2000);
camera.position.set(-0.46, 0.2, 0.06);

scene.add(new THREE.HemisphereLight(0xdde6ff, 0x3a3020, 1.4));
const sunLight = new THREE.DirectionalLight(0xfff2dd, 2.6);
sunLight.position.set(-0.6, 1.4, 0.4);
scene.add(sunLight);

const anchor = new THREE.Group(); // world pose of the physical print
anchor.matrixAutoUpdate = false;
scene.add(anchor);
const pivot = new THREE.Group(); // pivot at bus centre so "real size" grows around the bus
const busC = v3(BUS_CENTER);
pivot.position.copy(busC);
anchor.add(pivot);
const content = new THREE.Group(); // model frame (metres, origin = table under bus)
content.position.copy(busC).negate();
pivot.add(content);

// ---------- state ----------
const S = {
  mode: 'preview', // preview | ar
  phase: 'idle', // ar: scan | align | locked
  space: false, spaceT: 0, realSize: false, scaleT: 1,
  twin: false, selected: null, calScale: 1, yaw: 0, pos: new THREE.Vector3(),
  frame: 0, openedAt: Date.now(),
};

// ---------- model ----------
const parts = {}; // name -> mesh
const origMats = new Map();
let modelRoot;
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.28, depthWrite: false });
const ghostEdge = new THREE.LineBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.55 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0x4fe3ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
const edges = [];

async function loadModel() {
  const gltf = await new GLTFLoader().loadAsync('assets/voyager.glb');
  modelRoot = gltf.scene;
  modelRoot.traverse((o) => {
    if (o.isMesh) {
      const n = (o.name || o.parent?.name || '').replace(/_\d+$/, '');
      const key = Object.keys(namesMap).find((k) => n.startsWith(k)) || n;
      parts[key] = o;
      o.material.side = THREE.DoubleSide;
      if (o.geometry.attributes.color) o.material.vertexColors = true;
      origMats.set(o, o.material);
      o.geometry.computeBoundsTree();
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 35), ghostEdge);
      e.visible = false; o.add(e); edges.push(e);
    }
  });
  content.add(modelRoot);

  // Golden record (procedural)
  const rec = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(RECORD.radius / 1000, RECORD.radius / 1000, 0.0006, 48),
    new THREE.MeshStandardMaterial({ color: 0xe8c25a, metalness: 1, roughness: 0.25 }));
  disc.rotation.x = Math.PI / 2;
  const label = new THREE.Mesh(new THREE.RingGeometry(0.0006, 0.0014, 32), new THREE.MeshBasicMaterial({ color: 0x8a6a1a, side: THREE.DoubleSide }));
  label.position.z = 0.00031;
  rec.add(disc, label);
  const n = d3(RECORD.normal);
  rec.position.copy(v3(RECORD.center)).addScaledVector(n, 0.0004);
  rec.lookAt(rec.position.clone().add(n));
  content.add(rec);
  parts.record = disc;
  origMats.set(disc, disc.material);
  disc.geometry.computeBoundsTree();

  // Plasma-wave whip antennas (procedural)
  const whips = new THREE.Group();
  const root = v3(WHIPS.root);
  for (const d of WHIPS.dirs) {
    const dir = d3(d);
    const len = WHIPS.length / 1000;
    const g = new THREE.CylinderGeometry(0.0004, 0.0004, len, 6);
    g.translate(0, len / 2, 0);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.9, roughness: 0.3 }));
    m.position.copy(root);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    whips.add(m);
    origMats.set(m, m.material);
  }
  content.add(whips);
  parts.whips = whips;
}
const namesMap = { dish: 1, bus_box: 1, bus: 1, legs: 1, block_a: 1, block_b: 1, rtg_boom: 1, rtg: 1, stand: 1, mag_1: 1, mag_2: 1, mag_3: 1, sci_a: 1, sci_b: 1 };

function meshesOf(key) {
  const p = parts[key];
  if (!p) return [];
  const out = [];
  p.traverse ? p.traverse((o) => o.isMesh && out.push(o)) : out.push(p);
  return out;
}
function allMeshes() {
  const out = [];
  content.traverse((o) => o.isMesh && out.push(o));
  return out;
}

// display: 'full' | 'ghost' | 'hidden'
function setDisplay(mode) {
  const hl = new Set((S.selected?.parts || []).flatMap(meshesOf));
  for (const m of allMeshes()) {
    if (!origMats.has(m)) continue;
    const orig = origMats.get(m);
    if (mode === 'full') { m.material = orig; m.visible = true; }
    else if (mode === 'ghost') { m.material = ghostMat; m.visible = true; }
    else { m.visible = hl.has(m); m.material = glowMat; }
    if (mode === 'full' && hl.size) {
      if (hl.has(m)) {
        if (!m.userData.hlMat) { m.userData.hlMat = orig.clone(); m.userData.hlMat.emissive = new THREE.Color(0x2fb8ff); }
        m.material = m.userData.hlMat;
      }
    }
  }
  edges.forEach((e) => (e.visible = mode === 'ghost'));
  S.display = mode;
}
function refreshDisplay() {
  content.visible = !(S.mode === 'ar' && S.phase === 'scan');
  if (S.mode === 'preview' || S.space) return setDisplay('full');
  if (S.phase === 'align' || S.phase === 'scan') return setDisplay('ghost');
  setDisplay(S.twin ? 'full' : 'hidden');
}

// ---------- hotspots (DOM, projected each frame) ----------
const hsEls = [];
const hsObjs = [];
HOTSPOTS.forEach((h, i) => {
  const o = new THREE.Object3D();
  o.position.copy(v3(h.p));
  content.add(o);
  hsObjs.push(o);
  const b = document.createElement('button');
  b.className = `hs ${STATUS[h.status].cls}`;
  b.innerHTML = `<span class="dot"><span class="ping"></span></span><span class="lbl">${h.short}</span>`;
  b.style.animationDelay = `${(i * 0.17) % 1.2}s`;
  b.addEventListener('click', (e) => { e.stopPropagation(); select(i); });
  ui.hs.appendChild(b);
  hsEls.push(b);
});

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const ray = new THREE.Raycaster();
const occluded = new Array(HOTSPOTS.length).fill(false);

function activeCamera() {
  if (renderer.xr.isPresenting) {
    const xc = renderer.xr.getCamera();
    return xc.cameras && xc.cameras.length ? xc.cameras[0] : xc;
  }
  return camera;
}

function updateHotspots() {
  const show = (S.mode === 'preview' || S.phase === 'locked');
  ui.hs.style.display = show ? '' : 'none';
  if (!show) return;
  const cam = activeCamera();
  cam.updateMatrixWorld();
  _c.setFromMatrixPosition(cam.matrixWorld);
  const W = ui.overlay.clientWidth || innerWidth;
  const H = ui.overlay.clientHeight || innerHeight;
  const doOcc = S.frame % 8 === 0;
  const meshes = doOcc ? allMeshes().filter((m) => origMats.has(m)) : null;
  hsObjs.forEach((o, i) => {
    o.getWorldPosition(_v);
    if (doOcc) {
      const dir = _v.clone().sub(_c);
      const dist = dir.length();
      ray.set(_c, dir.normalize());
      ray.far = dist - 0.006 * Math.max(1, pivot.scale.x);
      const hit = ray.intersectObjects(meshes, false);
      occluded[i] = hit.length > 0;
    }
    const p = _v.clone().project(cam);
    const el = hsEls[i];
    if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.3 || Math.abs(p.y) > 1.3) { el.style.display = 'none'; return; }
    el.style.display = '';
    const x = (p.x * 0.5 + 0.5) * W;
    const y = (-p.y * 0.5 + 0.5) * H;
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.classList.toggle('behind', occluded[i]);
    el.classList.toggle('sel', S.selected === HOTSPOTS[i]);
  });
  // sun label in space mode
  if (S.space && S.spaceT > 0.5) {
    sunSprite.getWorldPosition(_v);
    const p = _v.project(cam);
    if (p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) {
      ui.sunLabel.style.display = '';
      ui.sunLabel.style.transform = `translate(${(p.x * 0.5 + 0.5) * W}px, ${(-p.y * 0.5 + 0.5) * H}px)`;
    } else ui.sunLabel.style.display = 'none';
  } else ui.sunLabel.style.display = 'none';
}

// ---------- info card + audio ----------
const audio = new Audio();
audio.preload = 'auto';
let audioOk = false;
function select(i) {
  const h = HOTSPOTS[i];
  if (S.selected === h) return closeCard();
  S.selected = h;
  const st = STATUS[h.status];
  ui.card.querySelector('.title').textContent = h.title;
  const chip = ui.card.querySelector('.chip');
  chip.textContent = h.statusText || st.label;
  chip.className = `chip ${st.cls}`;
  ui.card.querySelector('.text').textContent = h.text;
  ui.card.querySelector('.live').style.display = h.live ? '' : 'none';
  ui.card.classList.add('open');
  ui.card.querySelector('.audio').style.display = h.audio ? '' : 'none';
  if (h.audio) playAudio(h.audio); else audio.pause();
  refreshDisplay();
}
function closeCard() {
  S.selected = null;
  ui.card.classList.remove('open');
  audio.pause();
  refreshDisplay();
}
function playAudio(src) {
  const btn = ui.card.querySelector('.play');
  audioOk = false;
  btn.disabled = true;
  btn.textContent = 'Audio coming soon';
  audio.pause();
  audio.src = src;
  audio.currentTime = 0;
  audio.oncanplay = () => { audioOk = true; btn.disabled = false; };
  audio.onerror = () => { audioOk = false; btn.disabled = true; btn.textContent = 'Audio coming soon'; };
  audio.play().then(() => { audioOk = true; btn.disabled = false; btn.textContent = '❚❚ Pause'; }).catch(() => {});
}
audio.onplay = () => (ui.card.querySelector('.play').textContent = '❚❚ Pause');
audio.onpause = () => audioOk && (ui.card.querySelector('.play').textContent = '▶ Play');
audio.onended = () => (ui.card.querySelector('.play').textContent = '↻ Replay');
audio.ontimeupdate = () => {
  const f = audio.duration ? audio.currentTime / audio.duration : 0;
  ui.card.querySelector('.prog i').style.width = `${f * 100}%`;
};
ui.card.querySelector('.play').onclick = () => (audio.paused ? audio.play() : audio.pause());
ui.card.querySelector('.close').onclick = closeCard;

// ---------- live numbers ----------
const fmt = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
function liveNumbers() {
  const now = Date.now();
  const dtS = (now - MILESTONE_UTC) / 1000;
  const sinceOpen = ((now - S.openedAt) / 1000) * SPEED_KMS;
  const lightH = 24 + (dtS * SPEED_KMS) / 299792.458 / 3600;
  const hh = Math.floor(lightH), mm = Math.floor((lightH - hh) * 60), ss = Math.floor(((lightH - hh) * 60 - mm) * 60);
  return {
    speed: `${fmt(SPEED_KMS * 3600)} km/h`,
    kms: `${fmt(SPEED_KMS, 1)} km/s`,
    dist: `${fmt((LIGHT_DAY_KM + dtS * SPEED_KMS) / 1e9, 3)} billion km`,
    light: `${hh} h ${String(mm).padStart(2, '0')} m ${String(ss).padStart(2, '0')} s`,
    open: `${fmt(sinceOpen)} km`,
  };
}
function updateLive() {
  const L = liveNumbers();
  document.querySelectorAll('[data-live]').forEach((el) => (el.textContent = L[el.dataset.live]));
}
setInterval(updateLive, 250);

// ---------- space mode ----------
const space = new THREE.Group();
space.visible = false;
scene.add(space);
let sky, stars, sunSprite, earthSprite, streaks, streakData;
const SKY_R = 600;
const FLOW = new THREE.Vector3(0, 1, 0); // relative flow points along the dish (toward Earth/Sun)

function makeSkyTexture() {
  const w = 4096, h = 2048;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#01020a'; g.fillRect(0, 0, w, h);
  const rnd = mulberry(7);
  // Milky Way band (sinusoid across equirect)
  const band = (x) => h * 0.5 + Math.sin((x / w) * Math.PI * 2 + 0.6) * h * 0.28;
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * w;
    const y = band(x) + gauss(rnd) * h * 0.06;
    const r = 20 + rnd() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const tint = rnd() < 0.2 ? '255,200,170' : rnd() < 0.5 ? '170,190,255' : '220,215,235';
    grd.addColorStop(0, `rgba(${tint},${0.035 + rnd() * 0.03})`);
    grd.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // dark dust lanes
  for (let i = 0; i < 700; i++) {
    const x = rnd() * w, y = band(x) + gauss(rnd) * h * 0.018, r = 10 + rnd() * 40;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(0,0,5,0.18)'); grd.addColorStop(1, 'rgba(0,0,5,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // star dust
  for (let i = 0; i < 26000; i++) {
    const x = rnd() * w;
    const inBand = rnd() < 0.55;
    const y = inBand ? band(x) + gauss(rnd) * h * 0.07 : rnd() * h;
    const b = Math.pow(rnd(), 3);
    const a = 0.25 + b * 0.75;
    const s = 0.6 + b * 1.6;
    const col = rnd() < 0.15 ? `rgba(255,214,180,${a})` : rnd() < 0.3 ? `rgba(180,205,255,${a})` : `rgba(255,255,255,${a})`;
    g.fillStyle = col; g.fillRect(x, y, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { return (r() + r() + r() + r() - 2) / 1.2; }
function glowTex(inner, outer, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(0.15, inner); grd.addColorStop(0.35, outer); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildSpace() {
  sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 64, 32),
    new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  space.add(sky);

  // crisp bright stars
  const N = 1400, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const r = mulberry(11);
  for (let i = 0; i < N; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([s * Math.cos(th) * SKY_R * 0.9, u * SKY_R * 0.9, s * Math.sin(th) * SKY_R * 0.9], i * 3);
    const k = 0.6 + r() * 0.4, warm = r();
    col.set(warm < 0.2 ? [k, k * 0.85, k * 0.7] : warm < 0.4 ? [k * 0.8, k * 0.88, k] : [k, k, k], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  stars.frustumCulled = false; stars.renderOrder = -9;
  space.add(stars);

  // Sun (+ pale blue dot) in the dish direction: the HGA points at Earth
  sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,250,235,1)', 'rgba(255,200,120,0.25)'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  sunSprite.scale.setScalar(30);
  sunSprite.renderOrder = -8;
  earthSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(150,200,255,1)', 'rgba(80,140,255,0.2)', 64), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  earthSprite.scale.setScalar(3.2);
  earthSprite.renderOrder = -8;
  space.add(sunSprite, earthSprite);

  // dust streaks flowing past (relative motion)
  const M = 1600;
  streakData = { n: M, p: new Float32Array(M * 3), len: new Float32Array(M), spd: new Float32Array(M) };
  const lp = new Float32Array(M * 6), lc = new Float32Array(M * 8);
  for (let i = 0; i < M; i++) {
    respawn(i, true);
    const b = 0.35 + r() * 0.65;
    lc.set([0.75 * b, 0.85 * b, 1.0 * b, 0.0, 0.85 * b, 0.92 * b, 1.0 * b, 0.95 * b], i * 8);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  lg.setAttribute('color', new THREE.BufferAttribute(lc, 4));
  streaks = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  streaks.frustumCulled = false;
  space.add(streaks);
}
const STREAK_R = 3.5, STREAK_H = 7;
function respawn(i, anywhere) {
  const r = Math.random;
  const a = r() * Math.PI * 2, rad = 0.25 + Math.sqrt(r()) * STREAK_R;
  streakData.p[i * 3] = Math.cos(a) * rad;
  streakData.p[i * 3 + 1] = anywhere ? (r() - 0.5) * STREAK_H : -STREAK_H / 2 - r() * 0.5;
  streakData.p[i * 3 + 2] = Math.sin(a) * rad;
  streakData.len[i] = 0.12 + r() * 0.5;
  streakData.spd[i] = 5 + r() * 4;
}
const _q = new THREE.Quaternion();
function updateSpace(dt, cam) {
  const target = S.space ? 1 : 0;
  S.spaceT += (target - S.spaceT) * Math.min(1, dt * 2.2);
  if (Math.abs(S.spaceT - target) < 0.002) S.spaceT = target;
  space.visible = S.spaceT > 0.001;
  if (!space.visible) return;
  const t = S.spaceT;
  sky.material.opacity = t; stars.material.opacity = t;
  sunSprite.material.opacity = t; earthSprite.material.opacity = t * 0.9; streaks.material.opacity = t;
  // sky/stars/sun centred on the viewer (infinitely far)
  _c.setFromMatrixPosition(cam.matrixWorld);
  sky.position.copy(_c); stars.position.copy(_c);
  // flow direction in world = anchor's up (dish axis)
  anchor.getWorldQuaternion(_q);
  const flow = FLOW.clone().applyQuaternion(_q);
  sunSprite.position.copy(_c).addScaledVector(flow, SKY_R * 0.8);
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
  earthSprite.position.copy(sunSprite.position).addScaledVector(side, 9);
  // streaks live in anchor frame
  streaks.matrixAutoUpdate = false;
  streaks.matrix.copy(anchor.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(busC.x, busC.y, busC.z));
  const P = streaks.geometry.attributes.position.array;
  const sp = streakData;
  const k = S.realSize ? 1.6 : 1;
  for (let i = 0; i < sp.n; i++) {
    sp.p[i * 3 + 1] += sp.spd[i] * dt * k;
    if (sp.p[i * 3 + 1] > STREAK_H / 2) respawn(i, false);
    const x = sp.p[i * 3], y = sp.p[i * 3 + 1], z = sp.p[i * 3 + 2];
    P.set([x, y - sp.len[i] * k, z, x, y, z], i * 6);
  }
  streaks.geometry.attributes.position.needsUpdate = true;
  // sunlight comes from the dish direction in space
  sunLight.position.copy(flow).multiplyScalar(2).add(new THREE.Vector3(0.3, 0, 0.2));
}

function setSpace(on) {
  S.space = on;
  document.body.classList.toggle('space', on);
  $('#btnSpace').classList.toggle('active', on);
  $('#btnReal').style.display = on ? '' : 'none';
  if (!on && S.realSize) setRealSize(false);
  if (!on) sunLight.position.set(-0.6, 1.4, 0.4);
  refreshDisplay();
}
function setRealSize(on) {
  S.realSize = on;
  $('#btnReal').classList.toggle('active', on);
  $('#btnReal').textContent = on ? 'Print size' : 'Real size';
}

// ---------- AR ----------
let xrSession = null, hitSource = null, xrRef = null, xrAnchor = null;
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.04, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.9 }));
reticle.matrixAutoUpdate = false; reticle.visible = false;
scene.add(reticle);
let hitPose = null;

async function startAR() {
  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'anchors', 'local-floor'],
      domOverlay: { root: ui.overlay },
    });
  } catch (e) {
    alert('Could not start AR: ' + e.message);
    return;
  }
  S.mode = 'ar';
  document.body.classList.add('ar');
  controls.enabled = false;
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(xrSession);
  xrRef = renderer.xr.getReferenceSpace();
  const viewer = await xrSession.requestReferenceSpace('viewer');
  hitSource = await xrSession.requestHitTestSource({ space: viewer });
  xrSession.addEventListener('end', endAR);
  setPhase('scan');
  ui.start.classList.add('hidden');
}
function endAR() {
  hitSource = null; xrSession = null; xrAnchor = null;
  S.mode = 'preview'; S.phase = 'idle';
  document.body.classList.remove('ar');
  controls.enabled = true;
  reticle.visible = false;
  anchor.matrix.identity(); anchor.matrixWorldNeedsUpdate = true;
  setSpace(false); closeCard();
  setPhase('idle');
}
function setPhase(p) {
  S.phase = p;
  document.body.dataset.phase = p;
  const hints = {
    scan: 'Point at the table next to your Voyager, then tap where the model stands',
    align: 'Drag to slide · twist with two fingers to rotate · pinch to fine-scale. Line the ghost up with your print, then Lock',
    locked: 'Tap a blinking button',
    idle: '',
  };
  ui.hint.textContent = hints[p] || '';
  ui.hint.style.display = hints[p] ? '' : 'none';
  if (p === 'locked') setTimeout(() => S.phase === 'locked' && (ui.hint.style.display = 'none'), 4000);
  reticle.visible = false;
  refreshDisplay();
}
function composeAnchor() {
  const m = new THREE.Matrix4().compose(S.pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), S.yaw), new THREE.Vector3(S.calScale, S.calScale, S.calScale));
  anchor.matrix.copy(m);
  anchor.matrixWorldNeedsUpdate = true;
}
function placeAtHit() {
  if (!hitPose || !reticle.visible) return;
  const m = new THREE.Matrix4().fromArray(hitPose.transform.matrix);
  S.pos.setFromMatrixPosition(m);
  const cam = activeCamera();
  _c.setFromMatrixPosition(cam.matrixWorld);
  const dx = _c.x - S.pos.x, dz = _c.z - S.pos.z;
  // model's -X side (the side in your photo) faces you
  S.yaw = Math.atan2(dz, -dx);
  S.calScale = 1;
  composeAnchor();
  setPhase('align');
}
async function lock(frame) {
  setPhase('locked');
  if (frame && frame.createAnchor) {
    try {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), S.yaw);
      xrAnchor = await frame.createAnchor(new XRRigidTransform({ x: S.pos.x, y: S.pos.y, z: S.pos.z }, { x: q.x, y: q.y, z: q.z, w: q.w }), xrRef);
    } catch (e) { xrAnchor = null; }
  }
}
let pendingLock = false;

// gestures (dom overlay)
const touches = new Map();
let gStart = null, moved = false;
ui.overlay.addEventListener('beforexrselect', (e) => e.preventDefault());
ui.gesture.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
  moved = false;
  gStart = snapshot();
}, { passive: true });
ui.gesture.addEventListener('touchmove', (e) => {
  if (S.phase !== 'align') return;
  const prev = snapshot();
  for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
  const cur = snapshot();
  if (!prev || !cur || prev.n !== cur.n) return;
  moved = true;
  const cam = activeCamera();
  _c.setFromMatrixPosition(cam.matrixWorld);
  const dist = Math.max(0.15, _c.distanceTo(S.pos));
  if (cur.n === 1) {
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0); right.y = 0; right.normalize();
    const fwd = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).negate(); fwd.y = 0; fwd.normalize();
    const k = dist * 0.0011;
    S.pos.addScaledVector(right, (cur.x - prev.x) * k).addScaledVector(fwd, -(cur.y - prev.y) * k);
  } else if (cur.n >= 2) {
    S.yaw -= cur.ang - prev.ang;
    S.calScale = THREE.MathUtils.clamp(S.calScale * (cur.d / prev.d), 0.8, 1.25);
    $('#scaleVal').textContent = `${Math.round(S.calScale * 100)}%`;
  }
  composeAnchor();
}, { passive: true });
ui.gesture.addEventListener('touchend', (e) => {
  const wasTap = !moved && touches.size === 1;
  for (const t of e.changedTouches) touches.delete(t.identifier);
  if (wasTap && S.phase === 'scan') placeAtHit();
  if (wasTap && S.phase === 'locked' && S.selected) closeCard();
});
function snapshot() {
  const a = [...touches.values()];
  if (!a.length) return null;
  if (a.length === 1) return { n: 1, x: a[0].x, y: a[0].y };
  const dx = a[1].x - a[0].x, dy = a[1].y - a[0].y;
  return { n: 2, ang: Math.atan2(dy, dx), d: Math.hypot(dx, dy) || 1 };
}
$('#rotL').onclick = () => { S.yaw += THREE.MathUtils.degToRad(1); composeAnchor(); };
$('#rotR').onclick = () => { S.yaw -= THREE.MathUtils.degToRad(1); composeAnchor(); };
$('#btnLock').onclick = () => { pendingLock = true; };
$('#btnReplace').onclick = () => setPhase('scan');
$('#btnRealign').onclick = () => {
  if (xrAnchor) { try { xrAnchor.delete(); } catch (e) {} xrAnchor = null; }
  // continue from where the anchor currently is
  const q = new THREE.Quaternion(), sc = new THREE.Vector3();
  anchor.matrix.decompose(S.pos, q, sc);
  S.yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
  composeAnchor();
  setSpace(false); closeCard(); setPhase('align');
};
$('#btnTwin').onclick = () => { S.twin = !S.twin; $('#btnTwin').classList.toggle('active', S.twin); refreshDisplay(); };
$('#btnSpace').onclick = () => setSpace(!S.space);
$('#btnReal').onclick = () => setRealSize(!S.realSize);
$('#btnExit').onclick = () => (xrSession ? xrSession.end() : null);
$('#btnAR').onclick = startAR;
$('#btnPreview').onclick = () => { ui.start.classList.add('hidden'); };
$('#btnInfo').onclick = () => ui.start.classList.remove('hidden');

// ---------- preview controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.045, 0.03);
controls.enableDamping = true;
controls.minDistance = 0.08; controls.maxDistance = 30;
controls.update();
renderer.domElement.addEventListener('click', (e) => {
  if (S.mode === 'preview' && S.selected && e.target === renderer.domElement) closeCard();
});

addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- loop ----------
let lastT = performance.now();
renderer.setAnimationLoop((t, frame) => {
  const nowT = performance.now(); const dt = Math.min((nowT - lastT) / 1000, 0.05); lastT = nowT;
  S.frame++;
  if (frame && hitSource && S.phase === 'scan') {
    const res = frame.getHitTestResults(hitSource);
    if (res.length) {
      hitPose = res[0].getPose(xrRef);
      reticle.matrix.fromArray(hitPose.transform.matrix);
      reticle.visible = true;
    } else reticle.visible = false;
  }
  if (frame && pendingLock) { pendingLock = false; lock(frame); }
  if (frame && xrAnchor && frame.trackedAnchors && frame.trackedAnchors.has(xrAnchor)) {
    const pose = frame.getPose(xrAnchor.anchorSpace, xrRef);
    if (pose) {
      anchor.matrix.fromArray(pose.transform.matrix).multiply(new THREE.Matrix4().makeScale(S.calScale, S.calScale, S.calScale));
      anchor.matrixWorldNeedsUpdate = true;
    }
  }
  // real-size scale (smooth)
  const sTarget = S.realSize ? REAL_SCALE : 1;
  S.scaleT += (sTarget - S.scaleT) * Math.min(1, dt * 2.5);
  pivot.scale.setScalar(S.scaleT);
  if (S.mode === 'preview') {
    controls.update();
    const want = S.realSize ? 4.5 : 0.08;
    controls.minDistance = want;
    if (S.realSize && camera.position.distanceTo(controls.target) < want) camera.position.sub(controls.target).setLength(want * 1.6).add(controls.target);
  }
  // pulse highlight
  glowMat.opacity = 0.3 + 0.2 * Math.sin(t * 0.006);
  scene.updateMatrixWorld();
  const cam = activeCamera();
  updateSpace(dt, renderer.xr.isPresenting ? renderer.xr.getCamera() : camera);
  renderer.render(scene, camera);
  updateHotspots();
});

// ---------- boot ----------
(async () => {
  buildSpace();
  await loadModel();
  refreshDisplay();
  updateLive();
  const arOK = navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar').catch(() => false));
  $('#btnAR').disabled = !arOK;
  $('#arNote').textContent = arOK ? '' : 'AR needs Chrome on an ARCore phone. Use the 3D preview here.';
  document.body.classList.add('ready');
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
window.__S = S; window.__select = select; window.__space = setSpace; window.__real = setRealSize; window.__cam = camera; window.__controls = controls;

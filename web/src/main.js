import * as THREE from 'three';

// ---- Asset loading (runtime, from the user's own decoded game data) ----
const manifest = await fetch('/manifest.json').then(r => r.ok ? r.json() : null).catch(() => null);
if (!manifest) {
  const e = document.getElementById('err'); e.style.display = 'flex';
  e.textContent = 'No decoded assets found. Run: python3 tools/sj_decode.py  (needs your GOG install in game/)';
  throw new Error('missing extracted/manifest.json');
}
const loader = new THREE.TextureLoader();
const tex = name => { const t = loader.load(`/png/${name}.png`); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; };
const shipTypes = [...new Set(Object.keys(manifest.sprites).filter(k => /^SHP\d+S\d$/.test(k)).map(k => k.match(/^SHP(\d+)/)[1]))].map(Number).sort((a, b) => a - b);

// ---- Scene ----
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 5000);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// Background nebula (original PCX art) on a large sphere
if (manifest.images.NEBULA1) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.MeshBasicMaterial({ map: tex('NEBULA1'), side: THREE.BackSide, transparent: true, opacity: 0.35 }));
  scene.add(sky);
}
// Procedural starfield
{
  const n = 6000, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(800 + Math.random() * 2500); pos.set([v.x, v.y, v.z], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, color: 0xffffff })));
}

// ---- Ships: the original "MSH" files are 9 pre-rendered angle frames (S0..S8) per hull.
// We render each ship as a camera-facing billboard and pick the frame from the view angle,
// mirroring for the other side, much like the 1992 engine did.
const SCALE = 0.25;
class Ship {
  constructor(type, pos) {
    this.type = type;
    this.frames = Array.from({ length: 9 }, (_, i) => `SHP${type}S${i}`).filter(n => manifest.sprites[n]);
    this.textures = this.frames.map(tex);
    this.mat = new THREE.SpriteMaterial({ map: this.textures[0], transparent: true, alphaTest: 0.5 });
    this.sprite = new THREE.Sprite(this.mat);
    this.obj = new THREE.Object3D(); this.obj.position.copy(pos); this.obj.add(this.sprite);
    scene.add(this.obj);
    this.vel = new THREE.Vector3();
  }
  updateFrame(cam) {
    const toCam = cam.position.clone().sub(this.obj.position).normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.obj.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.obj.quaternion);
    const ang = Math.acos(THREE.MathUtils.clamp(fwd.dot(toCam), -1, 1)); // 0 = bow toward camera
    const idx = Math.round(ang / Math.PI * (this.frames.length - 1));       // GUESS: S0 bow-on .. S8 stern-on
    const mirror = right.dot(toCam) < 0;
    const name = this.frames[idx], s = manifest.sprites[name];
    this.mat.map = this.textures[idx];
    this.sprite.scale.set(s.w * SCALE * (mirror ? -1 : 1), s.h * SCALE, 1);
  }
}

const player = new Ship(shipTypes[0] ?? 0, new THREE.Vector3());
const npcs = shipTypes.slice(1).map((t, i) => {
  const a = i / Math.max(1, shipTypes.length - 1) * Math.PI * 2;
  const s = new Ship(t, new THREE.Vector3(Math.cos(a) * 150, (Math.random() - .5) * 60, Math.sin(a) * 150));
  s.obj.rotation.y = Math.random() * Math.PI * 2; return s;
});
const ships = [player, ...npcs];

// ---- Flight controls ----
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyC') cycleHull(); });
addEventListener('keyup', e => keys[e.code] = false);
let hullIdx = 0;
function cycleHull() {
  hullIdx = (hullIdx + 1) % shipTypes.length;
  const p = player.obj.position.clone(), q = player.obj.quaternion.clone();
  scene.remove(player.obj); Object.assign(player, new Ship(shipTypes[hullIdx], p)); player.obj.quaternion.copy(q);
}
let speed = 0; const clock = new THREE.Clock(); const hud = document.getElementById('hud');
const camOffset = new THREE.Vector3(0, 12, 45);

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const o = player.obj;
  const yaw = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  const pitch = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const roll = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
  o.rotateY(yaw * 1.2 * dt); o.rotateX(pitch * 0.9 * dt); o.rotateZ(roll * 1.5 * dt);
  if (keys.ShiftLeft || keys.ShiftRight) speed = Math.min(speed + 40 * dt, 120);
  if (keys.ControlLeft || keys.KeyX) speed = Math.max(speed - 60 * dt, 0);
  o.translateZ(-speed * dt);
  for (const n of npcs) { n.obj.rotateY(0.15 * dt); n.obj.translateZ(-8 * dt); }

  // chase camera
  const desired = camOffset.clone().applyQuaternion(o.quaternion).add(o.position);
  camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
  camera.quaternion.slerp(o.quaternion, 1 - Math.exp(-6 * dt));
  for (const s of ships) s.updateFrame(camera);

  hud.textContent = `SPELLJAMMER 1992 REBOOT — prototype\nhull SHP${player.type}  speed ${speed.toFixed(0)}\n` +
    `W/S pitch  A/D yaw  Q/E roll  Shift thrust  X brake  C cycle hull`;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

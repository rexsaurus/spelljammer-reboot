// Playable core loop: star map -> travel (random encounters) -> port (market, drydock, tavern) -> space combat.
import * as THREE from 'three';
import { buildDb } from '../game/data.js';
import { newGame, saveTo, loadFrom } from '../game/state.js';
import { layout, travel, bodyPositions, displayRadius } from '../game/starmap.js';
import { buy, sell, buyPrice, sellPrice, cargoUsed, maxWeapons, repair, repairCost } from '../game/economy.js';
import { startBattle, stepCombat, resolveBattle, rangeOf } from '../game/combat.js';
import { makeRng } from '../game/rng.js';
import { makeCharacter, equip, unequip, armorClass, thac0, weaponOf, hire, hireCost, dismiss, slotOf, MAX_CREW } from '../game/crew.js';
import { buyHull, hullPrice, tradeInValue } from '../game/shipyard.js';

const j = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
const [manifest, m2, items, ships, ports, inventories, rumors, bodiesJson] = await Promise.all(['/manifest.json', '/manifest2.json', '/data/items.json', '/data/ships.json', '/data/ports.json', '/data/inventories.json', '/data/rumors.json', '/data/bodies.json'].map(j));
if (!manifest || !items || !ships || !ports) {
  const e = document.getElementById('err'); e.style.display = 'flex';
  e.textContent = 'No decoded game data. Run tools/sj_decode.py, sj_more.py and sj_data.py against your own GOG copy (game/).';
  throw new Error('missing extracted data');
}
const db = buildDb({ items, ships, ports, inventories, rumors });
const bodies = bodiesJson?.bodies || [];
const map = layout(db.ports, bodies);
const disp = o => { const h = Math.hypot(o.x, o.z) || 1, f = displayRadius(h) / h; return { x: o.x * f, z: o.z * f }; };
const rng = makeRng(Date.now() & 0xffffffff);
let state = loadFrom(localStorage, 'auto') || newGame(db);
const hud = document.getElementById('hud'), logEl = document.getElementById('log'), panel = document.getElementById('panel');

// ---- audio (decoded VOC) ----
let actx; const sfxCache = {};
addEventListener('pointerdown', () => { actx ||= new AudioContext(); }, { once: true });
async function sfx(name) { if (!actx || !manifest.sounds.includes(name)) return; sfxCache[name] ||= fetch(`/wav/${name}.wav`).then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).catch(() => null); const b = await sfxCache[name]; if (!b) return; const s = actx.createBufferSource(); s.buffer = b; s.connect(actx.destination); s.start(); }

// ---- three.js scene ----
const renderer = new THREE.WebGLRenderer(); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 6000);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const loader = new THREE.TextureLoader();
const tex = n => { const t = loader.load(`/png/${n}.png`); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; };
{ const n = 4000, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(1500 + Math.random() * 2500); p.set([v.x, v.y, v.z], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false }))); }
if (manifest.images.NEBULA1) scene.add(new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), new THREE.MeshBasicMaterial({ map: tex('NEBULA1'), side: THREE.BackSide, transparent: true, opacity: .3 })));
const shipTypes = [...new Set(Object.keys(manifest.sprites).filter(k => /^SHP\d+S\d$/.test(k)).map(k => +k.match(/^SHP(\d+)/)[1]))].sort((a, b) => a - b);
function shipSprite(type) {
  const t = shipTypes[type % shipTypes.length] ?? 0, frames = Array.from({ length: 9 }, (_, i) => `SHP${t}S${i}`).filter(n => manifest.sprites[n]);
  const texs = frames.map(tex), mat = new THREE.SpriteMaterial({ map: texs[0], transparent: true, alphaTest: .5 }), spr = new THREE.Sprite(mat);
  return { spr, frames, update(heading, pos) { // pick a pre-rendered angle like the 1992 engine
    const toCam = Math.atan2(camera.position.x - pos.x, -(camera.position.z - pos.z)); let d = toCam - heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    const idx = Math.round(Math.abs(d) / Math.PI * (frames.length - 1)), s = manifest.sprites[frames[idx]]; mat.map = texs[idx];
    spr.scale.set(s.w * .4 * (d < 0 ? -1 : 1), s.h * .4, 1); spr.position.set(pos.x, 0, pos.z); } };
}

// ---- star map ----
const mapGroup = new THREE.Group(); scene.add(mapGroup);
const sphereColors = [0x88aaff, 0xffaa66, 0x66ffaa, 0xff66aa, 0xffff66, 0xaa88ff, 0x66ddff];
mapGroup.add(new THREE.Mesh(new THREE.SphereGeometry(22, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffdd55 }))); // the sun
function label(text, x, y, z, color = '#fd8') { const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d'); g.fillStyle = color; g.font = '20px monospace'; g.fillText(text, 4, 22);
  const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true })); l.scale.set(176, 22, 1); l.position.set(x, y, z); mapGroup.add(l); }
for (const b of bodyPositions(bodies)) { const d = disp(b), R = Math.hypot(d.x, d.z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(R - .6, R + .6, 128), new THREE.MeshBasicMaterial({ color: b.real ? 0x443322 : 0x221111, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; mapGroup.add(ring);
  const pm = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 10), new THREE.MeshBasicMaterial({ color: sphereColors[b.idx % sphereColors.length] })); pm.position.set(d.x, 0, d.z); mapGroup.add(pm);
  label(b.name, d.x, -18, d.z, '#9ab'); }
const portMeshes = map.map(p => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const dp = disp(p); p = { ...p, dx: dp.x, dz: dp.z }; m.position.set(p.dx, 12, p.dz); m.userData.port = p; mapGroup.add(m);
  label(p.name, p.dx, 30, p.dz); return m;
});
const marker = new THREE.Mesh(new THREE.RingGeometry(10, 13, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); marker.rotation.x = -Math.PI / 2; mapGroup.add(marker);
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
renderer.domElement.addEventListener('click', e => {
  if (mode !== 'map') return; mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(portMeshes)[0]; if (!hit) return; const p = hit.object.userData.port;
  if (p.key === state.location) return openPort();
  const r = travel(state, map, p.key, rng); autosave(); sfx('1');
  if (r.encounter) { pendingDest = r.dest; beginCombat(); } else openPort();
});

// ---- modes ----
let mode = 'map', battle = null, combatGroup = null, pendingDest = null; const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyT' && battle) battle.player.target = battle.player.target === 'hull' ? 'weapons' : 'hull'; if (e.code === 'Escape' && mode === 'port') closePanel(); });
addEventListener('keyup', e => keys[e.code] = false);
const autosave = () => saveTo(localStorage, 'auto', state);
const portName = k => map.find(p => p.key === k)?.name ?? k;
function closePanel() { panel.style.display = 'none'; mode = 'map'; }

function district(type, portKey) { const n = db.ports.findIndex(p => p.key === portKey); const opts = Object.keys(m2?.animations || {}).filter(k => new RegExp(`^${type}\\d+$`).test(k)); return opts.length ? opts[n % opts.length] : null; }
let animTimer;
function backdrop(name) {
  clearInterval(animTimer); const a = m2?.animations?.[name]; if (!a) return '';
  setTimeout(() => { const cv = panel.querySelector('canvas'); if (!cv) return; cv.width = a.w; cv.height = a.h; const g = cv.getContext('2d'), img = new Image(); img.src = `/mda/${name}.png`; let f = 0;
    animTimer = setInterval(() => { if (img.complete) { g.drawImage(img, f * a.w, 0, a.w, a.h, 0, 0, a.w, a.h); f = (f + 1) % a.frames; } }, 110); });
  return '<canvas></canvas>';
}
let recruitPool = [], recruitKey = '';
function recruits() { const k = state.location + state.day; if (k !== recruitKey) { recruitKey = k; recruitPool = [0, 1, 2].map(() => makeCharacter(rng, undefined, rng.int(1, 3))); } return recruitPool; }
function openPort(tab = 'dock') {
  mode = 'port'; panel.style.display = 'flex'; const loc = state.location;
  const tabs = ['dock', 'store', 'warehouse', 'drydock', 'tavern', 'crew'].map(t => `<button data-tab="${t}">${t}</button>`).join('');
  const type = { dock: null, store: 'STR', warehouse: 'WRH', drydock: 'DRY', tavern: 'TAV', crew: null }[tab];
  const scene = type ? district(type, loc) : (m2?.animations?.[loc] ? loc : null);
  let body = '';
  const row = (it, have) => `<tr><td>${it.name}</td><td>${buyPrice(it, loc)} gp</td><td>${sellPrice(it, loc)} gp</td><td>${have || 0}</td><td><button data-buy="${it.id}">buy</button>${have ? `<button data-sell="${it.id}">sell</button>` : ''}</td></tr>`;
  if (tab === 'dock') body = `<p>Welcome to ${portName(loc)}. Day ${state.day}.</p><button data-act="leave">Cast off (star map)</button> <button data-act="save">Save game</button> <button data-act="new">New game</button>`;
  if (type === 'STR' || type === 'WRH') { const shop = db.shops[scene] || []; body = `<table><tr><td>item</td><td>buy</td><td>sell</td><td>held</td></tr>${shop.map(r => row(db.itemsById[r.itemId], state.cargo[r.itemId])).join('')}</table>`; }
  if (type === 'DRY') { const shop = (db.shops[scene] || []).map(r => db.itemsById[r.itemId]).filter(i => i.shipWeapon);
    body = `<p>Hull ${state.ship.hull}/${state.ship.tonnage}. Repair: ${repairCost(state.ship)} gp <button data-act="repair">repair</button></p><p>Mounts ${state.ship.weapons.length}/${maxWeapons(state.ship)}: ${state.ship.weapons.map(id => db.itemsById[id]?.name).join(', ')}</p>
    <table>${shop.map(i => `<tr><td>${i.name}</td><td>${buyPrice(i, loc)} gp</td><td>${i.dmgLarge.n}d${i.dmgLarge.sides}</td><td>range ${i.range[2]}</td><td><button data-buy="${i.id}">mount</button></td></tr>`).join('')}</table>
    <h4>Ships for sale (trade-in ${tradeInValue(state.ship)} gp)</h4><table><tr><td>ship</td><td>tons/hull</td><td>cargo</td><td>price</td></tr>${db.ships.filter(x => x.id !== state.ship.shipId).map(x => `<tr><td>${x.name}</td><td>${x.tonnage}</td><td>${x.cargo}</td><td>${hullPrice(x)} gp</td><td><button data-hull="${x.id}">buy</button></td></tr>`).join('')}</table>`; }
  if (tab === 'tavern') body = `<p>Overheard:</p><p><i>${db.rumors.length ? db.rumors[rng.int(0, db.rumors.length - 1)] : '(no rumors decoded)'}</i></p><button data-tab="tavern">listen again</button>
    <h4>Adventurers looking for a berth (${state.crew.length}/${MAX_CREW} crew)</h4><table>${recruits().map((c, i) => `<tr><td>${c.name}</td><td>${c.cls} L${c.level}</td><td>HP ${c.hpMax}</td><td>S${c.str} D${c.dex} C${c.con} I${c.int} W${c.wis}</td><td>${hireCost(c)} gp</td><td><button data-hire="${i}">hire</button></td></tr>`).join('')}</table>`;
  if (tab === 'crew') body = state.crew.map((c, ci) => { const held = Object.keys(state.cargo).map(Number).filter(id => slotOf(db.itemsById[id]));
    return `<div style="border-top:1px solid #a73;margin-top:6px"><b>${c.name}</b> ${c.cls} L${c.level} · XP ${c.xp} · HP ${c.hp}/${c.hpMax} · AC ${armorClass(c, db)} · THAC0 ${thac0(c)}<br>
    STR ${c.str} DEX ${c.dex} CON ${c.con} INT ${c.int} WIS ${c.wis} CHA ${c.cha}<br>
    ${['weapon', 'armor', 'shield'].map(sl => `${sl}: ${sl === 'weapon' ? weaponOf(c, db).name : db.itemsById[c.equip[sl]]?.name ?? '—'} ${c.equip[sl] != null ? `<button data-uneq="${ci}:${sl}">remove</button>` : ''}`).join(' · ')}<br>
    ${held.map(id => `<button data-eq="${ci}:${id}">equip ${db.itemsById[id].name}</button>`).join('')} <button data-dismiss="${ci}">dismiss</button></div>`; }).join('') || '<p>No crew. Hire some at the tavern.</p>';
  panel.innerHTML = `<div>${scene ? backdrop(scene) : ''}</div><div style="flex:1"><h3>${portName(loc).toUpperCase()} — ${tab}</h3><div>${tabs}</div><p>Gold ${state.gold} · Hold ${cargoUsed(state, db).toFixed(1)}/${state.ship.cargoCap}</p><div id="msg"></div>${body}</div>`;
  panel.onclick = e => { const d = e.target.dataset; let r;
    if (d.tab) return openPort(d.tab);
    if (d.buy) r = buy(state, db, +d.buy); if (d.sell) r = sell(state, db, +d.sell);
    if (d.act === 'repair') r = repair(state);
    if (d.hull) r = buyHull(state, db, +d.hull);
    if (d.hire) { const c = recruits()[+d.hire]; r = hire(state, c); if (r.ok) recruitPool.splice(+d.hire, 1); }
    if (d.eq) { const [ci, id] = d.eq.split(':').map(Number); r = equip(state, db, ci, id); }
    if (d.uneq) { const [ci, sl] = d.uneq.split(':'); r = unequip(state, +ci, sl); }
    if (d.dismiss) r = dismiss(state, +d.dismiss); if (d.act === 'leave') return closePanel();
    if (d.act === 'save') { saveTo(localStorage, 'slot1', state); r = { ok: true }; }
    if (d.act === 'new') { state = newGame(db); autosave(); return openPort(); }
    if (r) { autosave(); openPort(tab); if (!r.ok) panel.querySelector('#msg').textContent = r.why; } };
}
function beginCombat() {
  mode = 'combat'; battle = startBattle(state, db, rng); mapGroup.visible = false; combatGroup = new THREE.Group(); scene.add(combatGroup);
  battle.pv = shipSprite(state.ship.sprite); battle.ev = shipSprite(battle.enemy.sprite); combatGroup.add(battle.pv.spr, battle.ev.spr);
  const grid = new THREE.GridHelper(2000, 40, 0x332211, 0x221100); grid.position.y = -20; combatGroup.add(grid); // plane-bound combat
  battle.rangeRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.02, 64), new THREE.MeshBasicMaterial({ color: 0x664422, side: THREE.DoubleSide })); battle.rangeRing.rotation.x = -Math.PI / 2; combatGroup.add(battle.rangeRing);
}
function endCombat() {
  resolveBattle(state, battle); const res = battle.result;
  if (res !== 'defeat' && pendingDest) { state.location = pendingDest; state.log.push(`Day ${state.day}: Limped into ${portName(pendingDest)}.`); }
  pendingDest = null; scene.remove(combatGroup); battle = null; mapGroup.visible = true; autosave(); openPort(); panel.querySelector('#msg').textContent = `Battle result: ${res}`;
}

const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), .05);
  if (mode === 'combat' && battle) {
    const input = { turn: (keys.KeyA || keys.ArrowLeft ? -1 : 0) + (keys.KeyD || keys.ArrowRight ? 1 : 0), thrust: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), fire: !!keys.Space };
    for (const ev of stepCombat(battle, input, dt, rng)) { if (ev.type === 'hit') sfx('5'); if (ev.type === 'miss') sfx('3'); }
    const p = battle.player, e = battle.enemy;
    camera.position.set(p.x - Math.sin(p.heading) * 160, 110, p.z + Math.cos(p.heading) * 160); camera.lookAt(p.x, 0, p.z);
    battle.pv.update(p.heading, p); battle.ev.update(e.heading, e);
    const r = Math.max(...p.weapons.map(rangeOf), 1); battle.rangeRing.scale.set(r, r, 1); battle.rangeRing.position.set(p.x, -19, p.z);
    const dist = Math.hypot(e.x - p.x, e.z - p.z);
    hud.textContent = `SPACE COMBAT vs ${e.name}\nYour hull ${p.hull}/${p.maxHull}   Enemy hull ${e.hull}/${e.maxHull}   Range ${dist.toFixed(0)}\n` +
      `Weapons: ${p.weapons.map(w => `${w.item.name}${w.disabled ? ' (broken)' : w.cd > 0 ? ` ${w.cd.toFixed(1)}s` : ' READY'}`).join(', ')}\nTarget: ${p.target.toUpperCase()} (T)   W/S thrust  A/D turn  Space fire   Escape: get >400 away`;
    if (battle.result) endCombat();
  } else if (mode === 'map') {
    const here = disp(map.find(p => p.key === state.location)); marker.position.set(here.x, 12, here.z);
    const t = performance.now() / 20000; camera.position.set(Math.cos(t) * 750, 650, Math.sin(t) * 750); camera.lookAt(0, 0, 0);
    hud.textContent = `REALMSPACE (orbit radii from SF3; angles approximate) — Day ${state.day}   Gold ${state.gold}   ${state.ship.name} hull ${state.ship.hull}/${state.ship.tonnage}\nAt ${portName(state.location)}. Click a port to travel there (or click your port to go ashore).`;
  } else hud.textContent = '';
  logEl.textContent = state.log.slice(-5).join('\n');
  renderer.render(scene, camera); requestAnimationFrame(tick);
}
const q = new URLSearchParams(location.search); // deep links: ?combat=1, ?map=1
if (q.has('combat')) beginCombat(); else if (!q.has('map')) openPort(q.get('tab') || 'dock');
tick();

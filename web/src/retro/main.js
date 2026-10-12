// Faithful front end: original 320x200 screens. Frames (SF.PCX), button layouts (BTN), fonts (FNT), town animations (MDA),
// sprites (MSH) and all text labels are loaded at runtime from the player's own decoded copy. Rules live in ../game/.
import * as THREE from 'three';
import { createScreen, art, ready, makeFont, W, H } from './screen.js';
import { Menu, parseLabel, TEXT, HOT, HILITE } from './menu.js';
import { buildDb } from '../game/data.js';
import { newGame, saveTo, loadFrom } from '../game/state.js';
import { layout, travel, bodyPositions } from '../game/starmap.js';
import { buy, sell, buyPrice, sellPrice, cargoUsed, repair, repairCost } from '../game/economy.js';
import { startBattle, stepCombat, resolveBattle } from '../game/combat.js';
import { makeCharacter, hire, hireCost, MAX_CREW } from '../game/crew.js';
import { forSale, buyHullClass } from '../game/hulls.js';
import { makeRng } from '../game/rng.js';
import * as B from '../game/boarding.js';
import * as Q from '../game/quest.js';

const j = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
const [manifest, m2, items, ships, ports, inventories, rumors, bodiesJson, ui, decks, monsters] = await Promise.all(
  ['/manifest.json', '/manifest2.json', '/data/items.json', '/data/ships.json', '/data/ports.json', '/data/inventories.json', '/data/rumors.json', '/data/bodies.json', '/data/btn.json', '/data/decks.json', '/data/monsters.json'].map(j));
if (!manifest || !ui || !bodiesJson) { document.body.textContent = 'Missing decoded data. Run tools/sj_decode.py, sj_more.py, sj_data.py, sj_maps.py and sj_ui.py on your own GOG copy.'; throw new Error('no data'); }
const db = buildDb({ items, ships, ports, inventories, rumors });
const bodies = bodyPositions(bodiesJson.bodies), map = layout(db.ports, bodiesJson.bodies);
const BTN = ui.buttons, VIEW = ui.viewports.SF_view, MSG = ui.viewports.SF_msg;
const rng = makeRng(Date.now() & 0xffffffff);
const { g, cv, toScreen } = createScreen();
const fontImg = new Image(); fontImg.src = '/fnt/NORMAL.png'; await ready(fontImg);
const font = makeFont(m2.fonts.NORMAL, fontImg);
let state = loadFrom(localStorage, 'auto');
const save = () => state && saveTo(localStorage, 'auto', state);
const portIdx = key => db.ports.findIndex(p => p.key === key) + 1;   // PORT10 -> 1 ... PORT70 -> 6 (district file suffix)
const say = (...lines) => { msgLines.push(...lines.map(l => l.toUpperCase())); msgLines = msgLines.slice(-6); };
let msgLines = [];

// ---------- audio ----------
let actx; const sfxCache = {};
async function sfx(n) { if (!actx || !manifest.sounds.includes(n)) return; sfxCache[n] ||= fetch(`/wav/${n}.wav`).then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).catch(() => null); const b = await sfxCache[n]; if (!b) return; const s = actx.createBufferSource(); s.buffer = b; s.connect(actx.destination); s.start(); }

// ---------- MDA animation in the viewport ----------
let anim = null;
function setAnim(name) { const a = m2.animations[name]; anim = a ? { a, img: (() => { const i = new Image(); i.src = `/mda/${name}.png`; return i; })(), f: 0, t: 0 } : null; }
function drawAnim(dt) { if (!anim || !anim.img.complete) return; anim.t += dt; if (anim.t > .11) { anim.t = 0; anim.f = (anim.f + 1) % anim.a.frames; }
  const { a } = anim; g.drawImage(anim.img, anim.f * a.w, 0, a.w, a.h, VIEW.x, VIEW.y, Math.min(a.w, VIEW.w), Math.min(a.h, VIEW.h)); }

// ---------- screens ----------
let screen = null;
const go = s => { screen = s; s.enter?.(); };
const standard = new Menu(BTN.STANDARD, b => { const n = b.image; if (n === 'DISK') go(diskScreen(screen)); if (n === 'PREFS') say('Preferences: not yet implemented.'); if (n === 'SHOWSHIP') go(shipMenuScreen(screen)); if (n === 'SHOWUS') go(crewMenuScreen(screen)); if (n === 'DOCK') { if (screen.kind === 'space') tryOrbit(true); } });
function frame(dt) { g.drawImage(art('SF'), 0, 0); }
function drawMsg() { msgLines.forEach((l, i) => font.draw(g, l, MSG.x + 3, MSG.y + 2 + i * 7, '#f0d070')); }
function shipStatus() { const s = state.ship; say(`${s.name}: hull ${s.hull}/${s.tonnage}  cargo ${cargoUsed(state, db).toFixed(0)}/${s.cargoCap}`, `weapons: ${s.weapons.map(id => db.itemsById[id]?.name).join(', ')}`, `gold ${state.gold}  day ${state.day}`); }
function crewStatus() { say(...state.crew.slice(0, 6).map(c => `${c.name} ${c.cls} L${c.level} HP ${c.hp}/${c.hpMax}`)); }

function titleScreen() {
  const menu = new Menu(BTN.PLAY, b => {
    actx ||= new AudioContext();
    if (b.id === 20) { if (!state) state = newGame(db); go(portScreen()); }
    if (b.id === 21) go(captainScreen());
    if (b.id === 22) say('');
  });
  return { kind: 'title', menu, draw() { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.drawImage(art('MTITLE'), 0, 0); g.fillStyle = '#000c'; g.fillRect(84, 126, 160, 46); menu.draw(g, font); } };
}

// ---------- captain creation: SEX -> RACE -> CLASS -> ALGN -> SHOWCR (re-roll/ok) ----------
const CLASS_MAP = { CLERIC: 'CLERIC', FIGHTER: 'FIGHTER', RANGER: 'FIGHTER', PALADIN: 'FIGHTER', MU: 'MAGE', THIEF: 'THIEF' }; // ranger/paladin use fighter tables for now
function captainScreen() {
  const pick = {}; let step = 'SEX', cap = null;
  const steps = ['SEX', 'RACE', 'CLASS', 'ALGN', 'SHOWCR'];
  const menus = {
    SEX: new Menu(BTN.SEX, b => { pick.sex = b.image; step = 'RACE'; }),
    RACE: new Menu(BTN.RACE, b => { pick.race = b.image; step = 'CLASS'; }),
    CLASS: new Menu(BTN.CLASS, b => { pick.cls = b.image; step = 'ALGN'; }),
    ALGN: new Menu(BTN.ALGN, b => { pick.algn = parseLabel(b.label).text.replace(/^\d\. /, ''); roll(); step = 'SHOWCR'; }),
    SHOWCR: new Menu(BTN.SHOWCR.map(b => ({ ...b, x: b.x + 90, y: b.y + 40 })), b => { const t = parseLabel(b.label).text; if (t === 'RE-ROLL') roll(); if (t === 'OK') { state = newGame(db); Object.assign(cap, { race: pick.race, sex: pick.sex, algn: pick.algn, captain: true, name: 'CAPTAIN' }); state.crew[0] = cap; save(); say(`Captain ${cap.name} takes command of the ${state.ship.name}.`); go(portScreen()); } else say(`${t}: available from the crew screen once in port.`); }),
  };
  const roll = () => { cap = makeCharacter(rng, CLASS_MAP[pick.cls] || 'FIGHTER'); cap.subclass = pick.cls; };
  const prompt = { SEX: 'CHOOSE YOUR SEX', RACE: 'CHOOSE YOUR RACE', CLASS: 'CHOOSE YOUR CLASS', ALGN: 'CHOOSE YOUR ALIGNMENT', SHOWCR: 'YOUR CAPTAIN' };
  return { kind: 'create', get menu() { return menus[step]; },
    draw() { g.drawImage(art('OPTION'), 0, 0); font.draw(g, prompt[step], 160 - font.width(prompt[step]) / 2, 40, '#2a1406');
      if (step === 'SHOWCR' && cap) { const L = [`${(pick.race || '').replace('ELF_H', 'HALF-ELF')} ${(pick.sex || '')} ${pick.cls === 'MU' ? 'MAGE' : pick.cls}`, pick.algn, `STR ${cap.str}  INT ${cap.int}  WIS ${cap.wis}`, `DEX ${cap.dex}  CON ${cap.con}  CHA ${cap.cha}`, `HP ${cap.hpMax}`];
        L.forEach((l, i) => font.draw(g, l, 96, 60 + i * 10, '#2a1406')); }
      menus[step].draw(g, font); } };
}
function shipMenuScreen(prev) {
  const s = state.ship; let page = null;
  const menu = new Menu(BTN.SHIP, b => { const t = parseLabel(b.label).text;
    if (/EXIT/.test(t)) return go(prev);
    if (/SPECIFICATIONS/.test(t)) page = [`${s.name}`, `TONNAGE ${s.tonnage}`, `HULL POINTS ${s.hull}/${s.tonnage}`, `CARGO CAPACITY ${s.cargoCap} TONS`, `WEAPON MOUNTS ${Math.max(1, Math.floor(s.tonnage / 10))}`];
    if (/CARGO/.test(t)) page = Object.entries(state.cargo).map(([id, n]) => `${n} ${db.itemsById[id]?.name}`).concat([`USED ${cargoUsed(state, db).toFixed(1)} OF ${s.cargoCap}`]);
    if (/WEAPON/.test(t)) page = s.weapons.map(id => { const w = db.itemsById[id]; return `${w?.name} ${w?.dmgLarge.n}D${w?.dmgLarge.sides}`; });
    if (/REPAIRS/.test(t)) page = [`HULL ${s.hull}/${s.tonnage}`, 'REPAIRS ARE MADE AT A DRYDOCK'];
    if (/LOG/.test(t)) page = state.log.slice(-15);
    if (/MANIFEST/.test(t)) page = state.crew.map(c => `${c.name} ${c.cls} L${c.level} HP ${c.hp}/${c.hpMax}`).concat(state.items?.length ? ['', ...state.items] : []); });
  return { kind: 'ship', menu, draw(dt) { frame(); g.fillStyle = '#000'; g.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); (page || []).slice(0, 16).forEach((l, i) => font.draw(g, String(l).slice(0, 30), VIEW.x + 3, VIEW.y + 3 + i * 8, '#f0d070')); menu.draw(g, font); drawMsg(); } };
}
function crewMenuScreen(prev) {
  let sel = 0, view = false;
  const menu = new Menu(BTN.STAT, b => { const t = parseLabel(b.label).text;
    if (/EXIT/.test(t)) return go(prev);
    if (/VIEW CREW/.test(t)) { view = true; sel = (sel + (view ? 1 : 0)) % Math.max(1, state.crew.length); }
    else say(`${t}: not yet implemented.`); });
  return { kind: 'crew', menu, draw() { frame(); g.fillStyle = '#000'; g.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    const c = state.crew[sel]; if (c) { const w = db.itemsById[c.equip.weapon]?.name || 'NONE', a = db.itemsById[c.equip.armor]?.name || 'NONE';
      [c.name, `${c.subclass === 'MU' ? 'MAGE' : c.subclass || c.cls}  LEVEL ${c.level}`, `XP ${c.xp}`, `HP ${c.hp}/${c.hpMax}`, '', `STR ${c.str}  INT ${c.int}`, `WIS ${c.wis}  DEX ${c.dex}`, `CON ${c.con}  CHA ${c.cha}`, '', `WEAPON ${w}`, `ARMOR ${a}`, `SHIELD ${db.itemsById[c.equip.shield]?.name || 'NONE'}`]
        .forEach((l, i) => font.draw(g, l.slice(0, 30), VIEW.x + 3, VIEW.y + 3 + i * 9, '#f0d070')); font.draw(g, `${sel + 1}/${state.crew.length}`, VIEW.x + 3, VIEW.y + 126, HILITE); }
    menu.draw(g, font); drawMsg(); } };
}

function portScreen() {
  const key = state.location, btns = BTN[key] || [];
  const DRYFILE = l => /DRYDOCK/.test(l) ? 'DRY1' : /SHIPYARD/.test(l) ? 'DRY2' : /JAMM/.test(l) ? 'DRY3' : /HARBORMASTER/.test(l) ? 'DRY4' : null;
  const classify = l => { const t = l.replace('^', ''); return /E?XIT/.test(t) && /^E\^?XIT|EXIT/.test(t) && t.startsWith('EXIT') ? 'EXIT' : /PUB|TAVERN|ALE HOUSE|PARROT/.test(t) ? 'TAV' : /TEMPLE/.test(t) ? 'TPL' : /WAREHOUSE|DEPOT|BORROWED/.test(t) ? 'WRH' : /DRYDOCK|SHIPYARD|JAMM|HARBORMASTER/.test(t) ? 'DRY' : /STORE|SUPPLIES|ARMORY|WEAPONS|ODDITIES/.test(t) ? 'STR' : /MONEYLENDER|BANK/.test(t) ? 'BNK' : /HALL|COUNCIL|LORDS|CLIVE/.test(t) ? 'HAL' : 'HAL'; };
  const menu = new Menu(btns, b => { const t = classify(b.label); if (t === 'EXIT') { say(`You cast off from ${map.find(p => p.key === key)?.name}.`); return go(orbitScreen(planetOf(key))); } go(districtScreen(t, parseLabel(b.label).text, t === 'DRY' ? DRYFILE(b.label) : null)); });
  return { kind: 'port', menu, enter() { setAnim(key); save(); say(`Welcome to ${map.find(p => p.key === key)?.name}.`); }, draw(dt) { frame(); drawAnim(dt); menu.draw(g, font); standard.draw(g, font); drawMsg(); } };
}

function districtFile(type) { const i = portIdx(state.location); for (const k of [`${type}${i}`, `${type}1`, `${type}0`]) if (BTN[k]) return k; return null; }
function districtScreen(type, title, fileOverride) {
  const file = fileOverride || districtFile(type), btns = (BTN[file] || []), loc = state.location;
  let list = null; // overlay list inside the viewport (buy/sell/hulls/recruits)
  const back = () => go(portScreen());
  const listOf = (rows, pick) => { list = { rows, pick, top: 0 }; };
  const shopRows = () => (db.shops[file] || db.shops[`${type}1`] || []).map(r => db.itemsById[r.itemId]).filter(Boolean);
  const act = b => {
    const t = parseLabel(b.label).text;
    if (/^EXIT/.test(t)) return back();
    if (type === 'STR' || type === 'WRH') {
      if (/BUY/.test(t)) listOf(shopRows().filter(i => !i.shipWeapon).map(i => ({ label: `${i.name}`, right: `${buyPrice(i, loc)}`, id: i.id })), r => { const x = buy(state, db, r.id); say(x.ok ? `Bought ${db.itemsById[r.id].name} for ${x.cost} gp.` : x.why); });
      else if (/SELL/.test(t)) listOf(Object.entries(state.cargo).map(([id, q]) => ({ label: `${q} ${db.itemsById[id].name}`, right: `${sellPrice(db.itemsById[id], loc)}`, id: +id })), r => { const x = sell(state, db, r.id); say(x.ok ? `Sold for ${x.gain} gp.` : x.why); list = null; });
      else if (/MANIFEST/.test(t)) shipStatus(); else say('The clerk has no contracts for you today.');
    }
        if (type === 'DRY') {
      const hulls = forSale(db.shops[file] || [], db.itemsById);
      if (/^BUY/.test(t)) {
        const rows = hulls.map(h => ({ label: `${h.name} ${h.tonnage}T`, right: `${h.price}`, h })).concat(shopRows().filter(i => i.shipWeapon).map(i => ({ label: i.name, right: `${buyPrice(i, loc)}`, id: i.id })));
        listOf(rows, r => { const x = r.h ? buyHullClass(state, r.h.name) : buy(state, db, r.id); say(x.ok ? (r.h ? `Your new ${r.h.name} is ready (net ${x.cost} gp).` : `${db.itemsById[r.id].name} mounted.`) : x.why); if (r.h) list = null; save(); }); return; }
      if (/CHANGE SHIPS NAME/.test(t)) { const n = prompt('ENTER NEW SHIP NAME', state.ship.name); if (n) { state.ship.name = n.toUpperCase().slice(0, 20); say(`She is now the ${state.ship.name}.`); } save(); return; }
      if (/^SELL/.test(t)) { say('Shipwrights buy no used gear today.'); return; }
      if (false) { listOf(hulls.map(h => ({ label: `${h.name} ${h.tonnage}T`, right: `${h.price}`, h })), r => { const x = buyHullClass(state, r.h.name); say(x.ok ? `Your new ${r.h.name} is ready (net ${x.cost} gp).` : x.why); list = null; }); save(); return; }
      if (/REPAIR HULL/.test(t)) { const x = repair(state); say(x.ok ? `Hull repaired for ${x.cost} gp.` : x.why); }
      else if (/MODIFY/.test(t)) go(warnScreen('HULL MODIFICATION IS NOT YET AVAILABLE.', back, back));
      else listOf(shopRows().filter(i => i.shipWeapon).map(i => ({ label: i.name, right: `${buyPrice(i, loc)}`, id: i.id })), r => { const x = buy(state, db, r.id); say(x.ok ? `${db.itemsById[r.id].name} mounted.` : x.why); });
    }
    if (type === 'TAV') {
      if (/RUMOU?R/.test(t)) say(db.rumors[rng.int(0, db.rumors.length - 1)] || '...');
      else if (/RECRUIT/.test(t)) { const pool = [0, 1, 2].map(() => makeCharacter(rng, undefined, rng.int(1, 3))); listOf(pool.map(c => ({ label: `${c.name} ${c.cls} L${c.level}`, right: `${hireCost(c)}`, c })), r => { const x = hire(state, r.c); say(x.ok ? `${r.c.name} joins the crew.` : x.why); list = null; }); }
      else if (/ROUND/.test(t)) { if (state.gold >= 10) { state.gold -= 10; say('The house cheers your name.'); } else say('Not enough gold.'); }
      else if (/DRINK/.test(t)) { if (state.gold >= 1) { state.gold -= 1; say('You nurse a drink and watch the room.'); } }
      else say('No one is hiring a ship today.');
    }
    if (type === 'TPL') { if (/HEAL/.test(t)) { const cost = state.crew.reduce((a, c) => a + (c.hpMax - c.hp) * 10, 0); if (cost > state.gold) say('Not enough gold.'); else { state.gold -= cost; state.crew.forEach(c => c.hp = c.hpMax); say(`Your crew is healed for ${cost} gp.`); } } else say('The priests see no need.'); }
    if (type === 'HAL' && state.location === 'PORT70') { const r = Q.clive(state); say(r === 'citadel-marked' ? 'Clive marks a dwarven citadel on your charts.' : r === 'gathering-marked' ? 'Clive tells you of a Neogi gathering.' : 'Clive has nothing more for you.'); }
    else if (type === 'HAL' || type === 'BNK') say('Not yet implemented.');
    save();
  };
  const menu = new Menu(btns, act);
  const buyBtns = new Menu(BTN.BUYSTUFF.map(b => ({ ...b, x: b.x + VIEW.x, y: b.y + VIEW.y + 30 })), b => { const t = parseLabel(b.label).text; if (/EXIT/.test(t)) list = null; if (/ADD/.test(t)) list.top = Math.min(list.top + 1, Math.max(0, list.rows.length - 1)); if (/SUB/.test(t)) list.top = Math.max(0, list.top - 1); if (/OK/.test(t) && list.rows[list.sel ?? list.top]) list.pick(list.rows[list.sel ?? list.top]); });
  return { kind: 'district', menu, enter() { const i = portIdx(loc); setAnim([fileOverride, `${type}${i}`, `${type}1`].find(k => k && m2.animations[k]) || loc); say(title); },
    draw(dt) { frame(); drawAnim(dt);
      if (list) { g.fillStyle = '#000'; g.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); const rows = list.rows.slice(list.top, list.top + 14);
        rows.forEach((r, k) => { const sel = (list.sel ?? list.top) === list.top + k; font.draw(g, r.label.slice(0, 26), VIEW.x + 2, VIEW.y + 2 + k * 8, sel ? HOT : '#f0d070'); font.draw(g, r.right, VIEW.x + VIEW.w - 2 - font.width(r.right), VIEW.y + 2 + k * 8, sel ? HOT : '#f0d070'); });
        font.draw(g, `GOLD ${state.gold}`, VIEW.x + 2, VIEW.y + 116, HILITE); buyBtns.draw(g, font); }
      menu.draw(g, font); standard.draw(g, font); drawMsg(); },
    mouse(p, click) { if (list) { if (buyBtns.mouse(p.x, p.y, click)) return true; const k = Math.floor((p.y - VIEW.y - 2) / 8); if (click && p.x >= VIEW.x && p.x < VIEW.x + VIEW.w && k >= 0 && k < 14 && list.rows[list.top + k]) { list.sel = list.top + k; return true; } } return false; } };
}

// ---------- space: first-person 3D view rendered at native viewport resolution ----------
const r3 = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true }); r3.setSize(VIEW.w, VIEW.h, false); r3.setPixelRatio(1);
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(60, VIEW.w / VIEW.h, 1, 40000);
{ const n = 1500, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(30000); p.set([v.x, v.y * .4, v.z], i * 3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 1, sizeAttenuation: false }))); }
const texOf = n => { const t = new THREE.TextureLoader().load(`/png/${n}.png`); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; };
const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: texOf('SUN0'), transparent: true })); sun.scale.set(400, 340, 1); scene.add(sun);
const planetSprites = bodies.map(b => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texOf(`PLANET${Math.min(8, b.idx - 1)}`), transparent: true })); s.position.set(b.x, 0, b.z); s.scale.set(180, 150, 1); scene.add(s); return s; });
const ORBIT_RANGE = 260;
const planetOf = key => bodies.find(b => b.idx === map.find(p => p.key === key)?.sphere);
let ship = { x: 0, z: 0, heading: 0, speed: 0, pitch: 0 };
function placeAt(body) { ship = { x: body.x - Math.cos(0.5) * ORBIT_RANGE * 1.4, z: body.z - Math.sin(0.5) * ORBIT_RANGE * 1.4, heading: Math.atan2(body.x - (body.x - Math.cos(.5)), -(body.z - (body.z - Math.sin(.5)))) + Math.PI, speed: 0, pitch: 0 }; }
function nearestBody() { let best = null, d = 1e9; for (const b of bodies) { const k = Math.hypot(b.x - ship.x, b.z - ship.z); if (k < d) { d = k; best = b; } } return { b: best, d }; }
function tryOrbit(manual) { const { b, d } = nearestBody(); if (d < ORBIT_RANGE && BTN[`DOCK${b.idx - 1}`]) { go(orbitScreen(b)); return true; } if (manual) say('No world close enough to dock.'); return false; }
let keys = {}, enemySprite = null, battle = null;
function renderSpace() {
  cam.position.set(ship.x, 0, ship.z); cam.rotation.set(ship.pitch, -ship.heading, 0, 'YXZ');
  r3.render(scene, cam); g.drawImage(r3.domElement, VIEW.x, VIEW.y);
}
function spaceScreen() {
  let thrust = 0, turn = 0, climb = 0;
  const menu = new Menu(BTN.NSPACE, b => { const n = b.image; if (n === 'GO') thrust = 1; if (n === 'STOP') { thrust = 0; ship.speed = 0; } if (n === 'LEFT') turn = turn === -1 ? 0 : -1; if (n === 'RIGHT') turn = turn === 1 ? 0 : 1; if (n === 'UP') climb = 1; if (n === 'DOWN') climb = -1; });
  const nav = new Menu(BTN.NAV, b => { const t = parseLabel(b.label).text; if (/DESTINATION/.test(t)) go(destScreen()); if (/NAVIGATE/.test(t)) { const { b: nb, d } = nearestBody(); say(`Nearest world: ${nb.name}, ${Math.round(d)} leagues.`); } });
  return { kind: 'space', menu, enter() { anim = null; },
    update(dt) {
      const t = (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0) || turn;
      ship.heading += t * 1.1 * dt; ship.pitch = Math.max(-.4, Math.min(.4, ship.pitch + ((keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0) + climb) * .5 * dt)); climb = 0;
      const th = keys.KeyW ? 1 : keys.KeyS ? -1 : thrust; ship.speed = Math.max(0, Math.min(400, ship.speed + th * 150 * dt));
      ship.x += Math.sin(ship.heading) * ship.speed * dt; ship.z -= Math.cos(ship.heading) * ship.speed * dt;
      if (ship.speed > 0) tryOrbit(false);
    },
    draw() { frame(); renderSpace(); nav.draw(g, font); menu.draw(g, font); standard.draw(g, font); drawMsg(); },
    mouse(p, click) { return nav.mouse(p.x, p.y, click); }, key(k) { return nav.key(k); } };
}
function orbitScreen(body) {
  const file = `DOCK${body.idx - 1}`, onPlanet = map.filter(p => p.sphere === body.idx);
  const menu = new Menu(BTN[file] || [], b => { const t = parseLabel(b.label).text;
    if (/^DOCK AT/.test(t)) { const k = BTN[file].filter(x => /^DOCK AT/.test(parseLabel(x.label).text)).indexOf(b); const p = onPlanet[k] || onPlanet[0]; if (!p) return say('No port answers your hail.'); state.location = p.key; state.log.push(`Day ${state.day}: Docked at ${p.name}.`); sfx('1'); go(portScreen()); if (Q.onDock(state) === 'envoy') say('Count Eldacar of Waterdeep seeks you out:', 'the Neogi grow bold. Stop them, and rich', 'rewards await.'); return; }
    if (/AIR/.test(t)) say('Your air envelope is refreshed.');
    if (/LEAVE ORBIT/.test(t)) { placeAt(body); ship.speed = 60; go(spaceScreen()); say(`Leaving orbit of ${body.name}.`); } });
  return { kind: 'orbit', menu, enter() { placeAt(body); ship.heading += Math.PI; say(`In orbit around ${body.name}.`); }, draw() { frame(); renderSpace(); menu.draw(g, font); standard.draw(g, font); drawMsg(); } };
}
function destScreen() {
  const dests = bodies.filter(b => BTN[`DOCK${b.idx - 1}`]), pois = Q.q(state).pois;
  const btns = dests.map((b, i) => ({ id: 20 + i, x: 177, y: 33 + i * 10, w: 140, h: 8, label: `^${b.name}` })).concat(pois.map((k, i) => ({ id: 50 + i, x: 177, y: 33 + (dests.length + i) * 10, w: 140, h: 8, label: Q.POI[k].name }))).concat([{ id: 99, x: 177, y: 33 + (dests.length + pois.length) * 10, w: 140, h: 8, label: 'E^XIT' }]);
  const menu = new Menu(btns, b => { if (b.id === 99) return go(spaceScreen());
    if (b.id >= 50) return goPoi(pois[b.id - 50]);
    const dest = dests[b.id - 20], tgt = map.find(p => p.sphere === dest.idx);
    if (!tgt) return; const from = state.location; const r = travel(state, map, tgt.key, rng); save();
    if (Q.rollEncounter(state, rng) === 'messenger') { say('A small ship flying a white flag approaches.', 'Close in and hail her (negotiate).'); return go(combatScreen(tgt, { hail: 'messenger', friendly: true })); }
    if (r.encounter) { say('Spelljamming...', 'A ship moves to intercept!'); return go(combatScreen(tgt)); }
    state.location = from; say(`Spelljamming to ${dest.name}... ${r.days} days.`); go(orbitScreen(dest)); });
  return { kind: 'dest', menu, draw() { frame(); renderSpace(); menu.draw(g, font); standard.draw(g, font); drawMsg(); } };
}
function goPoi(k) {
  const near = bodies.find(b => b.name === Q.POI[k].near) || bodies[0]; placeAt(near); state.day += 3; save();
  const here = map.find(p => p.key === state.location);
  if (k === 'CITADEL') { say('ITS A DWARVEN CITADEL!!'); return go(combatScreen(here, { citadel: true, name: 'DWARVEN CITADEL', sprite: 'CITADEL', friendly: true })); }
  if (k === 'GATHERING' || k === 'RAID') { say(`You reach the ${Q.POI[k].name}. Hail the Neogi.`); return go(combatScreen(here, { hail: k, friendly: true, name: k === 'RAID' ? 'NEOGI DEATHSPIDER' : 'NEOGI MINDSPIDER' })); }
  if (k === 'MOTHERSHIP') { const foe = Q.nextChainFoe(state); say(`A ${foe} closes in!`); return go(combatScreen(here, { chain: true, name: foe, hull: /MOTHER/.test(foe) ? 400 : /MIND/.test(foe) ? 100 : 60, friendly: /DEATH/.test(foe) })); }
}
function combatScreen(dest, opts = {}) {
  battle = startBattle(state, db, rng); if (opts.name) battle.enemy.name = opts.name; if (opts.hull) battle.enemy.hull = battle.enemy.maxHull = opts.hull;
  if (opts.citadel) { battle.enemy.weapons = []; battle.enemy.maxSpeed = 0; battle.enemy.hull = battle.enemy.maxHull = 9999; }
  if (opts.friendly) battle.enemy.holdFire = true; battle.player.x = ship.x; battle.player.z = ship.z; battle.player.heading = ship.heading;
  battle.enemy.x = ship.x + Math.sin(ship.heading) * 180; battle.enemy.z = ship.z - Math.cos(ship.heading) * 180;
  const types = Object.keys(manifest.sprites).filter(k => /^SHP\d+S0$/.test(k)).map(k => +k.match(/\d+/)[0]), st = types[rng.int(0, types.length - 1)];
  const frames = Array.from({ length: 9 }, (_, i) => `SHP${st}S${i}`).filter(n => manifest.sprites[n]), texs = frames.map(texOf);
  if (opts.sprite) { frames.length = 0; frames.push(opts.sprite); texs.length = 0; texs.push(texOf(opts.sprite)); }
  enemySprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs[0], transparent: true, alphaTest: .5 })); scene.add(enemySprite);
  let thrust = 0, turn = 0, fire = false;
  const menu = new Menu(BTN.COMBAT, b => { const n = b.image;
    if (n === 'FIRE' && opts.citadel) return say('WEAPONS HAVE NO AFFECT ON THE CITADEL!');
    if (n === 'NEGOT') { const p = battle.player, e = battle.enemy; if (Math.hypot(e.x - p.x, e.z - p.z) > 80) return say('Too far to hail.');
      const r = opts.hail ? Q.hail(state, opts.hail) : null; scene.remove(enemySprite); battle = null; save();
      say(r === 'clive-message' ? "Clive's messenger pays you 1000 gold: visit Clive's Den." : r === 'raid-orders' ? 'The sceptre disguises you. You are ordered to a raid.' : r === 'mothership-revealed' ? 'The Neogi captain begs for its life and reveals the mothership!' : r === 'need-sceptre' ? 'The Neogi see through you!' : 'They ignore your hail.');
      return go(orbitScreen(planetOf(state.location))); }
    if (n === 'GRAPPLE' && opts.citadel) { const p = battle.player, e = battle.enemy; if (Math.hypot(e.x - p.x, e.z - p.z) > 40) return say('Too far away to grapple.'); scene.remove(enemySprite); battle = null;
      const foes = Q.CITADEL_GARRISON.map(([nm, c], i) => B.unitFromMonster(monByName(nm), c, rng, i));
      return go(boardingScreen(foes, r => { const q = Q.citadelBoarded(state, r); say(q === 'sceptre' ? 'YOU HAVE FOUND THE SCEPTRE!' : 'You retreat from the citadel.'); save(); go(orbitScreen(planetOf(state.location))); }, 'OHM6')); }
    if (n === 'FIRE') fire = true; if (n === 'GO') thrust = 1; if (n === 'STOP') thrust = -1; if (n === 'LEFT') turn = turn === -1 ? 0 : -1; if (n === 'RIGHT') turn = turn === 1 ? 0 : 1; if (n === 'UP') battle.player.target = 'hull'; if (n === 'DOWN') battle.player.target = 'weapons'; if (n === 'GRAPPLE') { const p = battle.player, e = battle.enemy; if (Math.hypot(e.x - p.x, e.z - p.z) > 40) return say('Too far away to grapple.'); say('Grappling hooks away! Prepare for boarding...'); const eb = battle; scene.remove(enemySprite); battle = null; return go(boardingScreen(boardingFoes(eb.enemy), r => afterBoarding(r, eb, dest))); }
    if (/RAM|SHEAR|SWEAP|NEGOT/.test(n)) say(`${n}: not yet implemented.`); });
  say(`Engaging the ${battle.enemy.name}!`);
  return { kind: 'combat', menu,
    update(dt) { const p = battle.player, e = battle.enemy;
      const inp = { turn: (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0) || turn, thrust: keys.KeyW ? 1 : keys.KeyS ? -1 : thrust, fire: fire || keys.Space }; fire = false;
      for (const ev of stepCombat(battle, inp, dt, rng)) { if (ev.type === 'hit') { sfx('5'); say(`${ev.from} hits for ${ev.dmg}!`); } if (ev.type === 'disable') say(`${ev.from} smashes a ${ev.weapon}!`); }
      ship.x = p.x; ship.z = p.z; ship.heading = p.heading; ship.pitch = 0;
      const toCam = Math.atan2(p.x - e.x, -(p.z - e.z)); let d = toCam - e.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); const idx = Math.round(Math.abs(d) / Math.PI * (frames.length - 1)), s = manifest.sprites[frames[idx]];
      enemySprite.material.map = texs[idx]; enemySprite.scale.set(s.w * (d < 0 ? -1 : 1), s.h, 1); enemySprite.position.set(e.x, 0, e.z);
      if (battle.result) { scene.remove(enemySprite); resolveBattle(state, battle); const res = battle.result; battle = null;
        if (opts.chain) { const r = Q.chainBattle(state, res); if (r === 'ending') { say('THE NEOGI MOTHERSHIP IS DESTROYED!'); save(); return go(endingScreen()); } if (r === 'next') say(`Next: ${Q.nextChainFoe(state)}.`); }
        if (res !== 'defeat') { state.location = dest.key; } say(`Battle over: ${res}.`); save(); go(orbitScreen(planetOf(state.location))); } },
    draw() { frame(); renderSpace(); if (battle) { const p = battle.player, e = battle.enemy; font.draw(g, `HULL ${p.hull}/${p.maxHull}`, 180, 30, TEXT); font.draw(g, `${e.name.slice(0, 20)}`, 180, 42, HILITE); font.draw(g, `HULL ${e.hull}/${e.maxHull}`, 180, 50, HILITE); font.draw(g, `RANGE ${Math.round(Math.hypot(e.x - p.x, e.z - p.z))}`, 180, 62, TEXT); font.draw(g, `TARGET ${p.target}`, 180, 74, TEXT); }
      menu.draw(g, font); standard.draw(g, font); drawMsg(); } };
}
function diskScreen(prev) {
  const menu = new Menu(BTN.DISK, b => { const t = parseLabel(b.label).text;
    if (/^LOAD/.test(t)) { const s = loadFrom(localStorage, 'slot1'); if (s) { state = s; say('Game loaded.'); return go(portScreen()); } say('No saved game.'); }
    if (/^SAVE CURRENT/.test(t)) { saveTo(localStorage, 'slot1', state); say('Game saved.'); }
    if (/QUIT/.test(t)) { if (/SAVE/.test(t)) saveTo(localStorage, 'slot1', state); return go(titleScreen()); }
    if (/^EXIT/.test(t)) go(prev); });
  return { kind: 'disk', menu, draw(dt) { frame(); if (prev.kind === 'space' || prev.kind === 'orbit') renderSpace(); else drawAnim(dt); menu.draw(g, font); drawMsg(); } };
}

function endingScreen() {
  return { kind: 'ending', draw() { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); const im = art('FINALE0'); if (im.complete && im.width) g.drawImage(im, 8, 10); font.draw(g, 'REALMSPACE IS SAVED. CLICK TO CONTINUE.', 60, 180, '#f0d070'); },
    mouse(p, click) { if (click) { Q.finishEnding(state); save(); go(portScreen()); } return true; } };
}
// ---------- boarding (OTC): OH.PCX frame, 24x24 TILE0 deck tiles, OCOMBAT buttons ----------
const OHV = ui.viewports.OH_view, OHM = ui.viewports.OH_msg, T = 24;
const monByName = n => monsters.find(m => m.name === n);
function boardingFoes(enemy) { const n = Math.max(2, Math.min(8, Math.round(enemy.maxHull / 10))), kind = /SPIDER|HIVE/.test(enemy.name) ? 'NEOGI' : rng.next() < .5 ? 'HUMAN' : 'ORC';
  return Array.from({ length: Math.ceil(n / 3) }, (_, i) => B.unitFromMonster(monByName(kind), Math.min(3, n - i * 3), rng, i)); }
function afterBoarding(res, eb, dest) {
  if (res === 'victory') { const e = eb.enemy; const loot = 200 + e.maxHull * 20; state.gold += loot; for (const c of state.crew) c.xp += 100;
    say(`The ${e.name} is yours! ${loot} gp in plunder.`);
    const ship = db.ships.find(s => s.name === e.name);
    return go(warnScreen(`TAKE THE ${e.name} AS YOUR PRIZE?`, () => { if (ship) { state.ship = { name: ship.name, shipId: ship.id, tonnage: ship.tonnage, cargoCap: ship.cargo, hull: Math.max(1, Math.floor(ship.tonnage / 2)), weapons: state.ship.weapons, sprite: ship.id }; say(`You transfer your flag to the ${ship.name}.`); } finish(); }, finish)); }
  say('Your boarding party is repelled!'); state.gold = Math.floor(state.gold / 2); finish();
  function finish() { state.location = dest.key; save(); go(orbitScreen(planetOf(state.location))); }
}
function warnScreen(text, onYes, onNo) {
  const menu = new Menu(BTN.WARN, b => (parseLabel(b.label).text === 'EXIT' ? onNo() : onYes()));
  return { kind: 'warn', menu, draw() { g.fillStyle = '#000'; g.fillRect(100, 80, 140, 56); g.strokeStyle = '#a07030'; g.strokeRect(100.5, 80.5, 139, 55); font.draw(g, text.slice(0, 32), 106, 88, '#f0d070'); font.draw(g, text.slice(32, 64), 106, 96, '#f0d070'); menu.draw(g, font); } };
}
const tileImgs = {}; const tile = id => (tileImgs[id] ||= art2(`/tiles/TILE0_${String(id).padStart(3, '0')}.png`));
function art2(p) { const i = new Image(); i.src = p; return i; }
function boardingScreen(foeUnits, done, deckName) {
  const names = Object.keys(decks), deck = decks[deckName || names[rng.int(0, Math.min(6, names.length - 1))]];
  const party = state.crew.map((c, i) => B.unitFromCrew(c, db, i)).filter(u => u.hp > 0);
  const b = B.newBoarding(deck, party, foeUnits, rng); B.startRound(b, rng); let cur = B.advance(b, rng), mode = 'move', shown = 0;
  const flushLog = () => { while (shown < b.log.length) say(b.log[shown++]); };
  const next = () => { B.endTurn(b, rng); cur = B.advance(b, rng); flushLog(); if (b.result) finish(); };
  const finish = () => { B.applyToCrew(state, b); for (const c of state.crew) if (c.hp <= 0) c.hp = 1; save(); setTimeout(() => done(b.result), 600); };
  const menu = new Menu(BTN.OCOMBAT, bt => { if (!cur || b.result) return; const n = bt.image || parseLabel(bt.label).text;
    if (n === 'ATTK') { mode = 'attack'; say('Choose a target.'); }
    else if (n === 'TURN') { const r = B.turnUndead(b, cur, rng); flushLog(); if (!r.ok) say(r.why); else next(); }
    else if (n === 'QUIK') { B.advance(b, rng, true); flushLog(); if (b.result) finish(); }
    else if (n === 'DONE' || n === 'DFND' || n === 'NEXT') next();
    else if (n === 'VIEW') say(`${cur.name}: HP ${cur.hp}/${cur.hpEach} AC ${cur.ac} THAC0 ${cur.thac0}`);
    else say(`${n}: not yet implemented.`); });
  let camX = 0, camY = 0;
  return { kind: 'boarding', menu, enter() { flushLog(); say('Boarding action!'); },
    draw() {
      g.drawImage(art('OH'), 0, 0);
      const f = cur || B.alive(b)[0]; if (f) { camX = Math.max(0, Math.min(deck.w * T - OHV.w, f.x * T - OHV.w / 2)); camY = Math.max(0, Math.min(deck.h * T - OHV.h, f.y * T - OHV.h / 2)); }
      g.fillStyle = '#000'; g.fillRect(OHV.x, OHV.y, OHV.w, OHV.h); g.save(); g.beginPath(); g.rect(OHV.x, OHV.y, OHV.w, OHV.h); g.clip();
      for (let y = 0; y < deck.h; y++) for (let x = 0; x < deck.w; x++) { const px = OHV.x + x * T - camX, py = OHV.y + y * T - camY; if (px < OHV.x - T || py < OHV.y - T || px > OHV.x + OHV.w || py > OHV.y + OHV.h) continue;
        const i = y * deck.w + x; if (i && deck.tile[i] === deck.tile[0] && deck.kind[i] === deck.kind[0]) continue; const im = tile(deck.tile[i]); if (im.complete && im.width) g.drawImage(im, px, py); }
      for (const u of B.alive(b)) { const px = OHV.x + u.x * T - camX, py = OHV.y + u.y * T - camY;
        g.fillStyle = u.side === 'party' ? '#2050c0' : u.turned ? '#606060' : '#b02010'; g.fillRect(px + 4, py + 4, 16, 16); if (u === cur) { g.strokeStyle = '#fff'; g.strokeRect(px + 2.5, py + 2.5, 19, 19); }
        font.draw(g, u.name[0], px + 9, py + 9, '#fff'); if (u.count > 1) font.draw(g, String(u.count), px + 15, py + 15, '#ff0'); }
      g.restore();
      if (cur) { font.draw(g, cur.name, 196, 84, '#f0d070'); font.draw(g, `HP ${cur.hp}  AC ${cur.ac}`, 196, 92, '#f0d070'); font.draw(g, `MOVES ${B.squares(cur) - cur.moved}`, 196, 100, '#f0d070'); }
      menu.draw(g, font); msgLines.slice(-5).forEach((l, i) => font.draw(g, l, OHM.x + 3, OHM.y + 2 + i * 7, '#f0d070'));
    },
    mouse(p, click) { if (!click || !cur || b.result) return false; if (p.x < OHV.x || p.y < OHV.y || p.x >= OHV.x + OHV.w || p.y >= OHV.y + OHV.h) return false;
      const x = Math.floor((p.x - OHV.x + camX) / T), y = Math.floor((p.y - OHV.y + camY) / T), t = B.at(b, x, y);
      if (t && t.side === 'foe') { const r = B.attack(b, cur, t, rng); flushLog(); if (!r.ok) say('Target is out of reach.'); else next(); mode = 'move'; return true; }
      if (!t) { const r = B.moveTo(b, cur, x, y); if (!r.ok) say(r.why); else if (cur.moved >= B.squares(cur)) { const adj = B.alive(b).some(o => o.side === 'foe' && B.adjacent(cur, o)); if (!adj) next(); } }
      return true; } };
}

// ---------- input + loop ----------
cv.addEventListener('mousemove', e => { const p = toScreen(e); screen.mouse?.(p, false); screen.menu?.mouse(p.x, p.y, false); standard.mouse(p.x, p.y, false); });
cv.addEventListener('click', e => { actx ||= new AudioContext(); const p = toScreen(e); if (screen.mouse?.(p, true)) return; if (screen.menu?.mouse(p.x, p.y, true)) return; if (screen.kind !== 'title') standard.mouse(p.x, p.y, true); });
addEventListener('keydown', e => { keys[e.code] = true; if (e.key.length === 1 && !e.repeat) { if (screen.key?.(e.key)) return; screen.menu?.key(e.key); } });
addEventListener('keyup', e => { keys[e.code] = false; });
const q = new URLSearchParams(location.search);
await ready(art('SF'), art('MTITLE'));
if (q.has('screen')) { state ||= newGame(db); const s = q.get('screen'); go(s === 'port' ? portScreen() : s === 'space' ? (placeAt(planetOf(state.location)), spaceScreen()) : s === 'combat' ? combatScreen(map[1]) : s === 'district' ? districtScreen(q.get('type') || 'STR', 'store') : s === "create" ? captainScreen() : s === 'ship' ? shipMenuScreen(portScreen()) : s === 'crew' ? crewMenuScreen(portScreen()) : s === 'boarding' ? boardingScreen([B.unitFromMonster(monByName('SKELETON'), 5, rng, 0), B.unitFromMonster(monByName('LICH'), 1, rng, 1)], r => { say(`Boarding: ${r}`); go(portScreen()); }) : titleScreen()); }
else go(titleScreen());
let last = performance.now();
(function loop(now) { const dt = Math.min(.05, (now - last) / 1000); last = now; screen.update?.(dt); screen.draw(dt); requestAnimationFrame(loop); })(last);

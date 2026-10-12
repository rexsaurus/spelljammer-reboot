// Tactical boarding combat (the OTC engine's role). Turn-based on a 32x32 deck grid (OHM*.DMP / DNG*.OML).
// Rules: AD&D 2e to-hit (d20 >= THAC0 - target AC), monsters from MONSTERS.CHR (hd, ac_bonus, move).
// Behavior from guides (StrategyWiki "Chosen hero", The Dwarven Citadel): undead come in stacks; revenants and the lich
// can only be hurt by magic weapons or spells; clerics' turn undead stops skeletons/zombies but not revenants/lich.
import { armorClass, thac0, weaponOf, strHitAdj, strDmgAdj } from './crew.js';
export const NEEDS_MAGIC = new Set(['REVENANT', 'LICH']);
export const TURNABLE = new Set(['SKELETON', 'ZOMBIE', 'GHOUL', 'SHADOW', 'WIGHT', 'GHAST', 'WRAITH', 'MUMMY', 'SPECTRE', 'VAMPIRE']);
export const UNDEAD = new Set([...TURNABLE, ...NEEDS_MAGIC]);
const MON_DMG = { SKELETON: [1, 6], ZOMBIE: [1, 8], GHOUL: [1, 3], LICH: [1, 10], REVENANT: [2, 8], NEOGI: [1, 6], 'UMBER HULK': [3, 4], OGRE: [1, 10], ILLITHID: [1, 4] };
export const monsterThac0 = hd => Math.max(5, 21 - Math.max(1, hd) - (hd >= 2 ? 0 : 0));

export function passable(deck, x, y) {
  if (x < 0 || y < 0 || x >= deck.w || y >= deck.h) return false;
  const i = y * deck.w + x, k = deck.kind[i], t = deck.tile[i];
  return k !== 1 && !(t === deck.tile[0] && k === deck.kind[0]); // wall or outer void
}
export function walkable(deck) { const out = []; for (let y = 0; y < deck.h; y++) for (let x = 0; x < deck.w; x++) if (passable(deck, x, y)) out.push([x, y]); return out; }

export function unitFromCrew(c, db, i) {
  const w = weaponOf(c, db);
  return { id: `p${i}`, side: 'party', name: c.name, ci: i, cls: c.cls, count: 1, hpEach: c.hpMax, hp: c.hp, ac: armorClass(c, db), thac0: thac0(c) - strHitAdj(c.str) - (w.magic || 0),
    dmg: [w.dmgSmall.n || 1, w.dmgSmall.sides || 2], dmgBonus: strDmgAdj(c.str) + (w.magic || 0), magic: (w.magic || 0) > 0 || c.cls === 'MAGE', move: 12, level: c.level };
}
export function unitFromMonster(m, count, rng, i) {
  const hd = Math.max(1, m.hd), hpEach = Array.from({ length: hd }, () => rng.int(1, 8)).reduce((a, b) => a + b, 0);
  return { id: `m${i}`, side: 'foe', name: m.name, count, hpEach, hp: hpEach * count, ac: 10 - (m.ac_bonus || 0), thac0: monsterThac0(hd), dmg: MON_DMG[m.name] || [1, 6], dmgBonus: 0,
    magic: false, move: m.move || 9, hd, undead: UNDEAD.has(m.name), needsMagic: NEEDS_MAGIC.has(m.name), turned: false };
}
export function place(units, deck, rng) {
  const cells = walkable(deck).sort((a, b) => a[0] - b[0] || a[1] - b[1]), used = new Set();
  const take = (list) => { for (const c of list) { const k = c.join(); if (!used.has(k)) { used.add(k); return c; } } return cells[0]; };
  for (const u of units.filter(u => u.side === 'party')) [u.x, u.y] = take(cells);
  for (const u of units.filter(u => u.side === 'foe')) [u.x, u.y] = take([...cells].reverse());
}
export function newBoarding(deck, partyUnits, foeUnits, rng) {
  const units = [...partyUnits, ...foeUnits]; place(units, deck, rng);
  return { deck, units, round: 1, order: [], turn: 0, log: [], result: null };
}
export const alive = b => b.units.filter(u => u.hp > 0);
export const at = (b, x, y) => alive(b).find(u => u.x === x && u.y === y);
export const adjacent = (a, t) => Math.max(Math.abs(a.x - t.x), Math.abs(a.y - t.y)) === 1;
export const squares = u => Math.max(1, Math.floor(u.move / 3));

export function startRound(b, rng) {
  b.order = alive(b).map(u => ({ u, init: rng.int(1, 10) })).sort((p, q) => p.init - q.init).map(p => p.u.id); b.turn = 0;
  for (const u of alive(b)) { u.moved = 0; u.acted = false; }
}
export const current = b => b.units.find(u => u.id === b.order[b.turn]);
export function attack(b, a, t, rng) {
  if (!adjacent(a, t) || a.acted) return { ok: false, why: 'not adjacent' };
  a.acted = true; const n = a.side === 'foe' ? a.count : 1; let total = 0, hits = 0;
  for (let i = 0; i < n; i++) {
    const roll = rng.int(1, 20);
    if (roll < a.thac0 - t.ac && roll !== 20) continue;
    hits++; if (t.needsMagic && !a.magic) continue;
    let d = a.dmgBonus; for (let k = 0; k < a.dmg[0]; k++) d += rng.int(1, a.dmg[1]); total += Math.max(1, d);
  }
  t.hp = Math.max(0, t.hp - total); if (t.count > 1) t.count = Math.ceil(t.hp / t.hpEach);
  const msg = hits === 0 ? `${a.name} misses ${t.name}.` : total === 0 ? `${a.name} hits ${t.name}, but only magic can harm it!` : `${a.name} hits ${t.name} for ${total}.${t.hp === 0 ? ` ${t.name} is slain!` : ''}`;
  b.log.push(msg); checkEnd(b); return { ok: true, hits, dmg: total, msg };
}
export function turnUndead(b, a, rng) {
  if (a.cls !== 'CLERIC' && a.cls !== 'PALADIN') return { ok: false, why: 'ONLY CLERICS CAN TURN UNDEAD.' };
  a.acted = true; let n = 0;
  for (const t of alive(b).filter(u => u.side === 'foe' && u.undead && TURNABLE.has(u.name) && !u.turned)) {
    if (rng.int(1, 20) >= 10 + 2 * t.hd - 2 * a.level) { t.turned = true; n++; }
  }
  const msg = n ? `${a.name} turns the undead (${n} stack${n > 1 ? 's' : ''}).` : `${a.name} fails to turn the undead.`; b.log.push(msg); return { ok: true, n, msg };
}
// Breadth-first path on the deck avoiding occupied squares; diagonal steps allowed.
export function path(b, from, to, avoidUnits = true) {
  const key = (x, y) => y * 64 + x, prev = new Map([[key(from.x, from.y), null]]), q = [[from.x, from.y]];
  while (q.length) { const [x, y] = q.shift(); if (x === to.x && y === to.y) break;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if ((dx || dy) && !prev.has(k) && passable(b.deck, nx, ny) && (!avoidUnits || !at(b, nx, ny) || (nx === to.x && ny === to.y))) { prev.set(k, [x, y]); q.push([nx, ny]); } } }
  if (!prev.has(key(to.x, to.y))) return null;
  const out = []; let c = [to.x, to.y]; while (c && !(c[0] === from.x && c[1] === from.y)) { out.unshift(c); c = prev.get(key(c[0], c[1])); } return out;
}
export function moveTo(b, u, x, y) {
  const p = path(b, u, { x, y }); if (!p) return { ok: false, why: 'no path' };
  const steps = p.filter(([px, py]) => !at(b, px, py)).slice(0, squares(u) - u.moved);
  if (!steps.length) return { ok: false, why: 'cannot move' };
  const [nx, ny] = steps[steps.length - 1]; u.x = nx; u.y = ny; u.moved += steps.length; return { ok: true };
}
export function aiTurn(b, u, rng) {
  if (u.turned) { b.log.push(`${u.name} cowers.`); return; }
  const foes = alive(b).filter(t => t.side !== u.side); if (!foes.length) return;
  const tgt = foes.reduce((a, t) => (Math.hypot(t.x - u.x, t.y - u.y) < Math.hypot(a.x - u.x, a.y - u.y) ? t : a));
  if (!adjacent(u, tgt)) { const p = path(b, u, tgt); if (p) { const steps = p.slice(0, -1).filter(([x, y]) => !at(b, x, y)).slice(0, squares(u)); if (steps.length) [u.x, u.y] = steps[steps.length - 1]; } }
  if (adjacent(u, tgt)) attack(b, u, tgt, rng);
}
export function endTurn(b, rng) {
  do { b.turn++; if (b.turn >= b.order.length) { b.round++; startRound(b, rng); } } while (!b.result && !(current(b)?.hp > 0));
}
export function checkEnd(b) { if (!alive(b).some(u => u.side === 'foe')) b.result = 'victory'; else if (!alive(b).some(u => u.side === 'party')) b.result = 'defeat'; }
// Run until it's a party member's turn (foes act automatically) or the fight ends. auto=true lets the AI play the party too ("QUIK").
export function advance(b, rng, auto = false) {
  let guard = 0;
  while (!b.result && guard++ < 10000) { const u = current(b); if (!u || u.hp <= 0) { endTurn(b, rng); continue; } if (u.side === 'party' && !auto) return u; aiTurn(b, u, rng); endTurn(b, rng); }
  return null;
}
export function applyToCrew(state, b) { for (const u of b.units.filter(u => u.side === 'party')) { const c = state.crew[u.ci]; if (c) c.hp = Math.max(0, u.hp); } }

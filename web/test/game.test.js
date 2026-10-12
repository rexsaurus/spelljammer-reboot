import test from 'node:test'; import assert from 'node:assert/strict';
import { raw } from './fixture.js';
import { buildDb } from '../src/game/data.js';
import { newGame, serialize, deserialize } from '../src/game/state.js';
import { buy, sell, buyPrice, sellPrice, repair } from '../src/game/economy.js';
import { layout, travel, travelDays, bodyPositions, distance } from '../src/game/starmap.js';
import { startBattle, stepCombat, resolveBattle, makeCombatant, fire } from '../src/game/combat.js';
import { makeRng } from '../src/game/rng.js';
const db = buildDb(raw);

test('data offsets', () => {
  const axe = db.itemsById[1]; assert.deepEqual(axe.dmgSmall, { n: 1, sides: 6 }); assert.equal(axe.price, 10); assert.equal(axe.weight, 5);
  assert.equal(db.itemsById[45].acBonus, 7); assert.ok(db.itemsById[51].shipWeapon);
  assert.deepEqual(db.ships.map(s => [s.tonnage, s.cargo]), [[20, 10], [60, 30]]);
  assert.deepEqual(db.ports.map(p => [p.key, p.sphere]), [['PORT10', 1], ['PORT20', 2], ['PORT21', 2]]);
  assert.equal(db.shops.STR1.length, 1);
});
test('save roundtrip and version check', () => {
  const s = newGame(db, { seed: 5 }); assert.equal(s.ship.name, 'SLOOP');
  assert.deepEqual(deserialize(serialize(s)), s);
  assert.throws(() => deserialize('{"version":99}'));
});
test('buy/sell respects gold, hold and spread', () => {
  const s = newGame(db); const g0 = s.gold;
  assert.ok(buy(s, db, 9, 2).ok); assert.equal(s.cargo[9], 2); assert.equal(s.gold, g0 - 2 * buyPrice(db.itemsById[9], s.location));
  assert.equal(buy(s, db, 9, 50).why, 'hold is full');
  assert.ok(sellPrice(db.itemsById[9], s.location) < buyPrice(db.itemsById[9], s.location));
  assert.ok(sell(s, db, 9, 2).ok); assert.equal(s.cargo[9], undefined);
  assert.equal(sell(s, db, 9, 1).ok, false);
  s.gold = 0; assert.equal(buy(s, db, 45).why, 'not enough gold');
});
test('repair', () => { const s = newGame(db); s.ship.hull = 10; assert.ok(repair(s).ok); assert.equal(s.ship.hull, s.ship.tonnage); });
test('travel between spheres takes longer and can trigger encounters', () => {
  const map = layout(db.ports, raw.bodies); const [a, b, c] = map;
  assert.equal(a.planet, 'ALPHA'); assert.equal(b.planet, 'BETA'); assert.ok(distance(a, b) > distance(b, c));
  assert.ok(travelDays(a, b) >= travelDays(b, c));
  let enc = 0, arrived = 0;
  for (let seed = 1; seed < 200; seed++) { const s = newGame(db); const r = travel(s, map, 'PORT20', makeRng(seed)); if (r.encounter) enc++; else { arrived++; assert.equal(s.location, 'PORT20'); } }
  assert.ok(enc > 0 && arrived > 0);
});
test('combat resolves and is applied to state', () => {
  const s = newGame(db); const rng = makeRng(42); const b = startBattle(s, db, rng);
  let t = 0; while (!b.result && t < 600) { stepCombat(b, { thrust: 1, turn: 0, fire: true }, 0.1, rng); t += 0.1; }
  assert.ok(b.result, 'battle ended'); resolveBattle(s, b); assert.ok(s.ship.hull >= 1);
});
test('weapons targeting disables instead of damaging hull', () => {
  const rng = makeRng(1); const a = makeCombatant({ name: 'A', tonnage: 20, hull: 20, weapons: [51] }, db); const d = makeCombatant({ name: 'D', tonnage: 20, hull: 20, weapons: [51] }, db, { z: -10 });
  a.target = 'weapons';
  for (let i = 0; i < 50 && !d.weapons[0].disabled; i++) { a.weapons[0].cd = 0; fire(a, d, rng, []); }
  assert.ok(d.weapons[0].disabled); assert.equal(d.hull, 20);
});
test('u32 price and body orbits', () => {
  assert.equal(db.itemsById[181].price, 100000);
  const bp = bodyPositions(raw.bodies); assert.equal(Math.round(Math.hypot(bp[1].x, bp[1].z)), 1280); assert.equal(bp[2].real, false);
  assert.ok(Math.hypot(bp[2].x, bp[2].z) > 1280);
});
test('friendly ships hold fire until fired upon', () => {
  const s = newGame(db); const rng = makeRng(3); const b = startBattle(s, db, rng); b.enemy.holdFire = true; b.enemy.z = -5;
  for (let i = 0; i < 50; i++) stepCombat(b, { thrust: 0, turn: 0, fire: false }, 0.2, rng); assert.equal(b.player.hull, s.ship.hull);
  stepCombat(b, { fire: true }, 0.2, rng); assert.equal(b.enemy.holdFire, false);
});

import test from 'node:test'; import assert from 'node:assert/strict';
import { raw } from './fixture.js';
import { buildDb } from '../src/game/data.js';
import { newGame, deserialize } from '../src/game/state.js';
import { makeCharacter, equip, unequip, armorClass, thac0, gainXp, canUse, hire, MAX_CREW } from '../src/game/crew.js';
import { buyHull, hullPrice, tradeInValue } from '../src/game/shipyard.js';
import { makeRng } from '../src/game/rng.js';
const db = buildDb(raw);
test('new game has a 4-class party; v1 saves migrate', () => {
  const s = newGame(db, { seed: 3 }); assert.deepEqual(s.crew.map(c => c.cls), ['FIGHTER', 'CLERIC', 'MAGE', 'THIEF']);
  for (const c of s.crew) { assert.ok(c.hp >= 1 && c.str >= 3 && c.str <= 18); }
  assert.deepEqual(deserialize(JSON.stringify({ version: 1, gold: 1, location: 'X', ship: {}, cargo: {} })).crew, []);
});
test('equip armor lowers AC, returns old item to hold, enforces class rules', () => {
  const s = newGame(db, { seed: 3 }); const f = s.crew[0]; f.dex = 10; s.cargo = { 45: 1, 1: 1 };
  assert.equal(armorClass(f, db), 10);
  assert.ok(equip(s, db, 0, 45).ok); assert.equal(armorClass(f, db), 3); assert.equal(s.cargo[45], undefined);
  assert.equal(canUse(s.crew[2], db.itemsById[45]).ok, false);           // mage in plate
  assert.equal(canUse(s.crew[1], db.itemsById[1]).ok, false);            // cleric with an axe
  assert.ok(unequip(s, 0, 'armor').ok); assert.equal(s.cargo[45], 1);
  assert.equal(equip(s, db, 0, 999).ok, false);
});
test('thac0 and leveling', () => {
  const r = makeRng(1), c = makeCharacter(r, 'FIGHTER'); assert.equal(thac0(c), 20);
  const hp = c.hpMax; assert.equal(gainXp(c, 4000, r), 2); assert.equal(c.level, 3); assert.equal(thac0(c), 18); assert.ok(c.hpMax > hp);
});
test('hire limit and cost', () => {
  const s = newGame(db); const r = makeRng(2); s.gold = 10000;
  while (s.crew.length < MAX_CREW) assert.ok(hire(s, makeCharacter(r)).ok);
  assert.equal(hire(s, makeCharacter(r)).why, 'crew is full');
});
test('hull purchase with trade-in', () => {
  const s = newGame(db); s.gold = 100000; const brig = db.ships.find(x => x.name === 'BRIG');
  const expect = s.gold - (hullPrice(brig) - tradeInValue(s.ship));
  assert.ok(buyHull(s, db, brig.id).ok); assert.equal(s.gold, expect); assert.equal(s.ship.hull, 60); assert.equal(s.ship.cargoCap, 30);
  assert.equal(buyHull(s, db, brig.id).ok, false); const p = newGame(db); p.gold = 0; assert.equal(buyHull(p, db, brig.id).why, 'not enough gold');
});

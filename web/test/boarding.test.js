import test from 'node:test'; import assert from 'node:assert/strict';
import { raw } from './fixture.js';
import { buildDb } from '../src/game/data.js';
import { newGame } from '../src/game/state.js';
import { makeRng } from '../src/game/rng.js';
import { newBoarding, unitFromCrew, unitFromMonster, startRound, advance, attack, turnUndead, passable, moveTo, alive } from '../src/game/boarding.js';
const db = buildDb(raw);
const deck = (() => { const w = 12, h = 8, tile = [], kind = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1; tile.push(edge ? 38 : 5); kind.push(edge ? 0 : (x === 6 && y < 5 ? 1 : 0)); } return { w, h, tile, kind }; })();
const M = (name, hd, ac, move = 12) => ({ name, hd, ac_bonus: ac, move });
test('deck passability: void and walls block', () => { assert.equal(passable(deck, 0, 0), false); assert.equal(passable(deck, 6, 2), false); assert.equal(passable(deck, 2, 2), true); });
test('auto battle ends with a result', () => {
  const s = newGame(db, { seed: 4 }), rng = makeRng(9);
  const b = newBoarding(deck, s.crew.map((c, i) => unitFromCrew(c, db, i)), [unitFromMonster(M('SKELETON', 1, 3), 3, rng, 0)], rng);
  startRound(b, rng); advance(b, rng, true); assert.ok(b.result);
});
test('lich ignores non-magic weapons; magic hurts it', () => {
  const rng = makeRng(1), lich = unitFromMonster(M('LICH', 11, 10, 6), 1, rng, 0);
  const a = { id: 'a', side: 'party', name: 'A', x: 1, y: 1, count: 1, thac0: -20, dmg: [1, 6], dmgBonus: 0, magic: false }; Object.assign(lich, { x: 2, y: 1 });
  const b = { units: [a, lich], log: [] }; const hp = lich.hp;
  attack(b, a, lich, rng); assert.equal(lich.hp, hp);
  a.acted = false; a.magic = true; attack(b, a, lich, rng); assert.ok(lich.hp < hp);
});
test('turn undead affects skeletons, never revenants or the lich; non-clerics cannot', () => {
  const rng = makeRng(3); const sk = unitFromMonster(M('SKELETON', 1, 3), 5, rng, 0), rev = unitFromMonster(M('REVENANT', 8, 0), 1, rng, 1), li = unitFromMonster(M('LICH', 11, 10), 1, rng, 2);
  const cl = { side: 'party', cls: 'CLERIC', level: 20, hp: 1 }; const b = { units: [cl, sk, rev, li], log: [] };
  turnUndead(b, cl, rng); assert.equal(sk.turned, true); assert.equal(rev.turned, false); assert.equal(li.turned, false);
  assert.equal(turnUndead(b, { cls: 'FIGHTER' }, rng).ok, false);
});
test('stacks shrink as members die; movement limited to move/3 squares', () => {
  const rng = makeRng(5), sk = unitFromMonster(M('SKELETON', 1, 3), 5, rng, 0); sk.hp -= sk.hpEach * 2; sk.count = Math.ceil(sk.hp / sk.hpEach); assert.equal(sk.count, 3);
  const s = newGame(db, { seed: 4 }); const b = newBoarding(deck, [unitFromCrew(s.crew[0], db, 0)], [unitFromMonster(M('ORC', 1, 0), 1, rng, 1)], rng);
  const u = b.units[0]; u.moved = 0; const x0 = u.x; moveTo(b, u, 10, u.y); assert.ok(Math.abs(u.x - x0) <= 4 && alive(b).length === 2);
});

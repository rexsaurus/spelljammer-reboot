// Acceptance suite: drives the game rules through the main-quest walkthrough, step by step.
// Steps are our own paraphrase; citations point at StrategyWiki "Spelljammer: Pirates of Realmspace/Chosen hero" sections.
import test from 'node:test'; import assert from 'node:assert/strict';
import { raw } from './fixture.js';
import { buildDb } from '../src/game/data.js';
import { newGame, serialize, deserialize } from '../src/game/state.js';
import { makeRng } from '../src/game/rng.js';
import { gainXp } from '../src/game/crew.js';
import * as Q from '../src/game/quest.js';
import * as B from '../src/game/boarding.js';
const db = buildDb(raw); const rng = makeRng(77);
const s = newGame(db, { seed: 11 }); s.gold = 5000;
const deck = (() => { const w = 32, h = 32, tile = [], kind = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1; tile.push(edge ? 38 : 5); kind.push(0); } return { w, h, tile, kind }; })();
const MON = { SKELETON: { hd: 1, ac_bonus: 3, move: 12 }, ZOMBIE: { hd: 2, ac_bonus: 2, move: 6 }, REVENANT: { hd: 8, ac_bonus: 0, move: 9 }, LICH: { hd: 11, ac_bonus: 10, move: 6 } };
const steps = [];
const step = (name, cite, fn) => test(`${name} [${cite}]`, () => { fn(); steps.push(name); });

step('W1 Envoy does not appear before the party is experienced', 'Eldacar\'s visit', () => {
  assert.equal(Q.onDock(s), null); assert.equal(Q.q(s).stage, 0);
});
step('W2 Envoy from Waterdeep gives the Neogi quest at a port once the captain reaches level 7', 'Eldacar\'s visit', () => {
  gainXp(s.crew[0], 125000, rng); assert.ok(s.crew[0].level >= 7);
  assert.equal(Q.onDock(s), 'envoy'); assert.equal(Q.q(s).stage, Q.STAGE.ENVOY_MET); assert.equal(Q.onDock(s), null);
});
step('W3 A ship carrying Clive\'s messenger turns up during normal travel', 'Clive\'s intelligence', () => {
  let found = false; for (let d = 0; d < 100 && !found; d++) found = Q.rollEncounter(s, rng) === 'messenger'; assert.ok(found);
});
step('W4 Hailing the messenger pays 1,000 gp and points you to Clive\'s Den', 'Clive\'s intelligence', () => {
  const g = s.gold; assert.equal(Q.hail(s, 'messenger'), 'clive-message'); assert.equal(s.gold, g + 1000); assert.equal(Q.q(s).stage, Q.STAGE.CLIVE_MSG);
});
step('W5 Clive only talks at Clive\'s Den', 'Clive\'s intelligence', () => { s.location = 'PORT10'; assert.equal(Q.clive(s), null); });
step('W6 Audience with Clive marks the dwarven citadel under points of interest', 'Clive\'s intelligence', () => {
  s.location = 'PORT70'; assert.equal(Q.clive(s), 'citadel-marked'); assert.deepEqual(Q.q(s).pois, ['CITADEL']); assert.equal(Q.q(s).stage, Q.STAGE.CITADEL_MARKED);
});
step('W7 The citadel cannot be harmed by ship weapons, so it must be boarded', 'The Dwarven Citadel', () => { assert.equal(Q.citadelImmuneToShipWeapons, true); });
step('W8 The citadel garrison: stacks of skeletons and zombies, revenants, and a lich', 'The Dwarven Citadel', () => {
  const names = Q.CITADEL_GARRISON.map(g => g[0]); assert.equal(names.filter(n => n === 'LICH').length, 1); assert.ok(names.filter(n => n === 'REVENANT').length >= 5); assert.ok(names.includes('SKELETON') && names.includes('ZOMBIE'));
});
step('W9 Revenants and the lich shrug off mundane weapons; magic weapons hurt them', 'The Dwarven Citadel', () => {
  const lich = B.unitFromMonster({ name: 'LICH', ...MON.LICH }, 1, rng, 0); lich.x = 2; lich.y = 1; const a = { side: 'party', name: 'A', x: 1, y: 1, count: 1, thac0: -30, dmg: [1, 8], dmgBonus: 0, magic: false };
  const b = { units: [a, lich], log: [] }; const hp = lich.hp; B.attack(b, a, lich, rng); assert.equal(lich.hp, hp); a.acted = false; a.magic = true; B.attack(b, a, lich, rng); assert.ok(lich.hp < hp);
});
step('W10 Turn undead stops skeletons and zombies but not revenants or the lich', 'The Dwarven Citadel', () => {
  const units = ['SKELETON', 'ZOMBIE', 'REVENANT', 'LICH'].map((n, i) => B.unitFromMonster({ name: n, ...MON[n] }, 1, rng, i)); const cl = { cls: 'CLERIC', level: 30 };
  B.turnUndead({ units, log: [] }, cl, rng); assert.deepEqual(units.map(u => u.turned), [true, true, false, false]);
});
step('W11 Losing the citadel fight does not break the quest; you can return', 'The Dwarven Citadel', () => {
  assert.equal(Q.citadelBoarded(s, 'defeat'), 'retry'); assert.equal(Q.q(s).stage, Q.STAGE.CITADEL_MARKED);
});
step('W12 Clearing the citadel with a well-equipped party yields the sceptre', 'The Dwarven Citadel', () => {
  const party = s.crew.map((c, i) => ({ ...B.unitFromCrew(c, db, i), magic: true, thac0: -10, hp: 400, hpEach: 400, ac: -5, dmg: [3, 8], dmgBonus: 6 }));
  const foes = Q.CITADEL_GARRISON.map(([n, c], i) => B.unitFromMonster({ name: n, ...MON[n] }, c, rng, i));
  const b = B.newBoarding(deck, party, foes, rng); B.startRound(b, rng); B.advance(b, rng, true); assert.equal(b.result, 'victory');
  assert.equal(Q.citadelBoarded(s, b.result), 'sceptre'); assert.ok(s.items.includes('SCEPTRE')); assert.equal(Q.q(s).stage, Q.STAGE.HAVE_SCEPTRE);
});
step('W13 The sceptre survives a save and load at this point (original soft-lock area)', 'The Dwarven Citadel', () => {
  const r = deserialize(serialize(s)); assert.ok(r.items.includes('SCEPTRE')); assert.equal(r.quest.stage, Q.STAGE.HAVE_SCEPTRE);
});
step('W14 Back at Clive\'s Den, Clive marks a Neogi gathering', 'Spying on the Neogi', () => {
  assert.equal(Q.clive(s), 'gathering-marked'); assert.ok(Q.q(s).pois.includes('GATHERING')); assert.equal(Q.q(s).stage, Q.STAGE.GATHERING_MARKED);
});
step('W15 Hailing the gathering uses the sceptre automatically and sends you to a raid', 'Spying on the Neogi', () => {
  assert.equal(Q.hail(s, 'GATHERING'), 'raid-orders'); assert.ok(Q.q(s).pois.includes('RAID'));
});
step('W16 At the raid, the Neogi captain gives up the mothership without a fight', 'Spying on the Neogi', () => {
  assert.equal(Q.hail(s, 'RAID'), 'mothership-revealed'); assert.ok(Q.q(s).pois.includes('MOTHERSHIP')); assert.equal(Q.q(s).stage, Q.STAGE.MOTHERSHIP_MARKED);
});
step('W17 The final battles come in order: four deathspiders, a mindspider, then the mothership', 'The final battle', () => {
  const seen = []; const t = deserialize(serialize(s));
  while (Q.nextChainFoe(t)) { seen.push(Q.nextChainFoe(t)); Q.chainBattle(t, 'victory'); }
  assert.deepEqual(seen, ['NEOGI DEATHSPIDER', 'NEOGI DEATHSPIDER', 'NEOGI DEATHSPIDER', 'NEOGI DEATHSPIDER', 'NEOGI MINDSPIDER', 'NEOGI MOTHERSHIP']);
});
step('W18 Fleeing mid-chain keeps your progress (no soft-lock)', 'The final battle', () => {
  Q.chainBattle(s, 'victory'); Q.chainBattle(s, 'escaped'); assert.equal(Q.q(s).chain, 1); assert.equal(Q.nextChainFoe(s), 'NEOGI DEATHSPIDER');
});
step('W19 Destroying the mothership ends the quest and pays about 10,000 gp', 'Ending', () => {
  const g = s.gold; let r; while (Q.nextChainFoe(s)) r = Q.chainBattle(s, 'victory'); assert.equal(r, 'ending'); assert.equal(s.gold, g + 10000); assert.equal(Q.q(s).stage, Q.STAGE.MOTHERSHIP_DESTROYED);
});
step('W20 Play continues after the ending', 'Ending', () => { assert.ok(Q.finishEnding(s)); assert.equal(Q.q(s).stage, Q.STAGE.EPILOGUE); });

// Game state and versioned JSON save/load.
import { makeCharacter } from './crew.js';
import { makeRng } from './rng.js';
import { HULLS, START_HULL } from './hulls.js';
export const SAVE_VERSION = 2;
export function newGame(db, { seed = Date.now() & 0xffff } = {}) {
  const pool = db.ships.filter(s => s.tonnage >= 20); // start in the smallest seaworthy hull
  const ship = (pool.length ? pool : db.ships).reduce((a, b) => (b.tonnage < a.tonnage ? b : a));
  const start = db.ports[0];
  const kit = {}; for (const n of ['SHORT SWORD', 'MACE', 'DAGGER', 'LEATHER ARMOR', 'SMALL SHIELD']) { const it = db.items.find(i => i.name === n); if (it) kit[it.id] = (kit[it.id] || 0) + 1; }
  return {
    version: SAVE_VERSION, seed, day: 1, gold: 1000, location: start.key, questStage: 0,
    ship: { name: ship.name, shipId: ship.id, hullClass: START_HULL, tonnage: HULLS[START_HULL].tonnage, cargoCap: HULLS[START_HULL].cargo, hull: HULLS[START_HULL].tonnage, weapons: [51], sprite: 0 },
    cargo: kit, // itemId -> qty
    crew: (() => { const r = makeRng(seed); return ['FIGHTER', 'CLERIC', 'MAGE', 'THIEF'].map(c => makeCharacter(r, c)); })(),
    log: [`Day 1: Your quartermaster stowed starter gear in the hold; equip it from the crew screen.`, `Day 1: You take command of the ${ship.name} at ${start.name}.`],
  };
}
export const serialize = s => JSON.stringify(s);
export function deserialize(json) {
  const s = JSON.parse(json);
  if (s?.version === 1) { s.crew = []; s.version = 2; } // v1 saves had no crew
  if (!s || s.version !== SAVE_VERSION) throw new Error(`unsupported save version ${s?.version}`);
  for (const k of ['gold', 'location', 'ship', 'cargo']) if (!(k in s)) throw new Error(`corrupt save: missing ${k}`);
  return s;
}
export function saveTo(storage, slot, s) { storage.setItem(`sj-save-${slot}`, serialize(s)); }
export function loadFrom(storage, slot) { const j = storage.getItem(`sj-save-${slot}`); return j ? deserialize(j) : null; }

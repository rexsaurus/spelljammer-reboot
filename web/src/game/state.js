// Game state and versioned JSON save/load.
export const SAVE_VERSION = 1;
export function newGame(db, { seed = Date.now() & 0xffff } = {}) {
  const ship = db.ships.reduce((a, b) => (b.tonnage < a.tonnage ? b : a), db.ships[0]); // start in the smallest hull
  const start = db.ports[0];
  return {
    version: SAVE_VERSION, seed, day: 1, gold: 1000, location: start.key, questStage: 0,
    ship: { name: ship.name, shipId: ship.id, tonnage: ship.tonnage, cargoCap: ship.cargo, hull: ship.tonnage, weapons: [51], sprite: 0 },
    cargo: {}, // itemId -> qty
    log: [`Day 1: You take command of the ${ship.name} at ${start.name}.`],
  };
}
export const serialize = s => JSON.stringify(s);
export function deserialize(json) {
  const s = JSON.parse(json);
  if (!s || s.version !== SAVE_VERSION) throw new Error(`unsupported save version ${s?.version}`);
  for (const k of ['gold', 'location', 'ship', 'cargo']) if (!(k in s)) throw new Error(`corrupt save: missing ${k}`);
  return s;
}
export function saveTo(storage, slot, s) { storage.setItem(`sj-save-${slot}`, serialize(s)); }
export function loadFrom(storage, slot) { const j = storage.getItem(`sj-save-${slot}`); return j ? deserialize(j) : null; }

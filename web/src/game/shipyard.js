// Hull purchase. Hulls for sale are the SHIPS.SHI records (tonnage = hull points, +4 = cargo). Prices are APPROXIMATE
// (1,000 gp per ton) until the drydock purchase code is decompiled; trade-in pays half the hull's list price.
export const PRICE_PER_TON = 1000, TRADE_IN = 0.5;
export const hullPrice = ship => ship.tonnage * PRICE_PER_TON;
export const tradeInValue = s => Math.floor(s.tonnage * PRICE_PER_TON * TRADE_IN * (s.hull / s.tonnage));
export function buyHull(state, db, shipId) {
  const ship = db.ships.find(s => s.id === shipId); if (!ship) return { ok: false, why: 'unknown hull' };
  if (ship.id === state.ship.shipId) return { ok: false, why: 'you already own her' };
  const net = hullPrice(ship) - tradeInValue(state.ship); if (net > state.gold) return { ok: false, why: 'not enough gold' };
  const mounts = Math.max(1, Math.floor(ship.tonnage / 10));
  state.gold -= net;
  state.ship = { name: ship.name, shipId: ship.id, tonnage: ship.tonnage, cargoCap: ship.cargo, hull: ship.tonnage, weapons: state.ship.weapons.slice(0, mounts), sprite: ship.id };
  return { ok: true, cost: net };
}

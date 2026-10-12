// Buying and selling. Base price = ITM price_gp. The per-port variance and buy/sell spread are APPROXIMATE
// until the shop loaders (0x584ce / 0x5857d) are decompiled.
export const SELL_RATE = 0.6;
export function portFactor(portKey, itemId) { let h = 2166136261; for (const c of `${portKey}:${itemId}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return 0.75 + ((h >>> 0) % 51) / 100; }
export const buyPrice = (item, portKey) => Math.max(1, Math.round(item.price * portFactor(portKey, item.id)));
export const sellPrice = (item, portKey) => Math.max(0, Math.floor(buyPrice(item, portKey) * SELL_RATE));
export const cargoUsed = (state, db) => Object.entries(state.cargo).reduce((t, [id, q]) => t + q * Math.max(1, db.itemsById[id]?.weight ?? 1) / 10, 0);
export function buy(state, db, itemId, qty = 1) {
  const item = db.itemsById[itemId]; if (!item) return { ok: false, why: 'unknown item' };
  if (item.shipWeapon) {
    const cost = buyPrice(item, state.location) * qty;
    if (cost > state.gold) return { ok: false, why: 'not enough gold' };
    if (state.ship.weapons.length + qty > maxWeapons(state.ship)) return { ok: false, why: 'no free weapon mounts' };
    state.gold -= cost; for (let i = 0; i < qty; i++) state.ship.weapons.push(itemId); return { ok: true, cost };
  }
  const cost = buyPrice(item, state.location) * qty;
  if (cargoUsed(state, db) + qty * Math.max(1, item.weight) / 10 > state.ship.cargoCap) return { ok: false, why: 'hold is full' };
  if (cost > state.gold) return { ok: false, why: 'not enough gold' };
  state.gold -= cost; state.cargo[itemId] = (state.cargo[itemId] || 0) + qty; return { ok: true, cost };
}
export function sell(state, db, itemId, qty = 1) {
  const have = state.cargo[itemId] || 0; if (have < qty) return { ok: false, why: 'not in hold' };
  const gain = sellPrice(db.itemsById[itemId], state.location) * qty;
  state.gold += gain; state.cargo[itemId] = have - qty; if (!state.cargo[itemId]) delete state.cargo[itemId];
  return { ok: true, gain };
}
export const maxWeapons = ship => Math.max(1, Math.floor(ship.tonnage / 10)); // approximation
export function repairCost(ship) { return (ship.tonnage - ship.hull) * 25; }
export function repair(state) { const c = repairCost(state.ship); if (c > state.gold) return { ok: false, why: 'not enough gold' }; state.gold -= c; state.ship.hull = state.ship.tonnage; return { ok: true, cost: c }; }

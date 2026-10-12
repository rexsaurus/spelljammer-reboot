// Hull classes sold at drydocks. Prices follow the StrategyWiki "Bloodthirsty killer" shipyard table (behavioral
// reference; the drydock purchase code in SF3 has not been decompiled yet and wins on conflicts). Tonnage/cargo are
// Spelljammer setting values (Low confidence) until the SF3 hull-class table is located.
// Note: the guide reports the original menus swap the names "DRAGONFLY" and "GREEK WARSHIP"; we keep the original labels.
export const HULLS = {
  GALLEON:            { price: 50000, tonnage: 40, cargo: 20 },
  SQUIDSHIP:          { price: 45000, tonnage: 30, cargo: 15 },
  'GREEK WARSHIP':    { price: 45000, tonnage: 30, cargo: 12 },
  'NEOGI MINDSPIDER': { price: 35000, tonnage: 20, cargo: 10 },
  TRADESMAN:          { price: 15000, tonnage: 10, cargo: 8 },
  DRAGONFLY:          { price: 5000,  tonnage: 15, cargo: 6 },
};
export const START_HULL = 'GALLEON'; // the guide: you start in a galleon
export const hullFor = name => HULLS[name] ? { name, ...HULLS[name] } : null;
export function forSale(shopRows, itemsById) { return shopRows.map(r => itemsById[r.itemId]?.name).filter(n => HULLS[n]).map(hullFor); }
export function buyHullClass(state, name) {
  const h = hullFor(name); if (!h) return { ok: false, why: 'unknown hull' };
  const tradeIn = Math.floor((HULLS[state.ship.hullClass]?.price ?? state.ship.tonnage * 1000) * 0.5 * state.ship.hull / state.ship.tonnage);
  const net = h.price - tradeIn; if (net > state.gold) return { ok: false, why: 'not enough gold' };
  state.gold -= net;
  state.ship = { ...state.ship, hullClass: name, tonnage: h.tonnage, hull: h.tonnage, cargoCap: h.cargo, weapons: state.ship.weapons.slice(0, Math.max(1, Math.floor(h.tonnage / 5))) };
  return { ok: true, cost: net, tradeIn };
}

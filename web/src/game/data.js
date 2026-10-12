// Normalizes raw decoder output (extracted/data/*.json) into typed records.
// Field offsets come from docs/engine-map.md (byte offset / 2 = u16 index).
const dice = v => ({ n: v >> 8, sides: v & 255 });
export const WEAPON_IDS = new Set([50, 51, 52, 53, 54, 55, 56, 57, 58, 59]);

export function normalizeItem(raw) {
  const f = raw.fields_pre_name_u16;
  return {
    id: raw.id, name: raw.name.trim(),
    dmgSmall: dice(f[10]), dmgLarge: dice(f[12]),
    range: [f[14], f[15], f[16]], xp: f[17], weight: f[18], itemId: f[20],
    usableMask: f[24], price: f[26] + f[27] * 65536, // u32 (Minor Helm = 100,000 gp)
    acBonus: f[34] >> 8, magic: f[35] & 255,
    shipWeapon: WEAPON_IDS.has(raw.id),
  };
}
export function normalizeShip(raw) {
  const f = raw.fields_u16;
  return { id: raw.id, name: raw.name.trim(), tonnage: f[0], cargo: f[2], hull: f[0] };
}
// PRT ids: tens digit groups a sphere/world (10 Anadia, 20/21 Hissta/Athanar, 30 Toril, 60 Glyth, 70 Garden).
export function normalizePorts(rawPorts) {
  return Object.entries(rawPorts).filter(([k]) => /^PORT\d+$/.test(k)).map(([key, p]) => {
    const num = Number(key.slice(4));
    return { key, num, name: p.name.split('\n')[0].trim(), sphere: Math.floor(num / 10) };
  }).sort((a, b) => a.num - b.num);
}
export function normalizeShop(rows, itemsById) {
  return rows.filter(r => r.item_name && itemsById[r.item_id]).map(r => ({ itemId: r.item_id, stock: r.qty_or_c, raw: r.price_or_a }));
}
export function buildDb(raw) {
  const items = raw.items.map(normalizeItem);
  const itemsById = Object.fromEntries(items.map(i => [i.id, i]));
  const shops = Object.fromEntries(Object.entries(raw.inventories || {}).map(([k, v]) => [k, normalizeShop(v.rows, itemsById)]));
  return {
    items, itemsById, shops,
    ships: raw.ships.filter(s => s.id > 0).map(normalizeShip),
    ports: normalizePorts(raw.ports),
    rumors: Object.values(raw.rumors || {}).flat().filter(s => typeof s === 'string' && s.trim()),
  };
}

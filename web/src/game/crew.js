// Party/crew and character sheets, using AD&D 2nd-edition rules (the game's ruleset). ITM fields give damage dice,
// ac_bonus (= 10 - AD&D AC) and magic +N. Class weapon/armor restrictions follow the 2e core rules; ITM usable_mask
// is not trusted yet (Low confidence in engine-map).
export const CLASSES = {
  FIGHTER: { hd: 10, thac0: l => 21 - l, xp: [0, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000] },
  CLERIC:  { hd: 8, thac0: l => 20 - 2 * Math.floor((l - 1) / 3), xp: [0, 1500, 3000, 6000, 13000, 27500, 55000, 110000, 225000, 450000] },
  MAGE:    { hd: 4, thac0: l => 20 - Math.floor((l - 1) / 3), xp: [0, 2500, 5000, 10000, 20000, 40000, 60000, 90000, 135000, 250000] },
  THIEF:   { hd: 6, thac0: l => 20 - Math.floor((l - 1) / 2), xp: [0, 1250, 2500, 5000, 10000, 20000, 40000, 70000, 110000, 160000] },
};
const NAMES = ['Aldric', 'Brenna', 'Corwin', 'Dara', 'Elric', 'Fenna', 'Garret', 'Hilde', 'Ivo', 'Jessa', 'Kael', 'Lira', 'Morn', 'Nyssa', 'Orin', 'Pell'];
export const MAX_CREW = 6;
const roll4d6 = rng => { const r = [0, 0, 0, 0].map(() => rng.int(1, 6)).sort((a, b) => a - b); return r[1] + r[2] + r[3]; };
export const conBonus = con => (con >= 18 ? 3 : con >= 17 ? 2 : con >= 16 ? 1 : con <= 6 ? -1 : 0);
export const dexAcAdj = dex => (dex >= 18 ? 4 : dex >= 17 ? 3 : dex >= 16 ? 2 : dex >= 15 ? 1 : dex <= 5 ? -2 : dex <= 6 ? -1 : 0);
export const strHitAdj = str => (str >= 18 ? 1 : str >= 17 ? 1 : str <= 5 ? -1 : 0);
export const strDmgAdj = str => (str >= 18 ? 2 : str >= 16 ? 1 : str <= 5 ? -1 : 0);

export function makeCharacter(rng, cls = Object.keys(CLASSES)[rng.int(0, 3)], level = 1) {
  const a = { str: roll4d6(rng), dex: roll4d6(rng), con: roll4d6(rng), int: roll4d6(rng), wis: roll4d6(rng), cha: roll4d6(rng) };
  const c = { name: NAMES[rng.int(0, NAMES.length - 1)], cls, level: 1, xp: 0, ...a, hpMax: 0, hp: 0, equip: { weapon: null, armor: null, shield: null } };
  c.hpMax = Math.max(1, CLASSES[cls].hd + conBonus(c.con)); c.hp = c.hpMax;
  while (c.level < level) levelUp(c, rng);
  return c;
}
export function levelUp(c, rng) { c.level++; const g = Math.max(1, rng.int(1, CLASSES[c.cls].hd) + conBonus(c.con)); c.hpMax += g; c.hp += g; }
export function gainXp(c, xp, rng) { c.xp += xp; const t = CLASSES[c.cls].xp; let ups = 0; while (c.level < t.length && c.xp >= t[c.level]) { levelUp(c, rng); ups++; } return ups; }
export const hireCost = c => 100 * c.level;

export function slotOf(item) {
  if (!item || item.shipWeapon) return null;
  if (/SHIELD|BUCKLER/.test(item.name)) return 'shield';
  if (item.acBonus > 0 && item.weight >= 10 && !/HELM|BOOTS|CLOAK|RING/.test(item.name)) return 'armor';
  if (item.dmgSmall.n || item.dmgLarge.n) return 'weapon';
  return null;
}
const BLUNT = /CLUB|MACE|HAMMER|FLAIL|STAFF|SLING|MORNING STAR|BELAYING PIN/;
const MAGE_OK = /DAGGER|DART|STAFF|KNIFE|SLING/;
export function canUse(c, item) {
  const slot = slotOf(item); if (!slot) return { ok: false, why: 'not equippable' };
  if (c.cls === 'MAGE' && slot !== 'weapon') return { ok: false, why: 'mages cannot wear armor or shields' };
  if (c.cls === 'MAGE' && !MAGE_OK.test(item.name)) return { ok: false, why: 'mages use only daggers, darts, staves, knives, slings' };
  if (c.cls === 'CLERIC' && slot === 'weapon' && !BLUNT.test(item.name)) return { ok: false, why: 'clerics use only blunt weapons' };
  if (c.cls === 'THIEF' && (slot === 'shield' || (slot === 'armor' && item.weight > 15))) return { ok: false, why: 'thieves wear only light armor, no shields' };
  return { ok: true, slot };
}
// Equip from the ship's hold (state.cargo); the previous item goes back to the hold.
export function equip(state, db, ci, itemId) {
  const c = state.crew[ci], item = db.itemsById[itemId]; if (!c || !(state.cargo[itemId] > 0)) return { ok: false, why: 'not in hold' };
  const u = canUse(c, item); if (!u.ok) return u;
  const prev = c.equip[u.slot]; if (prev != null) state.cargo[prev] = (state.cargo[prev] || 0) + 1;
  c.equip[u.slot] = itemId; if (!--state.cargo[itemId]) delete state.cargo[itemId];
  return { ok: true, slot: u.slot };
}
export function unequip(state, ci, slot) {
  const c = state.crew[ci], id = c?.equip[slot]; if (id == null) return { ok: false, why: 'empty slot' };
  state.cargo[id] = (state.cargo[id] || 0) + 1; c.equip[slot] = null; return { ok: true };
}
export function armorClass(c, db) { // descending AD&D AC; 10 = unarmored
  let ac = 10; for (const s of ['armor', 'shield']) { const it = db.itemsById[c.equip[s]]; if (it) ac -= it.acBonus + it.magic; }
  return ac - dexAcAdj(c.dex);
}
export function thac0(c) { return CLASSES[c.cls].thac0(c.level); }
export function weaponOf(c, db) { return db.itemsById[c.equip.weapon] || { name: 'FISTS', dmgSmall: { n: 1, sides: 2 }, dmgLarge: { n: 1, sides: 2 }, magic: 0, range: [0, 0, 0] }; }
export function hire(state, c) { if (state.crew.length >= MAX_CREW) return { ok: false, why: 'crew is full' }; const cost = hireCost(c); if (state.gold < cost) return { ok: false, why: 'not enough gold' }; state.gold -= cost; state.crew.push(c); return { ok: true, cost }; }
export function dismiss(state, ci) { const c = state.crew[ci]; if (!c) return { ok: false }; for (const s of Object.keys(c.equip)) if (c.equip[s] != null) unequip(state, ci, s); state.crew.splice(ci, 1); return { ok: true }; }

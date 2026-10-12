// Synthetic fixture shaped like decoder output. Not game data.
const pre = o => { const f = Array(37).fill(0); for (const [k, v] of Object.entries(o)) f[k] = v; return f; };
export const raw = {
  items: [
    { id: 0, name: 'not used', fields_pre_name_u16: pre({}) },
    { id: 1, name: 'TEST AXE', fields_pre_name_u16: pre({ 10: 0x106, 12: 0x104, 18: 5, 20: 1, 26: 10 }) },
    { id: 9, name: 'TEST GOODS', fields_pre_name_u16: pre({ 18: 10, 20: 9, 26: 40 }) },
    { id: 45, name: 'TEST PLATE', fields_pre_name_u16: pre({ 18: 50, 26: 600, 34: 7 << 8 }) },
    { id: 51, name: 'TEST BALLISTA', fields_pre_name_u16: pre({ 12: 0x206, 14: 1500, 15: 2000, 16: 3000, 18: 1, 26: 400 }) },
  ],
  ships: [{ id: 0, name: 'not used', fields_u16: [0, 0, 0] }, { id: 1, name: 'SLOOP', fields_u16: [20, 50, 10] }, { id: 2, name: 'BRIG', fields_u16: [60, 50, 30] }],
  ports: { PORT10: { name: 'alpha' }, PORT20: { name: 'beta' }, PORT21: { name: 'gamma' }, STR1: { name: 'store' } },
  inventories: { STR1: { rows: [{ item_id: 1, item_name: 'TEST AXE', qty_or_c: 3, price_or_a: 0 }, { item_id: 999, item_name: '', qty_or_c: 1, price_or_a: 0 }] } },
  rumors: { R1: ['a rumor'] },
};

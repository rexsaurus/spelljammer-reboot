// Plane-bound (2D) space combat. Hull points = tonnage (manual). Weapons use ITM range (short/med/long) and
// damage dice (vs large for hull). Targeting 'hull' or 'weapons' per engine-map notes. Tuning constants are approximate.
export const RELOAD = 4;        // seconds between volleys per weapon (approx.)
export const RANGE_SCALE = 0.1; // ITM range units -> world units
export function makeCombatant(ship, db, { x = 0, z = 0, heading = 0, ai = false } = {}) {
  return { name: ship.name, x, z, heading, speed: 0, maxSpeed: 12 + 300 / Math.max(10, ship.tonnage), turnRate: 1.2 - Math.min(0.8, ship.tonnage / 300),
    hull: ship.hull, maxHull: ship.tonnage, ai, target: 'hull', sprite: ship.sprite ?? 0,
    weapons: ship.weapons.filter(id => db.itemsById[id]).map(id => ({ id, item: db.itemsById[id], cd: Math.random() * 2 })) };
}
export const rangeOf = w => (w.item.range[2] || w.item.range[1] || 500) * RANGE_SCALE;
export function hitChance(dist, w) { const [s, m] = w.item.range.map(r => r * RANGE_SCALE); return dist <= s ? 0.75 : dist <= m ? 0.5 : 0.25; }
export function steer(c, input, dt) {
  c.heading += (input.turn || 0) * c.turnRate * dt;
  c.speed = Math.max(0, Math.min(c.maxSpeed, c.speed + (input.thrust || 0) * 8 * dt));
  c.x += Math.sin(c.heading) * c.speed * dt; c.z -= Math.cos(c.heading) * c.speed * dt;
}
export function aiInput(me, foe) {
  const want = Math.atan2(foe.x - me.x, -(foe.z - me.z));
  let d = want - me.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
  const dist = Math.hypot(foe.x - me.x, foe.z - me.z);
  return { turn: Math.sign(d) * Math.min(1, Math.abs(d) * 2), thrust: dist > 60 ? 1 : -1 };
}
export function fire(attacker, defender, rng, events) {
  const dist = Math.hypot(defender.x - attacker.x, defender.z - attacker.z);
  for (const w of attacker.weapons) {
    if (w.cd > 0 || w.disabled || dist > rangeOf(w)) continue;
    w.cd = RELOAD;
    if (rng.next() > hitChance(dist, w)) { events.push({ type: 'miss', from: attacker.name }); continue; }
    if (attacker.target === 'weapons' && defender.weapons.some(x => !x.disabled)) {
      const t = defender.weapons.find(x => !x.disabled); t.disabled = true; events.push({ type: 'disable', from: attacker.name, weapon: t.item.name });
    } else { const dmg = Math.max(1, rng.roll(w.item.dmgLarge.n ? w.item.dmgLarge : w.item.dmgSmall)); defender.hull = Math.max(0, defender.hull - dmg); events.push({ type: 'hit', from: attacker.name, dmg }); }
  }
}
export function stepCombat(battle, playerInput, dt, rng) {
  const { player, enemy } = battle, events = [];
  steer(player, playerInput, dt); steer(enemy, enemy.holdFire ? { turn: 0, thrust: 0 } : aiInput(enemy, player), dt);
  for (const c of [player, enemy]) for (const w of c.weapons) w.cd = Math.max(0, w.cd - dt);
  if (playerInput.fire) { fire(player, enemy, rng, events); enemy.holdFire = false; } // friendly ships turn hostile once fired on
  if (!enemy.holdFire) fire(enemy, player, rng, events);
  const dist = Math.hypot(enemy.x - player.x, enemy.z - player.z);
  if (enemy.hull <= 0) battle.result = 'victory'; else if (player.hull <= 0) battle.result = 'defeat'; else if (dist > 400) battle.result = 'escaped';
  return events;
}
export function startBattle(state, db, rng) {
  const foes = db.ships.filter(s => s.name !== state.ship.name && s.tonnage <= state.ship.tonnage * 2); const foeShip = foes.length ? foes[rng.int(0, foes.length - 1)] : db.ships[0];
  const pool = [50, 51, 53].filter(id => db.itemsById[id]); const foe = { ...foeShip, hull: foeShip.tonnage, weapons: [pool[rng.int(0, pool.length - 1)], ...(foeShip.tonnage > 40 ? [pool[0]] : [])], sprite: rng.int(0, 9) };
  return { player: makeCombatant(state.ship, db, { z: 0 }), enemy: makeCombatant(foe, db, { z: -180, heading: Math.PI, ai: true }), result: null, loot: 100 + foeShip.tonnage * 10 };
}
export function resolveBattle(state, battle) {
  state.ship.hull = battle.player.hull;
  if (battle.result === 'victory') { state.gold += battle.loot; state.log.push(`Day ${state.day}: Defeated the ${battle.enemy.name}, salvaged ${battle.loot} gp.`); }
  if (battle.result === 'escaped') state.log.push(`Day ${state.day}: Escaped from the ${battle.enemy.name}.`);
  if (battle.result === 'defeat') { state.ship.hull = 1; state.gold = Math.floor(state.gold / 2); state.cargo = {}; state.log.push(`Day ${state.day}: Crippled by the ${battle.enemy.name}; cargo and half your gold were taken.`); }
}

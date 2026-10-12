// Realmspace star map. Orbit radii and orbit order come from SF3.EXE's body-init routine (tools/sj_maps.py ->
// extracted/data/bodies.json). A port's PRT id tens digit equals its planet's orbit_index (10 Anadia, 20/21 Coliar,
// 30 Toril, 60 Glyth, 70 Garden). Orbital ANGLES are still a placeholder (fields f32/f34 are unconfirmed).
export const GOLDEN = 2.399963;
export const displayRadius = r => Math.sqrt(r) * 6;          // compress 640..10240 so the inner planets stay visible
export function bodyPositions(bodies) {
  const known = bodies.filter(b => b.orbit_radius), outer = Math.max(...known.map(b => b.orbit_radius), 1000);
  return bodies.map((b, i) => {
    const idx = b.orbit_index ?? i + 1, r = b.orbit_radius ?? outer * 1.25, a = idx * GOLDEN;
    return { ...b, idx, r, real: !!b.orbit_radius, x: Math.cos(a) * r, z: Math.sin(a) * r };
  });
}
export function layout(ports, bodies) {
  if (!bodies?.length) { // fallback when bodies.json has not been generated: evenly spaced rings
    const groups = [...new Set(ports.map(p => p.sphere))];
    return ports.map(p => { const a = groups.indexOf(p.sphere) / groups.length * Math.PI * 2, k = ports.filter(q => q.sphere === p.sphere).indexOf(p);
      return { ...p, x: Math.cos(a) * 3000 + k * 150, z: Math.sin(a) * 3000, planet: null }; });
  }
  const bp = bodyPositions(bodies);
  return ports.map(p => {
    const b = bp.find(q => q.idx === p.sphere), k = ports.filter(q => q.sphere === p.sphere).indexOf(p);
    return { ...p, planet: b?.name ?? null, x: (b?.x ?? 0) + k * 120, z: (b?.z ?? 0) + k * 120 };
  });
}
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const UNITS_PER_DAY = 800; // approximate cruising rate in SF3 orbit units
export function travelDays(a, b) { return Math.max(1, Math.ceil(distance(a, b) / UNITS_PER_DAY)); }
export const ENCOUNTER_CHANCE_PER_DAY = 0.12;
export function travel(state, map, destKey, rng) {
  const a = map.find(p => p.key === state.location), b = map.find(p => p.key === destKey);
  if (!a || !b || a === b) return { ok: false, why: 'bad destination' };
  const days = travelDays(a, b);
  for (let d = 1; d <= days; d++) {
    if (rng.next() < ENCOUNTER_CHANCE_PER_DAY) { state.day += d; state.log.push(`Day ${state.day}: Hostile sail sighted en route to ${b.name}!`); return { ok: true, encounter: true, dest: b.key, daysLeft: days - d }; }
  }
  state.day += days; state.location = b.key; state.log.push(`Day ${state.day}: Arrived at ${b.name}.`);
  return { ok: true, encounter: false, dest: b.key, days };
}

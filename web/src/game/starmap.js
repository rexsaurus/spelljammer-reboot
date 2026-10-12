// Star map. Ports group into spheres by PRT id tens digit. Positions are a PLACEHOLDER layout until OML/DMP are decoded.
export function layout(ports) {
  const spheres = [...new Set(ports.map(p => p.sphere))];
  return ports.map(p => {
    const si = spheres.indexOf(p.sphere), inSphere = ports.filter(q => q.sphere === p.sphere), k = inSphere.indexOf(p);
    const a = si / spheres.length * Math.PI * 2, R = 300;
    return { ...p, x: Math.cos(a) * R + Math.cos(k * 2.1) * 40 * (k ? 1 : 0), z: Math.sin(a) * R + Math.sin(k * 2.1) * 40 * (k ? 1 : 0) };
  });
}
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Same sphere: fast realspace travel. Different sphere: phlogiston crossing adds days.
export function travelDays(a, b) { return Math.max(1, Math.ceil(distance(a, b) / 60)) + (a.sphere !== b.sphere ? 3 : 0); }
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

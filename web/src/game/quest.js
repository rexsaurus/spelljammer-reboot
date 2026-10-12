// Main quest state machine, stages 0..9 (SF3 global main_quest_stage, DS:6AF4). Ordering and triggers follow
// docs/quest-notes.md (our paraphrase of StrategyWiki "Chosen hero") and the SF3 quest-function map.
// Unlike the original, nothing passes through temp files: the citadel boarding result is applied directly to state,
// which removes the likeliest cause of the 1992 endgame soft-lock (engine-map candidate #1).
export const STAGE = { NONE: 0, ENVOY_MET: 1, CLIVE_MSG: 2, CITADEL_MARKED: 3, HAVE_SCEPTRE: 4, GATHERING_MARKED: 5, RAID_MARKED: 6, MOTHERSHIP_MARKED: 7, MOTHERSHIP_DESTROYED: 8, EPILOGUE: 9 };
export const ENVOY_LEVEL = 7;          // guide: "level 7 appears sufficient" (Chosen hero, Eldacar's visit)
export const CLIVE_FEE = 1000;         // messenger's payment (Chosen hero, Clive's intelligence)
export const FINAL_REWARD = 10000;     // guide: ending pays about 10,000 gp (Chosen hero, Ending)
export const CHAIN = ['NEOGI DEATHSPIDER', 'NEOGI DEATHSPIDER', 'NEOGI DEATHSPIDER', 'NEOGI DEATHSPIDER', 'NEOGI MINDSPIDER', 'NEOGI MOTHERSHIP'];
// Citadel garrison (Chosen hero, The Dwarven Citadel): ~6 stacks of 5 skeletons, ~6 of zombies, ~6 revenants, one lich.
export const CITADEL_GARRISON = [...Array(6).fill(['SKELETON', 5]), ...Array(6).fill(['ZOMBIE', 5]), ...Array(6).fill(['REVENANT', 1]), ['LICH', 1]];
// Points of interest are placed near real bodies (exact coordinates still to be read from SF3 DS:6AD8/6ADA).
export const POI = { CITADEL: { name: 'DWARVEN CITADEL', near: 'KARPRI' }, GATHERING: { name: 'NEOGI GATHERING', near: 'CHANDOS' }, RAID: { name: 'RAID RENDEZVOUS', near: 'GLYTH' }, MOTHERSHIP: { name: 'NEOGI MOTHERSHIP', near: "H'CATHA" } };

export const q = s => (s.quest ||= { stage: 0, pois: [], chain: 0, flags: {} });
const log = (s, m) => s.log.push(`Day ${s.day}: ${m}`);
const captainLevel = s => Math.max(0, ...(s.crew || []).map(c => c.level));

// Called whenever the party docks at a port.
export function onDock(s) {
  const Q = q(s);
  if (Q.stage === STAGE.NONE && captainLevel(s) >= ENVOY_LEVEL) { Q.stage = STAGE.ENVOY_MET; log(s, 'An envoy from Waterdeep, Count Eldacar, asks you to stop the Neogi.'); return 'envoy'; }
  return null;
}
// Chance per space day that Clive's messenger appears once the envoy has visited.
export const MESSENGER_CHANCE = 0.25;
export function rollEncounter(s, rng) { const Q = q(s); if (Q.stage === STAGE.ENVOY_MET && rng.next() < MESSENGER_CHANCE) return 'messenger'; return null; }
// Hailing (white-flag / negotiate button) a ship of the given kind.
export function hail(s, kind) {
  const Q = q(s);
  if (kind === 'messenger' && Q.stage === STAGE.ENVOY_MET) { Q.stage = STAGE.CLIVE_MSG; s.gold += CLIVE_FEE; log(s, "Clive's messenger pays you and asks you to visit Clive's Den."); return 'clive-message'; }
  if (kind === 'GATHERING' && Q.stage === STAGE.GATHERING_MARKED) { if (!s.items?.includes('SCEPTRE')) return 'need-sceptre'; Q.stage = STAGE.RAID_MARKED; addPoi(s, 'RAID'); log(s, 'Disguised by the sceptre, you are sent to join a slave raid.'); return 'raid-orders'; }
  if (kind === 'RAID' && Q.stage === STAGE.RAID_MARKED) { Q.stage = STAGE.MOTHERSHIP_MARKED; addPoi(s, 'MOTHERSHIP'); log(s, 'The Neogi captain begs for its life and reveals the hidden mothership.'); return 'mothership-revealed'; }
  return null;
}
// Audience with Clive at Clive's Den (PORT70).
export function clive(s) {
  const Q = q(s); if (s.location !== 'PORT70') return null;
  if (Q.stage === STAGE.CLIVE_MSG) { Q.stage = STAGE.CITADEL_MARKED; addPoi(s, 'CITADEL'); log(s, 'Clive marks an abandoned dwarven citadel on your charts.'); return 'citadel-marked'; }
  if (Q.stage === STAGE.HAVE_SCEPTRE) { Q.stage = STAGE.GATHERING_MARKED; addPoi(s, 'GATHERING'); log(s, 'Clive tells you of a Neogi gathering.'); return 'gathering-marked'; }
  return 'nothing-new';
}
export function addPoi(s, key) { const Q = q(s); if (!Q.pois.includes(key)) Q.pois.push(key); }
// Citadel: no ship weapons work on it (SF3 string), so it must be boarded. Called with the boarding result.
export const citadelImmuneToShipWeapons = true;
export function citadelBoarded(s, result) {
  const Q = q(s); if (Q.stage !== STAGE.CITADEL_MARKED) return null;
  if (result !== 'victory') { log(s, 'You are driven from the citadel. The undead remain.'); return 'retry'; } // can retry, never soft-locks
  Q.stage = STAGE.HAVE_SCEPTRE; (s.items ||= []).push('SCEPTRE'); Q.pois = Q.pois.filter(p => p !== 'CITADEL'); log(s, 'You claim the disguise sceptre from the citadel.'); return 'sceptre';
}
// Final chain at the mothership: only destroyed ships advance it; fleeing keeps progress (fixes candidate #2).
export function nextChainFoe(s) { const Q = q(s); return Q.stage === STAGE.MOTHERSHIP_MARKED ? CHAIN[Q.chain] : null; }
export function chainBattle(s, result) {
  const Q = q(s); if (Q.stage !== STAGE.MOTHERSHIP_MARKED) return null;
  if (result !== 'victory') return 'chain-held';
  Q.chain++;
  if (Q.chain >= CHAIN.length) { Q.stage = STAGE.MOTHERSHIP_DESTROYED; s.gold += FINAL_REWARD; Q.pois = []; log(s, 'The Neogi mothership is destroyed! Realmspace is saved.'); return 'ending'; }
  return 'next';
}
export function finishEnding(s) { const Q = q(s); if (Q.stage === STAGE.MOTHERSHIP_DESTROYED) { Q.stage = STAGE.EPILOGUE; return true; } return false; }

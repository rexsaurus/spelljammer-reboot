# Three.js port plan

Goal: a full, playable browser port of *Spelljammer: Pirates of Realmspace* (1992) in Three.js. Game logic comes from our
reverse engineering (`docs/engine-map.md`, `docs/quest-notes.md`, the SF3/OTC/SJ function maps). Art, sound, music and data
tables load **at runtime** from the player's own GOG copy (decoded into the git-ignored `extracted/`). The repo holds no
game art and no copied manual or guide text.

Code layout: `web/src/game/*.js` holds pure, DOM-free rules modules with unit tests (`npm test`). `web/src/play/*.js` holds
Three.js and DOM front-ends. `web/game.html` is the playable build, and `web/index.html` stays the asset viewer.

Status key: **done** = playable and tested · **partial** = playable, but rules are approximate or have gaps · **todo**

## Systems in dependency order

| # | System | Depends on | Source of truth | Status |
|---|---|---|---|---|
| 1 | Data layer: normalize ITEMS.ITM / SHIPS.SHI / PRT / INV / RUM into typed records | decoders (`tools/sj_data.py`) | engine-map stat offsets (+20/+24 dmg, +28..32 range, +36 weight, +40 id, +52 price, +69 AC, +70 magic; ship +0 tonnage, +4 cargo) | **done** (`game/data.js`) |
| 2 | Game state + save/load (JSON, localStorage, versioned) | 1 | Our own format. Original `.SF` saves get an importer later (stage counter DS:6AF4) | **done** (`game/state.js`) |
| 3 | Star map & sphere travel: ports grouped by sphere, travel time, provisions, random encounters | 1, 2 | PRT ids group by tens (10 Anadia, 20/21 Hissta/Athanar, 30 Toril, 60 Glyth, 70 Garden). Real coordinates wait on the OML/DMP decode, so layout is **placeholder** | **partial** (`game/starmap.js`) |
| 4 | Ports: districts (store, warehouse, drydock, tavern, temple, hall, bank) | 1, 2, 3 | PRT/INV files, MDA backdrops | **partial**: store, warehouse, drydock, tavern rumors are live; temple, hall, bank are todo |
| 5 | Trading/economy: buy/sell cargo and gear, cargo capacity limits | 1, 2, 4 | ITM `price_gp`, INV stock rows, ship cargo (+4). Price spread and per-port variance are **approximate** until the 0x584ce/0x5857d loaders are read | **partial** (`game/economy.js`) |
| 6 | Ship flight & space combat: plane-bound 2D movement (manual), hull points = tonnage, ballista/catapult/jettison ranges and damage dice from ITM, target Hull vs Weapons, flee | 1, 2 | ITM weapon fields. Engine-map notes on plane-bound movement and hull/weapon targeting | **partial** (`game/combat.js` + `play/space.js`): no ramming, boarding hand-off, or crew effects yet |
| 7 | Ship purchase/upgrades: buy hulls, helms, weapons at drydock | 4, 5, 6 | DRY*.INV rows, SHIPS.SHI tonnage/cargo | **partial**: weapons buyable; hull purchase is todo |
| 8 | Crew/character sheets: party of AD&D 2e chars, classes, levels, XP, HP | 1, 2 | ITM `usable_mask`, `xp_value`; SF3 character code (unmapped) | todo |
| 9 | Inventory/items: equip weapons/armor, AC from `ac_bonus`, magic `+N` | 1, 8 | ITM fields | partial: cargo/gear hold exists, equip is todo |
| 10 | Tactical boarding combat (OTC): grid, turn order, melee/missile, spells | 6, 8, 9 | OTC function map, temp.crw handoff (0x76f0c) | todo |
| 11 | Quests & dialogue: envoy → Clive → citadel → Neogi → mothership, stage counter 0–9 | 3, 6, 10 | `docs/quest-notes.md`, quest fns 0x52fb2, 0x67fc8, 0x6a40f, 0x7204b, 0x54fa4, 0x22323, 0x17908, 0x54d80 | todo (state has `questStage`). The port won't reuse the temp-file handoff, so the original endgame bug can't happen here |
| 12 | Audio: VOC SFX, XMI→MIDI music per context | 1 | existing `midi.js` synth | partial (viewer has it; game uses SFX + music on port/combat) |
| 13 | UI: HUD, menus, title screen, port screens with MDA backdrops, fonts | all | MDA, FNT, BTN | partial: functional DOM UI with MDA backdrops; original fonts/buttons are todo |
| 14 | Polish: original palettes and color cycling (CYL), cutscenes (BDA), VR | all | — | todo |

## Milestones
1. **M1 core loop** (this pass): star map → travel with encounters → port market/drydock/tavern → space combat → save/load.
2. **M2 ships & crew**: hull purchase, character sheets, equipment, XP/levels.
3. **M3 boarding**: OTC tactical combat, captured ships.
4. **M4 quest line**: all 10 stages, envoy/hail encounters, citadel, Neogi chain, ending.
5. **M5 fidelity**: real star map coordinates from OML/DMP, exact prices/AI from decompiled loaders, original UI art/fonts.

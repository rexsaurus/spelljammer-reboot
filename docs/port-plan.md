# Three.js port plan

Goal: a full, playable browser port of *Spelljammer: Pirates of Realmspace* (1992) in Three.js. Game logic comes from our
reverse engineering (`docs/engine-map.md`, `docs/quest-notes.md`, the SF3/OTC/SJ function maps). Art, sound, music and data
tables load **at runtime** from the player's own GOG copy (decoded into the git-ignored `extracted/`). The repo holds no
game art and no copied manual or guide text.

**Direction (Oct 12): a complete, faithful clone.** Every screen should match the original 320x200 layout and behavior.
Code layout: `web/src/game/*.js` holds pure rules modules with unit tests (`npm test`). `web/src/retro/*.js` is the faithful
front end: a 320x200 canvas, integer scaled, drawing the original frame PCX (SF), BTN button layouts and hotkeys, FNT fonts, MDA town
animations and MSH sprites, with a first-person Three.js space view rendered at native viewport size (160x136 at 8,7).
`web/game.html` is the game, and `web/index.html` stays the asset viewer. Data tools: sj_decode, sj_more, sj_data, sj_maps (orbits, deck/dungeon maps,
monster records) and sj_ui (BTN layouts, frame viewports).

### Screen-by-screen fidelity
| Screen | Original source | Status |
|---|---|---|
| Title + PLAY menu | MTITLE.PCX, PLAY.BTN | done (TITLE.PCX renders black: its palette isn't applied yet) |
| Port | SF.PCX frame, PORTnn.BTN, PORTnn.MDA, STANDARD.BTN icon bar | done |
| Districts (store/warehouse/drydock/tavern/temple/hall/bank) | STRn/WRHn/DRYn/TAVn/TPLn/HALn/BNK0 .BTN + .MDA, BUYSTUFF.BTN | partial: menus are exact; buy/sell list layout is approximate; hall/bank/contracts are todo |
| Space flight | SF.PCX, NSPACE.BTN, NAV.BTN, PLANETn/SUNn sprites | partial: real orbits; ship model, view switching (BOWVW/STERNVW/PORTVW/STARVW) and RADAR are todo |
| Orbit/dock | DOCKn.BTN (n = orbit index - 1) | done |
| Navigation | NAV.BTN, NAV2.BTN, NAVWIN | partial: destination list is synthesized; NAV2 system/inner/outer/points-of-interest is todo |
| Space combat | COMBAT.BTN (fire/ram/shear/sweep/grapple/negotiate), TARGET.BTN | partial: fire, maneuver and target work; ram/shear/grapple/negotiate are todo |
| Disk menu | DISK.BTN | done (localStorage) |
| Ship/crew/log/manifest/prefs | SHIP, SHOWC, LOG, MANIFEST, PREF .BTN | todo (message-box summaries for now) |
| Boarding (OTC) | OH.PCX frame (view 168x144), OHM*.DMP decks, MONSTERS.CHR, OCOMBAT/OMAIN/OWALK .BTN | todo, next |
| Captain creation | RACE, SEX, CLASS, STAT, SETCREW, SETDIF .BTN | todo |
| Cutscenes | STORY.LIB, BDA, FINALE0, SJINTRO* | todo |

### Quest note: Rex's "necromancer's flying pyramid"
No string in SF3, OTC, SJ, STORY.LIB or MONSTERS.CHR mentions a pyramid or necromancer. The undead stronghold with a LICH that
the quest sends you to is the **dwarven citadel** (step D, stages 3→4: "ITS A DWARVEN CITADEL!!", "WEAPONS HAVE NO AFFECT ON THE
CITADEL!" in SF3; CITADEL.MSH sprite; LICH in MONSTERS.CHR). That is our #1 endgame-bug candidate, the SF3→OTC→SF3 handoff
through temp files. In the port, M4 must make the citadel a forced boarding action (space weapons do nothing), run the undead fight
in the tactical engine, and award the sceptre and advance the stage directly in game state, with no temp-file handoff.


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

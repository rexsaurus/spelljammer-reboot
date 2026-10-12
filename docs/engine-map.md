# Engine map (work in progress)

Analysis of Rex's own GOG copy. Tools: REA 6.4.0 (`npx rea-agents@6.4.0`) with Ghidra 12.1.4 headless
(`GHIDRA_INSTALL_DIR=/opt/homebrew/opt/ghidra/libexec`), plus `tools/sj_xref.py`. Raw REA/Ghidra output lives in the
git-ignored `extracted/re/`. This file holds only addresses and our own descriptions; it contains no game code.

Addresses are Ghidra linear addresses (image loaded at segment 0x1000, so linear = image offset + 0x10000).

## 1. Program structure (high confidence)
The game is **three Borland C++ large-model DOS programs** that chain into each other. Each one embeds the other names
(`sj.exe`, `sf3.exe`, `otc.exe`). Each also carries a **VROOMM overlay** tail (magic `FBOV`):

| EXE | Resident image | Overlay | DGROUP | Role (from its strings/files) |
|---|---|---|---|---|
| SJ.EXE | 147,632 | 50,064 | 0x1eaa | Front end: intro (`intro.bda`), title/options, **captain/party creation** (`YOU MUST CREATE A CAPTAIN`, `crew.pim`, spells), loads items/ships/rumors |
| SF3.EXE | 237,712 | 193,968 | 0x2ebe | **Space flight + ship combat** (ram/board/fire/bearing messages), **ports/trade** (`%s%d.inv`, `.prt`, `default.crg`), **save/load** (`SAVE GAME`, `MAY NOT SAVE/LOAD WHEN DOCKED`) |
| OTC.EXE | 176,976 | 135,296 | 0x2494 | **Boarding/dungeon tactical combat** (`board.crw`, `dng%d.oml`, squads, spells), **finale** (`finale.bda`, final-boss taunts) |

The quest-ending bug most likely lives in **SF3 (quest/rumor/port state)** or in the **SF3→OTC handoff for the finale**.

## 2. What REA returned
- `rea analyze`: format `dos-mz`, x86. For SJ.EXE: 77 segments, 734 procedures, 175 defined strings.
- `rea search`/`trace`/`xrefs` on file-name strings returned **no references**. The cause is that Ghidra's MZ loader
  doesn't set DS to DGROUP, so DS-relative string operands aren't linked. `tools/sj_xref.py` works around this by reading
  DGROUP from the C0 startup stub (`mov dx, DGROUP` at the entry point).
- Even with DS fixed, only **5/59 (SJ), 6/156 (OTC), 7/285 (SF3)** of the relevant strings are referenced from resident
  code. **Most game logic is in the FBOV overlays, which neither Ghidra nor REA loads.** That's the main blocker.

## 3. Mapped functions (resident code only)

| Program | Address | System | Evidence | Confidence |
|---|---|---|---|---|
| SJ | 0x2a6e6 | Intro / BDA cutscene loader | refs `intro.bda`, `mou3.msh` | Medium |
| SJ | 0x2bb67 | Sound driver config | refs `sound.cfg` | Medium |
| SJ | 0x2c0b2 | Digital SFX loader (VOC) | refs `.VOC` template x2 | Medium |
| SJ | 0x2c17e | Music loader (XMI) | refs `.xmi` | Medium |
| SF3 | 0x16ca5, 0x1fc69 | **Save/load disk prompt** (save/load path) | refs `INSERT SAVE DISK IN DRIVE %c` | Medium |
| SF3 | 0x22be2 | Cargo-table loader | refs `default.crg` | Medium |
| SF3 | 0x10291 | MDA scene/animation loader | refs `.mda` | Medium |
| SF3 | 0x3aa0f / 0x3af5a / 0x3afe9 | sound.cfg / VOC / XMI (same sound library as SJ) | string refs | Medium |
| OTC | 0x2fde4 | Rumor text use (`text2.rum`) | string ref | Low-medium |
| OTC | 0x295a8 | Boarding-squad morale message | refs squad-afraid format string | Low-medium |
| OTC | 0x30a5f / 0x30faa / 0x31039 | sound.cfg / VOC / XMI | string refs | Medium |

**Not yet mapped (overlay code):** game loop, combat resolution, port/trade logic, quest/rumor flags, the save-file
writer, and the loaders for ITM/SHI/PRT/INV/RUM/OML. Their filename strings exist in DGROUP, but nothing in resident code
references them.

## 4. Struct layouts and stat fields
Sizes are confirmed from the data files: ITM record = 136 bytes (name at +74, 30 bytes), SHI record = 414 bytes
(name at +368). **No stat fields are named yet.** Naming them needs the overlay loader code, or controlled in-game
comparisons (ship screen vs. record values), and neither has been done. We're deliberately not guessing names.

## 5. Next steps
1. **Load the FBOV overlays.** Parse the VROOMM overlay header and stub table (each stub is `INT 3Fh` + segment info),
   then write a Ghidra script or loader that maps each overlay segment at a fixed address and patches stub calls.
   After that, re-run `sj_xref.py`/REA over the overlays. This is the single biggest unlock.
2. Then map the SF3 loaders for `ships.shi`/`items.itm`/`%s%d.inv`/`.prt` and name the ITM/SHI fields by their uses
   (damage, armor, speed, hull points, etc.).
3. Find the SF3 save writer (near 0x16ca5/0x1fc69 callers) to learn the save layout, then the quest flags.

---
## Pass 2: overlays merged (Oct 12, 2026)

**Correction to section 2.** The low hit counts above had two causes, not one: overlays were not loaded, **and**
`sj_xref.py` missed `push imm16` (opcode 0x68; this is 186+ code that passes strings as `push ds; push offset`).
Both are fixed now.

**Overlay loader.** We reuse **MZap** by Nancy Sadkov (github.com/NancyAurum/devroomm, CC0), cloned and built into the
git-ignored `extracted/re/`. `mzap -mb X.orig.exe X.merged.exe` merges the FBOV section into the MZ image, extends the
relocation table and turns each `INT 3Fh` trampoline into a far JMP. Ghidra and REA then load every overlay segment.
- FBOV `__SEGTABLE__`: SF3 at 0x314C0 (0x7E segments), SJ at 0x20630, OTC at 0x26310.
- REA analyze, SF3 original vs. merged: **77 → 153 segments, ~734 → 1,305 procedures, 175 → 402 strings**.
- String refs found by `sj_xref.py` (original → merged): **SF3 60 → 292 of 335, OTC 21 → 119 of 169, SJ 5 → 13 of 65**.
- **Not checked against a DOSBox memory snapshot.** DOSBox Staging's release build has no memory-dump debugger.
  Next step is a debug build (or DOSBox-X `MEMDUMPBIN`), then compare overlay bytes at runtime with the merged image.

Merged-image addresses below are Ghidra linear addresses (image at 0x10000). Above ~0x4D000 in SF3 is overlay code.

### SF3.EXE (flight, combat, ports, saves)
| System | Functions | Evidence | Confidence |
|---|---|---|---|
| **World/data init cluster** | 0x57df0 (rumor text1/text2.rum), 0x57ec6 & 0x57f3f (`temp%d.sf` state files), 0x580a5 (cargo.crg), 0x584ce (ships.shi), 0x5857d (items.itm), 0x58b3c (.prt) | One contiguous run of loaders, each tied to one data file | Medium-high |
| **Save/load** | 0x1e86b (writes `temp.sfi`, save-disk prompt), 0x16ca5, 0x1fc69 (save-disk prompt), 0x77f13 (blocks save/load while docked), 0x5c013 | Save strings | Medium |
| **Port / trade** | 0x6b5f9 and 0x6cbd9 (shop inventory `%s%d.inv`), 0x6fd79 (port .prt + cargo), 0x61287, 0x77a25, 0x72b89, 0x7315f, 0x6aeb1, 0x7110b | Buy/sell/price/cargo strings | Medium |
| **Ship combat** | 0x78290 (7 combat messages), 0x1edd5, 0x6eacd, 0x183f3, 0x2066d, 0x22323, 0x54c3d | Ram/board/fire/bearing messages | Medium |
| **Crew/boarding handoff** | 0x76f0c (temp.crw + items.itm), 0x773f2 | Writes crew/items for the boarding program | Medium |
| **Quest/rumor** | 0x57df0, 0x78db0, 0x6a67a, 0x7204b, 0x75f09, 0x76e3e | Rumor/mission strings | Low-medium |
| **Game loop** | not identified | Needs call-graph analysis (most-called dispatcher) | — |

### OTC.EXE (boarding/dungeon, finale)
| System | Functions | Confidence |
|---|---|---|
| Spell tables | 0x4fce0 (MUSPELL.ITM + CLERICSP.ITM), 0x5ab26 (muspells.dat) | Medium |
| **Finale** | 0x54130, 0x54489, 0x54702 (final-boss taunt dialogue), 0x5c230 (finale.bda cutscene) | Medium |
| Rumor text | 0x2fde4 (text2.rum) | Low-medium |
| Squad combat | 0x295a8, 0x4ce00, 0x501d0 | Low-medium |

### SJ.EXE
SJ's data strings are mostly not referenced, even after the merge (13/65). Its file names may be built at runtime or
passed through tables. Mapped so far: sound/intro loaders from section 3, and rumor-related refs at 0x1572b/0x15774/0x157eb.

### Quest bug
**Not located.** The best candidates are the SF3 quest/rumor functions listed above, the `temp%d.sf` state files
(0x57ec6/0x57f3f), and the SF3→OTC finale handoff (0x76f0c writes temp.crw; OTC 0x54130–0x54702 / 0x5c230 run the
finale). Next: decompile those (keeping output in extracted/re/) and diff the `temp*.sf*` files saved before and after the
step where the game gets stuck.

### Stat fields
Still not named. The loaders are known now (ships 0x584ce, items 0x5857d), but their field uses haven't been decompiled
yet. A REA `function` call on 0x584ce was stopped before it finished.

---
## Pass 3: quest state, call graph, endgame (Oct 12, 2026)
Reference used for rules: the game manual (archive.org item spelljammer-pirates-of-realmspace-manual), fetched only into the
git-ignored extracted/ref/ and consulted for ship-stat definitions. We matched our paraphrased checklist (`docs/quest-notes.md`) against SF3 string refs, plus two new heuristic tools:
`tools/sj_globals.py` (which DGROUP globals a function reads or writes) and `tools/sj_callgraph.py` (far-call graph).

### Named quest state (SF3 DGROUP)
| Global | Proposed name | Evidence | Confidence |
|---|---|---|---|
| **DS:6AF4** | `main_quest_stage` (0..9) | Only ever compared against 0–9 and only changed with `inc`. Read and advanced only by the quest functions below. **Never touched by OTC.** | Medium-high |
| DS:6AF6 | `quest_flag_a` (bool) | Set to 0/1, tested against 0, in the same quest functions | Medium (meaning unknown) |
| DS:6AF8 | `quest_flag_b` (bool) | Same pattern | Medium (meaning unknown) |
| DS:6AFA | `quest_substate` | Compared to 5/6 in the raid/encounter functions | Low |
| DS:6AD8/6ADA | Quest/encounter target (far ptr or coords?) | Shared by every quest function | Low |
| DS:6BBA | Encounter mode (0, 4, 5, 0xFFFE) | Set in hail and encounter code | Low |

### Quest functions mapped to the checklist (SF3, merged image)
| Stage(s) read | Function | Strings / role | Checklist step |
|---|---|---|---|
| 0 → inc | 0x52fb2 | Stage-0 check, then advance | A (envoy, level gate) — medium-low |
| 1, 6, 9 | 0x67fc8 | Hail handler (`TOO FAR AWAY TO HAIL`, MOTHER SHIP, citadel). Advances the stage up to 3 times | B, F, H — medium |
| 2, 4 | 0x6a40f (+0x6a3ee) | "Other points of interest" list (DWARVEN CITADEL, NEOGI MEETING). Advances | C, E — medium |
| 3, 6, 7 | 0x7204b | Search result after boarding (`YOU FIND A SCEPTRE`, MOTHER SHIP, citadel). Advances up to 4 times | D, G — medium |
| — | 0x54fa4 | NEOGI RAID encounter. Advances | F/G — medium |
| 7 | 0x22323 (called from 0x183f3) | Ship-combat result. Advances twice | H (battle chain) — medium-low |
| 9 | 0x17908 | Hail/final check at stage 9. Advances | H→I — medium-low |
| — | 0x54d80 | Launches `finale.bda` (the ending cinematic is started from **SF3**) | I — medium |
| — | 0x5723e, 0x77f13 | Citadel location; save/load blocked while at the citadel or docked | D — medium |
| — | 0x77a25, 0x57df0 | Tavern rumors, rumor-file loader | — |

### Main loop (call-graph pass)
- **SF3: 0x183f3** has the largest far-call fan-out (49 callees). It holds flight-time messages (helm not responding),
  reads stages 7/9 and calls the combat-result function 0x22323. **Proposed: space-flight main loop.** Medium.
- Other dispatchers by fan-out: 0x5a5f9, 0x5d20c, 0x61287 (port/trade), 0x5723e, 0x5ca52, 0x6b5f9/0x6cbd9 (shops).
- OTC: 0x5b244, 0x4b63d, 0x15a51, 0x4aec0 (boarding battle loop candidates, not separated yet).
- Many quest functions have no far callers. They're reached through near calls or overlay trampolines, so the graph is
  partial.

### Stat fields (named by matching data against AD&D 2e values and the manual's ship tables, not yet by loader code)
**ITEMS.ITM** (136-byte record, u16 little-endian, byte offsets):
| Offset | Name | Justification | Confidence |
|---|---|---|---|
| +20 | `dmg_small` (hi byte = dice count, lo byte = sides) | Hand axe 1d6, dirk 1d4, morning star 2d4, light crossbow 1d4 | High |
| +24 | `dmg_large` (same packing) | Long sword 1d12, two-handed sword 3d6 (AD&D vs. large) | High |
| +28..+32 | `range_short/med/long` | Catapults only (500/1000/1500) | Medium |
| +34 | `xp_value` | 0 for mundane gear; rises with each magic bonus (+1 = 600 for chain) | Medium |
| +36 | `weight` | Plate 50, chain/scale 40, banded 35, leather 15, field plate 60, long sword 4 | High |
| +40 | `item_id` | Sequential and unique. Matches the ids in shop INV files | High |
| +48 | `usable_mask` (class bits?) | 13 for leather/elfin chain, 5 for metal armor, 9 for blades | Low |
| +52 | `price_gp` | Plate 600, banded 200, scale 120, chain 75, two-handed 50, long sword 15, leather 5 | High |
| +69 (byte) | `ac_bonus` | Leather 2, scale 4, chain 5, banded 6, plate 7, field plate 8, shield 1 (= 10 − AD&D AC) | High |
| +70 | `magic_plus` | 0..4, matches the "+N" in the name | High |
| +74 | `name[30]` | — | High |

**SHIPS.SHI** (414-byte record; these are named ship *instances*, not classes):
| Offset | Name | Justification | Confidence |
|---|---|---|---|
| +0 | `tonnage` (= starting hull points) | Values 10..200. The manual says hull points equal tonnage | Medium |
| +4 | `cargo_capacity` | Mostly half of +0, which matches the manual's ship tables (e.g. 100 → 50) | Medium |
| +2, +8 | unknown (crew max? value?) | Don't match the manual's crew numbers | — |
| +368 | `name[32]` | — | High |
Confirm by reading 0x584ce / 0x5857d, or by checking the in-game ship and item screens against these values.

### Where the endgame can get stuck (candidates, ranked)
1. **SF3→OTC→SF3 handoff around the citadel (stages 3→4).** OTC runs the boarding battle but never touches
   `main_quest_stage`. SF3 0x7204b has to see the right post-boarding state to award the sceptre and advance the stage.
   If the result OTC passes back (via temp.crw / the `temp%d.sf` files, 0x76f0c / 0x57ec6 / 0x57f3f) is missing or
   stale, the stage never moves. The save block at the citadel (0x77f13) suggests the designers already knew about a
   state hazard there.
2. **Battle-chain counting at stage 7 (0x22323 advances twice).** If a battle in the deathspider→mindspider→mothership
   chain ends another way (fleeing, boarding instead of destroying), the expected number of advances may never happen.
   Then stage 9 (0x17908) and the finale launcher (0x54d80) are never reached.
3. **Hail at 0x67fc8 with stage 6/9** requires being in hail range at the right point of interest. A mismatched
   DS:6AD8/6ADA target could make the meeting/raid unreachable.

Next: make a save just before each step, dump `main_quest_stage` (find its offset in the save by diffing two saves
taken one step apart), and see which transition fails. Then decompile 0x7204b, 0x22323 and 0x67fc8 into extracted/re/.

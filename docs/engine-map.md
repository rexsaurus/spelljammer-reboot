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
EOF

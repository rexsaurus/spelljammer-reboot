# Spelljammer 1992 Reboot

A reverse-engineering and reboot project for **Spelljammer: Pirates of Realmspace** (SSI / Cybertech, 1992, DOS), built for the **Claude for Games hackathon (San Francisco, Oct 12, 2026)**.

## Why

I started playing Spelljammer when I was in elementary school. I loved it: captaining a magical ship through Realmspace, ballista duels in the void, boarding neogi warships. I made it all the way to the end of the game, and then got trapped by a game-breaking bug that made it impossible to finish. I never beat it.

Thirty-some years later, AI agents make it realistic for one person to take apart a 1992 DOS game, understand every file it ships with, and rebuild it. This project is my attempt to refresh the game I loved, fix what broke it, and finally beat it. It's also a real-world test of the [REA reverse-engineering agents library](https://github.com/morluto/rea).

## Goals

1. **Decode everything.** Map every file format and asset: palettes, sprites, UI art, 3D ship and planet models, maps, text, music and sound, save games.
2. **Export to open formats.** PNG, glTF, JSON, WAV/MIDI, with a documented spec for each format.
3. **Document the rules.** Ship stats, combat math, mission and economy logic, written as a clean spec (not copied code).
4. **Find the bug.** Locate the endgame bug that blocked my original playthrough.
5. **Port.** Rebuild in Unity, then VR (Quest / OpenXR).

## Approach

| Phase | What | Tools |
|---|---|---|
| 0 | Extract GOG install, run original in DOSBox-X as ground truth | innoextract, DOSBox-X |
| 1 | Inventory files, identify containers and formats | Python, REA, hex tools |
| 2 | Disassemble the executable, trace file loaders | Ghidra, REA |
| 3 | Write unpackers and exporters | Python + Pillow |
| 4 | Rules and engine spec | Docs |
| 5 | Unity rebuild, then VR | Unity, OpenXR |

## Layout

- `game/` original game files (gitignored, never committed; bring your own GOG copy)
- `extracted/` decoded output (gitignored)
- `tools/` unpackers and exporters
- `docs/` format specs and findings

## Legal

This repo contains only original tools and documentation. Game data is not included; you need your own legal copy (available on [GOG](https://www.gog.com/en/game/spelljammer_pirates_of_realmspace)).

## Running the web prototype (local only)
```bash
python3 tools/sj_decode.py        # reads game/ (your GOG install) -> extracted/ (git-ignored)
cd web && npm install && npm run dev
```
Controls: W/S pitch, A/D yaw, Q/E roll, Shift thrust, X brake, C cycle hull.
See `docs/file-formats.md` for format notes.

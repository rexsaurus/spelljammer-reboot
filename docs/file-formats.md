# Spelljammer: Pirates of Realmspace (1992) — file formats

Notes from reverse-engineering the GOG install (`game/GAME/SPELLJAM`). All values are little-endian.
Decoder: `tools/sj_decode.py`. No game data is in this repo.

| Format | Where | Status | Confidence |
|---|---|---|---|
| PCX | ART/*.PCX (6) | Decoded → PNG | **High**: standard ZSoft v5, 320×200 8bpp, 256-colour palette at EOF |
| MPL | ART/*.MPL (55) | Decoded → JSON palette | **High** for layout; **medium** on which base palette fills indices 0–63/255 |
| MSH | ART/*.MSH (275) | Decoded → PNG (275/275) | **High**: every file decodes to exactly the declared size, and ship output checked by eye |
| VOC | *.VOC (72) | Decoded → WAV | **High**: standard Creative Voice File |
| XMI | *.XMI (27) | Identified, not converted | **High** on ID (Miles XMIDI: FORM/XDIR + CAT/XMID); converter TODO |
| MDA | ART/*.MDA (85) | Identified only | **Low**: magic `TWDL`, then u16 w, u16 h, u16 frame count?, u16 ?, u32 offset table. Probably animations |
| BTN | ART/*.BTN (95) | Not decoded | **Low**: u16 0x14, u16 count, then rects (x,y,w,h). Probably UI hotspot tables |
| PRT | ART/*.PRT (46) | Partially | **Medium**: 152 bytes; u16 id, then a NUL-padded port/location name |
| OML, RUM, IPC, INV, DMP, CYL, LIB, DAT | — | Not started | — |

## MPL: palette fragment
```
u8  first   // e.g. 0x40
u8  last    // e.g. 0xFE  -> (last-first+1)=191 entries; file = 2 + 191*3 = 575 bytes
RGB[last-first+1]  // 6-bit VGA DAC values (0..63); scale ×255/63
```
Each scene swaps colours 64–254 and keeps a shared base for 0–63 and 255. The decoder now uses `OH.PCX`'s palette as the base (OH and OPTION share an identical 0–63, and are closest to the MPLs). Medium confidence: and some sprites may be slightly off-colour until the
in-game base palette is located (likely inside SJ.EXE or a LIB).

## MSH: 8bpp sprite (not a 3D mesh)
Despite the name, MSH files are bitmaps. Ships are `SHP<n>S<k>.MSH`, k=0..8, which are **9 pre-rendered
view angles** per hull. The engine billboards them and mirrors them for the other side.
```
u32 packed_size   // 0 => raw. Otherwise = file_size - 9
u16 width
u16 height
u8  flag          // 0/1 raw, 8/9 packed (meaning unclear, maybe depth hint)
-- raw (packed_size==0):   width*height palette indices, row-major
-- packed:
u32 unpacked_size  // == width*height
u16 n_nodes
s16 tree[n_nodes][2]   // children for bit 0/1; >=0 = node index, <0 = leaf, byte = ~value; root = node 0
bitstream               // LSB-first within each byte
```
Huffman output then goes through **RLE90** (BinHex-style): `X 0x90 N` means X repeated N times in total.
`0x90 0x00` is a literal 0x90. Index 0 is transparent.
Frame order: S0..S8 most likely runs bow-on to stern-on. That's **unconfirmed**; the web prototype assumes it.

## VOC
Standard Creative Voice File (`Creative Voice File\x1a`). Block 1 (8-bit PCM, rate = 1e6/(256-tc)).
`NN.VOC` and `NNPC.VOC` come in pairs (probably SB vs PC-speaker variants).

## XMI
Miles Sound System Extended MIDI (`FORM XDIR`, `CAT XMID`, `FORM XMID`, `TIMB`, `EVNT`). `ST<n>_GR<k>`
probably means song n for driver group k (0 = AdLib/OPL, 1 = MT-32/GM?, 3 = ?). To convert to SMF: expand the
note-on durations into note-offs and convert the 120 Hz delta-time to ticks. The algorithm is well documented
(e.g. in libtimidity, ScummVM, and the Exult `xmidi.cc`).

## Pass 2 (tools/sj_data.py, tools/sj_more.py)

| Format | Status | Confidence |
|---|---|---|
| MDA (85) | **Fully decoded**: every frame of every file consumes its bytes exactly | High |
| XMI (27) | Converted to .mid; 24/27 have >20 notes (3 are near-empty, likely silent driver variants) | High on structure, medium on timing |
| FNT (3) | Decoded to glyph atlases | High |
| TILE0/1.LIB | 73 + 71 24×24 raw MSH tiles, zero trailing bytes | High |
| DRESS0-2.LIB | 256-entry u32 offset table; 22 MSH entries each | High |
| STORY.LIB | Offset table; 37 text entries | High |
| ICON0, SPELLANM, TNM0 .LIB | Offset table splits; entry format unknown (ICON0 entries start `01 00 01 00`, then MSH-like 24×24, probably multi-frame) | Low |
| RUM (14) / ART/STR.DAT | XOR with 8-byte key `81 29 3a db 4b 75 3c ba` (^0x20 for uppercase), fixed 128-byte (RUM) / 64-byte (STR) records | High |
| ITM | 136-byte records, name at +74 (30 bytes); ITEMS 212, CLERICSP 69 | High on layout, stats fields unnamed |
| SHIPS.SHI | 13 × 414-byte records, name at +368; stats fields unnamed | High on layout |
| PRT (46) | u16 id + name; remaining fields unnamed | Medium |
| INV (21) | u32 header, then (u16 price?, u16 item_id, u16 qty?) triples; item ids map to ITEMS.ITM names correctly | Medium |
| CLSPELLS/MUSPELLS.DAT | CRLF text lists | High |
| CYL (5) | 6-byte records: flag, first, last, speed?, pad. Probably palette colour-cycle ranges | Medium |
| IPC (28) | u16 triples; meaning unknown | Low |
| BTN (95) | Starts u16 20, u16 1, rects; dumped as u16 only | Low |
| OML (12) | 0x400 offset table + 0xFFFF-filled grid; dungeon object maps? | Low |
| DMP (10) | 3098 bytes, map-like; unknown | Low |
| BDA (3: INTRO, FINALE, +1) | Large; small-integer stream up front, likely cutscene script + frames | Unknown |
| OFFSET/YOFFSET.DAT | Signed byte pairs / bytes; likely sprite hotspot offsets per frame | Low |

### MDA (animated scene / button)
```
"TWDL" u16 w, u16 h, u16 frames, u16 flags, u32 offset[frames]
frame 0 : PCX-style RLE (byte>=0xC0 -> count=b&0x3F, next byte value) for w*h pixels
frame k : delta ops applied to previous image
   02 x y n <PCX-RLE pixels until n produced>   copy run
   03 x y n c                                    fill run
   FF                                            end
```
160×136 MDAs are port/scene backdrops; 25×22 ones are animated UI buttons; palette = matching MPL.

### XMI to MIDI
For each `EVNT`: bytes <0x80 add to the delay; note-on carries a VLQ duration, so we emit a note-off at t+dur.
The output is SMF format 0, division 60, tempo 500000 µs (= Miles' 120 Hz clock).

### Still unknown
The base palette for 0–63 isn't stored as a raw 6-bit run in SJ.EXE (only a lookup table matched). The definitive fix is to take a
DOSBox screenshot in-game (Ctrl+F5 writes a paletted PNG) and read its palette. Item/ship stat field meanings, BTN hit-boxes,
OML/DMP maps, BDA cutscenes, and ICON0/SPELLANM entries are also still open.

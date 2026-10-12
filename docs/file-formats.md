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
Each scene swaps colours 64–254 and keeps a shared base for 0–63 and 255. The decoder currently uses
`NEBULA1.PCX`'s palette as the base. That's a guess, and some sprites may be slightly off-colour until the
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

#!/usr/bin/env python3
"""Decode map data from your own GOG copy into extracted/data/ (git-ignored).

1. Realmspace celestial bodies: SF3.EXE initializes 8 body records (stride 0x4C, name at +0) with immediate
   `mov word [DS:addr], imm` stores in the init routine that copies "ANADIA" (DS:0x21d3) into DS:0x6c06.
   We scan that routine statically (no emulation) and recover per-body fields:
     +0x2c u16 orbit_radius   640, 1280, 1920, 2560, 6400, 7680, 10240   (High: monotonic, matches planet order)
     +0x30 u16 orbit_index    1..7, equals the tens digit of PORTnn.PRT  (High)
     +0x32 u16 f32            hypothesis: start angle / size              (Low)
     +0x34 u16 f34            hypothesis: orbital period                  (Low)
     +0x36..+0x3a u16         unknown
   The player's start position is stored at DS:0x6b82/6b86/6b8a (signed u32 x, y, z).
2. Tactical maps (ART/OHM*.DMP): 26-byte header (u8 w=32, u8 h=32 at +12), then w*h cells of 3 bytes:
   byte0 = tile graphic, byte1 = cell kind (0 floor, 1 wall, 0x22 door, others = props), byte2 = extra.
   These are boarding/deck maps used by OTC, not star maps.
3. Dungeon maps (ART/DNG*.OML): u16 count, 32x32 grid of u8 (0xff = empty) at +4..+1028?, then object records.
   Only the grid is exported for now (Low confidence on the trailing records).
"""
import json, os, re, struct, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, 'game/GAME/SPELLJAM'); OUT = os.path.join(ROOT, 'extracted/data')

def mz_image(path):
    d = open(path, 'rb').read(); hdr = struct.unpack_from('<H', d, 8)[0] * 16; img = d[hdr:]
    ip, cs = struct.unpack_from('<HH', d, 0x14); e = cs * 16 + ip
    assert img[e] == 0xBA, 'expected Borland C0 stub'
    return img, struct.unpack_from('<H', img, e + 1)[0] * 16

def cstr(img, base, o): e = img.index(b'\0', base + o); return img[base + o:e].decode('latin1')

def bodies():
    img, base = mz_image(os.path.join(GAME, 'SF3.EXE'))
    name_off = img.index(b'ANADIA\0', base) - base
    push = b'\x68' + struct.pack('<H', name_off)        # push imm16 (DS:"ANADIA")
    at = img.index(push, base + 0x10000)                 # code lives after DGROUP (merged overlays)
    start = img.rfind(b'\x55\x8b\xec', at - 0x400, at)   # push bp; mov bp,sp
    mem, pushes, names, i = {}, [], {}, start
    while i < start + 0x1400:                            # tiny decoder for the 3 opcodes this routine uses
        op = img[i]
        if op == 0xC7 and img[i + 1] == 0x06:            # mov word [imm16], imm16
            a, v = struct.unpack_from('<HH', img, i + 2); mem[a] = v; i += 6
        elif op == 0xC6 and img[i + 1] == 0x06: mem[struct.unpack_from('<H', img, i + 2)[0]] = img[i + 4]; i += 5
        elif op == 0x68: pushes.append(struct.unpack_from('<H', img, i + 1)[0]); i += 3
        elif op == 0x6A: i += 2
        elif op == 0x1E: i += 1                          # push ds
        elif op == 0x9A:                                 # lcall: strcpy(dst, src) when last two pushes are dst, src
            if len(pushes) >= 2 and pushes[-2] < 0x8000: names[pushes[-1]] = cstr(img, base, pushes[-2]); pushes.clear()
            i += 5
        elif op == 0x83 and img[i + 1] == 0xC4: i += 3   # add sp, imm8
        elif op in (0xCB, 0xC3): break
        else: i += 1                                     # skip unknown byte (routine is straight-line stores)
    out = []
    for addr, name in sorted(names.items()):
        if not re.fullmatch(r"[A-Z']+", name): continue
        g = lambda k: mem.get(addr + k)
        out.append({'name': name, 'orbit_radius': g(0x2c), 'orbit_index': g(0x30), 'f32': g(0x32), 'f34': g(0x34),
                    'f36': g(0x36), 'f38': g(0x38), 'f3a': g(0x3a)})
    s32 = lambda lo: ((mem.get(lo + 2, 0) << 16 | mem.get(lo, 0)) ^ 0x80000000) - 0x80000000
    return {'source': 'SF3.EXE body init routine', 'bodies': out, 'start_pos': [s32(0x6b82), s32(0x6b86), s32(0x6b8a)]}

def dmp(path):
    d = open(path, 'rb').read(); w, h = d[12], d[13]; c = d[26:]
    return {'w': w, 'h': h, 'tile': [c[i * 3] for i in range(w * h)], 'kind': [c[i * 3 + 1] for i in range(w * h)]}

def oml(path):
    d = open(path, 'rb').read(); return {'w': 32, 'h': 32, 'header': struct.unpack_from('<H', d, 0)[0], 'grid': list(d[4:4 + 1024]), 'tail_bytes': len(d) - 1028}

if __name__ == '__main__':
    if not os.path.isdir(GAME): sys.exit('game/ not found: bring your own GOG copy')
    os.makedirs(OUT, exist_ok=True); art = os.path.join(GAME, 'ART')
    b = bodies(); json.dump(b, open(os.path.join(OUT, 'bodies.json'), 'w'), indent=1)
    decks = {f[:-4]: dmp(os.path.join(art, f)) for f in sorted(os.listdir(art)) if f.endswith('.DMP')}
    json.dump(decks, open(os.path.join(OUT, 'decks.json'), 'w'))
    dng = {f[:-4]: oml(os.path.join(art, f)) for f in sorted(os.listdir(art)) if f.endswith('.OML')}
    json.dump(dng, open(os.path.join(OUT, 'dungeons.json'), 'w'))
    print(f"bodies: {[(x['name'], x['orbit_radius']) for x in b['bodies']]}  start {b['start_pos']}")
    print(f"decks: {len(decks)}  dungeons: {len(dng)}")

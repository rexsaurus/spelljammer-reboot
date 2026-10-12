#!/usr/bin/env python3
"""Second-pass decoders: MDA animations, FNT fonts, XMI->MIDI, CYL colour cycling, TILE LIBs,
BTN/OML/DMP/IPC/BDA structure dumps. Output goes to extracted/ (git-ignored). Stdlib only.

  python3 tools/sj_more.py
"""
import glob, json, os, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sj_decode import write_png, indexed_to_rgba, read_pcx, read_mpl, merge_pal, read_msh

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = os.path.join(ROOT, 'game', 'GAME', 'SPELLJAM'); ART = os.path.join(G, 'ART')
OUT = os.path.join(ROOT, 'extracted')
stem = lambda f: os.path.splitext(os.path.basename(f))[0]
def u16s(b): return list(struct.unpack('<%dH' % (len(b) // 2), b[:len(b) // 2 * 2]))

# ---------- palettes ----------
BASE = read_pcx(open(os.path.join(ART, 'OH.PCX'), 'rb').read())[3]   # 0-63 & 255 shared base (see docs)
def palette_for(name):
    cands = [name, name.rstrip('0123456789'), name[:4], name[:3]]
    for c in cands:
        p = os.path.join(ART, c + '.MPL')
        if os.path.exists(p): return merge_pal(BASE, read_mpl(open(p, 'rb').read())), c
    return BASE, None

# ---------- MDA ----------
def pcx_rle(b, n, i=0):
    o = bytearray()
    while len(o) < n and i < len(b):
        c = b[i]; i += 1
        if c >= 0xC0: o += bytes([b[i]]) * (c & 0x3F); i += 1
        else: o.append(c)
    return o, i

def read_mda(d):
    """'TWDL', u16 w, u16 h, u16 frames, u16 flags, u32 offsets[frames].
    Frame 0: PCX-style RLE keyframe. Frames 1..n: delta ops on previous image:
      02 x y n <n pixels, PCX-RLE>   | 03 x y n colour (fill) | FF end."""
    assert d[:4] == b'TWDL'
    w, h, n, flags = struct.unpack_from('<4H', d, 4)
    offs = list(struct.unpack_from('<%dI' % n, d, 12)) + [len(d)]
    img, _ = pcx_rle(d, w * h, offs[0]); img = bytearray(img.ljust(w * h, b'\0'))
    frames = [bytes(img)]
    for k in range(1, n):
        b = d[offs[k]:offs[k + 1]]; i = 0
        while i < len(b):
            op = b[i]
            if op == 2:
                x, y, m = b[i+1:i+4]; px, i = pcx_rle(b, m, i + 4); p = y * w + x; img[p:p+m] = px[:m]
            elif op == 3:
                x, y, m, c = b[i+1:i+5]; p = y * w + x; img[p:p+m] = bytes([c]) * m; i += 5
            else: break
        frames.append(bytes(img))
    return w, h, flags, frames

# ---------- FNT ----------
def read_fnt(d):
    """u8 height, u8 ?, u8 widths[96] (ASCII 32..127), then 96 glyphs x height rows, 1 byte/row MSB=left."""
    h = d[0]; widths = list(d[2:98]); g = d[98:]
    return h, widths, [list(g[k*h:(k+1)*h]) for k in range(96)]

# ---------- XMI -> SMF ----------
def vlq(n):
    out = [n & 0x7F]; n >>= 7
    while n: out.append(0x80 | (n & 0x7F)); n >>= 7
    return bytes(reversed(out))

def iff_chunks(d, i, end):
    while i + 8 <= end:
        cid = d[i:i+4]; ln = struct.unpack('>I', d[i+4:i+8])[0]
        yield cid, i + 8, ln
        i += 8 + ln + (ln & 1)

def xmi_to_midis(d):
    """Miles XMIDI: FORM XDIR, CAT XMID{FORM XMID{TIMB, EVNT}}. EVNT: delay bytes <0x80 sum;
    note-on carries a VLQ duration instead of a note-off. 120 Hz clock -> SMF div 60 @ 500000us."""
    seqs = []
    def walk(i, end):
        for cid, s, ln in iff_chunks(d, i, end):
            if cid in (b'FORM', b'CAT '): walk(s + 4, s + ln)
            elif cid == b'EVNT': seqs.append(d[s:s+ln])
    walk(0, len(d))
    mids = []
    for ev in seqs:
        events = []; t = 0; i = 0
        while i < len(ev):
            b = ev[i]
            if b < 0x80: t += b; i += 1; continue
            st = b & 0xF0
            if b == 0xFF:
                typ = ev[i+1]; i += 2; ln = 0
                while True:
                    c = ev[i]; i += 1; ln = (ln << 7) | (c & 0x7F)
                    if c < 0x80: break
                data = ev[i:i+ln]; i += ln
                if typ == 0x2F: break
                if typ == 0x51: continue   # XMI tempo is ignored by Miles; keep fixed clock
                events.append((t, 1, bytes([0xFF, typ]) + vlq(ln) + data))
            elif b in (0xF0, 0xF7):
                i += 1; ln = 0
                while True:
                    c = ev[i]; i += 1; ln = (ln << 7) | (c & 0x7F)
                    if c < 0x80: break
                events.append((t, 1, bytes([b]) + vlq(ln) + ev[i:i+ln])); i += ln
            elif st == 0x90:
                note, vel = ev[i+1], ev[i+2]; i += 3; dur = 0
                while True:
                    c = ev[i]; i += 1; dur = (dur << 7) | (c & 0x7F)
                    if c < 0x80: break
                events.append((t, 1, bytes([b, note, vel])))
                events.append((t + dur, 0, bytes([0x80 | (b & 15), note, 0])))
            elif st in (0xC0, 0xD0):
                events.append((t, 1, ev[i:i+2])); i += 2
            else:
                events.append((t, 1, ev[i:i+3])); i += 3
        events.sort(key=lambda e: (e[0], e[1]))
        trk = bytearray(b'\x00\xFF\x51\x03\x07\xA1\x20'); last = 0
        for tt, _, data in events: trk += vlq(tt - last) + data; last = tt
        trk += b'\x00\xFF\x2F\x00'
        mids.append(b'MThd' + struct.pack('>IHHH', 6, 0, 1, 60) + b'MTrk' + struct.pack('>I', len(trk)) + trk)
    return mids

def main():
    for sub in ('mda', 'fnt', 'mid', 'tiles', 'data'): os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    man = {'animations': {}, 'fonts': {}, 'music': [], 'tiles': {}}
    # MDA -> per-frame PNG + horizontal sprite sheet
    for f in sorted(glob.glob(os.path.join(ART, '*.MDA'))):
        n = stem(f)
        try:
            w, h, flags, frames = read_mda(open(f, 'rb').read())
        except Exception as e:
            print('MDA fail', n, e); continue
        pal, pname = palette_for(n)
        sheet = bytearray()
        for y in range(h):
            for fr in frames: sheet += fr[y*w:(y+1)*w]
        write_png(os.path.join(OUT, 'mda', n + '.png'), w * len(frames), h, indexed_to_rgba(bytes(sheet), pal, transparent=-1 if w >= 160 else 0))
        man['animations'][n] = {'w': w, 'h': h, 'frames': len(frames), 'flags': flags, 'palette': pname}
    # Fonts -> atlas PNG (16x6 grid)
    for f in sorted(glob.glob(os.path.join(ART, '*.FNT'))):
        h, widths, glyphs = read_fnt(open(f, 'rb').read()); cw = 8
        W, H = 16 * cw, 6 * h; px = bytearray(W * H * 4)
        for k, g in enumerate(glyphs):
            ox, oy = (k % 16) * cw, (k // 16) * h
            for r, row in enumerate(g):
                for c in range(8):
                    if row & (0x80 >> c):
                        p = ((oy + r) * W + ox + c) * 4; px[p:p+4] = b'\xff\xff\xff\xff'
        write_png(os.path.join(OUT, 'fnt', stem(f) + '.png'), W, H, bytes(px))
        man['fonts'][stem(f)] = {'height': h, 'cell': cw, 'widths': widths, 'first': 32}
    # XMI -> MIDI
    for f in sorted(glob.glob(os.path.join(G, '*.XMI'))):
        for k, m in enumerate(xmi_to_midis(open(f, 'rb').read())):
            name = f'{stem(f)}_{k}' if k else stem(f)
            open(os.path.join(OUT, 'mid', name + '.mid'), 'wb').write(m); man['music'].append(name)
    # TILE LIBs: concatenated raw MSH tiles
    for f in sorted(glob.glob(os.path.join(G, 'TILE*.LIB'))):
        d = open(f, 'rb').read(); i = 0; k = 0
        while i + 9 <= len(d):
            w, h, pix = read_msh(d[i:])
            if not (0 < w <= 64 and 0 < h <= 64): break
            write_png(os.path.join(OUT, 'tiles', f'{stem(f)}_{k:03d}.png'), w, h, indexed_to_rgba(pix, BASE)); i += 9 + w * h; k += 1
        man['tiles'][stem(f)] = {'count': k, 'trailing_bytes': len(d) - i}
    # structure dumps (semantics still unknown)
    dumps = {}
    for ext in ('CYL', 'BTN', 'OML', 'DMP', 'IPC', 'BDA'):
        dumps[ext] = {}
        for f in sorted(glob.glob(os.path.join(ART, '*.' + ext))):
            d = open(f, 'rb').read()
            if ext == 'CYL':
                dumps[ext][stem(f)] = [dict(zip(('flag', 'first', 'last', 'speed', 'pad'), struct.unpack_from('<BBBBH', d, k)))
                                       for k in range(0, len(d) - 5, 6)]
            elif ext == 'IPC':
                dumps[ext][stem(f)] = [list(struct.unpack_from('<3H', d, k)) for k in range(0, len(d) - 5, 6)]
            elif ext == 'BDA':
                dumps[ext][stem(f)] = {'size': len(d), 'head_u16': u16s(d[:64])}
            else:
                dumps[ext][stem(f)] = {'size': len(d), 'u16': u16s(d) if len(d) < 4096 else u16s(d[:4096])}
    json.dump(dumps, open(os.path.join(OUT, 'data', 'structures.json'), 'w'))
    json.dump(man, open(os.path.join(OUT, 'manifest2.json'), 'w'), indent=1)
    print('MDA', len(man['animations']), '| FNT', len(man['fonts']), '| MIDI', len(man['music']), '| tiles', man['tiles'])

if __name__ == '__main__':
    main()

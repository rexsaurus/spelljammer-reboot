#!/usr/bin/env python3
"""Spelljammer: Pirates of Realmspace asset decoder (original code, no game data).

Reads from your own GOG install (default: game/GAME/SPELLJAM) and writes PNG/WAV/JSON
into extracted/ (git-ignored). Pure stdlib, Python 3.8+.

  python3 tools/sj_decode.py [--game DIR] [--out DIR]
"""
import argparse, glob, json, os, struct, zlib

# ---------- PNG writer ----------
def write_png(path, w, h, rgba):
    raw = b''.join(b'\0' + rgba[y*w*4:(y+1)*w*4] for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def indexed_to_rgba(pix, pal, transparent=0):
    out = bytearray(len(pix) * 4)
    for i, p in enumerate(pix):
        r, g, b = pal[p]
        out[i*4:i*4+4] = bytes((r, g, b, 0 if p == transparent else 255))
    return bytes(out)

# ---------- Palettes ----------
def read_pcx(d):
    """Standard ZSoft PCX v5, 8bpp, 1 plane, RLE; 256-colour VGA palette at EOF."""
    xmin, ymin, xmax, ymax = struct.unpack_from('<4H', d, 4)
    w, h = xmax - xmin + 1, ymax - ymin + 1
    bpl = struct.unpack_from('<H', d, 66)[0]
    pix = bytearray(); i = 128
    while len(pix) < bpl * h:
        b = d[i]; i += 1
        if b >= 0xC0: pix += bytes([d[i]]) * (b & 0x3F); i += 1
        else: pix.append(b)
    img = bytearray()
    for y in range(h): img += pix[y*bpl:y*bpl+w]
    po = len(d) - 768
    pal = [tuple(d[po + k*3:po + k*3 + 3]) for k in range(256)] if d[po - 1] == 12 else None
    return w, h, bytes(img), pal

def read_mpl(d):
    """MPL: u8 first index, u8 last index, then (last-first+1) RGB triples, 6-bit VGA DAC values."""
    first, last = d[0], d[1]
    return first, [tuple(min(255, c * 255 // 63) for c in d[2+k*3:5+k*3]) for k in range(last - first + 1)]

def merge_pal(base, mpl):
    pal = list(base)
    first, cols = mpl
    for k, c in enumerate(cols): pal[first + k] = c
    return pal

# ---------- MSH bitmaps ----------
def huffman(data, n_nodes, tree_off):
    tree = struct.unpack_from('<%dh' % (2 * n_nodes), data, tree_off)
    bits = data[tree_off + 4 * n_nodes:]
    out = bytearray(); node = 0
    for i in range(len(bits) * 8):
        c = tree[2 * node + ((bits[i >> 3] >> (i & 7)) & 1)]   # LSB-first
        if c < 0: out.append((~c) & 0xFF); node = 0             # leaf = one's complement
        else: node = c
    return out

def rle90(s):
    """BinHex-style RLE: X 0x90 N -> X repeated N times total; 0x90 0x00 -> literal 0x90."""
    o = bytearray(); i = 0; last = 0
    while i < len(s):
        b = s[i]; i += 1
        if b == 0x90 and i < len(s):
            n = s[i]; i += 1
            if n == 0: o.append(0x90); last = 0x90
            else: o += bytes([last]) * (n - 1)
        else: o.append(b); last = b
    return o

def read_msh(d):
    """MSH ('mesh' is a misnomer: these are 8bpp sprites).
    u32 packed_size, u16 w, u16 h, u8 flag, then
      packed_size==0 : w*h raw pixels
      otherwise      : u32 unpacked_size, u16 n_nodes, n_nodes*2 s16 Huffman tree, bitstream -> RLE90
    """
    size, w, h, flag = struct.unpack_from('<IHHB', d, 0)
    if size == 0:
        return w, h, d[9:9 + w * h]
    usz = struct.unpack_from('<I', d, 9)[0]
    n = struct.unpack_from('<H', d, 13)[0]
    pix = rle90(huffman(d, n, 15))[:usz]
    return w, h, bytes(pix)

# ---------- VOC -> WAV ----------
def voc_to_wav(d):
    """Creative Voice File: header 'Creative Voice File\\x1a', blocks type 1 (8-bit PCM), 2 (continue), 9 (new fmt)."""
    if not d.startswith(b'Creative Voice File'): return None
    i = struct.unpack_from('<H', d, 20)[0]; rate = 11025; pcm = bytearray(); bits = 8
    while i < len(d):
        t = d[i]
        if t == 0: break
        ln = d[i+1] | d[i+2] << 8 | d[i+3] << 16; body = d[i+4:i+4+ln]
        if t == 1:
            rate = 1000000 // (256 - body[0]); pcm += body[2:]
        elif t == 2: pcm += body
        elif t == 9:
            rate = struct.unpack_from('<I', body, 0)[0]; bits = body[4]; pcm += body[12:]
        i += 4 + ln
    ba = bits // 8
    hdr = b'RIFF' + struct.pack('<I', 36 + len(pcm)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, rate, rate*ba, ba, bits) + b'data' + struct.pack('<I', len(pcm))
    return hdr + bytes(pcm)

def main():
    ap = argparse.ArgumentParser()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument('--game', default=os.path.join(root, 'game', 'GAME', 'SPELLJAM'))
    ap.add_argument('--out', default=os.path.join(root, 'extracted'))
    ap.add_argument('--palette', default='OH.PCX', help='PCX supplying base palette')
    a = ap.parse_args()
    art = os.path.join(a.game, 'ART')
    for sub in ('png', 'wav', 'pal'): os.makedirs(os.path.join(a.out, sub), exist_ok=True)
    manifest = {'sprites': {}, 'images': {}, 'sounds': [], 'palettes': []}

    pcx_pals = {}
    for f in sorted(glob.glob(os.path.join(art, '*.PCX'))):
        w, h, img, pal = read_pcx(open(f, 'rb').read())
        name = os.path.splitext(os.path.basename(f))[0]
        pcx_pals[os.path.basename(f)] = pal
        write_png(os.path.join(a.out, 'png', name + '.png'), w, h, indexed_to_rgba(img, pal, transparent=-1))
        manifest['images'][name] = {'w': w, 'h': h}
    base = pcx_pals.get(a.palette) or next(iter(pcx_pals.values()))
    for f in sorted(glob.glob(os.path.join(art, '*.MPL'))):
        name = os.path.splitext(os.path.basename(f))[0]
        pal = merge_pal(base, read_mpl(open(f, 'rb').read()))
        json.dump(pal, open(os.path.join(a.out, 'pal', name + '.json'), 'w'))
        manifest['palettes'].append(name)

    ok = fail = 0
    for f in sorted(glob.glob(os.path.join(art, '*.MSH'))):
        name = os.path.splitext(os.path.basename(f))[0]
        try:
            w, h, pix = read_msh(open(f, 'rb').read())
            write_png(os.path.join(a.out, 'png', name + '.png'), w, h, indexed_to_rgba(pix, base))
            manifest['sprites'][name] = {'w': w, 'h': h}; ok += 1
        except Exception as e:
            print('MSH fail', name, e); fail += 1
    print(f'MSH: {ok} decoded, {fail} failed')

    for f in sorted(glob.glob(os.path.join(a.game, '*.VOC'))):
        wav = voc_to_wav(open(f, 'rb').read())
        if wav:
            name = os.path.splitext(os.path.basename(f))[0]
            open(os.path.join(a.out, 'wav', name + '.wav'), 'wb').write(wav)
            manifest['sounds'].append(name)
    print(f"PCX: {len(manifest['images'])}, MPL: {len(manifest['palettes'])}, VOC: {len(manifest['sounds'])}")
    json.dump(manifest, open(os.path.join(a.out, 'manifest.json'), 'w'), indent=1)

if __name__ == '__main__':
    main()

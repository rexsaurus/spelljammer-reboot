#!/usr/bin/env python3
"""Decode Spelljammer game-data files to JSON in extracted/data/ (git-ignored).
Reads only from your own install under game/. Stdlib only.

  python3 tools/sj_data.py [--game DIR] [--out DIR]
"""
import argparse, glob, json, os, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sj_decode import read_msh, write_png, indexed_to_rgba, read_pcx

# 8-byte repeating XOR key used by *.RUM and ART/STR.DAT. Plaintext is uppercase ASCII padded with spaces;
# key below already folds in the 0x20 (space) so padding decodes to ' '.
XOR_KEY = bytes(b ^ 0x20 for b in bytes.fromhex('81293adb4b753cba'))

def cstr(b): return b.split(b'\0')[0].decode('latin1').strip()
def u16s(b): return list(struct.unpack('<%dH' % (len(b) // 2), b[:len(b) // 2 * 2]))
def xor_text(d): return bytes(c ^ XOR_KEY[i % 8] for i, c in enumerate(d)).decode('latin1')

def parse_items(path, rec=136, name_off=74, name_len=30):
    d = open(path, 'rb').read(); out = []
    for k in range(len(d) // rec):
        r = d[k * rec:(k + 1) * rec]
        out.append({'id': k, 'name': cstr(r[name_off:name_off + name_len]),
                    'fields_pre_name_u16': u16s(r[:name_off]), 'fields_post_name_u16': u16s(r[name_off + name_len:])})
    return out

def parse_ships(path, rec=414, name_off=368):
    d = open(path, 'rb').read()
    return [{'id': k, 'name': cstr(d[k*rec+name_off:k*rec+name_off+32]),
             'fields_u16': u16s(d[k*rec:k*rec+name_off]), 'tail_u16': u16s(d[k*rec+name_off+32:(k+1)*rec])}
            for k in range(len(d) // rec)]

def parse_prt(path):
    d = open(path, 'rb').read()
    return {'id': struct.unpack_from('<H', d, 0)[0], 'name': cstr(d[2:34]), 'rest_u16': u16s(d[34:])}

def parse_inv(path, items):
    d = open(path, 'rb').read()
    rows = []
    for off in range(4, len(d) - 5, 6):
        a, item, c = struct.unpack_from('<3H', d, off)
        rows.append({'price_or_a': a, 'item_id': item, 'qty_or_c': c,
                     'item_name': items[item]['name'] if item < len(items) else None})
    return {'header_u16': u16s(d[:4]), 'rows': rows}

def parse_rum(path, rec=128):
    t = xor_text(open(path, 'rb').read())
    recs = [t[i:i + rec].strip() for i in range(0, len(t), rec)]
    return [r for r in recs if r]

def parse_lib(path, outdir, pal):
    d = open(path, 'rb').read()
    n = struct.unpack_from('<I', d, 0)[0] // 4
    offs = [o for o in struct.unpack_from('<%dI' % n, d, 0) if 0 < o <= len(d)]
    ends = offs[1:] + [len(d)]
    name = os.path.splitext(os.path.basename(path))[0]
    entries = []
    for i, (a, b) in enumerate(zip(offs, ends)):
        blob = d[a:b]; e = {'index': i, 'offset': a, 'size': b - a, 'kind': 'unknown'}
        try:
            w, h, pix = read_msh(blob)
            if 0 < w <= 640 and 0 < h <= 480 and len(pix) == w * h:
                write_png(os.path.join(outdir, f'{name}_{i:03d}.png'), w, h, indexed_to_rgba(pix, pal))
                e.update(kind='msh', w=w, h=h)
        except Exception:
            pass
        if e['kind'] == 'unknown':
            printable = sum(32 <= c < 127 or c in (10, 13) for c in blob) / max(1, len(blob))
            if printable > 0.85: e.update(kind='text', text=blob.decode('latin1'))
        entries.append(e)
    return entries

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser()
    ap.add_argument('--game', default=os.path.join(root, 'game', 'GAME', 'SPELLJAM'))
    ap.add_argument('--out', default=os.path.join(root, 'extracted', 'data'))
    a = ap.parse_args(); G, ART, O = a.game, os.path.join(a.game, 'ART'), a.out
    os.makedirs(os.path.join(O, 'lib'), exist_ok=True)
    dump = lambda n, obj: json.dump(obj, open(os.path.join(O, n), 'w'), indent=1)
    pal = read_pcx(open(os.path.join(ART, 'OH.PCX'), 'rb').read())[3]
    items = parse_items(os.path.join(ART, 'ITEMS.ITM')); dump('items.json', items)
    for f in ('CLERICSP', 'MUSPELL'):
        p = os.path.join(ART, f + '.ITM')
        if os.path.exists(p): dump(f.lower() + '.json', parse_items(p))
    dump('ships.json', parse_ships(os.path.join(ART, 'SHIPS.SHI')))
    dump('ports.json', {os.path.basename(f)[:-4]: parse_prt(f) for f in sorted(glob.glob(os.path.join(ART, '*.PRT')))})
    dump('inventories.json', {os.path.basename(f)[:-4]: parse_inv(f, items) for f in sorted(glob.glob(os.path.join(ART, '*.INV')))})
    dump('rumors.json', {os.path.basename(f)[:-4]: parse_rum(f) for f in sorted(glob.glob(os.path.join(ART, '*.RUM')))})
    dump('strings.json', parse_rum(os.path.join(ART, 'STR.DAT'), rec=64))
    dump('spells.json', {f: open(os.path.join(G, f + '.DAT'), 'rb').read().decode('latin1').split('\r\n') for f in ('CLSPELLS', 'MUSPELLS')})
    libs = {os.path.basename(f): parse_lib(f, os.path.join(O, 'lib'), pal) for f in sorted(glob.glob(os.path.join(G, '*.LIB')))}
    dump('libs.json', libs)
    print('items', len(items), '| LIB entries by kind:',
          {k: {kind: sum(e['kind'] == kind for e in v) for kind in ('msh', 'text', 'unknown')} for k, v in libs.items()})

if __name__ == '__main__':
    main()

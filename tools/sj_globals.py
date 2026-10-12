#!/usr/bin/env python3
"""List DGROUP globals touched by given functions in an MZap-merged Borland EXE, and which globals they share.
Heuristic byte scan (no disassembler): direct-address forms A0/A1/A2/A3 (mov acc<->[imm16]),
80/81/83/C6/C7 with ModRM mod=00 rm=110 ([imm16]) and 3A/3B/38/39/8A/8B/88/89 with [imm16].
Output: addresses only, written to extracted/re/. Usage: sj_globals.py X.merged.exe 0xADDR [0xADDR...]"""
import bisect, collections, json, os, re, struct, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load(path):
    d = open(path, 'rb').read(); hdr = struct.unpack_from('<H', d, 8)[0] * 16; img = d[hdr:]
    ip, cs = struct.unpack_from('<2H', d, 0x14); dg = struct.unpack_from('<H', img, cs * 16 + ip + 1)[0]
    prolog = [m.start() for m in re.finditer(rb'\x55\x8b\xec|\xc8..\x00', img)]
    return img, dg, prolog

def globals_in(img, start, end):
    g = collections.Counter(); i = start
    while i < end - 3:
        b = img[i]
        if b in (0xA0, 0xA1, 0xA2, 0xA3): g[struct.unpack_from('<H', img, i+1)[0]] += 1
        elif b in (0x80, 0x81, 0x83, 0xC6, 0xC7, 0x38, 0x39, 0x3A, 0x3B, 0x8A, 0x8B, 0x88, 0x89, 0xFF, 0xF7) and (img[i+1] & 0xC7) == 0x06:
            g[struct.unpack_from('<H', img, i+2)[0]] += 1
        i += 1
    return g

if __name__ == '__main__':
    img, dg, prolog = load(sys.argv[1]); res = {}
    for a in sys.argv[2:]:
        off = int(a, 16) - 0x10000; j = bisect.bisect_right(prolog, off)
        end = prolog[j] if j < len(prolog) else off + 0x400
        res[a] = {'size': end - off, 'globals': {'0x%04x' % k: v for k, v in globals_in(img, off, end).items() if 0x40 < k < 0xFFF0}}
    cnt = collections.Counter(k for r in res.values() for k in r['globals'])
    shared = {k: [a for a, r in res.items() if k in r['globals']] for k, n in cnt.most_common() if n >= 2}
    os.makedirs(os.path.join(ROOT, 'extracted', 're'), exist_ok=True)
    json.dump({'functions': res, 'shared': shared}, open(os.path.join(ROOT, 'extracted', 're', 'globals.json'), 'w'), indent=1)
    for k, fs in list(shared.items())[:25]: print('DS:%s' % k, 'in', len(fs), ' '.join(fs))

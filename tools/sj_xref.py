#!/usr/bin/env python3
"""Find which functions reference which DGROUP strings in a Borland C++ 16-bit DOS MZ executable.

Ghidra's MZ loader (as used by REA) doesn't know DS, so DS-relative string refs come back empty.
This reads DGROUP from the C0 startup stub (`mov dx, DGROUP` at CS:IP), then finds
`push imm16` or `mov r16, imm16` instructions whose immediate is a string's DS offset, and attributes each
to the nearest preceding `push bp; mov bp,sp` / `enter` prologue.

Limits: on an original EXE only the resident image is scanned (overlays in the 'FBOV' tail are not
loaded). Run it on an MZap `-mb` merged EXE (extracted/re/*.merged.exe) to include overlay code. Heuristic, so expect false positives.
Output goes to extracted/re/ (git-ignored). Prints only addresses and short string labels.

  python3 tools/sj_xref.py SJ.EXE [--grep REGEX]
"""
import argparse, bisect, json, os, re, struct
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def analyze(path, grep):
    d = open(path, 'rb').read()
    lastp, pages, nrel, hdr = struct.unpack_from('<4H', d, 2); ip, cs = struct.unpack_from('<2H', d, 0x14)
    size = (pages - 1) * 512 + (lastp or 512); H = hdr * 16; img = d[H:size]
    entry = cs * 16 + ip
    assert img[entry] == 0xBA, 'expected Borland C0 stub: mov dx, DGROUP'
    _ = 0
    assert True, 'expected Borland C0 stub: mov dx, DGROUP'
    dgroup = struct.unpack_from('<H', img, entry + 1)[0]; base = dgroup * 16
    # scan everything except DGROUP itself; MZap-merged overlays are appended after the resident image
    code = img[:base] + b'\x90' * min(0x10000, len(img) - base) + img[base + 0x10000:]
    prologs = [m.start() for m in re.finditer(rb'\x55\x8b\xec|\xc8..\x00', code)]
    strs = [(m.start(), m.group().decode()) for m in re.finditer(rb'[ -~]{4,}(?=\x00)', img[base:base + 0x10000])]
    rx = re.compile(grep, re.I) if grep else None
    out = []
    for off, s in strs:
        if rx and not rx.search(s): continue
        imm = struct.pack('<H', off); fns = set()
        for op in (0x68, 0xB8, 0xB9, 0xBA, 0xBB, 0xBE, 0xBF):  # 0x68 = push imm16 (186+ code)
            for m in re.finditer(re.escape(bytes([op]) + imm), code):
                i = bisect.bisect_right(prologs, m.start()) - 1
                if i >= 0: fns.add(prologs[i])
        # Ghidra loads the image at segment 0x1000, so linear address = image offset + 0x10000
        out.append({'ds_off': off, 'label': s[:40], 'functions': ['0x%05x' % (f + 0x10000) for f in sorted(fns)]})
    return {'file': os.path.basename(path), 'dgroup_para': '0x%04x' % dgroup, 'image_bytes': len(img),
            'overlay_bytes': len(d) - size, 'overlay_magic': d[size:size + 4].decode('latin1'),
            'prologues': len(prologs), 'strings': out}

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('exe'); ap.add_argument('--grep'); a = ap.parse_args()
    r = analyze(a.exe, a.grep); os.makedirs(os.path.join(ROOT, 'extracted', 're'), exist_ok=True)
    dst = os.path.join(ROOT, 'extracted', 're', r['file'] + '.xref.json'); json.dump(r, open(dst, 'w'), indent=1)
    hit = sum(1 for s in r['strings'] if s['functions'])
    print(f"{r['file']}: DGROUP {r['dgroup_para']}, image {r['image_bytes']}, overlay {r['overlay_bytes']} ({r['overlay_magic']}), "
          f"{r['prologues']} prologues, {hit}/{len(r['strings'])} strings referenced in resident code -> {dst}")

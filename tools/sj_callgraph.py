#!/usr/bin/env python3
"""Rough far-call graph for an MZap-merged Borland EXE: counts `call far seg:off` (9A) edges between
prologue-delimited functions. Ranks fan-out (dispatcher/main-loop candidates) and fan-in. Heuristic: relocated
segment values in the file are image-relative, which matches our linear addressing (+0x10000).
Writes extracted/re/<exe>.callgraph.json. Usage: sj_callgraph.py X.merged.exe"""
import bisect, collections, json, os, re, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sj_globals import load
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
img, dg, prolog = load(sys.argv[1]); D = dg * 16; P = set(prolog)
out = collections.defaultdict(set); fin = collections.Counter()
for i in range(len(img) - 5):
    if D <= i < D + 0x10000 or img[i] != 0x9A: continue
    off, seg = struct.unpack_from('<HH', img, i + 1); t = seg * 16 + off
    if t not in P: continue
    j = bisect.bisect_right(prolog, i) - 1
    if j < 0: continue
    src = prolog[j]; out[src].add(t); fin[t] += 1
fan = sorted(out.items(), key=lambda kv: -len(kv[1]))
res = {'fan_out': [['0x%05x' % (s + 0x10000), len(t)] for s, t in fan[:30]],
       'fan_in': [['0x%05x' % (t + 0x10000), n] for t, n in fin.most_common(30)],
       'edges': {'0x%05x' % (s + 0x10000): ['0x%05x' % (x + 0x10000) for x in sorted(t)] for s, t in out.items()}}
name = os.path.basename(sys.argv[1]).split('.')[0]
json.dump(res, open(os.path.join(ROOT, 'extracted', 're', name + '.callgraph.json'), 'w'))
print(name, 'edges', sum(len(t) for t in out.values()), '| top fan-out', res['fan_out'][:8])

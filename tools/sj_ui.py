#!/usr/bin/env python3
"""Decode ART/*.BTN screen layouts into extracted/data/btn.json (git-ignored).

BTN = sequence of button records: 31 u16 header + u16 label_len + label bytes.
  w[0] id, w[1] ?(1), w[2] x, w[3] y, w[4] w, w[5] h (320x200 screen pixels),
  w[6..9] style (1, 0xb, 5|7, 4), w[10..13] ptrs, w[14..17] keyboard-nav neighbour ids (up, down, left, right?),
  w[18] ?, w[19] 0x64, ... ; label: '^' = line break, '~name.msh' = image button (sprite from ART).
Also measures the black viewport rectangles inside the 320x200 frame PCXs (SF, OH, OPTION) from the decoded PNGs.
"""
import json, os, struct
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'game/GAME/SPELLJAM/ART'); OUT = os.path.join(ROOT, 'extracted')

def btn(path):
    d = open(path, 'rb').read(); i = 0; out = []
    while i + 64 <= len(d):
        w = struct.unpack_from('<31H', d, i); n = struct.unpack_from('<H', d, i + 62)[0]
        label = d[i + 64:i + 64 + n].decode('latin1'); i += 64 + n
        out.append({'id': w[0], 'x': w[2], 'y': w[3], 'w': w[4], 'h': w[5], 'style': w[6:10], 'nav': w[14:18], 'raw': w,
                    'label': label, 'image': label[1:].upper().replace('.MSH', '') if label.startswith('~') else None})
    return out

def viewport(png, seed):
    """Bounding box of the black region flood-filled from seed (the frame's window)."""
    im = Image.open(png).convert('RGB'); W, H = im.size; px = im.load()
    if px[seed] != (0, 0, 0): return None
    st, seen = [seed], {seed}
    while st:
        x, y = st.pop()
        for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= q[0] < W and 0 <= q[1] < H and q not in seen and px[q] == (0, 0, 0): seen.add(q); st.append(q)
    xs = [p[0] for p in seen]; ys = [p[1] for p in seen]
    return {'x': min(xs), 'y': min(ys), 'w': max(xs) - min(xs) + 1, 'h': max(ys) - min(ys) + 1}

if __name__ == '__main__':
    b = {f[:-4]: btn(os.path.join(ART, f)) for f in sorted(os.listdir(ART)) if f.endswith('.BTN')}
    P = lambda n: os.path.join(OUT, 'png', n + '.png')
    frames = {'SF_view': viewport(P('SF'), (12, 12)), 'SF_msg': viewport(P('SF'), (12, 170)),
              'OH_view': viewport(P('OH'), (12, 12)), 'OH_msg': viewport(P('OH'), (12, 170))}
    os.makedirs(os.path.join(OUT, 'data'), exist_ok=True)
    json.dump({'buttons': b, 'viewports': frames}, open(os.path.join(OUT, 'data/btn.json'), 'w'))
    print(len(b), 'BTN files;', 'viewports', frames)

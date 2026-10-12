// 320x200 VGA-style screen: integer-scaled canvas, original PCX/MSH art and FNT fonts loaded at runtime from extracted/.
export const W = 320, H = 200;
export function createScreen() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.style.cssText = 'image-rendering:pixelated;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)';
  document.body.appendChild(cv);
  const fit = () => { const s = Math.max(1, Math.min(innerWidth / W, innerHeight / H)); cv.style.width = W * s + 'px'; cv.style.height = H * s * 1.2 / 1.2 + 'px'; };
  addEventListener('resize', fit); fit();
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const toScreen = e => { const r = cv.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / r.width * W), y: Math.floor((e.clientY - r.top) / r.height * H) }; };
  return { cv, g, toScreen };
}
const imgCache = {};
export function img(path) {
  if (!imgCache[path]) { const i = new Image(); i.src = path; imgCache[path] = i; }
  return imgCache[path];
}
export const art = name => img(`/png/${name}.png`);
export const ready = (...ims) => Promise.all(ims.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));

// FNT: atlas of 8x6 cells, 16 per row, starting at char 32, per-glyph advance widths (tools/sj_more.py).
export function makeFont(meta, atlas) {
  const tinted = {};
  const tint = color => {
    if (tinted[color]) return tinted[color];
    const c = document.createElement('canvas'); c.width = atlas.width; c.height = atlas.height; const t = c.getContext('2d');
    t.drawImage(atlas, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = color; t.fillRect(0, 0, c.width, c.height);
    return (tinted[color] = c);
  };
  const adv = ch => { const i = ch.charCodeAt(0) - meta.first; return (meta.widths[i] ?? 3) + 1; };
  return {
    height: meta.height,
    width: s => [...s].reduce((a, ch) => a + adv(ch), 0),
    draw(g, s, x, y, color = '#fff') {
      const t = tint(color);
      for (const ch of s.toUpperCase()) { const i = ch.charCodeAt(0) - meta.first; if (i >= 0 && i < meta.widths.length) g.drawImage(t, (i % 16) * meta.cell, Math.floor(i / 16) * meta.height, meta.cell, meta.height, x, y, meta.cell, meta.height); x += adv(ch); }
      return x;
    },
  };
}

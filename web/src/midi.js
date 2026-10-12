// Minimal SMF (format 0/1) parser + square/triangle WebAudio synth. Original code.
export function parseMidi(buf) {
  const d = new DataView(buf); let p = 0;
  const str = n => String.fromCharCode(...new Uint8Array(buf, p, n));
  const vlq = () => { let v = 0, c; do { c = d.getUint8(p++); v = (v << 7) | (c & 127); } while (c & 128); return v; };
  if (str(4) !== 'MThd') throw new Error('not midi'); p += 8;
  const ntr = d.getUint16(p + 2), div = d.getUint16(p + 4); p += 6;
  const notes = []; let tempo = 500000;
  for (let t = 0; t < ntr; t++) {
    p += 4; const len = d.getUint32(p); p += 4; const end = p + len; let tick = 0, rs = 0; const on = {};
    while (p < end) {
      tick += vlq(); let s = d.getUint8(p);
      if (s & 128) p++; else s = rs; rs = s;
      const type = s & 0xf0, ch = s & 15;
      if (s === 0xff) { const mt = d.getUint8(p++); const l = vlq(); if (mt === 0x51) tempo = (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2); p += l; }
      else if (s === 0xf0 || s === 0xf7) { p += vlq(); }
      else if (type === 0xc0 || type === 0xd0) p += 1;
      else { const a = d.getUint8(p), b = d.getUint8(p + 1); p += 2;
        if (type === 0x90 && b > 0) on[ch * 128 + a] = { tick, note: a, vel: b, ch };
        else if (type === 0x80 || type === 0x90) { const n = on[ch * 128 + a]; if (n) { n.dur = tick - n.tick; notes.push(n); delete on[ch * 128 + a]; } } }
    }
    p = end;
  }
  const spt = tempo / 1e6 / div;
  return notes.map(n => ({ t: n.tick * spt, d: Math.max(0.03, n.dur * spt), f: 440 * 2 ** ((n.note - 69) / 12), v: n.vel / 127, drum: n.ch === 9 }));
}

export class MidiPlayer {
  constructor(ctx) { this.ctx = ctx; this.out = ctx.createGain(); this.out.gain.value = 0.08; this.out.connect(ctx.destination); this.nodes = []; }
  stop() { this.nodes.forEach(n => { try { n.stop(); } catch {} }); this.nodes = []; clearTimeout(this.loopT); }
  play(notes, loop = true) {
    this.stop(); const t0 = this.ctx.currentTime + 0.1; let end = 0;
    for (const n of notes) {
      if (n.drum) continue;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = n.f < 220 ? 'triangle' : 'square'; o.frequency.value = n.f;
      g.gain.setValueAtTime(0, t0 + n.t); g.gain.linearRampToValueAtTime(n.v, t0 + n.t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + n.t + n.d);
      o.connect(g).connect(this.out); o.start(t0 + n.t); o.stop(t0 + n.t + n.d + 0.05); this.nodes.push(o);
      end = Math.max(end, n.t + n.d);
    }
    if (loop && end) this.loopT = setTimeout(() => this.play(notes, loop), (end + 1) * 1000);
  }
}

// BTN-driven menus: every button's position, size and label come from the original ART/*.BTN files (tools/sj_ui.py).
// Label syntax: '^' marks the hotkey (next char); '~name.msh' is an image button.
import { art } from './screen.js';
export const TEXT = '#2a1406', HOT = '#fff4c0', HILITE = '#c00000'; // colors approximate the VGA palette entries
export const parseLabel = l => { const i = l.indexOf('^'); return { text: l.replace('^', ''), hot: i >= 0 ? l[i + 1]?.toLowerCase() : null, hotIndex: i }; };
export class Menu {
  constructor(buttons, onPick) { this.buttons = buttons.map(b => (!b.image && b.label.startsWith('`') ? { ...b, image: b.label.slice(1).toUpperCase() } : b)); this.onPick = onPick; this.hover = -1; }
  hit(x, y) { return this.buttons.findIndex(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h); }
  draw(g, font) {
    this.buttons.forEach((b, i) => {
      if (b.image) { const im = art(b.image); if (im.complete && im.width) g.drawImage(im, b.x, b.y); if (i === this.hover) { g.strokeStyle = HOT; g.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1); } return; }
      const { text, hotIndex } = parseLabel(b.label);
      const x0 = b.x + 2, y0 = b.y + 1; let x = x0;
      [...text].forEach((ch, k) => { x = font.draw(g, ch, x, y0, k === hotIndex ? (i === this.hover ? HOT : HILITE) : (i === this.hover ? HOT : TEXT)); });
    });
  }
  mouse(x, y, click) { this.hover = this.hit(x, y); if (click && this.hover >= 0) { this.onPick(this.buttons[this.hover]); return true; } return false; }
  key(k) { const b = this.buttons.find(b => parseLabel(b.label).hot === k.toLowerCase()); if (b) { this.onPick(b); return true; } return false; }
}

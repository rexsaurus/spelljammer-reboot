// Port / menu overlay: plays decoded MDA scene animations, lists ports, rumors and shop inventory.
export async function initPort({ onEnter, onLeave }) {
  const j = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
  const [m2, ports, inv, rumors] = await Promise.all([j('/manifest2.json'), j('/data/ports.json'), j('/data/inventories.json'), j('/data/rumors.json')]);
  if (!m2) return null;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:none;background:#000d;color:#fd8;font:14px monospace;align-items:center;justify-content:center;gap:24px';
  const cv = document.createElement('canvas'); cv.style.cssText = 'image-rendering:pixelated;width:640px;border:2px solid #a73';
  const side = document.createElement('div'); side.style.cssText = 'width:420px;max-height:80vh;overflow:auto;white-space:pre-wrap';
  el.append(cv, side); document.body.appendChild(el);
  const ctx = cv.getContext('2d');
  const scenes = Object.entries(m2.animations).filter(([, a]) => a.w === 160).map(([k]) => k);
  let cur = 0, frame = 0, img = null, timer = null, open = false;
  function load(i) {
    cur = (i + scenes.length) % scenes.length; const name = scenes[cur], a = m2.animations[name];
    img = new Image(); img.src = `/mda/${name}.png`; cv.width = a.w; cv.height = a.h; frame = 0;
    const stemKey = Object.keys(ports || {}).find(k => name.startsWith(k.replace(/\d+$/, '')) && name.startsWith(k)) || Object.keys(ports || {}).find(k => name.startsWith(k.slice(0, 3)));
    const port = ports?.[stemKey]; const shop = inv?.[stemKey];
    const rumorSet = rumors ? Object.values(rumors)[cur % Object.keys(rumors).length] : [];
    side.textContent = `SCENE ${name}  (${cur + 1}/${scenes.length})\n` + (port ? `PLACE: ${port.name}\n` : '') +
      (shop ? '\nFOR SALE:\n' + shop.rows.filter(r => r.item_name).map(r => `  ${r.item_name.padEnd(22)} ${r.price_or_a}`).join('\n') + '\n' : '') +
      (rumorSet?.length ? `\nRUMOR:\n  ${rumorSet[Math.floor(Math.random() * rumorSet.length)]}\n` : '') +
      '\n[←/→] scene   [R] new rumor   [P] leave port';
  }
  function draw() { const a = m2.animations[scenes[cur]]; if (img?.complete) { ctx.clearRect(0, 0, a.w, a.h); ctx.drawImage(img, frame * a.w, 0, a.w, a.h, 0, 0, a.w, a.h); frame = (frame + 1) % a.frames; } }
  addEventListener('keydown', e => {
    if (e.code === 'KeyP') { open = !open; el.style.display = open ? 'flex' : 'none'; if (open) { load(cur); timer = setInterval(draw, 100); onEnter?.(); } else { clearInterval(timer); onLeave?.(); } }
    if (!open) return;
    if (e.code === 'ArrowRight') load(cur + 1); if (e.code === 'ArrowLeft') load(cur - 1); if (e.code === 'KeyR') load(cur);
  }, true);
  return { isOpen: () => open };
}

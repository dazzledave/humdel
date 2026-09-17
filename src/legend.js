import * as THREE from 'three';

/* ------------------------------------------------------------
   Icons
------------------------------------------------------------ */
const mouse = (part) => `
<svg class="mouse" viewBox="0 0 26 38" aria-hidden="true">
  <rect x="2" y="2" width="22" height="34" rx="11" class="m-body"/>
  <path d="M13 2 A11 11 0 0 0 2 13 V16 H13 Z" class="m-btn${part==='left'?' on':''}"/>
  <path d="M13 2 A11 11 0 0 1 24 13 V16 H13 Z" class="m-btn${part==='right'?' on':''}"/>
  <rect x="10.5" y="5.5" width="5" height="8" rx="2.5" class="m-wheel${part==='wheel'?' on':''}"/>
</svg>`;

const glyph = {
  rotate: `<svg class="act-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/></svg>`,
  zoom:   `<svg class="act-glyph" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M8 10.5h5M10.5 8v5"/></svg>`,
  pan:    `<svg class="act-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/></svg>`
};

const touch = {
  rotate: `<svg class="mouse" viewBox="0 0 38 38" aria-hidden="true"><circle cx="19" cy="21" r="6" class="finger on"/><path class="gesture" d="M8 12a14 14 0 0 1 22 0M27 8.5 30 12l-4 1.5"/></svg>`,
  zoom:   `<svg class="mouse" viewBox="0 0 38 38" aria-hidden="true"><circle cx="12" cy="26" r="5" class="finger on"/><circle cx="26" cy="12" r="5" class="finger on"/><path class="gesture" d="M4 34l4-4M34 4l-4 4M4 34h4.5M4 34v-4.5M34 4h-4.5M34 4v4.5"/></svg>`,
  pan:    `<svg class="mouse" viewBox="0 0 38 38" aria-hidden="true"><circle cx="13" cy="20" r="5" class="finger on"/><circle cx="25" cy="20" r="5" class="finger on"/><path class="gesture" d="M19 4v7M16 7l3-3 3 3M19 34v-7M16 31l3 3 3-3"/></svg>`
};

/* ------------------------------------------------------------
   Legend + keyboard navigation
------------------------------------------------------------ */
export function setupControlsLegend({ viewport, canvas, camera, controls, onFront, onRecenter, onSpin }){
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const STORE = 'bodyforge.legend';
  let open = true;
  try { const v = localStorage.getItem(STORE); if (v !== null) open = v === '1'; else if (isTouch) open = false; } catch (e) {}

  const rows = isTouch ? [
    { act:'rotate', icon:touch.rotate, title:'Rotate',    how:'Drag with one finger' },
    { act:'zoom',   icon:touch.zoom,   title:'Zoom',      how:'Pinch in or out' },
    { act:'pan',    icon:touch.pan,    title:'Move view', how:'Drag with two fingers' }
  ] : [
    { act:'rotate', icon:mouse('left'),  g:glyph.rotate, title:'Rotate',    how:'Hold the <b>left</b> button and drag' },
    { act:'zoom',   icon:mouse('wheel'), g:glyph.zoom,   title:'Zoom',      how:'Roll the <b>scroll wheel</b>' },
    { act:'pan',    icon:mouse('right'), g:glyph.pan,    title:'Move view', how:'Hold the <b>right</b> button and drag' }
  ];

  const keys = [
    ['<kbd>←</kbd><kbd>→</kbd>', 'Rotate'],
    ['<kbd>↑</kbd><kbd>↓</kbd>', 'Tilt'],
    ['<kbd>+</kbd><kbd>−</kbd>', 'Zoom'],
    ['<kbd>Shift</kbd>+<kbd>←</kbd>…', 'Move view'],
    ['<kbd>F</kbd>', 'Face front'],
    ['<kbd>C</kbd>', 'Re-center'],
    ['<kbd>Space</kbd>', 'Spin on/off']
  ];

  const root = document.createElement('section');
  root.className = 'legend' + (open ? ' open' : '');
  root.setAttribute('aria-label', 'Viewer controls');
  root.innerHTML = `
    <button class="legend-head" type="button" aria-expanded="${open}">
      ${mouse('')}
      <span class="legend-title">How to move the view</span>
      <span class="legend-chev" aria-hidden="true"></span>
    </button>
    <div class="legend-body">
      <ul class="legend-rows">
        ${rows.map(r => `
          <li class="legend-row" data-act="${r.act}">
            <span class="legend-icon">${r.icon}</span>
            <span class="legend-text"><span class="legend-act">${r.g || ''}${r.title}</span><span class="legend-how">${r.how}</span></span>
          </li>`).join('')}
      </ul>
      ${isTouch ? '' : `
      <div class="legend-keys">
        <div class="legend-keys-title">Keyboard</div>
        <dl>${keys.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <p class="legend-note">Click the 3D view first so the keys go to it.</p>
      </div>`}
    </div>`;
  viewport.appendChild(root);

  const head = root.querySelector('.legend-head');
  head.addEventListener('click', () => {
    open = !open;
    root.classList.toggle('open', open);
    head.setAttribute('aria-expanded', String(open));
    try { localStorage.setItem(STORE, open ? '1' : '0'); } catch (e) {}
  });

  /* ---- live highlight of whichever control is being used ---- */
  const rowEl = (act) => root.querySelector(`.legend-row[data-act="${act}"]`);
  const timers = {};
  function pulse(act, hold){
    const r = rowEl(act); if (!r) return;
    r.classList.add('live');
    clearTimeout(timers[act]);
    if (!hold) timers[act] = setTimeout(() => r.classList.remove('live'), 650);
  }
  function release(){ for (const a of ['rotate','zoom','pan']) pulse(a, false); }

  canvas.addEventListener('pointerdown', (e) => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (e.pointerType === 'touch') return;
    if (e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey) pulse('pan', true);
    else if (e.button === 0) pulse('rotate', true);
    else if (e.button === 1) pulse('zoom', true);
  });
  window.addEventListener('pointerup', release);
  canvas.addEventListener('wheel', () => pulse('zoom'), { passive: true });
  canvas.addEventListener('touchstart', (e) => pulse(e.touches.length > 1 ? 'zoom' : 'rotate', true), { passive: true });
  canvas.addEventListener('touchmove', (e) => { if (e.touches.length > 1) pulse('pan', true); }, { passive: true });
  canvas.addEventListener('touchend', release, { passive: true });

  /* ---- keyboard navigation ---- */
  const off = new THREE.Vector3(), sph = new THREE.Spherical();
  const right = new THREE.Vector3(), up = new THREE.Vector3();

  function orbit(dAz, dPol){
    off.copy(camera.position).sub(controls.target);
    sph.setFromVector3(off);
    sph.theta += dAz;
    sph.phi = Math.min(controls.maxPolarAngle - 0.01, Math.max(controls.minPolarAngle + 0.01, sph.phi + dPol));
    sph.makeSafe();
    off.setFromSpherical(sph);
    camera.position.copy(controls.target).add(off);
    controls.update();
  }
  function dolly(f){
    off.copy(camera.position).sub(controls.target);
    const len = Math.min(controls.maxDistance, Math.max(controls.minDistance, off.length() * f));
    off.setLength(len);
    camera.position.copy(controls.target).add(off);
    controls.update();
  }
  function pan(dx, dy){
    const dist = camera.position.distanceTo(controls.target);
    right.setFromMatrixColumn(camera.matrix, 0);
    up.setFromMatrixColumn(camera.matrix, 1);
    const k = dist * 0.04;
    const move = right.multiplyScalar(dx * k).add(up.multiplyScalar(dy * k));
    camera.position.add(move);
    controls.target.add(move);
    controls.update();
  }

  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === ' ' && t && t.tagName === 'BUTTON') return;   // let Space press a focused button
    const step = 0.06;
    let handled = true;
    switch (e.key){
      case 'ArrowLeft':  if (e.shiftKey){ pan(-1, 0); pulse('pan'); } else { orbit(-step, 0); pulse('rotate'); } break;
      case 'ArrowRight': if (e.shiftKey){ pan( 1, 0); pulse('pan'); } else { orbit( step, 0); pulse('rotate'); } break;
      case 'ArrowUp':    if (e.shiftKey){ pan(0,  1); pulse('pan'); } else { orbit(0, -step); pulse('rotate'); } break;
      case 'ArrowDown':  if (e.shiftKey){ pan(0, -1); pulse('pan'); } else { orbit(0,  step); pulse('rotate'); } break;
      case '+': case '=': dolly(0.9);  pulse('zoom'); break;
      case '-': case '_': dolly(1.11); pulse('zoom'); break;
      case 'f': case 'F': onFront && onFront(); break;
      case 'c': case 'C': onRecenter && onRecenter(); break;
      case ' ': onSpin && onSpin(); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });
}

import * as THREE from 'three';

/* ------------------------------------------------------------
   Part roles for the bundled slip-on (public/models/shoe.glb),
   keyed by each mesh's vertex count. Other shoe models fall back
   to a height-based sole/upper split.
------------------------------------------------------------ */
const KNOWN_PARTS = {
  12100: 'upper',   // canvas upper
  6144:  'sole',    // rubber sole: sidewall + bottom
  3744:  'trim',    // sole stripe
  937:   'trim',    // sole stripe
  423:   'trim',    // thin line around the outsole
  60262: 'stitch',  // thread stitching
  1874:  'inner',   // lining
  461:   'inner'    // insole
};
const SOLE_ROLES = new Set(['sole', 'trim']);

export const SHOE_STYLES = {
  'Classic Black':   { upper:'#1b1c20', pattern:'solid',   pattern2:'#f1eee6', finish:'canvas',  sole:'#f1eee6', trim:'#1b1c20', stitch:'#f1eee6', inner:'#1b1c20' },
  'Checkerboard':    { upper:'#f1eee6', pattern:'checker', pattern2:'#1b1c20', finish:'canvas',  sole:'#f1eee6', trim:'#1b1c20', stitch:'#f1eee6', inner:'#1b1c20' },
  'True White':      { upper:'#f4f2ed', pattern:'solid',   pattern2:'#1b1c20', finish:'canvas',  sole:'#f4f2ed', trim:'#c9c4ba', stitch:'#dedad2', inner:'#ebe8e2' },
  'Navy Canvas':     { upper:'#1f2a44', pattern:'solid',   pattern2:'#f1eee6', finish:'canvas',  sole:'#f1eee6', trim:'#1f2a44', stitch:'#f1eee6', inner:'#1f2a44' },
  'Burgundy Suede':  { upper:'#5b1a26', pattern:'solid',   pattern2:'#efe6d8', finish:'suede',   sole:'#efe6d8', trim:'#5b1a26', stitch:'#5b1a26', inner:'#2a1d1d' },
  'Stealth Leather': { upper:'#141518', pattern:'solid',   pattern2:'#2a2b2f', finish:'leather', sole:'#141518', trim:'#141518', stitch:'#34363c', inner:'#141518' },
  'Cherry Patent':   { upper:'#b3121f', pattern:'solid',   pattern2:'#f1eee6', finish:'patent',  sole:'#f1eee6', trim:'#b3121f', stitch:'#b3121f', inner:'#1b1c20' },
  'Sunset Stripe':   { upper:'#f2b33d', pattern:'stripes', pattern2:'#e2574c', finish:'canvas',  sole:'#f1eee6', trim:'#e2574c', stitch:'#f1eee6', inner:'#e2574c' },
  'Tartan':          { upper:'#2f5d46', pattern:'plaid',   pattern2:'#b3121f', finish:'canvas',  sole:'#efe6d8', trim:'#2f5d46', stitch:'#efe6d8', inner:'#2f5d46' }
};

export const PATTERNS = [['solid','Solid'],['checker','Checker'],['stripes','Stripes'],['plaid','Plaid']];
export const FINISHES = [['canvas','Canvas'],['suede','Suede'],['leather','Leather'],['patent','Patent']];

const FINISH = {
  canvas:  { roughness:0.92, sheen:0.22, sheenRoughness:0.8,  clearcoat:0.0, clearcoatRoughness:0.5,  bump:'weave', bumpScale:1.4 },
  suede:   { roughness:1.0,  sheen:1.0,  sheenRoughness:0.45, clearcoat:0.0, clearcoatRoughness:0.5,  bump:'fuzz',  bumpScale:0.7 },
  leather: { roughness:0.42, sheen:0.0,  sheenRoughness:0.5,  clearcoat:0.3, clearcoatRoughness:0.35, bump:'grain', bumpScale:0.6 },
  patent:  { roughness:0.12, sheen:0.0,  sheenRoughness:0.5,  clearcoat:1.0, clearcoatRoughness:0.03, bump:null,    bumpScale:0 }
};

/* ------------------------------------------------------------
   Template: bake every part into one frame where
   +X points to the heel, +Y up, the inside heel sits at the
   origin, the footbed is y = 0, and the shoe is 1 unit long.
------------------------------------------------------------ */
export function buildShoeTemplate(gltf){
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    parts.push({ geo, role: KNOWN_PARTS[geo.attributes.position.count] || null });
  });
  if (!parts.length) return null;

  // Align the long axis with X (principal axis in the ground plane).
  let sx = 0, sz = 0, c = 0;
  const samples = [];
  for (const p of parts){
    const a = p.geo.attributes.position.array;
    const step = Math.max(3, Math.floor(a.length / 3 / 4000) * 3);
    for (let i = 0; i < a.length; i += step){ samples.push(a[i], a[i+2]); sx += a[i]; sz += a[i+2]; c++; }
  }
  const mx = sx / c, mz = sz / c;
  let cxx = 0, cxz = 0, czz = 0;
  for (let i = 0; i < samples.length; i += 2){
    const x = samples[i]-mx, z = samples[i+1]-mz;
    cxx += x*x; cxz += x*z; czz += z*z;
  }
  const ang = 0.5 * Math.atan2(2*cxz, cxx - czz);
  const rot = new THREE.Matrix4().makeRotationY(ang);
  parts.forEach(p => p.geo.applyMatrix4(rot));

  const box = () => {
    const b = new THREE.Box3();
    parts.forEach(p => { p.geo.computeBoundingBox(); b.union(p.geo.boundingBox); });
    return b;
  };
  let bb = box();
  let L = bb.max.x - bb.min.x;

  // Heel = the end with the taller upper.
  const endHeight = (fromMin) => {
    let top = -Infinity;
    for (const p of parts){
      const a = p.geo.attributes.position.array;
      for (let i = 0; i < a.length; i += 3){
        const f = (a[i] - bb.min.x) / L;
        if (fromMin ? f < 0.25 : f > 0.75) top = Math.max(top, a[i+1]);
      }
    }
    return top;
  };
  if (endHeight(true) > endHeight(false)){
    const flip = new THREE.Matrix4().makeRotationY(Math.PI);
    parts.forEach(p => p.geo.applyMatrix4(flip));
    bb = box();
  }

  // Handedness: the toe tip leans toward the big-toe (medial) side.
  const zc = (bb.min.z + bb.max.z) / 2;
  let lean = 0, lc = 0;
  for (const p of parts){
    const a = p.geo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3){
      if (a[i] < bb.min.x + 0.06 * L){ lean += a[i+2] - zc; lc++; }
    }
  }
  const medialZ = (lc ? lean / lc : 1) >= 0 ? 1 : -1;

  // Key heights.
  const soleBottom = bb.min.y;
  const footbed = soleBottom + 0.074 * L;
  let collar = -Infinity, soleTop = -Infinity;
  for (const p of parts){
    const a = p.geo.attributes.position.array;
    const isSole = p.role ? SOLE_ROLES.has(p.role) : false;
    for (let i = 0; i < a.length; i += 3){
      if (a[i] > bb.max.x - 0.1 * L) collar = Math.max(collar, a[i+1]);
      if (isSole) soleTop = Math.max(soleTop, a[i+1]);
    }
  }
  if (!isFinite(soleTop)) soleTop = footbed + 0.03 * L;

  // Unknown parts: anything that stays low is sole, the rest is upper.
  for (const p of parts){
    if (p.role) continue;
    p.role = p.geo.boundingBox.max.y < footbed + 0.02 * L ? 'sole' : 'upper';
  }

  // Normalize: inside heel at the origin, footbed at y = 0, unit length.
  const heelX = bb.max.x - 0.0175 * L;
  const norm = new THREE.Matrix4()
    .makeScale(1/L, 1/L, 1/L)
    .multiply(new THREE.Matrix4().makeTranslation(-heelX, -footbed, -zc));
  parts.forEach(p => { p.geo.applyMatrix4(norm); p.geo.computeBoundingBox(); p.geo.computeBoundingSphere(); });

  const widthRatio = (bb.max.z - bb.min.z) / L;

  // Height of the upper along the shoe's centre line (normalized units). Where the upper
  // covers the top of the foot (the vamp) the foot must stay below it; once the opening
  // starts there's no limit. A short ramp avoids a step at the opening's edge.
  const NB = 48, x0 = -1 + 0.0175, x1 = 0.0175;
  const top = new Float32Array(NB).fill(-Infinity);
  for (const p of parts){
    if (p.role !== 'upper') continue;
    const a = p.geo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3){
      if (Math.abs(a[i+2]) > 0.035) continue;
      const b = Math.floor((a[i] - x0) / (x1 - x0) * NB);
      if (b >= 0 && b < NB && a[i+1] > top[b]) top[b] = a[i+1];
    }
  }
  const collarN = (collar - footbed) / L;
  const vamp = new Float32Array(NB).fill(Infinity);
  let throat = NB;
  for (let b = 0; b < NB; b++){
    if (!(top[b] > 0.02)){ throat = b; break; }   // no upper over the foot here: the opening
    vamp[b] = top[b];
  }
  // Behind the opening's front edge the foot starts just under that edge (so the edge overlaps
  // it) and is allowed to rise gradually towards the collar.
  const RAMP = 7;
  const last = throat > 0 ? vamp[throat-1] : collarN;
  for (let k = 0; k < RAMP && throat + k < NB; k++){
    const f = (k + 1) / (RAMP + 1);
    vamp[throat+k] = last + (collarN - last) * f * f;
  }

  // The same, across the width: a height map of the covered part of the upper, so the
  // sides of the instep stay under the arch of the vamp too.
  const NZ = 12, z0 = -0.17, z1 = 0.17;
  const grid = new Float32Array(NB * NZ).fill(-Infinity);
  let rimTop = -Infinity;
  for (const p of parts){
    if (p.role !== 'upper') continue;
    const a = p.geo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3){
      if (a[i+1] > rimTop) rimTop = a[i+1];
      const bx = Math.floor((a[i] - x0) / (x1 - x0) * NB);
      const bz = Math.floor((a[i+2] - z0) / (z1 - z0) * NZ);
      if (bx < 0 || bx >= NB || bz < 0 || bz >= NZ) continue;
      const k = bx * NZ + bz;
      if (a[i+1] > grid[k]) grid[k] = a[i+1];
    }
  }
  const cover = new Float32Array(NB * NZ).fill(Infinity);
  for (let bx = 0; bx < Math.min(throat, NB); bx++){
    for (let bz = 0; bz < NZ; bz++){
      // empty cells take the nearest filled cell in the same row
      let v = -Infinity;
      for (let d = 0; d < NZ && !(v > -Infinity); d++){
        for (const z of [bz - d, bz + d]) if (z >= 0 && z < NZ && grid[bx*NZ + z] > v) v = grid[bx*NZ + z];
      }
      if (v > -Infinity) cover[bx*NZ + bz] = Math.min(v, vamp[bx] + 0.02);
    }
  }
  for (let k = 0; k < RAMP && throat + k < NB; k++)
    for (let bz = 0; bz < NZ; bz++) cover[(throat+k)*NZ + bz] = vamp[throat+k];

  // Inside width of the side walls, per length bin and height bin: the innermost wall
  // point on each side (wall = surface facing sideways).
  const NY = 16, y1 = 0.3;
  const zPlus = new Float32Array(NB * NY).fill(Infinity);
  const zMinus = new Float32Array(NB * NY).fill(-Infinity);
  for (const p of parts){
    if (p.role !== 'upper' && p.role !== 'inner') continue;
    const a = p.geo.attributes.position.array, nrm = p.geo.attributes.normal?.array;
    if (!nrm) continue;
    for (let i = 0; i < a.length; i += 3){
      if (Math.abs(nrm[i+2]) < 0.6 || a[i+1] < 0) continue;
      const bx = Math.floor((a[i] - x0) / (x1 - x0) * NB);
      const by = Math.floor(a[i+1] / y1 * NY);
      if (bx < 0 || bx >= NB || by < 0 || by >= NY) continue;
      const k = bx * NY + by, z = a[i+2];
      if (z > 0){ if (z < zPlus[k]) zPlus[k] = z; }
      else if (z > zMinus[k]) zMinus[k] = z;
    }
  }
  // fill gaps from the bin just below — walls run continuously up to the rim
  for (let bx = 0; bx < NB; bx++) for (let by = 1; by < NY; by++){
    if ((by + 0.5) / NY * y1 > rimTop) break;
    const k = bx * NY + by;
    if (!isFinite(zPlus[k])  && isFinite(zPlus[k-1]))  zPlus[k]  = zPlus[k-1];
    if (!isFinite(zMinus[k]) && isFinite(zMinus[k-1])) zMinus[k] = zMinus[k-1];
  }

  return {
    parts,
    vamp: { top: vamp, cover, x0, x1, bins: NB, z0, z1, zbins: NZ, zPlus, zMinus, y1, ybins: NY },
    metrics: {
      rimTop,                              // highest edge of the opening, above the footbed
      innerLen: 0.9625,                    // usable inside length, per unit shoe length
      innerWid: 0.818 * widthRatio,        // usable inside width, per unit shoe length
      collar: (collar - footbed) / L,      // heel collar height above the footbed
      soleTop: (soleTop - footbed) / L,    // top of the sole sidewall
      medialZ
    }
  };
}

export function createShoeMaterials(){
  const std = (o) => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, metalness: 0, ...o });
  return {
    upper:  new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, metalness: 0, roughness: 0.9 }),
    sole:   std({ roughness: 0.8 }),
    trim:   std({ roughness: 0.7 }),
    stitch: std({ roughness: 0.9 }),
    inner:  std({ roughness: 0.95 })
  };
}

export function createShoeInstance(tpl, mats){
  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  const soleGroup = new THREE.Group(), upperGroup = new THREE.Group();
  root.add(soleGroup, upperGroup);
  const soleMeshes = [];
  for (const p of tpl.parts){
    const m = new THREE.Mesh(p.geo, mats[p.role] || mats.upper);
    m.castShadow = true; m.receiveShadow = true;
    (SOLE_ROLES.has(p.role) ? soleGroup : upperGroup).add(m);
    if (p.role === 'sole') soleMeshes.push(m);
  }
  if (!soleMeshes.length) soleMeshes.push(...soleGroup.children);
  return { root, soleGroup, upperGroup, soleMeshes };
}

/* ------------------------------------------------------------
   Procedural textures
------------------------------------------------------------ */
const texCache = { pattern: null, patternKey: '', bumps: {} };
const WHITE = new THREE.Color('#ffffff');

function canvas(size){ const c = document.createElement('canvas'); c.width = c.height = size; return c; }

function patternTexture(kind, c1, c2, scale){
  const S = 1024, cv = canvas(S), g = cv.getContext('2d');
  g.fillStyle = c1; g.fillRect(0, 0, S, S);
  g.fillStyle = c2;
  if (kind === 'checker'){
    const N = Math.max(4, Math.round(24 * scale)), q = S / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) & 1) g.fillRect(x*q, y*q, q + 0.5, q + 0.5);
  } else if (kind === 'stripes'){
    const N = Math.max(4, Math.round(20 * scale)), q = S / N;
    for (let y = 0; y < N; y += 2) g.fillRect(0, y*q, S, q);
  } else if (kind === 'plaid'){
    const N = Math.max(3, Math.round(9 * scale)), q = S / N;
    g.globalAlpha = 0.5;
    for (let i = 0; i < N; i++){ g.fillRect(i*q, 0, q*0.42, S); g.fillRect(0, i*q, S, q*0.42); }
    g.globalAlpha = 0.85;
    for (let i = 0; i < N; i++){ g.fillRect(i*q + q*0.7, 0, q*0.06, S); g.fillRect(0, i*q + q*0.7, S, q*0.06); }
    g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function bumpTexture(kind){
  if (texCache.bumps[kind]) return texCache.bumps[kind];
  const S = 256, cv = canvas(S), g = cv.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  const rnd = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    let v;
    if (kind === 'weave'){
      // basket weave: alternating over/under threads
      const cx = Math.floor(x / 8), cy = Math.floor(y / 8);
      const u = (x % 8) / 8, w = (y % 8) / 8;
      v = ((cx + cy) & 1) ? 0.5 + 0.45 * Math.sin(u * Math.PI) : 0.5 + 0.45 * Math.sin(w * Math.PI);
      v += (rnd(x * 7 + y * 131) - 0.5) * 0.12;
    } else if (kind === 'fuzz'){
      v = 0.5 + (rnd(x * 3 + y * 977) - 0.5) * 0.9;
    } else {
      // pebbled leather grain
      const gx = Math.floor(x / 6), gy = Math.floor(y / 6);
      const px = (x % 6) - 3 + (rnd(gx * 17 + gy * 71) - 0.5) * 2, py = (y % 6) - 3 + (rnd(gx * 29 + gy * 13) - 0.5) * 2;
      v = 0.75 - Math.min(1, Math.hypot(px, py) / 3.2) * 0.5;
    }
    const k = (y * S + x) * 4, b = Math.max(0, Math.min(255, v * 255));
    d[k] = d[k+1] = d[k+2] = b; d[k+3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const rep = kind === 'weave' ? 36 : kind === 'fuzz' ? 20 : 26;
  t.repeat.set(rep, rep);
  texCache.bumps[kind] = t;
  return t;
}

export function applyShoeLook(mats, look){
  const up = mats.upper;
  const f = FINISH[look.finish] || FINISH.canvas;

  if (look.pattern && look.pattern !== 'solid'){
    const key = [look.pattern, look.upper, look.pattern2, look.patternScale].join('|');
    if (texCache.patternKey !== key){
      if (texCache.pattern) texCache.pattern.dispose();
      texCache.pattern = patternTexture(look.pattern, look.upper, look.pattern2, look.patternScale || 1);
      texCache.patternKey = key;
    }
    up.map = texCache.pattern;
    up.color.set('#ffffff');
  } else {
    up.map = null;
    up.color.set(look.upper);
  }
  up.roughness = f.roughness;
  up.sheen = f.sheen;
  up.sheenRoughness = f.sheenRoughness;
  // tint the sheen from the shoe's own colour so dark shoes stay dark
  up.sheenColor.set(look.upper).lerp(WHITE, look.finish === 'suede' ? 0.2 : 0.3);
  up.clearcoat = f.clearcoat;
  up.clearcoatRoughness = f.clearcoatRoughness;
  up.bumpMap = f.bump ? bumpTexture(f.bump) : null;
  up.bumpScale = f.bumpScale;
  up.needsUpdate = true;

  mats.sole.color.set(look.sole);
  mats.trim.color.set(look.trim);
  mats.stitch.color.set(look.stitch);
  mats.inner.color.set(look.inner);
  const glossy = look.finish === 'patent' || look.finish === 'leather';
  mats.sole.roughness = glossy ? 0.55 : 0.8;
  for (const k of ['sole','trim','stitch','inner']) mats[k].needsUpdate = true;
}

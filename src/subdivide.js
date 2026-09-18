// Curved-triangle (PN) subdivision.
// Each level splits every triangle into four. The new edge points are lifted onto the
// smooth surface implied by the vertex normals, so silhouettes round out without the
// shape shrinking (original vertices never move). Topology is built once; positions and
// normals are recomputed per update, which is cheap enough to run while dragging sliders.

function buildLevel(index, n){
  const map = new Map();
  const edges = [];
  const T = index.length / 3;
  const fine = new Uint32Array(T * 12);
  const edgeId = (a, b) => {
    const lo = a < b ? a : b, hi = a < b ? b : a;
    const key = lo * n + hi;
    let e = map.get(key);
    if (e === undefined){ e = edges.length / 2; edges.push(lo, hi); map.set(key, e); }
    return e;
  };
  for (let f = 0; f < T; f++){
    const a = index[f*3], b = index[f*3+1], c = index[f*3+2];
    const ab = n + edgeId(a, b), bc = n + edgeId(b, c), ca = n + edgeId(c, a);
    const o = f * 12;
    fine[o]   = a;  fine[o+1]  = ab; fine[o+2]  = ca;
    fine[o+3] = ab; fine[o+4]  = b;  fine[o+5]  = bc;
    fine[o+6] = ca; fine[o+7]  = bc; fine[o+8]  = c;
    fine[o+9] = ab; fine[o+10] = bc; fine[o+11] = ca;
  }
  const edgeCount = edges.length / 2;
  return { coarseCount: n, edgeCount, edges: Uint32Array.from(edges),
           fineIndex: fine, fineCount: n + edgeCount };
}

export function computeNormals(P, I, N){
  N.fill(0);
  for (let f = 0; f < I.length; f += 3){
    const a = I[f]*3, b = I[f+1]*3, c = I[f+2]*3;
    const e1x = P[b]-P[a], e1y = P[b+1]-P[a+1], e1z = P[b+2]-P[a+2];
    const e2x = P[c]-P[a], e2y = P[c+1]-P[a+1], e2z = P[c+2]-P[a+2];
    const nx = e1y*e2z - e1z*e2y, ny = e1z*e2x - e1x*e2z, nz = e1x*e2y - e1y*e2x;
    N[a]+=nx; N[a+1]+=ny; N[a+2]+=nz;
    N[b]+=nx; N[b+1]+=ny; N[b+2]+=nz;
    N[c]+=nx; N[c+1]+=ny; N[c+2]+=nz;
  }
  for (let i = 0; i < N.length; i += 3){
    const l = Math.hypot(N[i], N[i+1], N[i+2]) || 1;
    N[i] /= l; N[i+1] /= l; N[i+2] /= l;
  }
}

export class PNSubdivider {
  constructor(index, vertexCount, levels){
    this.baseIndex = index;
    this.baseCount = vertexCount;
    this.levels = [];
    let idx = index, n = vertexCount;
    for (let l = 0; l < levels; l++){
      const lvl = buildLevel(idx, n);
      this.levels.push(lvl);
      idx = lvl.fineIndex; n = lvl.fineCount;
    }
    this.fineIndex = idx;
    this.fineCount = n;
    this.baseNormals = new Float32Array(vertexCount * 3);
    this.pos = this.levels.map(l => new Float32Array(l.fineCount * 3));
    this.nor = this.levels.map(l => new Float32Array(l.fineCount * 3));
    this.outPos = this.pos.length ? this.pos[this.pos.length-1] : new Float32Array(vertexCount*3);
    this.outNor = this.nor.length ? this.nor[this.nor.length-1] : this.baseNormals;
  }

  // Carry a per-vertex scalar field to the finest level (edge points take the average).
  field(src){
    let f = src;
    for (const l of this.levels){
      const out = new Float32Array(l.fineCount);
      out.set(f);
      const e = l.edges;
      for (let k = 0; k < l.edgeCount; k++) out[l.coarseCount + k] = (f[e[2*k]] + f[e[2*k+1]]) * 0.5;
      f = out;
    }
    return f;
  }

  // Positions and normals for every level. Only the control mesh needs a face pass;
  // finer normals come from the PN quadratic normal at each edge midpoint.
  run(coarse, skipNormals){
    let P = coarse, N = this.baseNormals;
    if (!this.levels.length){
      // unsmoothed meshes may keep last frame's normals while the shape is being dragged
      if (!skipNormals) computeNormals(P, this.baseIndex, N);
      this.outPos.set(coarse);
      return;
    }
    computeNormals(P, this.baseIndex, N);
    for (let li = 0; li < this.levels.length; li++){
      const l = this.levels[li], out = this.pos[li], on = this.nor[li], e = l.edges, n = l.coarseCount;
      out.set(P.subarray(0, n * 3));
      on.set(N.subarray(0, n * 3));
      for (let k = 0; k < l.edgeCount; k++){
        const a = e[2*k]*3, b = e[2*k+1]*3;
        const hx = P[b]-P[a], hy = P[b+1]-P[a+1], hz = P[b+2]-P[a+2];
        const ax = N[a], ay = N[a+1], az = N[a+2], bx = N[b], by = N[b+1], bz = N[b+2];
        const wab = hx*ax + hy*ay + hz*az;          // (Pb-Pa)·Na
        const wba = -(hx*bx + hy*by + hz*bz);       // (Pa-Pb)·Nb
        const o = (n + k) * 3;
        out[o]   = (P[a]  +P[b])  *0.5 - (wab*ax + wba*bx)*0.125;
        out[o+1] = (P[a+1]+P[b+1])*0.5 - (wab*ay + wba*by)*0.125;
        out[o+2] = (P[a+2]+P[b+2])*0.5 - (wab*az + wba*bz)*0.125;

        // quadratic normal at the midpoint: ¼(Na + Nb + n110)
        const sx = ax+bx, sy = ay+by, sz = az+bz;
        const hh = hx*hx + hy*hy + hz*hz || 1e-12;
        const v = 2 * (hx*sx + hy*sy + hz*sz) / hh;
        let mx = sx - v*hx, my = sy - v*hy, mz = sz - v*hz;
        const ml = Math.sqrt(mx*mx + my*my + mz*mz) || 1;
        mx /= ml; my /= ml; mz /= ml;
        const rx = sx + mx, ry = sy + my, rz = sz + mz;   // the common ¼ cancels in normalization
        const rl = Math.sqrt(rx*rx + ry*ry + rz*rz) || 1;
        on[o] = rx/rl; on[o+1] = ry/rl; on[o+2] = rz/rl;
      }
      P = out; N = on;
    }
  }

  // Axis-aligned bounds of the finest positions, written into a THREE.Box3-like object.
  bounds(box){
    const p = this.outPos;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 3){
      const x = p[i], y = p[i+1], z = p[i+2];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    box.min.set(x0, y0, z0); box.max.set(x1, y1, z1);
    return box;
  }
}

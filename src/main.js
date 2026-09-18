import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PNSubdivider, computeNormals } from './subdivide.js';
import { buildShoeTemplate, createShoeMaterials, createShoeInstance, applyShoeLook,
         SHOE_STYLES, PATTERNS, FINISHES } from './shoes.js';
import { setupControlsLegend } from './legend.js';

/* ============================================================
   CONFIG
============================================================ */
const SHOE_MODEL = '/models/shoe.glb';
const RPM_SUBDOMAIN = 'demo';

// The bundled bodies. Each is normalized to its own standing height (metres).
const BODIES = {
  male:   { label:'Male',   url:'/models/human.glb',       height:1.80,
            credit:{ title:'Human', author:'aaron.kalvin',
              url:'https://sketchfab.com/3d-models/human-03a70758739544b3aa705c13af3872b1' } },
  female: { label:'Female', url:'/models/humanfemale.glb', height:1.68,
            credit:{ title:'Study Human Female Sculpt', author:'Uladzislau',
              url:'https://sketchfab.com/3d-models/study-human-female-sculpt-854fbf358991477aab518e07556da906' } }
};
const SHOE_CREDIT = { title:'Shoe', author:'abdullahyeahyea',
  url:'https://sketchfab.com/3d-models/shoe-d1ce9883180e41649ceb0253525f8a18' };
const EYE_COLORS = [['#5a3a22','Brown'],['#8a6230','Hazel'],['#4f7a4a','Green'],['#4a78b0','Blue'],
                    ['#7d8a94','Grey'],['#2a1c14','Dark brown']];

// Smoothing passes for the body mesh (each ×4 triangles): low-poly models get more.
const subdivLevelsFor = tris => tris<=30000 ? 2 : tris<=120000 ? 1 : 0;

/* ---------- Parameter definitions ---------- */
const PARAMS = {
  // Overall
  height:        {min:0.85, max:1.15, def:1.0, label:'Overall height', group:'Overall'},
  build:         {min:0.82, max:1.30, def:1.0, label:'Build (mass)',   group:'Overall'},
  // Head & neck
  headSize:      {min:0.85, max:1.20, def:1.0, label:'Head size',      group:'Head & Neck'},
  neckLength:    {min:0.70, max:1.40, def:1.0, label:'Neck length',    group:'Head & Neck'},
  neckThickness: {min:0.75, max:1.35, def:1.0, label:'Neck thickness', group:'Head & Neck'},
  // Torso
  torsoLength:   {min:0.88, max:1.16, def:1.0, label:'Torso length',   group:'Torso'},
  shoulderWidth: {min:0.85, max:1.28, def:1.0, label:'Shoulder width', group:'Torso'},
  shoulderSlope: {min:0.60, max:1.40, def:1.0, label:'Shoulder line',  group:'Torso',
                  fmt:v=> v<0.9?'Sloped' : v>1.1?'Squared' : 'Natural'},
  chestWidth:    {min:0.85, max:1.32, def:1.0, label:'Chest width',    group:'Torso'},
  chestDepth:    {min:0.85, max:1.35, def:1.0, label:'Chest (pecs)',   group:'Torso'},
  waistWidth:    {min:0.72, max:1.40, def:1.0, label:'Waist width',    group:'Torso'},
  belly:         {min:0.80, max:1.60, def:1.0, label:'Belly',          group:'Torso'},
  hipWidth:      {min:0.80, max:1.32, def:1.0, label:'Hip width',      group:'Torso'},
  glutes:        {min:0.80, max:1.45, def:1.0, label:'Glutes',         group:'Torso'},
  bodyDepth:     {min:0.80, max:1.32, def:1.0, label:'Body depth',     group:'Torso'},
  // Arms
  armLength:     {min:0.82, max:1.22, def:1.0, label:'Arm length',     group:'Arms'},
  armThickness:  {min:0.72, max:1.45, def:1.0, label:'Arm thickness',  group:'Arms'},
  upperArm:      {min:0.80, max:1.40, def:1.0, label:'Upper arm',      group:'Arms'},
  forearm:       {min:0.80, max:1.30, def:1.0, label:'Forearm',        group:'Arms'},
  handSize:      {min:0.75, max:1.35, def:1.0, label:'Hand size',      group:'Arms'},
  // Legs
  legLength:     {min:0.82, max:1.22, def:1.0, label:'Leg length',     group:'Legs'},
  legThickness:  {min:0.72, max:1.45, def:1.0, label:'Leg thickness',  group:'Legs'},
  thighs:        {min:0.80, max:1.40, def:1.0, label:'Thighs',         group:'Legs'},
  calves:        {min:0.80, max:1.40, def:1.0, label:'Calves',         group:'Legs'},
  footSize:      {min:0.78, max:1.35, def:1.0, label:'Foot size',      group:'Legs'}
};
const fmtParam=(k,v)=> PARAMS[k].fmt ? PARAMS[k].fmt(v) : Math.round(v*100)+'%';
const BODY_GROUPS = ['Overall','Head & Neck','Torso','Arms','Legs'];
// Subset that maps onto a real skeleton (Ready Player Me models)
const BONE_PARAMS = ['height','headSize','neckLength','torsoLength','shoulderWidth','chestWidth',
                     'armLength','armThickness','legLength','legThickness'];

const PRESETS_FEMALE = {
  'Athletic':  {build:1.02, shoulderWidth:1.06, shoulderSlope:1.02, chestWidth:1.04, chestDepth:1.02,
                waistWidth:0.92, belly:0.88, hipWidth:1.0, glutes:1.08, bodyDepth:1.02,
                armThickness:1.05, upperArm:1.04, legThickness:1.06, thighs:1.04, calves:1.06, legLength:1.03},
  'Slim':      {build:0.92, shoulderWidth:0.96, chestWidth:0.94, chestDepth:0.92, waistWidth:0.88,
                belly:0.86, hipWidth:0.94, glutes:0.92, bodyDepth:0.93, armThickness:0.88,
                legThickness:0.88, neckThickness:0.94, legLength:1.04, height:1.02},
  'Curvy':     {build:1.02, chestWidth:1.04, chestDepth:1.2, waistWidth:0.9, belly:0.95,
                hipWidth:1.14, glutes:1.22, thighs:1.03},
  'Plus-size': {build:1.13, chestWidth:1.12, chestDepth:1.2, waistWidth:1.22, belly:1.34, hipWidth:1.18,
                glutes:1.16, bodyDepth:1.14, armThickness:1.18, upperArm:1.06, legThickness:1.16,
                thighs:1.08, neckThickness:1.12, height:0.99},
  'Tall':      {height:1.1, legLength:1.08, torsoLength:1.03, armLength:1.04, build:0.97},
  'Petite':    {height:0.9, legLength:0.95, torsoLength:0.97, build:0.95, headSize:1.03,
                shoulderWidth:0.95, hipWidth:1.02, handSize:0.92, footSize:0.92}
};

// Labels that read better for one body type.
const LABEL_OVERRIDES = { female:{ chestDepth:'Bust' } };
const paramLabel = k => (LABEL_OVERRIDES[currentBody]||{})[k] || PARAMS[k].label;

const PRESETS_MALE = {
  'Athletic':  {build:1.04, shoulderWidth:1.12, shoulderSlope:1.04, chestWidth:1.10, chestDepth:1.10,
                waistWidth:0.93, belly:0.9, hipWidth:0.98, glutes:1.06, bodyDepth:1.04,
                armThickness:1.10, upperArm:1.06, legThickness:1.06, thighs:1.04, calves:1.06,
                neckThickness:1.08, legLength:1.03, height:1.02},
  'Slim':      {build:0.91, shoulderWidth:0.96, chestWidth:0.93, chestDepth:0.94, waistWidth:0.88,
                belly:0.86, hipWidth:0.94, glutes:0.92, bodyDepth:0.92, armThickness:0.86,
                legThickness:0.87, neckThickness:0.92, legLength:1.04, height:1.03},
  'Heavy-set': {build:1.12, shoulderWidth:1.04, shoulderSlope:0.9, chestWidth:1.12, chestDepth:1.08,
                waistWidth:1.24, belly:1.42, hipWidth:1.14, glutes:1.14, bodyDepth:1.16,
                armThickness:1.16, upperArm:1.06, legThickness:1.16, thighs:1.06,
                neckThickness:1.18, height:0.99},
  'Muscular':  {build:1.08, shoulderWidth:1.18, shoulderSlope:1.07, chestWidth:1.18, chestDepth:1.24,
                waistWidth:0.97, belly:0.92, hipWidth:1.0, glutes:1.1, bodyDepth:1.06,
                armThickness:1.22, upperArm:1.12, forearm:1.06, legThickness:1.14, thighs:1.08,
                calves:1.12, neckThickness:1.24},
  'Tall':      {height:1.11, legLength:1.08, torsoLength:1.04, armLength:1.05, build:0.97},
  'Petite':    {height:0.89, legLength:0.94, torsoLength:0.97, build:0.95, headSize:1.04,
                shoulderWidth:0.94, shoulderSlope:0.94, hipWidth:1.04, glutes:1.05,
                handSize:0.92, footSize:0.92}
};

/* ---------- Clothing definitions ---------- */
const CLOTHING = {
  shirt: { on:true, color:'#3f6fd8', fit:1.0, sleeve:0.45, length:0.75, neck:0.15 },
  pants: { on:true, color:'#2e3440', fit:1.0, length:1.0 },
  socks: { on:true, color:'#efece6', height:0.2 },
  shoes: { on:true, style:'Classic Black', ...SHOE_STYLES['Classic Black'],
           patternScale:1.0, platform:1.0, fit:1.0 }
};

const presetsFor = () => currentBody==='female' ? PRESETS_FEMALE : PRESETS_MALE;

const state = {
  params:{}, skinColor:'#c8a184', modelUrl:'', body:'male',
  bodyParams:{},          // each body type keeps its own shape
  eyeColor:'#5a3a22',
  clothing: JSON.parse(JSON.stringify(CLOTHING)),
  fabric: 0.78   // roughness: 0.3 satin .. 1.0 matte
};
const defaultParams = () => { const p={}; for(const k in PARAMS) p[k]=PARAMS[k].def; return p; };
state.params = defaultParams();
let currentBody = null;     // key into BODIES for the loaded model, or null for a custom one
let targetHeight = 1.8;

/* ============================================================
   SCENE
============================================================ */
const canvas = document.getElementById('scene');
const viewport = document.getElementById('viewport');

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(2.5, 4.5, 3.0);
key.castShadow = true;
key.shadow.mapSize.set(2048,2048);
key.shadow.camera.near=0.5; key.shadow.camera.far=20;
key.shadow.camera.left=-2; key.shadow.camera.right=2;
key.shadow.camera.top=3; key.shadow.camera.bottom=-1;
key.shadow.bias=-0.0004; key.shadow.normalBias=0.02;
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fc4ff, 0.85);
rim.position.set(-3,2.5,-3); scene.add(rim);

const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(40,40), new THREE.ShadowMaterial({opacity:0.3}));
shadowPlane.rotation.x=-Math.PI/2; shadowPlane.receiveShadow=true; scene.add(shadowPlane);
const grid = new THREE.GridHelper(14,28,0x2c3542,0x1a2029);
grid.material.transparent=true; grid.material.opacity=0.45; grid.position.y=0.001; scene.add(grid);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0.6,1.35,3.4);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping=true; controls.dampingFactor=0.08;
controls.target.set(0,0.95,0);
controls.minDistance=0.6; controls.maxDistance=9;
controls.maxPolarAngle=Math.PI*0.52; controls.screenSpacePanning=true;
let autoRotate=false;

/* ============================================================
   MODEL STATE
============================================================ */
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const avatarRoot = new THREE.Group();
scene.add(avatarRoot);

let currentModel=null, modelType=null, normScale=1, facing=0;

// skinned
let boneMap={}; const BONE_BASE=new Map(); let footBones=[], topBone=null;

// static mesh
let bodyMesh=null, bodyGeo=null, bodyMat=null, basePositions=null, bodyIndex=null;
let axes=null;      // {ui,wi,di,upMin,upMax,wCen,dCen,wHalf,H}
let seg=null;       // per-vertex segmentation arrays (control mesh)
let LM=null;        // landmarks (normalized heights) + body frame
let coarsePos=null; // deformed control-mesh positions
let sub=null;       // smoothing subdivider
let surf=null;      // clothing fields carried onto the smooth mesh
const garments={};

// shoes
let shoeTemplate=null, shoeInst=null;
const shoeMats=createShoeMaterials();
const footFit=[null,null];

/* ============================================================
   MATH HELPERS
============================================================ */
const clamp01=v=>v<0?0:v>1?1:v;
function smoothstep(e0,e1,x){ const t=clamp01((x-e0)/(e1-e0||1e-6)); return t*t*(3-2*t); }
function win(t,lo,hi,f){ return smoothstep(lo,lo+f,t)*(1-smoothstep(hi-f,hi,t)); }

/* ============================================================
   SEGMENTATION — builds a procedural "rig" from the mesh topology.
   Arms and legs are found as connected components of the mesh
   below a cut height (so every finger is classified exactly),
   then each part gets its own axis, pivot and blend weights.
============================================================ */
function buildSegmentation(){
  const b=basePositions, n=b.length/3;
  const {ui,wi,di,upMin,wCen,dCen,wHalf,H}=axes;
  const SL=120;
  const t=new Float32Array(n), ax=new Float32Array(n);
  const sliceOf=new Int32Array(n), side=new Uint8Array(n);
  const buckets=Array.from({length:SL},()=>[]);
  for(let i=0;i<n;i++){
    const tt=(b[i*3+ui]-upMin)/H; t[i]=tt;
    const s=Math.min(SL-1,Math.max(0,Math.floor(tt*SL)));
    sliceOf[i]=s; buckets[s].push(i);
    const dx=b[i*3+wi]-wCen;
    ax[i]=Math.abs(dx); side[i]=dx<0?0:1;
  }
  const clampS=s=>Math.min(SL-1,Math.max(0,s));

  /* ---- topology: weld by position, then union-find on a vertex subset ---- */
  const all=new Uint32Array(n); for(let i=0;i<n;i++) all[i]=i;
  const { ids:canon, count:nc }=positionIds(b, all, H*2e-5);
  const idx=bodyIndex, tri=idx.length/3, par=new Int32Array(nc);
  const find=a=>{ while(par[a]!==a){ par[a]=par[par[a]]; a=par[a]; } return a; };
  const unite=(p,q)=>{ p=find(p); q=find(q); if(p!==q) par[p]=q; };
  // per-triangle data, prepared once: welded corners and highest point
  const tc=new Int32Array(tri*3), triMax=new Float32Array(tri);
  for(let f=0;f<tri;f++){
    const A=idx[f*3], B=idx[f*3+1], C=idx[f*3+2];
    tc[f*3]=canon[A]; tc[f*3+1]=canon[B]; tc[f*3+2]=canon[C];
    triMax[f]=Math.max(t[A],t[B],t[C]);
  }
  let triArm=null, vertArm=null;
  // Connected pieces of the mesh below height T (optionally leaving the arms out).
  function components(T, noArm){
    for(let c=0;c<nc;c++) par[c]=c;
    for(let f=0;f<tri;f++){
      if(triMax[f]>=T || (noArm && triArm[f])) continue;
      unite(tc[f*3],tc[f*3+1]); unite(tc[f*3+1],tc[f*3+2]);
    }
    const st=new Map();
    for(let i=0;i<n;i++){
      if(t[i]>=T || (noArm && vertArm[i])) continue;
      const r=find(canon[i]);
      let s=st.get(r); if(!s){ s={r,cnt:0,sx:0,sa:0}; st.set(r,s); }
      s.cnt++; s.sx+=b[i*3+wi]-wCen; s.sa+=ax[i];
    }
    return [...st.values()].sort((p,q)=>q.cnt-p.cnt);
  }
  // Triangles bucketed by the height slice of their highest corner.
  const tStart=new Int32Array(SL+1), triSlice=new Int32Array(tri);
  for(let f=0;f<tri;f++){ const s=clampS(Math.floor(triMax[f]*SL)); triSlice[f]=s; tStart[s+1]++; }
  for(let s=0;s<SL;s++) tStart[s+1]+=tStart[s];
  const tOrder=new Int32Array(tri);
  { const fill=tStart.slice(0,SL); for(let f=0;f<tri;f++) tOrder[fill[triSlice[f]]++]=f; }
  const cCnt=new Float64Array(nc), cSx=new Float64Array(nc), cSa=new Float64Array(nc);

  // One upward sweep: add each slice's vertices and triangles, merging pieces as they join,
  // and ask test(cut, largePieces, keptCount) after every slice. Returns the highest cut
  // (in slices) where the test held, or -1.
  function sweep(noArm, test){
    for(let c=0;c<nc;c++){ par[c]=c; cCnt[c]=0; cSx[c]=0; cSa[c]=0; }
    const large=new Set(), LARGE=Math.max(8, n*0.002);
    const join=(p,q)=>{
      p=find(p); q=find(q); if(p===q) return;
      par[p]=q; cCnt[q]+=cCnt[p]; cSx[q]+=cSx[p]; cSa[q]+=cSa[p];
      large.delete(p); if(cCnt[q]>=LARGE) large.add(q);
    };
    let kept=0, best=-1;
    for(let s=0;s<SL;s++){
      for(const i of buckets[s]){
        if(noArm && vertArm[i]) continue;
        const r=find(canon[i]);
        cCnt[r]++; cSx[r]+=b[i*3+wi]-wCen; cSa[r]+=ax[i]; kept++;
        if(cCnt[r]>=LARGE) large.add(r);
      }
      for(let q=tStart[s];q<tStart[s+1];q++){
        const f=tOrder[q];
        if(noArm && triArm[f]) continue;
        join(tc[f*3],tc[f*3+1]); join(tc[f*3+1],tc[f*3+2]);
      }
      const roots=[...large].map(r=>({r,cnt:cCnt[r],sx:cSx[r],sa:cSa[r]})).sort((p,q)=>q.cnt-p.cnt);
      if(test(s+1,roots,kept)) best=s+1;
    }
    return best;
  }

  /* ---- ARMS: highest cut where two lateral components break away ---- */
  const armComp=new Uint8Array(n);        // 0 none, 1 left, 2 right
  const armPair=(s)=>{
    const cs=components(s/SL,false), best=[null,null];
    for(const c of cs){
      if(c.cnt<n*0.004 || c.sa/c.cnt<0.35*wHalf) continue;
      const sd=c.sx<0?0:1;
      if(!best[sd]||c.cnt>best[sd].cnt) best[sd]=c;
    }
    return best[0]&&best[1]&&best[0]!==best[1] ? best : null;
  };
  let hasArms=false, cutT=0.72;
  const aTop=Math.floor(0.88*SL), aBot=Math.floor(0.45*SL);
  const armS=sweep(false,(s,roots)=>{
    if(s<aBot||s>aTop) return false;
    const best=[null,null];
    for(const c of roots){
      if(c.cnt<n*0.004 || c.sa/c.cnt<0.35*wHalf) continue;
      const sd=c.sx<0?0:1;
      if(!best[sd]||c.cnt>best[sd].cnt) best[sd]=c;
    }
    return !!(best[0]&&best[1]&&best[0].r!==best[1].r);
  });
  if(armS>=0){
    const best=armPair(armS);             // re-run so the union-find holds this cut
    hasArms=true; cutT=armS/SL;
    for(let i=0;i<n;i++){
      if(t[i]>=cutT) continue;
      const r=find(canon[i]);
      if(r===best[0].r) armComp[i]=1; else if(r===best[1].r) armComp[i]=2;
    }
  }
  const cutS=clampS(Math.round(cutT*SL));

  // lateral boundary just below the cut (torso edge vs arm inner edge)
  let torsoEdge=0, armInner=Infinity;
  for(let s=Math.max(0,cutS-3); s<cutS; s++) for(const i of buckets[s]){
    if(armComp[i]) armInner=Math.min(armInner,ax[i]); else torsoEdge=Math.max(torsoEdge,ax[i]);
  }
  const bndCut=hasArms ? (isFinite(armInner)? (torsoEdge+armInner)/2 : torsoEdge*1.1) : Infinity;

  const armW=new Float32Array(n);
  if(hasArms){
    const f=Math.max(0.05*wHalf, Math.abs(armInner-torsoEdge)*0.45);
    for(let i=0;i<n;i++){
      if(t[i]<cutT) armW[i]=armComp[i]?1:0;
      else armW[i]=smoothstep(bndCut-f,bndCut+f,ax[i])*(1-smoothstep(cutT,cutT+0.055,t[i]));
    }
  }

  // arm axes per slice/side + extents (for wrist detection)
  const AX=[new Float64Array(SL),new Float64Array(SL)], AD=[new Float64Array(SL),new Float64Array(SL)];
  const AC=[new Float64Array(SL),new Float64Array(SL)];
  const EX=[[],[]];
  for(let sd=0;sd<2;sd++) for(let s=0;s<SL;s++) EX[sd][s]={x0:Infinity,x1:-Infinity,d0:Infinity,d1:-Infinity};
  let armBotT=1;
  for(let i=0;i<n;i++){
    if(!armComp[i]) continue;
    const sd=armComp[i]-1, s=sliceOf[i], x=b[i*3+wi], d=b[i*3+di];
    AX[sd][s]+=x; AD[sd][s]+=d; AC[sd][s]++;
    const e=EX[sd][s]; e.x0=Math.min(e.x0,x); e.x1=Math.max(e.x1,x); e.d0=Math.min(e.d0,d); e.d1=Math.max(e.d1,d);
    if(t[i]<armBotT) armBotT=t[i];
  }
  const topArmS=Math.max(0,cutS-1);
  for(let sd=0;sd<2;sd++){
    let lx=wCen+(sd?1:-1)*0.6*wHalf, ld=dCen, found=false;
    for(let s=topArmS; s>=0; s--){
      if(AC[sd][s]>0){ lx=AX[sd][s]/AC[sd][s]; ld=AD[sd][s]/AC[sd][s]; found=true; }
      else if(!found){ /* keep default until first data */ }
      AX[sd][s]=lx; AD[sd][s]=ld;
    }
    // above the cut, the axis stays at the shoulder value
    let tx=AX[sd][topArmS], td=AD[sd][topArmS];
    for(let s=topArmS+1;s<SL;s++){ AX[sd][s]=tx; AD[sd][s]=td; }
    // light smoothing so the axis is a clean curve
    const sx=AX[sd].slice(), sdd=AD[sd].slice();
    for(let s=0;s<SL;s++){ let a=0,c=0,e=0; for(let k=-2;k<=2;k++){ const j=s+k; if(j>=0&&j<SL){ a+=sx[j]; e+=sdd[j]; c++; } } AX[sd][s]=a/c; AD[sd][s]=e/c; }
  }

  // wrist = narrowest arm cross-section in the lower part of the arm
  let wristT = armBotT + 0.27*(cutT-armBotT);
  if(hasArms){
    const s0=Math.floor(armBotT*SL), s1=topArmS, span=s1-s0;
    let bestE=Infinity;
    for(let s=Math.ceil(s0+0.16*span); s<=Math.floor(s0+0.48*span); s++){
      let e=0, ok=0;
      for(let sd=0;sd<2;sd++){ const E=EX[sd][s]; if(isFinite(E.x0)){ e+=(E.x1-E.x0)+(E.d1-E.d0); ok++; } }
      if(ok===2 && e<bestE){ bestE=e; wristT=(s+0.5)/SL; }
    }
  }
  const pivotT=cutT+0.02;
  const wristS=clampS(Math.floor(wristT*SL));

  /* ---- LEGS: highest cut where the lower body splits into two legs ---- */
  const legComp=new Uint8Array(n);
  vertArm=new Uint8Array(n);
  for(let i=0;i<n;i++) vertArm[i]=armW[i]>=0.5?1:0;
  triArm=new Uint8Array(tri);
  for(let f=0;f<tri;f++) triArm[f]=(vertArm[idx[f*3]]|vertArm[idx[f*3+1]]|vertArm[idx[f*3+2]]);
  const legPair=(s)=>{
    const cs=components(s/SL,true);
    if(cs.length<2) return null;
    const kept=cs.reduce((a,c)=>a+c.cnt,0), A=cs[0], B=cs[1];
    return B.cnt>0.12*kept && Math.sign(A.sx)!==Math.sign(B.sx) ? [A,B] : null;
  };
  let crotchT=0.46, hasLegs=false;
  const lTop=Math.floor(0.62*SL), lBot=Math.floor(0.2*SL);
  const legS=sweep(true,(s,roots,kept)=>{
    if(s<lBot||s>lTop||roots.length<2) return false;
    const A=roots[0], B=roots[1];
    return B.cnt>0.12*kept && Math.sign(A.sx)!==Math.sign(B.sx);
  });
  if(legS>=0){
    const [A,B]=legPair(legS);
    crotchT=legS/SL; hasLegs=true;
    for(let i=0;i<n;i++){
      if(t[i]>=crotchT||vertArm[i]) continue;
      const r=find(canon[i]);
      if(r===A.r) legComp[i]=A.sx<0?1:2; else if(r===B.r) legComp[i]=B.sx<0?1:2;
    }
  }
  const crotchS=clampS(Math.round(crotchT*SL));
  const LX=[new Float64Array(SL),new Float64Array(SL)], LD=[new Float64Array(SL),new Float64Array(SL)];
  const LC=[new Float64Array(SL),new Float64Array(SL)];
  for(let i=0;i<n;i++){
    if(!legComp[i]) continue;
    const sd=legComp[i]-1, s=sliceOf[i];
    LX[sd][s]+=b[i*3+wi]; LD[sd][s]+=b[i*3+di]; LC[sd][s]++;
  }
  for(let sd=0;sd<2;sd++){
    let lx=wCen+(sd?1:-1)*0.14*wHalf, ld=dCen;
    // find first data from the top so the carry starts sensibly
    for(let s=crotchS-1;s>=0;s--) if(LC[sd][s]>0){ lx=LX[sd][s]/LC[sd][s]; ld=LD[sd][s]/LC[sd][s]; break; }
    const topX=lx, topD=ld;
    for(let s=crotchS-1;s>=0;s--){
      if(LC[sd][s]>0){ lx=LX[sd][s]/LC[sd][s]; ld=LD[sd][s]/LC[sd][s]; }
      LX[sd][s]=lx; LD[sd][s]=ld;
    }
    for(let s=Math.max(0,crotchS);s<SL;s++){ LX[sd][s]=topX; LD[sd][s]=topD; }
  }

  /* ---- feet: depth bulge near the floor ---- */
  let footTopT=0.055, maxDepth=0, maxS=0;
  const dExt=new Float64Array(SL);
  const lim=Math.floor(0.2*SL);
  for(let s=0;s<lim;s++){
    let lo=Infinity,hi=-Infinity;
    for(const i of buckets[s]){ if(armW[i]>0.5) continue; const d=b[i*3+di]; if(d<lo)lo=d; if(d>hi)hi=d; }
    dExt[s]=isFinite(lo)?hi-lo:0;
    if(dExt[s]>maxDepth){ maxDepth=dExt[s]; maxS=s; }
  }
  for(let s=maxS;s<lim;s++) if(dExt[s]<0.6*maxDepth){ footTopT=s/SL; break; }
  footTopT=Math.min(Math.max(footTopT,0.02),0.12);

  /* ---- torso radius profile (for rigid-beyond-radius shoulder handling) ---- */
  const Rc=new Float64Array(SL), allMax=new Float64Array(SL);
  for(let i=0;i<n;i++){
    const s=sliceOf[i];
    if(ax[i]>allMax[s]) allMax[s]=ax[i];
    if(armComp[i]) continue;
    if(ax[i]>Rc[s]) Rc[s]=ax[i];
  }
  const Rcap = hasArms ? Math.max(Rc[topArmS], 1e-6) : Infinity;
  for(let s=0;s<SL;s++){ if(s>=cutS) Rc[s]=Math.min(Rc[s]||Rcap, Rcap); }
  let carry=Rc[0]||wHalf*0.3; for(let s=0;s<SL;s++){ if(Rc[s]>0) carry=Rc[s]; else Rc[s]=carry; }
  const Rs=Rc.slice();
  for(let s=0;s<SL;s++){ let a=0,c=0; for(let k=-2;k<=2;k++){ const j=s+k; if(j>=0&&j<SL){ a+=Rs[j]; c++; } } Rc[s]=a/c; }
  // original clearance between the body's outer edge and the inner edge of the arm, per slice
  const bodyHalf=new Float64Array(SL), armInnerS=new Float64Array(SL).fill(Infinity);
  for(let i=0;i<n;i++){
    const s=sliceOf[i];
    if(armComp[i]){ if(ax[i]<armInnerS[s]) armInnerS[s]=ax[i]; }
    else if(armW[i]<0.5 && ax[i]>bodyHalf[s]) bodyHalf[s]=ax[i];
  }
  const gapS=new Float64Array(SL);
  for(let s=0;s<SL;s++) gapS[s]=isFinite(armInnerS[s]) ? Math.max(0,armInnerS[s]-bodyHalf[s]) : Infinity;
  const handS0=clampS(Math.floor(armBotT*SL)), handS1=clampS(Math.ceil(wristT*SL));

  const nT=0.815, hT=0.865;
  let Rsh=0;
  for(let s=cutS; s<Math.floor(nT*SL); s++) Rsh=Math.max(Rsh,allMax[s]);
  if(!Rsh) Rsh=Rcap;

  /* ---- smooth girth control points along the torso ---- */
  const cT=crotchT;
  const ctrlT=[0, cT, cT+0.12, cutT-0.035, nT-0.008, (nT+hT)/2, hT+0.02, 1.3];
  for(let k=1;k<ctrlT.length;k++) ctrlT[k]=Math.max(ctrlT[k], ctrlT[k-1]+0.012);

  LM={ crotchT, cutT, armTopT:cutT+0.03, armBotT, pivotT, handTopT:wristT, footTopT,
       hasArms, hasLegs, neckBottomT:nT, headBottomT:hT, Rcap, Rsh, ctrlT,
       SL, bodyHalf, gapS, handS0, handS1,
       pivotAx:[AX[0][topArmS],AX[1][topArmS]], pivotAxD:[AD[0][topArmS],AD[1][topArmS]],
       wristAx:[AX[0][wristS],AX[1][wristS]],   wristAxD:[AD[0][wristS],AD[1][wristS]] };

  /* ---- per-vertex precomputed weights / axes ---- */
  const F=()=>new Float32Array(n);
  const segK=new Uint8Array(n), segA=F(), wBuild=F(), wTorsoD=F(), shBand=F(), latW=F(), Rt=F(),
        legW=F(), spreadT=F(), footW=F(), laW=F(), laD=F(), armAxW=F(), armAxD=F(), handW=F();
  for(let i=0;i<n;i++){
    const tt=t[i], s=sliceOf[i], sd=side[i];
    let k=0; while(k<ctrlT.length-2 && tt>ctrlT[k+1]) k++;
    segK[i]=k; segA[i]=smoothstep(ctrlT[k],ctrlT[k+1],tt);
    wBuild[i]=1-smoothstep(nT+0.01,hT+0.01,tt);
    wTorsoD[i]=1-smoothstep(nT-0.01,nT+0.03,tt);
    shBand[i]=smoothstep(cutT-0.09,cutT-0.01,tt)*(1-smoothstep(nT-0.005,nT+0.035,tt));
    latW[i]=smoothstep(0.30*Rsh,0.85*Rsh,ax[i]);
    Rt[i]=Rc[s];
    legW[i]=1-smoothstep(cT-0.05,cT+0.04,tt);
    spreadT[i]=smoothstep(footTopT,cT,tt);
    footW[i]=1-smoothstep(footTopT-0.008,footTopT+0.035,tt);
    handW[i]=1-smoothstep(wristT-0.01,wristT+0.018,tt);
    armAxW[i]=AX[armComp[i]?armComp[i]-1:sd][s];
    armAxD[i]=AD[armComp[i]?armComp[i]-1:sd][s];

    // leg axis: component axis deep in the leg, a centre-continuous profile near the crotch
    const A=LX[sd][s], Ad=LD[sd][s];
    const reach=Math.max(Math.abs(A-wCen),1e-6);
    const prof=smoothstep(0,reach,ax[i]);
    const pW=wCen+(A-wCen)*prof, pD=dCen+(Ad-dCen)*prof;
    if(legComp[i]){
      const ls=legComp[i]-1;
      const fW=LX[ls][s], fD=LD[ls][s];
      const h=smoothstep(cT-0.08,cT,tt);
      laW[i]=fW+(pW-fW)*h; laD[i]=fD+(pD-fD)*h;
    } else { laW[i]=pW; laD[i]=pD; }
  }

  /* ---- which way the body faces: the feet reach forward from the ankles ---- */
  let footD=0, footC=0, ankD=0, ankC=0;
  for(let i=0;i<n;i++){
    if(armW[i]>=0.5) continue;
    if(t[i]<footTopT*0.5){ footD+=b[i*3+di]; footC++; }
    else if(t[i]>footTopT && t[i]<footTopT+0.03){ ankD+=b[i*3+di]; ankC++; }
  }
  let frontSign;
  if(footC && ankC && Math.abs(footD/footC-ankD/ankC)>1e-6) frontSign=(footD/footC>ankD/ankC)?1:-1;
  else {                                        // fallback: the face side carries more detail
    let fwd=0, bwd=0;
    for(let i=0;i<n;i++){ if(t[i]<hT) continue; if(b[i*3+di]>dCen) fwd++; else bwd++; }
    frontSign=fwd>=bwd?1:-1;
  }

  /* ---- per-height depth centre of the trunk (so depth changes don't shift the body) ---- */
  const dLo=new Float64Array(SL).fill(Infinity), dHi=new Float64Array(SL).fill(-Infinity);
  for(let i=0;i<n;i++){
    if(armW[i]>=0.5) continue;
    const s=sliceOf[i], d=b[i*3+di];
    if(d<dLo[s]) dLo[s]=d; if(d>dHi[s]) dHi[s]=d;
  }
  const dMidS=new Float64Array(SL), dHalfS=new Float64Array(SL);
  let lastMid=dCen, lastHalf=0.2*wHalf;
  for(let s=0;s<SL;s++){
    if(isFinite(dLo[s])){ lastMid=(dLo[s]+dHi[s])/2; lastHalf=Math.max((dHi[s]-dLo[s])/2,1e-4); }
    dMidS[s]=lastMid; dHalfS[s]=lastHalf;
  }
  // the feet stick forward, so use the ankle's centre for everything below it
  const ankleS=clampS(Math.round((footTopT+0.02)*SL));
  for(let s=0;s<ankleS;s++){ dMidS[s]=dMidS[ankleS]; dHalfS[s]=dHalfS[ankleS]; }
  for(const A of [dMidS,dHalfS]){
    const src=A.slice();
    for(let s=0;s<SL;s++){ let a=0,c=0; for(let k=-3;k<=3;k++){ const j=s+k; if(j>=0&&j<SL){ a+=src[j]; c++; } } A[s]=a/c; }
  }

  /* ---- clothing + muscle fields ---- */
  const kneeT=footTopT+0.52*(cT-footTopT);
  const armParam=F(), front=F(), back=F(), dMid=F(),
        wFore=F(), wCalf=F(), wBelly=F(), wPec=F(), wGlute=F();
  const pU=upMin+pivotT*H, wU=upMin+wristT*H;
  for(let i=0;i<n;i++){
    const tt=t[i], s=sliceOf[i];
    const sd=armComp[i]?armComp[i]-1:side[i];
    const px=LM.pivotAx[sd], pd=LM.pivotAxD[sd];
    const dx=LM.wristAx[sd]-px, du=wU-pU, dd=LM.wristAxD[sd]-pd;
    const L2=(dx*dx+du*du+dd*dd)||1;
    armParam[i]=((b[i*3+wi]-px)*dx+(b[i*3+ui]-pU)*du+(b[i*3+di]-pd)*dd)/L2;

    dMid[i]=dMidS[s];
    const rel=(b[i*3+di]-dMidS[s])/dHalfS[s];          // -1 back … +1 front
    front[i]=smoothstep(0.05,0.75, frontSign*rel);
    back[i] =smoothstep(0.05,0.75,-frontSign*rel);

    wFore[i] =smoothstep(0.38,0.62,armParam[i]);
    wCalf[i] =1-smoothstep(kneeT-0.02,kneeT+0.05,tt);
    wBelly[i]=win(tt,cT+0.02,cT+0.23,0.07);
    wPec[i]  =win(tt,cutT-0.10,cutT+0.035,0.045);
    wGlute[i]=win(tt,cT-0.09,cT+0.09,0.06);
  }

  /* ---- foot vertices per side (for fitting shoes) ---- */
  const footCore=[[],[]], footZone=[[],[]];
  for(let i=0;i<n;i++){
    if(armW[i]>=0.5) continue;
    const sd=legComp[i]?legComp[i]-1:side[i];
    if(t[i]<footTopT) footCore[sd].push(i);
    if(t[i]<Math.min(cT-0.06, footTopT+0.13)) footZone[sd].push(i);
  }

  /* ---- which way each foot points (feet usually turn out a little) ---- */
  const footAxis=[0,1].map(sd=>{
    let mw=0, md=0, c=0;
    const pts=[];
    for(const i of footZone[sd]){
      if(t[i]>=footTopT*0.35) continue;
      const w=b[i*3+wi], d=b[i*3+di];
      pts.push(w,d); mw+=w; md+=d; c++;
    }
    if(c<8) return {aw:0, ad:frontSign};
    mw/=c; md/=c;
    let cww=0, cwd=0, cdd=0;
    for(let k=0;k<pts.length;k+=2){ const w=pts[k]-mw, d=pts[k+1]-md; cww+=w*w; cwd+=w*d; cdd+=d*d; }
    const phi=0.5*Math.atan2(2*cwd, cww-cdd);
    let aw=Math.cos(phi), ad=Math.sin(phi);
    if(Math.abs(ad)<0.8) return {aw:0, ad:frontSign};     // not clearly a long foot: face forward
    if(ad*frontSign<0){ aw=-aw; ad=-ad; }
    return {aw, ad};
  });

  /* ---- body frame in the mesh's local space ---- */
  const unit=k=>{ const v=[0,0,0]; v[k]=1; return v; };
  const eU=unit(ui), eD=unit(di);
  const fv=eD.map(v=>v*frontSign);
  const rv=[fv[1]*eU[2]-fv[2]*eU[1], fv[2]*eU[0]-fv[0]*eU[2], fv[0]*eU[1]-fv[1]*eU[0]];
  LM.frame={ f:fv, eU, r:rv, frontSign, rightSign:Math.sign(rv[wi])||1 };
  LM.kneeT=kneeT;
  LM.footAxis=footAxis;

  seg={t,ax,side,sliceOf,armW,handW,segK,segA,wBuild,wTorsoD,shBand,latW,Rt,armParam,front,back,dMid,
       wFore,wCalf,wBelly,wPec,wGlute,legW,spreadT,footW,laW,laD,armAxW,armAxD,
       footCore:footCore.map(a=>Uint32Array.from(a)), footZone:footZone.map(a=>Uint32Array.from(a))};
}

/* ============================================================
   DEFORMATION
============================================================ */
const scratch={};
function applyMeshMorphs(quick){
  const P=state.params, S=seg;
  const b=basePositions, arr=coarsePos;
  const {ui,wi,di,upMin,wCen,dCen,H}=axes;
  const n=b.length/3;

  const footTopU=upMin+LM.footTopT*H, crotchU=upMin+LM.crotchT*H,
        neckBotU=upMin+LM.neckBottomT*H, headBotU=upMin+LM.headBottomT*H,
        pivotU=upMin+LM.pivotT*H, wristU=upMin+LM.handTopT*H;
  const sLeg=P.legLength, sTor=P.torsoLength, sNeck=P.neckLength, sHead=P.headSize;

  // vertical chain: feet rigid -> legs -> torso -> neck -> head
  function mapUp(u){
    if(u<=footTopU) return u;
    let out=footTopU+(Math.min(u,crotchU)-footTopU)*sLeg;
    if(u<=crotchU) return out;
    out+=(Math.min(u,neckBotU)-crotchU)*sTor;
    if(u<=neckBotU) return out;
    out+=(Math.min(u,headBotU)-neckBotU)*sNeck;
    if(u<=headBotU) return out;
    return out+(u-headBotU)*sHead;
  }

  // girth control values: [floor, hip, waist, chest, shoulder, neck, head, top]
  const gW=[P.hipWidth,P.hipWidth,P.waistWidth,P.chestWidth,P.chestWidth,P.neckThickness,sHead,sHead];
  const gD=[1+(P.hipWidth-1)*0.5, 1+(P.hipWidth-1)*0.5, 1+(P.waistWidth-1)*0.9,
            1+(P.chestWidth-1)*0.7, 1+(P.chestWidth-1)*0.7, P.neckThickness, sHead, sHead];

  // arms ride on the torso: rigid lateral shift = torso growth at the armpit + shoulder width
  const ct=LM.ctrlT; let k0=0; while(k0<ct.length-2 && LM.cutT>ct[k0+1]) k0++;
  const aK=smoothstep(ct[k0],ct[k0+1],LM.cutT);
  const gAp=(gW[k0]+(gW[k0+1]-gW[k0])*aK)*P.build;
  const shift=LM.Rsh*(P.shoulderWidth-1);
  const armDisp=(isFinite(LM.Rcap)?LM.Rcap*(gAp-1):0)+shift;
  const slopeLift=(P.shoulderSlope-1)*H*0.045;         // raise / drop the shoulder line

  const L=P.armLength, HS=P.handSize;
  const armBase=P.armThickness*P.build;
  const pivotMapped=mapUp(pivotU);
  const wristMapped=pivotMapped-(pivotU-wristU)*L;
  const ltBase=P.legThickness*P.build;
  const hipSpread=(P.hipWidth-1)+(ltBase*0.5*(P.thighs+1)-1)*0.35;   // thicker thighs widen the stance

  const SLn=LM.SL||1;
  if(!scratch.newHalf || scratch.newHalf.length!==SLn){
    scratch.newHalf=new Float64Array(SLn); scratch.pushRaw=new Float64Array(SLn);
    scratch.pushSm=new Float64Array(SLn);  scratch.armDispS=new Float64Array(SLn);
  }
  const {newHalf,pushRaw,pushSm,armDispS}=scratch;
  newHalf.fill(0);

  // hot loop: read the per-vertex arrays and slider values through locals
  const p_build=P.build, p_belly=P.belly, p_chestDepth=P.chestDepth, p_glutes=P.glutes, p_bodyDepth=P.bodyDepth, p_thighs=P.thighs, p_calves=P.calves, p_footSize=P.footSize, p_height=P.height;
  const A_side=S.side, A_armW=S.armW, A_handW=S.handW, A_latW=S.latW, A_shBand=S.shBand, A_legW=S.legW, A_front=S.front, A_back=S.back, A_segK=S.segK, A_segA=S.segA, A_wBuild=S.wBuild, A_wTorsoD=S.wTorsoD, A_wBelly=S.wBelly, A_wPec=S.wPec, A_wGlute=S.wGlute, A_ax=S.ax, A_Rt=S.Rt, A_dMid=S.dMid, A_laW=S.laW, A_laD=S.laD, A_spreadT=S.spreadT, A_wCalf=S.wCalf, A_footW=S.footW, A_sliceOf=S.sliceOf;
  for(let i=0;i<n;i++){
    const o=i*3;
    const u=b[o+ui], x=b[o+wi], y=b[o+di];
    const sgn=A_side[i]?1:-1;
    const aw=A_armW[i], hw=A_handW[i];

    /* ---- vertical ---- */
    let U=mapUp(u);
    if(aw>0){
      const uArm=pivotMapped-(pivotU-u)*L;
      const uHand=wristMapped-(wristU-u)*HS;
      const uA=uArm+(uHand-uArm)*hw;
      U+=(uA-U)*aw;
    }
    // shoulder line: the shoulder tops and the whole arm move together
    U+=slopeLift*(A_latW[i]*A_shBand[i]*(1-aw)+aw);
    U=upMin+(U-upMin)*p_height;

    const lw=A_legW[i], fr=A_front[i], bk=A_back[i];
    let xT=0, yT=0, xL=0, yL=0;

    /* ---- torso: smooth girth profile, rigid beyond the torso radius ---- */
    if(lw<1){
      const k=A_segK[i], a=A_segA[i];
      const bw=1+(p_build-1)*A_wBuild[i];
      let gw=(gW[k]+(gW[k+1]-gW[k])*a)*bw;
      let gd=(gD[k]+(gD[k+1]-gD[k])*a)*bw*(1+(p_bodyDepth-1)*A_wTorsoD[i]);
      gw*=1+(p_belly-1)*0.3*A_wBelly[i];
      gd*=1+(p_belly-1)*A_wBelly[i]*fr
           +(p_chestDepth-1)*A_wPec[i]*fr
           +(p_glutes-1)*A_wGlute[i]*bk;
      const r=A_ax[i], R=A_Rt[i];
      xT = r<=R ? wCen+(x-wCen)*gw : wCen+sgn*(R*gw+(r-R));
      xT+=sgn*shift*A_latW[i]*A_shBand[i];
      const dm=A_dMid[i];
      yT=dm+(y-dm)*gd;
    }

    /* ---- legs: about each leg's own axis, thighs / calves separately ---- */
    if(lw>0){
      const la=A_laW[i], lad=A_laD[i];
      const spread=1+hipSpread*A_spreadT[i];
      const wc=A_wCalf[i];
      const legGirth=ltBase*(p_thighs+(p_calves-p_thighs)*wc);
      const inner=(x-la)*(la-wCen)<0;
      const legT=inner?1+(legGirth-1)*0.55:legGirth;             // thighs grow less inward
      const fw=A_footW[i];
      const thick=legT+(p_footSize-legT)*fw;
      xL=wCen+(la-wCen)*spread+(x-la)*thick;
      // calves and glutes push out mostly at the back
      const depthExtra=1+(p_calves-1)*0.6*wc*bk*(1-fw)+(p_glutes-1)*A_wGlute[i]*bk;
      yL=lad+(y-lad)*thick*depthExtra;
    }
    const X= lw<=0 ? xT : lw>=1 ? xL : xT+(xL-xT)*lw;
    const Y= lw<=0 ? yT : lw>=1 ? yL : yT+(yL-yT)*lw;

    arr[o+ui]=U; arr[o+wi]=X; arr[o+di]=Y;
    if(aw<0.5){
      const s=A_sliceOf[i], hx=Math.abs(X-wCen);
      if(hx>newHalf[s]) newHalf[s]=hx;
    }
  }
  /* ---- pass 2: arms, pushed out wherever the body grew into their space ---- */
  if(LM.hasArms){
    const SL=LM.SL;
    for(let s=0;s<SL;s++){
      const growth=newHalf[s]-LM.bodyHalf[s];
      const need=isFinite(LM.gapS[s]) ? growth-0.5*LM.gapS[s] : 0;
      pushRaw[s]=Math.max(0,need);
    }
    for(let pass=0;pass<2;pass++){               // smooth so the arm bends gently
      for(let s=0;s<SL;s++){
        let a=0,c=0; for(let k=-3;k<=3;k++){ const j=s+k; if(j>=0&&j<SL){ a+=pushRaw[j]; c++; } }
        pushSm[s]=a/c;
      }
      pushRaw.set(pushSm);
    }
    const base=Math.max(armDisp,0);
    let handDisp=-Infinity;
    for(let s=0;s<SL;s++){
      armDispS[s]=armDisp+Math.max(0,pushRaw[s]-base);
      if(s>=LM.handS0&&s<=LM.handS1&&armDispS[s]>handDisp) handDisp=armDispS[s];
    }
    if(!isFinite(handDisp)) handDisp=armDisp;

    for(let i=0;i<n;i++){
      const aw=S.armW[i]; if(aw<=0) continue;
      const o=i*3, x=b[o+wi], y=b[o+di], hw=S.handW[i];
      const sd=S.side[i], sgn=sd?1:-1;
      const disp=armDispS[S.sliceOf[i]];
      const AT=armBase*(P.upperArm+(P.forearm-P.upperArm)*S.wFore[i]);
      const pA=LM.pivotAx[sd], pD=LM.pivotAxD[sd];
      const aa=S.armAxW[i], aad=S.armAxD[i];
      const xA=pA+(aa-pA)*L+sgn*disp+(x-aa)*AT;
      const yA=pD+(aad-pD)*L+(y-aad)*AT;
      const wA=LM.wristAx[sd], wD=LM.wristAxD[sd];
      const xH=pA+(wA-pA)*L+sgn*handDisp+(x-wA)*HS;   // hand moves as one piece
      const yH=pD+(wD-pD)*L+(y-wD)*HS;
      const xa=xA+(xH-xA)*hw, ya=yA+(yH-yA)*hw;
      arr[o+wi]+=(xa-arr[o+wi])*aw;
      arr[o+di]+=(ya-arr[o+di])*aw;
    }
  }

  /* ---- taller bodies are also proportionally broader ---- */
  const hs=1+(P.height-1)*0.65;
  if(hs!==1){
    for(let i=0;i<n;i++){
      const o=i*3;
      arr[o+wi]=wCen+(arr[o+wi]-wCen)*hs;
      arr[o+di]=dCen+(arr[o+di]-dCen)*hs;
    }
  }
  /* ---- shoes: fit to the feet, then tuck the feet inside ---- */
  fitShoes(arr);
  if(shoesVisible()) tuckFeet(arr);
  updateEyes(arr);
  /* ---- smooth the control mesh onto the display mesh ---- */
  // on dense bodies, lighting normals wait until the shape settles (see settleBody)
  const skipNormals=!!quick && heavyBody;
  sub.run(arr, skipNormals);
  if(skipNormals) normalsStale=true;
  bodyGeo.attributes.position.needsUpdate=true;
  bodyGeo.attributes.normal.needsUpdate=true;
  updateBodyBounds();
  if(bodyMat) bodyMat.color.set(state.skinColor);
  updateGarments();
  plantAndMeasure();
}

/* ============================================================
   SHOES — the loaded shoe model is fitted to each foot
============================================================ */
// Bounds of the display mesh — a direct min/max pass; three's generic version is slow at this size.
function updateBodyBounds(){
  if(!bodyGeo.boundingBox) bodyGeo.boundingBox=new THREE.Box3();
  if(!bodyGeo.boundingSphere) bodyGeo.boundingSphere=new THREE.Sphere();
  sub.bounds(bodyGeo.boundingBox);
  bodyGeo.boundingBox.getBoundingSphere(bodyGeo.boundingSphere);
}

// Coalesce rapid slider input into one body update per frame.
// A timer backs up the frame callback, which browsers can hold back while the page is hidden.
let morphQueued=false;
function scheduleMorph(){
  if(morphQueued) return;
  morphQueued=true;
  const run=()=>{ if(!morphQueued) return; morphQueued=false; applyMorphs(true); };
  requestAnimationFrame(run);
  setTimeout(run,50);
}

function shoesVisible(){ return !!(shoeInst && state.clothing.shoes.on && modelType==='static'); }

function attachShoes(){
  if(!shoeTemplate || modelType!=='static' || !bodyMesh || shoeInst) return;
  shoeInst=[createShoeInstance(shoeTemplate,shoeMats), createShoeInstance(shoeTemplate,shoeMats)];
  shoeInst.forEach(s=>bodyMesh.add(s.root));
  applyShoeLook(shoeMats, state.clothing.shoes);
  rebuildGarment('pants');
  applyMorphs();
  buildUI();
}

const _m4=new THREE.Matrix4();
function fitShoes(Pc){
  footFit[0]=footFit[1]=null;
  if(!shoeInst) return;
  const on=shoesVisible();
  shoeInst.forEach(s=>{ s.root.visible=on; });
  if(!on) return;
  const {ui,wi,di}=axes, F=LM.frame, tm=shoeTemplate.metrics, C=state.clothing.shoes;
  for(let sd=0;sd<2;sd++){
    const list=seg.footCore[sd]; if(!list.length) continue;
    // foot frame: along the foot (fa) and across it (ra), in the ground plane
    const {aw,ad}=LM.footAxis[sd];
    const ra_w=ad*F.r[wi]*F.frontSign, ra_d=-aw*F.r[wi]*F.frontSign;   // fa rotated like f→r
    let a0=Infinity,a1=-Infinity,c0=Infinity,c1=-Infinity,u0=Infinity;
    for(let k=0;k<list.length;k++){
      const o=list[k]*3, w=Pc[o+wi], d=Pc[o+di], u=Pc[o+ui];
      const pa=w*aw+d*ad, pc=w*ra_w+d*ra_d;
      if(pa<a0)a0=pa; if(pa>a1)a1=pa; if(pc<c0)c0=pc; if(pc>c1)c1=pc; if(u<u0)u0=u;
    }
    const Lf=a1-a0, Wf=c1-c0, mc=(c0+c1)/2, ma=(a0+a1)/2;
    // The foot gets tucked in below the collar, so the shoe keeps natural proportions and
    // only widens a little for broad feet.
    const s=Lf*1.0*C.fit/tm.innerLen;                                     // shoe length
    const sz=Math.min(1.15*s, Math.max(0.95*s, Wf*0.9*C.fit/tm.innerWid)); // shoe width
    const heelA=a0+0.012*Lf;
    const isRight=(sd?1:-1)===F.rightSign;
    const zdir=tm.medialZ*(isRight?-1:1);          // big-toe side faces the body's centre line
    const p=[0,0,0];
    p[ui]=u0;
    p[wi]=heelA*aw+mc*ra_w; p[di]=heelA*ad+mc*ra_d;
    const f=[0,0,0], r=[0,0,0], e=F.eU;
    f[wi]=aw; f[di]=ad;
    r[wi]=ra_w; r[di]=ra_d;
    const cw=ma*aw+mc*ra_w, cd=ma*ad+mc*ra_d;
    _m4.set(
      -f[0]*s, e[0]*s, r[0]*zdir*sz, p[0],
      -f[1]*s, e[1]*s, r[1]*zdir*sz, p[1],
      -f[2]*s, e[2]*s, r[2]*zdir*sz, p[2],
      0,0,0,1);
    const inst=shoeInst[sd];
    inst.root.matrix.copy(_m4);
    inst.root.matrixWorldNeedsUpdate=true;
    inst.soleGroup.scale.y=C.platform;
    inst.soleGroup.position.y=tm.soleTop*(1-C.platform);
    footFit[sd]={cw,cd,ub:u0,collarU:u0+tm.collar*s, rimU:u0+tm.rimTop*s,
                 aw,ad,heelA,s, sz,zdir,ra_w,ra_d,mc};
  }

  // Full-length pants stop just above the top edge of the shoes (in the body's rest heights).
  const rim=Math.max(footFit[0]?.rimU??-Infinity, footFit[1]?.rimU??-Infinity);
  if(isFinite(rim)){
    const rest=axes.upMin+(rim-axes.upMin)/state.params.height;
    shoeHemT=(rest-axes.upMin)/axes.H+0.012;
    const g=garments.pants;
    if(g && state.clothing.pants.on && Math.abs((g.hemBuilt??-1)-shoeHemT)>0.002) queuePantsRebuild();
  }
}

let shoeHemT=null, pantsTimer=0;
function queuePantsRebuild(){
  clearTimeout(pantsTimer);
  pantsTimer=setTimeout(()=>{ rebuildGarment('pants'); updateGarments(); }, 120);
}

// Keep the foot inside the shoe: shrink it below the collar, and hold it under the low
// front of the upper (the vamp). Everything here ends up hidden by the shoe.
function tuckFeet(Pc){
  const {ui,wi,di}=axes, V=shoeTemplate.vamp;
  const tA0=LM.footTopT, tA1=LM.footTopT+0.03;
  for(let sd=0;sd<2;sd++){
    const ff=footFit[sd]; if(!ff) continue;
    const list=seg.footZone[sd];

    // centre of the ankle just above the foot: the leg drops straight down into the shoe here
    let aw_=0, ad_=0, ac=0;
    for(let k=0;k<list.length;k++){
      const i=list[k]; if(seg.t[i]<tA0||seg.t[i]>tA1) continue;
      aw_+=Pc[i*3+wi]; ad_+=Pc[i*3+di]; ac++;
    }
    const ankW=ac?aw_/ac:ff.cw, ankD=ac?ad_/ac:ff.cd;

    const span=ff.collarU-ff.ub;
    const lo=ff.ub+0.28*span, hi=ff.collarU-0.06*span;
    for(let k=0;k<list.length;k++){
      const i=list[k], o=i*3;
      let U=Pc[o+ui], W=Pc[o+wi], D=Pc[o+di];

      // shrink inside the shoe, towards the foot's centre low down and the ankle's centre higher up
      if(U<hi){
        const w=1-smoothstep(lo,hi,U);
        const up=smoothstep(ff.ub,ff.collarU,U);
        const cw=ff.cw+(ankW-ff.cw)*up, cd=ff.cd+(ankD-ff.cd)*up;
        W=cw+(W-cw)*(1-0.36*w);
        D=cd+(D-cd)*(1-0.30*w);
        U=ff.ub+(U-ff.ub)*(1-0.22*w);
      }

      // under the covered front of the shoe, the foot (not the shin) stays below the upper,
      // with room for the sock
      const vw=1-smoothstep(LM.footTopT-0.004, LM.footTopT+0.016, seg.t[i]);
      if(vw>0){
        const xt=-((W*ff.aw+D*ff.ad)-ff.heelA)/ff.s;
        const zt=ff.zdir*((W*ff.ra_w+D*ff.ra_d)-ff.mc)/ff.sz;
        const bx=Math.floor((xt-V.x0)/(V.x1-V.x0)*V.bins);
        const bz=Math.min(V.zbins-1,Math.max(0,Math.floor((zt-V.z0)/(V.z1-V.z0)*V.zbins)));
        let capU=Infinity;
        if(bx>=0 && bx<V.bins) capU=ff.ub+(V.cover[bx*V.zbins+bz]-0.035)*ff.s;
        else if(bx<0) capU=ff.ub+0.02*ff.s;              // past the toe: flatten
        if(U>capU) U-=(U-(capU+(U-capU)*0.08))*vw;
      }

      // between the side walls: nothing pokes out sideways, up to the rim of the opening
      const yt=(U-ff.ub)/ff.s;
      if(yt>=0 && yt<V.y1){
        const xt=-((W*ff.aw+D*ff.ad)-ff.heelA)/ff.s;
        const bx=Math.floor((xt-V.x0)/(V.x1-V.x0)*V.bins);
        const by=Math.floor(yt/V.y1*V.ybins);
        if(bx>=0 && bx<V.bins){
          const kk=bx*V.ybins+by, zp=V.zPlus[kk], zm=V.zMinus[kk];
          const pc=W*ff.ra_w+D*ff.ra_d;
          const zt=ff.zdir*(pc-ff.mc)/ff.sz;
          const m=0.014;
          let zn=zt;
          if(zn>zp-m) zn=(zp-m)+(zn-(zp-m))*0.1;
          if(zn<zm+m) zn=(zm+m)+(zn-(zm+m))*0.1;
          if(zn!==zt){
            const dp=ff.zdir*(zn-zt)*ff.sz;
            W+=dp*ff.ra_w; D+=dp*ff.ra_d;
          }
        }
      }
      Pc[o+ui]=U; Pc[o+wi]=W; Pc[o+di]=D;
    }
  }
}

/* ============================================================
   CLOTHING — garments are shells derived from the body surface,
   offset along its normals, so they always fit and follow morphs.
   Each body triangle is clipped exactly against the garment's
   hem planes, so every hem is a clean cut. Every garment vertex
   is stored as barycentric weights on a body triangle, so it
   tracks the body through any deformation.
============================================================ */

// A garment is one or more pieces; a piece is a list of conditions
// sign*(field - k) >= 0, evaluated linearly across each triangle.
function garmentPieces(kind){
  const C=state.clothing, cT=LM.crotchT, nT=LM.neckBottomT, S=surf;
  const notArm={F:S.armW, k:0.5, sign:-1};
  if(kind==='shirt'){
    const scoop=0.006+C.shirt.neck*0.07;
    const neckF=S._neckF || (S._neckF=new Float32Array(S.t.length));
    for(let i=0;i<neckF.length;i++) neckF[i]=S.t[i]+scoop*S.front[i];
    const neck={F:neckF, k:nT+0.024, sign:-1};
    const bottom=(cT-0.03)+(1-C.shirt.length)*0.20;
    const pieces=[[{F:S.t,k:bottom,sign:1}, neck, notArm]];
    if(C.shirt.sleeve>0.03 && LM.hasArms){
      const cut=0.06+C.shirt.sleeve*0.94;         // 1.0 = wrist
      pieces.push([{F:S.armW,k:0.5,sign:1}, {F:S.armParam,k:cut,sign:-1}, neck]);
    }
    return pieces;
  }
  if(kind==='pants'){
    const top=cT+0.085;
    // with shoes on, full-length pants end just above the shoe's top edge
    const hem=(shoesVisible() && shoeHemT!=null) ? shoeHemT : LM.footTopT+0.018;
    if(garments.pants) garments.pants.hemBuilt=shoesVisible() ? hem : null;
    const bottom=hem+(1-C.pants.length)*(cT-hem)*0.92;
    return [[{F:S.t,k:top,sign:-1},{F:S.t,k:bottom,sign:1},notArm]];
  }
  if(kind==='socks'){
    const top=LM.footTopT+0.012+C.socks.height*(LM.kneeT+0.01-LM.footTopT);
    return [[{F:S.t,k:top,sign:-1},notArm]];
  }
  return [];
}
const sockLabel=v=> v<0.1?'Ankle' : v<0.4?'Crew' : v<0.75?'Mid-calf' : 'Knee-high';

function makeGarment(kind, offsetMul){
  const geo=new THREE.BufferGeometry();
  const mat=new THREE.MeshStandardMaterial({
    color:new THREE.Color(state.clothing[kind]?.color||'#888888'),
    roughness:state.fabric, metalness:0.0, side:THREE.DoubleSide
  });
  const mesh=new THREE.Mesh(geo,mat);
  mesh.castShadow=true; mesh.receiveShadow=true; mesh.frustumCulled=false;
  bodyMesh.add(mesh);
  garments[kind]={geo,mat,mesh,offsetMul,count:0,tri:null,wt:null};
  rebuildGarment(kind);
}

function clipPoly(poly, vals){
  const out=[], m=poly.length;
  for(let i=0;i<m;i++){
    const P=poly[i], Q=poly[(i+1)%m], vp=vals[i], vq=vals[(i+1)%m];
    if(vp>=0) out.push(P);
    if((vp>=0)!==(vq>=0)){
      const s=vp/(vp-vq);
      out.push([P[0]+(Q[0]-P[0])*s, P[1]+(Q[1]-P[1])*s, P[2]+(Q[2]-P[2])*s]);
    }
  }
  return out;
}

// Garment vertices come in two kinds: "direct" ones that sit on a body vertex (almost all
// of them, shared between triangles), and "cut" ones created where a hem crosses a triangle,
// stored as barycentric weights on that triangle.
const CORNER=[[1,0,0],[0,1,0],[0,0,1]];

function rebuildGarment(kind){
  const g=garments[kind]; if(!g) return;
  const on=state.clothing[kind].on;
  const out=[];                 // triangle corners: direct ids >= 0, cut ids encoded as -(k+1)
  const direct=[];              // body vertex index for each direct vertex
  const cut=[];                 // a,b,c,w0,w1,w2 for each cut vertex
  if(on){
    const idx=surf.index, T=idx.length/3;
    const slot=new Int32Array(surf.t.length).fill(-1);
    // Cut points on a triangle edge are shared by both triangles (and both pieces) meeting
    // there, so hems and piece seams are continuous.
    const edgeCuts=new Map();
    const idOf=(tri,w)=>{
      for(let c=0;c<3;c++) if(w===CORNER[c]){
        const v=tri[c];
        if(slot[v]<0){ slot[v]=direct.length; direct.push(v); }
        return slot[v];
      }
      let zi=-1; for(let c=0;c<3;c++) if(w[c]===0) zi=c;
      if(zi>=0){
        const i0=(zi+1)%3, i1=(zi+2)%3;
        let va=tri[i0], vb=tri[i1], wa=w[i0];
        if(va>vb){ const q=va; va=vb; vb=q; wa=1-wa; }
        const k=va+','+vb+','+Math.round(wa*1e6);
        const hit=edgeCuts.get(k); if(hit!==undefined) return hit;
        cut.push(va,vb,vb,wa,1-wa,0);
        const id=-(cut.length/6); edgeCuts.set(k,id); return id;
      }
      cut.push(tri[0],tri[1],tri[2],w[0],w[1],w[2]);
      return -(cut.length/6);
    };
    for(const conds of garmentPieces(kind)){
      // height range the piece can occupy, from its height conditions (the neckline field
      // is height plus a non-negative scoop, so it bounds height from above too)
      let tLo=-Infinity, tHi=Infinity;
      for(const q of conds){
        if(q.F===surf.t){ if(q.sign>0) tLo=Math.max(tLo,q.k); else tHi=Math.min(tHi,q.k); }
        else if(q.F===surf._neckF && q.sign<0) tHi=Math.min(tHi,q.k);
      }
      const cv=new Float64Array(conds.length*3);
      for(let f=0;f<T;f++){
        if(surf.triHi[f]<tLo || surf.triLo[f]>tHi) continue;
        const a=idx[f*3], b=idx[f*3+1], c=idx[f*3+2];
        let allIn=true, reject=false;
        for(let qi=0;qi<conds.length;qi++){
          const q=conds[qi];
          const va=q.sign*(q.F[a]-q.k), vb=q.sign*(q.F[b]-q.k), vc=q.sign*(q.F[c]-q.k);
          if(va<0&&vb<0&&vc<0){ reject=true; break; }
          if(va<0||vb<0||vc<0) allIn=false;
          cv[qi*3]=va; cv[qi*3+1]=vb; cv[qi*3+2]=vc;
        }
        if(reject) continue;
        let poly=CORNER;
        if(!allIn){
          for(let qi=0;qi<conds.length && poly.length>=3;qi++){
            const A=cv[qi*3], B=cv[qi*3+1], Cc=cv[qi*3+2];
            if(A>=0&&B>=0&&Cc>=0) continue;
            poly=clipPoly(poly, poly.map(w=>w[0]*A+w[1]*B+w[2]*Cc));
          }
          if(poly.length<3) continue;
        }
        const tri=[a,b,c];
        const ids=poly.map(w=>idOf(tri,w));
        for(let k=1;k<ids.length-1;k++) out.push(ids[0],ids[k],ids[k+1]);
      }
    }
  }
  const nd=direct.length, nc=cut.length/6, nv=nd+nc;
  const index=new Uint32Array(out.length);
  for(let i=0;i<out.length;i++){ const v=out[i]; index[i]= v>=0 ? v : nd+(-v-1); }
  g.direct=Uint32Array.from(direct);
  g.cutTri=new Uint32Array(nc*3); g.cutW=new Float32Array(nc*3);
  for(let k=0;k<nc;k++){
    g.cutTri[k*3]=cut[k*6]; g.cutTri[k*3+1]=cut[k*6+1]; g.cutTri[k*3+2]=cut[k*6+2];
    g.cutW[k*3]=cut[k*6+3]; g.cutW[k*3+1]=cut[k*6+4]; g.cutW[k*3+2]=cut[k*6+5];
  }
  g.count=nv;
  g.geo.dispose();
  const geo=new THREE.BufferGeometry();
  geo.setIndex(new THREE.BufferAttribute(index,1));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(nv,1)*3),3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(Math.max(nv,1)*3),3));
  // garments always hug the body, so the body's bounds are a safe stand-in
  if(bodyGeo && bodyGeo.boundingSphere){
    geo.boundingSphere=bodyGeo.boundingSphere.clone(); geo.boundingSphere.radius*=1.1;
    geo.boundingBox=bodyGeo.boundingBox.clone().expandByScalar(axes.H*0.03);
  }
  g.mesh.geometry=geo; g.geo=geo;
  g.mesh.visible=on && out.length>0;
  buildGarmentSmoothing(g, index, nv);
}

// Neighbour lists for fabric smoothing. Hem vertices only listen to their hem neighbours,
// so hems get straightened along their own line instead of being pulled inward.
function buildGarmentSmoothing(g, index, nv){
  const edgeUse=new Map();
  const key=(a,b)=>a<b ? a*nv+b : b*nv+a;
  for(let f=0;f<index.length;f+=3){
    for(const [a,b] of [[index[f],index[f+1]],[index[f+1],index[f+2]],[index[f+2],index[f]]]){
      const k=key(a,b); edgeUse.set(k,(edgeUse.get(k)||0)+1);
    }
  }
  const onHem=new Uint8Array(nv);
  for(const [k,c] of edgeUse) if(c===1){ onHem[Math.floor(k/nv)]=1; onHem[k%nv]=1; }
  const deg=new Int32Array(nv+1);
  const edges=[];
  for(const [k,c] of edgeUse){
    const a=Math.floor(k/nv), b=k%nv;
    const hemEdge=c===1;
    if(!onHem[a]||hemEdge){ edges.push(a,b); deg[a+1]++; }
    if(!onHem[b]||hemEdge){ edges.push(b,a); deg[b+1]++; }
  }
  for(let v=0;v<nv;v++) deg[v+1]+=deg[v];
  const adj=new Int32Array(deg[nv]), fill=deg.slice(0,nv);
  for(let e=0;e<edges.length;e+=2) adj[fill[edges[e]]++]=edges[e+1];
  g.adjStart=deg; g.adj=adj; g.tmp=new Float32Array(nv*3); g.disp=null;
  g.gIndex=index;
}

// Volume-preserving (Taubin) smoothing: alternate a shrinking and an inflating step.
function smoothGarment(g, iterations){
  const p=g.geo.attributes.position.array, tmp=g.tmp, S=g.adjStart, A=g.adj, nv=g.count;
  for(let it=0;it<iterations*2;it++){
    const f=(it&1) ? -0.53 : 0.5;
    tmp.set(p.subarray(0,nv*3));
    for(let v=0;v<nv;v++){
      const s0=S[v], s1=S[v+1], k=s1-s0; if(!k) continue;
      let x=0,y=0,z=0;
      for(let q=s0;q<s1;q++){ const o=A[q]*3; x+=tmp[o]; y+=tmp[o+1]; z+=tmp[o+2]; }
      const o=v*3;
      p[o]  +=f*(x/k-tmp[o]);
      p[o+1]+=f*(y/k-tmp[o+1]);
      p[o+2]+=f*(z/k-tmp[o+2]);
    }
  }
}

// Garment shell = body surface + normal × offset + the fabric's drape offset (`disp`),
// kept outside the skin. The drape comes from smoothing the shell; that is too heavy to run
// every frame on detailed bodies, so it is recomputed once the body stops changing.
function writeGarment(g, kind, P, N, withDrape, shade){
  const off=axes.H*0.0032*g.offsetMul*(state.clothing[kind].fit??1);
  const minOff=off*0.55;
  const gp=g.geo.attributes.position.array, gn=g.geo.attributes.normal.array;
  const D=g.direct, nd=D.length, disp=g.disp;
  const drape=withDrape && disp;
  for(let v=0;v<nd;v++){
    const s=D[v]*3, o=v*3;
    const nx=N[s], ny=N[s+1], nz=N[s+2];
    let x=P[s]+nx*off, y=P[s+1]+ny*off, z=P[s+2]+nz*off;
    if(drape){
      x+=disp[o]; y+=disp[o+1]; z+=disp[o+2];
      const d=(x-P[s])*nx+(y-P[s+1])*ny+(z-P[s+2])*nz;
      if(d<minOff){ const q=minOff-d; x+=nx*q; y+=ny*q; z+=nz*q; }
    }
    gp[o]=x; gp[o+1]=y; gp[o+2]=z;
    gn[o]=nx; gn[o+1]=ny; gn[o+2]=nz;
  }
  const tri=g.cutTri, wt=g.cutW, nc=tri.length/3;
  for(let k=0;k<nc;k++){
    const k3=k*3, a=tri[k3]*3, b=tri[k3+1]*3, c=tri[k3+2]*3;
    const w0=wt[k3], w1=wt[k3+1], w2=wt[k3+2];
    let nx=w0*N[a]+w1*N[b]+w2*N[c], ny=w0*N[a+1]+w1*N[b+1]+w2*N[c+1], nz=w0*N[a+2]+w1*N[b+2]+w2*N[c+2];
    const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1; nx/=nl; ny/=nl; nz/=nl;
    const bx=w0*P[a]+w1*P[b]+w2*P[c], by=w0*P[a+1]+w1*P[b+1]+w2*P[c+1], bz=w0*P[a+2]+w1*P[b+2]+w2*P[c+2];
    const o=(nd+k)*3;
    let x=bx+nx*off, y=by+ny*off, z=bz+nz*off;
    if(drape){
      x+=disp[o]; y+=disp[o+1]; z+=disp[o+2];
      const d=(x-bx)*nx+(y-by)*ny+(z-bz)*nz;
      if(d<minOff){ const q=minOff-d; x+=nx*q; y+=ny*q; z+=nz*q; }
    }
    gp[o]=x; gp[o+1]=y; gp[o+2]=z;
    gn[o]=nx; gn[o+1]=ny; gn[o+2]=nz;
  }
  if(drape && shade && g.gIndex) computeNormals(gp.subarray(0,g.count*3), g.gIndex, gn.subarray(0,g.count*3));
  g.geo.attributes.position.needsUpdate=true;
  g.geo.attributes.normal.needsUpdate=true;
}

function updateGarments(){
  updateGarmentsNow();
  queueDrape();
}
function updateGarmentsNow(){
  if(!bodyGeo) return;
  const P=bodyGeo.attributes.position.array, N=bodyGeo.attributes.normal.array;
  for(const kind in garments){
    const g=garments[kind];
    if(!g.mesh.visible||!g.count) continue;
    writeGarment(g, kind, P, N, true, false);
  }
}

// Recompute the drape for the current body: smooth the plain shell and keep the difference.
let normalsStale=false, heavyBody=false;
function refitDrape(){
  if(!bodyGeo) return;
  if(normalsStale){
    sub.run(coarsePos);
    bodyGeo.attributes.normal.needsUpdate=true;
    normalsStale=false;
    if(!fabricIters){ updateGarmentsNow(); return; }
  }
  if(!fabricIters) return;
  const P=bodyGeo.attributes.position.array, N=bodyGeo.attributes.normal.array;
  for(const kind in garments){
    const g=garments[kind];
    if(!g.mesh.visible||!g.count||!g.adj) continue;
    writeGarment(g, kind, P, N, false);
    const gp=g.geo.attributes.position.array, n3=g.count*3;
    const plain=gp.slice(0,n3);
    smoothGarment(g, fabricIters);
    if(!g.disp || g.disp.length!==n3) g.disp=new Float32Array(n3);
    for(let i=0;i<n3;i++) g.disp[i]=gp[i]-plain[i];
    writeGarment(g, kind, P, N, true, true);
  }
}
let drapeTimer=0;
function queueDrape(){
  clearTimeout(drapeTimer);
  drapeTimer=setTimeout(refitDrape, 220);
}
let fabricIters=1;

function refreshClothingMaterials(){
  for(const kind in garments){
    const g=garments[kind];
    g.mat.color.set(state.clothing[kind].color);
    g.mat.roughness=state.fabric;
    g.mat.needsUpdate=true;
  }
}

/* ============================================================
   PLANTING + MEASUREMENT
============================================================ */
const _box=new THREE.Box3(), _box2=new THREE.Box3();
function plantAndMeasure(){
  avatarRoot.scale.setScalar(normScale*(modelType==='skinned'?state.params.height:1));
  avatarRoot.position.y=0;
  avatarRoot.updateMatrixWorld(true);
  if(modelType==='skinned' && footBones.length){
    let low=Infinity; const v=new THREE.Vector3();
    footBones.forEach(bn=>{ bn.getWorldPosition(v); if(v.y<low) low=v.y; });
    if(isFinite(low)) avatarRoot.position.y=-low+0.02;
  } else if(bodyGeo && bodyGeo.boundingBox){
    // lowest point: the body, or the shoe soles when shoes are on
    const box=_box.copy(bodyGeo.boundingBox).applyMatrix4(bodyMesh.matrixWorld);
    let low=box.min.y;
    if(shoesVisible()){
      for(const s of shoeInst) for(const m of s.soleMeshes){
        _box2.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
        if(_box2.min.y<low) low=_box2.min.y;
      }
    }
    avatarRoot.position.y=-low;
  }
  avatarRoot.updateMatrixWorld(true);
  let cm=0;
  if(modelType==='static' && bodyGeo && bodyGeo.boundingBox){
    const box=_box.copy(bodyGeo.boundingBox).applyMatrix4(bodyMesh.matrixWorld);
    cm=Math.round((box.max.y-box.min.y)*100);            // barefoot height
  } else {
    const box=new THREE.Box3().setFromObject(avatarRoot);
    cm=box.isEmpty()?0:Math.round((box.max.y-box.min.y)*100);
  }
  if(modelType==='skinned' && topBone){
    const v=new THREE.Vector3(); topBone.getWorldPosition(v);
    cm=Math.round((v.y+(boneMap['HeadTop_End']?0:0.12))*100);
  }
  document.getElementById('heightReadout').textContent=cm||'—';
}

/* ============================================================
   SKINNED (Ready Player Me) PATH
============================================================ */
function morph(name,sx,sy,sz){
  const bn=boneMap[name]; if(!bn) return;
  const base=BONE_BASE.get(name);
  bn.scale.set(base.x*sx, base.y*(sy??sx), base.z*(sz??sx));
}
function morphAll(names,sx,sy,sz){ names.forEach(n=>morph(n,sx,sy,sz)); }
function applyBoneMorphs(){
  const P=state.params;
  BONE_BASE.forEach((v,name)=>{ if(boneMap[name]) boneMap[name].scale.copy(v); });
  morph('Head',P.headSize);
  morph('Neck',1,P.neckLength,1);
  morphAll(['Spine','Spine1','Spine2'],P.chestWidth,1,P.chestWidth);
  morph('Spine',P.chestWidth,P.torsoLength,P.chestWidth);
  morphAll(['LeftShoulder','RightShoulder'],1,P.shoulderWidth,1);
  morphAll(['LeftArm','RightArm','LeftForeArm','RightForeArm'],P.armThickness,P.armLength,P.armThickness);
  morphAll(['LeftUpLeg','RightUpLeg','LeftLeg','RightLeg'],P.legThickness,P.legLength,P.legThickness);
  plantAndMeasure();
}

function applyMorphs(quick){
  if(!currentModel) return;
  if(modelType==='skinned') applyBoneMorphs();
  else if(modelType==='static') applyMeshMorphs(quick);
}

/* ============================================================
   LOADING
============================================================ */
function showLoading(t){ document.getElementById('loadingTxt').textContent=t||'Loading model…'; document.getElementById('loading').hidden=false; }
function hideLoading(){ document.getElementById('loading').hidden=true; }
function isRpm(u){ return /readyplayer\.me/.test(u); }
function qualityUrl(u){
  if(!isRpm(u)) return u;
  try{ const x=new URL(u);
    if(!x.searchParams.has('textureAtlas')) x.searchParams.set('textureAtlas','1024');
    if(!x.searchParams.has('pose')) x.searchParams.set('pose','A');
    return x.toString();
  }catch(e){ return u; }
}
// Processed bundled bodies are kept when switching away, so switching back is instant.
const modelCache=new Map();

function clearModel(){
  if(modelType==='static' && currentBody && currentModel){
    modelCache.set(BODIES[currentBody].url, {
      currentModel, bodyMesh, bodyGeo, bodyMat, basePositions, bodyIndex, seg, LM, axes,
      coarsePos, sub, surf, eyeMat, eyeParts, shoeInst, normScale, facing, fabricIters, heavyBody, garments:{...garments} });
    avatarRoot.remove(currentModel);
    for(const k in garments) delete garments[k];
    currentModel=null; modelType=null; shoeInst=null; eyeMat=null; eyeParts=null;
    bodyMesh=null; bodyGeo=null; bodyMat=null; basePositions=null; bodyIndex=null; seg=null; LM=null; axes=null;
    coarsePos=null; sub=null; surf=null;
    return;
  }
  if(shoeInst){ shoeInst.forEach(s=>s.root.removeFromParent()); shoeInst=null; }  // shoe geometry is shared, keep it
  if(currentModel){
    avatarRoot.remove(currentModel);
    currentModel.traverse(o=>{ if(o.geometry) o.geometry.dispose(); });
  }
  for(const k in garments) delete garments[k];
  currentModel=null; modelType=null;
  boneMap={}; BONE_BASE.clear(); footBones=[]; topBone=null;
  bodyMesh=null; bodyGeo=null; bodyMat=null; basePositions=null; bodyIndex=null; seg=null; LM=null; axes=null;
  coarsePos=null; sub=null; surf=null;
  if(eyeMat){ eyeMat.dispose(); eyeMat=null; } eyeParts=null;
}

let loadSeq=0;
function restoreModel(url, bodyKey){
  ++loadSeq;
  clearModel();
  const r=modelCache.get(url); modelCache.delete(url);
  ({ currentModel, bodyMesh, bodyGeo, bodyMat, basePositions, bodyIndex, seg, LM, axes,
     coarsePos, sub, surf, eyeMat, eyeParts, shoeInst, normScale, facing, fabricIters, heavyBody } = r);
  Object.assign(garments, r.garments);
  modelType='static'; currentBody=bodyKey; targetHeight=BODIES[bodyKey].height;
  avatarRoot.scale.setScalar(1); avatarRoot.position.set(0,0,0); avatarRoot.rotation.set(0,0,0);
  avatarRoot.add(currentModel);
  bodyMat.color.set(state.skinColor);
  if(eyeMat) eyeMat.userData.u.irisCol.value.set(state.eyeColor);
  for(const k in garments) rebuildGarment(k);      // clothing may have changed meanwhile
  refreshClothingMaterials();
  applyShoeLook(shoeMats, state.clothing.shoes);
  buildUI();
  applyMorphs();
  attachShoes();
  refitDrape();
  frameModel();
  faceCamera();
  hideLoading();
  state.modelUrl=url; state.body=bodyKey; save();
}

function loadModel(rawUrl){
  const bodyKey=Object.keys(BODIES).find(k=>BODIES[k].url===rawUrl)||null;
  if(bodyKey && modelCache.has(rawUrl)){
    showLoading('Switching body…');
    setTimeout(()=>restoreModel(rawUrl, bodyKey), 20);
    return;
  }
  const seqNo=++loadSeq;
  showLoading('Loading model…');
  loader.load(qualityUrl(rawUrl), async gltf=>{
    if(seqNo!==loadSeq) return;                         // a newer load replaced this one
    showLoading('Analysing body shape…');
    await new Promise(r=>setTimeout(r,30));             // let the message paint first
    if(seqNo!==loadSeq) return;
    clearModel();
    currentBody=bodyKey;
    targetHeight=bodyKey ? BODIES[bodyKey].height : 1.75;
    currentModel=gltf.scene;
    let skinned=null;
    const meshes=[];
    currentModel.traverse(o=>{
      if(o.isSkinnedMesh&&!skinned) skinned=o;
      if(o.isMesh&&!o.isSkinnedMesh) meshes.push(o);
      if(o.isMesh||o.isSkinnedMesh){
        o.castShadow=true; o.receiveShadow=true; o.frustumCulled=false;
        if(o.material){ o.material.envMapIntensity=1.0; o.material.needsUpdate=true; }
      }
      if(o.isBone){ boneMap[o.name]=o; BONE_BASE.set(o.name,o.scale.clone()); }
    });

    avatarRoot.scale.setScalar(1); avatarRoot.position.set(0,0,0); avatarRoot.rotation.set(0,0,0);
    avatarRoot.add(currentModel);

    if(skinned){
      modelType='skinned';
      footBones=['LeftToeBase','RightToeBase','LeftFoot','RightFoot'].map(n=>boneMap[n]).filter(Boolean);
      topBone=boneMap['HeadTop_End']||boneMap['Head']||null;
    } else if(meshes.length){
      modelType='static';
      setupStaticMesh(meshes);
    }

    // Centre the model on the origin so it spins in place and the camera orbits around it.
    avatarRoot.updateMatrixWorld(true);
    const raw = (modelType==='static')
      ? new THREE.Box3().copy(bodyGeo.boundingBox).applyMatrix4(bodyMesh.matrixWorld)
      : new THREE.Box3().setFromObject(avatarRoot);
    const mid=raw.getCenter(new THREE.Vector3());
    currentModel.position.x-=mid.x;
    currentModel.position.z-=mid.z;
    avatarRoot.updateMatrixWorld(true);
    normScale=targetHeight/(raw.getSize(new THREE.Vector3()).y||1);

    if(modelType==='static'){
      makeGarment('socks',0.35);
      makeGarment('pants',1.0);
      makeGarment('shirt',1.7);
      refreshClothingMaterials();
    }
    buildUI();
    applyMorphs();
    attachShoes();
    refitDrape();
    frameModel();
    faceCamera();
    hideLoading();

    state.modelUrl=rawUrl;
    if(bodyKey) state.body=bodyKey;
    save();
    document.getElementById('empty').hidden=true;
    const pill=document.getElementById('statePill');
    pill.textContent = modelType==='skinned'?'Rigged avatar':'Mesh model';
    pill.classList.add('ok');
  }, evt=>{
    if(evt.total) showLoading('Loading model… '+Math.round(evt.loaded/evt.total*100)+'%');
  }, err=>{
    console.error('Load failed:',err); hideLoading();
    document.getElementById('empty').hidden=false;
    document.getElementById('statePill').textContent='Load failed';
  });
}

// Weld vertices that share a position (models split into pieces duplicate them along the
// seams, which would otherwise show as shading seams) and drop triangles that collapse.
// Spatial hash on quantized positions (typed arrays, open addressing): gives each vertex the
// id of the first vertex at the same spot. `order` lists which vertices to visit.
function positionIds(P, order, eps){
  let m0=Infinity,m1=Infinity,m2=Infinity;
  for(let k=0;k<order.length;k++){ const v=order[k]*3; if(P[v]<m0)m0=P[v]; if(P[v+1]<m1)m1=P[v+1]; if(P[v+2]<m2)m2=P[v+2]; }
  let cap=1; while(cap<order.length*2) cap<<=1;
  const kx=new Int32Array(cap), ky=new Int32Array(cap), kz=new Int32Array(cap), val=new Int32Array(cap).fill(-1);
  const ids=new Int32Array(P.length/3).fill(-1), firsts=[];
  const mask=cap-1;
  for(let k=0;k<order.length;k++){
    const v=order[k]; if(ids[v]>=0) continue;
    const x=Math.round((P[v*3]-m0)/eps)|0, y=Math.round((P[v*3+1]-m1)/eps)|0, z=Math.round((P[v*3+2]-m2)/eps)|0;
    let h=(Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791))&mask;
    while(val[h]>=0 && !(kx[h]===x && ky[h]===y && kz[h]===z)) h=(h+1)&mask;
    if(val[h]<0){ kx[h]=x; ky[h]=y; kz[h]=z; val[h]=firsts.length; firsts.push(v); }
    ids[v]=val[h];
  }
  return { ids, count:firsts.length, firsts };
}

// Only the vertices this index range uses are visited; the result is compact.
function weldMesh(P, I){
  let m=[Infinity,Infinity,Infinity], M=[-Infinity,-Infinity,-Infinity];
  for(let k=0;k<I.length;k++){ const v=I[k]*3; for(let a=0;a<3;a++){ const q=P[v+a]; if(q<m[a])m[a]=q; if(q>M[a])M[a]=q; } }
  const eps=Math.max(M[0]-m[0],M[1]-m[1],M[2]-m[2])*1e-5 || 1e-9;
  const { ids:remap, count:nOut, firsts }=positionIds(P, I, eps);
  const out=new Float32Array(nOut*3);
  for(let j=0;j<nOut;j++){ const v=firsts[j]*3; out[j*3]=P[v]; out[j*3+1]=P[v+1]; out[j*3+2]=P[v+2]; }
  const idx=new Uint32Array(I.length); let nIdx=0;
  for(let f=0;f<I.length;f+=3){
    const a=remap[I[f]], b=remap[I[f+1]], c=remap[I[f+2]];
    if(a!==b && b!==c && a!==c){ idx[nIdx++]=a; idx[nIdx++]=b; idx[nIdx++]=c; }
  }
  return { pos:out.slice(0,nOut*3), index:idx.slice(0,nIdx) };
}

let eyeMat=null, eyeParts=null;
function makeEyeMaterial(){
  // No textures on the eyes, so the iris and pupil are drawn from each fragment's angle to
  // the eyeball's forward axis.
  const u={ eyeC0:{value:new THREE.Vector3()}, eyeC1:{value:new THREE.Vector3()},
            eyeFwd:{value:new THREE.Vector3(0,0,1)}, irisCol:{value:new THREE.Color(state.eyeColor)} };
  const m=new THREE.MeshPhysicalMaterial({ color:0xffffff, roughness:0.22, metalness:0,
    clearcoat:1, clearcoatRoughness:0.04, envMapIntensity:1 });
  m.userData.u=u;
  m.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,u);
    sh.vertexShader='varying vec3 vObjPos;\n'+sh.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\n  vObjPos = transformed;');
    sh.fragmentShader='uniform vec3 eyeC0;\nuniform vec3 eyeC1;\nuniform vec3 eyeFwd;\nuniform vec3 irisCol;\nvarying vec3 vObjPos;\n'
      +sh.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  vec3 ec = distance(vObjPos, eyeC0) < distance(vObjPos, eyeC1) ? eyeC0 : eyeC1;
  float k = dot(normalize(vObjPos - ec), eyeFwd);
  float iris   = smoothstep(0.852, 0.872, k);
  float ring   = iris * (1.0 - smoothstep(0.872, 0.905, k));
  float radial = smoothstep(0.872, 0.975, k);
  float pupil  = smoothstep(0.972, 0.979, k);
  vec3 col = mix(vec3(0.92, 0.9, 0.87), irisCol * (0.65 + 0.6 * radial), iris);
  col = mix(col, irisCol * 0.22, ring * 0.75);
  col = mix(col, vec3(0.012), pupil);
  diffuseColor.rgb = col;`);
  };
  return m;
}

// Eyeball centres follow the head as it is reshaped.
function updateEyes(P){
  if(!eyeMat || !eyeParts) return;
  const {ui,wi,di}=axes, u=eyeMat.userData.u;
  const cs=eyeParts.map(list=>{
    let x=0,y=0,z=0;
    for(let k=0;k<list.length;k++){ const o=list[k]*3; x+=P[o]; y+=P[o+1]; z+=P[o+2]; }
    return new THREE.Vector3(x/list.length, y/list.length, z/list.length);
  });
  u.eyeC0.value.copy(cs[0]); u.eyeC1.value.copy(cs[cs.length>1?1:0]);
  const f=LM.frame.f; u.eyeFwd.value.set(f[0],f[1],f[2]);
}

// Split the eye triangles into eyeballs (connected pieces), falling back to left/right halves.
function findEyeParts(range){
  const verts=new Set();
  for(let i=range.start;i<range.start+range.count;i++) verts.add(bodyIndex[i]);
  const list=[...verts];
  const par=new Map(list.map(v=>[v,v]));
  const find=a=>{ while(par.get(a)!==a){ par.set(a,par.get(par.get(a))); a=par.get(a); } return a; };
  for(let i=range.start;i<range.start+range.count;i+=3){
    const a=find(bodyIndex[i]), b=find(bodyIndex[i+1]), c=find(bodyIndex[i+2]);
    if(a!==b) par.set(a,b); const bb=find(b); if(find(c)!==bb) par.set(find(c),bb);
  }
  const groups=new Map();
  for(const v of list){ const r=find(v); if(!groups.has(r)) groups.set(r,[]); groups.get(r).push(v); }
  let parts=[...groups.values()].sort((p,q)=>q.length-p.length).slice(0,2);
  if(parts.length<2){
    const {wi,wCen}=axes;
    parts=[list.filter(v=>basePositions[v*3+wi]<wCen), list.filter(v=>basePositions[v*3+wi]>=wCen)].filter(p=>p.length);
  }
  return parts.map(p=>Uint32Array.from(p));
}

function setupStaticMesh(meshes){
  currentModel.updateMatrixWorld(true);
  // the largest piece hosts the merged body; the others are baked into its frame
  const host=meshes.reduce((a,m)=>m.geometry.attributes.position.count>a.geometry.attributes.position.count?m:a);
  bodyMesh=host;
  const srcGeo=host.geometry;
  const inv=new THREE.Matrix4().copy(host.matrixWorld).invert();

  // group the pieces by material, the host's material (the skin) first
  const byMat=new Map();
  for(const m of meshes){ if(!byMat.has(m.material)) byMat.set(m.material,[]); byMat.get(m.material).push(m); }
  const matOrder=[host.material, ...[...byMat.keys()].filter(k=>k!==host.material)];
  const posParts=[], idxParts=[], ranges=[];
  let vOff=0, iOff=0;
  for(const mat of matOrder){
    const start=iOff;
    for(const m of byMat.get(mat)){
      const g=m.geometry.clone();
      if(m!==host) g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,m.matrixWorld));
      const p=g.attributes.position.array, nv=p.length/3;
      const ix=g.index ? g.index.array : Uint32Array.from({length:nv},(_,i)=>i);
      const out=new Uint32Array(ix.length);
      for(let k=0;k<ix.length;k++) out[k]=ix[k]+vOff;
      posParts.push(p); idxParts.push(out);
      vOff+=nv; iOff+=ix.length;
      g.dispose();
    }
    ranges.push({mat, start, end:iOff});
  }
  const P=new Float32Array(vOff*3); let o=0; for(const p of posParts){ P.set(p,o); o+=p.length; }
  const I=new Uint32Array(iOff); o=0; for(const ix of idxParts){ I.set(ix,o); o+=ix.length; }

  // weld each material range separately so group boundaries stay intact
  const welded=ranges.map(r=>weldMesh(P, I.subarray(r.start,r.end)));
  basePositions=new Float32Array(welded.reduce((a,w)=>a+w.pos.length,0));
  bodyIndex=new Uint32Array(welded.reduce((a,w)=>a+w.index.length,0));
  const groups=[];
  let vBase=0, iBase=0;
  welded.forEach((w,gi)=>{
    basePositions.set(w.pos, vBase*3);
    for(let k=0;k<w.index.length;k++) bodyIndex[iBase+k]=w.index[k]+vBase;
    groups.push({start:iBase, count:w.index.length, mat:ranges[gi].mat, materialIndex:gi});
    vBase+=w.pos.length/3; iBase+=w.index.length;
  });
  for(const m of meshes) if(m!==host){ m.removeFromParent(); m.geometry.dispose(); }

  // soft, skin-like shading: a faint warm sheen reads as light scattering under the skin
  bodyMat=new THREE.MeshPhysicalMaterial({
    color:new THREE.Color(state.skinColor), roughness:0.6, metalness:0.0,
    sheen:0.28, sheenRoughness:0.6, sheenColor:new THREE.Color('#e8866f'),
    specularIntensity:0.45, clearcoat:0.04, clearcoatRoughness:0.6, envMapIntensity:0.8
  });
  eyeMat=null; eyeParts=null;
  let eyeRange=null;
  const mats=groups.map((g,gi)=>{
    if(gi===0) return bodyMat;
    if(/eye/i.test(g.mat.name||'') && !eyeMat){ eyeMat=makeEyeMaterial(); eyeRange=g; return eyeMat; }
    return g.mat;
  });
  for(const g of groups) if(g.mat!==host.material && g.mat!==eyeMat && !mats.includes(g.mat)) g.mat.dispose();
  if(host.material && !mats.includes(host.material)) host.material.dispose();
  host.material = mats.length>1 ? mats : bodyMat;

  // axis detection
  const b=basePositions;
  const mn=[Infinity,Infinity,Infinity], mx=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<b.length;i+=3) for(let a=0;a<3;a++){ const v=b[i+a]; if(v<mn[a])mn[a]=v; if(v>mx[a])mx[a]=v; }
  const ext=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]];
  const ui=ext.indexOf(Math.max(...ext));
  const rest=[0,1,2].filter(a=>a!==ui);
  const wi=ext[rest[0]]>=ext[rest[1]]?rest[0]:rest[1];
  const di=rest[0]===wi?rest[1]:rest[0];
  axes={ui,wi,di,upMin:mn[ui],upMax:mx[ui],
        wCen:(mn[wi]+mx[wi])/2, dCen:(mn[di]+mx[di])/2,
        wHalf:Math.max((mx[wi]-mn[wi])/2,1e-6), H:Math.max(mx[ui]-mn[ui],1e-6)};
  buildSegmentation();

  // display mesh = the control mesh, smoothed by curved subdivision if it is low-poly
  coarsePos=basePositions.slice(0);
  const levels=subdivLevelsFor(bodyIndex.length/3);
  heavyBody = bodyIndex.length/3 > 120000;
  fabricIters = levels===0 ? 10 : 2;         // detailed sculpts need more fabric smoothing
  sub=new PNSubdivider(bodyIndex, basePositions.length/3, levels);
  const geo=new THREE.BufferGeometry();
  geo.setIndex(new THREE.BufferAttribute(sub.fineIndex,1));
  geo.setAttribute('position', new THREE.BufferAttribute(sub.outPos,3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(sub.outNor,3));
  if(groups.length>1){
    const k=4**levels;                       // each level splits a triangle into four, in order
    for(const g of groups) geo.addGroup(g.start*k, g.count*k, g.materialIndex);
  }
  host.geometry=geo; bodyGeo=geo;
  srcGeo.dispose();
  if(eyeRange) eyeParts=findEyeParts(eyeRange);
  sub.run(coarsePos);                       // fill it now so the model can be measured
  updateEyes(coarsePos);
  updateBodyBounds();
  surf={ index:sub.fineIndex, t:sub.field(seg.t), armW:sub.field(seg.armW),
         armParam:sub.field(seg.armParam), front:sub.field(seg.front) };
  // each surface triangle's height range, so garments can skip whole bands quickly
  const fi=surf.index, ft=surf.t, T=fi.length/3;
  surf.triLo=new Float32Array(T); surf.triHi=new Float32Array(T);
  for(let f=0;f<T;f++){
    const a=ft[fi[f*3]], b=ft[fi[f*3+1]], c=ft[fi[f*3+2]];
    surf.triLo[f]=Math.min(a,b,c); surf.triHi[f]=Math.max(a,b,c);
  }
}

function frameModel(){
  avatarRoot.updateMatrixWorld(true);
  const box = (modelType==='static' && bodyGeo && bodyGeo.boundingBox)
    ? new THREE.Box3().copy(bodyGeo.boundingBox).applyMatrix4(bodyMesh.matrixWorld)
    : new THREE.Box3().setFromObject(avatarRoot);
  if(box.isEmpty()) return;
  const size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
  const h=size.y||1.7;
  controls.target.set(0,center.y,0);
  camera.position.set(h*0.34, center.y+h*0.10, h*1.85);
  controls.update();
}

// Turn the model so its face points at the default camera.
function faceCamera(){
  if(modelType!=='static'||!bodyGeo) return;
  // The segmentation found the front in the mesh's own axes (from the feet); take it through
  // the model's transform into the scene and turn it towards the camera (+z).
  avatarRoot.rotation.set(0,0,0);
  avatarRoot.updateMatrixWorld(true);
  const f=new THREE.Vector3(...LM.frame.f).transformDirection(bodyMesh.matrixWorld);
  facing=-Math.atan2(f.x, f.z);
  avatarRoot.rotation.y=facing;
  avatarRoot.updateMatrixWorld(true);
}

/* ============================================================
   UI
============================================================ */
const paneBody=document.getElementById('paneBody');
const paneClothing=document.getElementById('paneClothing');
let sliderEls={};

function el(tag,cls,html){ const e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }

function makeSlider(key, onInput){
  const d=PARAMS[key];
  const c=el('div','ctrl');
  const row=el('div','row');
  const lab=el('label'); lab.textContent=paramLabel(key); lab.htmlFor='sl_'+key;
  const out=el('span','out'); out.textContent=fmtParam(key,state.params[key]);
  row.append(lab,out);
  const inp=document.createElement('input');
  inp.type='range'; inp.id='sl_'+key; inp.min=d.min; inp.max=d.max; inp.step=0.005; inp.value=state.params[key];
  inp.addEventListener('input',()=>{
    state.params[key]=parseFloat(inp.value);
    out.textContent=fmtParam(key,state.params[key]);
    (onInput||scheduleMorph)(); save();
  });
  sliderEls[key]={inp,out};
  c.append(row,inp);
  return c;
}

function genericSlider(label, value, min, max, onInput, fmt){
  const c=el('div','ctrl');
  const row=el('div','row');
  const lab=el('label'); lab.textContent=label;
  const out=el('span','out'); out.textContent=(fmt||(v=>Math.round(v*100)+'%'))(value);
  row.append(lab,out);
  const inp=document.createElement('input');
  inp.type='range'; inp.min=min; inp.max=max; inp.step=0.01; inp.value=value;
  inp.addEventListener('input',()=>{
    const v=parseFloat(inp.value);
    out.textContent=(fmt||(x=>Math.round(x*100)+'%'))(v);
    onInput(v); save();
  });
  c.append(row,inp);
  return c;
}

function colorChip(value,onChange){
  const chip=el('div','color-chip'); chip.style.background=value;
  const ci=document.createElement('input'); ci.type='color'; ci.value=value;
  ci.addEventListener('input',()=>{ chip.style.background=ci.value; onChange(ci.value); save(); });
  chip.appendChild(ci); return chip;
}

function toggleRow(label,on,onChange){
  const t=el('div','toggle'+(on?' on':''));
  t.innerHTML='<span class="sw"></span>'+label;
  t.addEventListener('click',()=>{
    const now=!t.classList.contains('on');
    t.classList.toggle('on',now); onChange(now); save();
  });
  return t;
}

function buildUI(){
  const scroller=document.getElementById('panelBody');
  const keepScroll=scroller.scrollTop;
  renderUI();
  scroller.scrollTop=keepScroll;
}

function renderUI(){
  sliderEls={};
  /* ---------- BODY TAB ---------- */
  paneBody.innerHTML='';

  // body type switch
  const bg=el('div','group');
  bg.appendChild(el('h3',null,'<span class="dot"></span>Body type'));
  bg.appendChild(segmented(Object.entries(BODIES).map(([k,v])=>[k,v.label]), currentBody, k=>switchBody(k)));
  paneBody.appendChild(bg);

  const pg=el('div','group');
  pg.appendChild(el('h3',null,'<span class="dot"></span>Presets'));
  const pwrap=el('div','preset-grid');
  const PRESETS=presetsFor();
  Object.keys(PRESETS).forEach(name=>{
    const b=el('button','chip'); b.textContent=name;
    b.addEventListener('click',()=>{
      const target={};
      for(const k in PARAMS) target[k]=PARAMS[k].def;
      Object.assign(target,PRESETS[name]);
      tweenParams(target);
    });
    pwrap.appendChild(b);
  });
  pg.appendChild(pwrap);
  paneBody.appendChild(pg);

  const allowed = modelType==='skinned' ? BONE_PARAMS : Object.keys(PARAMS);
  BODY_GROUPS.forEach(gname=>{
    const keys=Object.keys(PARAMS).filter(k=>PARAMS[k].group===gname && allowed.includes(k));
    if(!keys.length) return;
    const g=el('div','group');
    g.appendChild(el('h3',null,'<span class="dot"></span>'+gname));
    keys.forEach(k=>g.appendChild(makeSlider(k)));
    paneBody.appendChild(g);
  });

  if(modelType==='static'){
    const g=el('div','group');
    g.appendChild(el('h3',null,'<span class="dot"></span>Skin'));
    const r=el('div','swatch-row');
    r.append(colorChip(state.skinColor,v=>{ state.skinColor=v; if(bodyMat) bodyMat.color.set(v); }),
             Object.assign(el('label'),{textContent:'Skin tone'}));
    g.appendChild(r);
    const tones=el('div','tone-row');
    ['#f4d3b5','#e8b48c','#c8a184','#a6764f','#8d5a3c','#6b4228','#4a2c18'].forEach(c=>{
      const s=el('button','tone'); s.style.background=c;
      s.addEventListener('click',()=>{ state.skinColor=c; if(bodyMat) bodyMat.color.set(c); buildUI(); save(); });
      tones.appendChild(s);
    });
    g.appendChild(tones);
    if(eyeMat){
      g.appendChild(el('div','field-label','Eye colour'));
      const eyes=el('div','tone-row');
      EYE_COLORS.forEach(([c,name])=>{
        const s=el('button','tone'+(state.eyeColor===c?' on':'')); s.style.background=c; s.title=name;
        s.setAttribute('aria-label',name+' eyes');
        s.addEventListener('click',()=>{ state.eyeColor=c; eyeMat.userData.u.irisCol.value.set(c); buildUI(); save(); });
        eyes.appendChild(s);
      });
      g.appendChild(eyes);
    }
    paneBody.appendChild(g);

    const credits=[];
    if(currentBody) credits.push(['Body',BODIES[currentBody].credit]);
    credits.push(['Shoe',SHOE_CREDIT]);
    const cg=el('div','group');
    cg.appendChild(el('div','credit', credits.map(([what,c])=>
      `${what}: “${c.title}” by ${c.author} · <a href="${c.url}" target="_blank" rel="noopener">Sketchfab</a> · CC-BY-4.0`).join('<br>')));
    paneBody.appendChild(cg);
  }

  /* ---------- CLOTHING TAB ---------- */
  paneClothing.innerHTML='';
  if(modelType!=='static'){
    paneClothing.appendChild(el('div','note',
      'This avatar already includes clothing from the Ready Player Me creator. Procedural clothing is available for plain mesh models.'));
  } else {
    const C=state.clothing;

    // SHIRT
    const sg=el('div','group');
    sg.appendChild(el('h3',null,'<span class="dot"></span>Top'));
    sg.appendChild(toggleRow('Shirt', C.shirt.on, v=>{ C.shirt.on=v; rebuildGarment('shirt'); updateGarments(); }));
    const srow=el('div','swatch-row');
    srow.append(colorChip(C.shirt.color,v=>{ C.shirt.color=v; garments.shirt.mat.color.set(v); }),
                Object.assign(el('label'),{textContent:'Shirt colour'}));
    sg.appendChild(srow);
    sg.appendChild(swatchPalette(v=>{ C.shirt.color=v; garments.shirt.mat.color.set(v); buildUI(); }));
    sg.appendChild(genericSlider('Sleeve length', C.shirt.sleeve, 0, 1,
      v=>{ C.shirt.sleeve=v; rebuildGarment('shirt'); updateGarments(); },
      v=> v<0.04?'None' : v<0.35?'Cap' : v<0.7?'Short' : 'Long'));
    sg.appendChild(genericSlider('Neckline', C.shirt.neck, 0, 1,
      v=>{ C.shirt.neck=v; rebuildGarment('shirt'); updateGarments(); },
      v=> v<0.35?'Crew' : v<0.7?'Scoop' : 'Deep scoop'));
    sg.appendChild(genericSlider('Shirt length', C.shirt.length, 0, 1,
      v=>{ C.shirt.length=v; rebuildGarment('shirt'); updateGarments(); },
      v=> v<0.3?'Crop' : v<0.7?'Regular' : 'Long'));
    sg.appendChild(genericSlider('Fit', C.shirt.fit, 0.4, 2.6,
      v=>{ C.shirt.fit=v; updateGarments(); },
      v=> v<0.8?'Tight' : v<1.5?'Regular' : 'Loose'));
    paneClothing.appendChild(sg);

    // PANTS
    const pg2=el('div','group');
    pg2.appendChild(el('h3',null,'<span class="dot"></span>Bottoms'));
    pg2.appendChild(toggleRow('Pants', C.pants.on, v=>{ C.pants.on=v; rebuildGarment('pants'); updateGarments(); }));
    const prow=el('div','swatch-row');
    prow.append(colorChip(C.pants.color,v=>{ C.pants.color=v; garments.pants.mat.color.set(v); }),
                Object.assign(el('label'),{textContent:'Pants colour'}));
    pg2.appendChild(prow);
    pg2.appendChild(swatchPalette(v=>{ C.pants.color=v; garments.pants.mat.color.set(v); buildUI(); }));
    pg2.appendChild(genericSlider('Leg length', C.pants.length, 0, 1,
      v=>{ C.pants.length=v; rebuildGarment('pants'); updateGarments(); },
      v=> v<0.25?'Briefs' : v<0.55?'Shorts' : v<0.8?'Capri' : 'Full'));
    pg2.appendChild(genericSlider('Fit', C.pants.fit, 0.5, 2.6,
      v=>{ C.pants.fit=v; updateGarments(); },
      v=> v<0.8?'Skinny' : v<1.5?'Regular' : 'Baggy'));
    paneClothing.appendChild(pg2);

    // SHOES
    const S=C.shoes;
    const look=()=>{ applyShoeLook(shoeMats,S); };
    const hg=el('div','group');
    hg.appendChild(el('h3',null,'<span class="dot"></span>Footwear'));
    hg.appendChild(toggleRow('Shoes', S.on, v=>{ S.on=v; rebuildGarment('pants'); applyMorphs(); }));
    if(!shoeTemplate) hg.appendChild(el('div','hint','Loading the shoe model…'));

    hg.appendChild(el('div','subhead','Style'));
    const sgrid=el('div','style-grid');
    Object.entries(SHOE_STYLES).forEach(([name,st])=>{
      const b=el('button','style-chip'+(S.style===name?' on':''));
      const sw=st.pattern==='checker'
        ? `background:repeating-conic-gradient(${st.upper} 0 25%, ${st.pattern2} 0 50%) 0 0/8px 8px`
        : st.pattern==='stripes' ? `background:repeating-linear-gradient(0deg, ${st.upper} 0 3px, ${st.pattern2} 3px 6px)`
        : st.pattern==='plaid' ? `background:repeating-linear-gradient(90deg, ${st.pattern2}66 0 3px, transparent 3px 8px), repeating-linear-gradient(0deg, ${st.pattern2}66 0 3px, ${st.upper} 3px 8px)`
        : `background:${st.upper}`;
      b.innerHTML=`<span class="style-swatch"><span style="${sw}"></span><span style="background:${st.sole}"></span></span><span>${name}</span>`;
      b.addEventListener('click',()=>{ Object.assign(S, st, {style:name}); look(); buildUI(); save(); });
      sgrid.appendChild(b);
    });
    hg.appendChild(sgrid);

    hg.appendChild(el('div','subhead','Upper'));
    const urow=el('div','swatch-row');
    urow.append(colorChip(S.upper,v=>{ S.upper=v; S.style='Custom'; look(); }),
                Object.assign(el('label'),{textContent:S.pattern==='solid'?'Colour':'Main colour'}));
    hg.appendChild(urow);
    hg.appendChild(el('div','field-label','Pattern'));
    hg.appendChild(segmented(PATTERNS, S.pattern, v=>{ S.pattern=v; S.style='Custom'; look(); buildUI(); }));
    if(S.pattern!=='solid'){
      const prow=el('div','swatch-row');
      prow.append(colorChip(S.pattern2,v=>{ S.pattern2=v; S.style='Custom'; look(); }),
                  Object.assign(el('label'),{textContent:'Pattern colour'}));
      hg.appendChild(prow);
      hg.appendChild(genericSlider('Pattern size', S.patternScale, 0.5, 1.8,
        v=>{ S.patternScale=v; look(); },
        v=> v<0.8?'Large' : v<1.25?'Classic' : 'Fine'));
    }
    hg.appendChild(el('div','field-label','Material'));
    hg.appendChild(segmented(FINISHES, S.finish, v=>{ S.finish=v; S.style='Custom'; look(); }));

    hg.appendChild(el('div','subhead','Details'));
    const dgrid=el('div','swatch-grid');
    [['sole','Sole'],['trim','Sole stripe'],['stitch','Stitching'],['inner','Lining']].forEach(([k,label])=>{
      const r=el('div','swatch-row');
      r.append(colorChip(S[k],v=>{ S[k]=v; S.style='Custom'; look(); }),
               Object.assign(el('label'),{textContent:label}));
      dgrid.appendChild(r);
    });
    hg.appendChild(dgrid);

    hg.appendChild(el('div','subhead','Fit'));
    hg.appendChild(genericSlider('Sole height', S.platform, 1.0, 2.4,
      v=>{ S.platform=v; scheduleMorph(); },
      v=> v<1.15?'Flat' : v<1.7?'Raised' : 'Platform'));
    hg.appendChild(genericSlider('Size', S.fit, 0.97, 1.14,
      v=>{ S.fit=v; scheduleMorph(); },
      v=> v<1.02?'Snug' : v<1.08?'True to size' : 'Roomy'));
    paneClothing.appendChild(hg);

    // SOCKS
    const kg=el('div','group');
    kg.appendChild(el('h3',null,'<span class="dot"></span>Socks'));
    kg.appendChild(toggleRow('Socks', C.socks.on, v=>{ C.socks.on=v; rebuildGarment('socks'); updateGarments(); }));
    const krow=el('div','swatch-row');
    krow.append(colorChip(C.socks.color,v=>{ C.socks.color=v; garments.socks.mat.color.set(v); }),
                Object.assign(el('label'),{textContent:'Sock colour'}));
    kg.appendChild(krow);
    kg.appendChild(swatchPalette(v=>{ C.socks.color=v; garments.socks.mat.color.set(v); buildUI(); }));
    kg.appendChild(genericSlider('Height', C.socks.height, 0, 1,
      v=>{ C.socks.height=v; rebuildGarment('socks'); updateGarments(); }, sockLabel));
    kg.appendChild(el('div','hint','Socks show above low shoes — pair them with shorts or cropped pants.'));
    paneClothing.appendChild(kg);

    // FABRIC
    const fg=el('div','group');
    fg.appendChild(el('h3',null,'<span class="dot"></span>Fabric'));
    fg.appendChild(genericSlider('Finish', state.fabric, 0.25, 1.0,
      v=>{ state.fabric=v; refreshClothingMaterials(); },
      v=> v<0.45?'Satin' : v<0.75?'Cotton' : 'Matte'));
    paneClothing.appendChild(fg);
  }
}

// Switch between the bundled bodies. Each keeps its own shape; clothing is shared.
function switchBody(key){
  if(key===currentBody || !BODIES[key]) return;
  if(currentBody) state.bodyParams[currentBody]={...state.params};
  state.params={...defaultParams(), ...(state.bodyParams[key]||{})};
  state.body=key;
  loadModel(BODIES[key].url);
}

function segmented(options, value, onPick){
  const w=el('div','seg');
  w.setAttribute('role','radiogroup');
  options.forEach(([val,label])=>{
    const b=el('button','seg-btn'+(val===value?' on':''));
    b.type='button'; b.textContent=label;
    b.setAttribute('role','radio'); b.setAttribute('aria-checked',String(val===value));
    b.addEventListener('click',()=>{
      w.querySelectorAll('.seg-btn').forEach(x=>{ const on=x===b; x.classList.toggle('on',on); x.setAttribute('aria-checked',String(on)); });
      onPick(val); save();
    });
    w.appendChild(b);
  });
  return w;
}

function swatchPalette(onPick){
  const row=el('div','tone-row');
  ['#3f6fd8','#e2574c','#4bd0b8','#f2b33d','#7c6cf0','#3fa66a','#e8e8ec','#2e3440','#1a1d23','#c94f7c']
    .forEach(c=>{
      const s=el('button','tone'); s.style.background=c;
      s.addEventListener('click',()=>{ onPick(c); save(); });
      row.appendChild(s);
    });
  return row;
}

// Smoothly morph from the current body to a target set of params.
let tweenId=0;
function tweenParams(target, ms=420){
  const id=++tweenId;
  const from={...state.params};
  const start=performance.now();
  const dur=reduceMotion?0:ms;
  function step(now){
    if(id!==tweenId) return;
    const p=dur?Math.min(1,(now-start)/dur):1;
    const e=p<0.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;   // easeInOutCubic
    for(const k in target) state.params[k]=from[k]+(target[k]-from[k])*e;
    syncSliders(); applyMorphs(p<1);
    if(p<1) requestAnimationFrame(step); else save();
  }
  requestAnimationFrame(step);
}

function syncSliders(){
  for(const k in sliderEls){
    sliderEls[k].inp.value=state.params[k];
    sliderEls[k].out.textContent=fmtParam(k,state.params[k]);
  }
}

/* ---------- tabs ---------- */
document.getElementById('tabs').addEventListener('click',e=>{
  const b=e.target.closest('.tab'); if(!b) return;
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));
  const which=b.dataset.tab;
  paneBody.hidden = which!=='body';
  paneClothing.hidden = which!=='clothing';
});

/* ============================================================
   BUTTONS
============================================================ */
document.getElementById('rotateBtn').addEventListener('click',e=>{
  autoRotate=!autoRotate; e.currentTarget.classList.toggle('accent',autoRotate);
});
document.getElementById('frontBtn').addEventListener('click',()=>{
  avatarRoot.rotation.y=facing;
  frameModel();
});
document.getElementById('resetBtn').addEventListener('click',()=>{
  for(const k in PARAMS) state.params[k]=PARAMS[k].def;
  state.clothing=JSON.parse(JSON.stringify(CLOTHING));
  state.skinColor='#c8a184'; state.fabric=0.78;
  state.eyeColor='#5a3a22'; if(eyeMat) eyeMat.userData.u.irisCol.value.set(state.eyeColor);
  if(bodyMat) bodyMat.color.set(state.skinColor);
  buildUI();
  for(const k in garments) rebuildGarment(k);
  refreshClothingMaterials();
  applyShoeLook(shoeMats, state.clothing.shoes);
  applyMorphs(); save();
});
const modal=document.getElementById('modal'), frame=document.getElementById('rpmFrame');
function openCreator(){ frame.src=`https://${RPM_SUBDOMAIN}.readyplayer.me/avatar?frameApi&clearCache`; modal.hidden=false; }
function closeCreator(){ modal.hidden=true; frame.src='about:blank'; }
['createBtn','createBtn2','createBtn3'].forEach(id=>{ const e=document.getElementById(id); if(e) e.addEventListener('click',openCreator); });
document.getElementById('modalClose').addEventListener('click',closeCreator);
modal.addEventListener('click',e=>{ if(e.target===modal) closeCreator(); });
window.addEventListener('message',ev=>{
  let j; try{ j=JSON.parse(ev.data); }catch(e){ return; }
  if(!j||j.source!=='readyplayerme') return;
  if(j.eventName==='v1.frame.ready')
    frame.contentWindow.postMessage(JSON.stringify({target:'readyplayerme',type:'subscribe',eventName:'v1.**'}),'*');
  if(j.eventName==='v1.avatar.exported'){ closeCreator(); loadModel(j.data.url); }
});
document.getElementById('urlForm').addEventListener('submit',e=>{
  e.preventDefault();
  const v=document.getElementById('urlInput').value.trim();
  if(v) loadModel(v);
});
const panel=document.getElementById('panel');
document.getElementById('panelHead').addEventListener('click',()=>{
  if(window.matchMedia('(max-width:820px)').matches) panel.classList.toggle('open');
});

/* ============================================================
   LOOP
============================================================ */
function resize(){
  const w=viewport.clientWidth,h=viewport.clientHeight; if(!w||!h) return;
  renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);
if(window.ResizeObserver) new ResizeObserver(resize).observe(viewport);
const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Keep the view's focus point on the model so panning can't lose it below the floor.
const _clampShift=new THREE.Vector3();
function clampTarget(){
  const t=controls.target, h=targetHeight*(state.params.height||1);
  _clampShift.set(
    Math.min(0.8,Math.max(-0.8,t.x))-t.x,
    Math.min(h*1.05,Math.max(0.05,t.y))-t.y,
    Math.min(0.8,Math.max(-0.8,t.z))-t.z);
  if(_clampShift.lengthSq()>0){ t.add(_clampShift); camera.position.add(_clampShift); }
}
controls.addEventListener('change',clampTarget);

function loop(){
  requestAnimationFrame(loop);
  if(autoRotate&&!reduceMotion&&currentModel) avatarRoot.rotation.y+=0.005;
  controls.update();
  renderer.render(scene,camera);
}

/* ============================================================
   PERSISTENCE + BOOT
============================================================ */
const KEY='bodyforge.v3';
function save(){
  if(currentBody) state.bodyParams[currentBody]={...state.params};
  try{ localStorage.setItem(KEY,JSON.stringify({
    params:state.params, skinColor:state.skinColor, modelUrl:state.modelUrl,
    body:state.body, bodyParams:state.bodyParams, eyeColor:state.eyeColor,
    clothing:state.clothing, fabric:state.fabric })); }catch(e){}
}
function load(){
  try{
    const d=JSON.parse(localStorage.getItem(KEY)||'{}');
    if(d.params) for(const k in PARAMS){ if(typeof d.params[k]==='number') state.params[k]=d.params[k]; }
    if(d.skinColor) state.skinColor=d.skinColor;
    if(d.modelUrl) state.modelUrl=d.modelUrl;
    if(d.body && BODIES[d.body]) state.body=d.body;
    if(d.bodyParams && typeof d.bodyParams==='object') state.bodyParams=d.bodyParams;
    if(d.eyeColor) state.eyeColor=d.eyeColor;
    if(d.clothing) for(const k in state.clothing) Object.assign(state.clothing[k], d.clothing[k]||{});
    if(typeof d.fabric==='number') state.fabric=d.fabric;
  }catch(e){}
}

load();
resize();
loop();
loadModel(state.modelUrl || BODIES[state.body].url);
loader.load(SHOE_MODEL, g=>{
  shoeTemplate=buildShoeTemplate(g);
  attachShoes();
}, undefined, err=>console.warn('Shoe model not loaded:', err));

// Dev-server-only handle for inspecting the scene from the console (removed from builds).
if(import.meta.env.DEV) window.__bodyforge={ camera, controls, state, applyMorphs, buildUI, avatarRoot,
  get bodyMesh(){ return bodyMesh; }, get shoes(){ return shoeInst; }, THREE,
  get internals(){ return { seg, LM, axes, footFit, coarsePos, shoeTemplate, basePositions, bodyIndex }; },
  weldMesh, positionIds };

setupControlsLegend({
  viewport, canvas, camera, controls,
  onFront:()=>document.getElementById('frontBtn').click(),
  onRecenter:()=>frameModel(),
  onSpin:()=>document.getElementById('rotateBtn').click()
});

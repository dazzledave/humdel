# BodyForge Studio

A customizable 3D human built with **Three.js**, with a **male and a female body**. It loads a
plain `.glb` body and gives it a full body-sculpting and clothing system — no rigging required —
plus real 3D shoes. Switch bodies at the top of the Body tab; each keeps its own shape, and
clothing carries over.

## Run it

```bash
npm install
npm run dev
```

Opens at http://localhost:5173.

## Moving the view

A legend in the bottom-left of the viewer shows every control (collapse it with its header):

| Action     | Mouse                     | Keyboard            | Touch                 |
|------------|---------------------------|---------------------|-----------------------|
| Rotate     | hold **left** button + drag | `←` `→` (tilt `↑` `↓`) | drag with one finger  |
| Zoom       | scroll wheel              | `+` `−`             | pinch                 |
| Move view  | hold **right** button + drag | `Shift` + arrows    | drag with two fingers |
| Face front | —                         | `F`                 | —                     |
| Re-center  | —                         | `C`                 | —                     |
| Spin       | —                         | `Space`             | —                     |

Click the 3D view first so keyboard input goes to it. The row for whatever you're doing
lights up in the legend.

## Files

| File | What it does |
|---|---|
| `src/main.js` | Scene, body rig + deformation, clothing, UI, persistence |
| `src/subdivide.js` | Curved (PN-triangle) subdivision that smooths the body mesh |
| `src/shoes.js` | Loads and orients the shoe model; styles, patterns, materials |
| `src/legend.js` | Controls legend and keyboard navigation |
| `public/models/human.glb` | The male body (low-poly, smoothed at load) |
| `public/models/humanfemale.glb` | The female body (high-detail sculpt, with eyes) |
| `public/models/shoe.glb` | The shoe (one right shoe, mirrored for the left foot) |

## How it works

### Loading a body
Models can arrive split into several pieces (the female sculpt is 4 pieces plus the eyes). The
pieces are merged into one mesh and the seams welded so the skin shades without seams. Separate
materials stay as groups — the eyes get a material that draws the sclera, iris and pupil (no
textures needed), with an eye-colour picker. Low-poly bodies get curved subdivision; detailed
sculpts are used as-is. Each body is normalized to its own height (1.80 m / 1.68 m), and the
front is found from the feet, so any standing model faces the camera.

Switching back to a body you have already loaded is quick: processed bodies are kept in memory.

### Procedural rig (no skeleton needed)
`human.glb` is an unrigged static mesh, so the app builds an implicit rig from the mesh
**topology** at load time:

- **Arms & hands** — the mesh is cut at the highest height where the arms come away from the
  torso as separate connected pieces, so every finger is classified exactly. The wrist is
  the narrowest point of the lower arm.
- **Legs & feet** — the crotch is the highest cut where the lower body splits into two
  connected legs. Feet are found from the depth bulge near the floor, and each foot's
  direction (feet usually turn out a little) is measured too.
- **Torso, neck, head** — a smooth girth curve through control points (hip → waist → chest →
  shoulder → neck → head), plus front/back fields for belly, chest and glutes.

How the parts move:

- Arms ride on the torso: they shift out by exactly how much the torso grew at the armpit
  plus shoulder width, stretch from the shoulder pivot, and hands scale as one piece about
  the wrist. The shoulder line raises or drops the shoulders and arms together.
- A second pass measures how much the body grew at every height and pushes the arms out
  wherever a bigger belly or hips would otherwise clip through them.
- Legs thicken about their own axes (thighs and calves separately), with a centre-continuous
  axis near the crotch so the surface never tears. Feet stay planted.
- Overall height also broadens the body a little, so tall bodies stay in proportion.

The deformed control mesh (~10k triangles) is then smoothed by two levels of curved
subdivision (~158k triangles) for rounded silhouettes. A full update takes about 20 ms, and
slider input is batched to one update per frame.

### Body controls (25) and presets
Overall height & build · head size · neck length & thickness · torso length · shoulder width
& line · chest width & depth · waist · belly · hips · glutes · body depth · arm length &
thickness · upper arm · forearm · hand size · leg length & thickness · thighs · calves · foot
size. Presets (Athletic, Slim, Heavy-set, Muscular, Tall, Petite) animate smoothly. Skin tone
has a picker and quick swatches.

### Clothing
Garments are generated **from the body surface itself**: body triangles are clipped exactly
along each hem and pushed out along the surface normals, so they re-fit automatically whenever
the body changes and have clean hems.

- **Top** — colour, sleeves (none → long), neckline (crew → deep scoop), length, fit
- **Bottoms** — colour, leg length (briefs → full), fit. With shoes on, full-length pants run
  into the shoe.
- **Socks** — colour, height (ankle → knee-high)
- **Fabric** — finish from satin to matte

### Shoes
The shoe model is fitted to each foot every update — length, width, stance and the direction
the foot points — and the foot is tucked inside it (including under the low front of the
upper, using a height profile measured from the shoe). The body stands on the sole, so shoes
add real height (the readout shows barefoot height).

- **Styles** — Classic Black, Checkerboard, True White, Navy Canvas, Burgundy Suede, Stealth
  Leather, Cherry Patent, Sunset Stripe, Tartan
- **Upper** — colour, pattern (solid / checker / stripes / plaid) with its own colour and size
- **Material** — canvas (woven texture), suede, leather (grain), patent (high gloss)
- **Details** — sole, sole stripe, stitching and lining colours
- **Fit** — sole height (flat → platform) and size

The shoe's parts are identified by their vertex counts. A different shoe `.glb` still loads —
its parts fall back to a sole/upper split by height.

## Swapping models

Drop a `.glb` into `public/models/` and load it via the URL box (e.g. `/models/mine.glb`), or
change `DEFAULT_MODEL` / `SHOE_MODEL` in `src/main.js`. Rigged models (e.g. Ready Player Me via
the **Avatar** button) switch to bone-based scaling; procedural clothing and shoes are skipped
for those, since they come dressed.

## Credits

All bundled models are licensed **CC-BY-4.0**; the credits are shown in the app's Body tab —
keep them if you ship this.

- Male body: “Human” by **aaron.kalvin** —
  [Sketchfab](https://sketchfab.com/3d-models/human-03a70758739544b3aa705c13af3872b1)
- Female body: “Study Human Female Sculpt” by **Uladzislau** —
  [Sketchfab](https://sketchfab.com/3d-models/study-human-female-sculpt-854fbf358991477aab518e07556da906)
- Shoe: “Shoe” by **abdullahyeahyea** —
  [Sketchfab](https://sketchfab.com/3d-models/shoe-d1ce9883180e41649ceb0253525f8a18)

## Build

```bash
npm run build && npm run preview
```

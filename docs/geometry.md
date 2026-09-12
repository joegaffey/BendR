# BendR Geometry — the warp math

This document explains the math behind `reshade/BendR.fx` and (later) the standalone
app. The two share the same core, so this is the single source of truth.

## Coordinate conventions

- **Origin**: on the cylinder axis (center of curvature), **at floor level** (`y = 0`
  is the floor).
- **Axes**: +X right, +Y up, +Z forward (toward the front of the screen).
- **Units**: meters, angles in radians internally (degrees in the UI).
- **Cylinder axis**: vertical (along Y). The screen is a vertical slice of the
  cylinder, spanning `ScreenArcDeg` horizontally and, vertically, from
  `ScreenBase` to `ScreenBase + ScreenHeight` — i.e. it is mounted `ScreenBase`
  above the floor rather than resting on the axis origin. Eye and projector heights
  are therefore real heights above the floor.

## The three inputs that define a correct warp

A warp is only correct for a specific combination of:

1. **Projector pose** — where the light comes from: position `ProjPos` + rotation
   `ProjRotDeg` (yaw, pitch, roll) + intrinsics (`ProjHFovDeg`, `ProjAspect`).
   `ProjAspect` is the projector *panel* aspect — the physical output surface. It
   shapes the output frustum and is the primary, fixed property of your hardware.
2. **Screen shape** — the cylinder: `ScreenRadius`, `ScreenHeight`, `ScreenArcDeg`,
   and `ScreenBase` (height of the screen's bottom edge above the floor).
3. **Eye-point** — where the viewer's head is: `EyePos`, plus the game's assumed
   camera FOV `GameHFovDeg` and the *signal* aspect `SourceAspect`. `SourceAspect`
   describes what the game actually renders, which normally matches the projector
   panel but need not. See "Panel vs signal" below.

## Panel vs signal (aspect handling)

Two aspects are modelled independently, mirroring a real rig:

- **Panel aspect (`ProjAspect`)** — the projector's physical output. Primary.
- **Signal aspect (`SourceAspect`)** — what the game feeds it.

When the two match, the game fills the panel. When they differ, the result is the
same as feeding a real display a mismatched signal:

- **Signal narrower than the panel** → the game frame doesn't reach the panel
  edges; those pixels map to source UVs outside `[0,1]` and are drawn black
  (pillarbox bars).
- **Signal wider than the panel** (e.g. the bundled triple-screen captures at
  ~5.3:1) → more of the frame maps inside `[0,1]` across the panel, so the extreme
  left/right fall off the panel edge and are clipped.

This "bars vs clip" behaviour is not a separate code path: it falls out of Step 5,
where eye directions are mapped into the *signal's* image plane (`GameHFovDeg` +
`SourceAspect`) while the warp itself works in *panel* space (`ProjAspect`). UVs that
land outside `[0,1]` are the bars; the panel simply shows less of a wide signal.

Change any one of these and the correct warp changes. This is why generic radial
lens shaders can't do off-axis: they ignore projector pose and eye-point.

## Inverse warp (why we go output -> source)

A post-process shader runs per **output** pixel and must decide which **source**
(game) pixel to sample. So we compute the mapping *backwards*:

```
output pixel  ->  projector ray  ->  screen point S  ->  eye ray  ->  source UV
```

### Step 1 — Output pixel to projector ray (local space)

Pixel UV in [0,1] -> NDC [-1,1]. With horizontal half-angle `tanH = tan(HFov/2)`
and `tanV = tanH / aspect`:

```
rayLocal = normalize( (ndc.x * tanH, ndc.y * tanV, 1) )
```

This is a standard pinhole projector model looking down its local +Z.

### Step 2 — Projector ray to world space

Rotate by the projector's yaw/pitch/roll and originate at `ProjPos`:

```
rayWorld  = normalize( R_proj * rayLocal )
rayOrigin = ProjPos
```

`R_proj = Ryaw * Rpitch * Rroll` (see `rotationYPR`).

### Step 3 — Intersect with the cylinder

Infinite vertical cylinder radius `R` on the Y axis. Using only XZ components
(`o = rayOrigin.xz`, `d = rayWorld.xz`):

```
a = d·d
b = 2 (o·d)
c = o·o - R²
disc = b² - 4ac
roots t0, t1  (ta = min, tb = max)
```

**Choosing the correct face (front vs rear projection):** rather than always taking
the far wall, pick the **nearest positive root whose hit lies within the screen arc
and height**. This makes the warp correct for any placement:
- **Front projector inside the cylinder** → ray exits through the far wall (that's
  the illuminated surface).
- **Rear projector outside the cylinder** → ray enters through the near wall first;
  that near hit is the illuminated surface.

```
S = rayOrigin + t * rayWorld
```

Bounds test used both to select the root and to clip:
- horizontal: `atan2(S.x, S.z)` within `±ScreenArcDeg/2`
- vertical: `S.y` within `[ScreenBase, ScreenBase + ScreenHeight]`

Pixels with no valid in-bounds hit are drawn black.

**Rear-projection mirror:** when the projector is outside the cylinder
(`length(projPos.xz) > radius`), the emitted image is seen through the screen from
the far side, so it is mirrored left-right. The shader flips the output pixel's
`ndc.x` before casting the ray in that case.

### Step 4 — Screen point to eye ray

The viewer at `EyePos` sees the physical point S along:

```
viewDir = normalize(S - EyePos)
```

### Step 5 — Eye ray to source UV (game camera model)

We assume the game renders a standard rectilinear camera looking down +Z with
horizontal FOV `GameHFovDeg`. The vertical FOV follows the **signal** aspect
`SourceAspect` (see "Panel vs signal"), not the projector panel aspect. Project
`viewDir` onto the image plane at z=1:

```
gTanH = tan(GameHFov/2)
gTanV = gTanH / SourceAspect
img.x = (viewDir.x / viewDir.z) / gTanH
img.y = (viewDir.y / viewDir.z) / gTanV
srcUV = (img.x*0.5 + 0.5,  -img.y*0.5 + 0.5)
```

Sample the game frame at `srcUV`. UVs outside `[0,1]` mean the viewer is looking at a
part of the panel the game didn't render — drawn black. This is exactly the pillarbox/
letterbox mechanism from "Panel vs signal": a narrower signal produces bars, a wider
signal is clipped by the panel. When the loaded source image's own aspect differs from
`SourceAspect`, it is center-cropped (clipped, not stretched) to `SourceAspect` before
sampling.

## Calibration workflow

1. Enable **Show Calibration Grid**. The grid is drawn in **source (game) space**,
   so if your geometry parameters are correct, the projected grid looks **straight
   and evenly spaced** from your seat.
2. Set `GameHFovDeg` to match your sim's actual FOV setting. Set the **panel aspect**
   (`ProjAspect`) to your projector's native ratio and the **signal aspect**
   (`SourceAspect`) to what the game outputs — normally the same, but set them
   differently to reproduce black bars or to clip a wider capture. Presets cover
   16:9, 16:10, 21:9, 32:9, 4:3, 1:1.
3. Enter measured values: screen radius/height/arc and its base height above the
   floor, your eye height and position, projector height and position. Measure from
   the cylinder axis where possible.
4. Fine-tune projector yaw/pitch/roll and `ProjHFovDeg` until grid lines are straight
   and the beam covers the screen. Projector aim and FOV are manual (no auto-fit), so
   they behave like a real projector. On a fixed rig this is a one-time step.

## Multi-projector and edge blending (Phase 2)

Normative detail is in `03-geometry.md`, "Multi-projector and edge blending". In short:
N projectors share the screen and eye-point, and each runs the same Steps 1–7 with its
own pose and intrinsics — no new warp math. A screen point is covered by a projector when
its inverse projection lands inside that projector's panel. The composite is additive in
linear light:

```
C(S) = Σ_j α_j(S) · L_j(S)
```

with a partition-of-unity alpha (`Σ α_j = 1`) built from per-edge smoothstep ramps. Each
projector carries `blackLevel`, `gain`, and `gamma`, so mismatched hardware produces a
real seam until corrected. Black-level lift raises every projector's black floor to the
deepest-overlap value so black stays uniform. Ramping happens in linear light (decode
sRGB, blend, re-encode). This is the only genuinely new math over the single-projector
case.

## Known simplifications (Phase 1)

- **Game FOV assumed rectilinear.** Its vertical extent follows `SourceAspect`,
  which is independent of the projector panel aspect. Ultra-wide sim FOVs may want a
  per-axis game FOV; easy to add.
- **Single eye-point** — correct for one head position (inherent to all such warps).
- **Single projector in Phase 1** — the ReShade shader warps one output (C-6). The web
  simulator now supports the multi-projector composite above; the standalone app is
  Phase 2.
- **Cylinder only** — semi-spherical mode swaps the Step-3 intersection for a sphere.

## Roadmap for this math

- [ ] Per-axis game FOV (independent H/V) for ultra-wide.
- [ ] Sphere intersection for semi-spherical screens.
- [ ] Bake the mapping into a warp-map texture (perf) instead of per-pixel solve.
- [x] Multi-projector: same solve per projector + overlap alpha ramp + black-level
      (normative model in `03-geometry.md`; implemented in the web simulator, pending
      the standalone app).

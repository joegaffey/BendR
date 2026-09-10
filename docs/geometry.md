# BendR Geometry — the warp math

This document explains the math behind `reshade/BendR.fx` and (later) the standalone
app. The two share the same core, so this is the single source of truth.

## Coordinate conventions

- **Origin**: the cylinder axis (center of curvature).
- **Axes**: +X right, +Y up, +Z forward (toward the front of the screen).
- **Units**: meters, angles in radians internally (degrees in the UI).
- **Cylinder axis**: vertical (along Y). The screen is a vertical slice of the
  cylinder, spanning `ScreenArcDeg` horizontally and `ScreenHeight` vertically.

## The three inputs that define a correct warp

A warp is only correct for a specific combination of:

1. **Projector pose** — where the light comes from: position `ProjPos` + rotation
   `ProjRotDeg` (yaw, pitch, roll) + intrinsics (`ProjHFovDeg`, `ProjAspect`).
2. **Screen shape** — the cylinder: `ScreenRadius`, `ScreenHeight`, `ScreenArcDeg`.
3. **Eye-point** — where the viewer's head is: `EyePos`, plus the game's assumed
   camera FOV `GameHFovDeg`.

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
- vertical: `|S.y|` within `ScreenHeight/2`

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
horizontal FOV `GameHFovDeg`. Project `viewDir` onto the image plane at z=1:

```
gTanH = tan(GameHFov/2)
gTanV = gTanH / aspect
img.x = (viewDir.x / viewDir.z) / gTanH
img.y = (viewDir.y / viewDir.z) / gTanV
srcUV = (img.x*0.5 + 0.5,  -img.y*0.5 + 0.5)
```

Sample the game frame at `srcUV`. UVs outside [0,1] mean the viewer is looking at a
part of the screen the game didn't render — drawn black.

## Calibration workflow

1. Enable **Show Calibration Grid**. The grid is drawn in **source (game) space**,
   so if your geometry parameters are correct, the projected grid looks **straight
   and evenly spaced** from your seat.
2. Set `GameHFovDeg` to match your sim's actual FOV setting.
3. Enter measured values: screen radius/height/arc, your eye position, projector
   position. Measure from the cylinder axis where possible.
4. Fine-tune projector yaw/pitch/roll until grid lines are straight and the image
   fills the screen. On a fixed rig this is a one-time step.

## Known simplifications (Phase 1)

- **Game FOV assumed rectilinear** and matching projector aspect. Ultra-wide sim
  FOVs may want a per-axis game FOV; easy to add.
- **Single eye-point** — correct for one head position (inherent to all such warps).
- **No blending** — single projector only. Multi-projector edge blend arrives in the
  standalone app (Phase 2).
- **Cylinder only** — semi-spherical mode swaps the Step-3 intersection for a sphere.

## Roadmap for this math

- [ ] Per-axis game FOV (independent H/V) for ultra-wide.
- [ ] Sphere intersection for semi-spherical screens.
- [ ] Bake the mapping into a warp-map texture (perf) instead of per-pixel solve.
- [ ] Multi-projector: same solve per projector + overlap alpha ramp + black-level.

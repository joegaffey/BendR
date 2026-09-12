# BendR — Geometry Specification

Normative reference for coordinate conventions and the warp derivation. All
implementations must agree with this document. `docs/geometry.md` is the
implementation-facing companion.

## Coordinate system

- **Origin**: the cylinder axis, i.e. the screen's centre of curvature.
- **Axes**: +X right, +Y up, +Z forward toward the front of the screen. Right-handed.
- **Units**: metres. Angles in degrees at the interface, radians internally.
- **Cylinder axis**: vertical, along Y. The screen is a vertical slice of the cylinder
  spanning `screenArcDeg` horizontally, centred on +Z, and `screenHeight` vertically.
- **Screen centre**: the point `(0, 0, screenRadius)`.

The origin choice matters: eye-point and projector pose are expressed as offsets from
the centre of curvature, which is the natural datum for a curved screen.

## Parameters

### Screen

| Name | Unit | Default | Range |
|---|---|---|---|
| `screenRadius` | m | 1.5 | 0.3 – 5.0 |
| `screenHeight` | m | 1.0 | 0.3 – 4.0 |
| `screenArcDeg` | deg | 150 | 30 – 270 |

### Eye-point

| Name | Unit | Default | Range |
|---|---|---|---|
| `eyeX`, `eyeY`, `eyeZ` | m | 0, 0, 0 | −3 – 3 |
| `gameHFovDeg` | deg | 90 | 30 – 160 |

Gaze is fixed along +Z and is not a parameter (FR-12).

### Projector

| Name | Unit | Default | Range |
|---|---|---|---|
| `projX`, `projY`, `projZ` | m | 0, 0.6, −1.3 | −4 – 4 |
| `projYaw`, `projPitch`, `projRoll` | deg | 0, −15, 0 | −60 – 60 |
| `projHFovDeg` | deg | 90 | 20 – 150 |
| `projAspect` | ratio | 1.777 | 1.0 – 2.5 |

The default is an overhead mount: above and behind the eye, tilted down. This avoids
the viewer's head shadowing the beam, which rules out placements level with or behind
the head at eye height.

With multiple projectors (FR-9), each projector has its own copy of this parameter set,
plus the per-projector blend parameters in "Multi-projector and edge blending" below.

### Blend (per projector)

| Name | Unit | Default | Range |
|---|---|---|---|
| `blendLeft`, `blendRight`, `blendTop`, `blendBottom` | fraction of half-extent | 0 | 0 – 1 |
| `blackLevel` | linear | 0 | 0 – 0.1 |
| `gamma` | – | 2.2 | 1.0 – 3.0 |
| `gain` | – | 1.0 | 0.5 – 1.0 |

### Derived values

`projYaw` and `projPitch` are computed when auto-aim is enabled; `projHFovDeg` is
computed when auto-fit is enabled. See "Derived pose" below.

## The three inputs that define a correct warp

A warp is correct only for a specific combination of:

1. **Projector pose** — where the light originates, plus intrinsics.
2. **Screen shape** — the surface the light lands on.
3. **Eye-point** — the viewpoint the correction targets.

Changing any one changes the correct warp. Generic radial lens shaders cannot express
off-axis correction because they model neither projector pose nor eye-point.

## Warp derivation

The warp is an **inverse mapping**: for each output pixel, find the source UV. This
suits post-process shaders, which run per output fragment.

```
output pixel -> projector ray -> screen point S -> eye ray -> source UV
```

### Step 1 — Output pixel to projector ray

Pixel UV in [0,1] maps to NDC in [−1,1] with Y inverted for screen-space. With
`tanH = tan(projHFov/2)` and `tanV = tanH / projAspect`:

```
rayLocal = normalize( (ndc.x * tanH, ndc.y * tanV, 1) )
```

A pinhole projector looking down its local +Z.

### Step 2 — Rear-projection mirror

If the projector lies outside the cylinder, `length(projPos.xz) > screenRadius`, its
light passes through the screen and reaches the viewer from the far side, so the
emitted image is mirrored left-to-right. Negate `ndc.x` before building the ray.

This is derived from position, never a user-set mode (FR-8). A discontinuity at exactly
`length(projPos.xz) == screenRadius` is expected: it is the physical transition.

### Step 3 — Projector ray to world space

```
rayWorld  = normalize( R_proj * rayLocal )
rayOrigin = projPos
```

`R_proj = Ryaw · Rpitch · Rroll`, with

```
Ryaw   = [[ cy, 0, sy], [  0, 1,   0], [-sy, 0, cy]]
Rpitch = [[  1, 0,  0], [  0, cp, -sp], [  0, sp, cp]]
Rroll  = [[ cr, -sr, 0], [ sr, cr,  0], [  0,  0,  1]]
```

Note `Rpitch · (0,0,1) = (0, −sp, cp)`: positive pitch tilts the forward vector
downward. Visual markers must match this or they will disagree with the warp.

**Column-major trap.** The matrices above are written row-major. GLSL's `mat3(...)`
takes its arguments **column-major**, so a direct transcription of the rows into a
`mat3` constructor silently produces the transpose. A transposed `Ryaw` negates the
horizontal aim, so auto-aim points the wrong way in X and the screen drifts out of the
panel as the projector moves sideways. HLSL's `float3x3(...)` is row-major, so the same
rows are correct there. Transpose (or reorder) the arguments when porting to GLSL.

### Step 4 — Intersect the cylinder, choosing the illuminated face

Solve for the infinite vertical cylinder of radius `R` on the Y axis using XZ
components only, with `o = rayOrigin.xz` and `d = rayWorld.xz`:

```
a = d·d
b = 2 (o·d)
c = o·o − R²
disc = b² − 4ac                 (disc < 0 or a ~ 0 -> miss)
roots ta = min(t0,t1), tb = max(t0,t1)
```

Select the **nearest positive root whose hit lies within the screen bounds**:

```
if ta > eps and inBounds(o + ta·d): t = ta
else if tb > eps and inBounds(o + tb·d): t = tb
else: miss
S = rayOrigin + t · rayWorld
```

This is correct for any placement without a mode flag:

- **Front projector inside the cylinder** — the ray exits through the far wall, which
  is the illuminated surface.
- **Rear projector outside the cylinder** — the ray enters through the near wall first,
  which is the illuminated surface.

Taking `max(t0,t1)` unconditionally is incorrect for rear projection.

### Step 5 — Screen bounds test

```
inBounds(S) = |atan2(S.x, S.z)| <= screenArcDeg/2  and  |S.y| <= screenHeight/2
```

Used both to select the root in Step 4 and to clip output. Misses render black.

### Step 6 — Screen point to eye ray

```
viewDir = normalize(S − eyePos)
```

The direction along which the viewer sees the illuminated point S.

### Step 7 — Eye ray to source UV

Assume the game renders a rectilinear camera looking down +Z with `gameHFovDeg`.
Project onto the image plane at z = 1:

```
gTanH = tan(gameHFov/2)
gTanV = gTanH / aspect
img.x = (viewDir.x / viewDir.z) / gTanH
img.y = (viewDir.y / viewDir.z) / gTanV
srcUV = ( img.x·0.5 + 0.5,  −img.y·0.5 + 0.5 )
```

`viewDir.z <= eps` means the point is behind or parallel to the game camera plane and
has no source data. `srcUV` outside [0,1] means the viewer is looking at screen area
the game did not render. Both render black.

## Derived pose

### Auto-aim

Point the projector at screen centre `(0, 0, screenRadius)`:

```
d = screenCentre − projPos
projYaw   = atan2(d.x, d.z)
projPitch = atan2(d.y, sqrt(d.x² + d.z²))
projRoll  = 0
```

Aim is a convenience for beam coverage, not a correctness input — it changes which
pixels land where, not what is geometrically correct. Contrast FR-12: the eye's aim is
deliberately not derived, because it *is* tied to correctness.

### Auto-fit FOV

Sample points around the screen edge across the arc at the top, middle, and bottom.
For each, compute the angle from the aim axis, separated into horizontal and vertical
components. Take the maximum, convert to a horizontal FOV allowing for aspect, apply a
small margin, and clamp to the valid range.

Without auto-fit, changing screen radius, arc, or height can place the entire screen
outside a fixed beam, so every ray misses and output goes black.

## Multi-projector and edge blending

Phase 2 extends the single-projector derivation to a rig of N projectors that share one
screen and one eye-point (FR-9, FR-18, FR-19, FR-20). Each projector is independent: it
has its own pose, intrinsics, and photometric parameters, and its warp is Steps 1–7 above
computed with that projector's values. **There is no new warp math.** Blending is the
only genuinely new computation.

### Coverage

A screen point S is illuminated by projector *j* when both hold:

1. S is within the screen bounds (Step 5).
2. The inverse of Steps 1–4 maps S into projector *j*'s panel: `|u_j| ≤ 1` and
   `|v_j| ≤ 1`, where `(u_j, v_j)` are the panel NDC coordinates of S for projector *j*.

This is the inverse of the per-projector ray cast, and is derived from geometry rather
than a user-set coverage mode (principle 4). A point may be covered by zero, one, or
several projectors; the number covering S is written `k(S)`.

### Composite model

Projected light adds on the screen, so blending is performed in **linear light**, after
decoding the source signal from sRGB:

```
C(S) = Σ_j α_j(S) · L_j(S)
```

where:

- `L_j(S)` is the linear-light output projector *j* deposits at S, after the photometric
  model and black-level lift below.
- `α_j(S) ∈ [0,1]` is projector *j*'s blend weight at S, zero where it does not cover S.

The alpha weights form a **partition of unity** across the overlap:

```
Σ_j α_j(S) = 1     for every covered S
```

This is normative: it keeps total luminance constant across the overlap, so the seam
disappears for matched projectors. Where the sum of the unnormalised weights is nonzero,
implementations normalise:

```
α_j(S) = w_j(S) / Σ_k w_k(S)
```

Complementary ramps between adjacent projectors are the intended way to satisfy this and
make the normalisation a no-op in the common two-projector case.

### Edge ramps

Each projector has four blend widths, `blendLeft`, `blendRight`, `blendTop`, and
`blendBottom`, expressed as a fraction of the panel half-width (horizontal) or
half-height (vertical). A width of 0 is a hard edge.

Work in panel coordinates `p = (u_j+1)/2` and `q = (v_j+1)/2`, both in [0,1]. For a
width `w ∈ [0,1]` define the separable ramp:

```
ramp(t, w) = 1                        if w = 0
           = smoothstep(0, w, t)      otherwise
```

The unnormalised weight is then:

```
w_j(S) = min( ramp(p,     blendLeft),
              ramp(1−p,   blendRight),
              ramp(q,     blendBottom),
              ramp(1−q,   blendTop) )
```

`min` combines the four edges without over-attenuating corners. Widths should be set so
adjacent projectors' ramps overlap; across the overlap the two ramps are complementary
and sum to 1.

### Photometric model (per projector)

Real projectors differ. Three per-projector photometric parameters are modelled, applied
to the signal before blending:

```
L_j = blackLevel_j + gain_j · (signal_linear)^gamma_j
```

- `blackLevel_j` — linear light emitted for a black signal.
- `gain_j` — peak white above black, relative to the rig reference.
- `gamma_j` — the projector's transfer exponent (default 2.2).

Modelling these is what makes blend validation meaningful: with identical projectors the
ramps sum to 1 and no seam can appear, so black-level lift and gamma correction are never
exercised. Full colour/white-point matching remains out of scope (`01-overview.md`).

### Black-level lift

Because black is additive, the composite black floor at S is the sum of the covering
projectors' black levels:

```
black(S) = Σ_j α_j(S) · blackLevel_j
```

In the deepest overlap, K projectors with equal black `b` give `K·b`, brighter than a
single projector's `b`. **Black-level lift** raises every projector's black floor to that
deepest-overlap value `B = max_S black(S)`, so black is uniform across the screen:

```
L_j' = B + (1 − B) · (gain_j · (signal_linear)^gamma_j)
```

With a partition-of-unity alpha and a common lift B, the composite black is B everywhere.
This is FR-19.

### Gamma

All of the above is computed in linear light. The source signal is decoded from sRGB
before applying `gamma_j`, the ramps, and the sum, and the composite is re-encoded to
sRGB for display. The ramp shape is applied to linear values, not to gamma-encoded ones;
this is what FR-20 means by gamma-correct ramps.

### Verification

- **AC-8** — two projectors with matched photometrics, ramps set to overlap, produce no
  visible seam in the grid or a flat field, and uniform black. Introducing a gain or
  gamma mismatch makes a seam appear that the corresponding per-projector control nulls.
- **AC-9** — each projector's warp is independently correct: the grid is straight for
  every projector regardless of the others' poses.

## Orientation of visual markers

Markers representing the projector must use the direction vector from Step 3, not Euler
angles applied independently, and must build the rotation from an orthonormal basis:

```
z = normalize(forward)
up = (0,1,0), or (0,0,1) if |z · up| > 0.999
x = normalize(up × z)
y = normalize(z × x)
```

Two failure modes this avoids:

- **Geometry axis mismatch.** A cone primitive has its axis along +Y; it must be
  pre-rotated so its axis is +Z before the pose is applied.
- **Antiparallel degeneracy.** Building a rotation directly from +Z to the forward
  vector is degenerate when forward approaches −Z, which occurs for rear projection.
  Infinitely many rotations satisfy it, so small position changes cause the orientation
  to snap. The basis construction with a fallback up vector is stable everywhere.

## Simplifications

| Simplification | Consequence | Resolution |
|---|---|---|
| Game FOV is rectilinear and matches projector aspect | Ultra-wide source may be slightly off | Per-axis game FOV |
| Single eye-point | Correct for one viewpoint | Inherent (C-4) |
| Ideal cylinder, pinhole projector | Screen sag and lens distortion uncorrected | Mesh offset layer (FR-16) |
| Additive overlap, per-projector black/gain/gamma only | White-point and per-channel colour differences uncorrected | Out of scope (`01-overview.md`) |
| Cylinder only | Dome unsupported | Sphere intersection in Step 4 |
| Per-fragment analytic solve | Redundant computation | Bake to a warp-map texture |

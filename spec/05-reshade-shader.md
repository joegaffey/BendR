# BendR — ReShade Shader Specification

**Path:** `reshade/BendR.fx` — **Status:** written, not yet tested on hardware

Phase 1 delivery: a post-process shader that applies off-axis cylindrical correction to
the final rendered frame of almost any game or sim on a single projector.

## Why post-process injection

ReShade hooks the game's present call and hands the shader the final frame as a texture
plus output UVs. A shader answers "for this output pixel, which input UV should I
sample?" — which is exactly the inverse mapping of `03-geometry.md`. The mechanism is
therefore well suited to off-axis correction; the limitation of typical warp shaders is
that they implement symmetric radial distortion, not that injection is unsuitable.

## Requirements

- Windows, with the game running on the projector display.
- ReShade installed against the game (DX11/DX12/OpenGL/Vulkan).
- Shader placed in the ReShade shaders folder, typically
  `<game>\reshade-shaders\Shaders\BendR.fx`.

## Parameters

Exposed as ReShade uniforms, grouped by category. Defaults and ranges match
`03-geometry.md`; the demo and shader are kept in sync.

| Category | Parameters |
|---|---|
| Screen | `ScreenRadius`, `ScreenHeight`, `ScreenArcDeg` |
| Eye-point | `EyePos` (x,y,z), `GameHFovDeg` |
| Projector | `ProjPos` (x,y,z), `ProjRotDeg` (yaw,pitch,roll), `ProjHFovDeg`, `ProjAspect` |
| Calibration | `ShowGrid`, `GridLines`, `GridThickness` |

Projector placement is fully flexible by design: a 6-DOF pose rather than a fixed
mounting assumption.

## Implementation

Implements `03-geometry.md` steps 1–7 per fragment:

1. Output pixel to NDC, with the rear-projection mirror applied when
   `length(ProjPos.xz) > ScreenRadius`.
2. Pinhole ray in projector local space from `ProjHFovDeg` and `ProjAspect`.
3. Rotate by `rotationYPR(ProjRotDeg)`, matching the matrix definitions in the geometry
   spec exactly.
4. `intersectCylinderY` returns the nearest positive root that satisfies
   `inScreenBounds`, so the illuminated face is chosen correctly for front and rear
   placement. The returned point needs no further bounds check.
5. Eye direction from the screen point.
6. Source UV via the game's rectilinear camera model.
7. Sample `ReShade::BackBuffer`, then optionally composite the grid overlay.

Out-of-bounds and missed rays return black.

The grid overlay is drawn in **source space**, so straight, evenly spaced lines indicate
a correct warp. `fwidth` provides screen-space line width.

## Calibration procedure

One-time on a fixed rig. Order matters.

1. **Match the game's FOV.** Set `GameHFovDeg` to the sim's actual FOV. If this is
   wrong, nothing else will straighten.
2. **Enter measured screen geometry** — radius, height, arc.
3. **Set the eye-point** relative to the cylinder axis.
4. **Enter the projector pose and intrinsics.**
5. **Enable the grid** and adjust until lines are straight and evenly spaced from the
   seated position. Increase density for finer checking.
6. **Disable the grid.**

## Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Shader will not compile | Syntax or ReShade version | Record the exact error text |
| Image mirrored or inverted | Axis sign convention | Check the Step 1 / Step 7 signs |
| Large black borders | Projector FOV too small for the arc | Raise FOV or reposition |
| Entire output black | Rays miss the cylinder | Check position, rotation sign, radius |
| Grid curved, cannot straighten | Game FOV mismatch | Set `GameHFovDeg` exactly |
| Edges over-stretched | Eye-point wrong | Correct `EyePos` |

## Limitations

- **Single output only (C-6).** Multi-projector edge blending is out of scope; that is
  Phase 2.
- **Anti-cheat (C-3).** Suitable for offline titles; some online games may flag
  injection.
- **No mesh refinement.** Analytic correction only, so real screen sag and lens
  distortion are uncorrected (C-5). ReShade also has no click canvas, making per-point
  mesh editing impractical — a further reason mesh editing belongs in Phase 2.
- **Untested on hardware.** The math is shared with the working web simulator, which
  raises confidence, but the HLSL itself has not been compiled. Sign and handedness
  conventions are the most likely first-run issues.

## Relationship to Phase 2

This shader is the reference implementation of the math, validated by the web simulator.
The HLSL ports substantially unchanged into the standalone app, where edge blending and
mesh editing become possible. Work here is not throwaway.

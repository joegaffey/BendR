# BendR — Status and Roadmap

## Current status

| Component | State |
|---|---|
| `web/index.html` | Working. Shader compiles and renders; 3D scene, projector output, and eye view all functional. |
| `reshade/BendR.fx` | Written, never compiled or run on hardware. |
| `docs/geometry.md` | Written, matches the implementation. |
| `spec/` | This specification set. |
| `app/` | Empty. |

Repository: local git only, branch `main`, no remote configured.

## Completed

- Off-axis cylindrical warp derivation, implemented and rendering.
- Fully flexible 6-DOF projector placement.
- Auto-aim at screen centre, derived from projector position.
- Auto-fit FOV to screen coverage.
- Rear-projection support: correct illuminated-face selection and horizontal mirror,
  both derived from geometry rather than user-set modes.
- Stable marker orientation, including the antiparallel case behind the screen.
- Calibration grid overlay drawn in source space.
- Seven sim screenshots with a source-image selector.
- Overhead projector default chosen to avoid head shadow.

## Next steps

Ordered by dependency, not necessarily by priority.

### 1. Rigorous two-pass eye view

Resolves the FR-25 limitation. Render the projector output to a texture, then have the
eye photograph the screen with that texture applied. Without this, the eye view cannot
show a mis-calibration as distorted, which undercuts its value as a correctness check.
It is also the prerequisite for a viewer-perspective render.

### 2. Control-point mesh layer

Implements FR-16 and FR-17. The analytic solve assumes an ideal cylinder and pinhole
projector (C-5); the mesh layer absorbs real-world deviation. Best built in the web
simulator first, where a click canvas exists, then ported. ReShade cannot host this
usefully.

### 3. Test the ReShade shader on hardware

The only way to close the "written but unverified" gap. Expect sign and handedness
issues on first run.

### 4. Semi-spherical screens

Implements FR-3. Swap the cylinder intersection for a sphere; the rest of the derivation
is unchanged.

### 5. Standalone app

Per the milestones in `06-standalone-app.md`. Milestone 4 supersedes the ReShade shader
for single-projector use; milestone 5 delivers multi-projector blending.

### 6. Head-shadow indicator

Implements FR-27. Draw the beam's lower edge and flag intersection with a head volume at
the eye-point. The overhead default is shadow-conscious but unverified for tall screens
or tall users; what matters is that the line from the lens to the bottom of the screen
clears the head.

## Deferred

- Per-axis game FOV for ultra-wide sources.
- Baking the warp to a texture instead of solving per fragment.
- Converting the large PNG asset to JPEG to reclaim roughly 9 MB.
- Reconsidering a GUI library for the control panel if the parameter count grows.
- Vendoring Three.js for fully offline operation.

## Notes for future work

- **Retain the shader error hook.** The default engine message omits the actual compile
  error, which made an opaque failure expensive to diagnose. The hook that prints the
  compile log and offending line should stay.
- **GLSL ES 3.00 is mandatory** on WebGL2 (C-1). Do not reintroduce GLSL ES 1.00
  constructs or scientific-notation literals.
- **Derive behaviour from geometry.** Front versus rear projection, aim, and beam
  coverage all follow from position. Adding mode switches for these would make
  mis-configuration easier, not harder.
- **Keep the shader and simulator in sync.** They implement the same math and share the
  same defaults; divergence undermines the simulator's value as validation.

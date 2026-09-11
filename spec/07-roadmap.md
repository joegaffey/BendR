# BendR — Status and Roadmap

## Current status

| Component | State |
|---|---|
| `web/index.html` | Working. Shader compiles and renders; 3D scene, projector output, and eye view all functional. |
| `reshade/BendR.fx` | Written, never compiled or run on hardware. **Now behind the web simulator**: predates the projector/source aspect split, the floor model + `ScreenBase`, pane letter/pillarboxing, and aspect-square grid cells. Needs a sync pass before hardware testing. |
| `docs/geometry.md` | Written, matches the web implementation (floor model, aspect split). |
| `spec/` | This specification set. |
| `app/` | Empty. |

Repository: local git only, branch `main`, no remote configured.

## Completed

- Off-axis cylindrical warp derivation, implemented and rendering.
- Fully flexible 6-DOF projector placement.
- Auto-aim at screen centre, derived from projector position.
- Rear-projection support: correct illuminated-face selection and horizontal mirror,
  both derived from geometry rather than user-set modes.
- Stable marker orientation, including the antiparallel case behind the screen.
- Calibration grid overlay drawn in source space, with aspect-square cells.
- Seven sim screenshots with a source-image selector.
- Overhead projector default chosen to avoid head shadow.
- **Floor-referenced coordinate model**: `y = 0` is the floor; the screen is mounted
  above it via a `ScreenBase` control. Eye and projector heights are real heights.
- **Panel vs signal aspect model**: `ProjAspect` is the projector *panel* (physical
  output, primary); `SourceAspect` is the *signal* the game feeds it. Matching fills
  the panel; a narrower signal produces pillarbox bars; a wider signal (the triple
  captures) is clipped by the panel. Both have standard-ratio preset dropdowns backed
  by sliders — panel under Projector, signal under Source Image. Resolves the aspect
  conflation flagged in D-3. See `docs/geometry.md` "Panel vs signal".
- **Eye view is unframed**: the eye has no aspect and never letterboxes or clips to a
  frame. Its FOV is anchored on a fixed viewer reference and widened to fill the pane;
  off-screen areas read as background (seeing past the screen edge). Panel bars/clip
  are not yet visible in the eye view — that needs the two-pass eye view below, since
  bars live in panel space. (A `kEyeRefAspect` constant currently stands in for a real
  viewer FOV; it goes away with the two-pass camera.)
- **Pane-independent output** (D-2): the projector-output pane is letter/pillarboxed
  to the panel aspect so window resizing no longer stretches it; the eye pane fills
  without stretching by construction.
- **Styled control-panel scrollbar** (D-1).

### Removed

- **Auto-fit FOV.** Deliberately removed so the projector behaves like a real one:
  moving the screen no longer silently retargets the projector's FOV. Aim (auto-aim)
  is still assisted; FOV is now a manual control. Some clipping when the beam or game
  FOV exceeds screen coverage is expected and physically honest.

## Next steps

Ordered by dependency, not necessarily by priority. Known defects and smaller additions
are tracked separately in `08-backlog.md`. D-1 and D-2 are now resolved; the remaining
open defect is D-3's framing/FOV coupling (the aspect split is done; centre-third
framing of the triple-screen captures is not).

### 1. Rigorous two-pass eye view

Resolves the FR-25 limitation: the current eye view is single-pass analytic — it samples
the game directly via the eye's view of each screen point, so it ALWAYS shows the ideal
warp and cannot show mis-calibration as distortion. That undercuts its value as a
correctness check, and is also the prerequisite for a viewer-perspective render.

**Failed first attempt (do not repeat).** A two-pass version was tried where pass 1
painted the projector output into a **panel-space** texture (indexed by projector panel
NDC) and pass 2 had the eye sample it via `projPanelLit` (the inverse projector
projection). This does not work: pass 2 is the exact inverse of pass 1, so the two
cancel and the eye recovers the ideal image regardless of projector pose or panel aspect.
Symptoms observed: panel aspect had no visible effect except at the clip boundary (which
was off-screen), and moving the projector only made the lit region jump rather than
distorting the image. The lesson: **the two passes must not be each other's inverse.**

**Correct approach.** Pass 1 must render into a texture parameterised by **screen-surface
coordinates** (arc angle × height) — "what light landed on each patch of the physical
screen" — using the projector's *actual* pose. Pass 2's eye ray hits screen point S,
converts S to those same surface coordinates, and reads the texture, using only true
geometry (no projector model). Then a mis-aimed projector deposits the image on the wrong
screen patches and the eye sees it displaced/distorted; panel bars land at true screen
positions. The projector model is used only in pass 1, the eye only in pass 2 — no
cancellation.

Also in scope:
- Show the **panel's bars/clipping** at their true screen positions.
- Replace the current `kEyeRefAspect` stand-in with a proper perspective camera, so the
  eye has a real, framing-independent field of view.

Build alongside FR-31 (projected image on the screen in the 3D view), which needs the
same render-to-texture foundation.

### 2. Control-point mesh layer

Implements FR-16 and FR-17. The analytic solve assumes an ideal cylinder and pinhole
projector (C-5); the mesh layer absorbs real-world deviation. Best built in the web
simulator first, where a click canvas exists, then ported. ReShade cannot host this
usefully.

### 3. Test the ReShade shader on hardware

First **sync `reshade/BendR.fx` to the current web math**: the projector/source aspect
split, the floor model + `ScreenBase` bounds, and aspect-square grid cells all landed
in the simulator after the shader was last touched. Then run on hardware to close the
"written but unverified" gap. Expect sign and handedness issues on first run.

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

Superseded if FR-30 (shadow-casting rig and user models) is implemented instead, which
shows occlusion directly rather than inferring it. See `08-backlog.md`.

## Deferred

- **Parity test across implementations.** Fixed input parameters with expected output
  UVs, evaluated against each implementation, to catch silent divergence between the
  shader copies. Cheap, and the mechanism that makes multiple shader dialects safe —
  worth doing regardless of backend choices.
- **WebGPU / WGSL migration of the web simulator.** Not adopted. On its own it buys
  nothing the simulator needs — no performance benefit for a light per-fragment warp,
  and it risks the single-file no-build property (NFR-3). Revisit only if the standalone
  app independently chooses Rust + `wgpu`, which would make one shared WGSL source free,
  or if WebGL2 becomes a genuine liability. See `06-standalone-app.md`.
- Per-axis game FOV for ultra-wide sources.
- **On-demand rendering.** The simulator runs a permanent `requestAnimationFrame` loop,
  so all three views redraw every frame even when nothing changes. Switching to render
  only on parameter or size changes would cut idle GPU load. This is the point at which a
  `ResizeObserver` becomes the right trigger for the pane-size half of the update; while
  the rAF loop is permanent, sampling the canvas client size per frame (as D-2's
  `uPaneAspect` does) is simpler and inherently correct for all layout changes, not just
  window `resize` events. An architectural change, not a fix.
- Baking the warp to a texture instead of solving per fragment.
- Converting the large PNG asset to JPEG to reclaim roughly 9 MB.
- Reconsidering a GUI library for the control panel if the parameter count grows.
- Vendoring Three.js for fully offline operation.

## Notes for future work

- **Core functionality outranks code sharing.** Shared shader source across targets is
  desirable but must never constrain a backend choice or compromise capture, warp, or
  blend quality. Agreement between implementations is enforced by the normative geometry
  spec plus parity testing, not by a single source file. Two hand-maintained copies
  already exist and are manageable.
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

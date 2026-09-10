# BendR — Requirements

Requirement IDs are stable. Status values: **Done**, **Partial**, **Planned**.

## Functional requirements

### Screen geometry

| ID | Requirement | Status |
|---|---|---|
| FR-1 | Model a cylindrical screen by radius, height, and horizontal arc. | Done |
| FR-2 | Clip projection to the physical screen bounds (arc and height); pixels outside produce black. | Done |
| FR-3 | Model a semi-spherical / dome screen. | Planned |

### Projector

| ID | Requirement | Status |
|---|---|---|
| FR-4 | Accept full 6-DOF projector pose: position (x,y,z) and yaw/pitch/roll. | Done |
| FR-5 | Accept projector intrinsics: horizontal FOV and aspect ratio. | Done |
| FR-6 | Optionally auto-aim the projector at screen centre, derived from its position. | Done |
| FR-7 | Optionally auto-fit projector FOV so the beam covers the whole screen. | Done |
| FR-8 | Support rear projection (projector outside the screen radius) without a user-set mode. | Done |
| FR-9 | Support multiple projectors. | Planned |

### Viewer

| ID | Requirement | Status |
|---|---|---|
| FR-10 | Accept eye-point position as the reference viewpoint for correctness. | Done |
| FR-11 | Accept the game's horizontal FOV to match the source projection. | Done |
| FR-12 | Treat viewer gaze as fixed forward (+Z); do not auto-aim the eye. | Done |

Rationale for FR-12: the warp must be correct across the viewer's whole field of view
from a natural seated pose. Aiming the eye at screen centre would model head rotation,
which is not what happens and would invalidate the straightness check.

### Warp

| ID | Requirement | Status |
|---|---|---|
| FR-13 | Compute an inverse mapping (output pixel to source UV) suitable for post-process shaders. | Done |
| FR-14 | Select the cylinder face the projector actually illuminates, for any placement. | Done |
| FR-15 | Mirror the emitted image horizontally for rear projection. | Done |
| FR-16 | Apply a control-point mesh offset layer on top of the analytic warp. | Planned |
| FR-17 | Persist and reload calibration as JSON. | Planned |

### Blending

| ID | Requirement | Status |
|---|---|---|
| FR-18 | Alpha-ramp blending across projector overlap regions. | Planned |
| FR-19 | Black-level lift compensation in overlap regions. | Planned |
| FR-20 | Gamma-correct blend ramps. | Planned |

### Calibration and feedback

| ID | Requirement | Status |
|---|---|---|
| FR-21 | Overlay a calibration grid, drawn in source space so straight lines indicate a correct warp. | Done |
| FR-22 | Adjustable grid density. | Done |
| FR-23 | Show the physical rig in 3D (screen, projector frustum, eye-point) for inspection. | Done |
| FR-24 | Show the projector's emitted (pre-distorted) image. | Done |
| FR-25 | Show the viewer's eye view for correctness checking. | Partial |
| FR-26 | Use real sim screenshots as warp source content. | Done |
| FR-32 | Select which region of the source image is treated as the game frame, with a matching source FOV. | Planned |
| FR-27 | Indicate whether the projector beam is occluded by the viewer's head. | Planned |
| FR-30 | Shadow-casting 3D models of the rig and seated user in the physical scene. | Planned |
| FR-31 | Render the projected image onto the screen in the physical scene view. | Planned |

FR-30 supersedes FR-27: shadow-casting models make occlusion directly visible rather
than inferred. FR-31 shares the render-to-texture foundation with FR-25. Both are
specified in `08-backlog.md`.

FR-25 is partial: the eye view currently reconstructs the frame from the analytic warp
rather than photographing the projector's actual output texture. Because the warp is
self-consistent, a mis-calibration does not visibly distort the eye view. See
`04-web-simulator.md`.

### Source input

| ID | Requirement | Status |
|---|---|---|
| FR-28 | Warp a live game frame with no per-title integration. | Partial |
| FR-29 | Support multiple output displays, one per projector. | Planned |

FR-28 is partial: the ReShade shader achieves it by injection, with the limits in
`05-reshade-shader.md`. Universal capture arrives with the standalone app.

## Non-functional requirements

| ID | Requirement | Notes |
|---|---|---|
| NFR-1 | Warp runs per-pixel on the GPU at display refresh rate. | Analytic solve per fragment; a baked warp map is a later optimisation. |
| NFR-2 | Added latency of at most one frame. | Inherent to capture-based output in Phase 2. |
| NFR-3 | Web simulator runs from a single file with no build step. | Three.js via CDN. |
| NFR-4 | Web simulator targets WebGL2 / GLSL ES 3.00. | See constraint C-1. |
| NFR-5 | Calibration is a one-time step per fixed rig. | Parameters persist. |
| NFR-6 | Free, with no licence expiry or activation. | |

## Constraints

- **C-1 — WebGL2 / GLSL ES 3.00.** The web simulator compiles GLSL ES 3.00. Forcing
  GLSL ES 1.00 fails on WebGL2 because `GL_OES_standard_derivatives` is unavailable,
  which breaks `fwidth()` used by the grid overlay. Consequences: use `in`/`out` rather
  than `varying`/`attribute`, `texture()` rather than `texture2D()`, a declared output
  variable rather than `gl_FragColor`, and no scientific-notation float literals.
  WebGL2 is the current and intended target; see `06-standalone-app.md`, "Web simulator
  backend", for why WebGPU is not being adopted on its own.
- **C-2 — Raw shaders.** The simulator uses `RawShaderMaterial` so no engine preamble
  is injected; vertex attributes are declared explicitly.
- **C-3 — Anti-cheat.** ReShade injection may be flagged by some online titles. Phase 2
  capture-based output avoids injection.
- **C-4 — Single eye-point.** A warp is correct for one viewpoint. Inherent to the
  technique, not a defect.
- **C-5 — Ideal surfaces.** The analytic model assumes a true cylinder and a pinhole
  projector. Real screen sag and lens distortion require the FR-16 mesh layer.
- **C-6 — ReShade single output.** ReShade warps one display, so multi-projector
  blending is out of scope for Phase 1.

## Acceptance criteria

- **AC-1** With correct measured parameters, the calibration grid appears straight and
  evenly spaced from the eye-point.
- **AC-2** Moving the projector to any position, including behind the screen, yields a
  stable orientation and a coherent warp with no discontinuities other than the
  front/rear transition at the screen radius.
- **AC-3** Changing screen radius, arc, or height leaves the projector aimed at screen
  centre and the beam covering the screen while auto-aim and auto-fit are enabled.
- **AC-4** Selecting any bundled screenshot warps it in correct orientation.
- **AC-7** With a triple-screen source and centre-third region selected, the warped result
  represents a single-projector view at the stated source FOV.
- **AC-5** Shader compiles with no errors or warnings on a WebGL2 browser.
- **AC-6** The control sidebar scrolls when its content exceeds the viewport.

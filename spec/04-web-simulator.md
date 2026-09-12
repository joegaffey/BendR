# BendR — Web Simulator Specification

**Path:** `web/index.html` — **Status:** working

A single-file browser simulation of the whole rig. Its purpose is to validate the warp
math and provide a calibration sandbox with no hardware required. The shader is a
direct port of `reshade/BendR.fx`, so validating here validates the shader.

## Design constraints

- Single self-contained HTML file, no build step (NFR-3).
- Three.js via CDN import map; requires internet on load.
- WebGL2 / GLSL ES 3.00 (C-1) with `RawShaderMaterial` (C-2).
- Hand-rolled control panel rather than a GUI library. Chosen deliberately: it docks
  as a sidebar alongside the live views and leaves room for spatial editing widgets
  that a row-based settings library cannot express. A library such as dat.gui or
  lil-gui would give collapsible folders and typed numeric entry, both genuinely
  better for entering measured values; revisit if the parameter count grows.

## Layout

```
┌──────────┬────────────────────────────────────┐
│          │  Physical Scene (3D, orbit)        │
│ Controls ├──────────────────┬─────────────────┤
│ sidebar  │ Projector Output │ Eye View        │
└──────────┴──────────────────┴─────────────────┘
```

- Sidebar is a fixed 280 px column and scrolls vertically. Scrolling requires an
  explicit height constraint on the grid item; `overflow-y: auto` alone is not enough.
  The scrollbar is currently unstyled — see D-1 in `08-backlog.md`.
- View panes clip their content so canvases cannot push the layout. The lower panes
  currently stretch their image on resize — see D-2 in `08-backlog.md`.

### Physical Scene

Orbit-controlled 3D view of the rig:

- Cylindrical screen as a semi-transparent double-sided arc, centred on +Z.
- Projector as an orange cone with its frustum drawn as line segments.
- Eye-point as a green sphere with a forward arrow along +Z.
- Ground grid and axes helper for orientation.

The screen arc, projector cone, and frustum are rebuilt when their parameters change.
Marker orientation follows `03-geometry.md` "Orientation of visual markers".

Planned additions to this view: the warped image rendered onto the screen surface
(FR-31), and shadow-casting models of the rig and seated user (FR-30). See
`08-backlog.md`.

### Projector Output

The pre-distorted image the projector must emit. Renders the warp of
`03-geometry.md` steps 1–7 per fragment. Rays that miss the cylinder render black;
rays that hit outside the screen bounds render near-black.

### Eye View

What the seated viewer perceives from the **warp sweet spot** (the eye-point), rendered
as a **two-pass** composite so that a mis-calibration shows up as a displaced/distorted
image. The warp is baked for that point, so the Eye View is only a correctness check
there; an observer elsewhere would see the same fixed warp off-axis.

- **Pass 1 (emit).** Each projector's warp is rendered into its own panel-indexed
  texture, using the projector's **calibration pose**.
- **Pass 2 (photograph).** For each eye ray, the screen point `S` is found; for every
  projector covering `S` (via its **actual pose**), the emitted texture is sampled at
  the corresponding panel coordinate and summed with the alpha ramps and photometrics.

The two passes are deliberately not each other's inverse: pass 1 uses the calibration
pose, pass 2 the actual pose. When they are equal (the default) the result is the ideal
image; when they diverge (see "Warp Calibration" below) the eye sees the stale warp
landing in the wrong place. When parameters are correct, the calibration grid appears
straight and evenly spaced.

When every enabled projector's calibration pose equals its actual pose, the two passes
are mathematically identical to sampling the game directly, so the simulator skips pass 1
and uses the sharp single-pass path. The emit textures and the supersampled pass 2 are
used only while a calibration pose differs (a frozen, moved warp).

## Controls

Grouped as Screen, Eye-point, Projector, Source Image, Calibration. Ranges and defaults
are specified in `03-geometry.md`.

| Control | Type | Default | Behaviour |
|---|---|---|---|
| Screen radius / height / arc | slider | 1.5 m / 1.0 m / 150° | Rebuilds screen mesh |
| Eye X / Y / Z | slider | 0, 0, 0 | Warp sweet spot: the calibration viewpoint every projector is warped to |
| Game FOV | slider | 90° | Must match the sim's FOV setting |
| Projector X / Y / Z | slider | 0, 0.6, −1.3 | Overhead default |
| Projector yaw / pitch / roll | slider | 0, −15, 0 | Disabled while auto-aim is on |
| Projector FOV | slider | 90° | Disabled while auto-fit is on |
| Projector aspect | slider | 1.777 | 16:9 |
| Source image | dropdown | Test Grid | Selects warp source content |
| Auto-aim at target | checkbox | on | Derives yaw/pitch from position |
| Aim X offset | slider | 0 m | Shifts the auto-aim target sideways; point projectors at different parts of the screen. Disabled while auto-aim is off |
| Auto-fit FOV to screen | checkbox | on | Derives FOV from screen coverage |
| Show calibration grid | checkbox | on | Grid drawn in source space |
| Grid lines | slider | 12 | Grid density |
| Warp follows projector | checkbox | on | Calibration pose tracks the actual projector pose |
| Recalibrate | button | – | Snap the calibration pose to the current actual pose |

Derived controls grey out while their automatic mode is active and display the computed
value, so the sliders remain a readable report of the current pose. Changing projector
position or screen shape refreshes them.

### Multi-projector

Implemented. The simulator is the validation sandbox for the blend model in
`03-geometry.md`, "Multi-projector and edge blending".

| Control | Type | Behaviour |
|---|---|---|
| Projector list | add / remove / select | Each projector owns a full pose + intrinsics set; the panel edits the active one (up to 4) |
| Enabled in composite | checkbox | Include or exclude a projector from the composite |
| Blend L/R/T/B | sliders | Per-edge ramp widths as a fraction of the half-extent |
| Black level / gamma / gain | sliders | Per-projector photometrics for black-level lift and gamma correction |
| Eye View | pane | The composite: sums every covering projector's light at each screen point, ramps normalised to a partition of unity |

The **Projector Output** pane shows the active projector's warp (from its calibration
pose), so each projector is validated independently (AC-9). The **Eye View** validates
the blend (AC-8) and, with the warp frozen, the geometry (FR-25). Black-level lift is
computed by sampling the screen geometry and applying the deepest-overlap floor.

**Calibration vs actual pose.** Each projector carries a calibration pose (used to
compute the warp) and an actual pose (where it physically is). "Warp follows projector"
keeps them equal. Unchecking it freezes the warp, so moving the projector makes the Eye
View show the stale image landing wrongly — the check a real rig needs. "Recalibrate"
snaps the warp to the current pose. The 3D scene draws the calibration pose as a ghost
frustum while frozen.

Per-projector photometrics are deliberately limited to black, gain, and gamma —
colour/white-point matching is out of scope (`01-overview.md`).

## Source content

A dropdown selects either a procedural test pattern or a real sim screenshot.

- **Test Grid (synthetic)** — checkerboard with coloured border and centre crosshair,
  generated in-shader. The fallback when no texture is loaded.
- Seven screenshots in `web/assets/images/`: iRacing, Project Cars, Project Cars 2,
  Assetto Corsa, rFactor 2, Dirt Rally (cockpit and bonnet). Sourced from the
  `joegaffey/muscled` project.

All seven screenshots are **triple-monitor captures**, with aspect ratios from 4.8 to 5.6
rather than a single display's ~1.78. They are currently sampled whole as the game frame,
so the source is roughly three times too wide for the assumed projection. Region selection
and a matching source FOV are required — see D-3 in `08-backlog.md`.

Textures load with **no colour-space conversion** (`NoColorSpace`), linear filtering, and
clamp-to-edge for non-power-of-two sizes. The shader treats the sampled value as the
game's sRGB-encoded signal and applies the projector transfer itself, so the texture must
be sampled raw. Setting `SRGBColorSpace` would upload `SRGB8_ALPHA8`, decode to linear on
sample, and make the shader apply gamma to already-linear values — the image comes out
dark. `flipY` is disabled because the shader already flips Y to match the top-left origin
of `srcUV`; leaving both enabled double-flips the image.

Assets total roughly 19 MB, dominated by one PNG at about 10 MB. Converting it to JPEG
would reclaim most of that.

## Shader

One fragment shader serves both lower views, branching on a mode uniform: 0 for
projector output, 1 for eye view.

Uniforms mirror the parameter set, plus `uGameTex` and `uUseTex` for source selection,
`uGridLines` and `uShowGrid` for the overlay, and `uMode`.

### GLSL ES 3.00 requirements

Per C-1, all of the following are mandatory:

- `in` / `out` rather than `varying` / `attribute`.
- `texture()` rather than `texture2D()`.
- A declared output variable rather than `gl_FragColor`.
- No scientific-notation float literals; write `0.0001`, not `1e-4`.
- No derivatives extension directive; `fwidth()` is built in.
- Vertex attributes declared explicitly, as `RawShaderMaterial` injects no preamble.
- Overloads must exist for every argument type used. A scalar-only degrees-to-radians
  helper called with a vec3 fails to resolve, and the resulting errors are reported
  against later lines, which misdirects diagnosis.

A `renderer.debug.onShaderError` hook prints the compile log and the offending source
line. It should be retained: opaque validation failures are otherwise very costly to
diagnose, as the engine's default message omits the specific error.

## Verification

Against the acceptance criteria in `02-requirements.md`: AC-1 through AC-6 apply to this
component and are met. AC-8 and AC-9 are met by the multi-projector composite: each
projector's warp is independently correct (AC-9), and the composite exposes photometric
mismatches and ramp seams (AC-8). The two-pass Eye View with the calibration/actual pose
split additionally exposes geometric mis-calibration when the warp is frozen. AC-10
through AC-12 apply to the runtime output below.

## Runtime output

The same file also serves as the runtime output for on-rig validation: `#output=<j>`
renders one projector's warp full-window, launched and live-synced from the simulator.
That mode is specified separately in `09-runtime.md`.

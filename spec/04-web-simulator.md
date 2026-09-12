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

What the seated viewer perceives. Casts rays from the eye-point along +Z, intersects
the screen, and shows what is painted there. When parameters are correct, the
calibration grid appears straight and evenly spaced.

**Known limitation (FR-25).** The eye view reconstructs the frame directly from the
analytic warp rather than sampling the projector's rendered output. Because the warp
is self-consistent, a mis-calibration does not visibly distort this view, so it cannot
currently detect an incorrect warp. The rigorous form is a two-pass render: draw the
projector output to a texture, then have the eye photograph the screen with that
texture applied. This is the prerequisite for a viewer-perspective render.

## Controls

Grouped as Screen, Eye-point, Projector, Source Image, Calibration. Ranges and defaults
are specified in `03-geometry.md`.

| Control | Type | Default | Behaviour |
|---|---|---|---|
| Screen radius / height / arc | slider | 1.5 m / 1.0 m / 150° | Rebuilds screen mesh |
| Eye X / Y / Z | slider | 0, 0, 0 | Warp reference viewpoint |
| Game FOV | slider | 90° | Must match the sim's FOV setting |
| Projector X / Y / Z | slider | 0, 0.6, −1.3 | Overhead default |
| Projector yaw / pitch / roll | slider | 0, −15, 0 | Disabled while auto-aim is on |
| Projector FOV | slider | 90° | Disabled while auto-fit is on |
| Projector aspect | slider | 1.777 | 16:9 |
| Source image | dropdown | Test Grid | Selects warp source content |
| Auto-aim at screen centre | checkbox | on | Derives yaw/pitch from position |
| Auto-fit FOV to screen | checkbox | on | Derives FOV from screen coverage |
| Show calibration grid | checkbox | on | Grid drawn in source space |
| Grid lines | slider | 12 | Grid density |

Derived controls grey out while their automatic mode is active and display the computed
value, so the sliders remain a readable report of the current pose. Changing projector
position or screen shape refreshes them.

### Multi-projector (planned)

Not yet implemented. The simulator is the validation sandbox for the blend model in
`03-geometry.md`, "Multi-projector and edge blending", so the eventual controls are:

| Control | Type | Behaviour |
|---|---|---|
| Projector list | add / remove / select | Each projector owns a full pose + intrinsics set; the panel edits the selected one |
| Enable | checkbox | Include or exclude a projector from the composite |
| Blend L/R/T/B | sliders | Per-edge ramp widths as a fraction of the half-extent |
| Black level / gamma / gain | sliders | Per-projector photometrics for black-level lift and gamma correction |
| Composite view | pane | Renders the additive composite onto the screen; overlap and seam regions visible |
| Mismatched projectors | preset | Sets differing gain/gamma/black so a seam appears, to demonstrate the correction |

Each projector's warp is validated independently (AC-9); the composite validates the
blend (AC-8). Per-projector photometrics are deliberately limited to black, gain, and
gamma — colour/white-point matching is out of scope (`01-overview.md`).

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

Textures load with sRGB colour space, linear filtering, and clamp-to-edge for
non-power-of-two sizes. `flipY` is disabled because the shader already flips Y to match
the top-left origin of `srcUV`; leaving both enabled double-flips the image.

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

Against the acceptance criteria in `02-requirements.md`: AC-1, AC-2, AC-3, AC-4, AC-5,
AC-6 all apply to this component and are met, except that AC-1 verifies straightness
only in the sense described under the FR-25 limitation above. AC-8 and AC-9 apply to the
planned multi-projector work above and are not yet met.

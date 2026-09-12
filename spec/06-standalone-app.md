# BendR — Standalone Application Specification

**Path:** `app/` — **Status:** not started

Phase 2: a Windows application that captures the desktop, warps it on the GPU, and
outputs to one or more projectors with edge blending. This is what makes multi-projector
setups possible, which ReShade cannot do.

## Why capture rather than injection

For genuinely universal operation across any game or sim, including online titles:

| | Capture and re-present | Injection overlay |
|---|---|---|
| Coverage | Any title | Per graphics API, fiddly |
| Anti-cheat | No injection | May be flagged |
| Latency | About one frame | Near zero |
| Multiple outputs | Yes | No |

Capture is the correct trade for a fixed sim rig: roughly 16 ms at 60 fps, and it is
what commercial warp tools do. Injection remains available via the Phase 1 shader for
single-projector, latency-sensitive, offline use.

## Architecture

```
┌────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Game       │──▶│ Desktop      │──▶│ GPU warp +   │──▶│ Fullscreen   │
│ (any title)│   │ Duplication  │   │ blend shader │   │ output per   │
│            │   │ (capture)    │   │              │   │ projector    │
└────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
                                            ▲
                                  ┌─────────┴──────────┐
                                  │ Calibration:       │
                                  │ params + mesh JSON │
                                  │ + editor UI        │
                                  └────────────────────┘
```

## Technology

| Concern | Choice | Rationale |
|---|---|---|
| Platform | Windows | Where the sims run |
| Capture | DXGI Desktop Duplication | Low overhead, stays GPU-side |
| Rendering | Direct3D 11 | Mature, simplest path for this workload |
| Language | Undecided: Rust or C++ | Decide on capture and output reliability, not shader sharing. Rust + `wgpu` would additionally allow one WGSL source shared with a WebGPU web simulator, but that is a bonus, not a requirement. C++ + D3D11 has the larger body of Desktop Duplication examples. |
| Warp | Textured control-point mesh | Frame as texture, vertices define the warp |
| Blend | Pixel shader | Alpha ramp, black level, gamma in overlap |
| Config | JSON | Parameters plus mesh offsets |

## Functional scope

### Capture and output

- Duplicate the desktop or a chosen display and present the warped result fullscreen
  per projector (FR-28, FR-29).
- One output window per projector, each with its own warp and blend parameters.

### Warp

- Reuse the analytic solve from `03-geometry.md`, ported from the Phase 1 shader.
- Add a **control-point mesh offset layer** on top (FR-16). The analytic solve provides
  a correct starting point from measured values; the mesh absorbs what the ideal model
  cannot represent — screen sag, a screen that is not a true cylinder, lens distortion
  (C-5). Offsets start at zero so the layer is purely additive.
- Consider baking the mapping to a warp-map texture rather than solving per fragment.

### Mesh editing

This is the capability that justifies a standalone app on the UX side. Requirements:

- A grid of control points overlaid on the output, for example 9×5.
- Select a point and nudge it in X and Y. Keyboard or gamepad input matters because the
  user is at the projector, not necessarily at a mouse.
- Interpolate offsets between points, bilinear or bicubic.
- Save and load to JSON (FR-17).

A draggable canvas is impractical in ReShade, which offers only parameter rows.

### Edge blending

The normative model — additive linear-light composite, partition-of-unity alpha ramps,
per-projector black/gain/gamma, and black-level lift — is specified in
`03-geometry.md`, "Multi-projector and edge blending". The app implements it; it does not
redefine it.

- Alpha-ramp across overlap regions (FR-18).
- Black-level lift compensation, since overlapping projectors raise black (FR-19).
- Gamma-correct ramps so the blend is photometrically smooth (FR-20).

### Multi-projector

- Per-projector pose, intrinsics, warp, and blend (FR-9), with coverage derived from
  geometry per the same section.
- The analytic solve runs independently per projector; blending is the only genuinely
  new math relative to Phase 1.

## Graphics backend and shader sharing

**Core functionality decides the backend. Shader sharing is a tiebreaker, never a
constraint.**

The app's job is reliable desktop capture, correct warp, and blended output to multiple
projectors. Whichever backend does that most dependably wins, even if it means
maintaining a second copy of the warp shader.

### Why sharing is only a bonus

Principle 3 in `01-overview.md` requires every target to agree with the normative
derivation in `03-geometry.md`. It does not require a single shader source file.
Agreement is enforced by the spec plus parity testing, which works across any number of
dialects. Today there are already two hand-maintained copies:

| Target | Shader language |
|---|---|
| `reshade/BendR.fx` | HLSL |
| `web/index.html` | GLSL ES 3.00 (WebGL2) |

At roughly 150 lines this is manageable, and ReShade's HLSL can never be shared anyway
because HLSL is ReShade's own format. A third dialect is an acceptable cost if it buys
better core functionality.

### The sharing opportunity, for reference

If the app adopts Rust + `wgpu` and the web simulator moves to WebGPU, one WGSL source
could serve both:

```
web    (WebGPU) ─┐
                 ├─ one shared WGSL source
native (wgpu)   ─┘

reshade         ─── HLSL (unavoidable)
```

Attractive, but not a reason to choose `wgpu` if D3D11 handles capture and output better.

WGSL also differs from HLSL and GLSL more than they differ from each other: mandatory
type annotations, `vec3<f32>` forms, explicit `@group`/`@binding` declarations, no
implicit numeric conversions, separate texture and sampler bindings, and no user-defined
function overloading. That last point is concrete for BendR — the scalar and vector
overloads of the degrees-to-radians helper would become two differently named functions.

### Web simulator backend

**Stay on WebGL2 for now.** WebGPU is appealing for longevity, but on its own it delivers
nothing the simulator needs:

- **No performance motivation.** The warp is a light per-fragment ray-trace on a
  fullscreen quad, nowhere near a bottleneck. Compute shaders would only matter for
  baking warp-map textures.
- **NFR-3 at risk.** WebGPU and WGSL setup is heavier than a single CDN import, so the
  single-file, no-build property may not survive.
- **Migrating alone costs three dialects** with no offsetting gain.

Revisit only if the app independently chooses `wgpu`, at which point sharing becomes
free, or if WebGL2 becomes a genuine liability.

### Parity checking

The safeguard against silent divergence is a parity test rather than transpilation: a
fixed set of input parameters with expected output UVs, evaluated against every
implementation. This is what makes multiple dialects safe, and is worth doing regardless
of backend choices. Transpilers such as Tint, naga, or SPIRV-Cross are disproportionate
for a shader this size.

## Build order

Each milestone should be independently verifiable.

| # | Milestone | Verifies |
|---|---|---|
| 1 | Capture and present passthrough, unmodified, fullscreen | Capture and output pipeline |
| 2 | Static mesh warp through a flat grid, no distortion | Mesh rendering path is correct |
| 3 | Analytic warp ported from Phase 1, single projector | Math ports correctly |
| 4 | Interactive control-point mesh with JSON save and load | Usable single-projector rig |
| 5 | Second projector with alpha-ramp edge blending | Multi-projector |
| 6 | Black-level and gamma refinement | Seamless blend |
| 7 | Semi-spherical support: sphere intersection, denser grid | Dome screens (FR-3) |

Milestone 4 is the first point at which the app supersedes the ReShade shader for
single-projector use. Milestone 5 is the first capability ReShade cannot provide at all.

## Non-functional targets

- At most one frame of added latency (NFR-2).
- Warp and blend at display refresh rate (NFR-1).
- Calibration persists across restarts (NFR-5).

## Open questions

- **Rust or C++.** Decide on which gives more reliable DXGI Desktop Duplication capture
  and multi-output presentation. Shader sharing with a WebGPU simulator is a tiebreaker
  only.
- Whether to solve the warp per fragment or bake a warp-map texture.
- Whether the mesh editor UI is in-app or a separate configuration tool.
- Whether to support capturing a single window rather than the whole desktop.

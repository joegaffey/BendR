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
| Language | Rust, leaning `wgpu` | See "Graphics backend and shader sharing" below. Rust for build and dependency hygiene; `wgpu` for shader sharing with a WebGPU web simulator. C++ + D3D11 remains the fallback if `wgpu` proves awkward for Desktop Duplication interop. |
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

- Alpha-ramp across overlap regions (FR-18).
- Black-level lift compensation, since overlapping projectors raise black (FR-19).
- Gamma-correct ramps so the blend is photometrically smooth (FR-20).

### Multi-projector

- Per-projector pose, intrinsics, warp, and blend (FR-9).
- The analytic solve runs independently per projector; blending is the only genuinely
  new math relative to Phase 1.

## Graphics backend and shader sharing

**Direction: WebGPU, for future-proofing.** This couples the web simulator's graphics
API to the app's language choice, so the two decisions are made together.

### The problem

Principle 3 in `01-overview.md` is that the same warp math backs every target. Today
that is convention, not enforcement — there are two hand-maintained copies that agree
only because `03-geometry.md` is normative:

| Target | Shader language |
|---|---|
| `reshade/BendR.fx` | HLSL |
| `web/index.html` | GLSL ES 3.00 (WebGL2) |

At roughly 150 lines of shader this is manageable, but silent divergence is possible.

### Why WebGPU changes the calculus

Adding WGSL to the current stack in isolation would make things worse: three dialects
instead of two, with WGSL sharing the least with the others. WGSL differs in kind, not
just in naming — mandatory type annotations, `vec3<f32>` forms, explicit
`@group`/`@binding` resource declarations, no implicit numeric conversions, separate
texture and sampler bindings, and no user-defined function overloading. That last point
is concrete for BendR: the scalar and vector overloads of the degrees-to-radians helper
would have to become two differently named functions.

The gain only materialises if the standalone app uses the same shader language. With
Rust and `wgpu`, which targets Windows via D3D12 or Vulkan:

```
web    (WebGPU) ─┐
                 ├─ one shared WGSL source
native (wgpu)   ─┘

reshade         ─── HLSL (unavoidable; ReShade's own format)
```

That is one shared shader plus ReShade's HLSL — better sharing than the two hand-synced
copies that exist now, and the reason to prefer this direction.

### Consequences

- **The web simulator would move from WebGL2 to WebGPU**, superseding constraint C-1.
  The GLSL ES 3.00 rules recorded there stop applying to a WGSL implementation, but they
  remain correct for as long as the WebGL2 version exists.
- **NFR-3 is at risk.** WebGPU and WGSL setup is heavier than a single CDN import, so
  the single-file, no-build property may not survive. Worth protecting if possible.
- **No performance motivation.** The warp is a light per-fragment ray-trace on a
  fullscreen quad and is not a bottleneck. The case for WebGPU here is code sharing and
  longevity, not speed. Compute shaders would only become relevant for baking warp-map
  textures.
- **Sequencing.** Do not migrate the web simulator alone; that incurs the cost with none
  of the benefit. Migrate when the app commits to `wgpu`.

### Parity checking

Regardless of how many dialects remain, the practical safeguard against silent
divergence is a parity test rather than transpilation: a fixed set of input parameters
with expected output UVs, evaluated against every implementation. Transpilers such as
Tint, naga, or SPIRV-Cross exist but are disproportionate for a shader this size.

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

- Whether `wgpu` interoperates cleanly with DXGI Desktop Duplication, which is the main
  risk to the Rust + `wgpu` direction. If it does not, the fallback is C++ + D3D11, which
  forfeits shader sharing with the web simulator.
- Whether the WebGPU migration can preserve the single-file, no-build property (NFR-3).
- Whether to solve the warp per fragment or bake a warp-map texture.
- Whether the mesh editor UI is in-app or a separate configuration tool.
- Whether to support capturing a single window rather than the whole desktop.

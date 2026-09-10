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
| Language | Rust or C++ | Rust for build and dependency hygiene via the `windows` crate; C++ for the larger body of D3D examples. Undecided. |
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

- Rust or C++.
- Whether to solve the warp per fragment or bake a warp-map texture.
- Whether the mesh editor UI is in-app or a separate configuration tool.
- Whether to support capturing a single window rather than the whole desktop.

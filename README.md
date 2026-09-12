# BendR — Bend Reality

Free, geometry-driven **mesh warping + edge blending** for curved and semi-spherical
projection screens, aimed at flight/racing/sim rigs. Intended to work with any game or
sim — via ReShade, or the planned capture app.

### ▶ [Try the live simulator](https://joegaffey.github.io/BendR/)

Tune projector pose, screen geometry, and eye-point in the browser — no install required.

> **Status: work in progress.** The web simulator works and is usable for exploring and
> validating the warp. The ReShade shader is written but has not been run on hardware, and
> the standalone multi-projector app is not started. Parameters, file formats, and
> interfaces may still change.

BendR exists because commercial screen-warping software (Vioso, Scalable Display,
Fly Elise-ng, etc.) is expensive — while the underlying math is a well-understood
ray-trace. For a fixed sim rig the warp is essentially static once calibrated, so
there's little reason to pay recurring/high license fees.

## Goals

1. **Off-axis cylindrical correction** — correct geometry for *any* projector placement,
   not just on-axis. Straight lines look straight from the viewer's eye-point.
2. **Semi-spherical / dome** support — same mesh approach, denser grid + spherical mapping.
3. **Edge blending** — seamless multi-projector overlap (alpha ramp + black-level + gamma).
4. **Game-agnostic** — no per-title integration required.
5. **Free and yours** — no license expiry, no auto-calibration paywall.

## The core idea

A correct warp depends on **three** things: projector pose, screen shape, and the
**viewer eye-point**. The warp is an inverse mapping computed by ray-tracing:

```
for each point S on the screen surface (cylinder / sphere):
    1. project S into the projector frustum   -> output pixel position
    2. project S as seen from the eye-point    -> source texture coordinate (UV)
    store (output position -> source UV)
```

That mapping is exactly the "expensive" off-axis feature in commercial tools.

## Approach: two phases, shared math

### Phase 1 — ReShade custom shader (single projector, start here)
A custom `BendR.fx` post-process shader implementing analytic off-axis cylinder
correction, with live-tunable uniforms for a **fully flexible projector pose**
(position x/y/z + yaw/pitch/roll), cylinder radius/height, and eye-point.
Includes a calibration grid overlay to check straightness while tuning.

- Pros: works this week, on almost any offline game/sim, free.
- Limits: single output only (no multi-projector blend); ReShade injection may be
  flagged by anti-cheat in some online titles.

### Phase 1.5 — Validate on the rig (web runtime)
The simulator can launch each projector's warp fullscreen on the real screens for
on-rig tuning, then export the calibration as JSON for ReShade or the app. Static source
(the calibration grid); live capture stays with ReShade and the app. See
`spec/09-runtime.md`.

### Phase 2 — Standalone capture/warp/blend app (multi-projector)
Desktop Duplication (capture) -> GPU warp + blend shader -> fullscreen output per
projector. Reuses the Phase 1 shader math (~90% identical HLSL). Adds edge blending
across multiple projectors, which is out of scope for ReShade.

- Universal (works with any game incl. online), ~1 frame latency.
- Target platform: Windows (DXGI Desktop Duplication + Direct3D 11).

## Design decisions (locked in)

- **Projector placement: fully flexible** — 6-DOF pose via uniforms, not hardcoded.
- **Calibration: manual/parameter-driven** — avoids the camera auto-cal that makes
  commercial tools costly. Parameter sliders in Phase 1; can add control-point mesh later.
- **Screen shapes: cylindrical first, then semi-spherical.**
- **Warp = inverse mapping** (output pixel -> source UV), ideal for post-process shaders.

## Layout

```
BendR/
├── README.md          # this file
├── spec/              # specification set (start at spec/README.md)
├── reshade/           # Phase 1: BendR.fx analytic warp shader
├── web/               # web simulator / calibration sandbox
├── docs/
│   └── geometry.md     # the warp math, derivations, coordinate conventions
└── app/               # Phase 2: standalone capture/warp/blend app (later)
```

## Specification

See [`spec/`](spec/README.md). For the core idea, read `spec/01-overview.md` then
`spec/03-geometry.md`, which is the normative reference for the warp derivation.

## Status

| Component | State |
|---|---|
| Web simulator (`web/`) | Working — off-axis cylinder warp, multi-projector composite, two-pass eye view, calibration UI |
| ReShade shader (`reshade/`) | Written, not yet compiled or run on hardware; behind the simulator |
| Runtime output (`spec/09-runtime.md`) | Specified only |
| Standalone app (`app/`) | Not started |

## Roadmap

- [x] Off-axis cylinder warp + calibration grid (web simulator)
- [x] Multi-projector composite + edge blending (web simulator)
- [ ] ReShade `BendR.fx` synced to the current math and verified on hardware
- [ ] Phase 1.5: launch fullscreen outputs on the rig and export calibration as JSON
      (`spec/09-runtime.md`)
- [ ] Semi-spherical mode
- [ ] Control-point mesh offset layer and JSON persistence
- [ ] Phase 2: capture -> passthrough -> fullscreen output pipeline
- [ ] Phase 2: port shader math into the app
- [ ] Phase 2: multi-projector edge blending in the app

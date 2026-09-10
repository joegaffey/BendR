# BendR — Bend Renderer

Free, geometry-driven **mesh warping + edge blending** for curved and semi-spherical
projection screens, aimed at flight/racing/sim rigs. Works with **any game or sim**.

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
├── reshade/           # Phase 1: BendR.fx analytic warp shader
├── docs/
│   └── geometry.md     # the warp math, derivations, coordinate conventions
└── app/               # Phase 2: standalone capture/warp/blend app (later)
```

## Roadmap

- [ ] Phase 1: off-axis cylinder `BendR.fx` + calibration grid overlay
- [ ] Phase 1: semi-spherical mode
- [ ] Phase 2: capture -> passthrough -> fullscreen output pipeline
- [ ] Phase 2: port shader math into the app
- [ ] Phase 2: multi-projector edge blending (alpha ramp + black-level + gamma)

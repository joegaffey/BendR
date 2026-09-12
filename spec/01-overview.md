# BendR — Product Overview

## Purpose

BendR (**Bend Reality**) is free, geometry-driven mesh warping and edge blending for
curved and semi-spherical projection screens, aimed at flight/racing simulator rigs.

Commercial screen-warping software is priced for install-grade AV work. The underlying
correction is a well-understood ray-trace, and on a fixed sim rig the warp is essentially
static once calibrated. BendR provides that correction directly.

## Scope

In scope:

- Off-axis cylindrical geometry correction for **any** projector placement.
- Semi-spherical / dome screens (planned).
- Multi-projector edge blending (planned, Phase 2).
- Game-agnostic operation — no per-title integration.

Out of scope:

- Camera-based automatic calibration (the main cost driver in commercial tools).
  BendR uses measured physical parameters plus manual refinement instead.
- Per-title plugins or in-engine integration.
- Colour calibration / photometric matching beyond blend-region gamma.

## Users

Sim enthusiasts with a projector and a curved or dome screen who want geometrically
correct projection without a commercial licence.

## Key principles

1. **Flexible placement.** Projector pose is a full 6-DOF input, never assumed.
2. **Physical parameters over hand-tweaking.** The user enters measured real-world
   values; correct warp follows from geometry. Manual mesh refinement is an optional
   layer on top, not the primary mechanism.
3. **Shared math across targets, where it is free.** The warp derivation is normative
   (`03-geometry.md`) and every target must agree with it. Sharing actual shader *source*
   between targets is desirable but secondary: it must never constrain the choice of
   graphics backend or compromise core functionality. Correctness is enforced by the
   normative spec and parity testing, not by a single source file.
4. **Behaviour follows geometry, not modes.** Front vs rear projection, aim, and beam
   coverage are derived from position rather than exposed as switches to get wrong.

## Deliverables

| Component | Path | Status |
|---|---|---|
| Web simulator / calibration sandbox | `web/index.html` | Working |
| ReShade shader (single projector) | `reshade/BendR.fx` | Untested on hardware |
| Standalone capture/warp/blend app | `app/` | Not started |
| Warp math reference | `docs/geometry.md` | Written |

## Phasing

**Phase 1 — single projector.** Analytic off-axis cylinder correction, validated in
the web simulator and delivered as a ReShade post-process shader.

**Phase 1.5 — validate on the rig.** The web simulator launches each projector's warp
fullscreen on the physical screens for on-rig tuning, then exports the calibration as
JSON for ReShade or the app. Static source; live capture stays with ReShade and the app.
See `09-runtime.md`.

**Phase 2 — multi-projector.** Standalone Windows application: desktop capture, GPU
warp, per-projector fullscreen output, edge blending. Reuses Phase 1 math.

## Related documents

- `02-requirements.md` — functional and non-functional requirements
- `03-geometry.md` — coordinate conventions and the warp derivation
- `04-web-simulator.md` — web simulator specification
- `05-reshade-shader.md` — ReShade shader specification
- `06-standalone-app.md` — Phase 2 application specification
- `07-roadmap.md` — status and sequencing
- `08-backlog.md` — known defects and planned additions
- `09-runtime.md` — Phase 1.5 runtime output: fullscreen outputs and JSON export

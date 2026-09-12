# BendR Specification

Specification set for BendR (Bend Reality) — free, geometry-driven mesh warping and
edge blending for curved and semi-spherical projection screens.

| Document | Contents |
|---|---|
| [01-overview.md](01-overview.md) | Purpose, scope, principles, deliverables, phasing |
| [02-requirements.md](02-requirements.md) | Functional and non-functional requirements, constraints, acceptance criteria |
| [03-geometry.md](03-geometry.md) | **Normative.** Coordinate conventions and the warp derivation |
| [04-web-simulator.md](04-web-simulator.md) | Web simulator specification |
| [05-reshade-shader.md](05-reshade-shader.md) | ReShade shader specification |
| [06-standalone-app.md](06-standalone-app.md) | Phase 2 application specification |
| [07-roadmap.md](07-roadmap.md) | Current status, next steps, deferred work |
| [08-backlog.md](08-backlog.md) | Known defects and planned additions |
| [09-runtime.md](09-runtime.md) | Phase 1.5 runtime output: fullscreen outputs on the rig, JSON export |

## Reading order

For the core idea, read `01-overview.md` then `03-geometry.md`. Everything else follows
from the geometry.

`03-geometry.md` is normative: all implementations must agree with it. Where an
implementation document and the geometry specification disagree, the geometry
specification is correct and the implementation is a defect.

`docs/geometry.md` in the repository root is an implementation-facing companion to
`03-geometry.md`, kept deliberately shorter.

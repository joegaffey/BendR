# BendR — Backlog

Known defects and planned additions not yet reflected in the component specifications.
Requirement IDs continue the sequence in `02-requirements.md`.

## Defects

### D-1 — Side panel scrollbar is unstyled

The control sidebar scrolls correctly (AC-6) but uses the browser's default scrollbar,
which is visually inconsistent with the dark panel.

Fix by styling the scrollbar to match the panel: a thin track in the panel colour with a
muted thumb, using `scrollbar-width` and `scrollbar-color` for standard support plus
`::-webkit-scrollbar` for Chromium. Both are needed for cross-browser coverage.

Cosmetic only; no effect on function.

### D-2 — Lower 3D views stretch on window resize

The Projector Output and Eye View panes distort when the window is resized.

Cause: the two lower renderers resize their drawing buffer to the canvas client size,
but the warp shader derives its ray directions from `uProjAspect`, the *projector's*
aspect ratio, which is independent of the canvas aspect. When the canvas aspect diverges
from the projector aspect, the rendered image is stretched to fill the pane.

The 3D scene does not suffer this because it updates `cam3.aspect` on resize; the
fullscreen-quad renderers have no equivalent correction.

Fix by decoupling the projector's image aspect from the canvas aspect. Letterbox or
pillarbox the projector output inside its pane so the emitted image keeps its true
aspect, filling unused area with the background colour. The same applies to the eye view,
whose aspect should follow the game's projection rather than the pane.

This is a correctness issue, not only cosmetic: a stretched projector output
misrepresents what the projector would emit.

## Additions

### FR-30 — Shadow-casting models of the rig and user

Add 3D models of the simulator rig and a seated user to the physical scene, with shadow
casting enabled from the projector.

This makes head and rig occlusion directly visible rather than inferred, superseding the
simpler beam-edge indicator in FR-27. Shadow avoidance is the constraint that determined
the overhead projector default, but that default is currently unverified for tall screens
or tall users.

Assets available for reuse from `joegaffey/muscled`: `assets/rig3.stl` (a sim rig model,
about 2.2 MB) and `lib/STLLoader.js`. Licensing should be confirmed before copying into
this repository, as the earlier image assets were.

Implementation notes:

- The projector is the shadow-casting light source, positioned and oriented from the
  projector pose, so the shadow corresponds to the actual beam.
- A simple seated-figure proxy may be sufficient for the user; the requirement is
  occlusion volume, not visual fidelity.
- The screen must receive shadows.

Supersedes FR-27, which can be closed if this is implemented.

### FR-31 — Render the projected image onto the screen in the 3D view

Show the warped image projected onto the cylindrical screen within the physical scene
view, rather than only in the separate Projector Output pane.

This makes the main 3D view a complete picture of the rig: geometry, beam, and resulting
image together. It also makes coverage and spill immediately legible — where the beam
overshoots the screen edge, or fails to reach it.

Implementation depends on rendering the projector output to a texture and applying it to
the screen mesh. That is the same two-pass structure required for the rigorous eye view
(FR-25, roadmap item 1), so the two should be built together: one pass produces the
projector output texture, which then feeds both the screen material in the 3D view and
the eye-view camera.

Sequencing: implement after or alongside the two-pass eye view, since it shares the
render-to-texture foundation.

## Suggested order

1. **D-2** — correctness issue, and its aspect handling is independent of other work.
2. **D-1** — small, self-contained cosmetic fix.
3. **FR-31 with the two-pass eye view** — shared render-to-texture foundation.
4. **FR-30** — largest, and benefits from FR-31 already establishing projector-driven
   rendering in the 3D scene.

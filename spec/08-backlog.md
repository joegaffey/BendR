# BendR — Backlog

Known defects and planned additions not yet reflected in the component specifications.
Requirement IDs continue the sequence in `02-requirements.md`.

## Defects

### D-1 — Side panel scrollbar is unstyled — RESOLVED

The control sidebar scrolls correctly (AC-6) but used the browser's default scrollbar,
which was visually inconsistent with the dark panel.

Fixed by styling the scrollbar to match the panel: a thin track in the panel colour with
a muted thumb (`#484f58`), using `scrollbar-width`/`scrollbar-color` for standard support
plus `::-webkit-scrollbar` for Chromium.

Cosmetic only; no effect on function.

### D-2 — Lower 3D views stretch on window resize — RESOLVED

The Projector Output and Eye View panes distorted when the window was resized.

Cause: the two lower renderers resize their drawing buffer to the canvas client size,
but the warp shader derived its ray directions from a fixed image aspect independent of
the canvas aspect. When the canvas aspect diverged, the rendered image stretched to fill
the pane.

Fixed by decoupling image aspect from pane aspect. A `uPaneAspect` uniform (canvas
width/height, sampled per frame) drives a `fitNDC` helper that letter/pillarboxes each
view to its true image aspect — `ProjAspect` for the projector output, `SourceAspect`
for the eye view — filling the spare area with background. See also the on-demand
rendering note in `07-roadmap.md` for when a `ResizeObserver` would become preferable.

### D-3 — Bundled screenshots are triple-screen captures — PARTIALLY RESOLVED

**Status:** the aspect-conflation half is fixed; the framing/FOV half is still open.
`SourceAspect` is now a distinct control (with presets and center-crop of the source
image) separate from `ProjAspect`, so the source is no longer sampled through the
projector's aspect. What remains is selecting *which region* of a triple-screen capture
to treat as the game frame, with the matching FOV.

All seven bundled images are triple-monitor captures, not single-display frames:

| Image | Dimensions | Aspect | Implied single screen |
|---|---|---|---|
| `ac1.jpg` | 5760×1200 | 4.80 | 1920×1200 |
| `iracing.jpg` | 6040×1200 | 5.03 | ~2013×1200 |
| `pcars.png` | 6048×1080 | 5.60 | 2016×1080 |
| `racing1.jpg` | 7680×1440 | 5.33 | 2560×1440 |
| `rfactor2_1.jpg` | 7680×1440 | 5.33 | 2560×1440 |
| `dirtrally_cockpit4.jpg` | 3250×600 | 5.42 | ~1083×600 |
| `dirtrally_g44.jpg` | 3250×600 | 5.42 | ~1083×600 |

The source project `joegaffey/muscled` confirms this in `screen.js`, which maps them with
`repeat.x = 1/3` and a per-screen offset of −1/3, 0, or +1/3.

The shader samples the full texture as the game frame while `projAspect` defaults to
1.777, so the source is roughly three times too wide for the assumed projection. The warp
geometry is correct but is being fed misframed content, which undermines the images'
value as a calibration reference.

**Two coupled corrections are needed, not one.**

1. **Framing.** Select which portion of the source to treat as the game frame. Default to
   the centre third, matching muscled's middle-screen offset of 0.
2. **Field of view.** A triple-screen capture spans a far wider horizontal FOV than its
   centre third. Whichever region is selected, `gameHFovDeg` must describe *that region*,
   or `03-geometry.md` step 7 maps eye directions to the wrong source UVs. Cropping
   without adjusting FOV produces a plausible-looking but incorrect warp.

Proposed as a user setting rather than a fixed crop, since a user may legitimately want
the full width for a wide single projector, or a side third to check off-centre content:

| Setting | Purpose |
|---|---|
| Source region | Full width, left third, centre third (default), right third |
| Source FOV | Horizontal FOV that the *selected region* represents |

Implementation is a UV transform on the sampled region — a scale and offset applied in
`gameFrame`, equivalent to muscled's `repeat.x` and `offset.x`. Selecting a region should
scale `gameHFovDeg` proportionally by default, while remaining manually overridable, so
the coupling in point 2 is handled without the user having to reason about it.

Note: the distinct source aspect this correction needs is now in place (`SourceAspect`,
independent of `ProjAspect`). The remaining work is the region-selection UV transform and
its coupled FOV; the selected region should also set `SourceAspect` from that region's
proportions rather than being left to the user.


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

D-1 and D-2 are done, and the aspect-split half of D-3 is done alongside D-2 (they shared
the same `projAspect` conflation). D-3's remaining framing/FOV half is **deferred** while
multi-projector work is prioritised.

1. **Multi-projector + edge blending (FR-9, FR-18, FR-19, FR-20)** — normative model in
   `03-geometry.md`, "Multi-projector and edge blending". Implemented in the web simulator
   (data-driven projectors array, composite eye view, per-projector black/gain/gamma,
   black-level lift). Remaining: port to the standalone app (see `07-roadmap.md` step 5).
2. **FR-31 with the two-pass eye view** — shared render-to-texture foundation.
3. **FR-30** — largest, and benefits from FR-31 already establishing projector-driven
   rendering in the 3D scene.
4. **D-3 (framing/FOV)** — deferred. The bundled images are the primary calibration
   reference and currently show three copies of the game at the wrong horizontal FOV; the
   `SourceAspect` foundation is in place, and the remaining region-selection UV transform
   plus coupled FOV can land once multi-projector is underway.

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

### D-3 — Bundled screenshots are triple-screen captures

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

Note that `projAspect` is currently reused as the game's aspect ratio in the eye-view and
source-UV maths. Correct framing needs a distinct source aspect, derived from the selected
region rather than borrowed from the projector.


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

1. **D-3** — the bundled images are the primary calibration reference, and while they are
   misframed the grid straightness check is the only trustworthy signal. Also the item
   most likely to mislead, since a cropped-but-wrong-FOV result looks plausible.
2. **D-2** — correctness issue, and its aspect handling overlaps D-3's source aspect work.
3. **D-1** — small, self-contained cosmetic fix.
4. **FR-31 with the two-pass eye view** — shared render-to-texture foundation.
5. **FR-30** — largest, and benefits from FR-31 already establishing projector-driven
   rendering in the 3D scene.

D-2 and D-3 are worth doing together: both concern the relationship between source aspect,
projector aspect, and pane aspect, which is currently conflated in a single `projAspect`
uniform.

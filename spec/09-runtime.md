# BendR — Runtime Output Specification

**Path:** `web/index.html` (output mode) — **Status:** implemented in the web simulator; not yet verified on hardware

Phase 1.5: use the calibrated simulator to drive the real projectors, then carry the
calibration to ReShade or the standalone app. It is a **validation and on-rig tuning**
tool, not a live-capture runtime: the source is static (the calibration grid, optionally
a bundled image), and live game frames remain the job of ReShade (`05-reshade-shader.md`)
and the standalone app (`06-standalone-app.md`).

## Purpose

- Project each projector's warp **fullscreen** onto the physical screen so the warp can
  be checked and tuned where it actually lands, not just in the simulator panes.
- Keep one calibration model: the output windows render the same shader and parameters
  as the simulator, so what is tuned on the rig is what ReShade and the app will use.
- Export the calibration as JSON so it can be carried to a different machine (for
  example, configured on a laptop and applied on the gaming rig).

## Roles

Two roles share one file (`web/index.html`), so the warp math and parameters cannot
drift between them.

- **Controller** — the simulator in normal mode. Owns all state and controls; the
  collapsible sidebar is the control surface.
- **Output** — `web/index.html#output=<j>&cfg=<base64>`, a separate browser window that
  renders projector *j*'s warp full-window. It has no sidebar; its only chrome is a
  fullscreen prompt (see "Fullscreen").

Both roles run on the **same host** (one browser, one origin). Cross-machine use is
export-only, not live sync.

## Output mode

Activated by the URL hash:

- `output=<j>` selects the projector to render. `cfg` carries the initial configuration
  (see "Config schema"), base64-encoded JSON, so the window is self-contained and
  reloadable.
- On load, the configuration is decoded into the parameter state, the active projector
  is set to `j`, and a `run` class is applied to `<body>`.
- In `run` mode the sidebar, 3D scene, eye view, and pane labels are hidden; the
  projector-output canvas fills the window. The canvas keeps the panel's true aspect
  (`ProjAspect`) regardless of window size, exactly as the simulator's Projector Output
  pane does, so a mismatched window aspect letter/pillarboxes rather than stretching.
- The output renders the **calibration pose** (the pose the warp is computed from), not
  the simulator's separate actual pose. The calibration/actual split is a
  simulator-only validation device; every runtime target warps for the projector's real
  (calibrated) pose.

## Launch

The controller exposes a **Launch outputs** button (Projectors section). On click, for
each **enabled** projector *i*:

- If a window named `bendr-out-<i>` is already open and not closed, focus it and send the
  current configuration; otherwise `window.open(path + '#output=' + i + '&cfg=' + enc,
  'bendr-out-' + i)`.
- If `window.open` returns null, the popup was blocked; report it and continue.

Placement is **manual**. The user drags each window onto its projector and maximizes or
enters fullscreen. There is deliberately no Window Management API use and no automatic
screen positioning: it is non-standard across browsers and adds a dependency for little
gain on a one-time setup.

## Sync protocol

Live sync uses `window.postMessage`, a universally supported part of the DOM standard,
with no additional API dependency.

- The controller keeps the `window.open` references and, on every parameter change,
  posts `{ type: 'config', config }` to each open output.
- Each output posts `{ type: 'ready' }` to `window.opener` on load. The controller
  replies with the current configuration to that window, so a window opened after the
  last broadcast still receives the state.
- Both sides ignore any message whose `event.origin` is not the document origin.
- The URL hash seeds the initial configuration, so an output renders correctly even
  before the handshake completes or if opened without a live controller.

Configuration is a full snapshot, not a diff: it is small and idempotent, and it keeps
the protocol trivial.

## Config schema

Version 1. This is the handoff contract: the standalone app consumes it, and a future
ReShade preset generator derives from it.

```json
{
  "version": 1,
  "screen":  { "radius": 1.5, "height": 1.5, "arcDeg": 150, "base": 0.45 },
  "eye":     { "x": 0, "y": 1.2, "z": 0, "gameHFovDeg": 90, "sourceAspect": 1.777 },
  "source":  { "image": null, "showGrid": true, "gridLines": 12 },
  "projectors": [
    {
      "name": "Projector 1",
      "enabled": true,
      "pose":        { "x": 0, "y": 2.2, "z": -1.3, "yaw": 0, "pitch": -15, "roll": 0 },
      "intrinsics":  { "hFovDeg": 90, "aspect": 1.777 },
      "blend":       { "left": 0, "right": 0, "top": 0, "bottom": 0 },
      "photometric": { "blackLevel": 0, "gamma": 2.2, "gain": 1 }
    }
  ]
}
```

- `pose` is the **calibration pose** used to compute the warp.
- `screen`, `eye`, `pose`, and `intrinsics` correspond to the parameters in
  `03-geometry.md`; `blend` and `photometric` to its "Multi-projector and edge blending"
  section.
- `source.image` is a source-image name (a `GAME_IMAGES` key, e.g. `"iRacing"`) or null
  (the synthetic test grid); `showGrid` and `gridLines` are the calibration overlay.

## Fullscreen

The browser requires a user gesture in each document, so the controller cannot put an
output fullscreen. Each output shows a centered **Go fullscreen** prompt:

- On click, `document.documentElement.requestFullscreen()`.
- The prompt hides while `document.fullscreenElement` is set and reappears when the user
  exits (the `fullscreenchange` handler).
- The cursor auto-hides after a few idle seconds so it is not projected.

Maximizing the window is an acceptable alternative; fullscreen is only about removing the
browser chrome.

## Export

The controller provides **Copy JSON** and **Download JSON**. A downloaded file is the
easiest way to carry the calibration to another machine (for example, a laptop to a
gaming rig). The export is the v1 schema above.

## Handoff to other targets

- **ReShade** (`05-reshade-shader.md`): single projector. The shader is currently behind
  the simulator (it predates the projector/source aspect split, the floor model, and the
  aspect-square grid); a sync pass is required before a JSON-to-preset generator is
  worthwhile. That generator is a follow-up, not part of this document.
- **Standalone app** (`06-standalone-app.md`): consumes the JSON directly.
- **Parity**: all targets must agree with `03-geometry.md`. A fixed-input parity test
  (parameters to expected output UVs) is the safeguard; it is deferred
  (`07-roadmap.md`, "Deferred").

## Constraints

- **Same origin only.** `postMessage` sync and `window.opener` require the controller and
  outputs to share an origin. Serve over HTTPS or localhost; `file://` origins are opaque.
- **No live capture.** A browser cannot perform desktop capture. Static source only.
- **Fullscreen is per-window and non-exclusive.** It is not a presentation-mode lock.
- **WebGL contexts.** One per output window, up to the projector maximum (4).
- **Popup blocking.** Launch requires a user gesture; blocked popups are reported.

## Acceptance criteria

- **AC-10** Launching outputs for all enabled projectors opens one window each; each
  renders its projector's warp full-window, and with the calibration grid the lines
  appear straight from the eye-point and match the simulator's Projector Output pane.
- **AC-11** Changing any parameter in the controller updates the open outputs live,
  without reloading them.
- **AC-12** Exporting produces JSON that, used as an output's `cfg`, reproduces the same
  warp as the controller.

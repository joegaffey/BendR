# BendR.fx — Install & Calibration

Phase 1 of BendR: a custom ReShade shader for **off-axis cylindrical warp** on a
single projector. See `../docs/geometry.md` for the underlying math.

## Requirements

- Windows PC running the game/sim.
- A single projector aimed at your cylindrical screen.
- [ReShade](https://reshade.me/) installed against the game (DX11/DX12/OpenGL/Vulkan).

> Note: ReShade injects into the game. It's fine for offline titles (DCS, MSFS, etc.)
> but some **online** games' anti-cheat may flag it. Multi-projector edge blending is
> **not** supported here — that's Phase 2 (the standalone app).

## Install

1. Install ReShade and select your game's executable + graphics API.
2. Copy `BendR.fx` into your ReShade shaders folder, typically:
   ```
   <game folder>\reshade-shaders\Shaders\BendR.fx
   ```
3. Launch the game on the projector display.
4. Open the ReShade overlay (default `Home` key) and enable **BendR — Bend Reality**.

## Calibration (one-time on a fixed rig)

Work top-down through the slider categories:

### 1. Match the game's FOV
- Set **Eye-point > Game Horizontal FOV** to the *exact* FOV your sim is rendering.
- If this is wrong, nothing else will straighten out. Check your sim's FOV/zoom setting.

### 2. Enter the screen geometry (measured)
- **Screen > Screen Radius** — distance from the cylinder axis to the screen surface.
- **Screen > Screen Height** — vertical extent of the screen.
- **Screen > Screen Horizontal Arc** — how many degrees of arc your screen covers.

### 3. Set your eye-point
- **Eye-point > Eye Position (x,y,z)** — your head position relative to the cylinder
  axis (origin). If you sit at the center of curvature, leave near (0,0,0).

### 4. Dial in the projector (fully flexible)
- **Projector > Position (x,y,z)** — where the projector lens sits.
- **Projector > Rotation (yaw,pitch,roll)** — aim direction.
- **Projector > Horizontal FOV / Aspect** — from the projector's spec sheet / throw.

### 5. Straighten using the grid
- Enable **Calibration > Show Calibration Grid** (green grid, drawn in game space).
- When geometry is correct, the projected grid looks **straight and evenly spaced**
  from your seat. Adjust projector rotation/position until it does.
- Increase **Grid Lines** for finer checking; reduce **Grid Thickness** for precision.
- Turn the grid off when done.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Shader won't compile | HLSL syntax / ReShade version | Note the exact error; report it |
| Image mirrored / upside-down | axis sign convention | flip a sign in Step 1/5 (report it) |
| Large black borders | projector FOV too small vs screen arc | raise Projector FOV or reposition |
| Whole screen black | projector ray misses cylinder | check ProjPos/Rotation sign & radius |
| Grid curved, can't straighten | Game FOV mismatch | set Game FOV to match sim exactly |
| Edges too stretched | eye-point wrong | correct Eye Position |

## Status

This shader hasn't yet been compiled/tested on live hardware. On first run, please
report any compile errors or orientation issues (mirrored/upside-down/rotated) and
they can be corrected quickly — a couple of handedness conventions are the most
likely things to need a tweak.

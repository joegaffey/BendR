// BendR.fx — Bend Reality
// Analytic off-axis cylindrical warp for ReShade (single projector).
//
// Phase 1 of BendR. Corrects the final rendered frame so that a game/sim looks
// geometrically correct when projected onto a cylindrical screen, from ANY
// projector placement (fully flexible 6-DOF pose) and a chosen viewer eye-point.
//
// Coordinate convention:
//   - Origin at the cylinder axis (center of curvature).
//   - +X right, +Y up, +Z forward (toward the screen front / away from viewer back).
//   - Units in meters.
//   - The cylinder axis is vertical (along Y). Screen is a vertical arc of the cylinder.
//
// Method (inverse warp — for each OUTPUT/projector pixel, find the SOURCE UV):
//   1. Output pixel -> a ray leaving the projector (using projector pose + FOV).
//   2. Intersect that ray with the cylinder surface -> screen point S.
//   3. Look at S from the eye-point -> direction -> map to the game's source UV
//      using the game's assumed (flat) camera projection.
//   4. Sample the game frame at that UV.
//
// This is the same math that will later port into the standalone BendR app.

#include "ReShade.fxh"

// ------------------------------------------------------------------
// Tunable parameters (live sliders in ReShade's UI)
// ------------------------------------------------------------------

// --- Screen (cylinder) geometry ---
uniform float ScreenRadius <
    ui_type = "slider"; ui_label = "Screen Radius (m)";
    ui_min = 0.3; ui_max = 5.0; ui_step = 0.01;
    ui_category = "Screen";
> = 1.5;

uniform float ScreenHeight <
    ui_type = "slider"; ui_label = "Screen Height (m)";
    ui_min = 0.3; ui_max = 4.0; ui_step = 0.01;
    ui_category = "Screen";
> = 1.0;

// Horizontal wrap of the screen arc, in degrees (centered on +Z).
uniform float ScreenArcDeg <
    ui_type = "slider"; ui_label = "Screen Horizontal Arc (deg)";
    ui_min = 30.0; ui_max = 270.0; ui_step = 1.0;
    ui_category = "Screen";
> = 150.0;

// --- Eye-point (viewer) position, offset from cylinder axis (m) ---
uniform float3 EyePos <
    ui_type = "slider"; ui_label = "Eye Position (x,y,z m)";
    ui_min = -3.0; ui_max = 3.0; ui_step = 0.01;
    ui_category = "Eye-point";
> = float3(0.0, 0.0, 0.0);

// The horizontal FOV (deg) the GAME is rendering with. Must match the sim's FOV
// setting for straight lines to come out straight.
uniform float GameHFovDeg <
    ui_type = "slider"; ui_label = "Game Horizontal FOV (deg)";
    ui_min = 30.0; ui_max = 160.0; ui_step = 0.5;
    ui_category = "Eye-point";
> = 90.0;

// --- Projector pose (fully flexible) ---
uniform float3 ProjPos <
    ui_type = "slider"; ui_label = "Projector Position (x,y,z m)";
    ui_min = -4.0; ui_max = 4.0; ui_step = 0.01;
    ui_category = "Projector";
> = float3(0.0, 0.6, -1.3);  // default: overhead & behind eye, clears the head (no shadow)

uniform float3 ProjRotDeg <
    ui_type = "slider"; ui_label = "Projector Rotation (yaw,pitch,roll deg)";
    ui_min = -60.0; ui_max = 60.0; ui_step = 0.1;
    ui_category = "Projector";
> = float3(0.0, -15.0, 0.0);   // default: tilted down 15deg onto the screen

uniform float ProjHFovDeg <
    ui_type = "slider"; ui_label = "Projector Horizontal FOV (deg)";
    ui_min = 20.0; ui_max = 150.0; ui_step = 0.5;
    ui_category = "Projector";
> = 90.0;

uniform float ProjAspect <
    ui_type = "slider"; ui_label = "Projector Aspect (w/h)";
    ui_min = 1.0; ui_max = 2.5; ui_step = 0.001;
    ui_category = "Projector";
> = 1.777;  // 16:9

// --- Calibration overlay ---
uniform bool ShowGrid <
    ui_label = "Show Calibration Grid";
    ui_category = "Calibration";
> = true;

uniform int GridLines <
    ui_type = "slider"; ui_label = "Grid Lines";
    ui_min = 4; ui_max = 32; ui_step = 1;
    ui_category = "Calibration";
> = 12;

uniform float GridThickness <
    ui_type = "slider"; ui_label = "Grid Thickness (px)";
    ui_min = 0.5; ui_max = 4.0; ui_step = 0.1;
    ui_category = "Calibration";
> = 1.0;

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

static const float PI = 3.14159265358979;
#define DEG2RAD(d) ((d) * (PI / 180.0))

// Build a rotation matrix from yaw (Y), pitch (X), roll (Z), in radians.
// Applied order: roll, then pitch, then yaw (R = Ryaw * Rpitch * Rroll).
float3x3 rotationYPR(float3 ypr)
{
    float cy = cos(ypr.x), sy = sin(ypr.x);
    float cp = cos(ypr.y), sp = sin(ypr.y);
    float cr = cos(ypr.z), sr = sin(ypr.z);

    float3x3 Ry = float3x3( cy, 0,  sy,
                            0,  1,  0,
                           -sy, 0,  cy);
    float3x3 Rp = float3x3( 1,  0,   0,
                            0,  cp, -sp,
                            0,  sp,  cp);
    float3x3 Rr = float3x3( cr, -sr, 0,
                            sr,  cr, 0,
                            0,   0,  1);
    return mul(Ry, mul(Rp, Rr));
}

// True if screen point S lies within the physical screen arc + height.
bool inScreenBounds(float3 S)
{
    float ang = atan2(S.x, S.z);                 // 0 at +Z, +right
    float halfArc = DEG2RAD(ScreenArcDeg) * 0.5;
    return (abs(ang) <= halfArc) && (abs(S.y) <= ScreenHeight * 0.5);
}

// Intersect a ray (origin o, dir d) with an infinite vertical cylinder of radius R
// centered on the Y axis. Returns the NEAREST positive t whose hit lies within the
// screen bounds, or -1 if none. This is correct for any placement: a front
// projector inside the cylinder hits the far wall; a rear projector outside enters
// the near wall first.
float intersectCylinderY(float3 o, float3 d, float R)
{
    float2 oc = o.xz;
    float2 dc = d.xz;
    float a = dot(dc, dc);
    float b = 2.0 * dot(oc, dc);
    float c = dot(oc, oc) - R * R;
    float disc = b * b - 4.0 * a * c;
    if (disc < 0.0 || a < 1e-8) return -1.0;
    float sq = sqrt(disc);
    float t0 = (-b - sq) / (2.0 * a);
    float t1 = (-b + sq) / (2.0 * a);
    float ta = min(t0, t1);
    float tb = max(t0, t1);
    if (ta > 1e-4 && inScreenBounds(o + ta * d)) return ta;
    if (tb > 1e-4 && inScreenBounds(o + tb * d)) return tb;
    return -1.0;
}

// ------------------------------------------------------------------
// Main warp
// ------------------------------------------------------------------

float4 PS_BendR(float4 pos : SV_Position, float2 uv : TEXCOORD) : SV_Target
{
    // 1) Output pixel (this projector pixel) -> ray in projector local space.
    //    uv in [0,1]; convert to NDC-ish [-1,1] with aspect + FOV.
    float2 ndc = uv * 2.0 - 1.0;
    ndc.y = -ndc.y;  // screen-space y is down

    // Rear projection: projector sits OUTSIDE the cylinder (axis distance > radius).
    // Light passes through the screen to the viewer, so the emitted image is
    // mirrored left-right. Flip ndc.x in that case.
    bool rear = length(ProjPos.xz) > ScreenRadius;
    if (rear) ndc.x = -ndc.x;

    float tanH = tan(DEG2RAD(ProjHFovDeg) * 0.5);
    float tanV = tanH / ProjAspect;

    float3 rayLocal = normalize(float3(ndc.x * tanH, ndc.y * tanV, 1.0));

    // 2) Transform ray into world space using projector pose.
    float3x3 Rproj = rotationYPR(DEG2RAD(ProjRotDeg));
    float3 rayWorld = normalize(mul(Rproj, rayLocal));
    float3 rayOrigin = ProjPos;

    // 3) Intersect with cylinder -> screen point S.
    float t = intersectCylinderY(rayOrigin, rayWorld, ScreenRadius);
    if (t < 0.0)
        return float4(0, 0, 0, 1);  // projector pixel misses the screen -> black

    float3 S = rayOrigin + t * rayWorld;
    // (S is guaranteed within the screen arc + height by intersectCylinderY.)

    // 4) Look at S from the eye-point -> direction the viewer sees that point.
    float3 viewDir = normalize(S - EyePos);

    // 5) Map viewDir to the game's source UV assuming the game renders a flat
    //    (rectilinear) camera looking down +Z with GameHFovDeg.
    //    Project onto the game's image plane at z=1.
    if (viewDir.z <= 1e-4)
        return float4(0, 0, 0, 1);  // behind/parallel to game camera plane

    float gTanH = tan(DEG2RAD(GameHFovDeg) * 0.5);
    float gTanV = gTanH / ProjAspect;  // assume game aspect ~ projector aspect

    float2 img = float2(viewDir.x / viewDir.z / gTanH,
                        viewDir.y / viewDir.z / gTanV);

    // img in [-1,1] -> source UV [0,1]
    float2 srcUV = float2(img.x * 0.5 + 0.5, -img.y * 0.5 + 0.5);

    // Outside the game frame -> black (no source data there).
    if (srcUV.x < 0.0 || srcUV.x > 1.0 || srcUV.y < 0.0 || srcUV.y > 1.0)
        return float4(0, 0, 0, 1);

    float3 col = tex2D(ReShade::BackBuffer, srcUV).rgb;

    // --- Calibration grid overlay (drawn in SOURCE/game space so straight = correct) ---
    if (ShowGrid)
    {
        float2 g = srcUV * GridLines;
        float2 f = abs(frac(g) - 0.5);
        float2 df = fwidth(g) * GridThickness;
        float lineMask = 1.0 - saturate(min(f.x / df.x, f.y / df.y));
        col = lerp(col, float3(0.0, 1.0, 0.0), lineMask * 0.9);
    }

    return float4(col, 1.0);
}

technique BendR <
    ui_label = "BendR — Bend Reality";
    ui_tooltip = "Off-axis cylindrical warp for sim rigs.";
>
{
    pass
    {
        VertexShader = PostProcessVS;
        PixelShader  = PS_BendR;
    }
}

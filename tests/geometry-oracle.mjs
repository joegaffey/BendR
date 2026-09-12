// CPU reference for the projector-output warp (GLSL mode 0). Mirrors the documented
// implementation conventions in docs/geometry.md: Steps 1-5 plus the rear-projection
// mirror and the pane letter/pillarboxing. The parity test compares this against the
// pixels actually produced by the GPU shader.
//
// NOTE: the projector rotation is built with GLSL column-major `mat3(...)` semantics,
// matching web/index.html's `rotYPR` and spec/03-geometry.md Step 3. Positive pitch
// tilts the forward vector up, which is what auto-aim's `atan2(d.y, ...)` requires.
const PI = Math.PI;
const d2r = (d) => (d * PI) / 180;
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];

// Column-major 3x3: m[col*3 + row], exactly as GLSL's mat3(...) arguments.
const mat3 = (...a) => a;
function mul(A, B) {
  const C = new Array(9);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += A[k * 3 + row] * B[col * 3 + k];
      C[col * 3 + row] = s;
    }
  }
  return C;
}
function apply(M, v) {
  return [
    M[0] * v[0] + M[3] * v[1] + M[6] * v[2],
    M[1] * v[0] + M[4] * v[1] + M[7] * v[2],
    M[2] * v[0] + M[5] * v[1] + M[8] * v[2],
  ];
}
function rotYPR(yawDeg, pitchDeg, rollDeg) {
  const y = d2r(yawDeg);
  const p = d2r(pitchDeg);
  const r = d2r(rollDeg);
  const cy = Math.cos(y), sy = Math.sin(y);
  const cp = Math.cos(p), sp = Math.sin(p);
  const cr = Math.cos(r), sr = Math.sin(r);
  const Ry = mat3(cy, 0, -sy, 0, 1, 0, sy, 0, cy);
  const Rp = mat3(1, 0, 0, 0, cp, -sp, 0, sp, cp);
  const Rr = mat3(cr, -sr, 0, sr, cr, 0, 0, 0, 1);
  return mul(mul(Ry, Rp), Rr);
}

function inBounds(S, screen) {
  const ang = Math.atan2(S[0], S[2]);
  const halfArc = d2r(screen.screenArcDeg) * 0.5;
  return (
    Math.abs(ang) <= halfArc &&
    S[1] >= screen.screenBase &&
    S[1] <= screen.screenBase + screen.screenHeight
  );
}

function intersectCylinderY(o, d, R, screen) {
  const oc = [o[0], o[2]];
  const dc = [d[0], d[2]];
  const a = dot2(dc, dc);
  const b = 2 * dot2(oc, dc);
  const c = dot2(oc, oc) - R * R;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-8) return -1;
  const sq = Math.sqrt(disc);
  const t0 = (-b - sq) / (2 * a);
  const t1 = (-b + sq) / (2 * a);
  const ta = Math.min(t0, t1);
  const tb = Math.max(t0, t1);
  if (ta > 1e-4 && inBounds([o[0] + ta * d[0], o[1] + ta * d[1], o[2] + ta * d[2]], screen)) return ta;
  if (tb > 1e-4 && inBounds([o[0] + tb * d[0], o[1] + tb * d[1], o[2] + tb * d[2]], screen)) return tb;
  return -1;
}

function eyeUV(S, cfg) {
  const viewDir = norm([S[0] - cfg.eye.x, S[1] - cfg.eye.y, S[2] - cfg.eye.z]);
  if (viewDir[2] <= 1e-4) return null;
  const gTanH = Math.tan(d2r(cfg.gameHFovDeg) * 0.5);
  const gTanV = gTanH / cfg.sourceAspect;
  const ix = viewDir[0] / viewDir[2] / gTanH;
  const iy = viewDir[1] / viewDir[2] / gTanV;
  return [ix * 0.5 + 0.5, -iy * 0.5 + 0.5];
}

const BG = [0, 0, 0];
const OOB = [0.02, 0.02, 0.03];
const BLACK = [0, 0, 0];

// Expected linear RGB (0..1) for one output pixel of the projector-output view.
// px: column; py: row measured from the bottom (WebGL readPixels origin).
export function expectedPixel(cfg, px, py, size) {
  const u = (px + 0.5) / size;
  const v = (py + 0.5) / size;
  let ndcX = u * 2 - 1;
  let ndcY = -(v * 2 - 1);

  const cal = cfg.cal;
  if (cfg.paneAspect > cal.aspect) ndcX *= cfg.paneAspect / cal.aspect;
  else ndcY *= cal.aspect / cfg.paneAspect;
  if (Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) return { color: BG, lit: false };

  const halfArc = d2r(cfg.screenArcDeg) * 0.5;
  const rear =
    Math.hypot(cal.pos.x, cal.pos.z) > cfg.screenRadius &&
    Math.abs(Math.atan2(cal.pos.x, cal.pos.z)) <= halfArc;
  if (rear) ndcX = -ndcX;

  const tanH = Math.tan(d2r(cal.hFovDeg) * 0.5);
  const tanV = tanH / cal.aspect;
  const rayLocal = norm([ndcX * tanH, ndcY * tanV, 1]);
  const R = rotYPR(cal.rot.yaw, cal.rot.pitch, cal.rot.roll);
  const rayWorld = norm(apply(R, rayLocal));
  const origin = [cal.pos.x, cal.pos.y, cal.pos.z];

  const t = intersectCylinderY(origin, rayWorld, cfg.screenRadius, cfg);
  if (t < 0) return { color: BLACK, lit: false };
  const S = [origin[0] + t * rayWorld[0], origin[1] + t * rayWorld[1], origin[2] + t * rayWorld[2]];
  if (!inBounds(S, cfg)) return { color: OOB, lit: false };

  const uv = eyeUV(S, cfg);
  if (!uv || uv[0] < 0 || uv[0] > 1 || uv[1] < 0 || uv[1] > 1) {
    return { color: BLACK, lit: false };
  }
  // UV ramp texture: sample (t.x, 1 - t.y) returns (srcUV.x, 1 - srcUV.y).
  return { color: [uv[0], 1 - uv[1], 0], lit: true };
}

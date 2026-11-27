// Original authored relief for the default hologram. The reference image is
// art direction only. All light and geometry below are generated as points.
export const particleStride = 5;
export const eyeHaloCount = 2;
const total = 48000;
const tau = Math.PI * 2;
const lo = -0.91;
const hi = 0.94;

// Height, half-width, and center of each cross-section from chin to brow.
const sections = [
  [lo, 0.04, 0.01],
  [-0.89, 0.16, 0.008],
  [-0.83, 0.3, 0.003],
  [-0.72, 0.414, -0.002],
  [-0.57, 0.476, -0.004],
  [-0.35, 0.538, 0],
  [-0.12, 0.608, 0.005],
  [0.06, 0.619, 0.006],
  [0.23, 0.595, 0.006],
  [0.4, 0.564, 0.003],
  [0.6, 0.535, -0.003],
  [0.75, 0.484, -0.015],
  [0.86, 0.353, -0.031],
  [hi, 0.12, -0.038],
];
const eyes = [
  [-0.283, 0.178],
  [0.282, 0.192],
];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const bump = (x, y, rx, ry) => Math.exp(-((x / rx) ** 2 + (y / ry) ** 2));
const mix = (a, b, t) => a + (b - a) * t;

function section(y) {
  const i = sections.findIndex(([height]) => y < height);
  const j = i < 0 ? sections.length - 1 : Math.max(1, i);
  const a = sections[Math.max(0, j - 2)],
    b = sections[j - 1];
  const c = sections[j],
    d = sections[Math.min(sections.length - 1, j + 1)];
  const t = clamp((y - b[0]) / (c[0] - b[0]), 0, 1);
  return [1, 2].map(
    (k) =>
      b[k] +
      0.5 *
        t *
        (c[k] -
          a[k] +
          t * (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k] + t * (3 * (b[k] - c[k]) + d[k] - a[k]))),
  );
}

const rows = Array.from({ length: 400 }, (_, i) => section(lo + ((hi - lo) * i) / 399));
function surface(x, y) {
  const [width, center] = rows[clamp(Math.round(((y - lo) / (hi - lo)) * 399), 0, 399)];
  const q = (x - center) / width;
  const shell = Math.sqrt(Math.max(0, 1 - q * q));
  let depth = 0.032 + shell * (0.408 + 0.04 * Math.cos(y * 3.2));
  for (const [ex, ey] of eyes) {
    const dx = x - ex,
      dy = y - ey;
    depth -= 0.127 * bump(dx, dy, 0.193, 0.126);
    depth += 0.049 * bump(dx, dy - 0.125, 0.148, 0.069);
    depth += 0.095 * bump(dx * 0.92 - Math.sign(ex) * 0.091, dy + 0.237, 0.167, 0.137);
    depth += 0.023 * bump(dx, dy + 0.057, 0.119, 0.061);
  }
  depth += 0.174 * bump(x + 0.007, y - 0.073, 0.086, 0.28);
  depth += 0.219 * bump(x + 0.009, y + 0.115, 0.116, 0.098);
  depth += 0.074 * bump(Math.abs(x) - 0.099, y + 0.159, 0.057, 0.069);
  depth -= 0.056 * bump(Math.abs(x) - 0.079, y + 0.202, 0.034, 0.025);
  depth -= 0.032 * bump(x, y + 0.278, 0.042, 0.072);
  depth += 0.05 * bump(x, y + 0.374, 0.169, 0.048);
  depth += 0.089 * bump(x + 0.004, y + 0.468, 0.175, 0.057);
  depth -= 0.048 * bump(x, y + 0.555, 0.171, 0.058);
  depth += 0.095 * bump(x - 0.003, y + 0.707, 0.22, 0.118);
  return depth;
}

const lipSeam = (x) =>
  -0.411 + 0.028 * Math.exp(-(((Math.abs(x) - 0.064) / 0.046) ** 2)) - 0.012 * (x / 0.24) ** 2;

function appearance(x, y, z, side) {
  const dx = (surface(x + 0.009, y) - surface(x - 0.009, y)) / 0.018;
  const dy = (surface(x, y + 0.009) - surface(x, y - 0.009)) / 0.018;
  const norm = Math.hypot(dx, dy, 1);
  const diffuse = Math.max(0, (-0.52 * dx - 0.47 * dy + 0.66) / norm);
  const bounce = Math.max(0, (0.67 * dx - 0.25 * dy + 0.46) / norm);
  const rim = clamp((Math.abs(side) - 0.62) / 0.38, 0, 1);
  const crest = bump(x + 0.021, y - 0.625, 0.186, 0.148);
  const eyeBridge = bump(x + 0.015, y - 0.282, 0.08, 0.19);
  const cheeks = bump(Math.abs(x) - 0.409, y + 0.074, 0.147, 0.167);
  const chin = bump(x, y + 0.737, 0.19, 0.091);
  const noseTip = bump(x + 0.018, y + 0.103, 0.109, 0.058);
  const mouth = bump(x, y - lipSeam(x), 0.201, 0.035);
  const lowerLip = bump(x, y + 0.475, 0.187, 0.038);
  const nostrils = bump(Math.abs(x) - 0.064, y + 0.179, 0.056, 0.041);
  let socket = 0,
    brow = 0,
    lid = 0;
  for (const [ex, ey] of eyes) {
    const local = x - ex;
    socket += bump(local, y - ey - 0.006, 0.173, 0.104);
    brow += bump(local, y - ey - 0.154 + 0.068 * (local / 0.18) ** 2, 0.166, 0.03);
    lid += bump(local, y - ey + 0.04, 0.143, 0.03);
  }
  const energy = 1.09 * crest + 0.59 * eyeBridge + 0.87 * cheeks + 0.47 * chin + 0.43 * noseTip;
  const light =
    0.045 + 0.39 * diffuse + 0.15 * bounce + 0.24 * rim + energy + 0.26 * lowerLip + 0.09 * lid;
  const shadow = clamp(1 - 0.77 * socket - 0.71 * brow - 0.89 * mouth - 0.85 * nostrils, 0.08, 1);
  const grain = 0.84 + 0.16 * Math.sin(x * 92 + y * 71 + Math.sin(y * 37) * 2.8);
  return light * shadow * grain * (0.85 + 0.15 * clamp(z, 0, 0.8));
}

let cachedCloud;
export function hologramCloud() {
  if (cachedCloud) return cachedCloud;
  let seed = 384542;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const cloud = new Float32Array(total * particleStride);
  let index = 0;
  function point(x, y, z, light, kind = 0) {
    cloud.set([x, y, z, light, kind], index++ * particleStride);
  }

  // Both inner layers and the curved rear cap move with the front relief.
  const detailCount = 4200,
    strandCount = 108,
    strandLength = 21,
    eyeCount = 440;
  const baseCount = total - eyeHaloCount - detailCount - eyeCount - strandCount * strandLength;
  while (index < baseCount) {
    const y = mix(lo, hi, random());
    const [width, center] = rows[Math.round(((y - lo) / (hi - lo)) * 399)];
    if (random() > width * 1.68 && random() > 0.11) continue;
    const side = random() * 2 - 1;
    const edge = Math.abs(side) ** 14;
    const brokenEdge = 0.011 * Math.sin(y * 32) + 0.007 * Math.sin(y * 113 + side * 6);
    const x = center + side * (width + brokenEdge * edge);
    const z = surface(x, y);
    const layer = random();
    const light = Math.min(0.97, appearance(x, y, z, side) * (0.33 + 0.84 * random()));
    if (layer < 0.74) {
      point(x, y, z + (random() - 0.5) * (0.012 + 0.056 * edge), light);
    } else if (layer < 0.92) {
      point(x, y, z - 0.037 - 0.23 * random(), light * 0.3);
    } else {
      point(x, y, -0.36 * Math.sqrt(1 - side * side), light * (0.1 + 0.18 * edge));
    }
  }

  // Sample eyelid folds, the lower lip, and the lit ridges of the forehead and
  // cheeks with overlapping particle patches. Shadows form the facial creases.
  const sites = [
    [-0.32, 0.26, 0.143, 0.047, 0.65],
    [0.305, 0.275, 0.143, 0.048, 0.65],
    [-0.368, -0.035, 0.162, 0.09, 0.78],
    [0.381, -0.026, 0.148, 0.09, 0.8],
    [-0.022, 0.61, 0.167, 0.171, 0.95],
    [-0.014, 0.394, 0.076, 0.151, 0.86],
    [-0.024, -0.115, 0.08, 0.077, 0.68],
    [0, -0.474, 0.133, 0.027, 0.6],
    [0.014, -0.723, 0.132, 0.066, 0.69],
  ];
  for (let i = 0; i < detailCount; i++) {
    const [cx, cy, rx, ry, glow] = sites[i % sites.length];
    const angle = tau * random(),
      r = Math.sqrt(random());
    const x = cx + Math.cos(angle) * r * rx,
      y = cy + Math.sin(angle) * r * ry;
    const z = surface(x, y);
    const seams =
      1 -
      0.84 * bump(x, y - lipSeam(x), 0.196, 0.034) -
      0.69 * bump(Math.abs(x) - 0.068, y + 0.18, 0.049, 0.037);
    point(
      x,
      y,
      z + (0.02 + 0.034 * random()) * (1 - r * 0.4),
      glow * (0.34 + 0.68 * random()) * Math.max(0.1, seams),
    );
  }
  for (const [ex, ey] of eyes) {
    const ez = surface(ex, ey) + 0.079;
    for (let i = 0; i < eyeCount / 2; i++) {
      const a = tau * random();
      const r = 0.064 * random() ** 2.15;
      point(
        ex + Math.cos(a) * r,
        ey + Math.sin(a) * r * 0.66,
        ez - 0.24 * r,
        0.44 + 0.55 * (1 - r / 0.064),
        1,
      );
    }
  }

  const roots = [
    [-0.17, 0.68, 2.02, 0.31],
    [0.14, 0.7, 1.06, 0.32],
    [-0.39, 0.36, 2.43, 0.31],
    [0.4, 0.39, 0.72, 0.28],
    [-0.48, -0.1, 3.09, 0.34],
    [0.47, -0.09, 0.15, 0.33],
    [-0.36, -0.56, 3.54, 0.25],
    [0.37, -0.55, -0.46, 0.25],
    [0.05, -0.77, -1.39, 0.17],
  ];
  for (let i = 0; i < strandCount; i++) {
    const [rx, ry, heading, reach] = roots[i % roots.length];
    const x = rx + (random() - 0.5) * 0.23,
      y = ry + (random() - 0.5) * 0.24;
    const z = surface(x, y) + 0.025;
    const angle = heading + (random() - 0.5) * 1.36;
    const length = reach * (0.5 + 0.87 * random());
    const bend = (random() - 0.5) * 0.132;
    for (let j = 0; j < strandLength; j++) {
      const t = (j + random()) / strandLength;
      const curl = bend * t * t + Math.sin(t * 7) * 0.014;
      point(
        x + Math.cos(angle) * length * t - Math.sin(angle) * curl,
        y + Math.sin(angle) * length * t + Math.cos(angle) * curl,
        z + 0.123 * t - 0.044 * Math.sin(t * Math.PI),
        (0.36 + 0.66 * random()) * (1 - 0.61 * t),
        2,
      );
    }
  }
  // A deterministic shuffle keeps patches and streams present at every device tier.
  for (let i = index - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    for (let k = 0; k < particleStride; k++) {
      const a = i * particleStride + k,
        b = j * particleStride + k,
        previous = cloud[a];
      cloud[a] = cloud[b];
      cloud[b] = previous;
    }
  }
  for (const [x, y] of eyes) point(x, y, surface(x, y) + 0.088, 0.97, 3);
  cachedCloud = cloud;
  return cloud;
}

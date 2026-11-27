// The private file supplies the original hand-drawn strokes in their authoring order.
// The bundled code supplies only the reconstruction rules.
const pointCount = 46000;
export const particleStride = 5;
export const eyeHaloCount = 2;
const emission = { eye: 1, filament: 2, halo: 3 };
const tau = 2 * Math.PI;

function curve(stroke) {
  const points = stroke.slice(2);
  const result = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[Math.max(0, i - 2)],
      b = points[i - 1];
    const c = points[i],
      d = points[Math.min(points.length - 1, i + 1)];
    const steps = Math.max(1, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 0.012));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      result.push(
        b.map(
          (v, k) =>
            v +
            0.5 *
              t *
              (c[k] -
                a[k] +
                t * (2 * a[k] - 5 * v + 4 * c[k] - d[k] + t * (3 * (v - c[k]) + d[k] - a[k]))),
        ),
      );
    }
  }
  result.push(points.at(-1));
  return result;
}

export function readContours(source) {
  const strokes = JSON.parse(source);
  if (
    !Array.isArray(strokes) ||
    strokes.length < 34 ||
    strokes.length > 90 ||
    strokes.some(
      (stroke) =>
        !Array.isArray(stroke) ||
        stroke.length < 4 ||
        stroke.length > 36 ||
        !Number.isFinite(stroke[0]) ||
        stroke[0] < 0.1 ||
        stroke[0] > 1 ||
        !Number.isFinite(stroke[1]) ||
        Math.abs(stroke[1]) > 0.75 ||
        stroke
          .slice(2)
          .some(
            (point) =>
              !Array.isArray(point) ||
              point.length !== 2 ||
              point.some((coordinate) => !Number.isFinite(coordinate) || Math.abs(coordinate) > 1),
          ),
    )
  ) {
    throw new Error("Invalid private portrait");
  }
  let length = 0;
  for (const stroke of strokes) {
    for (let i = 3; i < stroke.length; i++) {
      length += Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]);
    }
  }
  if (length > 44) throw new Error("Portrait exceeds the drawing budget");
  return strokes;
}

function across(path, value, axis) {
  const crossings = [];
  const other = 1 - axis;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    if ((a[axis] <= value && value < b[axis]) || (b[axis] <= value && value < a[axis])) {
      const f = (value - a[axis]) / (b[axis] - a[axis]);
      crossings.push(a[other] + f * (b[other] - a[other]));
    }
  }
  return crossings;
}

const gauss = (x, y, sx, sy) => Math.exp(-((x / sx) ** 2 + (y / sy) ** 2));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function makeCloud(strokes) {
  const paths = strokes.map(curve);
  const silhouette = [...paths[0], ...[...paths[7]].reverse(), paths[0][0]];
  const top = Math.max(...silhouette.map((point) => point[1]));
  const bottom = Math.min(...silhouette.map((point) => point[1]));
  const height = top - bottom;
  const eye = [paths[15], paths[16]].map((path) => [
    (Math.min(...path.map((p) => p[0])) + Math.max(...path.map((p) => p[0]))) / 2,
    (Math.min(...path.map((p) => p[1])) + Math.max(...path.map((p) => p[1]))) / 2,
  ]);
  const nose = paths[18][Math.floor(paths[18].length / 2)];
  const mouth = paths[21][Math.floor(paths[21].length / 2)];
  if (height < 0.8 || eye[1][0] - eye[0][0] < 0.18) throw new Error("Missing portrait geometry");

  const rows = Array.from({ length: 384 }, (_, i) => {
    const y = bottom + ((i + 0.5) * height) / 384;
    const xs = across(silhouette, y, 1);
    return xs.length > 1 ? [y, Math.min(...xs), Math.max(...xs)] : null;
  }).filter(Boolean);
  if (!rows.length) throw new Error("Missing portrait volume");
  const guides = Array.from({ length: 256 }, (_, i) => {
    const x = (i + 0.5) / 128 - 1;
    return [Math.max(-2, ...across(paths[1], x, 0)), Math.max(-2, ...across(paths[23], x, 0))];
  });
  function relief(x, y, acrossHead) {
    const socket = eye.reduce((sum, [ex, ey]) => sum + gauss(x - ex, y - ey, 0.18, 0.115), 0);
    const cheek = eye.reduce(
      (sum, [ex, ey]) => sum + gauss(x - ex * 1.27, y - ey + 0.22, 0.17, 0.16),
      0,
    );
    const ridge = gauss(x - nose[0], y - nose[1] - 0.13, 0.083, 0.23);
    const tip = gauss(x - nose[0], y - nose[1] - 0.024, 0.12, 0.092);
    const lips = gauss(x - mouth[0], y - mouth[1], 0.2, 0.066);
    const chin = gauss(x - mouth[0], y - mouth[1] + 0.25, 0.24, 0.125);
    const shell = Math.sqrt(Math.max(0, 1 - acrossHead * acrossHead));
    return (
      0.04 +
      shell * (0.4 + 0.08 * Math.cos((y - 0.14) * 2.4)) +
      0.105 * ridge +
      0.17 * tip +
      0.079 * cheek -
      0.095 * socket +
      0.045 * lips +
      0.06 * chin
    );
  }

  const brow = [(eye[0][0] + eye[1][0]) / 2, (eye[0][1] + eye[1][1]) / 2 + height * 0.15];
  const cheeks = eye.map(([x, y]) => [x * 1.25, y - height * 0.13]);
  function reliefAt(x, y) {
    const row = rows[clamp(Math.floor(((y - bottom) / height) * rows.length), 0, rows.length - 1)];
    const acrossHead = clamp((2 * (x - row[1])) / Math.max(0.05, row[2] - row[1]) - 1, -1, 1);
    return relief(x, y, acrossHead);
  }

  let seed = 67223;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cloud = new Float32Array(pointCount * particleStride);
  const filamentCount = 56 * 18;
  const eyeCount = 2 * 164;
  const accentStart = pointCount - filamentCount - eyeCount - eyeHaloCount;
  // The first portion samples the lit relief, two inner strata, and a dim rear cap.
  // Each iteration has the same mix so lower display tiers retain all depth layers.
  const featureCount = 6800;
  for (let i = 0; i < accentStart - featureCount; i++) {
    let row = rows[Math.floor(random() * rows.length)];
    if (random() > Math.min(1, (row[2] - row[1]) / 0.87))
      row = rows[Math.floor(random() * rows.length)];
    const [y, left, right] = row;
    const yy = y + ((random() - 0.5) * height) / 384;
    const acrossHead = random() * 2 - 1;
    const x = left + ((right - left) * (acrossHead + 1)) / 2;
    const [hairline, beardline] = guides[clamp(Math.floor((x + 1) * 128), 0, 255)];
    const hair = yy > hairline && (hairline > -1 || yy > 0.37);
    const beard = !hair && (yy < beardline || yy < mouth[1] - 0.18);
    const z = relief(x, yy, acrossHead);
    const west = relief(x - 0.008, yy, acrossHead - 0.016);
    const north = relief(x, yy + 0.008, acrossHead);
    const dx = (west - z) / 0.008;
    const dy = (z - north) / 0.008;
    const diffuse = Math.max(0, (0.65 * -dx + 0.52 * dy + 0.59) / Math.hypot(dx, dy, 1));
    const rim = Math.max(0, (Math.abs(acrossHead) - 0.76) / 0.24);
    const bounce = 0.1 * gauss(acrossHead - 0.66, yy + 0.21, 0.42, 0.59);
    const lighting = 0.16 + 0.83 * diffuse + (0.23 + 0.2 * Math.max(0, acrossHead)) * rim + bounce;
    let eyeShade = 1;
    for (const [ex, ey] of eye) {
      const exd = x - ex,
        eyd = yy - ey;
      const pupil = gauss(exd, eyd, 0.028, 0.02);
      const opening = gauss(exd, eyd, 0.1, 0.043);
      const lowerLid = gauss(exd, eyd + 0.039, 0.103, 0.018);
      eyeShade *= 1 + 0.33 * lowerLid - 0.6 * pupil - 0.25 * opening;
    }
    const nostrils =
      gauss(x - nose[0] - 0.061, yy - nose[1] + 0.018, 0.031, 0.024) +
      gauss(x - nose[0] + 0.068, yy - nose[1] + 0.014, 0.035, 0.028);
    const mouthShade = gauss(x - mouth[0], yy - mouth[1], 0.177, 0.02);
    const features = eyeShade * (1 - 0.49 * nostrils - 0.45 * mouthShade);
    const layer = random();
    const comb = 0.7 + 0.3 * Math.cos((x - yy * 0.48) * 94 + yy * yy * 34);
    const stubble = 0.73 + 0.27 * Math.sin(x * 210 + yy * 44);
    const sweep = 0.67 + 0.33 * Math.sin((x - yy * 0.43) * 42 + yy ** 2 * 19);
    const tissue = hair ? 0.93 * comb * sweep : beard ? 0.76 * stubble : 1;
    const side = beard ? 0.57 : 1;
    const rimDepth = Math.max(0, 1 - Math.abs(acrossHead));
    let depth = z + (random() - 0.5) * (hair ? 0.11 : beard ? 0.065 : 0.026);
    let light =
      (0.3 + 0.67 * random()) *
      tissue *
      lighting *
      features *
      (1 + 0.32 * side * gauss(x + 0.12, yy - 0.22, 0.34, 0.52));
    const crest = gauss(x - brow[0], yy - brow[1], 0.145, 0.175);
    const cheeksLight = cheeks.reduce(
      (sum, [cx, cy]) => sum + gauss(x - cx, yy - cy, 0.14, 0.095),
      0,
    );
    const jaw = gauss(x - mouth[0], yy - mouth[1] + height * 0.145, 0.16, 0.085);
    const corona = 0.82 + 0.18 * Math.sin(x * 84 + yy * 63 + 1.6 * Math.sin(yy * 55));
    light = Math.min(
      0.97,
      light * corona +
        (crest * 0.71 + cheeksLight * 0.54 + jaw * 0.25) *
          (0.35 + 0.65 * random()) *
          (1 - 0.42 * nostrils - 0.37 * mouthShade),
    );
    if (layer > 0.72) {
      depth = layer < 0.91 ? z - 0.025 - 0.25 * random() : -0.34 * Math.sqrt(1 - acrossHead ** 2);
      light *= layer < 0.91 ? 0.28 : 0.12 + 0.13 * (1 - rimDepth);
    }
    cloud.set([x, yy, depth, light, 0], i * particleStride);
  }

  // Glass rims, eyes, nose, mouth, and hair retain distinct depth and luminosity.
  const details = [
    [8, 1.12, 0.077, 0.011, 0.8],
    [9, 1.12, 0.077, 0.011, 0.8],
    [10, 0.25, 0.077, 0.009, 0.92],
    [11, 0.14, 0.06, 0.009, 0.64],
    [12, 0.12, 0.06, 0.009, 0.64],
    [13, 0.44, 0.055, 0.012, 0.79],
    [14, 0.44, 0.055, 0.012, 0.77],
    [15, 0.26, 0.068, 0.008, 0.76],
    [16, 0.26, 0.068, 0.008, 0.76],
    [17, 0.32, 0.019, 0.028, 0.62],
    [18, 0.39, 0.023, 0.022, 0.68],
    [20, 0.23, 0.023, 0.019, 0.35],
    [21, 0.24, 0.014, 0.021, 0.44],
    [22, 0.48, 0.023, 0.021, 0.69],
    [2, 0.25, 0.018, 0.029, 0.53],
    [3, 0.32, 0.036, 0.036, 0.62],
    [4, 0.31, 0.034, 0.034, 0.63],
    [5, 0.23, 0.025, 0.027, 0.53],
    [6, 0.18, 0.02, 0.023, 0.47],
    [24, 0.19, 0.011, 0.032, 0.38],
    [25, 0.15, 0.014, 0.023, 0.35],
    [28, 0.14, 0.015, 0.024, 0.35],
    [30, 0.13, 0.015, 0.025, 0.35],
    [31, 0.13, 0.015, 0.025, 0.35],
  ];
  let cumulative = 0;
  const features = details.map(([index, weight, ...style]) => [
    paths[index],
    (cumulative += weight),
    ...style,
  ]);
  for (let i = accentStart - featureCount; i < accentStart; i++) {
    const choice = random() * cumulative;
    const [path, , offset, width, intensity] = features.find((feature) => choice < feature[1]);
    const [px, py] = path[Math.floor(random() * path.length)];
    const angle = random() * tau,
      radius = width * Math.sqrt(random());
    const x = px + radius * Math.cos(angle),
      y = py + radius * Math.sin(angle);
    cloud.set(
      [
        x,
        y,
        reliefAt(x, y) + offset + (random() - 0.5) * width,
        intensity * (0.46 + 0.54 * random()),
        0,
      ],
      i * particleStride,
    );
  }

  // Bright iris particles sit at the private pupil landmarks and stay registered
  // to the head. Each core is surrounded by a smaller number of dim radial sparks.
  let index = accentStart;
  for (const [ex, ey] of eye) {
    const ez = reliefAt(ex, ey) + 0.12;
    for (let i = 0; i < eyeCount / 2; i++) {
      const angle = random() * tau;
      const radius = 0.062 * random() ** 2.2;
      const intensity = 0.38 + 0.61 * (1 - radius / 0.062) * (0.62 + 0.38 * random());
      cloud.set(
        [
          ex + Math.cos(angle) * radius,
          ey + Math.sin(angle) * radius * 0.78,
          ez - radius * 0.28 + (random() - 0.5) * 0.017,
          intensity,
          emission.eye,
        ],
        index++ * particleStride,
      );
    }
  }

  const arcs = [
    { anchor: brow, direction: Math.PI / 2, spread: 1.06, extent: 0.24 },
    { anchor: [brow[0], top - height * 0.27], direction: Math.PI / 2, spread: 0.81, extent: 0.24 },
    { anchor: cheeks[0], direction: 2.85, spread: 0.82, extent: 0.28 },
    { anchor: cheeks[1], direction: 0.25, spread: 0.82, extent: 0.28 },
  ];
  for (let strand = 0; strand < filamentCount / 18; strand++) {
    const {
      anchor: [ax, ay],
      direction,
      spread,
      extent,
    } = arcs[strand % arcs.length];
    const angle = direction + (random() - 0.5) * spread * 2;
    const distance = extent * (0.45 + 0.73 * random());
    const ox = ax + (random() - 0.5) * 0.23;
    const oy = ay + (random() - 0.5) * 0.19;
    const oz = reliefAt(ox, oy) + 0.075;
    const bend = (random() - 0.5) * 0.085;
    for (let j = 0; j < 18; j++) {
      const t = (j + random()) / 18;
      const arc = t * t * bend + Math.sin(t * 7) * 0.014;
      cloud.set(
        [
          ox + Math.cos(angle) * distance * t - Math.sin(angle) * arc,
          oy + Math.sin(angle) * distance * t + Math.cos(angle) * arc,
          oz + 0.1 * t - 0.055 * Math.sin(t * Math.PI),
          (0.37 + 0.62 * random()) * (1 - 0.7 * t),
          emission.filament,
        ],
        index++ * particleStride,
      );
    }
  }

  for (let i = index - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    for (let component = 0; component < particleStride; component++) {
      const a = i * particleStride + component,
        b = j * particleStride + component;
      const value = cloud[a];
      cloud[a] = cloud[b];
      cloud[b] = value;
    }
  }
  // Draw these separately so device density tiers retain both eye halos.
  for (const [ex, ey] of eye) {
    cloud.set([ex, ey, reliefAt(ex, ey) + 0.13, 0.5, emission.halo], index++ * particleStride);
  }
  return cloud;
}

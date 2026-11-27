// Each stroke defines brightness, depth, and hand-drawn x/y control points.
const robot = [
  [
    0.9,
    0.08,
    [-0.53, -0.31],
    [-0.57, 0.18],
    [-0.5, 0.53],
    [-0.34, 0.74],
    [-0.12, 0.83],
    [0.14, 0.83],
    [0.36, 0.71],
    [0.51, 0.49],
    [0.57, 0.2],
    [0.52, -0.29],
  ],
  [
    0.9,
    0.13,
    [-0.53, -0.31],
    [-0.44, -0.5],
    [-0.29, -0.66],
    [-0.13, -0.76],
    [0.04, -0.79],
    [0.23, -0.72],
    [0.42, -0.54],
    [0.52, -0.29],
  ],
  [0.55, 0.2, [-0.49, 0.27], [-0.38, 0.51], [-0.17, 0.66], [0.08, 0.7], [0.32, 0.61], [0.47, 0.4]],
  [0.4, 0.24, [-0.42, 0.32], [-0.29, 0.5], [-0.06, 0.56], [0.18, 0.54], [0.35, 0.44]],
  [
    0.78,
    0.35,
    [-0.47, 0.1],
    [-0.34, 0.19],
    [-0.19, 0.18],
    [-0.07, 0.1],
    [0.05, 0.1],
    [0.18, 0.18],
    [0.34, 0.19],
    [0.47, 0.1],
  ],
  [1, 0.43, [-0.4, 0.09], [-0.31, 0.04], [-0.21, 0.04], [-0.13, 0.1]],
  [1, 0.43, [0.13, 0.1], [0.21, 0.04], [0.31, 0.04], [0.4, 0.09]],
  [0.74, 0.48, [-0.03, 0.08], [-0.045, -0.07], [-0.09, -0.22], [0.01, -0.25], [0.12, -0.21]],
  [0.62, 0.42, [-0.22, -0.37], [-0.12, -0.4], [0.01, -0.405], [0.15, -0.39], [0.23, -0.35]],
  [0.41, 0.37, [-0.17, -0.48], [0, -0.51], [0.17, -0.47]],
  [0.64, 0.18, [-0.47, -0.21], [-0.37, -0.27], [-0.34, -0.46], [-0.24, -0.6], [-0.11, -0.66]],
  [0.64, 0.18, [0.47, -0.21], [0.37, -0.27], [0.34, -0.46], [0.24, -0.6], [0.11, -0.66]],
  [0.5, 0.14, [-0.41, -0.13], [-0.31, -0.18], [-0.22, -0.23]],
  [0.5, 0.14, [0.41, -0.13], [0.31, -0.18], [0.22, -0.23]],
  [0.35, 0.19, [-0.24, -0.55], [-0.15, -0.59], [0, -0.61], [0.15, -0.59], [0.24, -0.55]],
];

function interpolate(a, b, c, d, t) {
  return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
}

function sampleStroke(stroke, output) {
  const [light, depth, ...anchors] = stroke;
  let previous = anchors[0],
    distance = 0;
  const spacing = light > 0.83 ? 0.024 : 0.034;
  output.push([previous[0], previous[1], depth, light]);
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[Math.max(0, i - 2)],
      b = anchors[i - 1];
    const c = anchors[i],
      d = anchors[Math.min(anchors.length - 1, i + 1)];
    const subdivisions = Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 0.008);
    for (let j = 1; j <= subdivisions; j++) {
      const t = j / subdivisions;
      const x = interpolate(a[0], b[0], c[0], d[0], t);
      const y = interpolate(a[1], b[1], c[1], d[1], t);
      const step = Math.hypot(x - previous[0], y - previous[1]);
      if (distance + step >= spacing) {
        const f = (spacing - distance) / step;
        output.push([
          previous[0] + f * (x - previous[0]),
          previous[1] + f * (y - previous[1]),
          depth,
          light,
        ]);
        distance -= spacing;
      }
      distance += step;
      previous = [x, y];
    }
  }
}

export function readContours(source) {
  const strokes = JSON.parse(source);
  if (
    !Array.isArray(strokes) ||
    strokes.length < 1 ||
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
    throw new Error("Invalid particle contours");
  }
  let length = 0;
  for (const stroke of strokes) {
    for (let i = 3; i < stroke.length; i++) {
      const [x, y] = stroke[i],
        [previousX, previousY] = stroke[i - 1];
      length += Math.hypot(x - previousX, y - previousY);
    }
  }
  if (length > 44) throw new Error("Particle contours exceed the drawing budget");
  return strokes;
}

export function makeCloud(strokes = robot) {
  let seed = 67223;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const points = [];
  for (const stroke of strokes) sampleStroke(stroke, points);
  // Detached particles give the contour room to breathe and move independently.
  for (let i = 0; i < 118; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 0.83 + 0.39 * random();
    points.push([
      0.71 * radius * Math.cos(angle),
      0.78 * radius * Math.sin(angle),
      random() * 0.32 - 0.2,
      0.12 + 0.22 * random(),
    ]);
  }
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [points[i], points[j]] = [points[j], points[i]];
  }
  return new Float32Array(points.flat());
}

const fields = 8;

// Every original light pixel keeps its decoded RGB. Neighboring pixels that
// rise to the same intensity peak travel together, including the peak's glow.
export function extract({ data, width, height }) {
  const count = width * height;
  const luma = new Float32Array(count);
  const slopes = new Int32Array(count).fill(-1);
  const peaks = new Int32Array(count).fill(-1);
  const cloud = new Float32Array(count * fields);
  for (let i = 0; i < count; i++) {
    const j = i * 4;
    luma[i] = (data[j] * .2126 + data[j + 1] * .7152 + data[j + 2] * .0722) * data[j + 3] / 255;
  }
  for (let i = 0; i < count; i++) {
    if (!luma[i]) continue;
    const y = Math.floor(i / width), x = i % width;
    let peak = i;
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
        const j = ny * width + nx;
        if (luma[j] > luma[peak]) peak = j;
      }
    }
    slopes[i] = peak;
  }
  let write = 0;
  for (let i = 0; i < count; i++) {
    if (slopes[i] < 0) continue;
    let top = i;
    while (peaks[top] < 0 && slopes[top] !== top) top = slopes[top];
    const peak = peaks[top] < 0 ? top : peaks[top];
    let walk = i;
    while (peaks[walk] < 0) {
      peaks[walk] = peak;
      if (walk === top) break;
      walk = slopes[walk];
    }
    const pixel = i * 4;
    const alpha = data[pixel + 3] / (255 * 255);
    cloud[write++] = i % width + .5;
    cloud[write++] = height - Math.floor(i / width) - .5;
    cloud[write++] = peak % width + .5;
    cloud[write++] = height - Math.floor(peak / width) - .5;
    cloud[write++] = data[pixel] * alpha;
    cloud[write++] = data[pixel + 1] * alpha;
    cloud[write++] = data[pixel + 2] * alpha;
    cloud[write++] = Math.min(1, luma[peak] / 255);
  }
  return cloud.subarray(0, write);
}

const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec4 position;
layout(location=1) in vec4 emission;
uniform vec2 viewport, flow;
uniform float time, movement, trail;
out vec3 rgb;
out vec2 center;
void main(){
  float scale = min(viewport.x, viewport.y);
  vec2 origin = viewport * vec2(.5, .52);
  vec2 anchor = position.zw - origin;
  vec2 norm = anchor / scale;
  float r = length(norm);
  // Constant scale in the central image preserves the relative positions of
  // facial features. Only peripheral peaks carry independent visible drift.
  float fringe = smoothstep(.16, .395, r);
  float seed = fract(sin(dot(position.zw, vec2(12.9898,78.233))) * 43758.5453);
  float phase = seed * 6.283185;
  float t = time - trail * .12;
  float wave = .55 + .45 * sin(t * 4.1 - 21. * r);
  float spread = .024 * flow.y - .023 * flow.x;
  vec2 drift = (vec2(sin(t * (1.1 + seed) + phase),
    cos(t * (.89 + seed) + phase)) - vec2(.40 * sin(phase), .40 * cos(phase)));
  float flare = smoothstep(.71, .96, seed) * smoothstep(.36, .85, emission.w);
  float excursion = pow(.5 + .5 * sin(t * (1.25 + .31 * seed) + phase), 2.);
  vec2 periphery = norm * (wave * flow.y * .039 - flow.x * .027
    + flare * excursion * (.080 + flow.y * .072)) + drift *
    (.001 + .015 * fringe * (.40 + .60 * emission.w));
  center = position.xy + movement * (anchor * spread + fringe * scale * periphery);
  rgb = emission.rgb;
  if (trail > 0.) rgb *= .085 * fringe * smoothstep(.53,.9,emission.w) * flow.y / trail;
  gl_Position = vec4(center / viewport * 2. - 1., 0., 1.);
  gl_PointSize = 3.;
}`;

const fragment = `#version 300 es
precision highp float;
in vec3 rgb;
in vec2 center;
out vec4 pixel;
void main(){
  vec2 weight = max(vec2(0.), 1. - abs(gl_FragCoord.xy - center));
  pixel = vec4(rgb * weight.x * weight.y, 1.);
}`;

// Same WebGL2 point pipeline as the voice renderer. The splat kernel keeps
// source RGB exact at native-pixel rest and permits subpixel movement.
export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false, antialias: false, powerPreference: "low-power",
  });
  if (!gl) throw Error("WebGL2 is required for this review.");
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = compile(type, source);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  for (let location = 0; location < 2; location++) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 4, gl.FLOAT, false, fields * 4, location * 16);
  }
  const u = Object.fromEntries(["viewport", "flow", "time", "movement", "trail"]
    .map(key => [key, gl.getUniformLocation(program, key)]));
  gl.clearColor(0, 0, 0, 1);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  let count = 0;
  return {
    setCloud(points, width, height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(u.viewport, width, height);
      gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
      count = points.length / fields;
    },
    draw(time, inward, outward, movement) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(u.time, time);
      gl.uniform2f(u.flow, inward, outward);
      gl.uniform1f(u.movement, movement);
      if (movement && outward > .05) {
        gl.uniform1f(u.trail, 1);
        gl.drawArrays(gl.POINTS, 0, count);
      }
      gl.uniform1f(u.trail, 0);
      gl.drawArrays(gl.POINTS, 0, count);
    },
  };
}

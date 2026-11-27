import { makeCloud } from "./contours.js";

/*! Audio envelope adapted from Pipecat UI. Copyright (c) 2024–2026 Daily. BSD-2-Clause, see VOICE-NOTICES.txt. */
const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec4 particle;
uniform vec2 viewport,signal;
uniform vec4 state;
uniform float time,yaw,motion;
out float light,seed;
void main(){
  vec3 p = particle.xyz;
  seed = fract(float(gl_VertexID) * .618034);
  float phase = seed * 6.283185;
  float spread = (state.z - state.x) * (.023 + .226 * signal.x);
  float drift = motion * (.006 + state.x * (.025 + .10 * signal.x)
    + state.z * (.048 + .16 * signal.x) + state.y * .021);
  float rate = time * (1.5 + state.x * 3.5 + state.z * 5. + signal.y * 2.);
  float variation = .38 + .62 * seed;
  p.xy *= 1. + spread * .43;
  p.xy += drift * variation * vec2(sin(rate * (1. + seed) + phase),
    cos(rate * (1.3 + seed) + phase * 2.));
  p.z += drift * .55 * sin(rate + phase);
  float c = cos(yaw), s = sin(yaw);
  float z = p.z * c - p.x * s;
  float perspective = 3.8 / (3.8 - z);
  float scale = min(viewport.y, viewport.x * 1.42);
  gl_Position = vec4(vec2(p.x * c + p.z * s, p.y - .055) * (.91 * perspective * scale / viewport), 0., 1.);
  gl_PointSize = max(1.5, scale * (.0043 + .0048 * particle.w) * (.8 + .42 * seed));
  light = particle.w * (.78 + .22 * seed - .20 * state.y + motion * .16 * sin(rate + phase));
}`;
const fragment = `#version 300 es
precision highp float;
uniform vec4 state;
in float light,seed;
out vec4 pixel;
void main(){
  vec2 uv = gl_PointCoord * 2. - 1.;
  float d = dot(uv, uv);
  if (d > 1.) discard;
  float alpha = min(1., light * (1.48 * exp(-d * 5.0) + .29 * exp(-d * 2.8)));
  vec3 ice = mix(vec3(.26,.77,1.), vec3(.86,.97,1.), min(1., light * (.74 + .4 * seed)));
  vec3 tint = mix(ice, vec3(1.,.48,.62), state.w * .7);
  pixel = vec4(tint * alpha, alpha);
}`;

function gpu(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: "low-power",
  });
  if (!gl) return null;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ]) {
    const shader = compile(type, source);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  const u = Object.fromEntries(
    ["state", "time", "yaw", "viewport", "signal", "motion"].map((key) => [
      key,
      gl.getUniformLocation(program, key),
    ]),
  );
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  return {
    name: "WebGL2",
    rasterCPU: /swiftshader|llvmpipe|software/i.test(
      String(gl.getExtension("WEBGL_debug_renderer_info") && gl.getParameter(0x9246)),
    ),
    setCloud(cloud) {
      gl.bufferData(gl.ARRAY_BUFFER, cloud, gl.STATIC_DRAW);
    },
    draw({ count, t, yaw, state, signal, motion }) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(u.viewport, canvas.width, canvas.height);
      gl.uniform1f(u.time, t);
      gl.uniform1f(u.yaw, yaw);
      gl.uniform1f(u.motion, motion);
      gl.uniform4fv(u.state, state);
      gl.uniform2fv(u.signal, signal);
      gl.drawArrays(gl.POINTS, 0, count);
    },
    close() {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

function software(canvas) {
  const ctx = canvas.getContext("2d");
  let cloud;
  return {
    name: "Canvas 2D",
    setCloud(points) {
      cloud = points;
    },
    close() {},
    draw({ count, t, yaw, state, signal, motion }) {
      const [listening, thinking, speaking, error] = state;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const scale = Math.min(height, width * 1.42);
      const c = Math.cos(yaw),
        s = Math.sin(yaw);
      const spread = (speaking - listening) * (0.023 + 0.226 * signal[0]);
      const drift =
        motion *
        (0.006 +
          listening * (0.025 + 0.1 * signal[0]) +
          speaking * (0.048 + 0.16 * signal[0]) +
          thinking * 0.021);
      const rate = t * (1.5 + listening * 3.5 + speaking * 5 + signal[1] * 2);
      for (let i = 0; i < count; i++) {
        const j = i * 4;
        const seed = (i * 0.618034) % 1;
        const phase = seed * Math.PI * 2;
        const travel = drift * (0.38 + 0.62 * seed);
        const x = cloud[j] * (1 + spread * 0.43) + travel * Math.sin(rate * (1 + seed) + phase);
        const y =
          cloud[j + 1] * (1 + spread * 0.43) + travel * Math.cos(rate * (1.3 + seed) + phase * 2);
        const z = cloud[j + 2] + drift * 0.55 * Math.sin(rate + phase);
        const light =
          cloud[j + 3] *
          (0.78 + 0.22 * seed - 0.2 * thinking + motion * 0.16 * Math.sin(rate + phase));
        const perspective = 3.8 / (3.8 - z * c + x * s);
        const px = width / 2 + (x * c + z * s) * 0.455 * scale * perspective;
        const py = height / 2 - (y - 0.055) * 0.455 * scale * perspective;
        const radius = Math.max(
          0.55,
          scale * (0.001 + 0.0011 * cloud[j + 3]) * (0.77 + 0.45 * seed),
        );
        ctx.fillStyle = error > 0.5 ? "#ff91ad" : cloud[j + 3] > 0.8 ? "#c5f5ff" : "#66cdff";
        ctx.globalAlpha = Math.min(1, light);
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
}
const targets = {
  idle: [0, 0, 0, 0],
  listening: [1, 0, 0, 0],
  thinking: [0, 1, 0, 0],
  speaking: [0, 0, 1, 0],
  error: [0, 0, 0, 1],
};
export function mountHead(original, readSignal, hasAudio = () => false, contours) {
  let canvas = original,
    backend;
  let cloud = makeCloud(contours);
  // Old contexts may be lost by the OS, even on devices with WebGL2.
  try {
    backend = gpu(canvas);
  } catch {
    backend = null;
  }
  function useSoftware() {
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh);
    canvas = fresh;
    backend = software(canvas);
    backend.setCloud(cloud);
  }
  if (backend) backend.setCloud(cloud);
  else useSoftware();
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const low =
    navigator.hardwareConcurrency <= 2 ||
    navigator.deviceMemory <= 2 ||
    navigator.connection?.saveData;
  let state = [0, 0, 0, 0],
    target = targets.idle,
    frame = 0,
    closed = false,
    last = 0,
    slow = 0,
    pose = 0,
    look = 0,
    quality = low ? 0.4 : backend.rasterCPU && !motion.matches ? 0.42 : 1,
    envelope = 0,
    converging = false;
  const host = canvas.parentElement;
  function resize() {
    const dpr = Math.min(
        devicePixelRatio,
        motion.matches ? 1.6 : quality < 0.32 ? 0.9 : low || quality < 0.8 ? 1 : 1.6,
      ),
      box = host.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    schedule(true);
  }
  function lost(e) {
    e.preventDefault();
    if (closed) return;
    canvas.removeEventListener("webglcontextlost", lost);
    backend.close();
    useSoftware();
    resize();
  }
  canvas.addEventListener("webglcontextlost", lost);
  function update(now, force = false) {
    const dt = last ? Math.min(140, now - last) : 16;
    const interval = backend.name === "Canvas 2D" ? 65 : low || quality < 0.8 ? 32 : 15;
    if (!force && dt < interval) return;
    if (last && now - last > 48 && now - last < 450 && !motion.matches) slow++;
    else slow = Math.max(0, slow - 1);
    if (slow > 7 && quality > 0.18) {
      quality = Math.max(0.18, quality * 0.7);
      slow = 0;
      const box = host.getBoundingClientRect(),
        ratio = quality < 0.32 ? 0.85 : 1;
      canvas.width = Math.max(1, Math.round(box.width * ratio));
      canvas.height = Math.max(1, Math.round(box.height * ratio));
    }
    last = now;
    if (!motion.matches) {
      pose += dt / 1000;
      look += ((Number(host.dataset.look) || 0) - look) * 0.065;
    }
    const blend = motion.matches ? 1 : 1 - Math.exp(-dt / 150);
    state = state.map((v, i) => v + (target[i] - v) * blend);
    converging = state.some((v, i) => Math.abs(v - target[i]) > 0.004);
    const count = cloud.length / 4;
    const [level, spectrum] = readSignal();
    // The two-time-constant pulse follows syllables and releases between phrases.
    const seconds = level > envelope ? 0.06 : 0.28;
    envelope += (level - envelope) * (1 - Math.exp(-Math.min(dt / 1000, 0.1) / seconds));
    const signal = [envelope, spectrum];
    backend.draw({
      count,
      t: pose,
      yaw: -0.15 + (motion.matches ? 0 : 0.1 * Math.sin(pose * 0.48) + look * 0.2),
      state,
      signal,
      motion: motion.matches ? 0 : 1,
    });
    host.dataset.renderer = backend.name;
    host.dataset.points = count;
    host.dataset.amplitude = signal[0].toFixed(3);
    host.dataset.displacement = ((state[2] - state[0]) * (0.023 + 0.226 * envelope)).toFixed(3);
    host.dataset.frames = String(Number(host.dataset.frames || 0) + 1);
  }
  function tick(now) {
    frame = 0;
    if (closed || document.hidden) return;
    update(now);
    if (!motion.matches || converging || hasAudio()) schedule();
  }
  function schedule(force = false) {
    if (closed || document.hidden) return;
    if (force) update(performance.now(), true);
    if (!frame && (!motion.matches || converging || hasAudio()))
      frame = requestAnimationFrame(tick);
  }
  function visibility() {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    } else schedule(true);
  }
  const pointer = (e) => {
    const b = host.getBoundingClientRect();
    host.dataset.look = String(((e.clientX - b.left) / b.width) * 2 - 1);
  };
  const leave = () => {
    host.dataset.look = "0";
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  host.addEventListener("pointermove", pointer);
  host.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", visibility);
  motion.addEventListener("change", visibility);
  return {
    setContours(strokes) {
      cloud = makeCloud(strokes);
      backend.setCloud(cloud);
      schedule(true);
    },
    setState(key) {
      target = targets[key] || targets.idle;
      converging = true;
      schedule(true);
    },
    close() {
      closed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener("pointermove", pointer);
      host.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", visibility);
      canvas.removeEventListener("webglcontextlost", lost);
      backend.close();
    },
  };
}

import { matrixField } from "./matrix.js";

/*! Audio envelope adapted from Pipecat UI. Copyright (c) 2024–2026 Daily. BSD-2-Clause, see VOICE-NOTICES.txt. */
const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec4 particle;
uniform vec2 viewport;
uniform vec4 state;
uniform vec3 flow;
uniform float time,yaw,motion;
out float light,seed,wave;
void main(){
  vec3 p = particle.xyz;
  seed = fract(float(gl_VertexID) * .618034);
  float phase = seed * 6.283185;
  float hold = smoothstep(.3, .76, particle.w);
  float front = smoothstep(-.12,.46,p.z);
  float ripple = sin(flow.z - p.y * 8.6 - p.z * 4.4 + p.x * 1.5);
  float offset = flow.y * (.67 + .33 * ripple * motion) - flow.x;
  p.xy *= 1. + offset * .42;
  p.z += offset * .92 + flow.y * ripple * motion * .055;
  float orbit = state.y * motion * (.050 - .035 * hold) * sin(time * 1.25 + p.z * 8.5 + p.y * 3.);
  p.xy += vec2(-p.y, p.x) * orbit;
  p.z += state.y * motion * (.025 - .015 * hold) * sin(time * 1.6 + p.x * 9. - p.y * 5.);
  float drift = motion * (.0045 + .004 * (state.x + state.z)) * (1. - hold * .6);
  p += drift * vec3(sin(time * (1.2 + seed) + phase), cos(time * (1.5 + seed) + phase * 1.7),
    cos(time * 1.1 + phase * 2.));
  float c = cos(yaw), s = sin(yaw);
  float z = p.z * c - p.x * s;
  float perspective = 4.1 / (4.1 - z);
  float scale = min(viewport.y, viewport.x * 1.52);
  gl_Position = vec4(vec2((p.x * c + p.z * s) * 1.13, p.y - .09) * (.887 * perspective * scale / viewport), 0., 1.);
  gl_PointSize = clamp(scale * (.0023 + .0020 * particle.w) * (.64 + seed * .68) * perspective, 1.05, 4.6);
  wave = (flow.y * 2.2 + state.y * .11) * (.5 + .5 * ripple) * motion;
  light = particle.w * (.77 + .27 * seed + .10 * front + wave + state.y * .08 + motion * .06 * sin(time + phase));
}`;
const fragment = `#version 300 es
precision highp float;
uniform vec4 state;
in float light,seed,wave;
out vec4 pixel;
void main(){
  vec2 uv = gl_PointCoord * 2. - 1.;
  float d = dot(uv, uv);
  if (d > 1.) discard;
  float alpha = min(.92, light * (1.46 * exp(-d * 5.) + .24 * exp(-d * 2.3)));
  vec3 ice = mix(vec3(.12,.66,1.), vec3(.91,.98,1.),
    clamp(light * .96 + seed * seed * .36 + wave, 0., 1.));
  vec3 tint = mix(ice, vec3(1.,.46,.58), state.w * .57);
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
    ["state", "time", "yaw", "viewport", "flow", "motion"].map((key) => [
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
    draw({ count, t, yaw, state, flow, motion }) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(u.viewport, canvas.width, canvas.height);
      gl.uniform1f(u.time, t);
      gl.uniform1f(u.yaw, yaw);
      gl.uniform1f(u.motion, motion);
      gl.uniform4fv(u.state, state);
      gl.uniform3fv(u.flow, flow);
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
    draw({ count, t, yaw, state, flow, motion }) {
      const [, thinking, , error] = state;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      if (!count) return;
      const scale = Math.min(height, width * 1.52);
      const c = Math.cos(yaw),
        s = Math.sin(yaw);
      const [pull, push, wave] = flow;
      ctx.fillStyle = error > 0.5 ? "#ffa6bc" : "#bcecff";
      for (let i = 0; i < count; i++) {
        const j = i * 4;
        const seed = (i * 0.618034) % 1;
        const phase = seed * Math.PI * 2;
        const brightness = cloud[j + 3];
        const ripple = Math.sin(wave - cloud[j + 1] * 8.6 - cloud[j + 2] * 4.4 + cloud[j] * 1.5);
        const offset = push * (0.67 + 0.33 * ripple * motion) - pull;
        const spin =
          motion * thinking * 0.04 * Math.sin(t * 1.25 + cloud[j + 2] * 8.5 + cloud[j + 1] * 3);
        const drift = motion * 0.006 * (1 - brightness);
        const x =
          cloud[j] * (1 + offset * 0.42) -
          spin * cloud[j + 1] +
          drift * Math.sin(t * (1.2 + seed) + phase);
        const y =
          cloud[j + 1] * (1 + offset * 0.42) +
          spin * cloud[j] +
          drift * Math.cos(t * (1.5 + seed) + phase);
        const z = cloud[j + 2] + offset * 0.92 + motion * push * ripple * 0.055;
        const perspective = 4.1 / (4.1 - z * c + x * s);
        const px = width / 2 + (x * c + z * s) * 0.501155 * scale * perspective;
        const py = height / 2 - (y - 0.09) * 0.4435 * scale * perspective;
        const size = Math.max(1, scale * (0.0015 + 0.0017 * brightness) * (0.65 + seed * 0.65));
        ctx.globalAlpha = Math.min(0.93, brightness * (0.88 + seed * 0.31 + push * 0.7));
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
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
export function mountHead(
  original,
  readSignal,
  hasAudio = () => false,
  cloud = new Float32Array(0),
) {
  let canvas = original,
    backend;
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
    wave = 0,
    converging = false;
  const host = canvas.parentElement;
  const backdrop = host.closest(".voice-shell").querySelector(".voice-matrix");
  const field = matrixField(backdrop);
  function resize() {
    const dpr = Math.min(
        devicePixelRatio,
        motion.matches ? 1.6 : quality < 0.32 ? 0.9 : low || quality < 0.8 ? 1 : 1.6,
      ),
      box = host.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    field.resize();
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
    const mobile = host.clientWidth < 620;
    const available = cloud.length / 4;
    let tier = Math.max(30000, Math.round(available * quality));
    if (mobile) tier = low || quality < 0.32 ? 10500 : 17000;
    if (backend.name === "Canvas 2D") tier = mobile ? 5200 : 8400;
    const count = Math.min(tier, available);
    const [level, spectrum] = readSignal();
    // The two-time-constant pulse follows syllables and releases between phrases.
    const seconds = level > envelope ? 0.06 : 0.28;
    envelope += (level - envelope) * (1 - Math.exp(-Math.min(dt / 1000, 0.1) / seconds));
    const strength = Math.min(1, Math.sqrt(envelope * 1.7));
    const pull = state[0] * (0.018 + 0.15 * strength);
    const push = state[2] * (0.022 + 0.22 * strength);
    if (!motion.matches)
      wave = (wave + (dt / 1000) * (3.2 + 1.5 * spectrum + 2.1 * strength)) % (Math.PI * 2);
    field.draw(motion.matches ? 0 : pose, force);

    backend.draw({
      count,
      t: pose,
      yaw: -0.062 + (motion.matches ? 0 : 0.06 * Math.sin(pose * 0.52) + look * 0.11),
      state,
      flow: [pull, push, wave],
      motion: motion.matches ? 0 : 1,
    });
    host.dataset.renderer = backend.name;
    host.dataset.points = count;
    host.dataset.amplitude = envelope.toFixed(3);
    host.dataset.displacement = (push - pull).toFixed(3);
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
  observer.observe(backdrop);
  resize();
  host.addEventListener("pointermove", pointer);
  host.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", visibility);
  motion.addEventListener("change", visibility);
  return {
    setCloud(points) {
      cloud = points;
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

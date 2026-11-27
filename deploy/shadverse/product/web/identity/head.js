import mesh from "./face.mesh";
import packed from "./face.points";
const meshSize = new DataView(mesh.buffer, mesh.byteOffset, 4).getUint32(0, true);
const meshBytes = meshSize * 10;
const surface = mesh.subarray(4, 4 + meshBytes);
const indices = mesh.subarray(4 + meshBytes);
const stride = 10;
export const sampleCount = packed.length / stride;
const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in float visibility;
uniform vec2 viewport,signal;
uniform vec4 state;
uniform float time,yaw,sprite,pass;
out vec3 N,P;
out float seed,energy,stream,veil;
void main(){
 vec3 p=position*(32767./22000.);
 seed=fract(float(gl_VertexID)*.618034);
 float azimuth=atan(p.x,p.z);
 float phase=9.*p.y+3.*azimuth-time*2.4;
 stream=pow(.5+.5*cos(phase+1.4*sin(3.*azimuth-time*.45)),5.);
 float pulse=(state.z-state.x)*(.045+.155*signal.x)*(.86+.14*cos(p.y*6.+signal.y*5.));
 p.xy*=1.+pulse*.52;
 p+=normal*pulse*.48;
 p.z+=pulse*(1.+signal.y*.55);
 p*=1.+.008*sin(time*1.1);
 // A travelling wave displaces the contours tangentially in the thinking pose.
 vec3 tangent=vec3(p.z,0.,-p.x);
 p+=state.y*stream*(.052*tangent+normal*.012);
 veil=pass*smoothstep(.953,.998,seed);
 p+=normal*(pass*.004+veil*(.035+.15*seed)*(.6+.4*sin(phase)));
 p.y+=veil*(.055+.047*sin(time*.86+seed*15.));
 p.x+=veil*.04*cos(phase);
 mat2 turn=mat2(cos(yaw),-sin(yaw),sin(yaw),cos(yaw));
 p.xz=turn*p.xz;vec3 n=normal;n.xz=turn*n.xz;
 float perspective=3.64/(3.8-p.z);
 gl_Position=vec4(p.x*perspective*viewport.y/viewport.x,p.y*perspective,-p.z*.43-pass*.002,1.);
 gl_PointSize=clamp(viewport.y*.0067*sprite*(.75+.54*seed)*perspective,1.15,16.);
 N=n;P=p;energy=visibility;
}`;
const fragment = `#version 300 es
precision highp float;
uniform float pass;
uniform vec4 state;
in vec3 N,P;
in float seed,energy,stream,veil;
out vec4 pixel;
void main(){
 if(pass<.5){pixel=vec4(0.);return;}
 vec2 uv=gl_PointCoord*2.-1.;
 float d=dot(uv,uv);
 if(d>1.)discard;
 vec3 n=normalize(N);
 float facing=dot(n,normalize(vec3(0.,0.,3.8)-P));
 if(facing<-.06)discard;
 float key=max(0.,dot(n,normalize(vec3(-.64,.67,.49))));
 float edge=pow(1.-max(facing,0.),2.);
 float blue=max(0.,dot(n,normalize(vec3(.91,.29,-.18))));
 float pearl=pow(max(0.,dot(n,normalize(vec3(-.42,.72,.77)))),9.);
 vec3 tint=mix(vec3(.48,.10,1.),vec3(1.,.12,.80),smoothstep(-.12,.83,key));
 tint=mix(tint,vec3(.18,.81,1.),blue*blue*.87);
 tint=mix(tint,vec3(1.,.93,1.),pearl*.72+pow(seed,17.)*.2);
 tint=mix(tint,vec3(.97,.37,.60),state.w*.48);
 float lum=pow(energy,1.3)*(.23+.86*key+.45*blue+.72*edge+.55*pearl);
 // Dissolve the neckline and let the supraorbital ridge and lips catch a softer fill.
 lum+=.28*energy*max(0.,dot(n,normalize(vec3(.37,.38,.84))));
 lum*=smoothstep(-1.01,-.61,P.y);
 lum*=.72+.55*seed+.8*state.y*stream;
 float a=clamp((exp(-d*5.)+.14*exp(-d*2.))*lum*(1.-.56*veil),0.,1.);
 pixel=vec4(tint*a*1.55,a);
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
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
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
  const pointVao = gl.createVertexArray(),
    surfaceVao = gl.createVertexArray();
  const buffers = [];
  function upload(target, data) {
    const buffer = gl.createBuffer();
    buffers.push(buffer);
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, data, gl.STATIC_DRAW);
  }
  // Both buffers use the same quantized coordinates and normals.
  for (const [vao, data] of [
    [pointVao, packed],
    [surfaceVao, surface],
  ]) {
    gl.bindVertexArray(vao);
    upload(gl.ARRAY_BUFFER, data);
    for (const [loc, size, type, offset] of [
      [0, 3, gl.SHORT, 0],
      [1, 3, gl.BYTE, 6],
      [2, 1, gl.UNSIGNED_BYTE, 9],
    ]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, type, true, stride, offset);
    }
  }
  upload(gl.ELEMENT_ARRAY_BUFFER, indices);
  const u = Object.fromEntries(
    ["state", "time", "yaw", "viewport", "sprite", "signal", "pass"].map((key) => [
      key,
      gl.getUniformLocation(program, key),
    ]),
  );
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  return {
    name: "WebGL2",
    rasterCPU: /swiftshader|llvmpipe|software/i.test(
      String(gl.getExtension("WEBGL_debug_renderer_info") && gl.getParameter(0x9246)),
    ),
    draw({ count, t, yaw, state, signal }) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform2f(u.viewport, canvas.width, canvas.height);
      gl.uniform1f(u.time, t);
      gl.uniform1f(u.yaw, yaw);
      gl.uniform4fv(u.state, state);
      gl.uniform2fv(u.signal, signal);
      gl.uniform1f(u.sprite, Math.sqrt(sampleCount / count));
      gl.uniform1f(u.pass, 0);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(surfaceVao);
      // Invisible anatomical depth prevents far-side samples filling the eye sockets.
      gl.colorMask(false, false, false, false);
      gl.drawElements(gl.TRIANGLES, indices.length / 2, gl.UNSIGNED_SHORT, 0);
      gl.colorMask(true, true, true, true);
      gl.uniform1f(u.pass, 1);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.bindVertexArray(pointVao);
      gl.drawArrays(gl.POINTS, 0, count);
    },
    close() {
      for (const b of buffers) gl.deleteBuffer(b);
      gl.deleteVertexArray(pointVao);
      gl.deleteVertexArray(surfaceVao);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
function software(canvas) {
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  const cloud = new Float32Array(sampleCount * 7);
  for (let i = 0; i < sampleCount; i++) {
    for (let k = 0; k < 3; k++) {
      cloud[7 * i + k] = view.getInt16(i * stride + k * 2, true) / 22000;
      cloud[7 * i + 3 + k] = view.getInt8(i * stride + 6 + k) / 127;
    }
    cloud[7 * i + 6] = packed[i * stride + 9] / 255;
  }
  const ctx = canvas.getContext("2d");
  const palette = Array.from({ length: 128 }, (_, i) => {
    const b = (i % 32) / 31;
    const col = [
      [149, 75, 255],
      [247, 83, 213],
      [91, 207, 255],
      [255, 158, 172],
    ][i >> 5];
    return "rgb(" + col.map((v) => Math.round(v * (0.18 + 0.82 * b))).join(",") + ")";
  });
  return {
    name: "Canvas 2D",
    close() {},
    draw({ count, t, yaw, state, signal }) {
      const w = canvas.width,
        h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const scale = h * 0.47,
        angle = yaw + state[1] * 0.14 * Math.sin(t),
        c = Math.cos(angle),
        s = Math.sin(angle);
      const pulse = 1 + (state[2] - state[0]) * (0.012 + signal[0] * (0.13 + 0.04 * signal[1]));
      for (let i = 0; i < count; i++) {
        const j = i * 7,
          x = cloud[j],
          y = cloud[j + 1],
          z = cloud[j + 2],
          nx = cloud[j + 3],
          ny = cloud[j + 4],
          nz = cloud[j + 5];
        const front = nz * c - nx * s;
        if (front < 0.08 || y < -0.95) continue;
        const p = 3.8 / (3.8 - (z * c - x * s) * pulse - (1 - pulse));
        const neck = Math.max(0, Math.min(1, (y + 0.98) / 0.35));
        const lum =
          neck *
          Math.max(
            0,
            Math.min(
              1,
              (0.18 +
                0.86 * Math.max(0, -nx * 0.6 + ny * 0.63 + nz * 0.48) +
                0.3 * Math.max(0, nx)) *
                cloud[j + 6],
            ),
          );
        const color = state[3] > 0.5 ? 3 : nx > 0.55 ? 2 : nx < -0.18 ? 1 : 0;
        ctx.fillStyle = palette[color * 32 + Math.floor(lum * 31)];
        const r = Math.max(1, h * 0.0044);
        ctx.fillRect(
          w / 2 + (x * c + z * s) * p * scale * pulse,
          h / 2 - (y + 0.009 * Math.sin(t)) * p * scale * pulse,
          r,
          r,
        );
      }
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
export function mountHead(original, readSignal) {
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
  }
  if (!backend) useSoftware();
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
    quality = low ? 0.4 : backend.rasterCPU && !motion.matches ? 0.27 : 1,
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
    const count = Math.min(
      Math.floor(quality * sampleCount),
      backend.name === "Canvas 2D" ? 13500 : sampleCount,
    );
    const signal = readSignal();
    backend.draw({
      count,
      t: pose,
      yaw: -0.23 + (motion.matches ? 0 : 0.1 * Math.sin(pose * 0.48) + look * 0.2),
      state,
      signal,
    });
    host.dataset.renderer = backend.name;
    host.dataset.points = count;
    host.dataset.amplitude = signal[0].toFixed(3);
    host.dataset.frames = String(Number(host.dataset.frames || 0) + 1);
  }
  function tick(now) {
    frame = 0;
    if (closed || document.hidden) return;
    update(now);
    if (!motion.matches || converging) schedule();
  }
  function schedule(force = false) {
    if (closed || document.hidden) return;
    if (force) update(performance.now(), true);
    if (!frame && (!motion.matches || converging)) frame = requestAnimationFrame(tick);
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

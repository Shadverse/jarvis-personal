import mesh from "./chassis.mesh";
import packed from "./chassis.points";
const meshSize = new DataView(mesh.buffer, mesh.byteOffset, 4).getUint32(0, true);
const meshBytes = meshSize * 10;
const surface = mesh.subarray(4, 4 + meshBytes);
const indices = mesh.subarray(4 + meshBytes);
const stride = 12;
export const sampleCount = packed.length / stride;
const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
const cloud = new Float32Array(sampleCount * 8);
for (let i = 0; i < sampleCount; i++) {
  for (let k = 0; k < 3; k++) {
    cloud[8 * i + k] = view.getInt16(i * stride + k * 2, true) / 22000;
    cloud[8 * i + 3 + k] = view.getInt8(i * stride + 6 + k) / 127;
  }
  cloud[8 * i + 6] = packed[i * stride + 9] / 255;
  cloud[8 * i + 7] = packed[i * stride + 10];
}

const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in float visibility;
layout(location=3) in float material;
uniform vec2 viewport,signal;
uniform vec4 state;
uniform float time,yaw,sprite,pass;
out vec3 N,P;
flat out int mat;
out float seed,energy;
void main(){
 vec3 p=position*(pass<.5?32767./22000.:1.);
 seed=fract(float(gl_VertexID)*.618034);
 mat=int(material+.5);
 float wave=sin(6.*p.y+4.*p.x-time*2.);
 float inward=state.x*(.013+.14*signal.x),outward=state.z*(.013+.17*signal.x);
 // The plates move together. The optical grain can separate from the chassis.
 float detach=pass>.5?1.:.18;
 p+=normal*(outward-inward)*detach*(.78+.22*sin(p.y*9.+signal.y*5.));
 p.z+=detach*(outward-inward)*(1.+signal.y*.6);
 if(pass>.5){
   p+=normal*.004;
   p+=normal*smoothstep(.94,1.,seed)*(.018+.046*state.y)*(.6+.4*wave);
 }
 float angle=yaw+.055*wave*state.y*detach;
 mat2 turn=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
 p.xz=turn*p.xz;vec3 n=normal;n.xz=turn*n.xz;
 p.y+=.010*sin(time*1.3);
 float perspective=3.8/(3.8-p.z);
 gl_Position=vec4(p.x*perspective*viewport.y/viewport.x,p.y*perspective,-p.z*.43,1.);
 gl_PointSize=clamp(viewport.y*.0088*sprite*(.70+.6*seed)*perspective,1.,18.);
 N=n;P=p;energy=visibility*(.76+.24*wave*state.y);
}`;
const fragment = `#version 300 es
precision highp float;
uniform float pass;
uniform vec2 signal;
uniform vec4 state;
in vec3 N,P;
flat in int mat;
in float seed,energy;
out vec4 pixel;
void main(){
 vec3 n=normalize(N),viewDir=normalize(vec3(0.,0.,3.8)-P),r=reflect(-viewDir,n);
 float fres=pow(1.-clamp(dot(n,viewDir),0.,1.),3.);
 float key=clamp(dot(n,normalize(vec3(-.61,.81,.54))),0.,1.);
 float side=clamp(dot(n,normalize(vec3(.89,.20,.32))),0.,1.);
 // Two elongated studio reflections and a fine white strip reveal each bevel.
 float panel=exp(-pow((r.y+.21*r.x-.37)/.17,2.));
 float strip=exp(-pow((r.x-.22*r.y+.50)/.046,2.));
 float broad=exp(-pow((r.x+.33)/.51,2.))*clamp(.60+.4*r.y,0.,1.);
 vec3 violet=vec3(.45,.19,.98),cyan=vec3(.10,.72,1.),pink=vec3(.98,.20,.76);
 vec3 base=mat==0?vec3(.055,.062,.094):mat==1?vec3(.23,.17,.36):mat==2?vec3(.43,.44,.56):mat==6?vec3(.035,.041,.068):vec3(.34,.35,.44);
 vec3 reflection=panel*vec3(.22,.26,.38)+strip*vec3(.44,.50,.69)+broad*vec3(.15,.045,.22)+side*side*vec3(.025,.16,.22);
 vec3 metal=base*(.33+.78*key)+reflection*(mat==6?.16:1.)+fres*(.09*violet+.12*cyan);
 if(mat==3)metal=vec3(.022,.029,.064)+reflection*.46+fres*cyan*.26;
 if(mat==4)metal=mix(vec3(.10,.84,1.),vec3(.78,1.,1.),.36+.26*key+.34*signal.x);
 if(mat==5)metal=vec3(.96,.18,.71);
 metal=mix(metal,metal*vec3(1.24,.68,.69),state.w*.7);
 if(pass<.5){pixel=vec4(metal,.99);return;}
 vec2 point=gl_PointCoord*2.-1.;float rr=dot(point,point);
 if(rr>1.||dot(n,viewDir)<-.09)discard;
 float glow=exp(-rr*14.)+.12*exp(-rr*3.4);
 vec3 tint=mix(mix(violet,pink,clamp(.4-.9*P.x,0.,1.)),cyan,side*.71);
 tint=mix(tint,vec3(.88,.96,1.),pow(seed,11.)*.67+key*.16);
 if(mat==4||mat==5)tint=metal;
 float light=(mat==3?.10:mat==6?.22:1.)*energy*(.26+.67*key+.43*fres+.38*side)*(.65+.60*seed);
 float a=clamp(glow*light,0.,1.);
 pixel=vec4(tint*a*1.48,a);
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
  function attribute(loc, size, stride, offset) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  }
  gl.bindVertexArray(pointVao);
  upload(gl.ARRAY_BUFFER, cloud);
  attribute(0, 3, 32, 0);
  attribute(1, 3, 32, 12);
  attribute(2, 1, 32, 24);
  attribute(3, 1, 32, 28);
  gl.bindVertexArray(surfaceVao);
  upload(gl.ARRAY_BUFFER, surface);
  upload(gl.ELEMENT_ARRAY_BUFFER, indices);
  for (const [loc, size, type, normalized, offset] of [
    [0, 3, gl.SHORT, true, 0],
    [1, 3, gl.BYTE, true, 6],
    [3, 1, gl.UNSIGNED_BYTE, false, 9],
  ]) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, type, normalized, 10, offset);
  }
  gl.vertexAttrib1f(2, 1);
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
      gl.drawElements(gl.TRIANGLES, indices.length / 2, gl.UNSIGNED_SHORT, 0);
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
        const j = i * 8,
          x = cloud[j],
          y = cloud[j + 1],
          z = cloud[j + 2],
          nx = cloud[j + 3],
          ny = cloud[j + 4],
          nz = cloud[j + 5];
        const front = nz * c - nx * s;
        if (front < 0.08 || y < -0.95) continue;
        const p = 3.8 / (3.8 - (z * c - x * s) * pulse);
        const lum = Math.max(
          0,
          Math.min(
            1,
            (0.18 + 0.86 * Math.max(0, -nx * 0.6 + ny * 0.63 + nz * 0.48) + 0.3 * Math.max(0, nx)) *
              cloud[j + 6],
          ),
        );
        const mat = cloud[j + 7];
        const color =
          state[3] > 0.5 ? 3 : mat === 4 || nx > 0.55 ? 2 : mat === 5 || x < -0.05 ? 1 : 0;
        ctx.fillStyle =
          palette[color * 32 + Math.floor((mat === 3 ? lum * 0.16 : mat === 4 ? 0.98 : lum) * 31)];
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
      yaw: -0.39 + (motion.matches ? 0 : 0.1 * Math.sin(pose * 0.48) + look * 0.2),
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

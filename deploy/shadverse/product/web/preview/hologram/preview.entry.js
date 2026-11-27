import { Signal } from "../../identity/audio.js";
import { createRenderer, extract } from "./particles.js";

const canvas = document.querySelector("canvas");
const picker = document.querySelector("input");
const renderer = createRenderer(canvas);
const signal = new Signal(() => {});
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const query = new URLSearchParams(location.search);
let animateCycle = query.has("review");
let time = 0,
  last = 0,
  level = 0,
  inward = 0,
  outward = 0,
  still = false,
  epoch = 0;

function cycle(t) {
  const rise = (p, width) => (Math.abs(p) < width ? Math.cos((Math.PI * p) / (2 * width)) ** 2 : 0);
  const phase = t % 8;
  return [rise(phase - 2.1, 1.08) * 0.73, rise(phase - 5.25, 1.55) * 0.88];
}

async function load(source) {
  const latest = ++epoch;
  const bitmap = await createImageBitmap(source);
  try {
    if (bitmap.width * bitmap.height > 4000000)
      throw Error("Reference is too large to sample at native resolution.");
    const sample = document.createElement("canvas");
    sample.width = bitmap.width;
    sample.height = bitmap.height;
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    if (latest === epoch) {
      renderer.setCloud(
        extract(ctx.getImageData(0, 0, sample.width, sample.height)),
        sample.width,
        sample.height,
      );
      canvas.dataset.ready = "true";
    }
  } finally {
    bitmap.close();
  }
}

function frame(now) {
  const dt = last ? Math.min(0.08, (now - last) / 1000) : 0;
  last = now;
  const [input] = signal.read();
  level += (input - level) * (1 - Math.exp(-dt / (input > level ? 0.06 : 0.28)));
  const strength = Math.min(1, Math.sqrt(level));
  const ease = 1 - Math.exp(-dt / 0.17);
  const [demoIn, demoOut] = animateCycle ? cycle(time) : [0, 0];
  inward += ((signal.mode === "mic" ? strength : demoIn) - inward) * ease;
  outward += ((signal.mode === "sample" ? strength : demoOut) - outward) * ease;
  canvas.dataset.inward = inward.toFixed(4);
  canvas.dataset.outward = outward.toFixed(4);
  time += dt;
  renderer.draw(time, inward, outward, still || reduced.matches ? 0 : 1);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

picker.addEventListener("change", () => {
  const file = picker.files[0];
  if (file) load(file).catch(console.error);
  picker.value = "";
});
for (const type of ["dragover", "drop"]) {
  document.addEventListener(type, (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (type === "drop" && file) load(file).catch(console.error);
  });
}
document.addEventListener("keydown", (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  switch (event.key.toLowerCase()) {
    case "o":
      picker.click();
      break;
    case "p":
      still = !still;
      break;
    case "escape":
      animateCycle = false;
      signal.stop();
      break;
    case "m":
    case "s": {
      animateCycle = false;
      const mode = event.key.toLowerCase() === "m" ? "mic" : "sample";
      if (signal.mode === mode) signal.stop();
      else signal.start(mode).catch(console.error);
      break;
    }
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) signal.stop();
});
window.addEventListener("pagehide", () => signal.stop());

// The trace samples this tab's animation callbacks. All values are local.
export function mountScope(panel, fa) {
  const canvas = panel.querySelector("canvas"),
    ctx = canvas.getContext("2d"),
    toggle = panel.querySelector("button");
  const numbers = new Intl.NumberFormat(fa ? "fa" : "en", { maximumFractionDigits: 1 });
  const ms = fa ? "میلی‌ثانیه" : "ms";
  const data = [];
  let last = 0,
    frame = 0,
    previousPaint = 0,
    paused = false,
    selected = null;
  const value = panel.querySelector("output"),
    detail = panel.querySelector(".trace-detail");
  function paint() {
    const box = canvas.getBoundingClientRect(),
      w = box.width,
      h = box.height,
      dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const top = 12,
      bottom = h - 18,
      left = 6,
      right = w - 6,
      cap = Math.max(40, Math.ceil(Math.max(0, ...data) / 20) * 20);
    const x = (i) => left + (i / 79) * (right - left),
      y = (v) => bottom - ((bottom - top) * v) / cap;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#b5b7ff22";
    for (let j = 0; j <= 4; j++) {
      ctx.beginPath();
      ctx.moveTo(left, y((cap * j) / 4));
      ctx.lineTo(right, y((cap * j) / 4));
      ctx.stroke();
    }
    if (!data.length) return;
    const line = new Path2D();
    data.forEach((n, i) => (i ? line.lineTo(x(i), y(n)) : line.moveTo(x(i), y(n))));
    const fill = new Path2D(line);
    fill.lineTo(x(data.length - 1), bottom);
    fill.lineTo(left, bottom);
    fill.closePath();
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, "#54dffd66");
    gradient.addColorStop(1, "#8054fe08");
    ctx.fillStyle = gradient;
    ctx.fill(fill);
    ctx.strokeStyle = "#69e5ff";
    ctx.lineWidth = 2;
    ctx.stroke(line);
    const i = Math.min(data.length - 1, selected ?? data.length - 1);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x(i), y(data[i]), 3.5, 0, Math.PI * 2);
    ctx.fill();
    value.textContent = numbers.format(data[i]) + " " + ms;
    detail.textContent =
      (fa ? "نمونه‌ها" : "Samples") +
      " · " +
      numbers.format(data.length) +
      "   /   " +
      (fa ? "سقف نمودار" : "Scale maximum") +
      " · " +
      numbers.format(cap) +
      " " +
      ms;
  }
  function tick(now) {
    if (last) data.push(now - last);
    if (data.length > 80) data.shift();
    last = now;
    if (now - previousPaint > 90) {
      paint();
      previousPaint = now;
    }
    frame = requestAnimationFrame(tick);
  }
  function run() {
    cancelAnimationFrame(frame);
    last = 0;
    if (!paused && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function pause() {
    paused = !paused;
    toggle.textContent = paused ? (fa ? "ادامه" : "Resume") : fa ? "مکث" : "Pause";
    toggle.setAttribute("aria-pressed", String(paused));
    run();
  }
  function inspect(e) {
    const b = canvas.getBoundingClientRect();
    selected = Math.max(0, Math.min(79, Math.round(((e.clientX - b.left) / b.width) * 79)));
    paint();
  }
  function key(e) {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    selected = Math.max(
      0,
      Math.min(data.length - 1, (selected ?? data.length - 1) + (e.key === "ArrowLeft" ? -1 : 1)),
    );
    paint();
  }
  toggle.onclick = pause;
  canvas.onpointermove = inspect;
  canvas.onpointerleave = () => {
    selected = null;
    paint();
  };
  canvas.onkeydown = key;
  const observer = new ResizeObserver(paint);
  observer.observe(canvas);
  document.addEventListener("visibilitychange", run);
  run();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    document.removeEventListener("visibilitychange", run);
  };
}

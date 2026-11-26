// A projected, folded torus drawn from fine strands. All artwork is local.
export function drawCore(canvas, variant) {
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let frame,
    previous = -100,
    phase = 0;
  function paint(now) {
    if (!canvas.isConnected) return;
    frame = requestAnimationFrame(paint);
    if (now - previous < 90 || document.hidden) return;
    previous = now;
    const { width, height } = canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio, 1.6);
    const w = Math.round(width * ratio),
      h = Math.round(height * ratio);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const s = Math.min(width * 0.47, height * 0.45);
    ctx.translate(width / 2, height / 2);
    ctx.scale(s, s);
    const glow = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 1.22);
    glow.addColorStop(0, "rgba(96,39,179,.24)");
    glow.addColorStop(0.66, "rgba(91,46,162,.14)");
    glow.addColorStop(1, "rgba(91,46,162,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
    const t = reduce ? 0 : (phase += 0.008);
    ctx.save();
    ctx.rotate(-0.28);
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.12 + i * 0.045, 0.72 + i * 0.04, -0.28, 0, Math.PI * 2);
      ctx.lineWidth = 0.0025;
      ctx.strokeStyle = "rgba(179,151,249,.3)";
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 164; i++) {
      const a = (i / 164) * 2 * Math.PI;
      ctx.beginPath();
      for (let j = 0; j <= 176; j++) {
        const b = (j * Math.PI) / 88,
          twist = b + a * 2.0 + t;
        const r = 0.62 + 0.29 * Math.cos(twist) + 0.092 * Math.sin(3 * a + b - t);
        const x = r * Math.cos(a),
          y = r * Math.sin(a),
          z = 0.29 * Math.sin(twist) + 0.19 * Math.sin(2 * a + t) + 0.06 * Math.sin(3 * b + a);
        const u = x * 0.91 + z * 0.41,
          v = y * 0.74 - z * 0.61 - x * 0.23;
        if (!j) ctx.moveTo(u, v);
        else ctx.lineTo(u, v);
      }
      const light = (Math.cos(a - 1.2) + 1) / 2;
      ctx.strokeStyle = `hsla(${253 + 34 * light},96%,${54 + 28 * light}%,${0.32 + 0.49 * light})`;
      ctx.lineWidth = 0.0025 + 0.0026 * light;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    if (variant === "voice") {
      ctx.beginPath();
      ctx.ellipse(0, 0.98, 0.62, 0.035, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#71509e";
      ctx.lineWidth = 0.004;
      ctx.stroke();
    }
    if (reduce) cancelAnimationFrame(frame);
  }
  paint(0);
  const resize = reduce
    ? new ResizeObserver(() => {
        previous = -100;
        paint(0);
      })
    : null;
  resize?.observe(canvas);
  return () => {
    resize?.disconnect();
    cancelAnimationFrame(frame);
  };
}

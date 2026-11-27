const glyphs = "01░·:⌁+│╵⠂⠐◦∴アシツヌミ";

export function matrixField(canvas) {
  const ctx = canvas.getContext("2d");
  const streams = [];
  let width = 0,
    height = 0,
    previous = -1;
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < [49, 35, 18][layer]; i++) {
      const index = streams.length;
      const seed = (index * 0.618034 + 0.053) % 1;
      streams.push({
        layer,
        seed,
        x: (index * 0.38197 + 0.02 * Math.sin(index)) % 1,
        speed: (11 + layer * 12) * (0.72 + seed * 0.6),
        length: 4 + Math.floor(seed * 12),
      });
    }
  }
  return {
    resize() {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (w === width && h === height) return;
      width = canvas.width = w;
      height = canvas.height = h;
      previous = -1;
    },
    draw(time, force) {
      if (!ctx || (!force && previous >= 0 && time - previous < 1 / 22)) return;
      previous = time;
      ctx.clearRect(0, 0, width, height);
      for (const { layer, seed, x, speed, length } of streams) {
        const unit = 11 + layer * 5;
        const y = (time * speed + seed * height * 1.7) % (height + length * unit);
        const position = x * width;
        const edge = 0.4 + 0.6 * Math.min(1, Math.abs(x - 0.53) * 2.55);
        ctx.font = unit + "px monospace";
        ctx.fillStyle = layer === 2 ? "#4adef7" : "#3299bf";
        for (let j = 0; j < length; j++) {
          const yy = y - j * unit;
          if (yy < 0 || yy > height) continue;
          const index = Math.floor(seed * 193 + j * 11 + yy / unit + time * 0.42) % glyphs.length;
          ctx.globalAlpha = edge * (1 - j / length) ** 1.45 * (0.145 + layer * 0.066);
          ctx.fillText(glyphs[index], position, yy);
          if (j === 0 && layer === 2) {
            ctx.fillStyle = "#a8f3ff";
            ctx.globalAlpha = edge * 0.3;
            ctx.fillText(glyphs[index], position, yy);
            ctx.fillStyle = "#4adef7";
          }
        }
      }
      ctx.fillStyle = "#74d9ff";
      for (let i = 0; i < 45; i++) {
        const x = ((i * 0.618034 + 0.14) % 1) * width + 3 * Math.sin(time * 0.4 + i);
        const y = (((i * 0.4142 + 0.11) % 1) * height + time * (2 + (i % 4))) % height;
        ctx.globalAlpha = 0.045 + (i % 5) * 0.029;
        ctx.fillRect(x, y, i % 9 === 0 ? 2 : 1, 1);
      }
      ctx.globalAlpha = 1;
    },
  };
}

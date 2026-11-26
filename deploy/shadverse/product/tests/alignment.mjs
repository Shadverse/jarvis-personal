import assert from "node:assert/strict";

// Compare the actual painted glyphs to the same layout with transparent text.
// Pixel bounds include shaping, punctuation and font side bearings.
export async function checkAlignment(page, scene) {
  const gate = ["login", "activation"].includes(scene);
  const selector = gate
    ? ".identity strong, .gateform h1, .gateform .sub, #auth [type=submit], .textbtn, .reviewbtn"
    : ".topname, h1, h2, .sub, .empty p";
  const samples = await page.locator(selector).evaluateAll((elements) =>
    elements.flatMap((el) => {
      const rect = el.getBoundingClientRect();
      const root = el.closest(".gateform,.surface,.studio,.voice-stage,.pagetitle,.main");
      const center = root.getBoundingClientRect();
      const target = center.left + center.width / 2 + scrollX;
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines = Array.from(range.getClientRects()).filter((r) => r.width > 0);
      const style = getComputedStyle(el);
      return lines.map((line, i) => ({
        text: el.textContent.slice(0, 40),
        target,
        left: Math.floor(Math.max(rect.left, line.left - 4) + scrollX),
        right: Math.ceil(Math.min(rect.right, line.right + 4) + scrollX),
        top: Math.floor(
          Math.max(rect.top, line.top, i ? (line.top + lines[i - 1].bottom) / 2 : -Infinity) +
            scrollY,
        ),
        bottom: Math.ceil(
          Math.min(
            rect.bottom,
            line.bottom,
            i + 1 < lines.length ? (line.bottom + lines[i + 1].top) / 2 : Infinity,
          ) + scrollY,
        ),
        color: style.color
          .match(/[.\d]+/g)
          .slice(0, 3)
          .map(Number),
        font: parseFloat(style.fontSize),
      }));
    }),
  );
  const snapshot = async () =>
    (await page.screenshot({ fullPage: true, animations: "disabled" })).toString("base64");
  const visible = await snapshot();
  await page
    .locator(selector)
    .evaluateAll((els) => els.forEach((el) => (el.style.webkitTextFillColor = "transparent")));
  let hidden;
  try {
    hidden = await snapshot();
  } finally {
    await page
      .locator(selector)
      .evaluateAll((els) =>
        els.forEach((el) => el.style.removeProperty("-webkit-text-fill-color")),
      );
  }
  const measurements = await page.evaluate(
    async ({ visible, hidden, samples }) => {
      async function pixels(data) {
        const image = new Image();
        image.src = "data:image/png;base64," + data;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, image.width, image.height);
      }
      const [before, after] = await Promise.all([pixels(visible), pixels(hidden)]);
      function luminance(rgb) {
        const linear = rgb
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      }
      return samples.map((sample) => {
        let first = Infinity,
          last = -Infinity,
          minContrast = Infinity;
        const foreground = luminance(sample.color);
        for (let y = Math.max(0, sample.top); y < Math.min(before.height, sample.bottom); y++) {
          for (let x = Math.max(0, sample.left); x < Math.min(before.width, sample.right); x++) {
            const i = 4 * (y * before.width + x);
            if (Math.abs(before.data[i] - after.data[i]) < 32) continue;
            first = Math.min(first, x);
            last = Math.max(last, x);
            minContrast = Math.min(
              minContrast,
              (foreground + 0.05) / (luminance(Array.from(after.data.slice(i, i + 3))) + 0.05),
            );
          }
        }
        return {
          text: sample.text,
          offset: (first + last + 1) / 2 - sample.target,
          contrast: minContrast,
          font: sample.font,
        };
      });
    },
    { visible, hidden, samples },
  );
  for (const row of measurements) {
    assert.ok(
      Number.isFinite(row.offset) && Math.abs(row.offset) <= 3,
      scene + " ink center " + JSON.stringify(row),
    );
    assert.ok(
      row.contrast >= (row.font >= 24 ? 3 : 4.5),
      scene + " contrast " + JSON.stringify(row),
    );
  }
  if (gate) {
    const geometry = await page.evaluate(() => {
      const card = document.querySelector(".gateform").getBoundingClientRect();
      const logo = document.querySelector(".emblem img").getBoundingClientRect();
      return [
        card.x + card.width / 2 - innerWidth / 2,
        logo.x + logo.width / 2 - innerWidth / 2,
        card.y + scrollY + card.height / 2 - document.documentElement.scrollHeight / 2,
      ];
    });
    assert.ok(
      geometry.every((delta) => Math.abs(delta) <= 1),
      scene + " composition " + geometry,
    );
  }
  return measurements;
}

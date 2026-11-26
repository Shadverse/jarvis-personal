import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const requireUi = createRequire(new URL("../../../../ui/package.json", import.meta.url));
const browser = await requireUi("playwright").chromium.launch({
  executablePath: process.env.CHROMIUM || "/usr/bin/chromium",
});
const rows = [];
const loads = [];
const duration = 2500;
try {
  for (const [width, height, dpr] of [
    [390, 844, 2.75],
    [393, 852, 3],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: dpr,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto("http://localhost:3000/review");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(
      () => performance.getEntriesByName("first-contentful-paint").length > 0,
    );
    const load = await page.evaluate(() => ({
      paint: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
      bytes: performance
        .getEntriesByType("resource")
        .reduce(
          (sum, entry) => sum + entry.encodedBodySize,
          performance.getEntriesByType("navigation")[0].encodedBodySize,
        ),
    }));
    loads.push(
      `- ${width} × ${height}, DPR ${dpr}. First contentful paint ${load.paint?.toFixed(0) ?? "unavailable"} ms. Encoded response bodies ${(load.bytes / 1024).toFixed(0)} KiB.`,
    );
    for (const scene of ["Login", "Main", "Voice"]) {
      if (scene === "Main") await page.click("[data-action=review]");
      if (scene === "Voice") await page.click(".voicebtn");
      const result = await page.evaluate(async (duration) => {
        const frameTimes = [],
          tasks = [];
        const observer = new PerformanceObserver((list) => tasks.push(...list.getEntries()));
        observer.observe({ type: "longtask" });
        let last = await new Promise(requestAnimationFrame);
        const start = last;
        while (last - start < duration) {
          const now = await new Promise(requestAnimationFrame);
          frameTimes.push(now - last);
          last = now;
        }
        tasks.push(...observer.takeRecords());
        observer.disconnect();
        const sorted = frameTimes.toSorted((a, b) => a - b);
        return {
          frames: frameTimes.length,
          mean: (frameTimes.length * 1000) / (last - start),
          p95: sorted[Math.ceil(0.95 * sorted.length) - 1],
          long: tasks.length,
          motion: getComputedStyle(document.querySelector(".levitate")).animationName,
        };
      }, duration);
      rows.push(
        `| ${width} × ${height} | ${scene} | ${result.motion} | ${result.frames} | ${result.mean.toFixed(1)} | ${result.p95.toFixed(1)} ms | ${result.long} |`,
      );
    }
    await context.close();
  }
  const fallback = await browser.newContext();
  await fallback.addInitScript(() =>
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2 }),
  );
  const page = await fallback.newPage();
  await page.goto("http://localhost:3000/review");
  assert.equal(
    await page.locator(".levitate").evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert.equal(
    await page.locator(".jewel").evaluate((el) => getComputedStyle(el, "::after").animationName),
    "none",
  );
  await fallback.close();
  const report = `# Mobile rendering measurements

Headless Chromium ${browser.version()} on Linux. Each profile used a fresh browser context, touch emulation, the indicated device pixel ratio, default motion settings and 4× CPU throttling. The preview server was on loopback. The measurements describe this host. Physical device compositing, thermal performance, battery use, Safari and cellular load times require device testing.

${loads.join("\n")}

Each row samples requestAnimationFrame callbacks for ${duration / 1000} seconds after navigation. Rate means callbacks per elapsed second. P95 is the 95th percentile callback interval. Long tasks use the browser's 50 ms threshold. These are main-thread timing measurements. They do not measure frames presented by the physical display.

| Viewport | Screen | CSS motion | Callbacks | Rate/s | P95 interval | Long tasks |
| --- | --- | --- | ---: | ---: | ---: | ---: |
${rows.join("\n")}

The core uses a pre-rendered refractive volume and CSS transform animation. Reduced motion disables movement. The same static rendering is used for data saver, two or fewer logical processors, or at most 2 GiB of reported device memory. A two-processor browser override verified the static fallback. The visual suite verifies reduced motion across all five demonstration states at all three viewports.

Run \`node tests/mobile-performance.mjs\` from the product directory with the preview running on port 3000.
`;
  await writeFile(new URL("../review/mobile-performance.md", import.meta.url), report);
  console.log(report);
} finally {
  await browser.close();
}

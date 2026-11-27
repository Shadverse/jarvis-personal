import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { checkAlignment } from "./alignment.mjs";
const alignmentRows = [];
const requireUi = createRequire(
  new URL("../../../ui/package.json", new URL("../", import.meta.url)),
);
const { chromium } = requireUi("playwright");
const output = fileURLToPath(new URL("../review/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || "/usr/bin/chromium",
  args: ["--enable-unsafe-swiftshader"],
});
const privatePortrait = process.env.JARVIS_PRIVATE_PORTRAIT;
let screens = 0;
try {
  for (const [device, width, height] of [
    ["desktop", 1440, 900],
    ["android", 390, 844],
    ["iphone", 393, 852],
  ]) {
    const mobile = device !== "desktop";
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    // Trace drawing commands to verify the portrait is made of point sprites.
    await page.addInitScript(() => {
      const proto = window.WebGL2RenderingContext?.prototype;
      if (!proto) return;
      const draw = proto.drawArrays;
      window.particleDraws = 0;
      proto.drawArrays = function (...args) {
        if (args[0] === this.POINTS && args[2] > 0) window.particleDraws++;
        return draw.apply(this, args);
      };
    });

    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:3000/review");
    const snap = async (name, capture) => {
      await page.mouse.move(0, 0);
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.fonts.check("16px Vazir")));
      assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        device + "/" + name,
      );
      const ink = await checkAlignment(page, name);
      alignmentRows.push(
        `| ${width} × ${height} | ${name} | ${ink.length} | ${Math.max(...ink.map((m) => Math.abs(m.offset))).toFixed(2)} px | ${Math.min(...ink.map((m) => m.contrast)).toFixed(2)} |`,
      );
      if (capture) await page.screenshot({ path: output + device + "-" + name + ".png" });
      screens++;
    };
    await page.getByRole("heading", { name: "به جارویس شادوِرس خوش آمدید", exact: true }).waitFor();
    await page.getByRole("button", { name: "ورود به جارویس شادوِرس", exact: true }).waitFor();
    assert.equal(await page.locator(".identity strong").innerText(), "جارویس شادوِرس");
    await snap("login", true);
    await page.locator("[name=name]").fill("نام آزمایشی");
    assert.equal(
      await page.locator("[name=name]").evaluate((el) => getComputedStyle(el).direction),
      "rtl",
    );
    await page.locator("[name=name]").fill("jarvis.user");
    assert.equal(
      await page.locator("[name=name]").evaluate((el) => getComputedStyle(el).direction),
      "ltr",
    );
    await page.locator("[name=name]").fill("");
    if (mobile) {
      assert.equal(
        await page.locator("[name=name]").evaluate((el) => getComputedStyle(el).fontSize),
        "16px",
      );
      await page.setViewportSize({ width, height: 470 });
      await page.locator("[name=password]").focus();
      await page.locator("[type=submit]").scrollIntoViewIfNeeded();
      assert.ok(
        await page
          .locator("[type=submit]")
          .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight + 1),
      );
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo(0, 0));
    }
    await page.click("[data-action=activation]");
    await snap("activation");
    await page.click("[data-action=activation]");
    await page.click("[data-action=review]");
    await snap("main", true);
    assert.equal(
      await page
        .locator(".navbtn")
        .first()
        .evaluate((el) => getComputedStyle(el).textAlign),
      "start",
    );
    assert.equal(await page.locator(".shortcut").count(), 5);
    if (mobile) {
      const toolPositions = await page
        .locator(".tools button,.tools select")
        .evaluateAll((controls) => controls.map((el) => el.getBoundingClientRect().top));
      assert.ok(
        Math.max(...toolPositions) - Math.min(...toolPositions) <= 2,
        "Mobile composer controls share one row",
      );
    }
    await page.locator("#draft").fill("فایل JARVIS 2026");
    assert.equal(
      await page.locator("#draft").evaluate((el) => getComputedStyle(el).direction),
      "rtl",
    );
    async function nav(k) {
      if (mobile) await page.click(".mobilemenu");
      await page.click("nav [data-action=" + k + "]");
    }
    await nav("voice");
    await snap("voice", true);
    assert.equal(await page.locator(".portrait").getAttribute("data-renderer"), "WebGL2");
    const portrait = page.locator(".portrait");
    assert.equal(await portrait.getAttribute("data-points"), "0");
    assert.ok(await page.locator(".portrait-placeholder").isVisible());
    if (privatePortrait) {
      await page.locator("summary").filter({ hasText: "چهرهٔ خصوصی" }).click();
      await page.locator("#creator-contours").setInputFiles(privatePortrait);
      await page.locator(".portrait-placeholder").waitFor({ state: "hidden" });
      await page.locator("summary").filter({ hasText: "چهرهٔ خصوصی" }).click();
      assert.ok(await page.evaluate(() => window.particleDraws > 0));
    }
    const idlePixels = privatePortrait && (await portrait.locator("canvas").screenshot());
    for (const state of ["listening", "thinking", "speaking", "error", "idle"]) {
      await page.click("[data-action=demo-" + state + "]");
      assert.equal(await page.locator(".voice-stage .portrait").getAttribute("data-state"), state);
      assert.equal(await page.locator(".modes [aria-pressed=true]").count(), 1);
      if (idlePixels && state !== "idle") {
        assert.notDeepEqual(await portrait.locator("canvas").screenshot(), idlePixels, state);
      }
      const still = await portrait.getAttribute("data-frames");
      await page.waitForTimeout(80);
      assert.equal(await portrait.getAttribute("data-frames"), still);
    }
    await nav("workspace");
    await snap("workspace");
    await page.click("[data-action=tab-gallery]");
    await page.locator("#search").fill("تصویر");
    await nav("monitor");
    assert.equal(await page.locator(".portrait").count(), 0);
    await page.waitForFunction(
      () => document.querySelector("[data-stat=peak]").textContent !== "—",
    );
    await page.waitForFunction(() => {
      const fullWindow = new Intl.NumberFormat("fa").format(80);
      return document
        .querySelector(".trace-detail")
        .textContent.startsWith("نمونه‌ها · " + fullWindow);
    });
    await snap("monitor", true);
    await page.locator("#scope button").click();
    assert.equal(await page.locator("#scope button").getAttribute("aria-pressed"), "true");
    await nav("plans");
    await snap("subscription");
    await page.click("[data-action=year]");
    await nav("admin");
    await snap("admin");
    await page.click("[data-action=lang]");
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    for (const scene of ["main", "voice", "workspace", "plans", "admin"]) {
      await nav(scene);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      );
    }
    await nav("main");
    assert.equal(await page.locator("#draft").inputValue(), "فایل JARVIS 2026");
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    screens + " Persian screen/viewport checks passed. English navigation and width checks passed.",
  );
} finally {
  await browser.close();
}

// Verify the distributable from disk, including embedded artwork and fonts.
const portableBrowser = await chromium.launch({
  executablePath: process.env.CHROMIUM || "/usr/bin/chromium",
  args: ["--use-fake-device-for-media-stream"],
});
try {
  const context = await portableBrowser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  await page.setContent(await readFile(new URL("../dist/review.html", import.meta.url), "utf8"));
  await page.click("[data-action=review]");
  assert.equal(await page.locator("#draft").count(), 1);
  assert.ok(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check("16px Vazir") && document.images[0].naturalWidth > 0;
    }),
  );
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    const getStream = devices.getUserMedia.bind(devices);
    devices.getUserMedia = async (constraints) => {
      const stream = await getStream(constraints);
      window.testMicTracks = stream.getAudioTracks();
      return stream;
    };
  });
  await page.goto("http://localhost:3000/review");
  await page.click("[data-action=review]");
  await page.click("nav [data-action=voice]");
  await page.click("[data-action=mic]");
  await page.waitForFunction(
    () => document.querySelector("[data-action=mic]")?.getAttribute("aria-pressed") === "true",
  );
  await page.waitForFunction(
    () => Number(document.querySelector(".portrait")?.dataset.amplitude) > 0.005,
  );
  await page.click("[data-action=mic]");
  assert.equal(await page.evaluate(() => window.testMicTracks[0].readyState), "ended");
  assert.equal(await page.locator("[data-action=mic]").getAttribute("aria-pressed"), "false");
  await page.click("[data-action=sample]");
  await page.waitForFunction(
    () => Number(document.querySelector(".portrait")?.dataset.amplitude) > 0.005,
  );
  await page.click("[data-action=sample]");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await page.getByText("اتصال برقرار نیست").waitFor();
  assert.deepEqual(await page.evaluate(() => caches.keys()), []);
  console.log(
    "Portable preview, synthetic microphone signal and track release and offline fallback passed.",
  );
} finally {
  await portableBrowser.close();
}

await writeFile(
  output + "persian-alignment.md",
  `# Persian alignment and typography

Each row covers a real Chromium render in Persian. Two screenshots of the same page, one with transparent text, isolate the painted glyphs. Each line’s visible left and right edges are compared with the center of its containing panel. The tolerance is 3 CSS pixels. On login and activation, the card and logo are also checked against the page’s horizontal axis and the card against its vertical axis, within 1 CSS pixel.

Contrast compares the computed text color with the sampled background under the ink. The thresholds are 4.5 for normal text and 3 for text at least 24 px tall. Coverage includes login action labels, the welcome heading, product name, primary headings, section titles and explanatory subtitles. Native browser validation and the physical device keyboard are outside this measurement.

| Viewport | Screen | Painted lines | Largest center offset | Lowest contrast ratio |
| --- | --- | ---: | ---: | ---: |
${alignmentRows.join("\n")}

The OFL-licensed Vazirmatn font loaded on all three viewports. The login test checks the exact Persian welcome heading and primary action, 16 px mobile input text, and automatic direction for both Persian and Latin input. The composer preserves the Persian reading direction in mixed Persian–Latin drafts. Navigation labels keep start alignment. The visual suite also checks English navigation, keyboard-height layout and the reduced-motion states.
`,
);

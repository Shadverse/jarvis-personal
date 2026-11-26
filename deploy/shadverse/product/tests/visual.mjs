import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const requireUi = createRequire(
  new URL("../../../ui/package.json", new URL("../", import.meta.url)),
);
const { chromium } = requireUi("playwright");
const output = fileURLToPath(new URL("../review/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || "/usr/bin/chromium",
});
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
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:3000/review");
    const snap = async (name, capture) => {
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.fonts.check("16px Vazir")));
      assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        device + "/" + name,
      );
      if (capture) await page.screenshot({ path: output + device + "-" + name + ".png" });
      screens++;
    };
    await snap("login", true);
    await page.click("[data-action=activation]");
    await snap("activation");
    await page.click("[data-action=activation]");
    await page.click("[data-action=review]");
    await snap("main", true);
    async function nav(k) {
      if (mobile) await page.click(".mobilemenu");
      await page.click("nav [data-action=" + k + "]");
    }
    await nav("voice");
    await snap("voice", true);
    await nav("workspace");
    await snap("workspace");
    await page.click("[data-action=tab-gallery]");
    await page.locator("#search").fill("تصویر");
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
  await page.goto("http://localhost:3000/review");
  await page.click("[data-action=review]");
  await page.click("nav [data-action=voice]");
  await page.click("[data-action=mic]");
  await page.getByText("میکروفون در دسترس است. بررسی پایان یافت.").waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await page.getByText("اتصال برقرار نیست").waitFor();
  assert.deepEqual(await page.evaluate(() => caches.keys()), []);
  console.log(
    "Portable preview, synthetic microphone permission check and offline fallback passed.",
  );
} finally {
  await portableBrowser.close();
}

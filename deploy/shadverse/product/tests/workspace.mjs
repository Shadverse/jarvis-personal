import assert from "node:assert/strict";
import { createRequire } from "node:module";
const requireUi = createRequire(new URL("../../../../ui/package.json", import.meta.url));
const browser = await requireUi("playwright").chromium.launch({
  executablePath: process.env.CHROMIUM || "/usr/bin/chromium",
});
try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  await page.goto("http://localhost:3000/review");
  const click = (a) =>
    page
      .locator('[data-action="' + a + '"]')
      .first()
      .click();
  await click("review");
  await page.locator("#draft").fill("نمونهٔ محلی");
  await click("save-draft");
  await click("tab-projects");
  await page.locator("#item-name").fill("طرح <b>");
  await click("add-item");
  await click("tab-memory");
  await page.locator("#item-name").fill("یادداشت اول");
  await click("add-item");
  await page.locator("#search").fill("دیگر");
  assert.equal(await page.locator(".work-row").count(), 0);
  await page.locator("#search").fill("اول");
  assert.equal(await page.locator(".work-row").count(), 1);
  await click("tab-files");
  await page
    .locator("#workspace-file")
    .setInputFiles(new URL("../web/icon-192.png", import.meta.url).pathname);
  await page.locator(".work-row img").waitFor();
  await click("tab-gallery");
  assert.ok(
    await page.locator(".work-row img").evaluate(async (img) => {
      await img.decode();
      return img.naturalWidth > 0;
    }),
  );
  await click("tab-projects");
  assert.equal(await page.locator(".work-row bdi b").count(), 0);
  await click("open-item-0");
  assert.equal(await page.locator("#project-filter").inputValue(), "طرح <b>");
  await page.locator("#project-filter").selectOption("");
  await click("tab-history");
  await click("open-item-0");
  assert.equal(await page.locator("#draft").inputValue(), "نمونهٔ محلی");
  await click("logout");
  await click("review");
  await click("tab-memory");
  assert.equal(await page.locator(".work-row").count(), 0);
  assert.equal(await page.locator("#project-filter option").count(), 1);
  await click("tab-gallery");
  assert.equal(await page.locator(".work-row img").count(), 0);
  console.log(
    "Local draft, project, filtered note search, file/gallery, escaped names and session clearing passed.",
  );
} finally {
  await browser.close();
}

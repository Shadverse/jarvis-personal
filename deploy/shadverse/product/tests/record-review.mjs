import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
// Capture the actual browser compositor. Mux the same preview clip at its
// measured AudioBufferSource start time; no access to a real microphone.
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL("../", import.meta.url));
const requireUi = createRequire(new URL("../../../../ui/package.json", import.meta.url));
const browser = await requireUi("playwright").chromium.launch({
  executablePath: process.env.CHROMIUM || "/usr/bin/chromium",
  args: ["--enable-unsafe-swiftshader"],
});
const dir = await mkdtemp(join(tmpdir(), "jarvis-screen-")),
  frames = [],
  writes = [];
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const result = start.apply(this, args);
      window.sampleStarted = (performance.timeOrigin + performance.now()) / 1000;
      return result;
    };
  });
  await page.goto("http://localhost:3000/review");
  await page.click("[data-action=review]");
  await page.click(".voicebtn");
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", (d) => {
    const name = String(frames.length).padStart(5, "0") + ".jpg";
    frames.push({ name, t: d.metadata.timestamp });
    writes.push(writeFile(join(dir, name), Buffer.from(d.data, "base64")));
    cdp.send("Page.screencastFrameAck", { sessionId: d.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 2 });
  await page.waitForTimeout(1100);
  for (const mode of ["listening", "thinking"]) {
    await page.click("[data-action=demo-" + mode + "]");
    await page.waitForTimeout(1300);
  }
  await page.click("[data-action=sample]");
  await page.waitForFunction(() => window.sampleStarted > 0);
  await page.waitForFunction(() => document.querySelector(".portrait").dataset.state === "idle");
  await page.click("[data-action=demo-error]");
  await page.waitForTimeout(700);
  await page.click(".mobilemenu");
  await page.click("nav [data-action=monitor]");
  await page.waitForTimeout(1200);
  await cdp.send("Page.stopScreencast");
  await Promise.all(writes);
  if (frames.length < 25) throw Error("Insufficient compositor frames");
  const start = await page.evaluate(() => window.sampleStarted);
  const delay = Math.max(0, Math.round((start - frames[0].t) * 1000));
  const timeline = frames
    .map(
      (f, i) =>
        "file '" + f.name + "'\nduration " + Math.max(0.001, (frames[i + 1]?.t ?? f.t + 0.1) - f.t),
    )
    .join("\n");
  await writeFile(join(dir, "timeline"), timeline + "\nfile '" + frames.at(-1).name + "'\n");
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    join(dir, "timeline"),
    "-i",
    join(here, "web/identity/voice.ogg"),
    "-af",
    "adelay=" + delay,
    "-vf",
    "fps=25,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    join(here, "review/living-identity.mp4"),
  ]);
  console.log("Recorded", frames.length, "compositor frames. Sample offset", delay, "ms.");
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}

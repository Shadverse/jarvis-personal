import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addUser, openStore } from "../auth.mjs";

const chrome = process.env.CHROMIUM || "/usr/bin/chromium";
test(
  "the Creator voice screen uses local Persian speech through the authenticated chat route",
  { skip: !existsSync(chrome), timeout: 20000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "jarvis-persian-voice-"));
    const token = randomBytes(32).toString("hex");
    const file = join(dir, "token");
    const password = randomUUID();
    await writeFile(file, token, { mode: 0o600 });
    const db = openStore(dir);
    await addUser(db, "creator", password, "creator");
    db.close();
    const requests = [];
    let canceled = false;
    const gateway = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      requests.push({ input: body.input, auth: req.headers.authorization });
      if (body.input === "لغو") {
        res.once("close", () => {
          canceled = true;
        });
        return;
      }
      res.end(
        JSON.stringify({
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "درود از جارویس" }],
            },
          ],
        }),
      );
    }).listen(0, "127.0.0.1");
    await once(gateway, "listening");
    const reserve = createServer().listen(0, "127.0.0.1");
    await once(reserve, "listening");
    const port = reserve.address().port;
    await new Promise((resolve) => reserve.close(resolve));
    const origin = "http://localhost:" + port;
    const server = spawn(process.execPath, [new URL("../server.mjs", import.meta.url).pathname], {
      env: {
        ...process.env,
        PORT: String(port),
        JARVIS_ORIGIN: origin,
        JARVIS_STATE: dir,
        JARVIS_GATEWAY_CREATOR: "creator",
        JARVIS_GATEWAY_TOKEN_FILE: file,
        JARVIS_GATEWAY_PORT: String(gateway.address().port),
      },
    });
    const exit = once(server, "exit");
    t.after(async () => {
      server.kill();
      await exit;
      await new Promise((resolve) => gateway.close(resolve));
      await rm(dir, { recursive: true, force: true });
    });
    await Promise.race([
      once(server.stdout, "data"),
      exit.then(() => assert.fail("App failed to start")),
    ]);
    const require = createRequire(import.meta.url);
    const { chromium } = require("playwright");
    const browser = await chromium.launch({
      executablePath: chrome,
      args: ["--enable-unsafe-swiftshader"],
    });
    t.after(() => browser.close());
    const page = await browser.newPage({ reducedMotion: "reduce" });
    page.setDefaultTimeout(4500);
    page.on("pageerror", (error) => console.error(error.message));
    await page.addInitScript(() => {
      window.speechFixture = { transcript: "سلام", status: "available", spoken: [], starts: 0 };
      window.SpeechRecognition = class {
        processLocally = false;
        static async available({ langs, processLocally }) {
          if (langs[0] !== "fa-IR" || !processLocally) throw Error("Remote recognition attempted");
          return window.speechFixture.status;
        }
        start() {
          if (!this.processLocally || this.lang !== "fa-IR")
            throw Error("Remote recognition attempted");
          window.speechFixture.starts++;
          this.onresult({
            results: [
              Object.assign([{ transcript: window.speechFixture.transcript }], { isFinal: true }),
            ],
          });
        }
        abort() {}
      };
      Object.defineProperty(window, "speechSynthesis", {
        value: {
          getVoices: () => [
            { lang: "fa-IR", localService: false },
            { lang: "fa-IR", localService: true },
          ],
          speak(utterance) {
            window.speechFixture.spoken.push([utterance.text, utterance.voice.localService]);
            queueMicrotask(() => utterance.onend());
          },
          cancel() {},
        },
      });
      window.SpeechSynthesisUtterance = class {
        constructor(text) {
          this.text = text;
        }
      };
    });
    await page.goto(origin);
    await page.locator('#auth [name="name"]').fill("creator");
    await page.locator('#auth [name="password"]').fill(password);
    await page.locator('#auth button[type="submit"]').click();
    await page.locator('nav [data-action="voice"]').click();
    const mic = page.locator('[data-action="mic"]');
    await mic.click();
    await page.waitForFunction(() => window.speechFixture.spoken.length === 1);
    assert.deepEqual(await page.evaluate(() => window.speechFixture.spoken), [
      ["درود از جارویس", true],
    ]);
    assert.deepEqual(requests, [{ input: "سلام", auth: "Bearer " + token }]);

    await page.evaluate(() => {
      window.speechFixture.transcript = "لغو";
    });
    await mic.click();
    await page.locator('.voice-stage[data-state="thinking"]').waitFor();
    await new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (requests.length === 2) {
          clearInterval(timer);
          clearTimeout(deadline);
          resolve();
        }
      }, 10);
      const deadline = setTimeout(() => {
        clearInterval(timer);
        reject(Error("Gateway did not see the cancel fixture request"));
      }, 2000);
    });
    await mic.click();
    await page.locator('.voice-stage[data-state="idle"]').waitFor();

    await page.evaluate(() => {
      window.speechFixture.status = "unavailable";
    });
    await mic.click();
    await page
      .getByText("بازشناسی فارسی روی دستگاه در دسترس نیست. از گفت‌وگوی متنی استفاده کنید.")
      .waitFor();
    assert.equal(await page.evaluate(() => window.speechFixture.starts), 2);
    assert.equal(requests.length, 2);
    assert.equal(canceled, true);
    await page.locator('.voice-dock [data-action="main"]').click();
    await page.locator(".turn.assistant").getByText("درود از جارویس").waitFor();
    await page.reload();
    await page.locator(".turn.assistant").getByText("درود از جارویس").waitFor();
    assert.equal(await page.locator(".turn.human").count(), 1);
    assert.equal(await page.locator(".turn.human p").textContent(), "سلام");
  },
);

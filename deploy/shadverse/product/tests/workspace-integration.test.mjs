import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addUser, invite, openStore } from "../auth.mjs";

const chrome = process.env.CHROMIUM || "/usr/bin/chromium";

test(
  "the narrow signed-in workspace connects projects, tasks, reminders, notes, chat and files",
  { skip: !existsSync(chrome), timeout: 22000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "jarvis-workspace-integration-"));
    const tokenFile = join(root, "token");
    const token = randomUUID();
    await writeFile(tokenFile, token, { mode: 0o600 });
    const state = openStore(root);
    const password = randomUUID();
    await addUser(state, "creator", password, "creator");
    await addUser(state, "member", password, "member", invite(state));
    const sent = [];
    const gateway = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      sent.push(JSON.parse(Buffer.concat(chunks)));
      res.end(
        JSON.stringify({
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "پاسخ آزمون" }],
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
    const child = spawn(process.execPath, [new URL("../server.mjs", import.meta.url).pathname], {
      env: {
        PATH: process.env.PATH,
        PORT: String(port),
        JARVIS_STATE: root,
        JARVIS_ORIGIN: origin,
        JARVIS_GATEWAY_TOKEN_FILE: tokenFile,
        JARVIS_GATEWAY_CREATOR: "creator",
        JARVIS_GATEWAY_PORT: String(gateway.address().port),
      },
    });
    const exit = once(child, "exit");
    t.after(async () => {
      child.kill();
      await exit;
      state.close();
      await new Promise((resolve) => gateway.close(resolve));
      await rm(root, { recursive: true, force: true });
    });
    await Promise.race([once(child.stdout, "data"), exit.then(() => assert.fail("App exited"))]);
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({
      executablePath: chrome,
      args: ["--enable-unsafe-swiftshader"],
    });
    t.after(() => browser.close());
    const page = await browser.newPage({
      viewport: { width: 320, height: 740 },
      isMobile: true,
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(4500);
    const action = (name) => page.locator(`[data-action="${name}"]:visible`);
    async function signIn(name) {
      await page.locator("#auth [name=name]").fill(name);
      await page.locator("#auth [name=password]").fill(password);
      await page.locator("#auth [type=submit]").click();
      await page.locator("#draft").waitFor();
    }
    async function nav(name) {
      await page.locator(".mobilemenu").click();
      await page.locator(`nav [data-action="${name}"]`).click();
    }
    await page.goto(origin);
    await signIn("creator");
    for (const width of [320, 360, 390, 393]) {
      await page.setViewportSize({ width, height: 740 });
      for (const language of ["fa", "en"]) {
        if ((await page.locator("html").getAttribute("lang")) !== language)
          await action("lang").click();
        await page.evaluate(() => document.fonts.ready);
        const layout = await page.locator(".tools").evaluate((tools) => {
          const buttons = [...tools.querySelectorAll("button")].map((button) =>
            button.getBoundingClientRect(),
          );
          return {
            viewport: innerWidth,
            scroll: document.documentElement.scrollWidth,
            tops: buttons.map(({ top }) => top),
            fits: buttons.every(({ left, right }) => left >= 0 && right <= innerWidth),
          };
        });
        assert.equal(layout.viewport, width);
        assert.ok(layout.scroll <= width && layout.fits, `${language}/${width}: composer fits`);
        assert.ok(
          Math.max(...layout.tops) - Math.min(...layout.tops) <= 2,
          `${language}/${width}: one composer row`,
        );
      }
    }
    await page.setViewportSize({ width: 320, height: 740 });
    await action("tab-projects").click();
    await page.locator("#item-name").fill("پروژهٔ آزمایشی");
    await action("add-item").click();
    await action("project-tasks-0").click();
    await page.locator("#task-title").fill("وظیفهٔ آزمایشی");
    await action("task-add").click();
    await page.locator('[data-action^="reminder-edit-"]').click();
    // Use tomorrow's local date so valid scheduling stays independent of the test runner date.
    await page.locator("#reminder-due").fill(
      await page.evaluate(() => {
        const then = new Date(Date.now() + 86400_000);
        return new Date(then.getTime() - then.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
      }),
    );
    await action("reminder-save").click();
    await page.locator('[data-action^="reminder-cancel-"]').waitFor();
    state.prepare("UPDATE project_task_reminders SET due=1").run();
    await action("tab-projects").click();
    const acknowledge = page.locator('[data-action^="reminder-ack-"]');
    await acknowledge.click();
    await acknowledge.waitFor({ state: "hidden" });
    const memoryLoaded = page.waitForResponse((res) => res.url().includes("/api/memory?project="));
    await action("tab-memory").click();
    assert.equal((await memoryLoaded).status(), 200);
    await page.locator("#item-name").fill("حافظهٔ پروژه");
    const noteSaved = page.waitForResponse(
      (res) => res.url().endsWith("/api/memory") && res.request().method() === "POST",
    );
    await action("add-item").click();
    assert.equal((await noteSaved).status(), 200);
    await page.locator('[data-action^="memory-share-"]').click();
    await page.getByText(/Note sent to the configured model/).waitFor();
    await page.locator("#draft").fill("درخواست آزمایشی");
    await page.locator(".composer [type=submit]").click();
    await page.locator(".turn.assistant").getByText("پاسخ آزمون").waitFor();
    assert.deepEqual(JSON.parse(sent[0].input.split("\n")[1]), {
      request: "درخواست آزمایشی",
      selectedNote: "حافظهٔ پروژه",
    });
    await page.reload();
    await page.locator(".turn.human").getByText("درخواست آزمایشی").waitFor();
    await action("tab-projects").click();
    await page.locator("#results").getByText("پروژهٔ آزمایشی", { exact: true }).waitFor();
    assert.equal(await acknowledge.count(), 0);
    await action("project-tasks-0").click();
    await page.getByText("وظیفهٔ آزمایشی", { exact: true }).waitFor();
    await action("tab-files").click();
    const literal = "<script>untrusted</script> سلام";
    await page.locator("#private-document").setInputFiles({
      name: "synthetic.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(literal),
    });
    await page.locator('[data-action^="document-view-"]').click();
    await page.locator("textarea[readonly]").waitFor();
    assert.equal(await page.locator("textarea[readonly]").inputValue(), literal);
    assert.equal(sent.length, 1);
    assert.deepEqual(
      await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      })),
      { viewport: 320, document: 320 },
      "file preview does not widen the mobile viewport",
    );
    await page.locator(".mobilemenu").click();
    await action("logout").click();
    await signIn("member");
    assert.equal(await page.locator(".turn").count(), 0);
    await nav("workspace");
    const projects = page.waitForResponse((res) => res.url().endsWith("/api/actions"));
    await action("tab-projects").click();
    assert.deepEqual((await (await projects).json()).projects, []);
    assert.equal(await page.getByText("پروژهٔ آزمایشی", { exact: true }).count(), 0);
    const documents = page.waitForResponse((res) => res.url().endsWith("/api/documents"));
    await action("tab-files").click();
    assert.deepEqual((await (await documents).json()).files, []);
    assert.equal(await page.getByText("synthetic.txt", { exact: true }).count(), 0);
  },
);

import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { addUser, openStore, invite } from "../auth.mjs";

test("Persian Gate with isolated accounts", { timeout: 60000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-gate-test-"));
  const db = openStore(dir);
  const reserve = createServer().listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const origin = "http://localhost:" + port;
  const env = {
    ...process.env,
    PORT: String(port),
    JARVIS_STATE: dir,
    JARVIS_ORIGIN: origin,
  };
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const server = spawn(process.execPath, ["server.mjs"], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  t.after(async () => {
    const exited = once(server, "exit");
    server.kill();
    await exited;
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(() => {
      throw Error("Server exited");
    }),
  ]);
  const password = randomUUID();
  const post = (route, body, extra = {}) =>
    fetch(origin + "/api/" + route, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", ...extra },
      body: JSON.stringify(body),
    });
  const get = (route, cookie = "") =>
    fetch(origin + "/api/" + route, { headers: { Cookie: cookie } });
  const credentials = (name) => ({ name, password });
  const auth = async (name) => {
    const response = await post("login", credentials(name));
    assert.equal(response.status, 200);
    const header = response.headers.get("set-cookie");
    for (const flag of [
      "__Host-jarvis=",
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Path=/",
      "Max-Age=14400",
    ])
      assert.ok(header.includes(flag));
    return { cookie: header.split(";")[0], body: await response.json() };
  };
  await addUser(db, "creator", password, "creator");
  await t.test("Activation codes expire, are single use and grant only membership", async () => {
    const expired = invite(db);
    db.prepare("UPDATE codes SET expires=0").run();
    const activate = (name, code) =>
      post("activate", { ...credentials(name), code, role: "creator" });
    assert.equal((await activate("guest", expired)).status, 400);
    const code = invite(db);
    assert.ok(!db.prepare("SELECT id FROM codes WHERE id=?").get(code));
    assert.equal((await activate("creator", code)).status, 400);
    const results = await Promise.all([activate("guest", code), activate("guest", code)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
    const rows = db.prepare("SELECT role,hash,salt FROM users ORDER BY id").all();
    assert.equal(rows[1].role, "member");
    assert.notEqual(rows[0].hash, rows[1].hash);
    assert.notEqual(rows[0].salt, rows[1].salt);
  });
  await t.test(
    "Only Creator can read the account directory and session metadata has no Gateway link",
    async () => {
      const member = await auth("guest"),
        creator = await auth("creator");
      assert.equal(member.body.controlUI, undefined);
      assert.equal(creator.body.controlUI, undefined);
      assert.equal(creator.body.chatAvailable, false);
      assert.equal((await get("admin")).status, 401);
      assert.equal((await get("admin", member.cookie)).status, 403);
      const result = await get("admin", creator.cookie);
      assert.deepEqual(
        (await result.json()).users.map((u) => u.name),
        ["creator", "guest"],
      );
      const session = await get("session", member.cookie);
      assert.equal(session.headers.get("cache-control"), "no-store");
      assert.equal((await session.json()).name, "guest");
      assert.ok(!db.prepare("SELECT id FROM sessions WHERE id=?").get(member.cookie.split("=")[1]));
    },
  );
  await t.test("Origin and CSRF checks protect sign-in and logout", async () => {
    const who = await auth("creator");
    assert.equal(
      (await post("login", credentials("creator"), { Origin: "https://other.invalid" })).status,
      403,
    );
    assert.equal((await post("logout", {}, { Cookie: who.cookie })).status, 403);
    assert.equal((await get("session", who.cookie)).status, 200);
    assert.equal(
      (await post("logout", {}, { Cookie: who.cookie, "X-CSRF-Token": who.body.csrf })).status,
      200,
    );
    assert.equal((await get("session", who.cookie)).status, 401);
  });
  await t.test("Expiry and operator revocation invalidate issued sessions", async () => {
    const member = await auth("guest"),
      other = await auth("creator");
    execFileSync(process.execPath, ["manage.mjs", "revoke", "guest"], { cwd, env });
    assert.equal((await get("session", member.cookie)).status, 401);
    assert.equal((await get("session", other.cookie)).status, 200);
    db.exec("UPDATE sessions SET expires=0");
    assert.equal((await get("session", other.cookie)).status, 401);
  });
  await t.test("Repeated login failures reach the account rate limit", async () => {
    for (let i = 0; i < 8; i++)
      assert.equal((await post("login", credentials("unused"))).status, 401);
    assert.equal((await post("login", credentials("unused"))).status, 429);
  });
  await t.test("Browser login restores a secure session and logout clears it", async () => {
    const requireUI = createRequire(new URL("../../../../ui/package.json", import.meta.url));
    const browser = await requireUI("playwright").chromium.launch({
      executablePath: process.env.CHROMIUM || "/usr/bin/chromium",
    });
    try {
      const page = await browser.newPage();
      await page.goto(origin);
      await page.locator("[name=name]").fill("creator");
      await page.locator("[name=password]").fill(password);
      await page.locator("[type=submit]").click();
      await page.locator("#draft").waitFor();
      assert.equal(await page.locator(".send").isDisabled(), true);
      await page.reload();
      await page.locator("#draft").waitFor();
      await page.locator("nav [data-action=admin]").click();
      await page.getByText("guest", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.cookie.includes("jarvis")), false);
      assert.equal(
        await page.evaluate(async () => Boolean(await navigator.serviceWorker.ready)),
        true,
      );
      await page.locator("[data-action=logout]").click();
      await page.locator("#auth").waitFor();
      await page.reload();
      await page.locator("#auth").waitFor();
      assert.equal(await page.evaluate(async () => (await fetch("/api/session")).status), 401);
    } finally {
      await browser.close();
    }
  });
});

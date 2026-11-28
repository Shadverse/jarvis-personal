import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addUser, invite, openStore } from "../auth.mjs";

test("private project creation is explicit, bounded, idempotent, and isolated", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-actions-"));
  const db = openStore(dir);
  const password = randomUUID();
  await addUser(db, "creator", password, "creator");
  await addUser(db, "member", password, "member", invite(db));
  db.close();

  const reserve = createServer().listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const origin = "http://localhost:" + port;
  const env = { ...process.env };
  delete env.JARVIS_MODEL_POLICY_FILE;
  const server = spawn(process.execPath, [new URL("../server.mjs", import.meta.url).pathname], {
    env: {
      ...env,
      PORT: String(port),
      JARVIS_ORIGIN: origin,
      JARVIS_STATE: dir,
      JARVIS_GATEWAY_TOKEN_FILE: "",
      JARVIS_GATEWAY_CREATOR: "",
    },
  });
  server.stderr.setEncoding("utf8");
  let startupError = "";
  server.stderr.on("data", (chunk) => {
    startupError += chunk;
  });
  const exit = once(server, "exit");
  t.after(async () => {
    server.kill();
    await exit;
    await rm(dir, { recursive: true, force: true });
  });
  await Promise.race([
    once(server.stdout, "data"),
    exit.then(() => assert.fail("App failed to start: " + startupError)),
  ]);
  const post = (path, body, headers = {}) =>
    fetch(origin + "/api/" + path, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  async function signIn(name) {
    const response = await post("login", { name, password });
    assert.equal(response.status, 200);
    return {
      Cookie: response.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": (await response.json()).csrf,
    };
  }
  const get = (headers) => fetch(origin + "/api/actions", { headers });
  const create = (name) => ({ action: "project.create", input: { name } });
  const name = "پروژهٔ خصوصی";
  assert.equal((await get()).status, 401);
  assert.equal((await post("actions", create(name))).status, 401);
  const member = await signIn("member");
  const creator = await signIn("creator");
  assert.equal((await post("actions", create(name), { Cookie: member.Cookie })).status, 403);
  for (const body of [
    { action: "shell.execute", input: {} },
    { ...create(name), owner: 1 },
    create("س".repeat(121)),
  ]) {
    assert.equal((await post("actions", body, member)).status, 400);
  }
  const created = await post("actions", create(" " + name + " "), member);
  assert.equal(created.status, 200);
  const result = await created.json();
  assert.equal(result.status, "completed");
  assert.equal(result.project.name, name);
  assert.deepEqual(await (await post("actions", create(name), member)).json(), result);
  const other = await (await get(creator)).json();
  assert.deepEqual(other.projects, []);
  assert.deepEqual(
    other.registry.map((entry) => entry.id),
    ["project.create"],
  );
  assert.equal((await post("logout", {}, member)).status, 200);
  assert.equal((await get(member)).status, 401);
  const restored = await signIn("member");
  assert.deepEqual((await (await get(restored)).json()).projects, [result.project]);
  for (let index = 1; index < 50; index++) {
    assert.equal((await post("actions", create(name + index), restored)).status, 200);
  }
  assert.equal((await post("actions", create(name + 50), restored)).status, 409);
  assert.deepEqual(
    (await (await post("actions", create(name), restored)).json()).project,
    result.project,
  );
});

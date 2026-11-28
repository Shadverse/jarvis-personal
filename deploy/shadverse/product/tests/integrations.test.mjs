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

test("local connector enforces scope, account ownership, expiry and revocation", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-integrations-"));
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

  const get = (headers) => fetch(origin + "/api/integrations", { headers });
  const request = (operation, headers, changes) =>
    post(
      "integrations",
      {
        connector: "shadverse-workspace",
        scope: "projects:count",
        operation,
        ...changes,
      },
      headers,
    );
  const inspect = async (headers) => (await (await get(headers)).json()).connectors[0];
  assert.equal((await get()).status, 401);
  const creator = await signIn("creator");
  const member = await signIn("member");
  assert.equal((await request("grant", { Cookie: member.Cookie })).status, 403);
  assert.equal((await request("read", member)).status, 403);
  assert.equal((await request("grant", member, { scope: "projects:write" })).status, 400);
  assert.equal((await request("grant", member, { connector: "github" })).status, 400);
  const catalog = await (await get(member)).json();
  assert.ok(catalog.connectors.slice(1).every(({ status }) => status === "unavailable"));
  const body = { action: "project.create", input: { name: "پروژهٔ عضو" } };
  assert.equal((await post("actions", body, member)).status, 200);
  assert.equal(
    (await post("actions", { ...body, input: { name: "پروژهٔ سازنده" } }, creator)).status,
    200,
  );
  assert.equal((await request("grant", member)).status, 200);
  assert.equal((await inspect(member)).status, "granted");
  assert.equal((await inspect(creator)).status, "not_granted");
  assert.equal((await request("read", creator)).status, 403);
  const count = await (await request("read", member)).json();
  assert.equal(count.projectCount, 1);
  assert.equal(count.connectors[0].usage, 1);
  assert.equal((await request("revoke", member)).status, 200);
  assert.equal((await inspect(member)).status, "revoked");
  assert.equal((await request("read", member)).status, 403);
  assert.equal((await request("grant", member)).status, 200);
  const store = openStore(dir);
  try {
    store
      .prepare(
        "UPDATE workspace_connector_grants SET expires=0 WHERE owner=(SELECT id FROM users WHERE name='member')",
      )
      .run();
  } finally {
    store.close();
  }
  assert.equal((await inspect(member)).status, "expired");
  assert.equal((await request("read", member)).status, 403);
  assert.equal((await inspect(member)).usage, 1);
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addUser, invite, openStore } from "../auth.mjs";

test("device inventory uses fixed OpenClaw calls after exclusive, revocable consent", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-devices-"));
  const runtime = await mkdtemp(join(tmpdir(), "jarvis-inventory-"));
  const db = openStore(dir);
  const password = randomUUID();
  await addUser(db, "creator", password, "creator");
  await addUser(db, "member", password, "member", invite(db));
  await addUser(db, "other", password, "member", invite(db));
  const nodePort = 20484;
  const cli = join(runtime, "openclaw-fixture");
  await writeFile(
    join(runtime, "openclaw.json"),
    JSON.stringify({
      gateway: { port: nodePort, bind: "loopback", mode: "local", auth: { mode: "token" } },
    }),
    { mode: 0o600 },
  );
  await writeFile(
    cli,
    "#!" +
      process.execPath +
      "\n" +
      `
const fs = require("node:fs"), path = require("node:path"), args = process.argv.slice(2);
if (process.env.OPENCLAW_GATEWAY_TOKEN || args.slice(0,2).join(" ") !== "gateway call") process.exit(2);
const id = args.includes("--params") ? JSON.parse(args.at(-1)).nodeId : null;
fs.appendFileSync(path.join(process.env.OPENCLAW_STATE_DIR, "calls"), JSON.stringify([args[2], id])+"\\n");
const first = { nodeId:"desk", platform:"Windows", version:"2026.11", paired:true, connected:true, privateIp:"sensitive", commands:["system.run"] };
const out = args[2] === "node.list" ? { nodes:[first, {...first,nodeId:"ungranted"}] } :
  args[2] === "node.describe" && id === "desk" ? first : null;
if (!out) process.exit(3);
setTimeout(() => console.log(JSON.stringify(out)), id ? 150 : 0);
`,
    { mode: 0o700 },
  );
  const reserve = createServer().listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const origin = "http://localhost:" + port;
  const server = spawn(process.execPath, [new URL("../server.mjs", import.meta.url).pathname], {
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      JARVIS_ORIGIN: origin,
      JARVIS_STATE: dir,
      JARVIS_DEVICES_OPENCLAW: cli,
      JARVIS_DEVICES_STATE: runtime,
      JARVIS_DEVICES_PORT: String(nodePort),
      JARVIS_DEVICES_ADMIN: "creator",
      OPENCLAW_GATEWAY_TOKEN: "must-not-reach-child",
    },
  });
  const exit = once(server, "exit");
  t.after(async () => {
    server.kill();
    await exit;
    db.close();
    await rm(dir, { recursive: true, force: true });
    await rm(runtime, { recursive: true, force: true });
  });
  await Promise.race([once(server.stdout, "data"), exit.then(() => assert.fail("App exited"))]);
  const post = (path, body, headers) =>
    fetch(origin + "/api/" + path, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  const login = async (name) => {
    const response = await post("login", { name, password });
    assert.equal(response.status, 200);
    return {
      Cookie: response.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": (await response.json()).csrf,
    };
  };
  const get = (headers, id = "") => fetch(origin + "/api/devices" + id, { headers });
  const creator = await login("creator"),
    member = await login("member"),
    other = await login("other");
  const command = (operation, headers, fields = {}) =>
    post("devices", { operation, id: "desk", ...fields }, headers);
  const info = { account: "member", label: "رایانهٔ کار", days: 2 };
  assert.equal((await get()).status, 401);
  assert.equal((await command("grant", other, info)).status, 403);
  assert.equal((await command("grant", { Cookie: creator.Cookie }, info)).status, 403);
  assert.equal((await command("grant", creator, info)).status, 200);
  assert.equal((await command("grant", creator, { ...info, account: "other" })).status, 409);
  assert.equal((await get(member, "?id=desk")).status, 404);
  assert.deepEqual((await (await get(member)).json()).nodes, []);
  assert.equal((await command("accept", other)).status, 404);
  await assert.rejects(readFile(join(runtime, "calls")), { code: "ENOENT" });
  assert.equal((await command("accept", member)).status, 200);
  const list = await (await get(member)).json();
  const visible = {
    id: "desk",
    label: info.label,
    connected: true,
    platform: "Windows",
    version: "2026.11",
  };
  assert.deepEqual(list.nodes, [visible]);
  assert.deepEqual((await (await get(other)).json()).grants, []);
  assert.deepEqual((await (await get(member, "?id=desk")).json()).node, visible);
  const race = get(member, "?id=desk");
  for (let attempt = 0; attempt < 50; attempt++) {
    const calls = await readFile(join(runtime, "calls"), "utf8");
    if (calls.trim().split("\n").length === 3) break;
    await new Promise((resolve) => setTimeout(resolve, 4));
  }
  assert.equal((await command("revoke", creator, info)).status, 200);
  assert.equal((await race).status, 404);
  assert.equal((await command("grant", creator, info)).status, 200);
  assert.equal((await command("accept", member)).status, 200);
  db.prepare("UPDATE device_inventory_grants SET expires=1").run();
  assert.equal((await get(member, "?id=desk")).status, 404);
  assert.equal((await command("invoke", member, { command: "system.run" })).status, 400);
  assert.deepEqual(
    (await readFile(join(runtime, "calls"), "utf8")).trim().split("\n").map(JSON.parse),
    [
      ["node.list", null],
      ["node.describe", "desk"],
      ["node.describe", "desk"],
    ],
  );
});

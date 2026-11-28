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

test("private UTF-8 document intake preserves bytes and denies cross-account access", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-documents-"));
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
  const server = spawn(process.execPath, [new URL("../server.mjs", import.meta.url).pathname], {
    env: { ...process.env, PORT: String(port), JARVIS_ORIGIN: origin, JARVIS_STATE: dir },
  });
  const exit = once(server, "exit");
  t.after(async () => {
    server.kill();
    await exit;
    await rm(dir, { recursive: true, force: true });
  });
  await Promise.race([
    once(server.stdout, "data"),
    exit.then(() => assert.fail("App failed to start")),
  ]);
  const post = (path, body, headers = {}) =>
    fetch(origin + path, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  async function signIn(name) {
    const response = await post("/api/login", { name, password });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.userId, undefined);
    return { Cookie: response.headers.get("set-cookie").split(";")[0], "X-CSRF-Token": data.csrf };
  }
  const get = (headers, suffix = "") => fetch(origin + "/api/documents" + suffix, { headers });
  assert.equal((await get({})).status, 401);
  const creator = await signIn("creator");
  const member = await signIn("member");
  const exact = Buffer.from("نام،مقدار\r\nنمونه،۳\r\n", "utf8");
  const upload = { operation: "add", name: "داده.csv", content: exact.toString("base64") };
  assert.equal((await post("/api/documents", upload, { Cookie: member.Cookie })).status, 403);
  assert.equal(
    (await post("/api/documents", { ...upload, name: "../escape.txt" }, member)).status,
    400,
  );
  assert.equal((await post("/api/documents", { ...upload, content: "/w==" }, member)).status, 400);
  const saved = await post("/api/documents", upload, member);
  assert.equal(saved.status, 200);
  const [document] = (await saved.json()).files;
  assert.equal(document.name, "داده.csv");
  assert.equal(document.bytes, exact.length);
  assert.equal(document.payload, undefined);
  assert.deepEqual(await (await get(creator)).json(), { files: [] });
  assert.equal((await get(creator, "?id=" + document.id)).status, 404);
  assert.equal((await get(creator, "?preview=1&id=" + document.id)).status, 404);
  assert.equal(
    (await post("/api/documents", { operation: "delete", id: document.id }, creator)).status,
    404,
  );
  const preview = await get(member, "?preview=1&id=" + document.id);
  assert.deepEqual(await preview.json(), { name: "داده.csv", text: exact.toString("utf8") });
  const downloaded = await get(member, "?id=" + document.id);
  assert.equal(downloaded.headers.get("content-type"), "application/octet-stream");
  assert.match(downloaded.headers.get("content-disposition"), /^attachment;/);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), exact);
  assert.equal(
    (
      await post(
        "/api/documents",
        { ...upload, content: Buffer.alloc(1048577, 0x61).toString("base64") },
        member,
      )
    ).status,
    400,
  );
  assert.deepEqual(
    await (await post("/api/documents", { operation: "delete", id: document.id }, member)).json(),
    { files: [] },
  );
});

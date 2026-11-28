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
import { openMemory } from "../memory.mjs";

test("personal memory persists and export, mutation and deletion stay account-scoped", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-memory-"));
  const db = openStore(dir);
  const password = randomUUID();
  await addUser(db, "creator", password, "creator");
  await addUser(db, "member", password, "member", invite(db));
  const memberId = db.prepare("SELECT id FROM users WHERE name='member'").get().id;
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
  const get = (headers, suffix = "") => fetch(origin + "/api/memory" + suffix, { headers });
  assert.equal((await get({})).status, 401);
  const creator = await signIn("creator");
  const member = await signIn("member");
  assert.equal(
    (await post("/api/memory", { operation: "add", text: "سلام" }, { Cookie: member.Cookie }))
      .status,
    403,
  );
  const saved = await post("/api/memory", { operation: "add", text: " یادداشت فارسی " }, member);
  assert.equal(saved.status, 200);
  const [note] = (await saved.json()).notes;
  assert.equal(note.text, "یادداشت فارسی");
  for (const operation of ["edit", "delete"]) {
    assert.equal(
      (await post("/api/memory", { operation, id: note.id, text: "دیگر" }, creator)).status,
      404,
    );
  }
  assert.deepEqual(await (await get(creator)).json(), { notes: [] });
  assert.equal(
    (await post("/api/memory", { operation: "edit", id: note.id, text: "ویرایش" }, member)).status,
    200,
  );
  assert.equal(
    (await post("/api/memory", { operation: "add", text: "س".repeat(501) }, member)).status,
    400,
  );
  assert.equal((await post("/api/logout", {}, member)).status, 200);
  assert.equal((await get(member)).status, 401);
  const restored = await signIn("member");
  const exported = await get(restored, "?export=1");
  assert.match(
    exported.headers.get("content-disposition"),
    /attachment.*jarvis-personal-memory\.json/,
  );
  const data = await exported.json();
  assert.equal(data.notes[0].text, "ویرایش");
  assert.equal(data.notes[0].owner, undefined);
  const separate = openStore(dir);
  try {
    assert.deepEqual(
      openMemory(separate)
        .list(memberId)
        .map((row) => ({ ...row })),
      data.notes,
    );
  } finally {
    separate.close();
  }
  assert.deepEqual(
    await (await post("/api/memory", { operation: "delete", id: note.id }, restored)).json(),
    { notes: [] },
  );
});

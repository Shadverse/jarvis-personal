import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { addUser, invite, openStore } from "../auth.mjs";

test("private UTF-8 document intake preserves bytes and denies cross-account access", async (t) => {
  const fixtureScript = fileURLToPath(new URL("./document-formats-fixture.py", import.meta.url));
  let python, fixtures;
  try {
    python = execFileSync("python3", ["-I", "-c", "import sys; print(sys.executable)"], {
      encoding: "utf8",
    }).trim();
    fixtures = JSON.parse(
      execFileSync(python, ["-I", "-B", fixtureScript, "fixtures"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    t.diagnostic("Optional office/PDF fixture dependencies are unavailable; testing UTF-8 only.");
  }
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
    env: {
      ...process.env,
      PORT: String(port),
      JARVIS_ORIGIN: origin,
      JARVIS_STATE: dir,
      JARVIS_DOCUMENT_PYTHON: fixtures ? python : "",
    },
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
  assert.deepEqual((await (await get(creator)).json()).files, []);
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
  const uploadBytes = async (name, content) => {
    const response = await post("/api/documents", { operation: "add", name, content }, member);
    assert.equal(response.status, 200, response.status === 200 ? name : await response.text());
    return (await response.json()).files.find((item) => item.name === name).id;
  };
  const csv = await uploadBytes(
    "آزمون.csv",
    Buffer.from("نام,مبلغ\nاوریون,۱۲\n=1+2,18").toString("base64"),
  );
  const analyze = (ids, question, headers = member) =>
    post(
      "/api/documents",
      {
        operation: "analyze",
        ids,
        question,
      },
      headers,
    );
  const data = await analyze([csv], "اوریون");
  const [summary] = (await data.json()).result;
  assert.equal(summary.passages[0].label, "CSV · 2");
  assert.deepEqual(summary.tables[0].columns, [
    { label: "مبلغ", count: 2, total: 30, min: 12, max: 18 },
  ]);
  assert.equal((await analyze([csv], "اوریون", creator)).status, 404);
  if (fixtures) {
    const ids = {};
    for (const format of ["pdf", "docx", "xlsx", "pptx", "png"])
      ids[format] = await uploadBytes("sample." + format, fixtures[format]);
    for (const [format, question, expected] of [
      ["pdf", "Orion", "Orion invoice 2048"],
      ["docx", "اوریون", "شیوهٔ آزمون"],
      ["pptx", "اوریون", "اسلاید اوریون"],
    ]) {
      const response = await analyze([ids[format]], question);
      assert.equal(response.status, 200);
      assert.ok((await response.json()).result[0].passages[0].text.includes(expected));
    }
    const compared = await analyze([csv, ids.xlsx], "اوریون");
    assert.deepEqual(
      (await compared.json()).result.map((source) => source.tables[0].columns[0].total),
      [30, 30],
    );
    const photo = await get(member, "?preview=1&id=" + ids.png);
    assert.deepEqual((await photo.json()).image, { width: 13, height: 7 });
    assert.equal(
      (
        await post(
          "/api/documents",
          { operation: "add", name: "blocked.docx", content: fixtures.bad },
          member,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          "/api/documents",
          { operation: "add", name: "spoof.png", content: fixtures.pdf },
          member,
        )
      ).status,
      400,
    );
    assert.equal((await get(creator, "?report=pdf&id=" + csv)).status, 404);
    const artifacts = {};
    for (const format of ["pdf", "docx", "xlsx", "pptx"]) {
      const response = await get(member, "?report=" + format + "&id=" + csv);
      assert.equal(response.status, 200, format);
      assert.match(
        response.headers.get("content-disposition"),
        new RegExp("jarvis-report\\." + format),
      );
      artifacts[format] = Buffer.from(await response.arrayBuffer()).toString("base64");
    }
    execFileSync(python, ["-I", "-B", fixtureScript, "verify"], {
      input: JSON.stringify(artifacts),
    });
  }
});

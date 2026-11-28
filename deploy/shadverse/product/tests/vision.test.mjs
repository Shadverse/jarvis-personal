import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crc32, deflateSync } from "node:zlib";
import { addUser, invite, openStore } from "../auth.mjs";
import { openVision } from "../vision.mjs";

function chunk(type, data) {
  const item = Buffer.alloc(12 + data.length);
  item.writeUInt32BE(data.length);
  item.write(type, 4);
  data.copy(item, 8);
  item.writeUInt32BE(crc32(item.subarray(4, -4)), item.length - 4);
  return item;
}

function png(color, metadata = true) {
  const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    ...(metadata ? [chunk("tEXt", Buffer.from("Comment\0private metadata"))] : []),
    chunk("IDAT", deflateSync(Buffer.from([0, color, 0, 0]))),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

test("restricted vision admission, image forwarding and usage through the authenticated server", async (t) => {
  const state = await mkdtemp(join(tmpdir(), "jarvis-vision-"));
  t.after(() => rm(state, { recursive: true, force: true }));
  const db = openStore(state);
  t.after(() => db.close());
  const password = randomUUID(),
    creatorToken = randomUUID(),
    visionToken = randomUUID();
  await addUser(db, "creator", password, "creator");
  await addUser(db, "member", password, "member", invite(db));
  const put = async (name, value) => {
    const path = join(state, name);
    await writeFile(path, typeof value === "string" ? value : JSON.stringify(value), {
      mode: 0o600,
    });
    return path;
  };
  const requests = [];
  let slow = false,
    canceled = false;
  const upstream = createServer(async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    requests.push({ headers: req.headers, body: JSON.parse(Buffer.concat(parts)) });
    if (slow) {
      res.on("close", () => {
        canceled = true;
      });
      return;
    }
    res.end(
      JSON.stringify({
        status: "completed",
        usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 },
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "پاسخ آزمایشی" }],
          },
        ],
      }),
    );
  }).listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => new Promise((resolve) => upstream.close(resolve)));
  const visionPort = upstream.address().port;
  const config = JSON.stringify({
    gateway: {
      port: visionPort,
      bind: "loopback",
      auth: { mode: "token" },
      http: { endpoints: { responses: { enabled: true } } },
    },
    agents: { list: [{ id: "vision" }] },
    tools: { deny: ["*"] },
  });
  const approved = {
    authentication: true,
    eligibility: true,
    noCharge: true,
    gatewayFallbacksDisabled: true,
  };
  const modelPolicyFile = await put("models.json", {
    dailyTokens: 2000,
    dailySpendMicros: 0,
    catalog: {
      models: [
        { key: "local/text", input: "text", contextWindow: 1000, available: true },
        { key: "local/image", input: "text+image", contextWindow: 1000, available: true },
        { key: "local/paid", input: "text+image", contextWindow: 1000, available: true },
      ],
    },
    routes: ["text", "image", "paid"].map((id) => ({
      id,
      model: "local/" + id,
      authentication: "local",
      languages: ["fa"],
      priority: id === "image" ? 10 : 0,
      cost: id === "paid" ? "paid" : "free",
      tasks: ["chat"],
      maxOutputTokens: 100,
      verification: approved,
    })),
  });
  const reserve = createServer().listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const productPort = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const origin = "http://localhost:" + productPort;
  const admission = {
    port: visionPort,
    tokenFile: await put("vision-token", visionToken),
    configFile: await put("vision-config", config),
    configSha256: createHash("sha256").update(config).digest("hex"),
    expires: Date.now() + 100_000,
    modelPolicyFile,
    evidence: {
      phaseAPreflight: true,
      privateIngress: true,
      effectiveDenyAllTools: true,
      noPaidFallbacks: true,
      noCostRoute: true,
      privateRetention: true,
      imageContinuity: true,
    },
  };
  const creator = { port: 16000, token: creatorToken, creator: "creator" };
  await assert.rejects(
    openVision(
      db,
      creator,
      productPort,
      await put("bad-admission", { ...admission, port: creator.port }),
    ),
    /Invalid restricted vision admission/,
  );
  const server = spawn(process.execPath, [new URL("../server.mjs", import.meta.url).pathname], {
    env: {
      PATH: process.env.PATH,
      PORT: String(productPort),
      JARVIS_ORIGIN: origin,
      JARVIS_STATE: state,
      JARVIS_GATEWAY_PORT: String(creator.port),
      JARVIS_GATEWAY_CREATOR: creator.creator,
      JARVIS_GATEWAY_TOKEN_FILE: await put("creator-token", creatorToken),
      JARVIS_VISION_ADMISSION_FILE: await put("admission", admission),
    },
  });
  const exit = once(server, "exit");
  t.after(async () => {
    server.kill();
    await exit;
  });
  await Promise.race([
    once(server.stdout, "data"),
    exit.then(() => assert.fail("Server did not start")),
  ]);
  const post = (path, body, headers, signal) =>
    fetch(origin + "/api/" + path, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal,
    });
  const login = async (name) => {
    const response = await post("login", { name, password });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(!JSON.stringify(data).includes(visionToken));
    return { Cookie: response.headers.get("set-cookie").split(";")[0], "X-CSRF-Token": data.csrf };
  };
  const ask = (body, headers, signal) =>
    post("vision", { message: "این چیست؟", ...body }, headers, signal);
  const account = await login("creator");
  const member = await login("member");
  assert.equal((await ask({ image: png(1) })).status, 401);
  assert.equal((await ask({ image: png(1) }, member)).status, 403);
  assert.equal((await ask({ image: png(1) }, { Cookie: account.Cookie })).status, 403);
  assert.equal((await ask({ image: "AAAA" }, account)).status, 400);
  const first = await ask({ image: png(1) }, account);
  assert.equal(first.status, 200);
  const { context, reply } = await first.json();
  assert.equal(reply, "پاسخ آزمایشی");
  assert.equal(requests[0].headers.authorization, "Bearer " + visionToken);
  assert.equal(requests[0].headers["x-openclaw-model"], "local/image");
  assert.equal(requests[0].body.model, "openclaw/vision");
  assert.deepEqual(requests[0].body.input[0].content[1].source, {
    type: "base64",
    media_type: "image/png",
    data: png(1, false),
  });
  assert.equal((await ask({ context }, await login("creator"))).status, 409);
  assert.equal((await ask({ context, image: png(2) }, account)).status, 409);
  assert.equal((await ask({ context }, account)).status, 200);
  assert.equal(requests[0].body.user, requests[1].body.user);
  assert.equal(requests[1].body.input[0].content.length, 1);
  assert.equal((await post("vision", { clear: true }, account)).status, 200);
  assert.equal((await ask({ context }, account)).status, 409);
  slow = true;
  const control = new AbortController();
  const pending = ask({ image: png(1) }, account, control.signal);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  for (let tries = 0; tries < 100 && requests.length !== 3; tries++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requests.length, 3);
  control.abort();
  await rejected;
  for (let tries = 0; tries < 100 && !canceled; tries++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(canceled, true);
  const usage = db.prepare("SELECT total,status FROM model_attempts ORDER BY rowid").all();
  assert.deepEqual(
    usage.map(({ total, status }) => [total, status]),
    [
      [7, "completed"],
      [7, "completed"],
      [null, "uncertain"],
    ],
  );
  assert.equal(requests.length, 3);
});

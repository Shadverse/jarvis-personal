import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addUser, invite, openStore } from "../auth.mjs";

test("private managed routing admits only eligible routes and reserves ambiguous usage", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-models-"));
  const db = openStore(dir);
  const token = randomBytes(32).toString("hex");
  const password = randomUUID();
  await addUser(db, "creator", password, "creator");
  await addUser(db, "member", password, "member", invite(db));
  const tokenFile = join(dir, "token");
  const policyFile = join(dir, "models.json");
  await writeFile(tokenFile, token, { mode: 0o600 });
  const verification = {
    authentication: true,
    eligibility: true,
    noCharge: true,
    gatewayFallbacksDisabled: true,
  };
  const rows = [
    ["translation", "local/translate", ["translation"], ["fa"], "free", verification],
    ["general", "local/general", ["chat"], ["fa", "en"], "free", verification],
    ["backup", "local/backup", ["chat"], ["fa"], "free", verification],
    ["paid", "platform/paid", ["chat"], ["fa"], "paid", verification],
    ["unverified", "local/pending", ["chat"], ["fa"], "free", {}],
  ];
  await writeFile(
    policyFile,
    JSON.stringify({
      dailyTokens: 1500,
      dailySpendMicros: 0,
      catalog: {
        models: rows.map(([, key]) => ({
          key,
          input: "text",
          contextWindow: 1024,
          available: true,
        })),
      },
      routes: rows.map(([id, model, tasks, languages, cost, verification], priority) => ({
        id,
        model,
        tasks,
        languages,
        cost,
        verification,
        priority,
        maxOutputTokens: 128,
        authentication: "local",
      })),
    }),
    { mode: 0o600 },
  );
  const requests = [];
  let unavailable = false;
  const gateway = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({
      model: req.headers["x-openclaw-model"],
      auth: req.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks)),
    });
    res.setHeader("Content-Type", "application/json");
    if (requests.at(-1).model === "local/translate") {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          error: {
            type: "invalid_request_error",
            message: "Model 'local/translate' is not allowed for agent 'main'.",
          },
        }),
      );
    } else if (unavailable) {
      res.statusCode = 502;
      res.end("{}");
    } else {
      res.end(
        JSON.stringify({
          status: "completed",
          usage: { input_tokens: 24, output_tokens: 8, total_tokens: 32 },
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "پاسخ" }],
            },
          ],
        }),
      );
    }
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
      JARVIS_GATEWAY_TOKEN_FILE: tokenFile,
      JARVIS_GATEWAY_PORT: String(gateway.address().port),
      JARVIS_MODEL_POLICY_FILE: policyFile,
    },
  });
  const exit = once(server, "exit");
  t.after(async () => {
    server.kill();
    await exit;
    await new Promise((resolve) => gateway.close(resolve));
    db.close();
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
    const result = await post("/api/login", { name, password });
    assert.equal(result.status, 200);
    return {
      Cookie: result.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": (await result.json()).csrf,
    };
  }
  const get = (path, headers) => fetch(origin + path, { headers });
  const member = await signIn("member");
  const creator = await signIn("creator");
  assert.equal((await get("/api/models", member)).status, 403);
  assert.equal((await post("/api/models", { id: "general", paused: true }, member)).status, 403);
  assert.equal(
    (await post("/api/models", { id: "general", paused: true }, { Cookie: creator.Cookie })).status,
    403,
  );
  assert.equal((await post("/api/models", { id: "paid", paused: false }, creator)).status, 400);
  assert.equal(
    (await post("/api/models", { id: "unverified", paused: false }, creator)).status,
    400,
  );

  const chat = (message) =>
    post(
      "/api/chat",
      { message, model: "platform/paid" },
      { ...creator, "x-openclaw-model": "platform/paid" },
    );
  const translated = await chat("ترجمه: سلام");
  assert.equal((await translated.json()).reply, "پاسخ");
  assert.deepEqual(
    requests.map((item) => item.model),
    ["local/translate", "local/general"],
  );
  assert.ok(
    requests.every(
      (item) =>
        item.auth === "Bearer " + token &&
        item.body.user === "shadverse-creator:creator" &&
        item.body.max_output_tokens === 128,
    ),
  );
  for (const id of ["general", "backup"]) {
    assert.equal((await post("/api/models", { id, paused: true }, creator)).status, 200);
  }
  const blocked = await chat("سلام");
  assert.deepEqual(await blocked.json(), { error: "no_model" });
  assert.equal(requests.length, 2);
  assert.equal((await post("/api/models", { id: "general", paused: false }, creator)).status, 200);
  unavailable = true;
  assert.equal((await chat("سلام")).status, 502);
  assert.equal(requests.length, 3);
  assert.equal((await post("/api/models", { id: "backup", paused: false }, creator)).status, 200);
  const capped = await chat("سلام");
  assert.equal(capped.status, 429);
  assert.deepEqual(await capped.json(), { error: "token_budget" });
  assert.equal(requests.length, 3);
  const result = await get("/api/models", creator);
  const metadata = await result.text();
  assert.ok(!metadata.includes(token) && !metadata.includes("ترجمه: سلام"));
  assert.deepEqual(JSON.parse(metadata).usage, {
    chargedTokens: 1184,
    measuredTokens: 32,
    attempts: 3,
    unmeasured: 1,
  });
});

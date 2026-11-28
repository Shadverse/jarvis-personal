import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { addUser, invite, openStore } from "../auth.mjs";

test(
  "The application session is the only browser admission to the private Creator assistant",
  { timeout: 30000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "jarvis-assistant-"));
    const db = openStore(dir);
    const token = randomBytes(150).toString("hex");
    const tokenFile = join(dir, "gateway-token");
    await writeFile(tokenFile, token, { mode: 0o600 });
    const password = randomUUID();
    for (const [name, role] of [
      ["creator", "creator"],
      ["other-creator", "creator"],
      ["member", "member"],
    ]) {
      if (role === "member") {
        assert.ok(await addUser(db, name, password, role, invite(db)));
      } else assert.ok(await addUser(db, name, password, role));
    }
    const requests = [];
    let failUpstream = false;
    let denyAnonymous = true;
    const gateway = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      requests.push({
        path: req.url,
        headers: req.headers,
        body: JSON.parse(Buffer.concat(chunks)),
      });
      res.setHeader("Content-Type", "application/json");
      if (!Object.hasOwn(requests.at(-1).body, "input")) {
        if (!req.headers.authorization && denyAnonymous) {
          res.statusCode = 401;
          res.end("{}");
        } else if (req.headers.authorization && req.headers.authorization !== "Bearer " + token) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: token }));
        } else {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: { type: "invalid_request_error" } }));
        }
      } else if (failUpstream) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: token }));
      } else {
        res.end(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: "پاسخ آزمایشی" }],
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
    const env = {
      ...process.env,
      PORT: String(port),
      JARVIS_STATE: dir,
      JARVIS_ORIGIN: origin,
      JARVIS_GATEWAY_TOKEN_FILE: tokenFile,
      JARVIS_GATEWAY_PORT: String(gateway.address().port),
      JARVIS_GATEWAY_CREATOR: "creator",
      NODE_USE_ENV_PROXY: "1",
      HTTP_PROXY: "http://127.0.0.1:1",
      NO_PROXY: "",
      http_proxy: "http://127.0.0.1:1",
      no_proxy: "",
    };
    const server = spawn(process.execPath, [new URL("../server.mjs", import.meta.url).pathname], {
      env,
    });
    const exit = once(server, "exit");
    t.after(async () => {
      server.kill();
      await exit;
      gateway.close();
      db.close();
      await rm(dir, { recursive: true, force: true });
    });
    await Promise.race([
      once(server.stdout, "data"),
      exit.then(() => {
        throw Error("Application exited");
      }),
    ]);
    const post = (route, body, headers = {}) =>
      fetch(origin + route, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    const authorize = async (name) => {
      const response = await post("/api/login", { name, password });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("www-authenticate"), null);
      const data = await response.json();
      assert.equal(data.controlUI, undefined);
      assert.ok(!JSON.stringify(data).includes(token));
      return {
        data,
        headers: {
          Cookie: response.headers.get("set-cookie").split(";")[0],
          "X-CSRF-Token": data.csrf,
        },
      };
    };
    const body = {
      message: "سلام",
      model: "untrusted",
      user: "untrusted",
      tools: [{ type: "test" }],
    };
    const history = (headers, query = "") =>
      fetch(origin + "/api/conversation" + query, { headers });
    assert.equal((await post("/api/chat", body)).status, 401);
    assert.equal((await history()).status, 401);
    for (const name of ["member", "other-creator"]) {
      const { data, headers } = await authorize(name);
      assert.equal(data.chatAvailable, false);
      assert.equal((await post("/api/chat", body, headers)).status, 403);
    }
    const { data, headers } = await authorize("creator");
    assert.equal(data.chatAvailable, true);
    assert.equal(
      (await post("/api/chat", body, { ...headers, Origin: "https://other.invalid" })).status,
      403,
    );
    assert.equal((await post("/api/chat", body, { ...headers, "X-CSRF-Token": "" })).status, 403);
    assert.equal((await post("/api/chat", { message: " " }, headers)).status, 400);
    assert.equal((await post("/api/chat", { message: token }, headers)).status, 400);
    assert.equal(requests.length, 0);
    const response = await post("/api/chat", body, {
      ...headers,
      Authorization: "Basic unused",
      "x-openclaw-model": "untrusted",
    });
    assert.equal(response.status, 200);
    const completed = await response.json();
    assert.equal(completed.reply, "پاسخ آزمایشی");
    assert.equal(completed.turn.message, "سلام");
    assert.equal(completed.turn.reply, completed.reply);
    assert.equal(completed.turn.owner, undefined);
    assert.ok(!JSON.stringify(completed).includes(token));
    assert.equal(requests[0].path, "/v1/responses");
    assert.equal(requests[0].headers.authorization, "Bearer " + token);
    assert.equal(requests[0].headers.cookie, undefined);
    assert.equal(requests[0].headers["x-openclaw-model"], undefined);
    assert.deepEqual(requests[0].body, {
      model: "openclaw:main",
      user: "shadverse-creator:creator",
      input: "سلام",
      max_output_tokens: 2048,
    });
    failUpstream = true;
    const rejected = await post("/api/chat", body, headers);
    assert.equal(rejected.status, 502);
    assert.equal(rejected.headers.get("www-authenticate"), null);
    assert.deepEqual(await rejected.json(), { error: "gateway" });
    assert.equal((await post("/api/logout", {}, headers)).status, 200);
    assert.equal((await post("/api/chat", body, headers)).status, 401);
    assert.equal((await post("/v1/responses", body, headers)).status, 405);
    assert.equal(requests.length, 2);

    failUpstream = false;
    const restored = await authorize("creator");
    assert.notEqual(restored.headers.Cookie, headers.Cookie);
    assert.deepEqual(await (await history(restored.headers)).json(), {
      turns: [completed.turn],
      before: null,
    });
    const memberHistory = await history((await authorize("member")).headers);
    assert.equal(memberHistory.status, 403);
    const other = (await authorize("other-creator")).headers;
    assert.deepEqual(await (await history(other, "?before=999")).json(), {
      turns: [],
      before: null,
    });
    const followUp = await post("/api/chat", { message: "پیام دوم" }, restored.headers);
    assert.equal(followUp.status, 200);
    assert.equal(requests[2].body.input, "پیام دوم");
    assert.equal(requests[2].body.user, requests[0].body.user);
    const stored = await (await history(restored.headers)).json();
    assert.deepEqual(
      stored.turns.map(({ message }) => message),
      ["سلام", "پیام دوم"],
    );
    assert.deepEqual(
      (await (await history(restored.headers, "?before=" + stored.turns[1].id)).json()).turns,
      [completed.turn],
    );

    const check = (overrides = {}) =>
      promisify(execFile)(
        process.execPath,
        [new URL("../manage.mjs", import.meta.url).pathname, "check-gateway"],
        { env: { ...env, JARVIS_STATE: "", ...overrides } },
      );
    const diagnostic = await check();
    assert.deepEqual(JSON.parse(diagnostic.stdout), { status: "ready_for_live_review" });
    assert.deepEqual(
      requests.slice(3).map(({ headers, body }) => [headers.authorization, body]),
      [
        [undefined, {}],
        ["Bearer " + token, {}],
      ],
    );
    denyAnonymous = false;
    await assert.rejects(check(), (err) => {
      assert.equal(err.code, 1);
      assert.deepEqual(JSON.parse(err.stdout), { status: "unexpected_anonymous_status" });
      assert.ok(!err.stdout.includes(token));
      return true;
    });
    assert.equal(requests.length, 6);
    assert.equal(requests[5].headers.authorization, undefined);

    denyAnonymous = true;
    const invalidTokenFile = join(dir, "invalid-gateway-token");
    await writeFile(invalidTokenFile, randomBytes(32).toString("hex"), { mode: 0o600 });
    await assert.rejects(check({ JARVIS_GATEWAY_TOKEN_FILE: invalidTokenFile }), (err) => {
      assert.equal(err.code, 1);
      assert.deepEqual(JSON.parse(err.stdout), { status: "credential_rejected" });
      assert.ok(!err.stdout.includes(token));
      return true;
    });
    assert.deepEqual(
      requests.slice(6).map((item) => item.body),
      [{}, {}],
    );
  },
);

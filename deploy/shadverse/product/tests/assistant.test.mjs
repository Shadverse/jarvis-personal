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

test(
  "The application session is the only browser admission to the private Creator assistant",
  { timeout: 30000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "jarvis-assistant-"));
    const db = openStore(dir);
    const token = randomBytes(32).toString("hex");
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
    const gateway = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      requests.push({
        path: req.url,
        headers: req.headers,
        body: JSON.parse(Buffer.concat(chunks)),
      });
      res.setHeader("Content-Type", "application/json");
      if (failUpstream) {
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
    const server = spawn(process.execPath, [new URL("../server.mjs", import.meta.url).pathname], {
      env: {
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
      },
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
    assert.equal((await post("/api/chat", body)).status, 401);
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
    assert.equal(requests.length, 0);
    const response = await post("/api/chat", body, {
      ...headers,
      Authorization: "Basic unused",
      "x-openclaw-model": "untrusted",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reply: "پاسخ آزمایشی" });
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
  },
);

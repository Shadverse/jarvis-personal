import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addUser, invite, openStore } from "../auth.mjs";
import { openResearch } from "../research.mjs";

test("Creator research invokes only approved read tools and keeps sources session-bound", async (t) => {
  const state = await mkdtemp(join(tmpdir(), "jarvis-research-"));
  const token = randomUUID(),
    mainToken = randomUUID(),
    password = randomUUID();
  const db = openStore(state);
  await addUser(db, "creator", password, "creator");
  await addUser(db, "member", password, "member", invite(db));
  db.close();
  const requests = [];
  let provider = "approved-fixture";
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    requests.push({ path: request.url, authorization: request.headers.authorization, body });
    const details =
      body.tool === "web_search"
        ? {
            kind: "results",
            provider,
            results: [
              {
                url: "https://example.org/reference#section",
                title: "مرجع آزمایشی",
                snippet: "گزیدهٔ ساختگی",
              },
              { url: "http://example.org/unencrypted", title: "Reject" },
              { url: "https://127.0.0.1/private", title: "Reject" },
              { url: "https://example.org/reference", title: "Duplicate" },
              { url: "https://example.net/second", title: "Second" },
            ],
            externalContent: { untrusted: true, wrapped: true, source: "web_search" },
          }
        : {
            status: 200,
            finalUrl: "https://example.org/reference",
            text: "<script>literal source</script>",
            truncated: true,
            externalContent: { untrusted: true, wrapped: true, source: "web_fetch" },
          };
    response.end(JSON.stringify({ ok: true, result: { details } }));
  }).listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = "http://localhost:" + port;
  const put = async (name, value) => {
    const path = join(state, name);
    await writeFile(path, value, { mode: 0o600 });
    return path;
  };
  const main = { port: 18080, token: mainToken };
  assert.equal(await openResearch(main, port, ""), null);
  const snapshot = JSON.stringify({
    gateway: { port: upstream.address().port, bind: "loopback", auth: { mode: "token" } },
    agents: { list: [{ id: "research" }] },
    tools: { allow: ["web_search", "web_fetch"] },
  });
  const config = {
    configFile: await put("runtime.json", snapshot),
    configSha256: createHash("sha256").update(snapshot).digest("hex"),
    port: upstream.address().port,
    tokenFile: await put("research.token", token),
    provider,
    expires: Date.now() + 60_000,
    evidence: {
      officialAuth: true,
      zeroMarginalCost: true,
      noPaidFallbacks: true,
      restrictedRuntime: true,
      privateIngress: true,
    },
  };
  await assert.rejects(
    openResearch(
      main,
      port,
      await put(
        "bad.json",
        JSON.stringify({ ...config, evidence: { ...config.evidence, zeroMarginalCost: false } }),
      ),
    ),
    /Invalid research admission/,
  );
  const server = spawn(process.execPath, [new URL("../server.mjs", import.meta.url).pathname], {
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      JARVIS_ORIGIN: origin,
      JARVIS_STATE: state,
      JARVIS_GATEWAY_CREATOR: "creator",
      JARVIS_GATEWAY_PORT: String(main.port),
      JARVIS_GATEWAY_TOKEN_FILE: await put("main.token", mainToken),
      JARVIS_RESEARCH_POLICY_FILE: await put("research.json", JSON.stringify(config)),
    },
  });
  const exit = once(server, "exit");
  t.after(async () => {
    server.kill();
    await exit;
    await new Promise((resolve) => upstream.close(resolve));
    await rm(state, { recursive: true, force: true });
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
    const data = await response.json();
    assert.equal(data.research, name === "creator");
    assert.ok(!JSON.stringify(data).includes(token));
    return { Cookie: response.headers.get("set-cookie").split(";")[0], "X-CSRF-Token": data.csrf };
  };
  const creator = await login("creator");
  const member = await login("member");
  const search = { operation: "search", query: "راهنمای آزمایشی" };
  assert.equal((await post("research", search)).status, 401);
  assert.equal((await post("research", search, member)).status, 403);
  assert.equal((await post("research", { ...search, tool: "browser" }, creator)).status, 400);
  assert.equal((await post("research", { ...search, query: token }, creator)).status, 400);
  assert.equal(requests.length, 0);
  const found = await post("research", search, creator);
  assert.equal(found.status, 200);
  const { sources, checkedAt } = await found.json();
  assert.ok(checkedAt > 0);
  assert.deepEqual(
    sources.map(({ url }) => url),
    ["https://example.org/reference", "https://example.net/second"],
  );
  const read = { operation: "read", id: sources[0].id };
  assert.equal((await post("research", read, await login("creator"))).status, 404);
  assert.equal(
    (await post("research", { ...read, url: "https://example.com" }, creator)).status,
    400,
  );
  const result = await post("research", read, creator);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).source.excerpt, "<script>literal source</script>");
  assert.equal((await post("research", read, creator)).status, 200);
  assert.deepEqual(
    requests.map(({ path, authorization, body }) => [path, authorization, body]),
    [
      [
        "/tools/invoke",
        "Bearer " + token,
        { tool: "web_search", agentId: "research", args: { query: search.query, count: 4 } },
      ],
      [
        "/tools/invoke",
        "Bearer " + token,
        {
          tool: "web_fetch",
          agentId: "research",
          args: { url: sources[0].url, maxChars: 6000, extractMode: "text" },
        },
      ],
    ],
  );
  provider = "unapproved-fixture";
  assert.equal((await post("research", search, creator)).status, 502);
  await writeFile(config.configFile, snapshot + "\n");
  assert.equal((await post("research", search, creator)).status, 503);
  assert.equal(requests.length, 3);
});

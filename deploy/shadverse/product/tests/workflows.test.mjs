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

test("private scheduled summaries recover on restart, recur and honor cancellation", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-workflows-"));
  const db = openStore(dir);
  const password = randomUUID();
  await addUser(db, "creator", password, "creator");
  await addUser(db, "member", password, "member", invite(db));
  const reserve = createServer().listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const origin = "http://localhost:" + port;
  let processOwner;
  async function start() {
    const child = spawn(process.execPath, [new URL("../server.mjs", import.meta.url).pathname], {
      env: { PATH: process.env.PATH, PORT: String(port), JARVIS_ORIGIN: origin, JARVIS_STATE: dir },
    });
    const exit = once(child, "exit");
    processOwner = { child, exit };
    await Promise.race([once(child.stdout, "data"), exit.then(() => assert.fail("App exited"))]);
  }
  async function stop() {
    if (!processOwner) return;
    const { child, exit } = processOwner;
    processOwner = undefined;
    child.kill();
    await exit;
  }
  t.after(async () => {
    await stop();
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  await start();
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
    return { Cookie: response.headers.get("set-cookie").split(";")[0], "X-CSRF-Token": data.csrf };
  };
  const get = (headers) => fetch(origin + "/api/workflows", { headers });
  const member = await login("member");
  const creator = await login("creator");
  assert.equal((await get()).status, 401);
  const project = await post(
    "actions",
    { action: "project.create", input: { name: "خلاصهٔ پروژه" } },
    member,
  );
  const { id: projectId } = (await project.json()).project;
  const task = await post(
    "actions",
    { action: "task.create", input: { projectId, title: "گزارش" } },
    member,
  );
  const taskId = (await task.json()).tasks[0].id;
  assert.equal(
    (
      await post(
        "actions",
        { action: "task.setCompleted", input: { projectId, taskId, completed: true } },
        member,
      )
    ).status,
    200,
  );
  const schedule = {
    operation: "schedule",
    cadence: "daily",
    notify: true,
    projectId,
    due: Date.now() + 60_000,
  };
  assert.equal((await post("workflows", schedule, creator)).status, 404);
  assert.equal((await post("workflows", schedule, { Cookie: member.Cookie })).status, 403);
  const submit = await post("workflows", schedule, member);
  assert.equal(submit.status, 200);
  const [daily] = (await submit.json()).workflows;
  const onceJob = await post("workflows", { ...schedule, cadence: "once", notify: false }, member);
  assert.equal(onceJob.status, 200);
  const { id: single } = (await onceJob.json()).workflows.find(({ cadence }) => cadence === "once");
  assert.deepEqual((await (await get(creator)).json()).workflows, []);
  assert.equal(
    (await post("workflows", { operation: "cancel", id: daily.id }, creator)).status,
    404,
  );
  assert.equal((await post("workflows", { operation: "pause", paused: true }, member)).status, 200);
  await stop();
  const date = Date.now() - 60_000;
  db.prepare("UPDATE workspace_workflows SET next_due=?").run(date);
  await start();
  const held = await (await get(member)).json();
  assert.equal(held.paused, true);
  assert.equal(held.workflows[0].result, null);
  assert.equal(
    (await post("workflows", { operation: "pause", paused: false }, member)).status,
    200,
  );
  await stop();
  await start();
  const performed = (await (await get(member)).json()).workflows;
  assert.deepEqual(
    performed.map(({ result }) => result),
    [
      { total: 1, completed: 1 },
      { total: 1, completed: 1 },
    ],
  );
  assert.equal(performed.find(({ id }) => id === single).status, "completed");
  const next = performed.find(({ id }) => id === daily.id);
  assert.equal(next.nextDue, date + 86_400_000);
  const inbox = (await (await get(member)).json()).notifications;
  assert.equal(inbox.length, 1);
  assert.deepEqual(inbox[0].result, { total: 1, completed: 1 });
  assert.deepEqual((await (await get(creator)).json()).notifications, []);
  const seen = { operation: "acknowledge", id: inbox[0].id };
  assert.equal((await post("workflows", seen, creator)).status, 404);
  assert.equal((await post("workflows", seen, member)).status, 200);
  const seenAt = db.prepare("SELECT acknowledged FROM workspace_notifications WHERE id=?");
  const originalSeen = seenAt.get(seen.id).acknowledged;
  assert.ok(originalSeen > 0);
  assert.equal((await post("workflows", seen, member)).status, 200);
  assert.equal(seenAt.get(seen.id).acknowledged, originalSeen);

  assert.equal(
    (await post("workflows", { operation: "cancel", id: daily.id }, member)).status,
    200,
  );
  await stop();
  await start();
  const final = (await (await get(member)).json()).workflows.find(({ id }) => id === daily.id);
  assert.equal(final.status, "canceled");
  assert.equal(final.lastRun, next.lastRun);
  const createTask = async (title) => {
    const response = await post(
      "actions",
      { action: "task.create", input: { projectId, title } },
      member,
    );
    assert.equal(response.status, 200);
    return (await response.json()).tasks.find((task) => task.title === title).id;
  };
  const follow = await createTask("پیگیری واقعی");
  const skip = await createTask("پیگیری انجام شده");
  for (const id of [follow, skip]) {
    assert.equal(
      (await post("workflows", { ...schedule, cadence: "once", taskId: id, notify: false }, member))
        .status,
      200,
    );
  }
  assert.equal(
    (
      await post(
        "actions",
        { action: "task.setCompleted", input: { projectId, taskId: skip, completed: true } },
        member,
      )
    ).status,
    200,
  );
  await stop();
  db.prepare("UPDATE workspace_workflows SET next_due=? WHERE status='scheduled'").run(date);
  await start();
  const alerts = (await (await get(member)).json()).notifications;
  assert.deepEqual(
    alerts.map(({ result }) => result),
    [{ task: "پیگیری واقعی" }],
  );
  await stop();
  await start();
  assert.deepEqual((await (await get(member)).json()).notifications, alerts);
  assert.equal((await post("workflows", { operation: "clearCompleted" }, member)).status, 200);
  assert.equal(seenAt.get(seen.id), undefined);
  assert.deepEqual((await (await get(member)).json()).notifications, alerts);
});

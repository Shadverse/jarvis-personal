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

test("private projects, tasks and reminders enforce explicit actions, quotas, and ownership", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-actions-"));
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
  const env = { ...process.env };
  delete env.JARVIS_MODEL_POLICY_FILE;
  const server = spawn(process.execPath, [new URL("../server.mjs", import.meta.url).pathname], {
    env: {
      ...env,
      PORT: String(port),
      JARVIS_ORIGIN: origin,
      JARVIS_STATE: dir,
      JARVIS_GATEWAY_TOKEN_FILE: "",
      JARVIS_GATEWAY_CREATOR: "",
    },
  });
  server.stderr.setEncoding("utf8");
  let startupError = "";
  server.stderr.on("data", (chunk) => {
    startupError += chunk;
  });
  const exit = once(server, "exit");
  t.after(async () => {
    server.kill();
    await exit;
    await rm(dir, { recursive: true, force: true });
  });
  await Promise.race([
    once(server.stdout, "data"),
    exit.then(() => assert.fail("App failed to start: " + startupError)),
  ]);
  const post = (path, body, headers = {}) =>
    fetch(origin + "/api/" + path, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  async function signIn(name) {
    const response = await post("login", { name, password });
    assert.equal(response.status, 200);
    return {
      Cookie: response.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": (await response.json()).csrf,
    };
  }
  const get = (headers) => fetch(origin + "/api/actions", { headers });
  const create = (name) => ({ action: "project.create", input: { name } });
  const name = "پروژهٔ خصوصی";
  assert.equal((await get()).status, 401);
  assert.equal((await post("actions", create(name))).status, 401);
  const member = await signIn("member");
  const creator = await signIn("creator");
  assert.equal((await post("actions", create(name), { Cookie: member.Cookie })).status, 403);
  for (const body of [
    { action: "shell.execute", input: {} },
    { ...create(name), owner: 1 },
    create("س".repeat(121)),
  ]) {
    assert.equal((await post("actions", body, member)).status, 400);
  }
  const created = await post("actions", create(" " + name + " "), member);
  assert.equal(created.status, 200);
  const result = await created.json();
  assert.equal(result.status, "completed");
  assert.equal(result.project.name, name);
  assert.deepEqual(await (await post("actions", create(name), member)).json(), result);
  const other = await (await get(creator)).json();
  assert.deepEqual(other.projects, []);
  assert.deepEqual(
    other.registry.map((entry) => entry.id),
    [
      "project.create",
      "task.create",
      "task.setCompleted",
      "task.setReminder",
      "task.acknowledgeReminder",
    ],
  );
  assert.equal((await post("logout", {}, member)).status, 200);
  assert.equal((await get(member)).status, 401);
  const restored = await signIn("member");
  assert.deepEqual((await (await get(restored)).json()).projects, [result.project]);
  for (let index = 1; index < 50; index++) {
    assert.equal((await post("actions", create(name + index), restored)).status, 200);
  }
  assert.equal((await post("actions", create(name + 50), restored)).status, 409);
  assert.deepEqual(
    (await (await post("actions", create(name), restored)).json()).project,
    result.project,
  );
  const projectId = result.project.id;
  const getTasks = (headers) => fetch(origin + "/api/actions?project=" + projectId, { headers });
  const addTask = { action: "task.create", input: { projectId, title: "  بررسی متن فارسی  " } };
  assert.equal((await getTasks(creator)).status, 404);
  assert.equal((await post("actions", addTask, creator)).status, 404);
  const createdTask = await post("actions", addTask, restored);
  assert.equal(createdTask.status, 200);
  const [task] = (await createdTask.json()).tasks;
  assert.equal(task.title, "بررسی متن فارسی");
  assert.equal(task.completed, null);
  const complete = {
    action: "task.setCompleted",
    input: { projectId, taskId: task.id, completed: true },
  };
  assert.equal((await post("actions", complete, creator)).status, 404);
  const otherProject = (await (await post("actions", create(name), creator)).json()).project;
  assert.equal(
    (
      await post(
        "actions",
        {
          ...complete,
          input: { ...complete.input, projectId: otherProject.id },
        },
        creator,
      )
    ).status,
    404,
  );
  const completed = await post("actions", complete, restored);
  assert.equal(completed.status, 200);
  const [done] = (await completed.json()).tasks;
  assert.ok(done.completed >= done.created);
  assert.deepEqual((await (await post("actions", complete, restored)).json()).tasks, [done]);
  assert.deepEqual((await (await getTasks(restored)).json()).tasks, [done]);
  const reopened = await post(
    "actions",
    {
      ...complete,
      input: { ...complete.input, completed: false },
    },
    restored,
  );
  assert.deepEqual((await reopened.json()).tasks, [task]);
  const future = Date.now() + 86400_000;
  const setReminder = (due) => ({
    action: "task.setReminder",
    input: { projectId, taskId: task.id, due },
  });
  assert.equal((await post("actions", setReminder(future), creator)).status, 404);
  assert.equal((await post("actions", setReminder(1), restored)).status, 400);
  const reminder = await post("actions", setReminder(future), restored);
  assert.equal(reminder.status, 200);
  const scheduled = await reminder.json();
  assert.equal(scheduled.tasks[0].due, future);
  assert.deepEqual(scheduled.dueReminders, []);
  const write = openStore(dir);
  try {
    write.prepare("UPDATE project_task_reminders SET due=? WHERE task_id=?").run(1, task.id);
  } finally {
    write.close();
  }
  const due = (await (await get(restored)).json()).dueReminders;
  assert.deepEqual(due, [{ id: task.id, title: task.title, projectId, project: name, due: 1 }]);
  assert.deepEqual((await (await get(creator)).json()).dueReminders, []);
  const ack = (due) => ({
    action: "task.acknowledgeReminder",
    input: { projectId, taskId: task.id, due },
  });
  assert.equal((await post("actions", ack(1), creator)).status, 404);
  const acknowledged = await post("actions", ack(1), restored);
  assert.equal(acknowledged.status, 200);
  assert.deepEqual((await acknowledged.json()).dueReminders, []);
  const saved = openStore(dir);
  const record = () =>
    saved
      .prepare("SELECT due, acknowledged FROM project_task_reminders WHERE task_id=?")
      .get(task.id);
  try {
    const old = record();
    assert.ok(old.acknowledged > 1);
    assert.equal((await post("actions", ack(1), restored)).status, 200);
    assert.deepEqual(record(), old);
    assert.deepEqual((await (await get(await signIn("member"))).json()).dueReminders, []);
    assert.equal((await post("actions", setReminder(future), restored)).status, 200);
    assert.equal(record().acknowledged, null);
    assert.equal((await post("actions", ack(1), restored)).status, 404);
    assert.equal((await post("actions", ack(future), restored)).status, 404);
    saved.prepare("UPDATE project_task_reminders SET due=2 WHERE task_id=?").run(task.id);
    assert.equal((await (await get(restored)).json()).dueReminders[0].due, 2);
  } finally {
    saved.close();
  }
  assert.deepEqual((await (await post("actions", complete, restored)).json()).dueReminders, []);
  assert.equal((await post("actions", setReminder(future), restored)).status, 409);
  const canceled = await post("actions", setReminder(null), restored);
  assert.equal(canceled.status, 200);
  assert.equal((await canceled.json()).tasks[0].due, null);
  const afterCancel = await post(
    "actions",
    {
      ...complete,
      input: { ...complete.input, completed: false },
    },
    restored,
  );
  assert.deepEqual((await afterCancel.json()).dueReminders, []);
  const ask = (message, projectId, headers) =>
    post(
      "actions",
      {
        action: "intent.preview",
        input: { message, projectId },
      },
      headers,
    );
  const settle = (id, operation, headers) =>
    post("actions", { action: "intent." + operation, input: { id } }, headers);
  assert.equal((await ask("run system command", null, creator)).status, 400);
  assert.equal((await ask("open website javascript:alert(1)", null, creator)).status, 400);
  const link = await ask("باز کردن سایت https://example.org/docs", null, creator);
  assert.deepEqual((await link.json()).plan, {
    action: "browser.open",
    url: "https://example.org/docs",
  });
  assert.equal((await ask("ساخت وظیفه مورد دیگر", projectId, creator)).status, 404);
  const plan = (await (await ask("ساخت وظیفه بررسی پیش‌نویس", projectId, restored)).json()).plan;
  assert.equal((await (await getTasks(restored)).json()).tasks.length, 1);
  assert.equal((await settle(plan.id, "confirm", creator)).status, 404);
  assert.equal((await settle(plan.id, "confirm", await signIn("member"))).status, 404);
  assert.equal((await settle(plan.id, "cancel", restored)).status, 200);
  assert.equal((await settle(plan.id, "confirm", restored)).status, 404);
  const finalPlan = (await (await ask("ساخت وظیفه بررسی پیش‌نویس", projectId, restored)).json())
    .plan;
  const performed = await settle(finalPlan.id, "confirm", restored);
  assert.equal(performed.status, 200);
  assert.ok((await performed.json()).tasks.some((item) => item.title === "بررسی پیش‌نویس"));
  assert.equal((await settle(finalPlan.id, "confirm", restored)).status, 404);
  const projectPlan = (await (await ask("create project Review project", null, creator)).json())
    .plan;
  assert.equal((await settle(projectPlan.id, "confirm", creator)).status, 200);
  assert.ok(
    (await (await get(creator)).json()).projects.some((item) => item.name === "Review project"),
  );
});

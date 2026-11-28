import { randomUUID } from "node:crypto";

const day = 86_400_000;
const keyPattern = /^[a-f0-9-]{36}$/u;

export function openWorkflows(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_workflow_settings (
      owner INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      paused INTEGER NOT NULL CHECK(paused IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS workspace_workflows (
      id TEXT PRIMARY KEY, owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project TEXT NOT NULL REFERENCES workspace_projects(id) ON DELETE CASCADE,
      next_due INTEGER, cadence TEXT NOT NULL CHECK(cadence IN ('once', 'daily')),
      status TEXT NOT NULL CHECK(status IN ('scheduled', 'completed', 'canceled')),
      last_run INTEGER, last_result TEXT, failures INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS workspace_workflows_due ON workspace_workflows(status, next_due);
    CREATE INDEX IF NOT EXISTS workspace_workflows_owner ON workspace_workflows(owner, status);
  `);
  db.exec("BEGIN IMMEDIATE");
  try {
    const fields = db.prepare("PRAGMA table_info(workspace_workflows)").all();
    if (!fields.some(({ name }) => name === "notify"))
      db.exec("ALTER TABLE workspace_workflows ADD COLUMN notify INTEGER NOT NULL DEFAULT 0");
    if (!fields.some(({ name }) => name === "task"))
      db.exec(
        "ALTER TABLE workspace_workflows ADD COLUMN task TEXT REFERENCES project_tasks(id) ON DELETE CASCADE",
      );
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_notifications (
        id TEXT PRIMARY KEY, owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        workflow TEXT NOT NULL, due INTEGER NOT NULL, created INTEGER NOT NULL,
        project_name TEXT NOT NULL, payload TEXT NOT NULL, acknowledged INTEGER,
        UNIQUE(workflow, due)
      );
      CREATE INDEX IF NOT EXISTS workspace_notifications_owner ON workspace_notifications(owner, acknowledged, created DESC);
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const settings = db.prepare("SELECT paused FROM workspace_workflow_settings WHERE owner=?");
  const pause = db.prepare(`
    INSERT INTO workspace_workflow_settings(owner,paused) VALUES (?,?)
    ON CONFLICT(owner) DO UPDATE SET paused=excluded.paused
  `);
  const owned = db.prepare("SELECT id FROM workspace_projects WHERE id=? AND owner=?");
  const list = db.prepare(`
    SELECT w.id,w.project,p.name,w.next_due AS nextDue,w.status,w.cadence,
      w.last_run AS lastRun,w.last_result AS result,w.failures,w.notify,t.title AS taskTitle
    FROM workspace_workflows w JOIN workspace_projects p ON p.id=w.project AND p.owner=w.owner
    LEFT JOIN project_tasks t ON t.id=w.task
    WHERE w.owner=? ORDER BY w.status='scheduled' DESC, COALESCE(w.last_run,w.next_due) DESC
    LIMIT 30
  `);
  const add = db.prepare(`
    INSERT INTO workspace_workflows(id,owner,project,next_due,cadence,status,notify,task)
    SELECT ?,?,?,?,?,'scheduled',?,?
    WHERE (SELECT COUNT(*) FROM workspace_workflows WHERE owner=? AND status='scheduled') < 15
      AND (SELECT COUNT(*) FROM workspace_workflows WHERE owner=?) < 100
  `);
  const stop = db.prepare(`
    UPDATE workspace_workflows SET status='canceled',next_due=NULL WHERE id=? AND owner=? AND status='scheduled'
  `);
  const due = db.prepare(`
    SELECT w.id,w.owner,w.project,w.next_due,w.cadence,w.failures,w.notify,w.task
    FROM workspace_workflows w
    LEFT JOIN workspace_workflow_settings settings ON settings.owner=w.owner
    WHERE w.status='scheduled' AND w.next_due<=? AND COALESCE(settings.paused,0)=0
    ORDER BY w.next_due,w.id LIMIT 8
  `);
  const counts = db.prepare(`
    SELECT p.name, COUNT(t.id) AS total, COUNT(t.completed) AS completed
    FROM workspace_projects p LEFT JOIN project_tasks t ON t.project_id=p.id
    WHERE p.id=? AND p.owner=? GROUP BY p.id
  `);
  const finish = db.prepare(`
    UPDATE workspace_workflows SET status=?,next_due=?,last_run=?,last_result=?,failures=0 WHERE id=?
  `);
  const retry = db.prepare(`
    UPDATE workspace_workflows SET failures=failures+1,next_due=?,status=? WHERE id=?
  `);
  const clearCompleted = db.prepare(`
    DELETE FROM workspace_workflows WHERE owner=? AND status IN ('completed','canceled')
  `);

  const ownedTask = db.prepare(`
    SELECT t.title,t.completed,p.name FROM project_tasks t JOIN workspace_projects p ON p.id=t.project_id
    WHERE t.id=? AND p.id=? AND p.owner=?
  `);
  const notify = db.prepare(`
    INSERT INTO workspace_notifications(id,owner,workflow,due,created,project_name,payload)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(workflow,due) DO NOTHING
  `);
  const trimNotices = db.prepare(`
    DELETE FROM workspace_notifications WHERE owner=? AND id IN (
      SELECT id FROM workspace_notifications WHERE owner=? ORDER BY created DESC,id DESC LIMIT -1 OFFSET 100
    )
  `);
  const acknowledge = db.prepare(`
    UPDATE workspace_notifications SET acknowledged=COALESCE(acknowledged,?) WHERE owner=? AND id=?
  `);
  const notices = db.prepare(`
    SELECT id,created,project_name AS project,payload FROM workspace_notifications
    WHERE owner=? AND acknowledged IS NULL ORDER BY created DESC,id DESC LIMIT 25
  `);
  const clearSeen = db.prepare(
    "DELETE FROM workspace_notifications WHERE owner=? AND acknowledged IS NOT NULL",
  );

  function snapshot(owner) {
    return {
      paused: settings.get(owner)?.paused === 1,
      notifications: notices
        .all(owner)
        .map(({ payload, ...row }) => ({ ...row, result: JSON.parse(payload) })),
      workflows: list
        .all(owner)
        .map((row) => ({ ...row, result: row.result ? JSON.parse(row.result) : null })),
    };
  }
  return {
    snapshot,
    change(owner, body) {
      if (body?.operation === "pause" && typeof body.paused === "boolean") {
        pause.run(owner, Number(body.paused));
      } else if (body?.operation === "clearCompleted") {
        db.exec("BEGIN IMMEDIATE");
        try {
          clearCompleted.run(owner);
          clearSeen.run(owner);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      } else if (
        body?.operation === "cancel" &&
        typeof body.id === "string" &&
        keyPattern.test(body.id)
      ) {
        if (!stop.run(body.id, owner).changes) return { error: "workflow_missing" };
      } else if (
        body?.operation === "acknowledge" &&
        typeof body.id === "string" &&
        keyPattern.test(body.id)
      ) {
        if (!acknowledge.run(Date.now(), owner, body.id).changes)
          return { error: "workflow_missing" };
      } else if (body?.operation === "schedule") {
        const now = Date.now();
        if (
          !Number.isSafeInteger(body.due) ||
          body.due <= now ||
          body.due > now + 366 * day ||
          !["once", "daily"].includes(body.cadence) ||
          typeof body.projectId !== "string" ||
          !keyPattern.test(body.projectId)
        )
          return { error: "workflow_invalid" };
        if (!owned.get(body.projectId, owner)) return { error: "project_missing" };
        if (body.notify !== undefined && typeof body.notify !== "boolean")
          return { error: "workflow_invalid" };
        const taskId = body.taskId ?? null;
        if (taskId !== null) {
          const task =
            typeof taskId === "string" ? ownedTask.get(taskId, body.projectId, owner) : null;
          if (!task) return { error: "task_missing" };
          if (task.completed !== null) return { error: "workflow_invalid" };
        }
        if (
          !add.run(
            randomUUID(),
            owner,
            body.projectId,
            body.due,
            body.cadence,
            Number(taskId !== null || body.notify === true),
            taskId,
            owner,
            owner,
          ).changes
        )
          return { error: "workflow_limit" };
      } else return { error: "workflow_invalid" };
      return snapshot(owner);
    },
    tick(now = Date.now()) {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const item of due.all(now)) {
          // Read and settle each local report in the same transaction. A restart
          // can repeat an uncommitted read, but cannot double-publish a result.
          const task = item.task ? ownedTask.get(item.task, item.project, item.owner) : null;
          if (task?.completed != null) {
            finish.run("completed", null, now, null, item.id);
            continue;
          }
          const current = item.task ? task : counts.get(item.project, item.owner);
          if (!current) {
            const exhausted = item.failures >= 2;
            retry.run(
              exhausted ? null : now + 60_000 * (item.failures + 1),
              exhausted ? "canceled" : "scheduled",
              item.id,
            );
            continue;
          }
          const next =
            item.cadence === "daily"
              ? item.next_due + (Math.floor((now - item.next_due) / day) + 1) * day
              : null;
          const output = JSON.stringify(
            item.task
              ? { task: current.title }
              : { total: current.total, completed: current.completed },
          );
          finish.run(next === null ? "completed" : "scheduled", next, now, output, item.id);
          if (item.notify) {
            notify.run(randomUUID(), item.owner, item.id, item.next_due, now, current.name, output);
            trimNotices.run(item.owner, item.owner);
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

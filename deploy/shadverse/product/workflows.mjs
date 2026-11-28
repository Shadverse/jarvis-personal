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
  const settings = db.prepare("SELECT paused FROM workspace_workflow_settings WHERE owner=?");
  const pause = db.prepare(`
    INSERT INTO workspace_workflow_settings(owner,paused) VALUES (?,?)
    ON CONFLICT(owner) DO UPDATE SET paused=excluded.paused
  `);
  const owned = db.prepare("SELECT id FROM workspace_projects WHERE id=? AND owner=?");
  const list = db.prepare(`
    SELECT w.id,w.project,p.name,w.next_due AS nextDue,w.status,w.cadence,
      w.last_run AS lastRun,w.last_result AS result,w.failures
    FROM workspace_workflows w JOIN workspace_projects p ON p.id=w.project AND p.owner=w.owner
    WHERE w.owner=? ORDER BY w.status='scheduled' DESC, COALESCE(w.last_run,w.next_due) DESC
    LIMIT 30
  `);
  const add = db.prepare(`
    INSERT INTO workspace_workflows(id,owner,project,next_due,cadence,status)
    SELECT ?,?,?,?,?,'scheduled'
    WHERE (SELECT COUNT(*) FROM workspace_workflows WHERE owner=? AND status='scheduled') < 15
      AND (SELECT COUNT(*) FROM workspace_workflows WHERE owner=?) < 100
  `);
  const stop = db.prepare(`
    UPDATE workspace_workflows SET status='canceled',next_due=NULL WHERE id=? AND owner=? AND status='scheduled'
  `);
  const due = db.prepare(`
    SELECT w.id,w.owner,w.project,w.next_due,w.cadence,w.failures
    FROM workspace_workflows w
    LEFT JOIN workspace_workflow_settings settings ON settings.owner=w.owner
    WHERE w.status='scheduled' AND w.next_due<=? AND COALESCE(settings.paused,0)=0
    ORDER BY w.next_due,w.id LIMIT 8
  `);
  const counts = db.prepare(`
    SELECT COUNT(t.id) AS total, COUNT(t.completed) AS completed
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

  function snapshot(owner) {
    return {
      paused: settings.get(owner)?.paused === 1,
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
        clearCompleted.run(owner);
      } else if (
        body?.operation === "cancel" &&
        typeof body.id === "string" &&
        keyPattern.test(body.id)
      ) {
        if (!stop.run(body.id, owner).changes) return { error: "workflow_missing" };
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
        if (
          !add.run(randomUUID(), owner, body.projectId, body.due, body.cadence, owner, owner)
            .changes
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
          const current = counts.get(item.project, item.owner);
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
          finish.run(
            next === null ? "completed" : "scheduled",
            next,
            now,
            JSON.stringify({ total: current.total, completed: current.completed }),
            item.id,
          );
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

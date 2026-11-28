import { randomUUID } from "node:crypto";

const validId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const localTaskAction = {
  output: { type: "taskList" },
  permission: "own_workspace",
  risk: "local_write",
  confirmation: "explicit_submit",
  execution: "single_local_statement",
};
const actions = [
  {
    ...localTaskAction,
    id: "task.create",
    description: "Add a task to a private project",
    audit: "persisted_creation",
    input: { projectId: "uuid", title: { type: "string", maxLength: 200 } },
  },
  {
    ...localTaskAction,
    id: "task.setCompleted",
    description: "Complete or reopen a task in a private project",
    audit: "current_completion_timestamp",
    input: { projectId: "uuid", taskId: "uuid", completed: "boolean" },
  },
  {
    ...localTaskAction,
    id: "task.setReminder",
    description: "Schedule or cancel a private task reminder",
    audit: "persisted_due_time",
    input: { projectId: "uuid", taskId: "uuid", due: "utcEpochMsOrNull" },
  },
  {
    ...localTaskAction,
    id: "task.acknowledgeReminder",
    description: "Acknowledge a due reminder",
    audit: "persisted_acknowledgement",
    input: { projectId: "uuid", taskId: "uuid", due: "utcEpochMs" },
  },
];

export function openTasks(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES workspace_projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created INTEGER NOT NULL,
      completed INTEGER CHECK(completed IS NULL OR completed >= created)
    );
    CREATE INDEX IF NOT EXISTS project_tasks_project ON project_tasks(project_id, created, id);
    CREATE TABLE IF NOT EXISTS project_task_reminders (
      task_id TEXT PRIMARY KEY REFERENCES project_tasks(id) ON DELETE CASCADE,
      due INTEGER NOT NULL
    );
  `);
  db.exec("BEGIN IMMEDIATE");
  try {
    const columns = db.prepare("PRAGMA table_info(project_task_reminders)").all();
    if (!columns.some(({ name }) => name === "acknowledged"))
      db.exec("ALTER TABLE project_task_reminders ADD COLUMN acknowledged INTEGER");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const project = db.prepare("SELECT id, name FROM workspace_projects WHERE id=? AND owner=?");
  const rows = db.prepare(`
    SELECT t.id, t.title, t.created, t.completed, r.due
    FROM project_tasks t JOIN workspace_projects p ON p.id=t.project_id
    LEFT JOIN project_task_reminders r ON r.task_id=t.id
    WHERE p.id=? AND p.owner=? ORDER BY t.created, t.id
  `);
  const insert = db.prepare(`
    INSERT INTO project_tasks (id, project_id, title, created)
    SELECT ?, p.id, ?, ? FROM workspace_projects p
    WHERE p.id=? AND p.owner=?
      AND (SELECT count(*) FROM project_tasks t WHERE t.project_id=p.id) < 100
  `);
  const update = db.prepare(`
    UPDATE project_tasks SET completed=
      CASE WHEN ? THEN COALESCE(completed, MAX(created, ?)) ELSE NULL END
    WHERE id=? AND project_id IN (SELECT id FROM workspace_projects WHERE id=? AND owner=?)
  `);
  const reminderTask = db.prepare(`
    SELECT t.completed FROM project_tasks t JOIN workspace_projects p ON p.id=t.project_id
    WHERE t.id=? AND p.id=? AND p.owner=?
  `);
  const setReminder = db.prepare(`
    INSERT INTO project_task_reminders (task_id, due)
    SELECT t.id, ? FROM project_tasks t JOIN workspace_projects p ON p.id=t.project_id
    WHERE t.id=? AND p.id=? AND p.owner=? AND t.completed IS NULL
    ON CONFLICT(task_id) DO UPDATE SET due=excluded.due, acknowledged=CASE
      WHEN project_task_reminders.due=excluded.due THEN project_task_reminders.acknowledged END
  `);
  const cancelReminder = db.prepare(`
    DELETE FROM project_task_reminders WHERE task_id IN (
      SELECT t.id FROM project_tasks t JOIN workspace_projects p ON p.id=t.project_id
      WHERE t.id=? AND p.id=? AND p.owner=?
    )
  `);
  const acknowledge = db.prepare(`
    UPDATE project_task_reminders SET acknowledged=COALESCE(acknowledged, ?)
    WHERE due=? AND due<=? AND task_id IN (
      SELECT t.id FROM project_tasks t JOIN workspace_projects p ON p.id=t.project_id
      WHERE t.id=? AND p.id=? AND p.owner=? AND t.completed IS NULL
    )
  `);
  const dueReminders = db.prepare(`
    SELECT t.id, t.title, p.id AS projectId, p.name AS project, r.due
    FROM project_task_reminders r JOIN project_tasks t ON t.id=r.task_id
      JOIN workspace_projects p ON p.id=t.project_id
    WHERE p.owner=? AND t.completed IS NULL AND r.due<=? AND r.acknowledged IS NULL
    ORDER BY r.due, t.id LIMIT 50
  `);
  function list(owner, projectId) {
    if (typeof projectId !== "string" || !validId.test(projectId)) return { error: "task_invalid" };
    const parent = project.get(projectId, owner);
    if (!parent) return { error: "project_missing" };
    return { project: parent, tasks: rows.all(projectId, owner) };
  }
  return {
    actions,
    list,
    due(owner) {
      return dueReminders.all(owner, Date.now());
    },
    execute(owner, body) {
      const { action, input } = body;
      const definition = actions.find((entry) => entry.id === action);
      if (
        !definition ||
        !input ||
        typeof input !== "object" ||
        Object.keys(input).length !== Object.keys(definition.input).length
      )
        return { error: "task_invalid" };
      const { projectId, title, taskId, completed, due } = input;
      if (typeof projectId !== "string" || !validId.test(projectId))
        return { error: "task_invalid" };
      if (!project.get(projectId, owner)) return { error: "project_missing" };
      if (action === "task.create") {
        const name = typeof title === "string" ? title.trim() : "";
        if (
          !name ||
          name.length > definition.input.title.maxLength ||
          /[\x00-\x1f\x7f]/u.test(name)
        )
          return { error: "task_invalid" };
        if (!insert.run(randomUUID(), name, Date.now(), projectId, owner).changes)
          return { error: "task_cap" };
      } else if (action === "task.acknowledgeReminder") {
        const now = Date.now();
        if (typeof taskId !== "string" || !validId.test(taskId) || !Number.isSafeInteger(due))
          return { error: "reminder_invalid" };
        if (!acknowledge.run(now, due, now, taskId, projectId, owner).changes)
          return { error: "reminder_missing" };
      } else if (action === "task.setReminder") {
        const now = Date.now();
        if (
          typeof taskId !== "string" ||
          !validId.test(taskId) ||
          (due !== null &&
            (!Number.isSafeInteger(due) || due <= now || due > now + 366 * 86400_000))
        )
          return { error: "reminder_invalid" };
        const task = reminderTask.get(taskId, projectId, owner);
        if (!task) return { error: "task_missing" };
        if (due === null) cancelReminder.run(taskId, projectId, owner);
        else if (!setReminder.run(due, taskId, projectId, owner).changes)
          return { error: "task_closed" };
      } else {
        if (typeof taskId !== "string" || !validId.test(taskId) || typeof completed !== "boolean")
          return { error: "task_invalid" };
        if (!update.run(Number(completed), Date.now(), taskId, projectId, owner).changes)
          return { error: "task_missing" };
      }
      return { status: "completed", ...list(owner, projectId) };
    },
  };
}

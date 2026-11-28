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
  `);
  const project = db.prepare("SELECT id, name FROM workspace_projects WHERE id=? AND owner=?");
  const rows = db.prepare(`
    SELECT t.id, t.title, t.created, t.completed
    FROM project_tasks t JOIN workspace_projects p ON p.id=t.project_id
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
  function list(owner, projectId) {
    if (typeof projectId !== "string" || !validId.test(projectId)) return { error: "task_invalid" };
    const parent = project.get(projectId, owner);
    if (!parent) return { error: "project_missing" };
    return { project: parent, tasks: rows.all(projectId, owner) };
  }
  return {
    actions,
    list,
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
      const { projectId, title, taskId, completed } = input;
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

import { randomUUID } from "node:crypto";
import { openTasks } from "./tasks.mjs";

const createProject = {
  id: "project.create",
  description: "Create a private workspace project",
  input: { name: { type: "string", maxLength: 120 } },
  output: { type: "project" },
  permission: "own_workspace",
  risk: "local_write",
  confirmation: "explicit_submit",
  execution: "single_local_statement",
  audit: "persisted_creation",
};

export function openActions(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_projects (
      id TEXT PRIMARY KEY,
      owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created INTEGER NOT NULL,
      UNIQUE(owner, name)
    );
  `);
  const tasks = openTasks(db);
  const list = db.prepare(
    "SELECT id, name, created FROM workspace_projects WHERE owner=? ORDER BY created, id",
  );
  const find = db.prepare(
    "SELECT id, name, created FROM workspace_projects WHERE owner=? AND name=?",
  );
  const insert = db.prepare(`
    INSERT INTO workspace_projects (id, owner, name, created)
    SELECT ?, ?, ?, ?
    WHERE (SELECT count(*) FROM workspace_projects WHERE owner=?) < 50
    ON CONFLICT(owner, name) DO NOTHING
    RETURNING id, name, created
  `);
  return {
    list(owner) {
      return { registry: [createProject, ...tasks.actions], projects: list.all(owner) };
    },
    listTasks: tasks.list,
    execute(owner, body) {
      if (!body || Object.keys(body).length !== 2) return { error: "project_invalid" };
      if (tasks.actions.some((entry) => entry.id === body.action))
        return tasks.execute(owner, body);
      if (body.action !== createProject.id) return { error: "project_invalid" };
      const input = body.input;
      if (!input || Object.keys(input).length !== 1 || typeof input.name !== "string")
        return { error: "project_invalid" };
      const name = input.name.trim();
      if (
        !name ||
        name.length > createProject.input.name.maxLength ||
        /[\x00-\x1f\x7f]/u.test(name)
      )
        return { error: "project_invalid" };
      const project =
        insert.get(randomUUID(), owner, name, Date.now(), owner) ?? find.get(owner, name);
      if (!project) return { error: "project_cap" };
      return { status: "completed", project, projects: list.all(owner) };
    },
  };
}

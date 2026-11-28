import { randomUUID } from "node:crypto";

const validId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function openMemory(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_notes (
      id TEXT PRIMARY KEY,
      owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      updated INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS personal_notes_owner ON personal_notes(owner, updated DESC, id);
  `);
  db.exec("BEGIN IMMEDIATE");
  try {
    const columns = db.prepare("PRAGMA table_info(personal_notes)").all();
    if (!columns.some(({ name }) => name === "project_id"))
      db.exec(
        "ALTER TABLE personal_notes ADD COLUMN project_id TEXT REFERENCES workspace_projects(id) ON DELETE CASCADE",
      );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const project = db.prepare("SELECT id FROM workspace_projects WHERE id=? AND owner=?");
  const list = db.prepare(`
    SELECT id, text, updated FROM personal_notes WHERE owner=? AND project_id IS ?
    ORDER BY updated DESC, id
  `);
  const note = db.prepare(`
    SELECT text FROM personal_notes WHERE owner=? AND project_id IS ? AND id=? AND updated=?
  `);
  const insert = db.prepare(`
    INSERT INTO personal_notes (id, owner, text, updated, project_id)
    SELECT ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM personal_notes WHERE owner=?) < 100
  `);
  const update = db.prepare(`
    UPDATE personal_notes SET text=?, updated=MAX(updated+1, ?) WHERE owner=? AND project_id IS ? AND id=?
  `);
  const remove = db.prepare(
    "DELETE FROM personal_notes WHERE owner=? AND project_id IS ? AND id=?",
  );
  function ownsScope(owner, projectId) {
    return (
      projectId === null ||
      (typeof projectId === "string" &&
        validId.test(projectId) &&
        Boolean(project.get(projectId, owner)))
    );
  }
  return {
    ownsScope,
    list(owner, projectId = null) {
      return list.all(owner, projectId);
    },
    retrieve(owner, ref) {
      if (
        !ref ||
        typeof ref !== "object" ||
        Object.keys(ref).length !== 3 ||
        typeof ref.id !== "string" ||
        !validId.test(ref.id) ||
        !Number.isSafeInteger(ref.updated) ||
        !ownsScope(owner, ref.projectId)
      )
        return null;
      return note.get(owner, ref.projectId, ref.id, ref.updated)?.text ?? null;
    },
    change(owner, body, projectId = null) {
      const operation = body?.operation;
      if (!["add", "edit", "delete"].includes(operation)) return "invalid";
      if (operation !== "add" && (typeof body.id !== "string" || !validId.test(body.id)))
        return "invalid";
      if (operation === "delete")
        return remove.run(owner, projectId, body.id).changes ? null : "note_missing";
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text || text.length > 500 || Buffer.byteLength(text) > 2000) return "invalid";
      if (operation === "edit")
        return update.run(text, Date.now(), owner, projectId, body.id).changes
          ? null
          : "note_missing";
      return insert.run(randomUUID(), owner, text, Date.now(), projectId, owner).changes
        ? null
        : "note_cap";
    },
  };
}

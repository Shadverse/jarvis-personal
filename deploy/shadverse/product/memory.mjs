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
  const list = db.prepare(
    "SELECT id, text, updated FROM personal_notes WHERE owner=? ORDER BY updated DESC, id",
  );
  const insert = db.prepare(`INSERT INTO personal_notes (id, owner, text, updated)
    SELECT ?, ?, ?, ? WHERE (SELECT count(*) FROM personal_notes WHERE owner=?) < 100`);
  const update = db.prepare("UPDATE personal_notes SET text=?,updated=? WHERE owner=? AND id=?");
  const remove = db.prepare("DELETE FROM personal_notes WHERE owner=? AND id=?");
  return {
    list(owner) {
      return list.all(owner);
    },
    change(owner, body) {
      const operation = body?.operation;
      if (!["add", "edit", "delete"].includes(operation)) return "invalid";
      if (operation !== "add" && (typeof body.id !== "string" || !validId.test(body.id)))
        return "invalid";
      if (operation === "delete") return remove.run(owner, body.id).changes ? null : "note_missing";
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text || text.length > 500 || Buffer.byteLength(text) > 2000) return "invalid";
      if (operation === "edit")
        return update.run(text, Date.now(), owner, body.id).changes ? null : "note_missing";
      return insert.run(randomUUID(), owner, text, Date.now(), owner).changes ? null : "note_cap";
    },
  };
}

import { randomUUID } from "node:crypto";

const maxBytes = 1024 * 1024;
export const documentBodyLimit = Math.ceil(maxBytes / 3) * 4 + 4096;
const filename = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} _.()-]{0,79}\.(?:txt|md|csv)$/iu;
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const base64 = /^[A-Za-z0-9+/]+={0,2}$/;
const decoder = new TextDecoder("utf-8", { fatal: true });

export function openDocuments(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS private_documents (
      id TEXT PRIMARY KEY, owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, bytes INTEGER NOT NULL, payload BLOB NOT NULL, created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS private_documents_owner ON private_documents(owner, created DESC, id);
  `);
  const list = db.prepare(
    "SELECT id, name, bytes, created FROM private_documents WHERE owner=? ORDER BY created DESC, id",
  );
  const get = db.prepare("SELECT name, payload FROM private_documents WHERE owner=? AND id=?");
  const remove = db.prepare("DELETE FROM private_documents WHERE owner=? AND id=?");
  const insert = db.prepare(`
    INSERT INTO private_documents (id, owner, name, bytes, payload, created)
    SELECT ?, ?, ?, ?, ?, ? WHERE
      (SELECT COUNT(*) < 50 AND COALESCE(SUM(bytes), 0) + ? <= 10485760
       FROM private_documents WHERE owner=?)
  `);
  return {
    list(owner) {
      return list.all(owner);
    },
    get(owner, id) {
      return typeof id === "string" && idPattern.test(id) ? get.get(owner, id) : null;
    },
    change(owner, body) {
      if (body?.operation === "delete") {
        if (typeof body.id !== "string" || !idPattern.test(body.id)) return "file_missing";
        return remove.run(owner, body.id).changes ? null : "file_missing";
      }
      if (
        body?.operation !== "add" ||
        typeof body.name !== "string" ||
        !filename.test(body.name) ||
        typeof body.content !== "string" ||
        body.content.length > documentBodyLimit ||
        !base64.test(body.content)
      )
        return "file_invalid";
      const bytes = Buffer.from(body.content, "base64");
      if (!bytes.length || bytes.length > maxBytes || bytes.toString("base64") !== body.content)
        return "file_invalid";
      try {
        const text = decoder.decode(bytes);
        if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) return "file_invalid";
      } catch {
        return "file_invalid";
      }
      return insert.run(
        randomUUID(),
        owner,
        body.name,
        bytes.length,
        bytes,
        Date.now(),
        bytes.length,
        owner,
      ).changes
        ? null
        : "file_cap";
    },
  };
}

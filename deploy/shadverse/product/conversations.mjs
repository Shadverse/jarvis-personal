const pageSize = 25;

export function openConversations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_turns (
      id INTEGER PRIMARY KEY,
      owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      reply TEXT NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS conversation_turns_owner ON conversation_turns(owner, id);
  `);
  const insert = db.prepare(`
    INSERT INTO conversation_turns (owner, message, reply, created)
    VALUES (?, ?, ?, ?) RETURNING id, message, reply, created
  `);
  const latest = db.prepare(`
    SELECT id, message, reply, created FROM conversation_turns
    WHERE owner=? ORDER BY id DESC LIMIT ?
  `);
  const earlier = db.prepare(`
    SELECT id, message, reply, created FROM conversation_turns
    WHERE owner=? AND id<? ORDER BY id DESC LIMIT ?
  `);
  return {
    record(owner, message, reply) {
      return insert.get(owner, message, reply, Date.now());
    },
    page(owner, before) {
      const rows =
        before === null
          ? latest.all(owner, pageSize + 1)
          : earlier.all(owner, before, pageSize + 1);
      const turns = rows.slice(0, pageSize).reverse();
      return { turns, before: rows.length > pageSize ? turns[0].id : null };
    },
  };
}

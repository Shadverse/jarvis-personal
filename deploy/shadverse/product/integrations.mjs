const local = "shadverse-workspace";
const scope = "projects:count";
const grantLifetime = 15 * 60_000;
const external = [
  "email",
  "calendar",
  "web-search",
  "github",
  "cloud-storage",
  "messaging",
  "api",
  "mcp",
];

export function openIntegrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_connector_grants (
      owner INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      granted INTEGER NOT NULL,
      expires INTEGER NOT NULL,
      revoked INTEGER,
      used INTEGER NOT NULL DEFAULT 0,
      lastUsed INTEGER
    );
  `);
  const read = db.prepare("SELECT * FROM workspace_connector_grants WHERE owner=?");
  const grant = db.prepare(`
    INSERT INTO workspace_connector_grants (owner, granted, expires) VALUES (?, ?, ?)
    ON CONFLICT(owner) DO UPDATE SET granted=excluded.granted, expires=excluded.expires, revoked=NULL
  `);
  const revoke = db.prepare(
    "UPDATE workspace_connector_grants SET revoked=? WHERE owner=? AND revoked IS NULL",
  );
  const consume = db.prepare(`
    UPDATE workspace_connector_grants SET used=used+1, lastUsed=?
    WHERE owner=? AND revoked IS NULL AND expires>?
    RETURNING (SELECT count(*) FROM workspace_projects WHERE owner=?) AS count
  `);

  function list(owner) {
    const record = read.get(owner);
    let status = "not_granted";
    if (record) {
      status =
        record.revoked !== null ? "revoked" : record.expires <= Date.now() ? "expired" : "granted";
    }
    return {
      connectors: [
        {
          id: local,
          authentication: "jarvis_session",
          scopes: [scope],
          health: "local",
          status,
          expires: status === "granted" ? record.expires : null,
          usage: record?.used ?? 0,
          lastUsed: record?.lastUsed ?? null,
        },
        ...external.map((id) => ({ id, status: "unavailable" })),
      ],
    };
  }
  return {
    list,
    execute(owner, body) {
      if (
        !body ||
        body.connector !== local ||
        body.scope !== scope ||
        Object.keys(body).length !== 3
      )
        return { error: "integration_invalid" };
      const now = Date.now();
      switch (body.operation) {
        case "grant":
          grant.run(owner, now, now + grantLifetime);
          break;
        case "revoke":
          revoke.run(now, owner);
          break;
        case "read": {
          const result = consume.get(now, owner, now, owner);
          if (!result) return { error: "integration_scope" };
          return { ...list(owner), projectCount: result.count };
        }
        default:
          return { error: "integration_invalid" };
      }
      return list(owner);
    },
  };
}

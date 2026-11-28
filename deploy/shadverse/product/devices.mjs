import { execFile } from "node:child_process";
import { open, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { validName } from "./auth.mjs";

const execute = promisify(execFile);
const nodeKey = /^[A-Za-z0-9_-]{1,128}$/u;
const day = 86_400_000;
const field = (value) =>
  typeof value === "string" && /^[A-Za-z0-9 ._+-]{1,48}$/u.test(value) ? value : null;

async function privateConfig(path) {
  const file = await open(path);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.uid !== process.getuid() || info.mode & 0o077 || info.size > 256_000)
      throw Error("Invalid device profile configuration.");
    return JSON.parse(await file.readFile("utf8"));
  } finally {
    await file.close();
  }
}

export async function loadDeviceInventory(env = process.env, creatorPort) {
  const bin = env.JARVIS_DEVICES_OPENCLAW;
  if (bin === undefined) return null;
  const state = env.JARVIS_DEVICES_STATE;
  const port = Number(env.JARVIS_DEVICES_PORT);
  if (
    !isAbsolute(bin) ||
    !state ||
    !isAbsolute(state) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    port === (creatorPort ?? 18789) ||
    port === Number(env.PORT || 3000)
  )
    throw Error("Invalid device inventory configuration.");
  const root = await realpath(state);
  const folder = await stat(root);
  if (
    !folder.isDirectory() ||
    folder.uid !== process.getuid() ||
    folder.mode & 0o077 ||
    (env.JARVIS_STATE && root === (await realpath(env.JARVIS_STATE)))
  )
    throw Error("Invalid device profile directory.");
  const path = join(root, "openclaw.json");
  const verify = async () => {
    const config = await privateConfig(path);
    const gateway = config.gateway;
    if (
      gateway?.port !== port ||
      gateway.bind !== "loopback" ||
      gateway.mode !== "local" ||
      gateway.auth?.mode !== "token" ||
      gateway.http?.endpoints?.responses?.enabled === true
    )
      throw Error("Expected an isolated loopback device inventory Gateway.");
  };
  await verify();
  let active = 0;
  return async (method, nodeId) => {
    if (method !== "node.list" && !(method === "node.describe" && nodeKey.test(nodeId)))
      throw Error("Unapproved device RPC.");
    if (active >= 2) throw Error("Device inventory busy.");
    active++;
    try {
      await verify();
      const { stdout } = await execute(
        bin,
        [
          "gateway",
          "call",
          method,
          "--port",
          String(port),
          "--timeout",
          "5000",
          "--json",
          ...(method === "node.describe" ? ["--params", JSON.stringify({ nodeId })] : []),
        ],
        {
          cwd: root,
          env: {
            PATH: dirname(bin) + ":/usr/local/bin:/usr/bin:/bin",
            OPENCLAW_STATE_DIR: root,
            OPENCLAW_CONFIG_PATH: path,
            NO_COLOR: "1",
            LANG: "C.UTF-8",
          },
          timeout: 7000,
          maxBuffer: 128_000,
          killSignal: "SIGKILL",
        },
      );
      return JSON.parse(stdout);
    } finally {
      active--;
    }
  };
}

function projected(node, nodeId) {
  if (node?.nodeId !== nodeId || node.paired !== true || typeof node.connected !== "boolean")
    return null;
  return {
    connected: node.connected,
    platform: field(node.platform),
    version: field(node.version),
  };
}

export function openDeviceGrants(db, read) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_inventory_grants (
      owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL, label TEXT NOT NULL, expires INTEGER NOT NULL,
      accepted INTEGER NOT NULL DEFAULT 0 CHECK(accepted IN (0,1)),
      PRIMARY KEY(owner,node_id), UNIQUE(node_id)
    );
  `);
  const user = db.prepare("SELECT id FROM users WHERE name=?");
  const inspect = db.prepare(`
    SELECT node_id AS id,label,expires,accepted FROM device_inventory_grants
    WHERE owner=? AND expires>? ORDER BY node_id
  `);
  const detail = db.prepare(`
    SELECT label,expires,accepted FROM device_inventory_grants
    WHERE owner=? AND node_id=? AND expires>?
  `);
  const grant = db.prepare(`
    INSERT INTO device_inventory_grants(owner,node_id,label,expires)
    SELECT ?,?,?,? WHERE (SELECT count(*) FROM device_inventory_grants WHERE owner=?) < 32
      OR EXISTS(SELECT 1 FROM device_inventory_grants WHERE owner=? AND node_id=?)
    ON CONFLICT(node_id) DO UPDATE SET label=excluded.label,expires=excluded.expires,accepted=0
      WHERE device_inventory_grants.owner=excluded.owner
  `);
  const remove = db.prepare("DELETE FROM device_inventory_grants WHERE owner=? AND node_id=?");
  const purge = db.prepare(
    "DELETE FROM device_inventory_grants WHERE (owner=? OR node_id=?) AND expires<=?",
  );
  const accept = db.prepare(`
    UPDATE device_inventory_grants SET accepted=1 WHERE owner=? AND node_id=? AND expires>?
  `);

  return {
    async inventory(owner, id, current = () => true) {
      const authorized = id === null ? null : detail.get(owner, id, Date.now());
      if (id !== null && (!nodeKey.test(id) || !authorized?.accepted))
        return { status: 404, error: "device_missing" };
      const grants = inspect.all(owner, Date.now());
      if (!read || !grants.some((row) => row.accepted)) {
        return id === null
          ? { status: 200, available: Boolean(read), grants, nodes: [] }
          : { status: 503, error: "device_unavailable" };
      }
      try {
        const remote = id === null ? await read("node.list") : await read("node.describe", id);
        if (!current()) return { status: 401, error: "auth" };
        if (id !== null) {
          const live = detail.get(owner, id, Date.now());
          const node = projected(remote, id);
          return live?.accepted && live.expires === authorized.expires && node
            ? { status: 200, node: { id, label: live.label, ...node } }
            : { status: 404, error: "device_missing" };
        }
        if (!Array.isArray(remote?.nodes)) throw Error("Invalid inventory response.");
        const visible = inspect.all(owner, Date.now());
        const admitted = new Map(
          grants.filter((row) => row.accepted).map((row) => [row.id, row.expires]),
        );
        const byId = new Map(
          remote.nodes
            .filter((node) => node && typeof node.nodeId === "string")
            .map((node) => [node.nodeId, node]),
        );
        return {
          status: 200,
          available: true,
          grants: visible,
          nodes: visible.flatMap((row) => {
            const node =
              row.accepted && admitted.get(row.id) === row.expires
                ? projected(byId.get(row.id), row.id)
                : null;
            return node ? [{ id: row.id, label: row.label, ...node }] : [];
          }),
        };
      } catch {
        if (!current()) return { status: 401, error: "auth" };
        return id === null
          ? { status: 200, available: false, grants: inspect.all(owner, Date.now()), nodes: [] }
          : { status: 503, error: "device_unavailable" };
      }
    },
    change(session, body, canAdminister) {
      const id = body?.id;
      if (typeof id !== "string" || !nodeKey.test(id))
        return { status: 400, error: "device_invalid" };
      const operation = body.operation;
      const administrative = operation === "grant" || operation === "revoke";
      if (administrative && !canAdminister) return { status: 403, error: "forbidden" };
      const account = administrative && validName(body.account) ? user.get(body.account) : null;
      if (administrative && !account) return { status: 404, error: "device_missing" };
      const now = Date.now();
      if (operation === "grant") {
        const label = typeof body.label === "string" ? body.label.trim() : "";
        if (
          !label ||
          label.length > 100 ||
          /[\x00-\x1f\x7f]/u.test(label) ||
          !Number.isInteger(body.days) ||
          body.days < 1 ||
          body.days > 30
        )
          return { status: 400, error: "device_invalid" };
        purge.run(account.id, id, now);
        // Re-issuing an existing grant always requires fresh account consent.
        if (
          !grant.run(account.id, id, label, now + body.days * day, account.id, account.id, id)
            .changes
        )
          return { status: 409, error: "device_limit" };
      } else if (operation === "revoke" || operation === "decline") {
        if (!remove.run(account?.id ?? session.userId, id).changes)
          return { status: 404, error: "device_missing" };
      } else if (operation === "accept") {
        if (!accept.run(session.userId, id, now).changes)
          return { status: 404, error: "device_missing" };
      } else return { status: 400, error: "device_invalid" };
      return { status: 200, grants: inspect.all(session.userId, now) };
    },
  };
}

import { randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";

const tasks = ["chat", "analysis", "code", "translation"];
const modes = ["codex", "siwc", "api-key", "local"];
const modelRef = /^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_./:\-]{0,126}$/i;
const validInt = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const dayMs = 86_400_000;
const cooldown = 60_000;

export async function loadModelPolicy(path = process.env.JARVIS_MODEL_POLICY_FILE) {
  if (path === undefined) return null;
  if (!isAbsolute(path)) throw Error("Use an absolute owner-only model policy file.");
  const file = await open(path);
  let source;
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid() ||
      stat.mode & 0o077 ||
      stat.size > 256 * 1024
    )
      throw Error("Use an owner-only model policy file of at most 256 KiB.");
    source = await file.readFile("utf8");
  } finally {
    await file.close();
  }
  try {
    const policy = JSON.parse(source);
    if (
      !validInt(policy.dailyTokens, 1, 100_000_000) ||
      policy.dailySpendMicros !== 0 ||
      !Array.isArray(policy.routes) ||
      policy.routes.length > 40 ||
      !Array.isArray(policy.catalog?.models)
    )
      throw Error();
    const byModel = new Map(policy.catalog.models.map((model) => [model.key, model]));
    const ids = new Set();
    const routes = policy.routes.map((route) => {
      const {
        id,
        model,
        authentication,
        cost,
        languages,
        priority,
        maxOutputTokens,
        verification,
      } = route;
      if (
        typeof id !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,47}$/.test(id) ||
        ids.has(id) ||
        typeof model !== "string" ||
        !modelRef.test(model) ||
        !modes.includes(authentication) ||
        !["free", "paid", "unknown"].includes(cost) ||
        !Array.isArray(languages) ||
        languages.length === 0 ||
        languages.some((language) => !["fa", "en"].includes(language)) ||
        !Array.isArray(route.tasks) ||
        route.tasks.length === 0 ||
        route.tasks.some((task) => !tasks.includes(task)) ||
        !validInt(priority, 0, 1000) ||
        !validInt(maxOutputTokens, 1, 2048)
      )
        throw Error();
      ids.add(id);
      const discovered = byModel.get(model);
      const input =
        typeof discovered?.input === "string"
          ? discovered.input
              .split("+")
              .filter((kind) => ["text", "image", "audio", "video"].includes(kind))
          : [];
      const contextWindow = validInt(discovered?.contextWindow, 2, 10_000_000)
        ? discovered.contextWindow
        : null;
      const available = discovered?.available === true;
      const verified =
        verification?.authentication === true &&
        verification?.eligibility === true &&
        verification?.noCharge === true &&
        verification?.gatewayFallbacksDisabled === true;
      const eligible =
        verified &&
        available &&
        input.includes("text") &&
        contextWindow !== null &&
        maxOutputTokens < contextWindow &&
        cost === "free";
      return {
        id,
        model,
        provider: model.split("/")[0],
        authentication,
        cost,
        languages,
        priority,
        maxOutputTokens,
        tasks: route.tasks,
        input,
        contextWindow,
        available,
        verified,
        eligible,
      };
    });
    return { dailyTokens: policy.dailyTokens, dailySpendMicros: 0, routes };
  } catch {
    throw Error("Invalid model policy. Use the OpenClaw catalog and documented approval fields.");
  }
}

export function taskFor(message) {
  if (/^(?:translate|ترجمه)(?:\b|\s|:)/iu.test(message)) return "translation";
  if (/^(?:code|implement|write code|کد|برنامه‌نویسی)(?:\b|\s|:)/iu.test(message)) return "code";
  if (/^(?:analyze|analyse|compare|تحلیل|مقایسه)(?:\b|\s|:)/iu.test(message)) return "analysis";
  return "chat";
}

export function readUsage(usage) {
  const input = usage?.input_tokens,
    output = usage?.output_tokens,
    total = usage?.total_tokens;
  return validInt(input, 0, 100_000_000) &&
    validInt(output, 0, 100_000_000) &&
    validInt(total, Math.max(1, input + output), 100_000_000)
    ? { input, output, total }
    : null;
}

export function createModelRegistry(db, policy) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_pauses (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS model_attempts (
      id TEXT PRIMARY KEY, route TEXT NOT NULL, model TEXT NOT NULL,
      started INTEGER NOT NULL, reserved INTEGER NOT NULL, status TEXT NOT NULL,
      input INTEGER, output INTEGER, total INTEGER, latency INTEGER
    );
    CREATE INDEX IF NOT EXISTS model_attempts_day ON model_attempts(started);
    CREATE INDEX IF NOT EXISTS model_attempts_route ON model_attempts(route, started);
  `);
  const publicRoute = (route, now) => {
    const paused = Boolean(db.prepare("SELECT 1 FROM model_pauses WHERE id=?").get(route.id));
    const last = db
      .prepare(
        "SELECT status, started, latency FROM model_attempts WHERE route=? AND model=? ORDER BY started DESC, rowid DESC LIMIT 1",
      )
      .get(route.id, route.model);
    const health = !last
      ? "unknown"
      : last.status === "completed"
        ? "healthy"
        : last.status === "pending" && now - last.started < 120_000
          ? "busy"
          : now - last.started < cooldown
            ? "cooldown"
            : "retryable";
    return { ...route, paused, health, latencyMs: last?.latency ?? null };
  };
  const use = (now) =>
    db
      .prepare(`
    SELECT COALESCE(SUM(CASE WHEN total IS NOT NULL THEN total WHEN status <> 'rejected'
      THEN reserved ELSE 0 END),0) AS chargedTokens,
      COALESCE(SUM(total),0) AS measuredTokens,
      COUNT(*) AS attempts,
      COALESCE(SUM(CASE WHEN status <> 'rejected' AND total IS NULL THEN 1 ELSE 0 END),0) AS unmeasured
    FROM model_attempts WHERE started >= ?
  `)
      .get(Math.floor(now / dayMs) * dayMs);
  return {
    inspect(now = Date.now()) {
      return {
        routes: policy.routes.map((route) => publicRoute(route, now)),
        usage: use(now),
        dailyTokens: policy.dailyTokens,
        dailySpendMicros: policy.dailySpendMicros,
      };
    },
    setPaused(id, paused) {
      const route = policy.routes.find((item) => item.id === id);
      if (!route || typeof paused !== "boolean" || (!paused && !route.eligible)) return false;
      if (paused) db.prepare("INSERT OR IGNORE INTO model_pauses VALUES (?)").run(id);
      else db.prepare("DELETE FROM model_pauses WHERE id=?").run(id);
      return true;
    },
    reserve(message, exclude, input = message, { image = false, routeId = null } = {}) {
      const now = Date.now();
      const task = taskFor(message);
      const persian = /[\u0600-\u06ff]/u.test(input);
      db.exec("BEGIN IMMEDIATE");
      try {
        const remaining = policy.dailyTokens - use(now).chargedTokens;
        const candidates = policy.routes
          .map((route) => publicRoute(route, now))
          .filter(
            (route) =>
              route.eligible &&
              (!image || route.input.includes("image")) &&
              (routeId === null || route.id === routeId) &&
              !route.paused &&
              !exclude.has(route.model) &&
              route.health !== "cooldown" &&
              route.health !== "busy" &&
              (!persian || route.languages.includes("fa")) &&
              (route.tasks.includes(task) || route.tasks.includes("chat")) &&
              Buffer.byteLength(input) + route.maxOutputTokens <= route.contextWindow,
          )
          .sort(
            (a, b) =>
              Number(b.tasks.includes(task)) - Number(a.tasks.includes(task)) ||
              a.priority - b.priority ||
              (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity) ||
              a.id.localeCompare(b.id),
          );
        const route = candidates.find(
          (item) => item.contextWindow + item.maxOutputTokens <= remaining,
        );
        if (!route) {
          db.exec("COMMIT");
          return { error: candidates.length ? "token_budget" : "no_model" };
        }
        const id = randomUUID();
        db.prepare(`INSERT INTO model_attempts(id,route,model,started,reserved,status)
          VALUES (?,?,?,?,?,'pending')`).run(
          id,
          route.id,
          route.model,
          now,
          route.contextWindow + route.maxOutputTokens,
        );
        db.exec("COMMIT");
        return { id, route, now };
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    finish(attempt, status, usage, now = Date.now()) {
      const exceeded =
        usage &&
        (usage.output > attempt.route.maxOutputTokens ||
          usage.total > attempt.route.contextWindow + attempt.route.maxOutputTokens);
      db.exec("BEGIN IMMEDIATE");
      try {
        const updated = db
          .prepare(`UPDATE model_attempts SET status=?,input=?,output=?,total=?,latency=?
          WHERE id=? AND status='pending'`)
          .run(
            exceeded ? "limit_exceeded" : status,
            usage?.input ?? null,
            usage?.output ?? null,
            usage?.total ?? null,
            Math.max(0, now - attempt.now),
            attempt.id,
          );
        if (updated.changes && exceeded) {
          db.prepare("INSERT OR IGNORE INTO model_pauses VALUES (?)").run(attempt.route.id);
        }
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

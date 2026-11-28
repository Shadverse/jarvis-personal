import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { openActions } from "./actions.mjs";
import {
  openStore,
  getSession,
  login,
  addUser,
  rateLimit,
  validName,
  validPassword,
  sessionAge,
} from "./auth.mjs";
import { documentBodyLimit, openDocuments } from "./documents.mjs";
import { loadGateway, postResponses, readGatewayJson } from "./gateway.mjs";
import { openMemory } from "./memory.mjs";
import { createModelRegistry, loadModelPolicy, readUsage } from "./models.mjs";
process.umask(0o077);
const db = openStore(process.env.JARVIS_STATE);
const memory = openMemory(db);
const documents = openDocuments(db);
const actions = openActions(db);
const port = Number(process.env.PORT || 3000);
const origin = new URL(process.env.JARVIS_ORIGIN || `http://localhost:${port}`);
if (
  !["http:", "https:"].includes(origin.protocol) ||
  origin.href !== origin.origin + "/" ||
  (origin.protocol === "http:" && !["localhost", "127.0.0.1"].includes(origin.hostname))
)
  throw Error("Use HTTPS for an external application origin.");
const localReview = ["localhost", "127.0.0.1"].includes(origin.hostname);
const gateway = await loadGateway();
const modelPolicy = await loadModelPolicy();
const models = modelPolicy && createModelRegistry(db, modelPolicy);
const canChat = (user) =>
  Boolean(gateway && user.role === "creator" && user.name.toLowerCase() === gateway.creator);
const sessionInfo = (user) => ({
  name: user.name,
  role: user.role,
  csrf: user.csrf,
  chatAvailable: canChat(user),
});
const root = fileURLToPath(new URL("./dist/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain",
};
const cookie = (value, age) =>
  `__Host-jarvis=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function actionStatus({ error }) {
  if (!error) return 200;
  if (["project_cap", "task_cap"].includes(error)) return 409;
  if (["project_missing", "task_missing"].includes(error)) return 404;
  return 400;
}
let pending = 0;
let chatPending = false;
createServer(async (req, res) => {
  const json = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (origin.protocol === "https:") res.setHeader("Strict-Transport-Security", "max-age=31536000");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "microphone=(self), camera=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  try {
    const url = new URL(req.url, origin);
    if (req.headers.host !== origin.host || url.origin !== origin.origin)
      return json(403, { error: "origin" });
    const path = url.pathname;
    if (!path.startsWith("/api/")) {
      if (req.method !== "GET") return json(405, { error: "method" });
      const target = resolve(root, "." + (["/", "/review"].includes(path) ? "/index.html" : path));
      if (
        (!localReview && (path === "/review" || target === resolve(root, "review.html"))) ||
        !target.startsWith(root) ||
        !Object.hasOwn(types, extname(target))
      )
        return json(404, { error: "missing" });
      let content;
      try {
        content = await readFile(target);
      } catch {
        return json(404, { error: "missing" });
      }
      res.writeHead(200, { "Content-Type": types[extname(target)] });
      return res.end(content);
    }
    const session = getSession(db, req.headers.cookie);
    if (req.method === "GET") {
      if (!session) return json(401, { error: "auth" });
      if (path === "/api/session") return json(200, sessionInfo(session));
      if (path === "/api/actions") {
        const projectId = url.searchParams.get("project");
        if (projectId === null) return json(200, actions.list(session.userId));
        const result = actions.listTasks(session.userId, projectId);
        return json(actionStatus(result), result);
      }
      if (path === "/api/documents") {
        const id = url.searchParams.get("id");
        if (id === null) return json(200, { files: documents.list(session.userId) });
        const document = documents.get(session.userId, id);
        if (!document) return json(404, { error: "file_missing" });
        const bytes = Buffer.from(document.payload);
        if (url.searchParams.get("preview") === "1") {
          return json(200, { name: document.name, text: bytes.toString("utf8") });
        }
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition":
            "attachment; filename*=UTF-8''" + encodeURIComponent(document.name),
        });
        return res.end(bytes);
      }
      if (path === "/api/memory") {
        if (url.searchParams.get("export") === "1") {
          res.setHeader(
            "Content-Disposition",
            'attachment; filename="jarvis-personal-memory.json"',
          );
        }
        return json(200, { notes: memory.list(session.userId) });
      }
      if (path === "/api/models") {
        if (!canChat(session)) return json(403, { error: "forbidden" });
        return json(200, models?.inspect() ?? { status: "unconfigured" });
      }
      if (path === "/api/admin") {
        if (session.role !== "creator") return json(403, { error: "forbidden" });
        return json(200, { users: db.prepare("SELECT name,role FROM users ORDER BY name").all() });
      }
      return json(404, { error: "missing" });
    }
    if (req.method !== "POST") return json(405, { error: "method" });
    if (req.headers.origin !== origin.origin || req.headers["content-type"] !== "application/json")
      return json(403, { error: "origin" });
    const chat = path === "/api/chat";
    const manageModels = path === "/api/models";
    const manageMemory = path === "/api/memory";
    const manageDocuments = path === "/api/documents";
    const executeAction = path === "/api/actions";
    if (
      chat ||
      manageModels ||
      manageMemory ||
      manageDocuments ||
      executeAction ||
      path === "/api/logout"
    ) {
      if (!session) {
        if (path === "/api/logout") res.setHeader("Set-Cookie", cookie("", 0));
        return json(401, { error: "auth" });
      }
      if (req.headers["x-csrf-token"] !== session.csrf) return json(403, { error: "csrf" });
      if (path === "/api/logout") {
        db.prepare("DELETE FROM sessions WHERE id=?").run(session.id);
        res.setHeader("Set-Cookie", cookie("", 0));
        return json(200, { ok: true });
      }
      if ((chat || manageModels) && !canChat(session)) return json(403, { error: "forbidden" });
    } else {
      if (!["/api/login", "/api/activate"].includes(path)) return json(404, { error: "missing" });
      if (pending >= 4 || rateLimit(db, "ip/" + req.socket.remoteAddress, 40))
        return json(429, { error: "limit" });
    }
    const chunks = [];
    let length = 0;
    const maxBody = manageDocuments ? documentBodyLimit : chat ? 24576 : 4096;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > maxBody) return json(413, { error: "invalid" });
      chunks.push(chunk);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks));
    } catch {
      return json(400, { error: "invalid" });
    }
    if (executeAction) {
      const result = actions.execute(session.userId, body);
      return json(actionStatus(result), result);
    }
    if (manageDocuments) {
      const error = documents.change(session.userId, body);
      if (error)
        return json(error === "file_missing" ? 404 : error === "file_cap" ? 409 : 400, { error });
      return json(200, { files: documents.list(session.userId) });
    }
    if (manageMemory) {
      const error = memory.change(session.userId, body);
      if (error)
        return json(error === "note_missing" ? 404 : error === "note_cap" ? 409 : 400, { error });
      return json(200, { notes: memory.list(session.userId) });
    }
    if (manageModels) {
      if (!models) return json(409, { error: "no_model" });
      if (!models.setPaused(body?.id, body?.paused)) return json(400, { error: "invalid" });
      return json(200, models.inspect());
    }
    if (chat) {
      const message = typeof body?.message === "string" ? body.message.trim() : "";
      if (!message || message.length > 4000) return json(400, { error: "message" });
      if (chatPending) return json(429, { error: "busy" });
      if (res.destroyed) return;
      chatPending = true;
      const cancel = new AbortController();
      const onClose = () => cancel.abort();
      res.once("close", onClose);
      try {
        const exclude = new Set();
        for (let retry = 0; retry < (models ? 2 : 1); retry++) {
          const attempt = models?.reserve(message, exclude);
          if (attempt?.error) {
            return json(attempt.error === "token_budget" ? 429 : 503, { error: attempt.error });
          }
          const upstream = await postResponses(
            gateway.port,
            {
              model: "openclaw:main",
              user: "shadverse-creator:" + gateway.creator,
              input: message,
              max_output_tokens: attempt?.route.maxOutputTokens ?? 2048,
            },
            gateway.token,
            120_000,
            attempt?.route.model,
            cancel.signal,
          ).catch(() => null);
          if (!upstream) {
            if (attempt) models.finish(attempt, "uncertain", null);
            if (cancel.signal.aborted) return;
            return json(502, { error: "gateway" });
          }
          if (upstream.statusCode !== 200) {
            if (attempt && upstream.statusCode === 400) {
              const error = await readGatewayJson(upstream, 4096).catch(() => null);
              // The Gateway rejects this exact model-visibility error before running the agent.
              const notAdmitted =
                error?.error?.type === "invalid_request_error" &&
                error.error.message ===
                  `Model '${attempt.route.model}' is not allowed for agent 'main'.`;
              models.finish(attempt, notAdmitted ? "rejected" : "uncertain", null);
              if (notAdmitted && retry === 0 && !cancel.signal.aborted) {
                exclude.add(attempt.route.model);
                continue;
              }
            } else {
              upstream.destroy();
              if (attempt) models.finish(attempt, "uncertain", null);
            }
            return json(upstream.statusCode === 409 ? 409 : 502, {
              error: upstream.statusCode === 409 ? "archived" : "gateway",
            });
          }
          const result = await readGatewayJson(upstream, 256 * 1024).catch(() => null);
          const usage = readUsage(result?.usage);
          const reply = (Array.isArray(result?.output) ? result.output : [])
            .filter((item) => item.type === "message" && item.role === "assistant")
            .flatMap((item) => item.content ?? [])
            .filter((part) => part.type === "output_text" && typeof part.text === "string")
            .map((part) => part.text)
            .join("\n")
            .trim();
          if (cancel.signal.aborted) {
            if (attempt) models.finish(attempt, "uncertain", usage);
            return;
          }
          const ok = result?.status === "completed" && reply && !reply.includes(gateway.token);
          if (attempt) models.finish(attempt, ok ? "completed" : "uncertain", usage);
          return ok ? json(200, { reply }) : json(502, { error: "gateway" });
        }
      } finally {
        res.off("close", onClose);
        chatPending = false;
      }
    }
    if (!validName(body?.name) || !validPassword(body.password))
      return json(400, { error: "invalid" });
    if (rateLimit(db, "user/" + body.name.toLowerCase(), 8) || pending >= 4)
      return json(429, { error: "limit" });
    pending++;
    try {
      if (path === "/api/activate") {
        if (
          typeof body.code !== "string" ||
          body.code.length !== 43 ||
          !(await addUser(db, body.name, body.password, "member", body.code))
        )
          return json(400, { error: "activation" });
        return json(201, { ok: true });
      }
      const user = await login(db, body.name, body.password);
      if (!user) return json(401, { error: "credentials" });
      if (session) db.prepare("DELETE FROM sessions WHERE id=?").run(session.id);
      res.setHeader("Set-Cookie", cookie(user.id, sessionAge));
      return json(200, sessionInfo(user));
    } finally {
      pending--;
    }
  } catch {
    return json(500, { error: "server" });
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`SHADVERSE JARVIS listening on loopback port ${port}`),
);

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
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
process.umask(0o077);
const db = openStore(process.env.JARVIS_STATE);
const port = Number(process.env.PORT || 3000);
const origin = new URL(process.env.JARVIS_ORIGIN || `http://localhost:${port}`);
if (
  !["http:", "https:"].includes(origin.protocol) ||
  (origin.protocol === "http:" && !["localhost", "127.0.0.1"].includes(origin.hostname))
)
  throw Error("Use HTTPS for an external application origin.");
const creatorUI = process.env.JARVIS_CREATOR_UI ? new URL(process.env.JARVIS_CREATOR_UI) : null;
if (
  creatorUI &&
  (creatorUI.protocol !== "https:" ||
    creatorUI.username ||
    creatorUI.password ||
    creatorUI.search ||
    creatorUI.hash)
)
  throw Error("Expected a clean HTTPS address for the paired Control UI.");
const sessionInfo = (user) => ({
  name: user.name,
  role: user.role,
  csrf: user.csrf,
  ...(user.role === "creator" && creatorUI ? { controlUI: creatorUI.href } : {}),
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
let pending = 0;
createServer(async (req, res) => {
  const json = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "microphone=(self), camera=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  try {
    if (req.headers.host !== origin.host) return json(403, { error: "origin" });
    const path = new URL(req.url, origin).pathname;
    if (!path.startsWith("/api/")) {
      if (req.method !== "GET") return json(405, { error: "method" });
      const target = resolve(root, "." + (["/", "/review"].includes(path) ? "/index.html" : path));
      if (!target.startsWith(root) || !Object.hasOwn(types, extname(target)))
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
      if (path === "/api/admin") {
        if (session.role !== "creator") return json(403, { error: "forbidden" });
        return json(200, { users: db.prepare("SELECT name,role FROM users ORDER BY name").all() });
      }
      return json(404, { error: "missing" });
    }
    if (req.method !== "POST") return json(405, { error: "method" });
    if (req.headers.origin !== origin.origin || req.headers["content-type"] !== "application/json")
      return json(403, { error: "origin" });
    if (path === "/api/logout") {
      if (!session) {
        res.setHeader("Set-Cookie", cookie("", 0));
        return json(401, { error: "auth" });
      }
      if (req.headers["x-csrf-token"] !== session.csrf) return json(403, { error: "csrf" });
      db.prepare("DELETE FROM sessions WHERE id=?").run(session.id);
      res.setHeader("Set-Cookie", cookie("", 0));
      return json(200, { ok: true });
    }
    if (!["/api/login", "/api/activate"].includes(path)) return json(404, { error: "missing" });
    if (pending >= 4 || rateLimit(db, "ip/" + req.socket.remoteAddress, 40))
      return json(429, { error: "limit" });
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 4096) return json(413, { error: "invalid" });
      chunks.push(chunk);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks));
    } catch {
      return json(400, { error: "invalid" });
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
      res.setHeader("Set-Cookie", cookie(user.id, sessionAge));
      return json(200, sessionInfo(user));
    } finally {
      pending--;
    }
  } catch {
    return json(500, { error: "server" });
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`SHADVERSE preview listening on loopback port ${port}`),
);

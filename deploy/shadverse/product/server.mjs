import { open, readFile } from "node:fs/promises";
import { createServer, request } from "node:http";
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
  origin.href !== origin.origin + "/" ||
  (origin.protocol === "http:" && !["localhost", "127.0.0.1"].includes(origin.hostname))
)
  throw Error("Use HTTPS for an external application origin.");
const localReview = ["localhost", "127.0.0.1"].includes(origin.hostname);
const gatewayCreator = process.env.JARVIS_GATEWAY_CREATOR?.toLowerCase();
const gatewayTokenFile = process.env.JARVIS_GATEWAY_TOKEN_FILE;
const gatewayPort = Number(process.env.JARVIS_GATEWAY_PORT || 18789);
let gatewayToken;
if (gatewayTokenFile || gatewayCreator) {
  if (
    !gatewayTokenFile?.startsWith("/") ||
    !validName(gatewayCreator) ||
    !Number.isInteger(gatewayPort) ||
    gatewayPort < 1 ||
    gatewayPort > 65535 ||
    gatewayPort === port
  )
    throw Error("Set the private Gateway token file, Creator username and loopback port.");
  const file = await open(gatewayTokenFile);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 4096 || info.uid !== process.getuid() || info.mode & 0o077)
      throw Error("Use an owner-only Gateway token file.");
    gatewayToken = (await file.readFile("utf8")).trim();
    if (!/^[!-~]{32,512}$/.test(gatewayToken)) throw Error("Invalid Gateway credential.");
  } finally {
    await file.close();
  }
}
const canChat = (user) =>
  Boolean(gatewayToken && user.role === "creator" && user.name.toLowerCase() === gatewayCreator);
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
    if (chat || path === "/api/logout") {
      if (!session) {
        if (!chat) res.setHeader("Set-Cookie", cookie("", 0));
        return json(401, { error: "auth" });
      }
      if (req.headers["x-csrf-token"] !== session.csrf) return json(403, { error: "csrf" });
      if (!chat) {
        db.prepare("DELETE FROM sessions WHERE id=?").run(session.id);
        res.setHeader("Set-Cookie", cookie("", 0));
        return json(200, { ok: true });
      }
      if (!canChat(session)) return json(403, { error: "forbidden" });
    } else {
      if (!["/api/login", "/api/activate"].includes(path)) return json(404, { error: "missing" });
      if (pending >= 4 || rateLimit(db, "ip/" + req.socket.remoteAddress, 40))
        return json(429, { error: "limit" });
    }
    const chunks = [];
    let length = 0;
    const maxBody = chat ? 24576 : 4096;
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
    if (chat) {
      const message = typeof body?.message === "string" ? body.message.trim() : "";
      if (!message || message.length > 4000) return json(400, { error: "message" });
      if (chatPending) return json(429, { error: "busy" });
      chatPending = true;
      try {
        const payload = Buffer.from(
          JSON.stringify({
            model: "openclaw:main",
            user: "shadverse-creator:" + gatewayCreator,
            input: message,
            max_output_tokens: 2048,
          }),
        );
        const upstream = await new Promise((resolveResponse, reject) => {
          // A fresh direct loopback connection keeps the owner credential off environment proxies.
          const call = request(
            {
              host: "127.0.0.1",
              port: gatewayPort,
              path: "/v1/responses",
              method: "POST",
              agent: false,
              signal: AbortSignal.timeout(120_000),
              headers: {
                Authorization: "Bearer " + gatewayToken,
                "Content-Type": "application/json",
                "Content-Length": payload.length,
              },
            },
            resolveResponse,
          );
          call.on("error", reject);
          call.end(payload);
        });
        if (upstream.statusCode !== 200) {
          upstream.destroy();
          return json(upstream.statusCode === 409 ? 409 : 502, {
            error: upstream.statusCode === 409 ? "archived" : "gateway",
          });
        }
        const responseChunks = [];
        let responseLength = 0;
        for await (const chunk of upstream) {
          responseLength += chunk.length;
          if (responseLength > 256 * 1024) return json(502, { error: "gateway" });
          responseChunks.push(chunk);
        }
        const result = JSON.parse(Buffer.concat(responseChunks));
        const reply = (result.output ?? [])
          .filter((item) => item.type === "message" && item.role === "assistant")
          .flatMap((item) => item.content ?? [])
          .filter((part) => part.type === "output_text" && typeof part.text === "string")
          .map((part) => part.text)
          .join("\n")
          .trim();
        if (result.status !== "completed" || !reply || reply.includes(gatewayToken))
          return json(502, { error: "gateway" });
        return json(200, { reply });
      } catch {
        return json(502, { error: "gateway" });
      } finally {
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

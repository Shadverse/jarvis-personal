import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { mkdirSync, realpathSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
export const sessionAge = 4 * 3600;
const dummySalt = token();
const hash = (password, salt) =>
  derive(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
export const validName = (name) => typeof name === "string" && /^[a-zA-Z0-9_.-]{3,48}$/.test(name);
export const validPassword = (password) =>
  typeof password === "string" && password.length >= 12 && Buffer.byteLength(password) <= 256;

export function openStore(dir) {
  if (!dir || !path.isAbsolute(dir))
    throw Error("Set JARVIS_STATE to a private absolute directory outside Git.");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (let here = realpathSync(dir); here !== path.dirname(here); here = path.dirname(here)) {
    const marker = path.join(here, ".git");
    if (
      statSync(marker, { throwIfNoEntry: false })?.isFile() ||
      existsSync(path.join(marker, "HEAD")) ||
      existsSync(path.join(marker, "index"))
    )
      throw Error("State belongs outside Git");
  }
  const info = statSync(dir);
  if (info.uid !== process.getuid() || info.mode & 0o077)
    throw Error("Use an owner-only state directory.");
  const db = new DatabaseSync(path.join(dir, "gate.sqlite"));
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL CHECK(role IN ('creator','member')), salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user INTEGER REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS codes(id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, n INTEGER NOT NULL, expires INTEGER NOT NULL);
  `);
  return db;
}
export async function addUser(db, name, password, role, code) {
  if (!validName(name) || !validPassword(password)) return false;
  const salt = token();
  const secret = await hash(password, salt);
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      role === "member" &&
      !db.prepare("DELETE FROM codes WHERE id=? AND expires>?").run(digest(code), Date.now())
        .changes
    ) {
      db.exec("ROLLBACK");
      return false;
    }
    db.prepare("INSERT INTO users(name,role,salt,hash) VALUES (?,?,?,?)").run(
      name,
      role,
      salt,
      secret.toString("hex"),
    );
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    if (error.errstr === "constraint failed") return false;
    throw error;
  }
}
export function invite(db) {
  const code = token();
  db.prepare("DELETE FROM codes WHERE expires<=?").run(Date.now());
  db.prepare("INSERT INTO codes VALUES (?,?)").run(digest(code), Date.now() + 86400000);
  return code;
}
export async function login(db, name, password) {
  const user = db.prepare("SELECT * FROM users WHERE name=?").get(name);
  const secret = await hash(password, user?.salt ?? dummySalt);
  if (!user || !timingSafeEqual(secret, Buffer.from(user.hash, "hex"))) return null;
  const id = token(),
    csrf = token();
  db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
  db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(
    digest(id),
    user.id,
    csrf,
    Date.now() + sessionAge * 1000,
  );
  return { id, csrf, name: user.name, role: user.role };
}
export function getSession(db, cookie = "") {
  const match = /(?:^|;\s*)__Host-jarvis=([\w-]{43})(?:;|$)/.exec(cookie);
  return (
    match &&
    db
      .prepare(
        "SELECT s.id,s.csrf,u.id AS userId,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user WHERE s.id=? AND s.expires>?",
      )
      .get(digest(match[1]), Date.now())
  );
}
export function rateLimit(db, key, limit) {
  const now = Date.now();
  db.prepare("DELETE FROM attempts WHERE expires<=?").run(now);
  const row = db
    .prepare("INSERT INTO attempts VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET n=n+1 RETURNING n")
    .get(digest(key), now + 600000);
  return row.n > limit;
}

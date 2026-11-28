import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./document-worker.py", import.meta.url));
const maximumOutput = 3_100_000;
export async function loadDocumentProcessor(python = process.env.JARVIS_DOCUMENT_PYTHON) {
  if (!python || !isAbsolute(python)) return null;
  let active = 0;
  async function run(payload) {
    if (active >= 2) return { error: "file_busy" };
    active++;
    try {
      return await new Promise((resolve) => {
        const child = spawn(python, ["-I", "-B", script], {
          env: { LANG: "C.UTF-8", PATH: "/usr/bin:/bin" },
          stdio: ["pipe", "pipe", "ignore"],
          signal: AbortSignal.timeout(8000),
          killSignal: "SIGKILL",
        });
        const chunks = [];
        let bytes = 0;
        child.stdout.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > maximumOutput) child.kill("SIGKILL");
          else chunks.push(chunk);
        });
        child.stdin.on("error", () => {});
        child.stdin.end(JSON.stringify(payload));
        child.on("error", () => {});
        child.on("close", (code) => {
          if (code !== 0 || bytes > maximumOutput) return resolve({ error: "file_processor" });
          try {
            resolve(JSON.parse(Buffer.concat(chunks)));
          } catch {
            resolve({ error: "file_processor" });
          }
        });
      });
    } finally {
      active--;
    }
  }
  const capabilities = await run({ operation: "probe" });
  return Array.isArray(capabilities.read) && Array.isArray(capabilities.write)
    ? { ...capabilities, run }
    : null;
}

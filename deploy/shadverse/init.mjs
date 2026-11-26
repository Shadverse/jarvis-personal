import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

process.umask(0o077);
const home = realpathSync(homedir());
for (let directory = home; ; directory = dirname(directory)) {
  const gitMarker = join(directory, ".git");
  if (
    statSync(gitMarker, { throwIfNoEntry: false })?.isFile() ||
    existsSync(join(gitMarker, "HEAD"))
  ) {
    throw new Error("Use a dedicated home directory outside the Git checkout.");
  }
  if (dirname(directory) === directory) break;
}

const state = join(home, ".openclaw-shadverse");
const workspace = join(state, "workspace");
const logs = join(state, "logs");
const config = JSON.parse(
  readFileSync(new URL("./openclaw.template.json", import.meta.url), "utf8"),
);
config.gateway.auth.token = randomBytes(32).toString("hex");
config.agents.defaults.workspace = workspace;
config.logging = { file: join(logs, "gateway.log") };

// Exclusive creation protects an existing state directory, including a symlink.
mkdirSync(state, { mode: 0o700 });
mkdirSync(join(workspace, "memory"), { recursive: true, mode: 0o700 });
mkdirSync(logs, { mode: 0o700 });
writeFileSync(
  join(workspace, "SOUL.md"),
  "# SHADVERSE JARVIS PERSONAL\n\nCreator Exclusive Edition · SHADVERSE ©\n\n" +
    "Reply in Persian when the Creator writes in Persian. Preserve the spelling of code and paths.\n",
  { mode: 0o600, flag: "wx" },
);
writeFileSync(join(workspace, "MEMORY.md"), "# Creator memory\n", {
  mode: 0o600,
  flag: "wx",
});
writeFileSync(join(state, "openclaw.json"), JSON.stringify(config, null, 2) + "\n", {
  mode: 0o600,
  flag: "wx",
});
console.log(`Initialized private OpenClaw state at ${state}`);

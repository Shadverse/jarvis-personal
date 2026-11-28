import { openStore, addUser, invite } from "./auth.mjs";
import { checkGateway } from "./gateway.mjs";
process.umask(0o077);

const [action, name] = process.argv.slice(2);
if (action === "check-gateway") {
  const status = await checkGateway();
  console.log(JSON.stringify({ status }));
  process.exitCode = status === "ready_for_live_review" ? 0 : 1;
} else {
  await manageAccounts();
}

async function manageAccounts() {
  const db = openStore(process.env.JARVIS_STATE);
  try {
    if (action === "invite") console.log(invite(db));
    else if (action === "revoke")
      db.prepare("DELETE FROM sessions WHERE user=(SELECT id FROM users WHERE name=?)").run(name);
    else if (action === "creator") {
      if (process.stdin.isTTY)
        throw Error("Supply the new password on stdin from a private source.");
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      if (
        !(await addUser(
          db,
          name,
          Buffer.concat(chunks)
            .toString()
            .replace(/\r?\n$/, ""),
          "creator",
        ))
      )
        throw Error("Invalid or existing account.");
    } else throw Error("Expected creator NAME, invite, revoke NAME, or check-gateway.");
  } finally {
    db.close();
  }
}

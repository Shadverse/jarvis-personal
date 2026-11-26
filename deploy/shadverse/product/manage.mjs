import { openStore, addUser, invite } from "./auth.mjs";
process.umask(0o077);
const db = openStore(process.env.JARVIS_STATE);
const [action, name] = process.argv.slice(2);
try {
  if (action === "invite") console.log(invite(db));
  else if (action === "revoke")
    db.prepare("DELETE FROM sessions WHERE user=(SELECT id FROM users WHERE name=?)").run(name);
  else if (action === "creator") {
    if (process.stdin.isTTY) throw Error("Supply the new password on stdin from a private source.");
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
  } else throw Error("Expected creator NAME, invite, or revoke NAME.");
} finally {
  db.close();
}

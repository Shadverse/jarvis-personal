import { openStore, addUser, invite } from "./auth.mjs";
import { checkGateway, loadGateway, probeResponses } from "./gateway.mjs";
import { loadVisionAdmission } from "./vision.mjs";
process.umask(0o077);

const [action, name] = process.argv.slice(2);
if (action === "check-vision-gateway") {
  const result = await checkVisionGateway();
  console.log(JSON.stringify(result));
  process.exitCode = result.status === "ready_for_live_review" ? 0 : 1;
} else if (action === "check-gateway") {
  const status = await checkGateway();
  console.log(JSON.stringify({ status }));
  process.exitCode = status === "ready_for_live_review" ? 0 : 1;
} else {
  await manageAccounts();
}

async function checkVisionGateway() {
  let creator;
  try {
    creator = await loadGateway();
  } catch {
    return { stage: "creator", status: "invalid_configuration" };
  }
  if (!creator) return { stage: "creator", status: "not_configured" };
  const status = await probeResponses(creator);
  if (status !== "ready_for_live_review") return { stage: "creator", status };
  let admission;
  try {
    admission = await loadVisionAdmission(creator, Number(process.env.PORT || 3000));
  } catch {
    return { stage: "vision_admission", status: "invalid_configuration" };
  }
  if (!admission) return { stage: "vision_admission", status: "not_configured" };
  return { stage: "vision", status: await probeResponses(admission) };
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
    } else
      throw Error(
        "Expected creator NAME, invite, revoke NAME, check-gateway, or check-vision-gateway.",
      );
  } finally {
    db.close();
  }
}

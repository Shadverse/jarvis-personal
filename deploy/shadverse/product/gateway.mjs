import { open } from "node:fs/promises";
import { request } from "node:http";
import { validName } from "./auth.mjs";

export async function loadGateway(env = process.env) {
  const creator = env.JARVIS_GATEWAY_CREATOR?.toLowerCase();
  const tokenFile = env.JARVIS_GATEWAY_TOKEN_FILE;
  if (!creator && !tokenFile) return null;
  const port = Number(env.JARVIS_GATEWAY_PORT || 18789);
  if (
    !tokenFile?.startsWith("/") ||
    !validName(creator) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    port === Number(env.PORT || 3000)
  ) {
    throw Error("Configure the private Gateway token file, Creator username and loopback port.");
  }
  const file = await open(tokenFile);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 4096 || info.uid !== process.getuid() || info.mode & 0o077)
      throw Error("Use an owner-only Gateway token file.");
    const token = (await file.readFile("utf8")).trim();
    if (!/^[!-~]{32,512}$/.test(token)) throw Error("Invalid Gateway credential.");
    return { creator, port, token };
  } finally {
    await file.close();
  }
}

export async function postResponses(port, payload, token, timeout) {
  const body = Buffer.from(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    // A fresh direct loopback connection keeps the owner credential off environment proxies.
    const call = request(
      {
        host: "127.0.0.1",
        port,
        path: "/v1/responses",
        method: "POST",
        agent: false,
        signal: AbortSignal.timeout(timeout),
        headers: {
          ...(token ? { Authorization: "Bearer " + token } : {}),
          "Content-Type": "application/json",
          "Content-Length": body.length,
        },
      },
      resolve,
    );
    call.on("error", reject);
    call.end(body);
  });
}

export async function readGatewayJson(response, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of response) {
    size += chunk.length;
    if (size > limit) throw Error("Gateway response exceeds the limit.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks));
}

export async function checkGateway() {
  let gateway;
  try {
    gateway = await loadGateway();
  } catch {
    return "invalid_configuration";
  }
  if (!gateway) return "not_configured";
  try {
    // An empty request fails the Responses schema before any model dispatch.
    // Check that anonymous access is denied before using the local credential.
    const anonymous = await postResponses(gateway.port, {}, null, 5000);
    const status = anonymous.statusCode;
    anonymous.destroy();
    if (status === 404) return "responses_unavailable";
    if (status !== 401) return "unexpected_anonymous_status";
    const authenticated = await postResponses(gateway.port, {}, gateway.token, 5000);
    const authenticatedStatus = authenticated.statusCode;
    if (authenticatedStatus !== 400) {
      authenticated.destroy();
      if (authenticatedStatus === 401 || authenticatedStatus === 403) return "credential_rejected";
      return "unexpected_authenticated_status";
    }
    const result = await readGatewayJson(authenticated, 4096);
    return result?.error?.type === "invalid_request_error"
      ? "ready_for_live_review"
      : "unexpected_validation_response";
  } catch {
    return "gateway_unreachable_or_invalid_response";
  }
}

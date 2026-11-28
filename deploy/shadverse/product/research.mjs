import { createHash, randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import { isIP } from "node:net";
import { isAbsolute } from "node:path";
import { postResearchTool, readGatewayJson, readGatewayToken } from "./gateway.mjs";

const lifetime = 300_000;
const credentials = (text, tokens, max) =>
  typeof text === "string" && !tokens.some((token) => text.includes(token))
    ? text.trim().slice(0, max)
    : "";

function publicHttps(value) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      isIP(host.replace(/^\[|\]$/g, "")) ||
      !host.includes(".") ||
      /(?:^|\.)(?:localhost|local|internal|lan|test|invalid|home\.arpa)\.?$/u.test(host)
    )
      return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

async function privateFile(path, maxSize) {
  if (typeof path !== "string" || !isAbsolute(path)) throw Error("Invalid research policy path.");
  const file = await open(path);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid() || stat.mode & 0o077 || stat.size > maxSize)
      throw Error("Use an owner-only research policy.");
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}

export async function openResearch(
  creator,
  productPort,
  path = process.env.JARVIS_RESEARCH_POLICY_FILE,
) {
  if (!path) return null;
  if (!creator) throw Error("Invalid research admission.");
  const policy = JSON.parse(await privateFile(path, 16_384));
  const { port, tokenFile, provider, expires, evidence, configFile, configSha256 } = policy;
  const now = Date.now();
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    port === creator.port ||
    port === productPort ||
    typeof tokenFile !== "string" ||
    !isAbsolute(tokenFile) ||
    typeof provider !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,47}$/u.test(provider) ||
    !Number.isSafeInteger(expires) ||
    expires <= now ||
    expires - now > 30 * 86_400_000 ||
    ![
      "officialAuth",
      "zeroMarginalCost",
      "noPaidFallbacks",
      "restrictedRuntime",
      "privateIngress",
    ].every((field) => evidence?.[field] === true)
  )
    throw Error("Invalid research admission.");
  const readConfig = async () => {
    const input = await privateFile(configFile, 256_000);
    if (createHash("sha256").update(input).digest("hex") !== configSha256)
      throw Error("The reviewed research configuration changed.");
    return JSON.parse(input);
  };
  const config = await readConfig();
  if (
    config.gateway?.bind !== "loopback" ||
    config.gateway.port !== port ||
    config.gateway.auth?.mode !== "token" ||
    config.gateway.http?.endpoints?.responses?.enabled === true ||
    config.agents?.list?.length !== 1 ||
    config.agents.list[0]?.id !== "research" ||
    !Array.isArray(config.tools?.allow) ||
    config.tools.allow.length !== 2 ||
    !["web_search", "web_fetch"].every((tool) => config.tools.allow.includes(tool))
  )
    throw Error("Use an isolated read-only research Gateway.");
  const token = await readGatewayToken(tokenFile);
  if (token === creator.token) throw Error("Research requires a separate credential.");
  const tokens = [token, creator.token];
  const contexts = new Map();
  let active = false;

  async function invoke(tool, args, signal) {
    const response = await postResearchTool(port, tool, args, token, signal);
    if (response.statusCode !== 200) {
      response.destroy();
      return null;
    }
    const packet = await readGatewayJson(response, 96 * 1024);
    return packet?.ok === true ? packet.result?.details : null;
  }

  return {
    clear(sessionId) {
      contexts.delete(sessionId);
    },
    async run(session, body, signal) {
      if (Date.now() >= expires) return { status: 503, error: "research_unavailable" };
      const operation = body?.operation;
      if (!["search", "read"].includes(operation))
        return { status: 400, error: "research_request" };
      const now = Date.now();
      for (const [key, value] of contexts) if (value.expires <= now) contexts.delete(key);
      const query = operation === "search" ? credentials(body.query, tokens, 301) : "";
      const context = contexts.get(session.id);
      const source =
        operation === "read" && context?.owner === session.userId
          ? context.sources.find(({ id }) => id === body.id)
          : null;
      if (operation === "search" && (!query || query.length > 300))
        return { status: 400, error: "research_request" };
      if (operation === "read" && !source) return { status: 404, error: "research_source" };
      if (source?.read) return { status: 200, source: source.read };
      if (active) return { status: 429, error: "busy" };
      active = true;
      try {
        try {
          await readConfig();
        } catch {
          return { status: 503, error: "research_unavailable" };
        }
        if (signal.aborted) return;
        if (operation === "search") {
          contexts.delete(session.id);
          const details = await invoke("web_search", { query, count: 4 }, signal);
          if (
            details?.kind !== "results" ||
            details.provider !== provider ||
            !Array.isArray(details.results) ||
            details.externalContent?.untrusted !== true ||
            details.externalContent?.wrapped !== true ||
            details.externalContent?.source !== "web_search"
          )
            return { status: 502, error: "research_failed" };
          const seen = new Set();
          const sources = [];
          for (const item of details.results.slice(0, 12)) {
            const url = publicHttps(credentials(item?.url, tokens, 2001));
            if (!url || seen.has(url)) continue;
            sources.push({
              id: randomUUID(),
              url,
              title: credentials(item.title, tokens, 220) || url,
              excerpt: credentials(item.snippet, tokens, 900),
              published: credentials(item.published, tokens, 80),
            });
            seen.add(url);
            if (sources.length === 4) break;
          }
          if (signal.aborted) return;
          if (!contexts.has(session.id) && contexts.size >= 32)
            contexts.delete(contexts.keys().next().value);
          contexts.set(session.id, { owner: session.userId, expires: now + lifetime, sources });
          return { status: 200, sources, checkedAt: now };
        }
        const details = await invoke(
          "web_fetch",
          { url: source.url, extractMode: "text", maxChars: 6000 },
          signal,
        );
        const url = publicHttps(credentials(details?.finalUrl, tokens, 2001));
        const excerpt = credentials(details?.text, tokens, 6000);
        if (
          !url ||
          !excerpt ||
          details.status < 200 ||
          details.status > 299 ||
          details.externalContent?.untrusted !== true ||
          details.externalContent?.wrapped !== true ||
          details.externalContent?.source !== "web_fetch"
        )
          return { status: 502, error: "research_failed" };
        if (signal.aborted) return;
        const read = {
          id: source.id,
          url,
          title: credentials(details.title, tokens, 220) || source.title,
          excerpt,
          checkedAt: Date.now(),
          truncated: details.truncated === true,
        };
        source.read = read;
        return { status: 200, source: read };
      } catch {
        if (!signal.aborted) return { status: 502, error: "research_failed" };
      } finally {
        active = false;
      }
    },
  };
}

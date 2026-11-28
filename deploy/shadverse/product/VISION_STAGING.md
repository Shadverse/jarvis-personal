# Restricted vision staging

Vision dispatch defaults to disabled. Capture and preview do not require a provider. Use synthetic images for private acceptance. The product does not write frames, prompts or replies from vision to SQLite. The upstream `store` field cannot disable OpenClaw retention, so use private, disposable OpenClaw state and apply the reviewed cleanup policy there.

## Separate runtime

1. Run the existing Creator staging preflight with `node manage.mjs check-gateway` and require `ready_for_live_review`. Use a separate OpenClaw process and service identity, separate state and workspace, and a distinct token on a different IPv4 loopback port. Expose only the SHADVERSE product through staging HTTPS. Neither OpenResponses endpoint belongs on the reverse proxy.
2. Configure one agent named `vision`, `gateway.bind: "loopback"`, token auth, and `gateway.http.endpoints.responses.enabled: true`. Set global `tools.deny: ["*"]`. Keep `commands.bash` and elevated tools off and clear all model fallbacks. The browser question is sent in a quoted field rather than as a direct chat command. Disable channel bindings, nodes, browser, cron, skills, MCP, hooks and command access. Do not copy the Creator's workspace, agent state, secrets, credential files or environment. Restrict the service account's filesystem and network access to its disposable storage and the exact approved inference endpoint.
3. Verify the **running** port uses that exact configuration and effective deny-all tool policy. Inspect its tool-resolution evidence with a synthetic untrusted-text image and an authorized zero-cost provider. The request must return text and must make no tool calls. A client `tools: []`, a scope header with a shared secret, and the product's config-file check alone do not prove effective execution policy. Verify again if the service, runtime environment, configuration or provider changes.
4. Use `openclaw models list --agent vision --json` on the isolated instance. Prepare a separate model policy using [the existing policy format](MODEL_POLICY.md). Verify official authentication, vision and Persian support, current eligibility and zero marginal cost. Disable upstream model/provider fallback and verify that automatic utility calls, if present, can only use the approved zero-cost route. Document that evidence. No image route automatically falls back. Responses without usable usage receipts keep their full reservation.
5. Keep the private files outside Git. Set `JARVIS_VISION_ADMISSION_FILE` to an absolute owner-only JSON file. It requires `port`, `tokenFile`, `configFile` (a readable copy of the exact deployed JSON), `configSha256`, `modelPolicyFile` and `expires` (epoch milliseconds, within 30 days). Set `evidence.phaseAPreflight`, `privateIngress`, `effectiveDenyAllTools`, `noPaidFallbacks`, `noCostRoute`, and `privateRetention` to true only once verified. Optional `evidence.imageContinuity` enables image-free follow-ups only after a real provider test verifies image retention in that same session. The product checks the config digest before each dispatch.
6. Optional `imageSide` (128–768 pixels), `imageBytes` (16,384–2,500,000), and `sessionMs` (30–600 seconds in milliseconds) tighten the defaults. The [isolated staging proxy example](PHASE_04_STAGING.md) gives `/api/vision` its own 3400 KiB request ceiling. Keep ordinary proxy routes unchanged.
7. From the archived product directory, run `node manage.mjs check-vision-gateway` with the approved Creator and vision environment. It checks the Creator endpoint first. If that passes, it validates the pinned vision admission and sends two empty requests to the separate loopback endpoint. Expect `{"stage":"vision","status":"ready_for_live_review"}`. Only status codes are emitted. This command does not open the product database, enqueue inference, or establish effective tool policy.
8. Test with one synthetic image and a short Persian question, then a related follow-up. Verify same-session image reuse only when enabled. Confirm HTTP rejection for member/other sessions, malformed PNG, altered context, stale admission, oversized body and exhausted token budget. Verify browser cancellation closes the upstream connection and document any provider-side limit. Confirm Gateway policy and retention evidence before classifying the route as live.

Product HTTP fixtures demonstrate admission checks, normalized image bytes, model selection, session isolation, accounting and loopback cancellation. They do not attest a deployed tool policy, provider capabilities, or pricing.

## Redacted token evidence

In the disposable staging state only, run the following read-only query directly before and after the two synthetic visual turns. Report the deltas. It prints aggregate counters and contains no request content, route names or credentials. The table exists after the admitted app has started.

```bash
node --input-type=module -e '
  import { DatabaseSync } from "node:sqlite";
  import { join } from "node:path";
  const db = new DatabaseSync(join(process.env.JARVIS_STATE, "gate.sqlite"), { readOnly: true });
  const utcDay = Math.floor(Date.now() / 86400000) * 86400000;
  console.log(JSON.stringify(db.prepare(`
    SELECT COUNT(*) AS attempts,
      COALESCE(SUM(input),0) AS measuredInput,
      COALESCE(SUM(output),0) AS measuredOutput,
      COALESCE(SUM(total),0) AS measuredTotal,
      COALESCE(SUM(CASE WHEN total IS NULL AND status <> ? THEN reserved ELSE 0 END),0) AS unmeasuredReserve
    FROM model_attempts WHERE route LIKE ? AND started >= ?
  `).get("rejected", "vision:%", utcDay)));
  db.close();
'
```

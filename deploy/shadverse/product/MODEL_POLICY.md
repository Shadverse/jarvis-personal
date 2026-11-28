# SHADVERSE JARVIS Creator model policy

Managed orchestration is an opt-in for private staging. The existing Creator chat bridge runs as before when `JARVIS_MODEL_POLICY_FILE` is unset. Managed mode accepts a metadata-only JSON file by absolute path, owned by the service account with mode 0600. Provider authentication and credentials stay within the Creator’s OpenClaw runtime.

Export the catalog on the authorized OpenClaw host with `openclaw models list --agent main --json`. Put that JSON object under `catalog` in the policy. SHADVERSE reads only the discovered model key, modalities, context window and availability. Catalog discovery alone grants no route permission.

A closed starting policy:

```json
{
  "dailyTokens": 100000,
  "dailySpendMicros": 0,
  "catalog": { "models": [] },
  "routes": []
}
```

Add entries with the following fields after reviewing the selected model:

| Field | Values |
| --- | --- |
| `id` | Distinct lowercase route ID, such as `local-chat`. |
| `model` | Exact OpenClaw catalog key, including the provider prefix. |
| `authentication` | `local`, `codex`, `siwc` or `api-key`. Metadata only. |
| `cost` | `free`, `paid` or `unknown`. Only verified free routes can dispatch. |
| `languages` | `fa` and/or `en`. Register Persian after confirming support. |
| `tasks` | `chat`, `analysis`, `code` and/or `translation`. |
| `priority` | Integer 0–1000, lower first within the same task match. |
| `maxOutputTokens` | Integer 1–2048. Sent as the documented OpenResponses output limit. |
| `verification` | Boolean fields `authentication`, `eligibility`, `noCharge` and `gatewayFallbacksDisabled`. All must be true before admission. |

Verify the exact provider grant and whether the account can incur usage charges before setting the verification fields. Current account eligibility cannot be inferred from a ChatGPT plan name or an installed credential. OpenClaw documents Codex authorization, eligible Sign in with ChatGPT and separately billed Platform API authentication. For Ollama, verify the approved local endpoint, model and operation on the isolated Creator host. Check agent tools, retries and model fallbacks on that same runtime before attesting to zero cost. Keep paid and unknown-cost entries held. The product rejects ongoing spend above zero. [OpenClaw authentication](../../../docs/providers/openai/authentication.md) · [OpenResponses model override](../../../docs/gateway/openresponses-http-api.md)

On private staging, export `JARVIS_MODEL_POLICY_FILE` and start the SHADVERSE product with its existing Creator Gateway configuration. In Creator administration, inspect route availability, observed health and usage, and pause or resume eligible routes. `GET /api/models` reads the same view. `POST /api/models` requires the existing Creator session, product origin and CSRF token and accepts only `{ "id": "...", "paused": true }` or its resume form. These operations do not alter provider authentication or approve billing.

Persian character input selects Persian-compatible routes. Leading task verbs select the task, with chat routes eligible as general alternatives. SHADVERSE sends the server-selected model override to the existing `main` agent, retaining its stable conversation key. Automatic fallback is limited to one alternate after OpenClaw’s exact pre-admission model rejection. Ambiguous dispatch or response failures are not retried.

The ledger contains route IDs, model keys, timestamps, state, latency and token counts. It excludes prompts, replies and secrets. The daily UTC limit reserves the discovered context window plus the requested output cap before dispatch. Measured usage settles the reservation. An unmeasured or ambiguous attempt holds its reservation for that day. A measured overrun pauses the route. OpenResponses describes its output cap as provider-dependent. Review the Gateway’s actual execution and retries before claiming a provider-enforced token cap. The ledger reports product-side admission and measured usage, not provider invoices.

For live acceptance, use the [queue](../../../LIVE_ACCEPTANCE_QUEUE.md).


Managed route metadata distinguishes text, image and multimodal input. The model inventory alone cannot verify standalone recognition or speech synthesis. Those capabilities stay unverified in the provider registry. The current product only uses its existing local Persian browser engines for speech. Vision dispatch uses a separately approved catalog and credential, as described in [Restricted vision staging](VISION_STAGING.md).

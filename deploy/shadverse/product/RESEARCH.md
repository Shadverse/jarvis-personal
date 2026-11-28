# Restricted OpenClaw research

Research is disabled by default. The product exposes only source search and explicit page reading. Each search returns up to four cited sources. Only listed, session-bound HTTPS citations can be passed to the upstream page reader. Results expire after five minutes and are displayed as text. Provider summaries without structured results, synthetic prices and arbitrary URL requests are outside this slice.

The adapter uses the pinned OpenClaw `POST /tools/invoke` contract with fixed `agentId: "research"`. Its allowable calls are `web_search(query,count:4)` and `web_fetch(url,extractMode:"text",maxChars:6000)`. Browser input does not select a tool, model, agent or upstream endpoint. Results and extracts stay outside the privileged Creator conversation. The browser can cancel the active read request by closing it.

## Deferred private acceptance

After Creator authorization, use a distinct loopback Gateway, private credential, service identity and state directory. Configure exactly one `research` agent, `tools.allow: ["web_search","web_fetch"]`, OpenResponses disabled, and no browser, shell, messaging, device or scheduled capabilities. Confirm the effective policy through the actual runtime before creating an admission file. Keep the upstream loopback-only, out of public proxies, and preserve OpenClaw's blocked-network and redirect checks for `web_fetch`. Verify redirect handling before testing external reads.

Set owner-only `JARVIS_RESEARCH_POLICY_FILE` to a JSON file with `port`, `tokenFile`, `provider`, `configFile`, `configSha256`, and `expires` (UTC epoch milliseconds within 30 days). The exact provider must return structured OpenClaw search results. `evidence.officialAuth`, `zeroMarginalCost`, `noPaidFallbacks`, `restrictedRuntime` and `privateIngress` must reflect verified facts. Assess both search and page reader fallback paths for potential billing. Runtime config file and token remain outside Git.

Validate one public test query and one read of a returned citation. Verify current source URL, retrieval time, exact provider, redaction, request bounds, cancellation, account isolation, effective network policy and zero charges. Do not use customer data in acceptance. Local fixtures cover the product route and payload shape only.

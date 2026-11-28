# SHADVERSE JARVIS functional status

**Branch** `feature/shadverse-product-recovery`
**Reference baseline** `c23824d5821ddb4a260c6e13c882cc25fe5bc628`
**Active milestone** Phase A · Creator Gateway staging acceptance
**Graphics** Frozen. The current interface and isolated hologram preview are retained.

Statuses apply to the SHADVERSE product. Upstream OpenClaw capability alone does not establish a working SHADVERSE integration.

| Phase | Capability | Status | Evidence or gap |
| --- | --- | --- | --- |
| A | Persian Gate, registration-code activation, secure session, sign-out and session revocation | VERIFIED WORKING | Isolated product auth suite, including browser sign-in and sign-out. Production cutover is outside this evidence. |
| A | Creator-only Gateway bridge, single login, server-held token, stable conversation routing | PARTIALLY IMPLEMENTED | The product bridge exists. Local endpoint fixtures cover account isolation, credential boundaries and stable routing. |
| A | Gateway staging preflight | VERIFIED WORKING | Against an isolated HTTP fixture, the operator command checks that the endpoint rejects an anonymous body and rejects an authenticated empty body at request validation. A response from this check is independent of live inference. |
| A | Live Persian inference and conversation continuity on the selected Creator route | BLOCKED | Historical staging evidence exists for an earlier revision. Current acceptance needs an authorized private Gateway and an approved provider route. |
| B | Provider-independent catalog and account authentication | PARTIALLY IMPLEMENTED | OpenClaw manages the Creator provider. SHADVERSE uses one configured agent. Authorized ChatGPT, API and Ollama routes have no product-level eligibility checks. |
| B | Task-aware and free-first routing, fallback, health monitoring, token and spending limits, usage accounting | MISSING | No routing or accounting owner exists in the product. Provider terms and route authorizations require verification before activation. |
| C | Browser microphone permission, microphone analysis, audio lifecycle, text fallback | VERIFIED WORKING | Prior local browser checks inspected input levels and microphone track release. |
| C | Prerecorded playback and demonstration voice states | MOCKED | A real prerecorded asset and illustrative state controls simulate interaction. |
| C | Persian STT, inference-to-TTS, streaming, continuous turns, voice activity, interruption and cancellation | MISSING | No end-to-end voice transport, speech recognition or synthesis is connected. |
| D | Persistent Creator session context | PARTIALLY IMPLEMENTED | The existing OpenClaw session owns context. The product does not restore displayed turns on reload. |
| D | Preferences, personal and project memory, retrieval, long-term knowledge, search, edit, delete, export and backup | MISSING | Product storage and per-user isolation are absent. Existing upstream operator capabilities require a product integration. |
| E | Attachment selection and local image thumbnails | PARTIALLY IMPLEMENTED | Local selection and preview exist. The product rejects inference requests with attachments. |
| E | Image and screenshot understanding, documents, PDFs, spreadsheets, uploads, secure storage, camera, voice attachments and authorized visual search | MISSING | No product ingestion or model dispatch for these formats. |
| F | Provider-backed image, video, audio and music creation, documents, presentations, spreadsheets and downloadable artifacts | MISSING | Product capability catalog and generation adapters are absent. |
| G | Existing private OpenClaw tool and paired-device access | PARTIALLY IMPLEMENTED | The upstream operator path is separate. There is no product permission layer for application launching, files, browser actions, commands, desktop companion, mobile actions or external tools. |
| G | Project and task management | PARTIALLY IMPLEMENTED | Project and note interactions live in page memory. Durable task execution and management are absent. |
| H | Email, calendar, web search, GitHub, cloud storage, messaging, APIs and MCP integrations | MISSING | Product connector authorization, scoped accounts and permission UI are absent. |
| I | Reminders, schedules, workflows, triggers, job execution and recovery, cancellation, notifications, audit and emergency stop | MISSING | No product job subsystem. Existing OpenClaw scheduling has no SHADVERSE admission or lifecycle integration. |
| J | Creator role, read-only directory and operator registration codes and revocation | PARTIALLY IMPLEMENTED | Creator and member roles are present. Operator commands and the directory cover limited administration. |
| J | Administrator role, suspension, provider and permission management, usage, spend, audit, security monitoring and emergency controls | MISSING | Product enforcement and administrative operations are absent. |
| K | Free, Pro and Ultra monthly and annual presentation | MOCKED | Displayed tier offers have no entitlements or checkout. |
| K | Registration-code activation and Creator credential separation | PARTIALLY IMPLEMENTED | Activation is enforced. The Creator bridge denies member accounts. Commercial isolated runtimes are an approved architecture, with implementation pending. |
| K | Entitlements, model restrictions, limits, lifecycle, isolated tenants and payments | MISSING | No server-enforced commercial subscription or billing pipeline. |
| Cross-cutting | Persian-first, RTL, headings, branding and accessible mobile interaction | PARTIALLY IMPLEMENTED | Persian Gate and direction handling are implemented. Prior browser coverage found an existing narrow-mobile composer layout failure. No design changes during the freeze. |

No production deployment, database migration, credential grant, or paid-provider activation is part of this milestone.


## Phase A checkpoint

The application and operator command share the existing server-side token-file validation and direct loopback transport. The browser uses the SHADVERSE session and receives no Gateway credential. The same Creator conversation key reaches the Gateway after sign-out and sign-in. No new data retention, browser permission, dependencies, or authentication rules were added.

**Evidence.** The targeted product auth and assistant suites passed eight tests on Node 24. The assistant proof uses a local HTTP fixture with synthetic Persian turns. It proves invariant routing across two SHADVERSE sessions, anonymous denial, authenticated schema rejection, and token-safe error reporting. Earlier live acceptance is historical evidence only.

**Resources.** No model calls or fees. The preflight sends at most two small requests to IPv4 loopback, with a five-second timeout per request. It does not open the SHADVERSE database.

**Continuation.** Use the reviewed commit in the [private staging procedure](deploy/shadverse/product/PHASE_04_STAGING.md), with the existing approved Creator-only Gateway configuration and a separately confirmed no-cost model route. Run `node manage.mjs check-gateway` on that host and require `ready_for_live_review`. Sign in through staging HTTPS using the Persian Gate, send a synthetic Persian message with a unique short marker, sign out and back in, then ask for the marker in Persian. Verify the live replies and continuity, denied member access, and absence of Gateway credentials in browser traffic. Record the reviewed commit and redacted acceptance evidence here. Continue to Phase B after this acceptance.

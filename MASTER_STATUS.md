# SHADVERSE JARVIS functional status

**Branch** `feature/shadverse-product-recovery`
**Reference baseline** `c23824d5821ddb4a260c6e13c882cc25fe5bc628`
**Active milestone** Phase E · Private text-document intake

**Latest verified remote checkpoint before Phase E** `ba1f0cbb561f3941073d4fc3d4fee2d4ab4bda21`

**Phase A live acceptance** PENDING. The Phase A checkpoint is on the remote branch.
**Graphics** Frozen. The current interface and isolated hologram preview are retained.

Statuses apply to the SHADVERSE product. Upstream OpenClaw capability alone does not establish a working SHADVERSE integration.

| Phase | Capability | Status | Evidence or gap |
| --- | --- | --- | --- |
| A | Persian Gate, registration-code activation, secure session, sign-out and session revocation | VERIFIED LOCAL | Isolated product auth suite, including browser sign-in and sign-out. Production cutover is outside this evidence. |
| A | Creator-only Gateway bridge, single login, server-held token, stable conversation routing | PARTIALLY IMPLEMENTED | The product bridge exists. Local endpoint fixtures cover account isolation, credential boundaries and stable routing. |
| A | Gateway staging preflight | VERIFIED LOCAL | Against an isolated HTTP fixture, the operator command checks that the endpoint rejects an anonymous body and rejects an authenticated empty body at request validation. A response from this check is independent of live inference. |
| A | Live Persian inference and conversation continuity on the selected Creator route | BLOCKED | Historical staging evidence exists for an earlier revision. Current acceptance needs an authorized private Gateway and an approved provider route. |
| B | Provider registry, capability discovery, secure configuration and Creator administration | PARTIALLY IMPLEMENTED | Managed mode reads OpenClaw catalog metadata and a private operator policy. Creator can list, pause and resume eligible routes. Actual account eligibility remains pending. |
| B | Task-aware free-only routing, fallback, health monitoring, token and spending limits, usage accounting | PARTIALLY IMPLEMENTED | Managed text routing uses the same Creator agent. A local HTTP fixture exercised selection, safe fallback, health and budget accounting. Spending stays at zero. Live provider receipts and cap behavior are pending. |
| C | Browser microphone permission, microphone analysis, audio lifecycle, text fallback | VERIFIED LOCAL | Prior local browser checks inspected input levels and microphone track release. |
| C | Prerecorded playback and demonstration voice states | MOCKED | A real prerecorded asset and illustrative state controls simulate interaction. |
| C | Single Persian voice turn, speech-to-chat, local synthesis and cancellation | IMPLEMENTED — LIVE ACCEPTANCE PENDING | Browser and Gateway fixtures exercised the signed-in path, local-only requirements, disconnect propagation and text fallback. Actual Persian audio, live inference and native playback require an authorized staging device. |
| C | Streaming speech, hands-free conversation, device selection and voice activity detection | MISSING | The current implementation handles one explicit turn. |
| D | Persistent Creator session context | PARTIALLY IMPLEMENTED | The existing OpenClaw session owns context. The product does not restore displayed turns on reload. |
| D | Explicit personal notes, text search, edit, delete and export | VERIFIED LOCAL | Saved in the private product SQLite store by authenticated owner. The API fixture checked sign-out and sign-in persistence, persisted bytes on a separate database connection, and cross-account read or mutation denial. |
| D | Preferences, project memory, retrieval into inference, long-term knowledge and managed backup | MISSING | Existing upstream operator capabilities require a scoped product integration. |
| E | Attachment selection and local image thumbnails | PARTIALLY IMPLEMENTED | Local selection and preview exist. The product rejects inference requests with attachments. |
| E | Private TXT, Markdown and CSV storage, plain-text preview, download and deletion | VERIFIED LOCAL | The signed-in product API fixture checked exact downloaded bytes, UTF-8 and filename validation, size enforcement, CSRF and cross-account denial. |
| E | Document inference, PDFs, structured spreadsheets, vision, camera, voice and visual search | MISSING | Existing Creator-wide tool authority makes untrusted-file inference a separate restricted-adapter milestone. |
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

**Continuation.** Use the reviewed commit in the [private staging procedure](deploy/shadverse/product/PHASE_04_STAGING.md), with the existing approved Creator-only Gateway configuration and a separately confirmed no-cost model route. Run `node manage.mjs check-gateway` on that host and require `ready_for_live_review`. Sign in through staging HTTPS using the Persian Gate, send a synthetic Persian message with a unique short marker, sign out and back in, then ask for the marker in Persian. Verify the live replies and continuity, denied member access, and absence of Gateway credentials in browser traffic. Record the reviewed commit and redacted acceptance evidence here. Phase B local work can proceed while live acceptance is pending.


## Phase B checkpoint

Managed orchestration is opt-in through an owner-only operator policy. No provider was enabled in this environment. The existing Creator Gateway remains the only inference transport. Commercial users cannot access its routes or credentials. A targeted HTTP fixture exercised Persian task selection, rejection of browser-supplied overrides, one pre-admission fallback, Creator-only pause and resume, token accounting, and a refusal after the unmeasured reservation exhausted the budget. The fixture did not call a real provider.

See the [model policy](deploy/shadverse/product/MODEL_POLICY.md) and [live acceptance queue](LIVE_ACCEPTANCE_QUEUE.md). Next independent milestone: the Persian speech path with an authorized local engine and text fallback.


## Phase C checkpoint

In the authenticated Creator Voice screen, the microphone control runs one Persian turn. Recognition requires the browser to report an available local `fa-IR` pack, and playback uses a Persian voice marked local. The transcript goes through the existing authenticated chat route. Replies also appear in Text Chat. Cancel, navigation and page hiding terminate the current browser work. The product closes the active Gateway connection if the browser disconnects. Live provider abort behavior remains a separate check.

**Local proof.** The targeted Chromium test used injected speech fixtures and a local HTTP Gateway fixture. It checked that recognition and playback remain local, the synthetic Persian transcript traverses the authenticated production route, unavailable recognition sends no inference request, and cancel closes the active Gateway connection. No provider was contacted and no actual Persian audio was recognized.

**Next independent milestone.** Persist explicitly saved personal memory notes under the authenticated account, with local ownership tests.


## Phase D checkpoint

Signed-in users can save, search, edit, delete and export their own explicit notes from Workspace → Memory with no project selected. Notes stay in the owner-only SHADVERSE SQLite state directory across sign-out. Project notes keep their existing local behavior. The API scopes list, update, delete and export to the authenticated account, including when the caller is the Creator, and requires CSRF on writes. Each account has a 100-note cap. Only the explicit Add action saves a note. The product does not send memory to an inference provider.

**Next independent milestone.** Add explicit local document upload and download with ownership and quota enforcement before connecting any document to the Gateway.


## Phase E checkpoint

Signed-in Workspace → Files supports explicit UTF-8 text upload, literal preview, download and confirmed delete. Account identity scopes all file operations. The store enforces 1 MiB per file, 50 files and 10 MiB per account. Files are stored as bytes with generated IDs and are never executed or dispatched to inference. The targeted HTTP test passed, including denial of invalid filenames, invalid UTF-8, oversized files and cross-account access. Production proxy and protected storage remain part of private staging acceptance.

**Next independent milestone.** Add local downloadable creation using explicit draft content, without enabling external generation.

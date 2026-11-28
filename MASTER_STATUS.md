# SHADVERSE JARVIS functional status

**Branch** `feature/shadverse-product-recovery`
**Reference baseline** `c23824d5821ddb4a260c6e13c882cc25fe5bc628`
**Active milestone** Functional completion · Device inventory and Creator Bootstrap

**Verified remote baseline for live integration** `320c5619f2cfa1510453bf362f17d3e31487f5d7`

**Phase A live acceptance** PENDING. The Phase A checkpoint is on the remote branch.
**Graphics** Frozen. The current interface and isolated hologram preview are retained.

[Master development directive](MASTER_DEVELOPMENT_DIRECTIVE.md) · [P0 directive](P0_MULTIMODAL_DIRECTIVE.md) · [Upstream capability map](UPSTREAM_CAPABILITY_MAP.md)

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
| C | Controlled continuous Persian voice | LOCAL FIXTURE; LIVE PENDING | Opt-in foreground loop starts listening again after local playback ends; recognition stops at the final result. Per-listen silence timeout and session timeout bound microphone use. Independent VAD and background listening are not implemented. |
| D | Persistent Creator session context | PARTIALLY IMPLEMENTED | OpenClaw keeps its stable Creator session. The product stores completed text and voice turns per Creator and restores them after reload or sign-in. HTTP and Chromium fixtures passed. |
| D | Explicit personal notes, text search, edit, delete and export | VERIFIED LOCAL | Saved in the private product SQLite store by authenticated owner. The API fixture checked sign-out and sign-in persistence, persisted bytes on a separate database connection, and cross-account read or mutation denial. |
| D | Project notes and explicit retrieval into Creator text chat | VERIFIED LOCAL | The HTTP Gateway fixture checked personal and project note selection, exact owner/project/revision boundaries and separate sessions for selected-note turns. Live inference remains pending. |
| D | Consent-based relevance retrieval, preferences and persistent knowledge | VERIFIED LOCAL | Creator previews up to three relevant eligible notes and optional prior questions from the same owned scope. Exact revisions are checked before dispatch. Managed backup remains a separate milestone. |
| E | Browser camera, selected-frame screen capture and screenshot upload | VERIFIED LOCAL | Authenticated browser fixture tested permission denial, facing switch, preview, capture, screen shutdown, upload fallback, route navigation and mobile RTL. Real device acceptance is pending. |
| E | Selected visual context and Persian voice questions | LOCAL FIXTURE; LIVE PENDING | Shared vision endpoint accepts an explicit frame or bounded follow-up. Continuous voice alternates local recognition and synthesis; it never uploads a live feed. |
| E | Private TXT, Markdown and CSV storage, plain-text preview, download and deletion | VERIFIED LOCAL | The signed-in product API fixture checked exact downloaded bytes, UTF-8 and filename validation, size enforcement, CSRF and cross-account denial. |
| E | Restricted OpenResponses vision adapter | LOCAL FIXTURE; LIVE DISABLED BY DEFAULT | Separate port and credential, reviewed config pin, deny-all policy admission, PNG normalization, authorized model selection, usage and session isolation. |
| E | Private PDF, Office, CSV, text and image processing and downloadable reports | VERIFIED LOCAL | Real library parsing and generated PDF/DOCX/XLSX/PPTX files passed reader checks with synthetic inputs. OCR, model-based reasoning and visual search remain pending. |
| F | Printable draft documents and personal-note spreadsheets | VERIFIED LOCAL | Standalone HTML and UTF-8 CSV generated in the browser from explicit workspace data. Output escaping and CSV protection passed the local artifact test. |
| F | Provider-backed image, video, audio, music, presentations and document generation | MISSING | Product capability catalog and generation adapters are absent. |
| G | Existing private OpenClaw tool and paired-device access | PARTIALLY IMPLEMENTED | The upstream operator path is separate. There is no product permission layer for application launching, files, browser actions, commands, desktop companion, mobile actions or external tools. |
| G | Account-scoped project creation and listing | VERIFIED LOCAL | Workspace registers one explicit local action. Isolation, limits, CSRF and idempotent creation passed the HTTP fixture. |
| G–I | Private project tasks | VERIFIED LOCAL | The API fixture checked explicit creation, completion and reopening, with project and account isolation. |
| G–I | Device inventory | VERIFIED LOCAL · PAIRED RUNTIME DEFERRED | Read-only OpenClaw list and detail adapter, exclusive per-account assignment, separate consent, expiry and in-flight revocation. Device actions and Windows pairing remain open. |
| H | Local Workspace connector grants | VERIFIED LOCAL | One read-only account-scoped connector has a 15-minute grant, explicit revocation, and usage count. The fixture checked denial of unapproved scopes and connectors. |
| H | Email, calendar, web search, GitHub, cloud storage, messaging, APIs and MCP integrations | DISABLED | Catalog entries are unavailable. Official provider authorization, external adapters and credentials are pending. |
| I | Private task reminders | VERIFIED LOCAL | One cancellable deadline per task with persistent acknowledgement. A repeated acknowledgement preserves its timestamp; rescheduling resets it. The local API fixture verified account isolation and stale-deadline rejection. |
| I | Scheduled summaries, task follow-ups and in-app notifications | VERIFIED LOCAL | Persistent timer and startup recovery, account pause, cancellation, private inbox and idempotent acknowledgement. External delivery and workflows remain unavailable. |
| J | Creator role, read-only directory and operator registration codes and revocation | PARTIALLY IMPLEMENTED | Creator and member roles are present. Operator commands and the directory cover limited administration. |
| J | Administrator role, suspension, provider and permission management, usage, spend, audit, security monitoring and emergency controls | MISSING | Product enforcement and administrative operations are absent. |
| K | Free, Pro and Ultra monthly and annual presentation | MOCKED | Displayed tier offers have no entitlements or checkout. |
| K | Registration-code activation and Creator credential separation | PARTIALLY IMPLEMENTED | Activation is enforced. The Creator bridge denies member accounts. Commercial isolated runtimes are an approved architecture, with implementation pending. |
| K | Entitlements, model restrictions, limits, lifecycle, isolated tenants and payments | MISSING | No server-enforced commercial subscription or billing pipeline. |
| L | Reliability and readiness | PARTIALLY IMPLEMENTED | Existing startup validation and local regression coverage. Operational health, backup restore and shutdown acceptance are pending. |
| Cross-cutting | Persian-first, RTL, headings, branding and accessible mobile interaction | PARTIALLY IMPLEMENTED | Persian Gate and direction handling are implemented. Authenticated Chromium verified a single composer row and no horizontal overflow at 320, 360, 390 and 393 CSS pixels in Persian and English. The 320-pixel file preview and Workspace controls were exercised. |

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

Signed-in users can save, search, edit, delete and export their own explicit notes from Workspace → Memory with no project selected. Notes stay in the owner-only SHADVERSE SQLite state directory across sign-out. At this checkpoint, project notes kept their earlier local behavior. The API scopes list, update, delete and export to the authenticated account, including when the caller is the Creator, and requires CSRF on writes. Each account has a 100-note cap. Only the explicit Add action saves a note. This checkpoint kept notes local. The later memory retrieval checkpoint adds explicit opt-in.

**Next independent milestone.** Add explicit local document upload and download with ownership and quota enforcement before connecting any document to the Gateway.


## Phase E checkpoint

Signed-in Workspace → Files supports explicit UTF-8 text upload, literal preview, download and confirmed delete. Account identity scopes all file operations. The store enforces 1 MiB per file, 50 files and 10 MiB per account. Files are stored as bytes with generated IDs and are never executed or dispatched to inference. The targeted HTTP test passed, including denial of invalid filenames, invalid UTF-8, oversized files and cross-account access. Production proxy and protected storage remain part of private staging acceptance.

**Next independent milestone.** Add local downloadable creation using explicit draft content, without enabling external generation.


## Phase F checkpoint

Workspace → Conversations exports the selected saved draft as standalone printable HTML with Persian RTL support. Workspace → Memory exports the account’s explicit notes as UTF-8 CSV. The targeted artifact test checked Persian text, HTML escaping, script blocking and spreadsheet formula neutralization. Both exports run in the browser.

**Next independent milestone.** Start Phase G with an account-scoped project action and use the existing workspace.


## Phase G checkpoint

Workspace → Projects uses the authenticated action registry to create and list private projects. The single allowlisted action validates a name, derives the owner from the session and records successful creation with a generated ID and timestamp. The HTTP fixture checked anonymous denial, CSRF, unknown actions, requester-supplied owners, cross-account isolation, persistency across sign-out and the 50-project limit. Repeat submissions of an existing name return its existing record. The registry has no shell, device, external messaging, background jobs or model-triggered execution.

The follow-up checkpoint adds Workspace → Projects → Tasks. It supports creating, listing, completing and reopening tasks and caps storage at 100 tasks per project. The targeted HTTP fixture verified the Persian title, exact project and account scope, persisted completion, repeat completion and reopening. Browser controls are pending staging acceptance. Deletion, scheduling, and model-triggered actions remain outside this checkpoint.

**Next implementation step.** Start Phase H with the disconnected integration catalog and an authenticated account-owned grant lifecycle. Verify consent scope, expiry and revocation using a local fixture. Keep real outbound connectors disabled until official authorization is available.


## Phase H checkpoint

Monitor & Tools exposes a SHADVERSE Workspace connector that reads only the signed-in account’s project count. A 15-minute grant requires explicit consent. Revocation is immediate on the server. The API returns credential-free metadata, last use and a cumulative count, and leaves every external connector unavailable. One synthetic HTTP test checked expiry, revocation, ownership, CSRF, narrow scope, absence of a synthetic external connection and correct read accounting. Browser controls await private staging acceptance.

**Next independent milestone.** In Phase I, add an account-scoped reminder for an existing project task. Store its due time, expose explicit create and cancel controls, and surface due reminders on the authenticated Workspace page. Verify ownership, deterministic clock behavior and cancellation locally before adding any worker or outbound notification.


## Phase I checkpoint

Authenticated users can set or cancel one reminder for a task in their own project. The server accepts a future timestamp within 366 days and persists it as an epoch in milliseconds. A due reminder appears in Projects when the view loads or task data refreshes. A completed task suppresses its reminder. Reopening restores the reminder unless it was canceled. No worker, external notification, provider call or unattended action runs. The isolated HTTP fixture covered separate accounts, a future timestamp, a deterministic overdue record, completed-task suppression, and cancellation. Browser date entry and acknowledgement passed a local Chromium fixture. Private staging acceptance remains pending.

Acknowledgement is scoped to the owner, project, task, and displayed deadline. It survives a fresh login and rescheduling clears it. The targeted HTTP fixture used private SQLite and synthetic accounts, including a direct persisted-state check.

**Next checkpoint.** Connect explicit Creator memory selection and product conversation history.


## Conversation history checkpoint

Product history records completed text and voice turns after successful Gateway replies. The authenticated Creator sees their own history, 25 turns at a time. A different Creator sees their own empty history and member access is denied. Failed and canceled fixture turns were excluded. Existing Gateway-only transcripts are not imported. Browser reload restoration was verified with a local Chromium fixture.


## Scoped memory retrieval checkpoint

Workspace → Memory supports personal notes and notes linked to a persisted private project. Selecting a note shows its text in the Creator composer. Sending explicitly shares one exact saved revision with the configured model, through an isolated Gateway session for that turn. Ordinary turns keep the normal stable session. The server enforces account, project and revision and rejects stale, foreign and wrongly scoped references before dispatch. Request context is included in managed route sizing. Product history stores the visible message and reply without adding the note text to its stored request. A reply may contain material from the shared note, and OpenClaw may retain the separate turn under its own storage policy.


## Workspace integration and narrow-mobile checkpoint

The authenticated Chromium flow connects project creation, task creation, reminder scheduling and acknowledgement, scoped memory selection, a fixture-backed Creator response, reload restoration, file upload and literal preview. It then signs in as a second user and checks project and file separation. The composer retains all four controls in one row at the tested narrow widths. Workspace rows wrap without losing hit targets and file preview stays within its column. No renderer, brand styles or media changed. All Gateway and speech fixture results are local evidence.


## P0 multimodal checkpoint

JARVIS Vision uses browser camera and screen permission requests and the local file picker. It previews one normalized frame, supports rotation and retake, and sends only on explicit authorization. Screen capture stops after the selected screenshot. Creator text questions and foreground Persian voice share the restricted OpenResponses route. Ordinary text and voice retain the existing conversation history path.

Local validation passed 15 product tests, including synthetic media and speech in Chromium, real authenticated product endpoints, and a loopback OpenResponses fixture. An additional offline check exercised the pinned OpenClaw deny-all matcher against shell, browser, messaging, node, scheduling and extension tool names. The checks do not establish the effective tool policy of a deployed Gateway or actual provider vision quality.

**Continuation.** With authorized private staging, complete the [P0 vision staging procedure](deploy/shadverse/product/VISION_STAGING.md). Verify the separate runtime's effective tool policy, the exact zero-cost model, and one Persian turn plus follow-up with a synthetic camera frame or screenshot. Check physical camera and microphone release on supported devices. Until then, leave admission unset.


## P0 live integration handoff

The accessible Cloud workspace gives no authorized SHADVERSE staging destination or outbound identity. No private proxy configuration, provider account, or physical device was available to inspect. The existing preflight exited `not_configured` locally. No live request or provider inference was made.

The corrected Phase A archive built and started locally from the reviewed Git tree. The loopback product process rejected unauthenticated session access and served no Gateway endpoint. The new two-Gateway preflight stops if Creator ingress fails, validates the pinned vision admission, and issues only empty loopback requests. An HTTP fixture verified ordering and redaction. Explicit vision Stop now closes the in-flight upstream connection and settles the connected caller with HTTP 409. Client disconnect behavior and reserved usage were also verified locally.

The daily ledger still reserves the catalog context window plus the maximum output before dispatch. It settles on valid measured receipts and retains the reserve when accounting is absent, including cancellation. Text and vision share a UTC-day ledger. A lower input cap has no verified provider-side enforcement across visual turns, image reuse, or automatic runtime activity. Keep the conservative reserve pending measured and enforceable limits.

**Continuation.** Obtain authorized private staging access. Inspect the effective proxy and both runtime configurations read-only. Run the existing Creator preflight before the new separate vision preflight. Keep inference disabled until the exact provider and effective runtime policy are verified. Then run the two-turn synthetic test and collect the redacted usage delta and physical-device evidence.


## Intelligent memory checkpoint

Personal and project memory now support ordinary notes, preferences, persistent knowledge and a per-note permission to appear in ranked results. Newly saved and existing notes are private by default. The Creator explicitly requests a local preview for the current question and scope. The UI displays the exact candidate text before Send. Older questions are searched only when selected, and remain restricted to the matching project or personal scope. Changed approvals, stale note revisions, foreign projects and mismatched references fail before dispatch.

The product reuses its private OpenClaw OpenResponses bridge for approved context, in a separate session. Its account-scoped SQLite notes do not migrate into the upstream workspace-wide memory index. Persian/Arabic character normalization supports relevance and duplicate detection without embeddings. Application and HTTP Gateway fixture tests covered access, stale approval, duplicate variants, private defaults and exact dispatch.

**Continuation.** Implement bounded document extraction and genuine artifact generation without routing files to the privileged Creator agent. Private staging and live providers are deferred by Creator decision.


## Document intelligence checkpoint

Workspace files can perform bounded local passage search, extractive summary, two-source comparison and spreadsheet statistics. A private optional worker parses PDF, DOCX, XLSX, PPTX and supported images and generates actual downloadable PDF, Word, Excel and PowerPoint reports with Persian RTL settings. Stored images can be queued to the existing Creator Vision preview by explicit action. No documents, prompts or provider calls leave the product during local analysis. Independent readers opened outputs in the authenticated integration test.

## Restricted research checkpoint

The Creator Research view can retrieve bounded structured citations and read listed pages through the documented OpenClaw tools endpoint. Use of the actual provider is disabled by default and deferred. The local HTTP fixture checked fixed tools, scope, structured source responses, provider mismatch, pinned-config invalidation, and no forwarded credentials in browser data. No external sources, prices or provider approval were fabricated.

## Reviewed action checkpoint

Authenticated users can ask the composer to review a bounded Persian or English request to create a project, add a task to an owned project, or open an HTTPS site in their browser. The server returns a preview and scopes write approval to the session and a two-minute lifetime. A confirmation is single-use. Project ownership and quotas are enforced by the existing action registry at execution. Direct shell, privileged tools and device routing remain disabled. The HTTP integration test covered no write before approval, replay, cancellation, unauthorized project and cross-session denial.

## Local workflow checkpoint

Workspace → Projects can schedule an owned project's task summary once, or every 24 hours from the selected start time. The in-process scheduler checks at startup and periodically. Read and publication share a SQLite transaction. Overdue recurring schedules catch up once after a restart and resume their original cadence. The account can pause pending work, cancel a schedule, or clear completed history. Each job retains its latest local result. Optional summary notices and explicit task follow-ups enter an account-scoped inbox. Completing a task suppresses its next reminder and closes the job. Publication is unique per scheduled run; repeat acknowledgements preserve the original timestamp. Keep the latest 100 notices per account, with explicit clearing of acknowledged items. Restart tests verified account isolation, pause and resume, cancellation, suppression and duplicate-free publication. No external action, inference or notification delivery is scheduled.

**Continuation.** Device inventory is implemented. The private Creator Bootstrap realm is implemented. Paired runtime and tool invocation remain deferred. Creative media providers, external connectors, skills activation, full administration and commercial isolation remain open. Staging, physical devices and provider acceptance remain deferred.


## Read-only device inventory checkpoint

Monitor & tools projects status from the dedicated OpenClaw inventory profile only after the configured Creator offers an exclusive per-device grant and the target account accepts it. Local fixtures verified exact CLI calls, absence of inherited credentials, isolation, expiry and revocation during a pending read. Windows and physical pairing remain deferred.


## Creator Bootstrap checkpoint

The private Creator realm supports a versioned schema and authenticated import/export with revision conflict checks. It starts empty. Project relationships map organizational records to owned Workspace projects. Ranked Composer previews can opt into scoped records and reject stale revisions. Fixed identity instructions mark the authenticated Creator as the authorized primary user without inventing personal facts. Synthetic HTTP integration covered account isolation, project mapping, secret rejection, export, preview-only behavior and exact dispatch.

## Streaming text checkpoint

The Creator composer now displays authenticated OpenResponses SSE deltas as they arrive and persists the validated final turn only. Local HTTP and browser fixtures verified first text preceding completion, disconnect propagation, credential fragments crossing events, and no retention of canceled or failed turns. Time to first useful text and completion are measured. [RC latency targets](deploy/shadverse/product/CONVERSATION_LATENCY.md) describe first audio, speech completion and interruption measurements. Physical Persian and provider acceptance remain deferred.

**Continuation.** Add audited FREE FIRST, BALANCED, QUALITY and manual selection to the existing zero-spend Creator model router. Customer credential and tenant-runtime activation remain disabled.

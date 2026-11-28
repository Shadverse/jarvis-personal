# SHADVERSE JARVIS security status

| Boundary | Evidence and current scope |
| --- | --- |
| SHADVERSE authentication | Isolated auth checks cover registration-code activation, session expiry and revocation, CSRF, rate limiting, and a single browser login. Phase A staging acceptance is pending. |
| OpenClaw | SHADVERSE connects to its configured Creator Gateway on IPv4 loopback. The token file is owner-only. Browser requests cannot supply provider credentials, backend overrides, or OpenClaw headers. |
| Model orchestration | Managed routing is opt-in with owner-only metadata. It requires verified free routes and denies all paid or unknown-cost dispatch. Actual no-cost eligibility and no upstream paid fallback require authorized staging verification. |
| Usage | Model attempt accounting excludes prompts, replies and tokens used as credentials. Ambiguous requests retain reservations. An output cap passed to OpenResponses remains provider-dependent. |
| Persian voice | Local-only recognition and synthesis are required at the browser boundary. Only the transcript reaches the existing Creator Gateway. Browser fixtures verified disconnect propagation. Native device and provider cancellation remain pending. |
| Explicit memory | Saved notes are scoped to the authenticated account for reads, export and mutations. No automated memory capture or inference injection is enabled. Store the production state on protected storage and scope access to exports. |
| Private text files | Account-scoped SQLite BLOB storage, bounded UTF-8 input, CSRF on writes and attachment-only download. Previews are literal text. Uploaded content stays out of the privileged Gateway until a restricted file-inference boundary is verified. |
| Local artifact exports | Printable HTML escapes user text and blocks script and network access with a document CSP. CSV cells are quoted and spreadsheet formula prefixes are neutralized. The browser creates these files from explicit workspace data. |
| Workspace actions | The allowlisted actions require CSRF for project creation and task creation or completion. Queries and mutations enforce account ownership. The task action also scopes every task ID to its project. The registry accepts no command, destination, caller-supplied owner or model-generated execution. |
| Commercial isolation | DISABLED FOR SECURITY. No commercial account can route through the Creator Gateway. Independent runtime, storage and credential isolation requires live acceptance before activation. |
| Provider grants and billing | Provider configuration requires official verified grants. No paid services or real billing are authorized. |
| Production | Deployment, public Gateway access, production DB changes and infrastructure changes remain gated. |

Use the [live acceptance queue](LIVE_ACCEPTANCE_QUEUE.md) to close staging requirements.

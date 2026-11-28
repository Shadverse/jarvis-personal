# SHADVERSE JARVIS security status

| Boundary | Evidence and current scope |
| --- | --- |
| SHADVERSE authentication | Isolated auth checks cover registration-code activation, session expiry and revocation, CSRF, rate limiting, and a single browser login. Phase A staging acceptance is pending. |
| OpenClaw | SHADVERSE connects to its configured Creator Gateway on IPv4 loopback. The token file is owner-only. Browser requests cannot supply provider credentials, backend overrides, or OpenClaw headers. |
| Model orchestration | Managed routing is opt-in with owner-only metadata. It requires verified free routes and denies all paid or unknown-cost dispatch. Actual no-cost eligibility and no upstream paid fallback require authorized staging verification. |
| Usage | Model attempt accounting excludes prompts, replies and tokens used as credentials. Ambiguous requests retain reservations. An output cap passed to OpenResponses remains provider-dependent. |
| Persian voice | Local-only recognition and synthesis are required at the browser boundary. Only the transcript reaches the existing Creator Gateway. Browser fixtures verified disconnect propagation. Native device and provider cancellation remain pending. |
| Commercial isolation | DISABLED FOR SECURITY. No commercial account can route through the Creator Gateway. Independent runtime, storage and credential isolation requires live acceptance before activation. |
| Provider grants and billing | Provider configuration requires official verified grants. No paid services or real billing are authorized. |
| Production | Deployment, public Gateway access, production DB changes and infrastructure changes remain gated. |

Use the [live acceptance queue](LIVE_ACCEPTANCE_QUEUE.md) to close staging requirements.

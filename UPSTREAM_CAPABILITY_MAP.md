# Pinned OpenClaw capability map

Inspected at SHADVERSE baseline `f5753c670283e49669a0fe471c025c6e7c719825`. Upstream availability and product acceptance are separate.

| Capability | Classification | Pinned implementation and supported interface |
| --- | --- | --- |
| Multimodal inference and attachments | Native upstream + provider-dependent | [OpenResponses](docs/gateway/openresponses-http-api.md) and [handler](src/gateway/openresponses-http.ts). `POST /v1/responses` accepts message content with `input_text` and `input_image` as a base64 source. It also accepts `input_file`; SHADVERSE currently admits only normalized images. |
| Vision model discovery | Native upstream + provider-dependent | [Models CLI](docs/cli/models.md). `openclaw models list --agent vision --json` supplies input modalities, context windows and availability. The operator must confirm provider eligibility and pricing independently. |
| Camera and paired devices | Native upstream with node/platform permission | [Camera](docs/nodes/camera.md) and [device commands](docs/nodes/device-commands.md). `node.invoke` routes `camera.list`, `camera.snap`, and `camera.clip` to a paired, allowed node. SHADVERSE browser capture needs no pairing. |
| Screen capture | Native upstream, browser integration required | [Screen tool](docs/tools/screen.md) and [device commands](docs/nodes/device-commands.md) document node `screen.record`. OpenResponses can analyze a selected screenshot. Local website permission is provided by browser `getDisplayMedia`, with upload fallback. |
| Speech recognition | Provider-dependent | [Media understanding](docs/nodes/media-understanding.md), [runner](src/media-understanding/runner.ts), and [Talk sessions](docs/nodes/talk/realtime-sessions.md) document attachment transcription and `talk.session.create` transcription providers. SHADVERSE uses on-device browser `fa-IR` where available. |
| Speech synthesis | Native orchestration + provider-dependent | [TTS Gateway methods](src/gateway/server-methods/tts.ts) and [implementation](src/tts/tts.ts). SHADVERSE keeps the local Persian browser voice path. |
| Continuous voice | Provider-dependent, custom product consent | [Talk realtime](docs/nodes/talk/realtime-sessions.md) documents `talk.session.create`, relay and steering. [Voice Call](extensions/voice-call/index.ts) is a supported extension for telephony. No product Talk provider has been authorized. |
| Memory | Native capability + supported extension | [Memory](docs/concepts/memory.md) and [memory-core](extensions/memory-core/index.ts) expose `memory_search` and `memory_get`. SHADVERSE's explicit SQLite notes retain their product ownership and consent boundary. |
| Browser tools | Supported extension | [Browser tools](docs/tools/browser.md) and [browser tool](extensions/browser/src/browser-tool.ts). Browser control is outside the vision policy. |
| Web search and current prices | Native tool, provider-dependent | [Web tools](docs/tools/web.md) documents `web_search` and `web_fetch`. A separate authorized route is required for current prices. |
| Device actions | Native, paired and allowlisted | [Device commands](docs/nodes/device-commands.md) and [command policy](docs/nodes/command-policy.md) document `node.invoke` with per-command authorization. No device tools in vision inference. |
| Scheduling | Native upstream | [Cron CLI](docs/cli/cron.md) and [service](src/cron/service.ts). SHADVERSE reminders remain account-scoped and do not run upstream jobs. |
| Skills | Native upstream | [Skills](docs/tools/skills.md) and [Gateway methods](src/gateway/server-methods/skills.ts). Skills are excluded from the dedicated vision deployment. |
| External integrations | Supported extensions and custom product consent | [MCP](docs/tools/mcp.md) supports `mcp.servers` and official authorization flows. Channel and MCP state must stay out of the vision runtime. |

OpenResponses shared-secret ingress grants owner authority. `tools: []` does not remove server tools and `store: false` is ignored. The legacy Creator Gateway is unsuitable for untrusted visual input. The product uses a separate gated route and forwards selected images only after explicit submission.

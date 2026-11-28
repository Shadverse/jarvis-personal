# جارویس شادوِرس · SHADVERSE JARVIS

The product uses one Persian-first account login. The Creator can use the assistant in the same application via a private server-to-server OpenClaw connection. The [deployment profile](../README.md) remains the way to reach the existing operator tools and device pairing privately. [Platform architecture](../ARCHITECTURE.md)

## Review the interface

Run the build and open the generated `dist/review.html` in a regular browser. Choose «مشاهدهٔ پیش‌نمایش», then «دستیار صوتی». The controls show the renderer’s states, real local microphone analysis with browser permission, and analysis of a bundled prerecorded sample. The signed-in screen and the local review use the same robotic particle head. [Voice screen, review files and licenses](VOICE_SCREEN.md)

## Run the authenticated preview locally

Use the existing checkout with its locked workspace dependencies installed. The tested runtime is Node 24.22.3 on Linux. Run from the repository root.

```bash
cd deploy/shadverse/product
node build.mjs
export JARVIS_STATE="$(mktemp -d)"
node server.mjs
```

Open http://localhost:3000 on the same computer. The server binds to IPv4 loopback. The local server offers the visual tour alongside the login page. That tour is disabled on external origins. The example starts with a new private directory. To keep local accounts across runs, reuse the same owner-only directory outside Git. The product stores its SQLite database there. Keep that directory separate from OpenClaw state. No default account is supplied.

For an authenticated review, use the same directory in a second terminal and run the following Bash commands from the product directory. Enter a new preview password of at least 12 characters. The password is read without echo.

```bash
read -rs -p 'New preview password: ' gate_password
printf '\n'
printf '%s' "$gate_password" | node manage.mjs creator reviewer
unset gate_password
```

Use `node manage.mjs invite` privately to issue a one-use member code valid for 24 hours. Choose the activation entry on the login screen. Use `node manage.mjs revoke NAME` to invalidate all existing sessions for an account. Revocation permits a later password login.

## What each screen can do

| Screen         | Implemented here                                                                                   | Requires later integration                                               |
| -------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Gate           | Username and password, one-time registration-code activation, server-side session and logout       | Public HTTPS proxy cutover and live account sign-in proof                |
| Assistant      | Creator text chat through private OpenClaw, prompt starters, local drafts and attachment selection | Uploaded attachments, in-app access to existing transcripts, member chat |
| Voice          | Browser microphone analysis and analysed prerecorded audio                                         | Speech recognition and live replies             |
| Workspace      | Session projects, notes, draft history, local file inventory, thumbnails and search                | Tenant-authorized storage and retrieval                                  |
| Subscription   | Free, Pro and Ultra views with monthly and annual terms                                            | Entitlements, metering and purchases                                     |
| Monitoring     | Live browser frame trace, statistics, pause and keyboard inspection                                | Server and billing telemetry                                             |
| Administration | Creator-only account directory, operator CLI for codes and session revocation                      | Additional administrative operations in the browser                      |

Drafts, selections and displayed turns live in page memory and clear at sign-out. OpenClaw keeps the conversation on its existing storage path, using a dedicated session for the configured Creator. Existing paired-device tools and conversations remain on the private Control UI. The service worker stores no application data.

## Authentication boundary

The application hashes passwords with individually salted scrypt (N=32768, r=8, p=3). Each successful login creates a random session token. SQLite stores its SHA-256 digest and a separate CSRF value. The four-hour cookie uses the __Host- prefix, Secure, HttpOnly and SameSite=Strict. The server enforces expiry and role checks. JSON state changes require the configured origin and logout also requires the session CSRF token. Login and activation share persistent limits of eight attempts per username and forty per socket IP per ten minutes. Four password operations can run concurrently per server process.

### Prepare the HTTPS cutover

1. Keep OpenClaw on IPv4 loopback with token authentication and the existing device-pairing and tool restrictions. Enable `gateway.http.endpoints.responses.enabled` on the private Gateway after approval. This endpoint grants owner privileges to the server-held credential. It must stay private. [OpenClaw OpenResponses API](https://docs.openclaw.ai/gateway/openresponses-http-api)
2. Use the same owner-only JARVIS state directory to preserve existing application accounts and invite codes. If the Creator has only an edge Basic Auth account, provision that Creator’s application account with `manage.mjs creator NAME` before the cutover. Set `JARVIS_GATEWAY_CREATOR` to that exact application username. Give the application a token file owned by its service account at mode 0600, outside the checkout and static root. Set `JARVIS_GATEWAY_TOKEN_FILE` to its absolute path and `JARVIS_GATEWAY_PORT` if the private port differs from 18789. Restart the application to reload a rotated token. The Gateway token and provider credential are never supplied by the browser.
3. Bind the application to loopback and set `JARVIS_ORIGIN` to the exact HTTPS origin. At the HTTPS edge, route the entire product host to the application only, preserve its Host header, and disable Basic Auth on that host's application route. Eliminate the old public upstream mapping to Gateway HTTP and WebSocket paths on that host. Retain private operator access. The application ignores forwarded IP headers, so one edge shares the 40-attempt socket ceiling. Confirm that ceiling is appropriate for the Creator launch before changing the public host.

From the staging shell with the same Gateway environment as the application, run:

```bash
node manage.mjs check-gateway
```

The command uses the application's owner-only token file and direct IPv4 loopback transport. It sends two empty Responses requests and checks that the Gateway rejects anonymous access and rejects the authenticated body at schema validation. `ready_for_live_review` confirms those checks. The command sends no model prompt and reports only a status code. Follow the private staging guide to verify real Persian inference and a follow-up turn. [Creator staging acceptance](PHASE_04_STAGING.md)

For an NGINX HTTPS virtual host whose product process uses port 3000, the route is:

```nginx
location / {
    auth_basic off;
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $http_host;
    proxy_set_header Authorization "";
    proxy_read_timeout 130s;
}
```

Before touching production, validate the actual HTTPS edge configuration on an isolated host, then sign in once with a test Creator account and send a real turn through the approved existing model. Confirm that an invited member cannot reach that Gateway, that browsers receive no Basic challenge or Gateway credentials, and that direct HTTP and WebSocket Gateway routes remain private. Save the current virtual-host configuration for rollback. Rollback restores the previous host mapping and its existing Basic Auth together. Neither step requires changing OpenClaw device pairings or provider credentials.

## Reproduce verification

After building, run the following from this directory. The visual suite expects the local preview at port 3000. Set CHROMIUM to a compatible local browser executable if necessary.

```bash
node --test tests/auth.test.mjs tests/assistant.test.mjs
node tests/workspace.mjs
node tests/visual.mjs
node tests/mobile-performance.mjs
node tests/record-review.mjs
# Optional packaging step (Python, Pillow, DejaVu Sans)
python3 tests/package-review.py
```

From the repository root, run the upstream regression selection.

```bash
OPENCLAW_VITEST_RUNTIME=node node scripts/run-vitest.mjs \
  src/agents/gateway-tool-policy.test.ts \
  src/plugins/provider-openai-chatgpt-oauth.test.ts \
  ui/src/i18n/test/translate.test.ts
```

SHADVERSE © · OpenClaw MIT attribution and the bundled font licenses are included in web/.

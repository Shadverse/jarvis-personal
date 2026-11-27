# جارویس شادوِرس · SHADVERSE JARVIS

This feature adds the Persian-first product shell and application login for Creator visual review. The existing Creator deployment and its device pairing continue to use the [upstream deployment profile](../README.md). The product follows the [unified platform architecture](../ARCHITECTURE.md).

## Review the interface

Download [the portable preview](review/SHADVERSE-JARVIS-preview.zip), extract the HTML file, and open it in a browser. Choose «مشاهدهٔ پیش‌نمایش» on the login screen. Use the right navigation rail or the menu on mobile to open the voice assistant, workspace, subscriptions and Creator administration. The EN button switches to English. The portable version runs locally and uses embedded fonts and artwork. Account operations require the server below.

[Creator reference comparison viewer](review/visual-comparison.html) · [Mechanical and particle implementation comparison](review/before-after.jpg) · [Contact sheet](review/contact-sheet.jpg) · [Full-resolution browser captures](review/) · [Persian centering and typography](review/persian-alignment.md) · [Mobile rendering measurements](review/mobile-performance.md)

The assistant uses a human-like face assembled from up to 44,478 luminous particles. A depth-only anatomical mesh preserves the silhouette and facial folds. Open the voice screen to inspect five motion states. Microphone testing requests permission and measures local input until stopped. The English sample plays an offline clip through the same analyser. The standalone HTML works in a JavaScript-capable browser. Web Audio microphone access requires browser permission and a secure context; phone file viewers vary in their ability to execute HTML. For a phone browser, the same standalone file can be served as static HTML over an approved private HTTPS origin.

[Browser recording](review/living-identity.mp4) · [Geometry, rendering research and licenses](RENDERING.md)

## Run the authenticated preview locally

Use the existing checkout with its locked workspace dependencies installed. The tested runtime is Node 24.22.3 on Linux. Run from the repository root.

```bash
cd deploy/shadverse/product
node build.mjs
export JARVIS_STATE="$(mktemp -d)"
node server.mjs
```

Open http://localhost:3000 on the same computer. The server binds to IPv4 loopback. The login page and visual tour are public. The example starts with a new private directory. To keep local accounts across runs, reuse the same owner-only directory outside Git. The product stores its SQLite database there. Keep that directory separate from OpenClaw state. No default account is supplied.

For an authenticated review, use the same directory in a second terminal and run the following Bash commands from the product directory. Enter a new preview password of at least 12 characters. The password is read without echo.

```bash
read -rs -p 'New preview password: ' gate_password
printf '\n'
printf '%s' "$gate_password" | node manage.mjs creator reviewer
unset gate_password
```

Use `node manage.mjs invite` privately to issue a one-use member code valid for 24 hours. Choose the activation entry on the login screen. Use `node manage.mjs revoke NAME` to invalidate all existing sessions for an account. Revocation permits a later password login.

## What each screen can do

| Screen         | Implemented here                                                                                                   | Requires later integration                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Gate           | Username/password sign-in, one-time code activation, secure cookie, server-side logout, Persian and English errors | Production HTTPS proxy cutover                                                          |
| Assistant      | Particle portrait, prompt starters, saving and reopening local drafts, attachment controls, connection status      | In-shell inference, model choices, uploading and chat history                           |
| Voice          | Five interpolated states, live local mic analysis, analysed English audio sample and stop controls                 | Speech recognition, live assistant audio and turn-taking                                |
| Workspace      | Session projects, memory notes, draft history, local file inventory, image thumbnails and search                   | Tenant-authorized storage, search and retrieval                                         |
| Subscription   | Free, Pro and Ultra views, monthly and annual terms, usage and quota section                                       | Entitlement enforcement, pricing, metering and purchases                                |
| Monitoring     | Live browser frame trace, median, peak, window length, pause, keyboard inspection and renderer readouts            | Production monitoring and billing telemetry                                             |
| Administration | Real Creator-only account directory, operator CLI for codes and session revocation                                 | Web management of roles, subscriptions, model policies, costs, audit and emergency stop |

The public tour shows the layout of administration with no account records. Drafts and attachment selections live in page memory. PWA assets include installation metadata, local icons and an offline navigation fallback. The service worker stores no application data. Captures use Chromium at desktop and touch-enabled mobile viewport sizes. Physical iOS, Android and Windows installation and real voice conversations require separate testing.

## Authentication boundary

The application hashes passwords with individually salted scrypt (N=32768, r=8, p=3). Each successful login creates a random session token. SQLite stores its SHA-256 digest and a separate CSRF value. The four-hour cookie uses the __Host- prefix, Secure, HttpOnly and SameSite=Strict. The server enforces expiry and role checks. JSON state changes require the configured origin and logout also requires the session CSRF token. Login and activation share persistent limits of eight attempts per username and forty per socket IP per ten minutes. Four password operations can run concurrently per server process.

Use the default loopback origin for local review. An eventual HTTPS integration must set JARVIS_ORIGIN to the exact external application origin and preserve that Host header at the trusted proxy. The application ignores forwarded client addresses. Behind a single proxy, all clients share the socket-IP rate limit. Validate that behavior, private state recovery, upstream device pairing, protected HTTP and WebSocket routes, session revocation and proxy rollback in an isolated integration environment before requesting approval for Basic Auth cutover.

Optionally set JARVIS_CREATOR_UI to the approved HTTPS Control UI address. Only the server-authenticated Creator receives the handoff link, which opens the existing UI in a separate tab under its own access controls. Configure a clean URL without credentials, query or fragment. This application does not proxy Gateway RPCs, pass cookies across origins, mint pairing tokens, or read OpenAI subscription state. Commercial runtime routing and credentials remain a separate platform responsibility. This milestone requires no model or billing credentials.

## Reproduce verification

After building, run the following from this directory. The visual suite expects the local preview at port 3000. Set CHROMIUM to a compatible local browser executable if necessary.

```bash
node --test tests/auth.test.mjs
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

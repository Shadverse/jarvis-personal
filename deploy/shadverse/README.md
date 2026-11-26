# SHADVERSE JARVIS PERSONAL — Creator Exclusive Edition

SHADVERSE ©

This profile is the first deployment of the unified SHADVERSE JARVIS platform. See the [platform architecture](ARCHITECTURE.md) for the commercial boundaries and implementation roadmap.

This deployment profile uses the official OpenClaw package and its Control UI. It targets one Creator on a dedicated, unprivileged Linux account. The default entry point is the Persian Control UI on loopback. An optional private HTTPS route gives the Creator access on mobile.

## Release and dependencies

| Component           | Selected version                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| OpenClaw production | npm `openclaw@2026.11.10`, official tag `v2026.11.10`, commit `6ea542fd97e2876aa4c871ccc494ed5419a03c5c`                |
| Node production     | 26.13.1 LTS (Lithium), verified against the Node release index                                                          |
| Source build        | Repository-pinned pnpm 12.15.0 and `pnpm-lock.yaml`. Tested on Node 24.22.3, also within the supported engine range.    |
| Source checkout     | `3bd892f5a2ebf8f5e13d2d7cffd2db4b58ceaad6`. The shipped package carries the same version string and a different commit. |

Pin the package install and retain the generated `package-lock.json` on the deployment host for reinstalls with `npm ci --prefix "$runtime"`. Review upstream release notes and test the profile with an isolated state directory before changing the pin. [Release](https://github.com/openclaw/openclaw/releases/tag/v2026.11.10) · [Node releases](https://nodejs.org/dist/index.json) · [Dependency locking](https://docs.openclaw.ai/gateway/security/dependency-locking)

## Deploy after Creator approval

On a Linux x86-64 machine with a working systemd user session, sign in to a dedicated account whose home is outside all checkouts. Use encrypted storage for its home and backups. Run from the checked-out branch root as that user. The commands require Bash, curl, tar with xz support, sha256sum, and jq.

```bash
umask 077
runtime="$HOME/.local/share/shadverse-openclaw"
install -d -m 700 "$runtime/node"
(
  set -e
  download_dir=$(mktemp -d)
  trap 'rm -rf -- "$download_dir"' EXIT
  cd "$download_dir"
  release=https://nodejs.org/dist/v26.13.1
  archive=node-v26.13.1-linux-x64.tar.xz
  curl -fSLO "$release/$archive"
  curl -fSLO "$release/SHASUMS256.txt"
  awk -v archive="$archive" '$2 == archive {print}' SHASUMS256.txt | sha256sum --check --strict -
  tar -xJf "$archive" --strip-components=1 -C "$runtime/node"
)
```

Continue after the checksum and extraction succeed. Use these environment settings again in each new deployment shell.

```bash
runtime="$HOME/.local/share/shadverse-openclaw"
export PATH="$runtime/node/bin:$runtime/node_modules/.bin:$PATH"
export OPENCLAW_STATE_DIR="$HOME/.openclaw-shadverse"
export OPENCLAW_CONFIG_PATH="$OPENCLAW_STATE_DIR/openclaw.json"
unset OPENAI_API_KEY CODEX_API_KEY OPENAI_ADMIN_KEY OPENAI_BASE_URL
unset OPENCLAW_GATEWAY_TOKEN OPENCLAW_GATEWAY_PASSWORD OPENCLAW_AGENT_DIR OPENCLAW_HOME CODEX_HOME

node --version
npm install --prefix "$runtime" --save-exact openclaw@2026.11.10
openclaw --version
node deploy/shadverse/init.mjs
openclaw config validate
```

Run the initializer once. It creates a private local Gateway token, configuration, and memory workspace. Existing state causes it to exit before writing. The token and model credentials grant different access.

### Authorize the subscription

The default is Codex subscription OAuth with OpenClaw’s embedded runtime. Use the stable release's explicit device-code method on a headless host.

```bash
openclaw models auth login --agent main --provider openai --method device-code
openclaw models list --agent main --provider openai
openclaw models status --agent main
```

Complete consent in your own browser. The profile begins with `openai/gpt-6-astra` and no model fallback. If the catalog available to your account requires another model, replace both the primary and its model entry together in the private config, keeping `agentRuntime.id` set to `openclaw` on the replacement entry. Re-run `openclaw config validate`. Model listing and status can be checked before your first inference. [Stable provider setup](https://github.com/openclaw/openclaw/blob/v2026.11.10/docs/providers/openai/setup.md)

| Method in 2026.11.10   | Access                                                                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--method device-code` | Codex subscription via one-time approval in a separate browser.                                                                                                                                                                                             |
| `--method oauth`       | Codex subscription via browser OAuth. Use on a host with a browser or follow the CLI callback instructions.                                                                                                                                                 |
| `--method siwc`        | Sign in with ChatGPT for eligible Responses inference. Approve token sharing and confirm your plan, workspace permissions, and usage policy. On a remote host, forward the loopback callback port printed for that attempt before opening the sign-in link. |
| `--method api-key`     | Metered OpenAI Platform access, excluded from this deployment.                                                                                                                                                                                              |

Keep Platform credentials, other providers, connected apps, and native Codex homes out of this installation. Choose one subscription method and confirm the selected route in the first chat's `/status`. Review ChatGPT or Codex usage settings before inference if your plan can consume credits. [Stable authentication reference](https://github.com/openclaw/openclaw/blob/v2026.11.10/docs/providers/openai/authentication.md) · [ChatGPT plan sharing](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites)

### Start and pair

```bash
install -d -m 700 "$HOME/.config/systemd/user"
install -m 644 deploy/shadverse/shadverse-openclaw.service "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now shadverse-openclaw.service
systemctl --user status shadverse-openclaw.service
curl --noproxy '*' -fsS http://127.0.0.1:18789/readyz
openclaw security audit
```

If the service must run across logout and boot, the host administrator can run `sudo loginctl enable-linger <creator-os-user>`. For startup diagnostics use `journalctl --user-unit shadverse-openclaw.service -n 80`.

On the Gateway machine use `openclaw dashboard` for a one-time browser pairing link. For a remote desktop, substitute your SSH destination and run this tunnel on the browser computer.

```bash
ssh -N -o ExitOnForwardFailure=yes -L 18789:127.0.0.1:18789 creator@gateway-host
```

In a private SSH terminal on the Gateway host, with the deployment environment set, run `openclaw dashboard --json | jq -r .browserUrl`. Open that one-time URL on the tunneled browser within ten minutes. Treat the link as a credential. Use a dedicated browser profile and pair only the Creator’s devices. Review or revoke pairings with `openclaw devices list` and `openclaw devices remove <device-id>`. [Dashboard pairing](https://github.com/openclaw/openclaw/blob/v2026.11.10/docs/cli/dashboard.md)

### Optional mobile HTTPS

On the dedicated Gateway and Creator phone, install and enroll Tailscale in a tailnet controlled by the Creator. Enable MagicDNS and HTTPS certificates, and restrict access to the Creator’s devices in tailnet policy. Have the host administrator run `sudo tailscale set --operator=<creator-os-user>`. Then run as the deployment user.

```bash
openclaw config set gateway.tailscale.mode serve
openclaw config validate
systemctl --user restart shadverse-openclaw.service
tailscale serve status
```

Open the private HTTPS hostname reported by Serve on the phone. In the Control UI connection prompt use the Gateway token from the private config. Retrieve it on the host in a private terminal with `jq -r .gateway.auth.token "$OPENCLAW_CONFIG_PATH"`. Verify the waiting phone's pairing request via `openclaw devices list`, then run `openclaw devices approve <request-id>`. Keep shared-secret authentication enabled and restrict the tailnet to the intended devices. For a scope upgrade, review the additional request and approve only the Creator’s browser. To remove mobile ingress, set `gateway.tailscale.mode` back to `off` and restart the same service. [Private Serve and Gateway auth](https://github.com/openclaw/openclaw/blob/v2026.11.10/docs/gateway/tailscale.md)

## Data, tools, and updates

- OpenClaw owns session persistence in the per-agent SQLite database and retains supported archive files under the same state root. Shared machine state, paired devices, and credentials are private there too. The dashboard may cache drafts and attachments in the Creator’s browser profile.
- Edit `$OPENCLAW_STATE_DIR/workspace/MEMORY.md` or add Markdown under `workspace/memory/` to retain notes. Memory Core uses local keyword search with embeddings disabled. The agent can recall these notes. The Creator controls writes and can review what enters durable memory. Transcript recall, automatic promotion, and automatic session reset are disabled. Normal OpenClaw archive maintenance still applies. Selected chat content, attached inputs, and recalled notes may be sent to the chosen subscription endpoint in a model request.
- Model-directed tools are limited by Gateway policy to session status, memory search, and memory reads. Agent shell, filesystem tools, elevated mode, browser control, automation, and native Codex execution are unavailable under the profile. Direct Creator administration still has administrator authority. Keep session links private and leave channel, GitHub, and plugin credentials out of the deployment.
- Use OpenClaw's verified backup on encrypted storage outside Git and keep the local runtime lockfile with your deployment inventory. Treat the backup as sensitive even when verified. Restore to an unused directory, inspect the printed asset paths, and test the restored Gateway against that state before replacing a live state directory. Update the absolute workspace and log paths in the restored config when restoring on a different account or host. [Storage and credentials](https://docs.openclaw.ai/gateway/security/secrets-and-storage) · [Backup and restore](https://docs.openclaw.ai/cli/backup)

```bash
install -d -m 700 "$HOME/shadverse-private-backups"
openclaw backup create --output "$HOME/shadverse-private-backups" --verify
```

## Mobile, media, projects, and customization

| Surface                 | Existing OpenClaw capability and profile decision                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile                  | The responsive Control UI over HTTPS is the first client. Upstream Android and iOS clients have native chat, attachments and device pairing. Native node capabilities stay unpaired for this baseline. [Android](https://docs.openclaw.ai/platforms/android) · [iOS](https://docs.openclaw.ai/platforms/ios)                                                                                                                              |
| Gallery and attachments | Chat has an in-thread media gallery, thumbnails, previews, and file and image inputs. Dashboard cards have a separate dashboard gallery. Input support depends on the model and attachment type. A cross-conversation personal media library would be an additional feature. [Chat](https://docs.openclaw.ai/web/control-ui/chat) · [Dashboards](https://docs.openclaw.ai/web/dashboards)                                                 |
| Voice                   | Native composer dictation and Gateway Talk are distinct flows. Web microphone access needs HTTPS or localhost. Transcription and realtime through Codex depend on the account and route. OpenAI speech synthesis needs a separate compatible credential. This baseline leaves voice providers unconfigured. [WebChat](https://docs.openclaw.ai/web/webchat) · [OpenAI speech](https://docs.openclaw.ai/providers/openai/voice-and-speech) |
| Projects                | Start with Control UI session groups. Upstream also offers a Projects registry and per-session worktrees. Keep worktree setup, GitHub identity, and the Workboard worker plugin outside this initial profile. [Projects and sessions](https://docs.openclaw.ai/web/control-ui/sessions-and-sidebar) · [Worktrees](https://docs.openclaw.ai/concepts/managed-worktrees)                                                                    |

Branding lives in the configured agent identity, workspace `SOUL.md`, and upstream appearance preferences. Persian uses `ui.prefs.locale: "fa"`, the existing lazy-loaded locale, and the Control UI's direction handling. English fallback is upstream behavior for untranslated strings. This profile uses Tehran for assistant time and teal for the accent. The upstream product shell and native app branding remain OpenClaw.

If deeper UI work is approved later, extend the existing Persian locale at `ui/src/i18n/locales/fa.ts` and apply CSS logical properties in the upstream styles under `ui/src/styles`. Keep technical values such as code, paths and model IDs in isolated LTR runs. Check a 320–430 px viewport for the composer, file picker, media viewer, session navigation and dialogs, then verify a desktop LTR layout. Use documented plugin interfaces for new functional views and review them against each tagged upstream release. [UI configuration](https://docs.openclaw.ai/gateway/config-browser-ui-desktop) · [Control UI language and appearance](https://docs.openclaw.ai/web/control-ui/settings)

## Verification on November 26, 2026

- The supplied source installed with the frozen lockfile and completed the full `pnpm build` on Node 24.22.3. The first build failed at the worker-deploy registry fetch. Setting `NODE_USE_ENV_PROXY=1` for the managed network resolved it. The successful build included the Control UI and all 165 public plugin SDK subpaths. The source CLI validated the profile and reported bundled-plugin overlay warnings specific to running from the checkout.
- The targeted upstream runner passed 116 tests across nine files covering SQLite session routing, tool policy, OAuth dispatch, Persian locale handling, media gallery, attachments, and Workboard routing.
- Chromium passed 21 browser tests for the mobile composer, attachment inputs, and project registration UI. A separate combined UI run reported one transient duplicate-video gallery failure. The regular upstream runner passed that case, and the isolated gallery rerun passed all three tests in its file.
- The tagged package ran on Node 26.13.1. The initializer protected existing state and created the private root and config at modes 0700 and 0600. The Gateway reported ready on loopback, rejected an invalid token, and refused `terminal.open`. The deep security audit reported zero critical findings, one proxy advisory for loopback configuration, and a deep probe that lacked `operator.read`.
- A synthetic chat message and local keyword note survived a Gateway restart. OpenClaw verified their backup and restored it to a separate staging directory. A one-time dashboard link paired Chromium and opened the synthetic chat at 390 px with `lang=fa`, `dir=rtl`, and no document-level horizontal overflow.
- Unit syntax passed `systemd-analyze --user verify` with the deployment paths mapped to a test home. The environment lacked a user service bus and Tailscale. A physical phone, microphone, private mobile ingress, account sign-in, and real model response still require the Creator’s approved environment.

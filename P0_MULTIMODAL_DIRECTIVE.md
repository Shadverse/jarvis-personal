# SHADVERSE JARVIS
# P0 MULTIMODAL INTELLIGENCE
# OPENCLAW-FIRST IMPLEMENTATION

Repository: Shadverse/jarvis-personal

Branch: feature/shadverse-product-recovery

Verified baseline:
f5753c670283e49669a0fe471c025c6e7c719825

Graphics: HARD FREEZE
External spending: ZERO
Production deployment: NOT AUTHORIZED
Execution: Sequential, resource-efficient implementation

## 1. RECOVERY

Recover the latest verified remote checkpoint.

Preserve all existing functionality, including authentication, conversation history, scoped memory, projects, tasks, reminders, files and mobile layout fixes.

Read existing project status and acceptance records.

Do not repeat completed implementation.

Persist the approved master development directive in the repository for future sessions.

## 2. OPENCLAW CAPABILITY MAP

Create the missing UPSTREAM_CAPABILITY_MAP.md.

Use focused inspection of the pinned OpenClaw source and documentation.

Identify actual supported interfaces for:

- Multimodal inference.
- Image attachments.
- Vision models.
- Camera and device nodes.
- Screen capture.
- Speech recognition.
- Speech synthesis.
- Continuous voice interaction.
- Memory.
- Browser tools.
- Web search.
- Device actions.
- Scheduling.
- Skills.
- External integrations.

Classify each capability as:

- Native upstream capability.
- Supported extension.
- Provider-dependent.
- Custom integration required.
- Unsupported or blocked.

Record exact source paths and supported interfaces.

Do not invent APIs.

Reuse existing OpenClaw functionality instead of rebuilding it.

Keep this inspection focused and proceed immediately to implementation.

## 3. SHARED MULTIMODAL ARCHITECTURE

Extend the existing authenticated product pipeline to support authorized visual input.

Implement a shared multimodal request layer for:

- Camera frames.
- Gallery images.
- Screenshots.
- User questions.
- Voice transcripts.
- Conversation context.
- Vision-capable model selection.
- Usage accounting.
- Cancellation.

Use the actual supported OpenClaw multimodal interface.

Do not send untrusted visual content to an unrestricted privileged agent.

Establish and verify a restricted inference boundary without shell, device, messaging or other privileged tool execution.

Preserve Creator credential isolation.

Never expose provider credentials or Gateway tokens to the browser.

## 4. JARVIS VISION — CAMERA

Implement a functional camera experience inside the existing product interface.

Support:

- Opening the camera.
- Front and rear camera selection.
- Live camera preview.
- Camera switching.
- Permission management.
- Frame capture.
- Frame preview.
- Retake.
- Gallery image selection.
- Image rotation where necessary.
- Bounded image compression.
- Explicit submission for analysis.
- Camera shutdown.
- Cancellation.
- Mobile and desktop compatibility.

Use supported browser APIs and existing upstream device capabilities where appropriate.

Handle:

- Permission denial.
- Missing camera.
- Camera already in use.
- Unsupported browser.
- Insecure origin.
- Device disconnection.
- Navigation away.
- Logout.

Release all media tracks when the feature stops.

Do not continuously upload camera video.

Do not persist camera frames by default.

## 5. REAL VISION INTELLIGENCE

Connect captured images to an actual authorized vision-capable model through OpenClaw.

Support Persian questions about:

- Object identification.
- Scene understanding.
- Equipment recognition.
- Product recognition.
- Visible text.
- Translation.
- Computer error messages.
- Technical troubleshooting.
- Document photographs.
- Visual comparisons.
- General image understanding.

Do not hardcode object recognition results.

Do not use synthetic AI responses as production behavior.

Do not claim recognition when only the camera preview works.

Clearly communicate uncertainty when the model cannot reliably identify an object.

Product identification and price lookup must be treated as separate capabilities. Current prices require authorized live search.

## 6. INTELLIGENT VISUAL CONTEXT

Implement bounded visual context across related conversation turns.

Support:

- Asking follow-up questions about a selected image.
- Replacing the current image.
- Clearing visual context.
- Explicitly requesting a fresh camera frame.
- Optional bounded frame sampling during an authorized active session.

Avoid unnecessary repeated transmission of unchanged frames.

Use provider-supported image reuse where available.

Enforce configurable limits for:

- Image dimensions.
- Image bytes.
- Request frequency.
- Session duration.
- Token usage.
- External cost.

No paid or unknown-cost inference is authorized.

## 7. JARVIS LIVE VISION

Integrate the existing Persian voice pipeline with visual understanding.

Required interaction:

1. User opens the camera.
2. User points the camera at an object.
3. User asks a question in Persian.
4. JARVIS captures or uses an explicitly authorized frame.
5. The vision-capable model analyzes the actual image and question.
6. JARVIS returns a Persian answer.
7. Authorized Persian speech synthesis reads the answer.
8. User asks a related follow-up question.
9. User can stop the camera, microphone and playback immediately.

Implement a coordinated interaction state machine:

- IDLE
- CAMERA ACTIVE
- LISTENING
- CAPTURING
- ANALYZING
- SPEAKING
- INTERRUPTED
- ERROR

Preserve text fallback.

Where local Persian speech recognition or synthesis is unavailable, clearly report the limitation.

Inspect existing upstream speech capabilities before implementing alternative engines.

Do not download heavy models onto the existing server.

Do not claim continuous real-time video understanding when the implementation uses selected frames.

## 8. CONTINUOUS PERSIAN VOICE

Extend the existing single-turn voice implementation.

Implement where supported:

- Automatic return to listening.
- Voice activity detection.
- Silence detection.
- Controlled continuous conversation.
- User interruption.
- Playback cancellation.
- Echo prevention.
- Session timeout.
- Immediate microphone shutdown.
- Prevention of accidental self-triggering.

Reuse supported OpenClaw voice interfaces.

Do not claim background microphone support on devices where browser or operating system restrictions prevent it.

## 9. JARVIS SCREEN INTELLIGENCE

Implement user-authorized screen understanding using the same multimodal pipeline.

Support:

- Explicit screen-sharing permission.
- Screen or application-window selection.
- Screenshot capture.
- Selected frame analysis.
- Screenshot upload fallback.
- Persian questions about screen content.
- Error-message understanding.
- Software interface explanation.
- Step-by-step troubleshooting.
- Cancellation and immediate capture shutdown.

Never capture the screen silently.

Do not automatically transmit passwords, private notifications or other sensitive screen content.

Provide user-controlled preview before submission.

Where mobile browsers do not support screen capture, expose a working screenshot-upload fallback.

Reuse supported upstream device-node mechanisms where appropriate.

Do not install unauthorized desktop software.

## 10. PROVIDER ROUTING AND COST

Extend the existing model registry to distinguish:

- Text capability.
- Vision capability.
- Speech recognition.
- Speech synthesis.
- Multimodal capability.
- Supported languages.
- Availability.
- Authentication eligibility.
- Cost classification.

Select only compatible, explicitly authorized models.

Use FREE FIRST routing.

Unknown cost is not zero cost.

No paid fallback.

No unofficial authentication.

Do not assume ChatGPT Free or Plus automatically grants access to external vision or speech inference.

Verify the exact provider route before live activation.

If no authorized vision provider is available, keep the inference capability disabled and record the precise activation requirement.

## 11. SECURITY AND PRIVACY

Enforce:

- Authentication.
- Account ownership.
- CSRF protection.
- Request validation.
- File signature and format validation.
- Image size limits.
- Metadata removal where appropriate.
- Restricted inference.
- No unauthorized tool execution.
- Cancellation.
- Rate limits.
- Secure temporary storage.
- Temporary data cleanup.
- Credential redaction.
- Cross-account isolation.

Treat visual text and embedded instructions as untrusted content.

Never allow instructions found inside an image or screenshot to authorize actions.

No private images, credentials or user data in GitHub.

## 12. TARGETED ACCEPTANCE TESTS

Use focused local tests for:

- Camera permission handling.
- Media-track cleanup.
- Frame capture.
- Camera switching.
- Image validation.
- Multimodal request construction.
- Vision-capable route selection.
- Unauthorized route denial.
- Cross-account isolation.
- Cost-limit enforcement.
- Cancellation.
- Voice and vision coordination.
- Screen capture lifecycle.
- Screenshot fallback.
- Persian RTL.
- Mobile usability.
- Existing functionality regression.

Use fixtures only for deterministic local testing.

Clearly distinguish fixture evidence from real provider inference.

For live acceptance, require actual images and actual authorized model responses.

Test with synthetic, non-personal visual inputs.

Do not claim that all bugs have been eliminated.

## 13. LIVE ACCEPTANCE BLOCKERS

The current live Gateway acceptance remains pending.

Do not bypass this requirement.

Before enabling actual inference:

- Verify private staging access.
- Verify Gateway exposure boundaries.
- Verify the effective restricted tool policy.
- Verify the approved no-cost provider.
- Verify that paid upstream fallbacks are disabled.
- Run the existing Gateway preflight.

Do not expose OpenResponses or other privileged Gateway endpoints through the public reverse proxy.

If live access is unavailable, complete safe independent implementation and record exact acceptance procedures.

Do not stop after documenting a blocker.

## 14. RESOURCE EFFICIENCY

One primary agent.

No parallel agents.

No graphics work.

No unnecessary visual previews.

No broad research.

No redundant source inspection.

No unnecessary dependency installation.

No heavy model downloads.

No duplicate OpenClaw subsystems.

Batch related changes into coherent functional milestones.

Run targeted tests after meaningful changes.

Run integrated regression tests at the package boundary.

Avoid repeated unsuccessful implementation loops.

Do not produce lengthy intermediate reports.

Prioritize actual working functionality.

## 15. CHECKPOINTS

Maintain:

- MASTER_STATUS.md
- UPSTREAM_CAPABILITY_MAP.md
- LIVE_ACCEPTANCE_QUEUE.md
- SECURITY_STATUS.md
- CREATOR_DECISIONS.md

Commit and push coherent functional checkpoints.

Verify remote hashes.

Preserve the exact continuation point.

Do not merge into production.

Do not deploy to production.

## 16. CONTINUATION

After completing the multimodal package, continue the approved master roadmap with the highest-priority incomplete functional capability.

Prioritize:

1. Real AI Brain acceptance.
2. Persian continuous voice.
3. Vision and screen intelligence.
4. Intelligent memory retrieval.
5. Secure document intelligence.
6. Authorized device actions.
7. External integrations.
8. Autonomous execution.
9. Creative capabilities.
10. Commercial administration.

Do not return to cosmetic development.

Do not request routine engineering approvals.

## 17. FINAL REPORT

Provide a concise Persian report containing:

- Verified remote commit.
- Actual upstream capabilities reused.
- Implemented functionality.
- Real versus simulated test evidence.
- Camera status.
- Vision inference status.
- Persian voice status.
- Screen intelligence status.
- Known defects.
- Security status.
- External spending.
- Remaining live acceptance requirements.
- Exact next implementation action.

Do not invent completion percentages.

Do not classify disconnected interfaces as working AI capabilities.

START IMPLEMENTATION NOW.

SHADVERSE ©
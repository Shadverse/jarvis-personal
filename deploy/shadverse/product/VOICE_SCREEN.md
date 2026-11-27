# SHADVERSE JARVIS | Voice screen review

The signed-in voice screen and its local review route render the same robotic
particle head. Microphone input is analysed in the browser. The sound player
plays the bundled prerecorded English sample. The text conversation control
returns to the existing chat. Live speech recognition, turn-taking and
streamed model audio remain unavailable.

## Creator review

- [Desktop screenshot](review/final-voice/jarvis-voice-desktop.jpg) at 1440 × 962.
- [Mobile screenshot](review/final-voice/jarvis-voice-mobile.jpg) at 786 × 1704, captured at 2× in a 393 × 852 CSS viewport.
- [Motion recording](review/final-voice/jarvis-voice-motion.mp4) from the desktop browser. The sequence shows idle motion, contraction while a test signal enters the browser microphone track, and expansion during prerecorded sample playback. The audible track is the sample aligned to the browser playback timestamp.

The screenshots use an isolated synthetic Creator sign-in. Chromium verified
right-to-left layout, Vazirmatn loading and no horizontal overflow on both
viewports. The signed-in desktop checks exercised WebGL2 idle frames, a
deterministic microphone fixture over `getUserMedia`, microphone track
termination, expansion from decoded playback, natural return to idle, and
navigation back to text chat. The microphone fixture is not evidence of a
physical phone microphone or a live model reply.

Run `node deploy/shadverse/product/build.mjs` with the existing build
dependencies, then follow the repository's [local preview instructions](README.md).
Open «دستیار صوتی» from the product or open the generated `dist/review.html#voice`.
Microphone access requires browser permission and a secure context.

## Source and licensing

| Component | Source and use | License |
| --- | --- | --- |
| Wave visualizer | [Pipecat UI Audio Visualizer Wave](https://ui.pipecat.ai/docs/visualizers/audio-visualizer-wave), pinned at [d9f94f5](https://github.com/pipecat-ai/pipecat-ui/blob/d9f94f5f9e885e474f29a03619f8dab243382b5b/packages/registry/src/components/audio-visualizer-wave.tsx). The GLSL turbulence and the attack/release envelope were adapted into the existing renderer and browser audio path. | BSD-2-Clause, © Daily 2024–2026 |
| Robot geometry | [Mint Humanoid Robot](https://mint.gg/free-3d-models/humanoid-robot). The existing faceless head was cropped and sampled as point data and an invisible depth mesh. Body armor, textures and materials do not ship. | CC0 1.0 Universal |
| Typography | Self-hosted [Vazirmatn](https://github.com/rastikerdar/vazirmatn) and [Space Grotesk](https://github.com/floriankarsten/space-grotesk), with the existing notices under `web/fonts/`. | SIL OFL 1.1 |
| Playback sample | Existing offline-generated English Flite `kal` sample. Attribution is documented in [the renderer notes](RENDERING.md#dependencies-assets-and-reproduction). | [Flite notices](https://github.com/festvox/flite) |

The app and standalone preview include [the voice asset notices](web/identity/VOICE-NOTICES.txt).
The [sampler](art-tools/sample-robot.py) pins the reviewed GLB by SHA-256 and
reproduces the cropped buffers using NumPy and Pillow.

SHADVERSE ©

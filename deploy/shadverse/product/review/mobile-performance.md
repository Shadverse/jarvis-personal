# Mobile rendering measurements

Headless Chromium 156.0.8078.79 on Linux. Each profile used a fresh browser context, touch emulation, the indicated device pixel ratio, default motion settings and 4× CPU throttling. Graphics backend: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver-5.0.0). The preview server was on loopback. The measurements describe this host. Physical device compositing, thermal performance, battery use, Safari and cellular load times require device testing.

- 390 × 844, DPR 2.75. First contentful paint 128 ms. Encoded response bodies 908 KiB.
- 393 × 852, DPR 3. First contentful paint 140 ms. Encoded response bodies 908 KiB.

Each row samples requestAnimationFrame callbacks for 2.5 seconds after navigation. Rate means callbacks per elapsed second. P95 is the 95th percentile callback interval. Long tasks use the browser's 50 ms threshold. These are main-thread timing measurements. They do not measure frames presented by the physical display.

| Viewport  | Screen | Renderer | Points at end | Portrait draws/s | Callbacks | Rate/s | P95 interval | Long tasks |
| --------- | ------ | -------- | ------------: | ---------------: | --------: | -----: | -----------: | ---------: |
| 390 × 844 | Login  | DOM      |             0 |              0.0 |       149 |   59.2 |      16.8 ms |          1 |
| 390 × 844 | Main   | WebGL2   |         12009 |             29.8 |       147 |   58.4 |      16.7 ms |          1 |
| 390 × 844 | Voice  | WebGL2   |         12009 |             30.2 |       151 |   60.0 |      16.7 ms |          0 |
| 393 × 852 | Login  | DOM      |             0 |              0.0 |       151 |   60.0 |      16.8 ms |          0 |
| 393 × 852 | Main   | WebGL2   |         12009 |             30.2 |       149 |   59.2 |      16.7 ms |          0 |
| 393 × 852 | Voice  | WebGL2   |         12009 |             29.8 |       148 |   58.8 |      16.8 ms |          1 |

Portrait draws/s counts completed JavaScript submissions to the graphics API during the measurement. Login uses DOM and glass surfaces. The renderer reduces particle count under sustained frame delays, caps pixel ratio, suspends hidden tabs, and holds the pose for reduced motion. The suite also exercised the two-processor quality tier and a forced Canvas 2D fallback. Physical mobile GPU presentation, battery and thermal behavior remain unmeasured.

Run `node tests/mobile-performance.mjs` from the product directory with the preview running on port 3000.

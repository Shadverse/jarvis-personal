# Mobile rendering measurements

Headless Chromium 156.0.8078.79 on Linux. Each profile used a fresh browser context, touch emulation, the indicated device pixel ratio, default motion settings and 4× CPU throttling. The preview server was on loopback. The measurements describe this host. Physical device compositing, thermal performance, battery use, Safari and cellular load times require device testing.

- 390 × 844, DPR 2.75. First contentful paint 148 ms. Encoded response bodies 218 KiB.
- 393 × 852, DPR 3. First contentful paint 176 ms. Encoded response bodies 218 KiB.

Each row samples requestAnimationFrame callbacks for 2.5 seconds after navigation. Rate means callbacks per elapsed second. P95 is the 95th percentile callback interval. Long tasks use the browser's 50 ms threshold. These are main-thread timing measurements. They do not measure frames presented by the physical display.

| Viewport  | Screen | CSS motion | Callbacks | Rate/s | P95 interval | Long tasks |
| --------- | ------ | ---------- | --------: | -----: | -----------: | ---------: |
| 390 × 844 | Login  | float      |       150 |   60.0 |      16.7 ms |          0 |
| 390 × 844 | Main   | float      |       151 |   60.0 |      16.7 ms |          0 |
| 390 × 844 | Voice  | float      |       151 |   60.0 |      16.7 ms |          0 |
| 393 × 852 | Login  | float      |       147 |   58.4 |      16.8 ms |          1 |
| 393 × 852 | Main   | float      |       151 |   60.0 |      16.8 ms |          0 |
| 393 × 852 | Voice  | float      |       151 |   60.0 |      16.7 ms |          0 |

The core uses a pre-rendered refractive volume and CSS transform animation. Reduced motion disables movement. The same static rendering is used for data saver, two or fewer logical processors, or at most 2 GiB of reported device memory. A two-processor browser override verified the static fallback. The visual suite verifies reduced motion across all five demonstration states at all three viewports.

Run `node tests/mobile-performance.mjs` from the product directory with the preview running on port 3000.

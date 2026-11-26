# Persian alignment and typography

Each row covers a real Chromium render in Persian. Two screenshots of the same page, one with transparent text, isolate the painted glyphs. Each line’s visible left and right edges are compared with the center of its containing panel. The tolerance is 3 CSS pixels. On login and activation, the card and logo are also checked against the page’s horizontal axis and the card against its vertical axis, within 1 CSS pixel.

Contrast compares the computed text color with the sampled background under the ink. The thresholds are 4.5 for normal text and 3 for text at least 24 px tall. Coverage includes login action labels, the welcome heading, product name, primary headings, section titles and explanatory subtitles. Native browser validation and the physical device keyboard are outside this measurement.

| Viewport   | Screen       | Painted lines | Largest center offset | Lowest contrast ratio |
| ---------- | ------------ | ------------: | --------------------: | --------------------: |
| 1440 × 900 | login        |             6 |               0.00 px |                  5.12 |
| 1440 × 900 | activation   |             6 |               0.50 px |                  5.12 |
| 1440 × 900 | main         |             3 |               0.64 px |                  4.96 |
| 1440 × 900 | voice        |             4 |               0.86 px |                  6.19 |
| 1440 × 900 | workspace    |             4 |               1.64 px |                  8.98 |
| 1440 × 900 | subscription |            10 |               0.36 px |                  8.41 |
| 1440 × 900 | admin        |             6 |               0.36 px |                  8.05 |
| 390 × 844  | login        |             7 |               0.50 px |                  5.12 |
| 390 × 844  | activation   |             6 |               0.00 px |                  5.12 |
| 390 × 844  | main         |             3 |               0.50 px |                  9.74 |
| 390 × 844  | voice        |             5 |               0.50 px |                  6.23 |
| 390 × 844  | workspace    |             5 |               1.00 px |                  9.34 |
| 390 × 844  | subscription |            11 |               0.50 px |                  8.60 |
| 390 × 844  | admin        |             8 |               0.00 px |                  6.90 |
| 393 × 852  | login        |             7 |               0.50 px |                  5.12 |
| 393 × 852  | activation   |             6 |               0.50 px |                  5.12 |
| 393 × 852  | main         |             3 |               0.50 px |                  9.60 |
| 393 × 852  | voice        |             5 |               0.50 px |                  6.57 |
| 393 × 852  | workspace    |             5 |               0.50 px |                  9.34 |
| 393 × 852  | subscription |            11 |               0.50 px |                  8.61 |
| 393 × 852  | admin        |             8 |               0.50 px |                  6.90 |

The OFL-licensed Vazirmatn font loaded on all three viewports. The login test checks the exact Persian welcome heading and primary action, 16 px mobile input text, and automatic direction for both Persian and Latin input. The composer preserves the Persian reading direction in mixed Persian–Latin drafts. Navigation labels keep start alignment. The visual suite also checks English navigation, keyboard-height layout and the reduced-motion states.

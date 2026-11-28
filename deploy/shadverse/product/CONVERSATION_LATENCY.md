# Conversation latency and cancellation

Creator text chat requests the supported OpenResponses SSE stream. The product forwards bounded display text and a validated final response over the authenticated same-origin route. Only a completed reply is recorded. The Stop button, navigation away and sign-out abort the current request. The product propagates disconnects upstream, keeps ambiguous accounting reservations and does not retry a partially dispatched stream. A non-streaming response remains supported.

The browser displays server time to first useful text, measured from application admission to the first non-whitespace delta, and the final response carries that duration plus total request time. Tokens matching the server credential are blocked even across multiple deltas. Metrics contain durations only. No speech performance or provider throughput is inferred from fixture timing.

## Release candidate targets

Measure on the approved staging device and provider with synthetic Persian prompts, separately reporting cold starts and warm turns. Use at least 20 warm turns per device/route and report p50/p95. Proposed review targets:

| Metric | Exact start and end | Proposed warm p95 |
| --- | --- | --- |
| First useful text | Submit to first painted non-whitespace text | ≤ 1.5 s |
| End-of-turn detection | Last audible user syllable to recognizer finalization | ≤ 700 ms |
| First audio | Last audible user syllable to first audible synthesized reply | ≤ 3.0 s |
| Playback stop | User presses Stop to audible playback ending | ≤ 250 ms |

Use browser performance marks for UI events and a local audio observation for audible thresholds. Record stage timings and failure counts without speech contents. Current Persian voice uses local browser recognition and then local synthesis of the completed answer. Provider streaming audio, connection reuse, and physical Persian latency acceptance remain pending.

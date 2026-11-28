import { readEvents } from "./stream-events.mjs";

export async function readGatewayChatStream(upstream, secret, started, emit) {
  let held = "",
    firstTextMs = null;
  function visible(value) {
    if (!value) return;
    if (firstTextMs === null && value.trim()) firstTextMs = Math.round(performance.now() - started);
    emit(value);
  }
  for await (const { event, payload } of readEvents(upstream)) {
    if (event === "response.output_text.delta" && typeof payload?.delta === "string") {
      const incoming = held + payload.delta;
      if (incoming.includes(secret)) return { result: null, firstTextMs };
      let suffix = Math.min(secret.length - 1, incoming.length);
      while (suffix > 0 && !secret.startsWith(incoming.slice(-suffix))) suffix--;
      const end = incoming.length - suffix;
      visible(incoming.slice(0, end));
      held = incoming.slice(end);
    } else if (["response.completed", "response.failed", "response.incomplete"].includes(event)) {
      const result = payload?.response ?? null;
      // The final response supplies the canonical persisted reply. Any held
      // suffix is omitted from previews and restored only by that validated reply.
      return { result, firstTextMs };
    }
  }
  return { result: null, firstTextMs };
}

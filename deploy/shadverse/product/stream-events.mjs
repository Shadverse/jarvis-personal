export async function* readEvents(source, limit = 256 * 1024) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "",
    data = [],
    event = "",
    size = 0;
  for await (const chunk of source) {
    size += chunk.byteLength;
    if (size > limit) throw Error("Response stream exceeds limit.");
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/u, "");
      buffer = buffer.slice(newline + 1);
      if (line === "") {
        if (data.length) {
          const payload = data.join("\n");
          if (payload === "[DONE]") return;
          yield { event, payload: JSON.parse(payload) };
        }
        data = [];
        event = "";
      } else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /u, ""));
      else if (line.startsWith("event:")) event = line.slice(6).trim();
    }
  }
  decoder.decode();
}

import { crc32, inflateSync } from "node:zlib";

export const maxImageBytes = 2_500_000;
export const maxImageSide = 768;
export const visionBodyLimit = Math.ceil(maxImageBytes / 3) * 4 + 20_000;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// The browser re-encodes to opaque PNG. Validate the compressed raster here
// and forward only critical chunks, without PNG text, location or color metadata.
export function normalizeVisionImage(encoded, maxBytes, maxSide) {
  if (
    typeof encoded !== "string" ||
    encoded.length % 4 ||
    encoded.length > Math.ceil(maxBytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)
  )
    return null;
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length > maxBytes ||
    bytes.toString("base64") !== encoded ||
    !bytes.subarray(0, 8).equals(signature)
  )
    return null;
  let header,
    end,
    stride,
    height,
    imageEnded = false;
  const chunks = [],
    compressed = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const next = offset + 12 + length;
    if (next > bytes.length) return null;
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const payload = bytes.subarray(offset + 8, next - 4);
    if (crc32(bytes.subarray(offset + 4, next - 4)) !== bytes.readUInt32BE(next - 4)) return null;
    const chunk = bytes.subarray(offset, next);
    if (type === "IHDR" && offset === 8 && length === 13) {
      const width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      const [depth, colors, compression, filter, interlace] = payload.subarray(8);
      if (
        width < 1 ||
        height < 1 ||
        width > maxSide ||
        height > maxSide ||
        depth !== 8 ||
        ![2, 6].includes(colors) ||
        compression ||
        filter ||
        interlace
      )
        return null;
      stride = 1 + width * (colors === 2 ? 3 : 4);
      header = chunk;
    } else if (!header) return null;
    else if (type === "IDAT" && !imageEnded) {
      chunks.push(chunk);
      compressed.push(payload);
    } else if (type === "IEND" && !length && next === bytes.length) {
      end = chunk;
      break;
    } else {
      if (!/^[a-z][A-Za-z]{3}$/u.test(type)) return null;
      if (chunks.length) imageEnded = true;
    }
    offset = next;
  }
  if (!end || !chunks.length) return null;
  try {
    const input = Buffer.concat(compressed);
    const { buffer, engine } = inflateSync(input, { maxOutputLength: stride * height, info: true });
    if (buffer.length !== stride * height || engine.bytesWritten !== input.length) return null;
    for (let offset = 0; offset < buffer.length; offset += stride) {
      if (buffer[offset] > 4) return null;
    }
  } catch {
    return null;
  }
  return Buffer.concat([signature, header, ...chunks, end]).toString("base64");
}

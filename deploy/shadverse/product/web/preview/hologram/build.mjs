import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = new URL("./", import.meta.url);
const output = new URL("../../../dist/preview/hologram/", here);
await mkdir(output, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("preview.entry.js", here))],
  outfile: fileURLToPath(new URL("preview.js", output)),
  bundle: true,
  format: "iife",
  loader: { ".mp3": "binary" },
});
await Promise.all(
  ["index.html", "style.css"].map((name) => cp(new URL(name, here), new URL(name, output))),
);

import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
process.chdir(fileURLToPath(new URL(".", import.meta.url)));
await mkdir("dist", { recursive: true });
for (const asset of [
  "sw.js",
  "fonts",
  "icon-192.png",
  "icon-512.png",
  "app.webmanifest",
  "index.html",
  "OpenClaw-LICENSE.txt",
])
  await cp("web/" + asset, "dist/" + asset, { recursive: true });
await build({
  entryPoints: ["web/app.js", "web/style.css"],
  outdir: "dist",
  bundle: true,
  minify: true,
  format: "iife",
  loader: { ".woff2": "file" },
  assetNames: "fonts/[name]",
});
let css = await readFile("dist/style.css", "utf8");
for (const name of ["vazirmatn", "space-grotesk-latin"]) {
  const file = "./fonts/" + name + ".woff2";
  css = css.replaceAll(
    file,
    "data:font/woff2;base64," + (await readFile("web/" + file)).toString("base64"),
  );
}
const fontLicenses = (
  await Promise.all(
    ["Vazirmatn-LICENSE.txt", "space-grotesk-OFL.txt"].map((name) =>
      readFile("web/fonts/" + name, "utf8"),
    ),
  )
).join("\n");
const html = (await readFile("web/index.html", "utf8"))
  .replace("<html lang", "<html data-standalone lang")
  .replace('<link rel="stylesheet" href="./style.css">', () => "<style>" + css + "</style>");
function inlineJs(source) {
  return source.replaceAll("</script", "<\\/script");
}
const logo = "data:image/png;base64," + (await readFile("web/icon-192.png")).toString("base64");
const license =
  "data:text/plain;charset=utf-8," +
  encodeURIComponent(await readFile("web/OpenClaw-LICENSE.txt", "utf8"));
const js = (await readFile("dist/app.js", "utf8"))
  .replaceAll("./icon-192.png", logo)
  .replaceAll("./OpenClaw-LICENSE.txt", license);
await writeFile(
  "dist/review.html",
  html
    .replaceAll("./icon-192.png", logo)
    .replace(
      "</head>",
      () => "<script type='text/plain' id='font-licenses'>" + fontLicenses + "</script></head>",
    )
    .replace('<link rel="manifest" href="./app.webmanifest">', "")
    .replace(
      '<script type="module" src="./app.js"></script>',
      () => "<script>" + inlineJs(js) + "</script>",
    ),
);

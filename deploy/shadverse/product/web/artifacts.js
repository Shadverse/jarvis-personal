const escapeHtml = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

export function draftDocument(text, language) {
  const persian = language === "fa";
  const title = persian ? "پیش‌نویس جارویس شادوِرس" : "SHADVERSE JARVIS draft";
  return `<!doctype html>
<html lang="${persian ? "fa" : "en"}" dir="${persian ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
@page { margin: 20mm; }
body { margin: 32px auto; max-width: 72ch; padding: 0 16px; font-family: Tahoma, Arial, sans-serif; color: #111; line-height: 1.7; }
h1 { font-size: 22px; text-align: center; }
article { white-space: pre-wrap; overflow-wrap: anywhere; }
@media print { body { margin: 0; padding: 0; } }
</style>
</head>
<body><main><h1>${title}</h1><article dir="auto">${escapeHtml(text)}</article></main></body>
</html>`;
}

function csvCell(value) {
  const safe = /^[\s\p{Cf}]*[=+\-@\t\r\n]/u.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function notesCsv(notes, language) {
  const headings =
    language === "fa" ? ["یادداشت", "آخرین ویرایش (UTC)"] : ["Note", "Last updated (UTC)"];
  const rows = [
    headings,
    ...notes.map(({ text, updated }) => [text, new Date(updated).toISOString()]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

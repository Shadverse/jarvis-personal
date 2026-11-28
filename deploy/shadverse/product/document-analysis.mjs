import { normalizeMemoryText } from "./memory-context.mjs";

export const plainFormats = ["txt", "md", "csv"];

export function documentKind(name) {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return extension === "jpg" ? "jpeg" : extension;
}

export function parseCsv(text) {
  const rows = [];
  let row = [],
    value = "",
    state = "field",
    truncated = false;
  function finishField() {
    if (row.length < 32) row.push(value.slice(0, 600));
    else truncated = true;
    if (value.length > 600) truncated = true;
    value = "";
    state = "field";
  }
  for (let i = 0; i < text.length && rows.length < 250; i++) {
    const char = text[i];
    if (state === "quoted") {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') state = "closed";
      else value += char;
    } else if (char === '"' && !value && state === "field") state = "quoted";
    else if (char === "," || char === "\r" || char === "\n") {
      finishField();
      if (char !== ",") {
        rows.push(row);
        row = [];
        if (char === "\r" && text[i + 1] === "\n") i++;
      }
    } else {
      if (state === "closed") throw Error("Malformed CSV");
      value += char;
    }
    if (rows.length === 250 && i < text.length - 1) truncated = true;
  }
  if (state === "quoted") throw Error("Unclosed CSV column");
  if (rows.length < 250 && (value || row.length || state === "closed")) {
    finishField();
    rows.push(row);
  }
  return { rows, truncated };
}

export async function readDocument(document, processor) {
  const kind = documentKind(document.name);
  const bytes = Buffer.from(document.payload);
  if (!plainFormats.includes(kind)) {
    if (!processor?.read.includes(kind)) return { error: "file_processor" };
    return processor.run({ operation: "extract", kind, content: bytes.toString("base64") });
  }
  const text = bytes.toString("utf8").replace(/^\uFEFF/u, "");
  if (kind === "csv") {
    try {
      const { rows, truncated } = parseCsv(text);
      return { passages: [], tables: [{ label: "CSV", rows }], truncated };
    } catch {
      return { error: "file_invalid" };
    }
  }
  const lines = text
    .split(/\r?\n/u)
    .map((line, index) => ({
      label: String(index + 1),
      text: line.trim().slice(0, 1400),
    }))
    .filter((line) => line.text);
  return {
    passages: lines.slice(0, 200),
    tables: [],
    truncated: lines.length > 200 || text.length > 32_000,
  };
}

function words(text) {
  return new Set(
    (normalizeMemoryText(text).match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(
      (word) =>
        !["what", "which", "the", "and", "about", "برای", "درباره", "چیست", "کدام"].includes(word),
    ),
  );
}
function number(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/[۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace("٫", ".");
  return /^-?\d+(?:\.\d+)?$/u.test(normalized) && Number.isFinite(Number(normalized))
    ? Number(normalized)
    : null;
}

export function analyzeDocument(name, extracted, question) {
  const query = words(question);
  const candidates = [
    ...extracted.passages,
    ...extracted.tables.flatMap(({ label, rows }) =>
      rows
        .slice(0, 40)
        .map((row, index) => ({ label: `${label} · ${index + 1}`, text: row.join(" · ") })),
    ),
  ];
  const passages = candidates
    .map(({ label, text }) => ({
      label,
      text: text.slice(0, 1000),
      matches: [...words(text)].filter((word) => query.has(word)).length,
    }))
    .filter((passage) => !question || passage.matches)
    .sort((a, b) => b.matches - a.matches)
    .slice(0, 8)
    .map(({ label, text }) => ({ label, text }));
  const tables = extracted.tables.map(({ label, rows }) => {
    const headers = rows[0] ?? [];
    const columns = headers
      .map((name, index) => {
        const values = rows
          .slice(1)
          .map((row) => number(row[index]))
          .filter((value) => Number.isFinite(value));
        if (!values.length) return null;
        const sum = values.reduce((a, b) => a + b, 0);
        return {
          label: String(name || index + 1),
          count: values.length,
          total: Number.isFinite(sum) ? sum : null,
          min: Math.min(...values),
          max: Math.max(...values),
        };
      })
      .filter(Boolean);
    return { label, rowCount: Math.max(rows.length - 1, 0), columns };
  });
  return { name, passages, tables, truncated: extracted.truncated, image: extracted.image ?? null };
}

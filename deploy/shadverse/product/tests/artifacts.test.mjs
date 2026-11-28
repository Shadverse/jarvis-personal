import assert from "node:assert/strict";
import test from "node:test";
import { draftDocument, notesCsv } from "../web/artifacts.js";

test("local artifacts preserve Persian text and neutralize executable content", () => {
  const draft = draftDocument('سلام\n<script src="https://invalid.test/a"></script>', "fa");
  assert.match(draft, /<html lang="fa" dir="rtl">/);
  assert.match(draft, /default-src 'none'/);
  assert.ok(
    draft.includes("سلام\n&lt;script src=&quot;https://invalid.test/a&quot;&gt;&lt;/script&gt;"),
  );
  assert.doesNotMatch(draft, /<script\b/);
  const csv = notesCsv(
    [
      { text: 'سلام "جهان"\nخط دوم', updated: 0 },
      { text: "\t=1+2", updated: 60_000 },
    ],
    "fa",
  );
  assert.equal(
    csv,
    '\uFEFF"یادداشت","آخرین ویرایش (UTC)"\r\n"سلام ""جهان""\nخط دوم","1970-01-01T00:00:00.000Z"\r\n"\'\t=1+2","1970-01-01T00:01:00.000Z"\r\n',
  );
});

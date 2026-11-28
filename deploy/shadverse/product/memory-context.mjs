const stopWords = new Set(
  "what which where how does about this that from please when with have and the برای درباره چطور چیست چه چرا کدام این آن آیا لطفا بود است های که می".split(
    " ",
  ),
);

export function normalizeMemoryText(text) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[يى]/gu, "ی")
    .replace(/ك/gu, "ک")
    .replace(/[\p{M}\p{Cf}ـ]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function terms(text) {
  return new Set(
    (normalizeMemoryText(text).match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (token) => token.length >= 3 && !stopWords.has(token),
    ),
  );
}

export function rankContext(message, notes, history, secret) {
  const query = terms(message);
  if (!query.size) return [];
  const entries = [
    ...notes
      .filter(({ contextAllowed }) => contextAllowed === 1)
      .map(({ id, updated, kind, text }) => ({ id, updated, kind, text })),
    ...history.map(({ id, created, message }) => ({
      id,
      updated: created,
      kind: "conversation",
      text: message,
    })),
  ];
  return entries
    .filter(({ text }) => text.length <= 500 && !text.includes(secret))
    .map((entry) => {
      const entryTerms = terms(entry.text);
      const matched = [...query].filter((token) => entryTerms.has(token));
      const score = matched.length * 10 + matched.length / Math.max(1, entryTerms.size);
      return {
        entry,
        score,
        relevant:
          matched.length > 1 ||
          (matched.length === 1 && (query.size === 1 || matched[0].length >= 5)),
      };
    })
    .filter(({ relevant }) => relevant)
    .sort((a, b) => b.score - a.score || b.entry.updated - a.entry.updated)
    .slice(0, 3)
    .map(({ entry }) => entry);
}

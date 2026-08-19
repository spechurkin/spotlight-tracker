export function normalizeSearchText(value, locale = undefined) {
  const text = String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim();
  return locale ? text.toLocaleLowerCase(locale) : text.toLocaleLowerCase();
}

export function matchesSearch(haystack, query, locale = undefined) {
  const normalizedQuery = normalizeSearchText(query, locale);
  if (!normalizedQuery) return true;
  return normalizeSearchText(haystack, locale).includes(normalizedQuery);
}

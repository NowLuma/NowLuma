export function decodeHtml(value) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (match, entity) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()];
    const code =
      entity[1].toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

export function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

export function idsOf(html) {
  return new Set(
    [...html.matchAll(/<[a-z][^>]*\sid="([^"]+)"[^>]*>/gi)].map((match) => decodeHtml(match[1])),
  );
}

export function referencesOf(html) {
  return [...html.matchAll(/<(a|img|script|link|iframe|source)\b[^>]*>/gi)].map((match) => ({
    tag: match[1].toLowerCase(),
    ...attributes(match[0]),
  }));
}

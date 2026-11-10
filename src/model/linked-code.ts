// The lines of a source a linked code block shows, as the fragment of its URL names them.

/**
 * The first and last line a code URL's fragment names, such as `#L10-L20` or `#L7`; null without
 * one.
 */
export function parseCodeLines(url: string): { readonly from: number; readonly to: number } | null {
  const match = /#L(\d+)(?:-L?(\d+))?$/i.exec(url.trim());
  if (!match) return null;
  const from = Number(match[1]);
  const to = match[2] ? Number(match[2]) : from;
  return from > 0 && to >= from ? { from, to } : null;
}

/** The lines of a source text a URL's fragment names, all of it without one. */
export function sliceCodeLines(source: string, url: string): { code: string; startLine: number } {
  const lines = parseCodeLines(url);
  if (!lines) return { code: source, startLine: 1 };
  return {
    code: source
      .split('\n')
      .slice(lines.from - 1, lines.to)
      .join('\n'),
    startLine: lines.from,
  };
}

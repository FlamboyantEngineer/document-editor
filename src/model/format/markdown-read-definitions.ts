// Link and footnote definitions are read at block boundaries, after any list or quote prefix.

export interface Definitions {
  readonly links: Map<string, string>;
  readonly defineNote: (label: string, source: string) => void;
}

const definition = /^ {0,3}\[(\^?)([^\]]+)\]:[ \t]*(.*)$/;
const continuation = /^(?: {4}|\t| {2,3}(?=\S))/;

export const isDefinition = (line: string): boolean => definition.test(line);

export function takeDefinition(
  cursor: { readonly lines: readonly string[]; at: number },
  { links, defineNote }: Definitions,
): boolean {
  const found = definition.exec(cursor.lines[cursor.at] ?? '');
  if (!found) return false;
  const [, note, label = '', value = ''] = found;
  cursor.at += 1;
  if (!note) {
    links.set(label.toLowerCase(), /^<?([^\s>]*)/.exec(value)?.[1] ?? '');
    return true;
  }
  const text = [value];
  while (continuation.test(cursor.lines[cursor.at] ?? '')) {
    text.push((cursor.lines[cursor.at] ?? '').replace(continuation, ''));
    cursor.at += 1;
  }
  defineNote(label, text.join('\n'));
  return true;
}

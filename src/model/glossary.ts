/** A glossary of abbreviations, and the text a document's references to its entries keep. */
export interface GlossaryEntry {
  id: string;
  abbreviation: string;
  expansion: string;
  archivedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AbbreviationReferenceAttrs {
  entryId: string;
  display: 'full' | 'short';
  abbr: string;
  expansion: string;
}

export const ABBREVIATION_CACHE_REFRESH_META = 'doceditor-abbreviation-cache-refresh';

export function isGlossaryEntryId(value: string): boolean {
  return /^[a-zA-Z0-9-]{1,64}$/.test(value);
}

export function normalizeGlossaryInput(input: { abbreviation?: unknown; expansion?: unknown }): {
  abbreviation: string;
  expansion: string;
} {
  const abbreviation = typeof input.abbreviation === 'string' ? input.abbreviation.trim() : '';
  const expansion = typeof input.expansion === 'string' ? input.expansion.trim() : '';
  if (!abbreviation || abbreviation.length > 32)
    throw new Error('Abbreviation must contain 1–32 characters.');
  if (!expansion || expansion.length > 256)
    throw new Error('Expansion must contain 1–256 characters.');
  return { abbreviation, expansion };
}

export function abbreviationDisplayText(attrs: {
  abbr?: unknown;
  expansion?: unknown;
  display?: unknown;
}): string {
  const abbr = String(attrs.abbr || '');
  return attrs.display === 'short' ? abbr : `${String(attrs.expansion || '')} (${abbr})`;
}

export function abbreviationTooltip(attrs: { abbr?: unknown; expansion?: unknown }): string {
  return `${String(attrs.abbr || '')} — ${String(attrs.expansion || '')}`;
}

export function abbreviationTargetId(entryId: string): string {
  return `abbr-${entryId}`;
}

export function compareAbbreviations(
  a: { abbr: string; expansion: string; entryId: string },
  b: { abbr: string; expansion: string; entryId: string },
): number {
  const compare = (left: string, right: string) =>
    left.localeCompare(right, 'en', { sensitivity: 'variant' });
  return (
    compare(a.abbr, b.abbr) || compare(a.expansion, b.expansion) || compare(a.entryId, b.entryId)
  );
}

export function prefillAbbreviation(selection: string): {
  abbreviation: string;
  expansion: string;
} {
  const text = selection.trim();
  const full = /^(.+?)\s+\(([^()\s]+)\)$/.exec(text);
  if (full?.[1] && full[2]) return { abbreviation: full[2], expansion: full[1] };
  if (text.length <= 10 && /^[\p{Lu}\d\p{P}]+$/u.test(text) && /\p{Lu}/u.test(text)) {
    return { abbreviation: text, expansion: '' };
  }
  return {
    abbreviation: text
      .split(/\s+/)
      .map((word) => Array.from(word)[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 32),
    expansion: text,
  };
}

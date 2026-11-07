// Caption text helpers shared by the schema (reading and writing caption attributes), the caption
// widgets, the table of contents and the reference collectors. Pure string functions.

export function normalizeCaptionText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCaptionContinuedSuffix(value: unknown): string {
  const text = normalizeCaptionText(value).replace(/^-\s*/, '').trim();
  return text ? ` ${text}` : '';
}

export interface FormatCaptionLineTextOptions {
  elementName?: string;
  numbering?: string;
  captionText?: string;
  continuedSuffix?: string;
}

export function formatCaptionLineText({
  elementName = '',
  numbering = '',
  captionText = '',
  continuedSuffix = '',
}: FormatCaptionLineTextOptions = {}): string {
  const label = [normalizeCaptionText(elementName), normalizeCaptionText(numbering)]
    .filter(Boolean)
    .join(' ');
  const caption = normalizeCaptionText(captionText);
  const suffix = normalizeCaptionContinuedSuffix(continuedSuffix);
  const captionWithSuffix = caption ? `${caption}${suffix}` : suffix.trimStart();
  return `${label} - ${captionWithSuffix}`;
}

export function deriveLinkedCodeBlockCaption(url: unknown): string {
  const rawUrl = normalizeCaptionText(url);
  if (!rawUrl) return 'linked source';

  // A relative address resolves against a fixed base: only its last path segment is used.
  let pathText: string;
  try {
    pathText = new URL(rawUrl, 'https://example.invalid/').pathname || rawUrl;
  } catch {
    pathText = rawUrl.split(/[?#]/)[0] || rawUrl;
  }

  const candidate = pathText.split(/[\\/]/).filter(Boolean).pop() || rawUrl;
  try {
    return normalizeCaptionText(decodeURIComponent(candidate)) || 'linked source';
  } catch {
    return normalizeCaptionText(candidate) || 'linked source';
  }
}

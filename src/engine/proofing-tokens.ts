// Technical tokens, which a proofer's dictionary does not hold and the writer means as written:
// acronyms, part numbers, standards and identifiers, such as USB, XB12C-Q7, 4K60,
// ISO-8601 or max_count. Issues on them are not marked unless the host says otherwise.

// An acronym, plural or not: two or more capitals or digits, starting with a capital.
const ACRONYM = /^[A-Z][A-Z0-9]+s?$/;
// Capitals and digits joined by hyphens, slashes, dots or underscores: MIL-STD, ISO/IEC.
const JOINED = /^[A-Z0-9]+(?:[-_./][A-Z0-9]+)+$/;
const LETTER = /\p{L}/u;
const DIGIT = /\d/;
// An identifier: an underscore inside it, or a capital after a small letter (camel case).
const IDENTIFIER = /\w_\w|\p{Ll}\p{Lu}/u;

/**
 * Whether a text is one technical token: an acronym, a part number or standard that mixes letters
 * and digits, capitals joined by hyphens, or an identifier.
 */
export function isTechnicalToken(text: string): boolean {
  const token = text.trim();
  if (!token || /\s/.test(token)) return false;
  if (ACRONYM.test(token) || JOINED.test(token) || IDENTIFIER.test(token)) return true;
  return LETTER.test(token) && DIGIT.test(token);
}

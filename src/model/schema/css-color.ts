// What the editor writes into a style declaration as a colour. A colour often comes from outside
// the editor, such as a pasted cell or another person in a shared document, so only a value that is
// a colour and nothing more is written: one that could end the declaration or name another
// resource is not.

const hexColor = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
// A colour's name or keyword: letters alone.
const namedColor = /^[a-z]+$/i;
// A colour function over numbers, units and plain words, holding no other function.
const colorFunction = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([\w\s.,%/+-]*\)$/i;

/**
 * Whether a value is a plain CSS colour, safe to write into a style declaration: a hex colour, a
 * colour's name, or a colour function of numbers.
 */
export function isCssColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return hexColor.test(value) || namedColor.test(value) || colorFunction.test(value);
}

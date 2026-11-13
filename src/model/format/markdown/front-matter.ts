// A document's properties as YAML front matter: a block between `---` lines before the Markdown.
// Each value is written as JSON, which YAML reads as the same value, so no text can end the block
// or change what a value is.

/** A value front matter holds: text, a number, a truth value, none, or a list or map of them. */
export type FrontMatterValue =
  | string
  | number
  | boolean
  | null
  | readonly FrontMatterValue[]
  | { readonly [key: string]: FrontMatterValue | undefined };

// A key YAML reads as itself without quotes: a name that is not one of YAML's own words.
const PLAIN_KEY = /^[A-Za-z_][\w-]*$/;
const YAML_WORDS = /^(?:true|false|null|yes|no|on|off|y|n)$/i;
const keyOf = (key: string) =>
  PLAIN_KEY.test(key) && !YAML_WORDS.test(key) ? key : JSON.stringify(key);

/** The properties as a front matter block, or null when there are none to write. */
export function frontMatterOf(
  properties: Readonly<Record<string, FrontMatterValue | undefined>>,
): string | null {
  const lines = Object.entries(properties)
    .filter((entry): entry is [string, FrontMatterValue] => entry[1] !== undefined)
    .map(([key, value]) => `${keyOf(key)}: ${JSON.stringify(value)}`);
  return lines.length ? `---\n${lines.join('\n')}\n---` : null;
}

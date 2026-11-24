// Markdown's code fences as the reader finds them: an opening fence of three backticks or tildes at
// least, with its language, and the line that closes it.

/** A code fence's run of backticks or tildes and the language its info string names. */
interface Fence {
  readonly run: string;
  readonly language: string;
}

// A backtick fence's info string holds no backtick: a line such as "```code``` text" opens none.
const OPENING = /^ {0,3}(?:(`{3,})([^`]*)|(~{3,})(.*))$/;

/** The fence a line opens, or null. */
export function openingFence(line: string): Fence | null {
  const match = OPENING.exec(line);
  if (!match) return null;
  const run = match[1] ?? match[3] ?? '```';
  const info = (match[2] ?? match[4] ?? '').trim();
  return { run, language: /^\S*/.exec(info)?.[0] ?? '' };
}

/** Whether a line closes a fence: a run of its character at least as long, and nothing after. */
export function closesFence(line: string, fence: Fence): boolean {
  const run = /^ {0,3}(`+|~+)[ \t]*$/.exec(line)?.[1] ?? '';
  return run[0] === fence.run[0] && run.length >= fence.run.length;
}

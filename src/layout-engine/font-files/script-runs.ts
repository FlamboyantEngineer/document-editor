// A text's script runs as Blink splits it before shaping (ScriptRunIterator,
// script_run_iterator.cc): a run keeps the scripts its characters share, so a digit, a space or a
// punctuation mark joins the run of the letters before it, and those that start a text join the
// run of the letters after them; a closing bracket goes back to the run its opening bracket is in.
// Each run is shaped with its script, which decides the font's features (HarfBuzz applies no
// kerning to a Hebrew run in a font without Hebrew positioning, so `שלום 123` draws its digits
// unkerned), and in its direction, with the numbers of a right-to-left run left to right, as the
// bidi algorithm orders them.

/** A stretch of text shaped in one script and direction; `script` is an ISO 15924 code. */
export interface ScriptRun {
  readonly start: number;
  readonly end: number;
  readonly script: string | null;
  readonly rtl: boolean;
}

// The scripts the measurer tells apart, as ISO 15924 codes (HarfBuzz's script tags). A letter of
// any other script is of a script of its own, `Zzzz`, which HarfBuzz guesses from the text.
const SCRIPTS = [
  'Latn',
  'Grek',
  'Cyrl',
  'Armn',
  'Hebr',
  'Arab',
  'Syrc',
  'Thaa',
  'Nkoo',
  'Samr',
  'Mand',
  'Adlm',
  'Rohg',
  'Deva',
  'Beng',
  'Guru',
  'Gujr',
  'Orya',
  'Taml',
  'Telu',
  'Knda',
  'Mlym',
  'Sinh',
  'Thai',
  'Laoo',
  'Tibt',
  'Mymr',
  'Geor',
  'Hang',
  'Ethi',
  'Cher',
  'Khmr',
  'Mong',
  'Hira',
  'Kana',
  'Bopo',
  'Hani',
  'Yiii',
  'Java',
  'Bali',
  'Tfng',
  'Copt',
  'Brai',
] as const;
const RIGHT_TO_LEFT = new Set([
  'Hebr',
  'Arab',
  'Syrc',
  'Thaa',
  'Nkoo',
  'Samr',
  'Mand',
  'Adlm',
  'Rohg',
]);
const tests = SCRIPTS.map((script) => [script, new RegExp(`\\p{scx=${script}}`, 'u')] as const);
const common = /[\p{scx=Zyyy}\p{scx=Zinh}]/u;
// European, Arabic-Indic and extended Arabic-Indic digits, with the separators the bidi algorithm
// keeps inside a number (W4): such a number reads left to right in a right-to-left run.
const number = /[0-9٠-٩۰-۹](?:[.,:/،٫٬]?[0-9٠-٩۰-۹])*/gu;
// Paired brackets (Bidi_Paired_Bracket), opening to closing.
const PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '༺': '༻',
  '༼': '༽',
  '᚛': '᚜',
  '⁅': '⁆',
  '⁽': '⁾',
  '₍': '₎',
  '〈': '〉',
  '〈': '〉',
  '《': '》',
  '「': '」',
  '『': '』',
  '【': '】',
  '〔': '〕',
  '〖': '〗',
  '〘': '〙',
  '〚': '〛',
  '﹙': '﹚',
  '﹛': '﹜',
  '﹝': '﹞',
  '（': '）',
  '［': '］',
  '｛': '｝',
  '｟': '｠',
  '｢': '｣',
};
const OPENING = new Map(Object.entries(PAIRS).map(([open, close]) => [close, open]));

const known = new Map<number, readonly string[] | null>();

/** A character's scripts (Script_Extensions), or null for one of every script. */
function scriptsOf(character: string): readonly string[] | null {
  const code = character.codePointAt(0) ?? 0;
  let scripts = known.get(code);
  if (scripts === undefined) {
    if (common.test(character)) scripts = null;
    else {
      const listed = tests.filter(([, test]) => test.test(character)).map(([script]) => script);
      scripts = listed.length ? listed : ['Zzzz'];
    }
    known.set(code, scripts);
  }
  return scripts;
}

const shared = (run: readonly string[] | null, scripts: readonly string[] | null) =>
  run === null
    ? scripts
    : scripts === null
      ? run
      : run.filter((script) => scripts.includes(script));

interface OpenBracket {
  readonly bracket: string;
  /** The run the bracket was opened in, numbered; its script is known once the run ends. */
  readonly run: number;
  readonly previousOfType: OpenBracket | undefined;
}

// Matching discards the opener and all the entries above it. Each entry is pushed and popped once.
function createBracketStack() {
  const stack: OpenBracket[] = [];
  const nearest = new Map<string, OpenBracket>();
  return {
    open(bracket: string, run: number) {
      const entry = { bracket, run, previousOfType: nearest.get(bracket) };
      stack.push(entry);
      nearest.set(bracket, entry);
    },
    close(bracket: string) {
      const opener = OPENING.get(bracket);
      const paired = opener === undefined ? undefined : nearest.get(opener);
      if (!paired) return undefined;
      for (let entry = stack.pop(); entry; entry = stack.pop()) {
        const { bracket, previousOfType } = entry;
        if (previousOfType) nearest.set(bracket, previousOfType);
        else nearest.delete(bracket);
        if (entry === paired) break;
      }
      return paired.run;
    },
  };
}

/** Each character's run, numbered, and each run's script, as ScriptRunIterator reads them. */
function itemize(characters: readonly string[]) {
  const runOf: number[] = [];
  const resolved: (string | null)[] = [];
  let brackets: ReturnType<typeof createBracketStack> | undefined;
  let current: readonly string[] | null = null;
  for (const character of characters) {
    let scripts = scriptsOf(character);
    const pairedRun = brackets?.close(character);
    if (pairedRun !== undefined && pairedRun < resolved.length)
      scripts = [resolved[pairedRun] ?? 'Zzzz'];
    const together = shared(current, scripts);
    if (together === null || together.length) current = together;
    else {
      resolved.push(current?.[0] ?? null);
      current = scripts;
    }
    runOf.push(resolved.length);
    if (PAIRS[character]) {
      brackets ??= createBracketStack();
      brackets.open(character, resolved.length);
    }
  }
  resolved.push(current?.[0] ?? null);
  return { runOf, resolved };
}

/** The script runs of a text, with its numbers left to right inside a right-to-left run. */
export function scriptRuns(text: string): ScriptRun[] {
  const characters = [...text];
  const { runOf, resolved } = itemize(characters);
  const numbers = new Set<number>();
  for (const match of text.matchAll(number))
    for (let index = match.index; index < match.index + match[0].length; index += 1)
      numbers.add(index);
  const runs: ScriptRun[] = [];
  let offset = 0;
  characters.forEach((character, index) => {
    const script = resolved[runOf[index] ?? 0] ?? null;
    const rtl = script !== null && RIGHT_TO_LEFT.has(script) && !numbers.has(offset);
    const last = runs.at(-1);
    const end = offset + character.length;
    if (last && last.end === offset && last.script === script && last.rtl === rtl)
      runs[runs.length - 1] = { ...last, end };
    else runs.push({ start: offset, end, script, rtl });
    offset = end;
  });
  return runs;
}

/** Reads runs at increasing UTF-16 offsets, including across Canvas word boundaries. */
export function createScriptRunCursor(text: string): (offset: number) => ScriptRun | undefined {
  const runs = scriptRuns(text);
  let index = 0;
  return (offset) => {
    let run = runs[index];
    while (run && offset >= run.end) run = runs[++index];
    return run;
  };
}

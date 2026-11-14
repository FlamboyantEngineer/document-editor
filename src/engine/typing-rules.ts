// Typing shortcuts: Markdown-style marks typed at the start of a block or around text become the
// block or the mark they stand for, and plain typography becomes its typeset character. Backspace
// right after one takes it back to what was typed. Code keeps what is typed.

import { ellipsis, InputRule, inputRules, smartQuotes } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import type {
  Attrs,
  Mark,
  MarkType,
  Node as ProseMirrorNode,
  NodeType,
  Schema,
} from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { canJoin, findWrapping, type Step } from 'prosemirror-transform';

/** Which typing shortcuts run. Each group is on unless turned off. */
export interface TypingRulesOptions {
  /** `# ` headings, `- ` and `1. ` lists, `> ` quotes, ```` ``` ```` code and `---` rules. */
  blocks?: boolean | undefined;
  /** `**strong**`, `*em*`, `_em_`, `~~strike~~` and `` `code` ``. */
  marks?: boolean | undefined;
  /** Curly quotes, dashes, the ellipsis, arrows and symbols. */
  typography?: boolean | undefined;
}

/** Where an input rule's match starts and where the caret is. */
type RuleRange = [start: number, end: number];

// Wraps `**text**`-style delimited text in a mark once its closing delimiter is typed.
function markRule(pattern: RegExp, type: MarkType): InputRule {
  return new InputRule(
    pattern,
    (state, match, ...[start, end]: RuleRange) => {
      const [, before = '', text = ''] = match;
      if (!text) return null;
      const from = start + before.length;
      const $from = state.doc.resolve(from);
      if (!$from.parent.type.allowsMarkType(type)) return null;
      const tr = state.tr.delete(from, end).insertText(text, from);
      return tr.addMark(from, from + text.length, type.create()).removeStoredMark(type);
    },
    { inCodeMark: false },
  );
}

// Typing a third `-` (after `--` became a dash), or `___`, alone in a paragraph turns it into a
// horizontal rule, with the caret in the paragraph after it.
function ruleLine(type: NodeType): InputRule {
  return new InputRule(/^(?:---|—-|___)$/, (state, _match, ...[start, end]: RuleRange) => {
    const $start = state.doc.resolve(start);
    const block = $start.parent;
    if (block.type.name !== 'paragraph' || block.content.size !== end - start) return null;
    const container = $start.node(-1);
    const index = $start.index(-1);
    if (!container.canReplaceWith(index, index + 1, type)) return null;
    const paragraph = block.type.create();
    const tr = state.tr.replaceWith($start.before(), $start.after(), [type.create(), paragraph]);
    const after = $start.before() + type.create().nodeSize + 1;
    return tr.setSelection(TextSelection.create(tr.doc, after));
  });
}

// Typing the pattern at the start of a paragraph turns the paragraph into another text block, such
// as a heading, keeping its text. Other text blocks keep what is typed.
function paragraphTo(
  pattern: RegExp,
  type: NodeType,
  attrs: (match: RegExpMatchArray) => Attrs | null = () => null,
): InputRule {
  return new InputRule(pattern, (state, match, ...[start, end]: RuleRange) => {
    const $start = state.doc.resolve(start);
    if ($start.parent.type.name !== 'paragraph') return null;
    const index = $start.index(-1);
    if (!$start.node(-1).canReplaceWith(index, index + 1, type)) return null;
    return state.tr.delete(start, end).setBlockType(start, start, type, attrs(match));
  });
}

// Typing the pattern at the start of a paragraph wraps it in a list or a quote. A number typed
// right after a list of the same kind that ends there joins that list when it carries on its count.
interface Wrapping {
  /** The wrapper's attributes, read from what was typed. */
  readonly attrs?: ((match: RegExpMatchArray) => Attrs | null) | undefined;
  /** Whether the paragraph joins a wrapper of the same type just before it. */
  readonly joins?: ((match: RegExpMatchArray, list: ProseMirrorNode) => boolean) | undefined;
}

function paragraphInto(
  pattern: RegExp,
  type: NodeType,
  { attrs = () => null, joins = () => true }: Wrapping = {},
): InputRule {
  return new InputRule(pattern, (state, match, ...[start, end]: RuleRange) => {
    const $start = state.doc.resolve(start);
    if ($start.parent.type.name !== 'paragraph') return null;
    const tr = state.tr.delete(start, end);
    const range = tr.doc.resolve(start).blockRange();
    const wrapping = range && findWrapping(range, type, attrs(match));
    if (!range || !wrapping) return null;
    tr.wrap(range, wrapping);
    const before = tr.doc.resolve(start - 1).nodeBefore;
    if (before?.type === type && canJoin(tr.doc, start - 1) && joins(match, before)) {
      tr.join(start - 1);
    }
    return tr;
  });
}

function blockRules(schema: Schema): InputRule[] {
  const { heading, blockquote } = schema.nodes;
  const codeBlock = schema.nodes.code_block;
  const bulletList = schema.nodes.bullet_list;
  const orderedList = schema.nodes.ordered_list;
  const horizontalRule = schema.nodes.horizontal_rule;
  const rules: (InputRule | false | undefined)[] = [
    horizontalRule && ruleLine(horizontalRule),
    heading && paragraphTo(/^(#{1,6})\s$/, heading, (match) => ({ level: match[1]?.length ?? 1 })),
    codeBlock && paragraphTo(/^```\s$/, codeBlock),
    blockquote && paragraphInto(/^\s*>\s$/, blockquote),
    bulletList && paragraphInto(/^\s*[-+*]\s$/, bulletList),
    orderedList &&
      // Nine digits keep the start a safe integer, as a stored list's order must be.
      paragraphInto(/^\s*(\d{1,9})\.\s$/, orderedList, {
        attrs: (match) => ({ order: Number(match[1]) }),
        joins: (match, list) => list.childCount + Number(list.attrs.order) === Number(match[1]),
      }),
  ];
  return rules.filter((rule): rule is InputRule => Boolean(rule));
}

function markRules(schema: Schema): InputRule[] {
  const { strong, em, strike, code } = schema.marks;
  const rules: (InputRule | false | undefined)[] = [
    strong && markRule(/(^|[^*])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, strong),
    strong && markRule(/(^|[^_\w])__([^_\s](?:[^_]*[^_\s])?)__$/, strong),
    em && markRule(/(^|[^*])\*([^*\s](?:[^*]*[^*\s])?)\*$/, em),
    em && markRule(/(^|[^_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, em),
    strike && markRule(/(^|[^~])~~([^~\s](?:[^~]*[^~\s])?)~~$/, strike),
    code && markRule(/(^|[^`])`([^`]+)`$/, code),
  ];
  return rules.filter((rule): rule is InputRule => Boolean(rule));
}

// A plain sequence replaced by its character as soon as it is typed.
const replace = (pattern: RegExp, text: string) =>
  new InputRule(pattern, text, { inCodeMark: false });

/** The typographic replacements, in the order they are tried. */
export const TYPOGRAPHY_RULES: readonly InputRule[] = [
  ...smartQuotes,
  ellipsis,
  // `--` becomes an em dash; a third `-` alone in a paragraph then makes a rule.
  replace(/--$/, '—'),
  replace(/->$/, '→'),
  replace(/<-$/, '←'),
  // `<-` became a left arrow; a `>` typed after it makes the arrow both ways.
  replace(/←>$/, '↔'),
  replace(/=>$/, '⇒'),
  replace(/\(c\)$/i, '©'),
  replace(/\(r\)$/i, '®'),
  replace(/\(tm\)$/i, '™'),
  replace(/\+-$/, '±'),
  replace(/!=$/, '≠'),
  replace(/<=$/, '≤'),
  replace(/>=$/, '≥'),
];

// The last shortcut, until another change or move: its steps with the steps other plugins
// appended to it, such as a new block's element id, and the text the writer typed.
interface LastShortcut {
  readonly steps: readonly Step[];
  readonly docs: readonly ProseMirrorNode[];
  readonly from: number;
  readonly to: number;
  readonly text: string;
  /** The marks the shortcut left for the next typed text, such as none after a closed mark. */
  readonly storedMarks: readonly Mark[] | null | undefined;
}

/** The plugin that keeps the last typing shortcut for Backspace to take back. */
export const typingRulesKey = new PluginKey<LastShortcut | null>('typing-rules');

// The record of the shortcut a transaction made; null for any other transaction.
function shortcutOf(tr: Transaction, rules: Plugin): LastShortcut | null {
  const typed = tr.getMeta(rules) as { from: number; to: number; text: string } | undefined;
  if (!typed) return null;
  const storedMarks = tr.storedMarksSet ? tr.storedMarks : undefined;
  return { steps: tr.steps, docs: tr.docs, ...typed, storedMarks };
}

function lastShortcut(rules: Plugin): Plugin {
  return new Plugin<LastShortcut | null>({
    key: typingRulesKey,
    state: {
      init: () => null,
      apply(tr, last) {
        const made = shortcutOf(tr, rules);
        if (made) return made;
        const root = tr.getMeta('appendedTransaction') as Transaction | undefined;
        if (last && root && shortcutOf(root, rules)) {
          return { ...last, steps: [...last.steps, ...tr.steps], docs: [...last.docs, ...tr.docs] };
        }
        return tr.docChanged || tr.selectionSet ? null : last;
      },
    },
    // A change appended to the shortcut, such as an author mark, clears the marks it left for the
    // next typed text, so text typed after a closed mark would join it; they are set again.
    appendTransaction(transactions, _old, state) {
      const last = typingRulesKey.getState(state);
      if (!last?.storedMarks || state.storedMarks === last.storedMarks) return null;
      const appended = transactions.some((tr) => tr.getMeta('appendedTransaction'));
      return appended ? state.tr.setStoredMarks(last.storedMarks) : null;
    },
  });
}

/** Takes the last typing shortcut back to the text the writer typed; false when there is none. */
export const undoTypingRule: Command = (state, dispatch) => {
  const last = typingRulesKey.getState(state);
  if (!last) return false;
  if (dispatch) {
    const tr = state.tr;
    for (let index = last.steps.length - 1; index >= 0; index -= 1) {
      const step = last.steps[index];
      const doc = last.docs[index];
      if (step && doc) tr.step(step.invert(doc));
    }
    const marks = tr.doc.resolve(last.from).marks();
    tr.replaceWith(last.from, last.to, state.schema.text(last.text, marks));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * The typing shortcuts as plugins: the input rules, the last shortcut they made, and Backspace
 * taking it back. A rule never runs in code.
 */
export function createTypingRules(schema: Schema, options: TypingRulesOptions = {}): Plugin[] {
  const { blocks = true, marks = true, typography = true } = options;
  const rules = [
    ...(blocks ? blockRules(schema) : []),
    ...(marks ? markRules(schema) : []),
    ...(typography ? TYPOGRAPHY_RULES : []),
  ];
  if (!rules.length) return [];
  const plugin = inputRules({ rules });
  return [plugin, lastShortcut(plugin), keymap({ Backspace: undoTypingRule })];
}

/**
 * For a transaction a typing shortcut made, the transaction that types its text as written, on
 * the state it was made on; null for any other transaction. A writer whose shortcut cannot be
 * kept, such as one a suggestion cannot record, keeps what they typed.
 */
export function typedAsWritten(tr: Transaction, state: EditorState): Transaction | null {
  for (const plugin of state.plugins) {
    if (!(plugin.spec as { isInputRules?: boolean }).isInputRules) continue;
    const typed = tr.getMeta(plugin) as { from: number; to: number; text: string } | undefined;
    if (typed) return state.tr.insertText(typed.text, typed.from, typed.to);
  }
  return null;
}

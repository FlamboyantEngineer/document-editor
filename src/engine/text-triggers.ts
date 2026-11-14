// Text that opens a menu as the writer types it: a trigger character at the start of a text block
// or after a space, then the query typed after it, up to the caret, such as `/head` or `@ada`.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';

/** A character that opens a menu where the writer types it. */
export interface TextTrigger {
  /** The character, such as `/` or `@`. */
  readonly char: string;
  /** The query may hold single spaces between words, as a person's name does. Defaults to false. */
  readonly allowSpaces?: boolean | undefined;
}

/** A trigger typed before the caret: its range, from the character to the caret, and the query. */
export interface TriggerMatch {
  readonly char: string;
  readonly from: number;
  readonly to: number;
  readonly query: string;
}

// The longest query a trigger reads; past it, the writer is typing text, not a query.
const MAX_QUERY = 40;

const escaped = (char: string) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The pattern a trigger's text matches at the end of the text before the caret.
function patternOf({ char, allowSpaces = false }: TextTrigger): RegExp {
  const c = escaped(char);
  const word = `[^\\s${c}]`;
  const query = allowSpaces ? `(?:${word}+ ?)*` : `${word}*`;
  return new RegExp(`(?:^|\\s)(${c}(${query}))$`, 'u');
}

/**
 * The trigger typed before the caret, while the selection is a caret in a text block that is not
 * code, the trigger starts the block or follows a space, and its query is at most 40 characters;
 * null otherwise.
 */
export function triggerAt(state: EditorState, trigger: TextTrigger): TriggerMatch | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  const parent: ProseMirrorNode = $from.parent;
  if (!parent.inlineContent || parent.type.spec.code) return null;
  const before = parent.textBetween(0, $from.parentOffset, undefined, '\uFFFC');
  // The trigger, a query at its longest and the space before them.
  const start = Math.max(0, before.length - (MAX_QUERY + 2));
  const found = patternOf(trigger).exec(before.slice(start));
  const [, text = '', query = ''] = found ?? [];
  // A match at the cut's start, not after a space, starts inside a word.
  if (!found || query.length > MAX_QUERY || (start > 0 && found.index === 0)) return null;
  return { char: trigger.char, from: $from.pos - text.length, to: $from.pos, query };
}

/** Takes a trigger's text out of the document, and puts a node in its place when given one. */
export function replaceTrigger(match: TriggerMatch, node?: ProseMirrorNode): Command {
  return (state, dispatch) => {
    if (state.doc.textBetween(match.from, match.to) !== `${match.char}${match.query}`) return false;
    if (dispatch) {
      const tr = node
        ? state.tr.replaceWith(match.from, match.to, node)
        : state.tr.delete(match.from, match.to);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

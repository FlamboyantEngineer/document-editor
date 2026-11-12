// Typing a `{{key}}` token: once its closing braces are typed, the token becomes a live variable of
// that key, as a template's content reads its tokens. Code keeps its braces as text.

import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { TYPED_VARIABLE_TOKEN } from '../model/index.js';

/** The variable tokens plugin's key. */
export const variableTokensKey = new PluginKey('variable-tokens');

// The longest token text looked back over before the caret.
const LOOK_BACK = 200;

// Replaces the token that the typed text closes with a variable; false when it closes none.
function closeToken(view: EditorView, [from, to]: readonly [number, number], text: string) {
  const { state } = view;
  const variable = state.schema.nodes.template_variable;
  const $from = state.doc.resolve(from);
  const parent = $from.parent;
  if (!variable || view.composing || !text.endsWith('}') || parent.type.spec.code) return false;
  if (parent.type === variable || !parent.canReplaceWith($from.index(), $from.index(), variable)) {
    return false;
  }
  const before = parent.textBetween(
    Math.max(0, $from.parentOffset - LOOK_BACK),
    $from.parentOffset,
    null,
    '￼',
  );
  const match = TYPED_VARIABLE_TOKEN.exec(before + text);
  if (!match?.[1]) return false;
  const start = from - (match[0].length - text.length);
  view.dispatch(state.tr.replaceWith(start, to, variable.create({ variableKey: match[1] })));
  return true;
}

/** A plugin that turns each typed `{{key}}` token into a live variable. */
export function createVariableTokens(): Plugin {
  return new Plugin({
    key: variableTokensKey,
    props: {
      handleTextInput: (...[view, from, to, text]) => closeToken(view, [from, to], text),
    },
  });
}

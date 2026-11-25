// The full editor lab's review scope, as a host would mark the sections a review covers: the
// outline given highlights by heading (DOCE-OUTLINE-1.4), each heading under the highlight of its
// own or of the nearest heading above it, and a host decoration over the text each chosen heading
// heads (`headingSectionSpan`), through the editor's plugins.

import { type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { headingSectionSpan } from '../../src/document/index.js';
import { documentOutline } from '../../src/engine/index.js';
import type { TemplateFile } from '../../src/model/index.js';

const scopeKey = new PluginKey<ReadonlyMap<string, string>>('lab-review-scope');

/** The review's highlights by heading element id, which a transaction's meta replaces. */
export function createReviewScope(): Plugin<ReadonlyMap<string, string>> {
  return new Plugin<ReadonlyMap<string, string>>({
    key: scopeKey,
    state: {
      init: () => new Map<string, string>(),
      apply: (tr, value) => (tr.getMeta(scopeKey) as ReadonlyMap<string, string>) ?? value,
    },
    props: {
      decorations(state) {
        const highlights = scopeKey.getState(state);
        if (!highlights?.size) return null;
        const decorations = documentOutline(state, undefined, { highlights }).flatMap((entry) => {
          if (!entry.elementId || !highlights.has(entry.elementId)) return [];
          const span = headingSectionSpan(state.doc, entry.pos - 1);
          return span
            ? [
                Decoration.inline(span.from, span.to, {
                  'data-review-scope': highlights.get(entry.elementId) ?? '',
                  style: 'background-color: rgb(250 204 21 / 0.22)',
                }),
              ]
            : [];
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

interface ReviewScopeProps {
  readonly state: EditorState;
  readonly view: EditorView | null;
  readonly template: TemplateFile;
}

/** The chapters a review may cover, picked by the reader, and the outline under them. */
export function ReviewScope({ state, view, template }: ReviewScopeProps) {
  const highlights = scopeKey.getState(state) ?? new Map<string, string>();
  const outline = documentOutline(state, template, { highlights });
  const toggle = (id: string, on: boolean) => {
    if (!view) return;
    const next = new Map(highlights);
    if (on) next.set(id, 'In review');
    else next.delete(id);
    view.dispatch(view.state.tr.setMeta(scopeKey, next).setMeta('addToHistory', false));
  };
  return (
    <fieldset>
      <legend>Review scope</legend>
      {outline
        .filter((entry) => entry.level === 1 && entry.elementId)
        .map((entry) => (
          <label key={entry.elementId}>
            <input
              type="checkbox"
              checked={highlights.has(entry.elementId ?? '')}
              onChange={(event) => toggle(entry.elementId ?? '', event.currentTarget.checked)}
            />{' '}
            {entry.text}
          </label>
        ))}
      <ul aria-label="Outline highlights">
        {outline
          .filter((entry) => entry.highlight)
          .map((entry) => (
            <li key={entry.pos}>
              {`${entry.number} ${entry.text}: ${entry.highlight ?? ''}`.trim()}
            </li>
          ))}
      </ul>
    </fieldset>
  );
}

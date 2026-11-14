// The extension guide (docs/recipes/extensions.md), step by step: a host's block at a free
// ordinal, its command and key, a toolbar button reading the editor context, and the document
// rendered with no DOM.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import { wrapIn } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { createEditorContext } from '../src/components/document-editor/editor-context.js';
import { DEFAULT_EDITOR_LABELS } from '../src/components/document-editor/editor-labels.js';
import type { ToolbarButtonItem } from '../src/components/index.js';
import { writeStaticHtml } from '../src/document/index.js';
import { createDocumentEditing, isActive } from '../src/engine/index.js';
import { createDocumentKit, readDocumentFile, writeDocumentFile } from '../src/model/index.js';

const callouts: RichTextExtension = {
  name: 'callouts',
  nodes: [
    {
      name: 'callout',
      order: 285,
      spec: {
        group: 'block',
        content: 'paragraph+',
        defining: true,
        attrs: { tone: { default: 'note' } },
        parseDOM: [
          {
            tag: 'aside[data-callout]',
            getAttrs: (dom: HTMLElement) => ({ tone: dom.getAttribute('data-callout') ?? 'note' }),
          },
        ],
        toDOM: (node) => ['aside', { 'data-callout': String(node.attrs.tone) }, 0],
      },
    },
  ],
};

const kit = createDocumentKit({ extensions: [callouts] });
const { schema } = kit;
const calloutType = schema.nodes.callout;
if (!calloutType) throw new Error('no callout type');

const wrapInCallout = (tone: string): Command => wrapIn(calloutType, { tone });

const calloutKeys = keymap({ 'Mod-Alt-w': wrapInCallout('warning') });

const calloutButton: ToolbarButtonItem = {
  kind: 'button',
  id: 'warning-callout',
  group: 'insert',
  label: 'Warning callout',
  run: (editor) => editor.run(wrapInCallout('warning')),
  isEnabled: (editor) => editor.canRun(wrapInCallout('warning')),
  isPressed: (editor) => editor.isActive('callout', { tone: 'warning' }),
};

const file = {
  formatVersion: 1 as const,
  sections: [
    {
      name: null,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mind the step.' }] }],
    },
  ],
};

function stateAtText() {
  const { doc } = readDocumentFile(file, schema);
  const state = EditorState.create({
    doc,
    plugins: [calloutKeys, ...createDocumentEditing(schema)],
  });
  let at = 0;
  doc.descendants((node, pos) => {
    if (node.isText) at = pos + 2;
    return at === 0;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, at)));
}

describe('the extension guide', () => {
  it('DOCE-EDITING-8.1 wraps with the host command, and its button is enabled and then pressed', () => {
    let state = stateAtText();
    const context = () =>
      createEditorContext(null, state, { editable: true, labels: DEFAULT_EDITOR_LABELS });
    expect(isActive(state, 'callout')).toBe(false);
    expect(calloutButton.isPressed?.(context())).toBe(false);
    wrapInCallout('warning')(state, (tr) => (state = state.apply(tr)));
    expect(isActive(state, 'callout', { tone: 'warning' })).toBe(true);
    expect(isActive(state, 'callout', { tone: 'note' })).toBe(false);
    expect(calloutButton.isPressed?.(context())).toBe(true);
  });

  it('DOCE-FORMAT-6.4 stores the callout under its name and renders it with no DOM', () => {
    let state = stateAtText();
    wrapInCallout('warning')(state, (tr) => (state = state.apply(tr)));
    const stored = writeDocumentFile(state.doc).sections[0]?.content[0];
    expect(stored?.type).toBe('callout');
    expect(stored?.attrs?.tone).toBe('warning');
    const written = writeStaticHtml(readDocumentFile(writeDocumentFile(state.doc), schema).doc);
    expect(written).toMatch(
      /<aside data-callout="warning"[^>]*><p[^>]*>Mind the step\.<\/p><\/aside>/,
    );
  });
});

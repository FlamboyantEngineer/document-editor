import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { completionStatus, createInlineCompletion } from '../../engine/inline-completion.js';
import type { CompletionAvailability } from '../../host/index.js';
import { inlineCompletionItem } from './completion-item.js';
import { createEditorContext } from './editor-context.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { disabledReasonOf, isItemEnabled } from './toolbar-items.js';

function contextOf(state: EditorState, onRun: (next: EditorState) => void = () => undefined) {
  const context = createEditorContext(null, state, {
    editable: true,
    labels: DEFAULT_EDITOR_LABELS,
  });
  return {
    ...context,
    run: (command: Parameters<typeof context.run>[0]) => {
      command(state, (tr) => onRun(state.apply(tr)));
    },
  };
}

function stateWith(availability?: CompletionAvailability) {
  const provider = {
    agent: 'agent-1',
    complete: () => Promise.resolve({ ok: true as const, value: { text: '' } }),
    ...(availability ? { availability: () => availability } : {}),
  };
  return EditorState.create({
    schema: documentSchema,
    plugins: [createInlineCompletion({ provider })],
  });
}

describe('inline completion toggle', () => {
  const item = inlineCompletionItem();

  it('DOCE-AUTOMATION-3.9 shows only where the document runs completion, pressed while it is on', () => {
    expect(item).toMatchObject({ id: 'inline-completion', label: 'Inline completion' });
    expect(item.isVisible?.(contextOf(EditorState.create({ schema: documentSchema })))).toBe(
      false,
    );
    let state = stateWith();
    expect(item.isVisible?.(contextOf(state))).toBe(true);
    expect(item.isPressed?.(contextOf(state))).toBe(true);
    item.run(contextOf(state, (next) => (state = next)));
    expect(completionStatus(state)?.enabled).toBe(false);
    expect(item.isPressed?.(contextOf(state))).toBe(false);
    item.run(contextOf(state, (next) => (state = next)));
    expect(completionStatus(state)?.enabled).toBe(true);
  });

  it('DOCE-AUTOMATION-3.9 is unavailable, with the provider’s reason, while it cannot be asked', () => {
    const state = stateWith({ available: false, reason: 'Offline' });
    expect(isItemEnabled(item, contextOf(state))).toBe(false);
    expect(disabledReasonOf(item, contextOf(state))).toBe('Offline');
    expect(isItemEnabled(item, contextOf(stateWith()))).toBe(true);
  });
});

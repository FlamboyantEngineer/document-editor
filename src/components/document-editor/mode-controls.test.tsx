import { render, screen } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { Fragment } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { createEditorContext, editingModeOf, type EditorContextOptions } from './editor-context.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { markupEntries, modeEntries, shellItems } from './mode-controls.js';

const contextOf = (options: Partial<EditorContextOptions> = {}) =>
  createEditorContext(null, EditorState.create({ schema: documentSchema }), {
    editable: true,
    labels: DEFAULT_EDITOR_LABELS,
    ...options,
  });

type Entry = {
  id: unknown;
  label?: string;
  isSelected?: boolean;
  isDisabled?: boolean;
  description?: unknown;
  onAction?: () => void;
};

const byId = (entries: readonly Entry[], id: string) => {
  const found = entries.find((entry) => entry.id === id);
  if (!found) throw new Error(`No ${id} entry.`);
  return found;
};

describe('the editor context', () => {
  it('DOCE-EDITOR-4.4 carries the mode, suggesting, markup, layout and zoom', () => {
    const context = contextOf({ suggesting: true, markup: 'simple', layout: 'web', zoom: 125 });
    expect(context).toMatchObject({
      mode: 'suggest',
      suggesting: true,
      markup: 'simple',
      layout: 'web',
      zoom: 125,
    });
    expect(contextOf()).toMatchObject({ mode: 'edit', markup: 'all', layout: 'page', zoom: 100 });
    expect(editingModeOf({ editable: false, commenting: true })).toBe('comment');
    expect(editingModeOf({ editable: false })).toBe('read');
    // A read document suggests nothing, whatever the host asked.
    expect(contextOf({ editable: false, suggesting: true }).suggesting).toBe(false);
  });
});

describe('the mode and markup controls', () => {
  it('DOCE-EDITOR-4.12 offers every mode, the current one selected, the unavailable ones with why', () => {
    const onModeChange = vi.fn();
    const entries = modeEntries(contextOf({ suggesting: true }), {
      onModeChange,
      modeReasons: { edit: 'Only suggestions here', suggest: 'Ignored for the current mode' },
    }) as Entry[];
    expect(entries.map((entry) => entry.label)).toEqual([
      'Editing',
      'Suggesting',
      'Commenting',
      'Reading',
    ]);
    expect(byId(entries, 'mode-suggest')).toMatchObject({ isSelected: true, isDisabled: false });
    expect(byId(entries, 'mode-edit')).toMatchObject({
      isDisabled: true,
      description: 'Only suggestions here',
    });
    byId(entries, 'mode-read').onAction?.();
    expect(onModeChange).toHaveBeenCalledWith('read');
  });

  it('DOCE-EDITOR-4.12 offers no markup, change bars and inline markup', () => {
    const onMarkupChange = vi.fn();
    const entries = markupEntries(contextOf({ markup: 'simple' }), { onMarkupChange }) as Entry[];
    expect(entries.map((entry) => [entry.label, entry.isSelected])).toEqual([
      ['No markup', false],
      ['Change bars', true],
      ['Inline', false],
    ]);
    byId(entries, 'markup-all').onAction?.();
    expect(onMarkupChange).toHaveBeenCalledWith('all');
  });

  it('DOCE-EDITOR-4.12 names each trigger by what it controls, then the value it shows', () => {
    const context = contextOf({ suggesting: true, markup: 'simple' });
    const items = shellItems({ onModeChange: vi.fn(), onMarkupChange: vi.fn() });
    render(
      <>
        {items.map((item) => (
          <Fragment key={item.id}>{item.kind === 'custom' ? item.render(context) : null}</Fragment>
        ))}
      </>,
    );
    expect(screen.getByRole('button', { name: 'Editing mode Suggesting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Markup Change bars' })).toBeInTheDocument();
  });
});

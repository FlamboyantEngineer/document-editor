import { EditorState } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { createEditorContext } from './editor-context.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { menubarMenus } from './menubar-menus.js';

function zoomEntries(value: number, levels: readonly number[]) {
  const onChange = vi.fn<(zoom: number) => void>();
  const context = createEditorContext(null, EditorState.create({ schema: documentSchema }), {
    editable: true,
    labels: DEFAULT_EDITOR_LABELS,
  });
  const menus = menubarMenus(context, {
    view: null,
    groups: [],
    openFind: null,
    layout: 'page',
    zoom: { value, onChange, levels },
  });
  const entries = menus.find((menu) => menu.id === 'view')?.entries ?? [];
  const entry = (id: string) => {
    const found = entries.find((candidate) => candidate.id === id);
    if (!found || !('onAction' in found)) throw new Error(`No ${id} entry.`);
    return found;
  };
  return { onChange, zoomIn: entry('zoom-in'), zoomOut: entry('zoom-out') };
}

describe('menubarMenus', () => {
  it('DOCE-EDITOR-6.4 zooms in and out to the next of the zoom levels', () => {
    const { onChange, zoomIn, zoomOut } = zoomEntries(100, [50, 100, 150]);
    zoomIn.onAction?.();
    zoomOut.onAction?.();
    expect(onChange.mock.calls).toEqual([[150], [50]]);
  });

  it('DOCE-EDITOR-6.4 disables zooming past the first and last level', () => {
    const { zoomIn, zoomOut } = zoomEntries(150, [50, 100, 150]);
    expect(zoomIn.isDisabled).toBe(true);
    expect(zoomOut.isDisabled).toBe(false);
  });
});

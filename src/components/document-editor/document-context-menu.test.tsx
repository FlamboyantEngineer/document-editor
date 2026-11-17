import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { scriptState } from '../../../test/script-blocks.js';
import { createDocumentEditing, type EditAddress, listScriptBlocks } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import type { ContextMenuProvider } from './context-providers.js';
import { EditorModal, type HostDialogProps } from './dialog-parts.js';
import { DocumentEditor, type DocumentEditorProps } from './document-editor.js';
import type { EditorContext } from './editor-context.js';
import type { DocumentEditorHandle } from './editor-handle.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

function Details({ view, onClose }: HostDialogProps) {
  return (
    <EditorModal view={view} onClose={onClose} title="Details">
      The details of the selection.
    </EditorModal>
  );
}

const DIALOGS = { details: Details };

function Harness({ initial, ...props }: Partial<DocumentEditorProps> & { initial?: EditorState }) {
  const [state, setState] = useState<EditorState>(
    () => initial ?? scriptState([{ id: 'a0000001', source: 'count()' }]),
  );
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      dialogs={DIALOGS}
      aria-label="Report"
      {...props}
    />
  );
}

// A host's provider that offers to open the host's dialog, and tells what context it was given.
function detailsProvider(seen: (context: EditorContext) => void): ContextMenuProvider {
  return {
    id: 'host',
    entries: (_target, context) => {
      seen(context);
      return [
        {
          id: 'details',
          label: 'Details…',
          onAction: () => context.openDialog({ kind: 'host', name: 'details' }),
        },
      ];
    },
  };
}

// Opens the context menu at the caret, with the keyboard.
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('textbox', { name: 'Report' }));
  await user.keyboard('{Shift>}{F10}{/Shift}');
  return screen.findByRole('menu');
}

installEditorDom();

describe('DocumentContextMenu', () => {
  it('DOCE-EDITOR-3.6 DOCE-EDITOR-4.4 hands a provider the editor as it is: its mode, markup, layout and zoom', async () => {
    const user = userEvent.setup();
    const seen = vi.fn<(context: EditorContext) => void>();
    render(
      <Harness
        suggesting
        markup="simple"
        zoom={150}
        contextMenu={{ providers: [detailsProvider(seen)] }}
      />,
    );
    await openMenu(user);
    expect(seen.mock.lastCall?.[0]).toMatchObject({
      editable: true,
      mode: 'suggest',
      suggesting: true,
      markup: 'simple',
      layout: 'web',
      zoom: 150,
    });
  });

  it("DOCE-EDITOR-3.6 DOCE-EDITOR-4.16 opens the host's dialog from a provider's entry", async () => {
    const user = userEvent.setup();
    render(<Harness contextMenu={{ providers: [detailsProvider(vi.fn())] }} />);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Details…' }));
    expect(await screen.findByRole('dialog', { name: 'Details' })).toBeInTheDocument();
  });

  it("DOCE-EDITOR-3.2 shows the keys of the host's shortcut table", async () => {
    const user = userEvent.setup();
    const plugins = createDocumentEditing(documentSchema, {
      shortcuts: { 'clear-formatting': 'Mod-Shift-y' },
    });
    const doc = scriptState([]).doc;
    render(<Harness initial={EditorState.create({ doc, plugins })} />);
    const menu = await openMenu(user);
    const clear = within(menu).getByRole('menuitem', { name: /Clear formatting/ });
    expect(clear).toHaveTextContent(/Shift\+Y/);
    expect(clear).not.toHaveTextContent('\\');
  });

  it('DOCE-EDITOR-4.8 offers no run of a script block while the writer suggests', async () => {
    const user = userEvent.setup();
    const handleRef = createRef<DocumentEditorHandle>();
    render(<Harness suggesting scriptRunner={{ run: vi.fn() }} handleRef={handleRef} />);
    await user.click(screen.getByRole('textbox', { name: 'Report' }));
    act(() => {
      handleRef.current?.run((state, dispatch) => {
        const at = listScriptBlocks(state.doc)[0]?.pos ?? 0;
        dispatch?.(state.tr.setSelection(NodeSelection.create(state.doc, at)));
        return true;
      });
    });
    await user.keyboard('{Shift>}{F10}{/Shift}');
    const run = within(await screen.findByRole('menu')).getByRole('menuitem', {
      name: /Run script/,
    });
    expect(run).toHaveAttribute('aria-disabled', 'true');
    expect(run).toHaveTextContent('Not available while suggesting');
  });

  it('DOCE-EDITOR-3.4 ends a script block’s menu with adding a paragraph before or after it', async () => {
    const user = userEvent.setup();
    const handleRef = createRef<DocumentEditorHandle>();
    const arrange = vi.fn((groups: readonly { id: string }[], target: { kind: string }) => {
      expect(target.kind).toBe('script');
      return groups;
    });
    render(<Harness handleRef={handleRef} contextMenu={{ arrange: arrange as never }} />);
    await user.click(screen.getByRole('textbox', { name: 'Report' }));
    act(() => {
      handleRef.current?.run((state, dispatch) => {
        const at = listScriptBlocks(state.doc)[0]?.pos ?? 0;
        dispatch?.(state.tr.setSelection(NodeSelection.create(state.doc, at)));
        return true;
      });
    });
    await user.keyboard('{Shift>}{F10}{/Shift}');
    const menu = await screen.findByRole('menu');
    const names = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(names.slice(-3)).toEqual(['Delete', 'Add paragraph before', 'Add paragraph after']);
    expect(arrange.mock.lastCall?.[0].map((group) => group.id).slice(-2)).toEqual([
      'object',
      'paragraphs',
    ]);
    await user.click(within(menu).getByRole('menuitem', { name: 'Add paragraph after' }));
    expect(
      listScriptBlocks(handleRef.current?.view()?.state.doc ?? scriptState([]).doc),
    ).toHaveLength(1);
  });
});

// A document of one paragraph with an element id.
function linkedState() {
  const { doc } = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              attrs: { id: 'b0000001' },
              content: [{ type: 'text', text: 'Linked' }],
            },
          ],
        },
      ],
    },
    documentSchema,
  );
  return EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
}

describe('copying a link to the content', () => {
  it('DOCE-EDITOR-3.9 offers Copy link with its key in the menu of a read document', async () => {
    const user = userEvent.setup();
    const onCopyLink = vi.fn<(address: EditAddress) => void>();
    render(<Harness initial={linkedState()} editable={false} onCopyLink={onCopyLink} />);
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('Linked') });
    const menu = await screen.findByRole('menu');
    const copy = within(menu).getByRole('menuitem', { name: /Copy link/ });
    expect(copy).toHaveTextContent(/Shift\+K/);
    await user.click(copy);
    expect(onCopyLink).toHaveBeenLastCalledWith({ elementId: 'b0000001' });
  });

  it('DOCE-EDITOR-3.9 copies the link with Mod-Shift-K', async () => {
    const user = userEvent.setup();
    const onCopyLink = vi.fn<(address: EditAddress) => void>();
    render(<Harness initial={linkedState()} onCopyLink={onCopyLink} />);
    await user.click(screen.getByText('Linked'));
    await user.keyboard('{Control>}{Shift>}K{/Shift}{/Control}');
    expect(onCopyLink).toHaveBeenLastCalledWith({ elementId: 'b0000001' });
  });

  it('DOCE-EDITOR-3.9 DOCE-EDITOR-3.3 shows the host’s words for its entries', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={linkedState()}
        onCopyLink={vi.fn()}
        labels={{ copyLink: 'Copy link to content', addComment: 'Add comment' }}
      />,
    );
    const menu = await openMenu(user);
    expect(within(menu).getByRole('menuitem', { name: /Copy link to content/ })).toBeVisible();
  });

  it('DOCE-EDITOR-3.9 offers no Copy link without the host’s callback', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const menu = await openMenu(user);
    expect(within(menu).queryByRole('menuitem', { name: /Copy link/ })).not.toBeInTheDocument();
  });
});

// A document of one table, the caret in its first body cell.
// A table, or one an embed holds, with the caret in a body cell.
function tableState(embedded = false) {
  const cell = (text: string) => ({
    type: 'tableCell',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  const table = {
    type: 'table',
    content: [
      { type: 'tableRow', content: [cell('Part'), cell('Count')] },
      { type: 'tableRow', content: [cell('Pump'), cell('2')] },
    ],
  };
  const attrs = { id: 'e0000001', kind: 'data-set', source: 'set-7', label: 'Set 7' };
  const { doc } = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [embedded ? { type: 'embed', attrs, content: [table] } : table],
        },
      ],
    },
    documentSchema,
  );
  const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
  let at = 0;
  doc.descendants((node, pos) => {
    if (node.isText && node.text === 'Pump') at = pos;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, at)));
}

describe('the table entries', () => {
  it('DOCE-EDITOR-3.5 offers the table entries at the top level, in order', async () => {
    const user = userEvent.setup();
    render(<Harness initial={tableState()} />);
    const menu = await openMenu(user);
    const names = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    const start = names.indexOf('Insert row');
    expect(names.slice(start)).toEqual([
      'Insert row',
      'Insert column',
      'Delete',
      'Merge cells',
      'Split cell',
      'Header',
      'Distribute rows',
      'Distribute columns',
      'Align',
      'Align cells',
      'Add paragraph before',
      'Add paragraph after',
    ]);
  });

  it('DOCE-EMBEDS-2.3 leaves out the entries changing rows and columns in a table an embed holds', async () => {
    const user = userEvent.setup();
    render(<Harness initial={tableState(true)} />);
    const menu = await openMenu(user);
    const names = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    const start = names.indexOf('Header');
    expect(start).toBeGreaterThan(-1);
    expect(names).not.toContain('Insert row');
    expect(names).not.toContain('Merge cells');
    expect(names).not.toContain('Split cell');
    expect(names.slice(start, start + 5)).toEqual([
      'Header',
      'Distribute rows',
      'Distribute columns',
      'Align',
      'Align cells',
    ]);
  });
});

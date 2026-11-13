import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { type EditorState, NodeSelection } from 'prosemirror-state';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { installEditorDom } from '../../../test/editor-dom.js';
import { scriptState } from '../../../test/script-blocks.js';
import { listScriptBlocks } from '../../engine/index.js';
import type { TemplateFile } from '../../model/index.js';
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

function Harness(props: Partial<DocumentEditorProps>) {
  const [state, setState] = useState<EditorState>(() =>
    scriptState([{ id: 'a0000001', source: 'count()' }]),
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
});

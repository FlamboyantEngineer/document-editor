import type { RichTextNodeViewProps } from '@flamboyantengineer/ui-components/rich-text-editor';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { createRef, type Ref, useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema, findNode } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import {
  addCommentAnchor,
  createDocumentEditing,
  ELEMENT_ID_PATTERN,
  ELEMENT_IDS_REPAIR,
  listCommentAnchors,
  listSuggestions,
  markRemote,
  repairElementIds,
  type ReviewChange,
} from '../../engine/index.js';
import type { VariablesAdapter } from '../../host/index.js';
import { readDocumentFile, type StoredNode, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';
import type { StatusBarItem } from './document-status-bar.js';
import { useDocumentEditor } from './editor-context.js';
import type { DocumentEditorHandle } from './editor-handle.js';
import type { DocumentLayout } from './use-document-layout.js';
import { contentChangeCause } from './use-host-events.js';

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'article',
  page: { size: 'A4', margins: { top: '24px', right: '24px', bottom: '24px', left: '24px' } },
};

const initial = () =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

// Where the document's first text starts.
function textStart(state: EditorState): number {
  let start = -1;
  state.doc.descendants((node, pos) => {
    if (node.isText && start < 0) start = pos;
    return start < 0;
  });
  return start;
}

function Harness({
  editable,
  layout,
  handleRef,
}: {
  editable: boolean;
  layout: DocumentLayout;
  handleRef?: Ref<DocumentEditorHandle>;
}) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout={layout}
      editable={editable}
      aria-label="Report"
      handleRef={handleRef}
    />
  );
}

installEditorDom();

// The position of a text in a document.
function findText(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value))
      found = pos + node.text.indexOf(value);
    return found < 0;
  });
  return found;
}

describe('DocumentEditor', () => {
  it('DOCE-EDITOR-1.1 shows the document with its layout, mode and template values', () => {
    const { container } = render(<Harness editable layout="web" />);
    const document = screen.getByRole('textbox', { name: 'Report' });
    expect(document).toHaveTextContent('Hello');
    const root = container.querySelector('.de-document-editor');
    expect(root).toHaveAttribute('data-layout', 'web');
    expect(root).toHaveAttribute('data-mode', 'authoring');
    expect(root?.getAttribute('style')).toContain('--doc-page-margin-left: 24px');
    expect(container.querySelector('.de-document-editor__measure')).toBeNull();
  });

  it('DOCE-EDITOR-1.2 switches between reading and authoring, keeping the document', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness editable layout="web" />);
    const document = screen.getByRole('textbox', { name: 'Report' });
    await user.click(document);
    await user.keyboard('More');
    expect(document).toHaveTextContent(/(?=.*Hello)(?=.*More)/);
    rerender(<Harness editable={false} layout="web" />);
    const read = screen.getByRole('textbox', { name: 'Report' });
    expect(read).toHaveAttribute('aria-readonly', 'true');
    expect(read).toHaveAttribute('contenteditable', 'false');
    expect(read).toHaveTextContent(/(?=.*Hello)(?=.*More)/);
  });

  it('DOCE-EDITOR-1.7 has the chrome follow each state the pages show', async () => {
    const user = userEvent.setup();
    function Shown() {
      const editor = useDocumentEditor();
      return <output aria-label="Shown text">{editor?.state.doc.textContent}</output>;
    }
    const STATUS_BAR = {
      arrange: (items: readonly StatusBarItem[]) => [
        ...items,
        { id: 'shown', side: 'start' as const, content: <Shown /> },
      ],
    };
    function Chromed() {
      const [state, setState] = useState(initial);
      return (
        <DocumentEditor
          state={state}
          onStateChange={setState}
          template={TEMPLATE}
          layout="web"
          statusBar={STATUS_BAR}
          aria-label="Report"
        />
      );
    }
    render(<Chromed />);
    expect(screen.getByRole('status', { name: 'Shown text' })).toHaveTextContent('Hello');
    await user.click(screen.getByRole('textbox', { name: 'Report' }));
    await user.keyboard('More');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Shown text' })).toHaveTextContent(
        /(?=.*Hello)(?=.*More)/,
      ),
    );
  });

  it('DOCE-EDITOR-1.3 measures the pages in a hidden slot in page layout', () => {
    const { container } = render(<Harness editable layout="page" />);
    const measure = container.querySelector('.de-document-editor__measure');
    expect(measure).toHaveAttribute('aria-hidden', 'true');
    expect(measure).toHaveAttribute('inert');
    expect(container.querySelector('.de-document-editor')).toHaveAttribute('data-layout', 'page');
  });

  it('DOCE-EDITOR-1.7 runs a toolbar button kept from an earlier state on the state shown', async () => {
    const seen: string[] = [];
    const toolbar = {
      items: [
        {
          kind: 'button' as const,
          id: 'host',
          label: 'Host',
          run: (context: { state: EditorState }) => seen.push(context.state.doc.textContent),
        },
      ],
    };
    function Shown() {
      const [state, setState] = useState(initial);
      return (
        <>
          <button
            type="button"
            onClick={() => setState(state.apply(state.tr.insertText('Oh, ', textStart(state))))}
          >
            Change
          </button>
          <DocumentEditor
            state={state}
            onStateChange={setState}
            template={TEMPLATE}
            layout="web"
            toolbar={toolbar}
            aria-label="Report"
          />
        </>
      );
    }
    const user = userEvent.setup();
    render(<Shown />);
    await user.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Report' })).toHaveTextContent('Oh, Hello'),
    );
    await user.click(await screen.findByRole('button', { name: 'Host' }));
    expect(seen).toEqual([expect.stringContaining('Oh, Hello')]);
  });

  it('DOCE-EDITOR-4.14 keeps a disabled toolbar menu focusable and says why it is disabled', async () => {
    const user = userEvent.setup();
    const toolbar = {
      items: [{ kind: 'menu' as const, id: 'more', label: 'More', entries: () => [] }],
    };
    render(
      <DocumentEditor
        state={initial()}
        onStateChange={() => undefined}
        template={TEMPLATE}
        layout="web"
        editable={false}
        toolbar={toolbar}
        aria-label="Report"
      />,
    );
    const trigger = await screen.findByRole('button', { name: 'More' });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await user.hover(trigger);
    expect(await screen.findByText('More: The document is open for reading')).toBeInTheDocument();
  });

  it('DOCE-EDITOR-1.7 sets the text style chosen on the state shown', async () => {
    const held: { current: EditorState | null } = { current: null };
    function Shown() {
      const [state, setState] = useState(initial);
      useEffect(() => {
        held.current = state;
      });
      return (
        <>
          <button
            type="button"
            onClick={() => setState(state.apply(state.tr.insertText('Oh, ', textStart(state))))}
          >
            Change
          </button>
          <DocumentEditor
            state={state}
            onStateChange={setState}
            template={TEMPLATE}
            layout="web"
            toolbar
            aria-label="Report"
          />
        </>
      );
    }
    const user = userEvent.setup();
    render(<Shown />);
    await user.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Report' })).toHaveTextContent('Oh, Hello'),
    );
    await user.click(screen.getByRole('button', { name: /Text style/ }));
    await user.click(await screen.findByRole('option', { name: /Heading 1/ }));
    const headings = () => {
      const found: string[] = [];
      held.current?.doc.descendants((node) => {
        if (node.type.name === 'heading') found.push(node.textContent);
      });
      return found;
    };
    await waitFor(() => expect(headings()).toEqual(['Oh, Hello']));
  });

  it('DOCE-EDITOR-1.8 draws the pages in a plain view, the host views in the editor', async () => {
    function HostParagraph({ nodeProps, children, ...props }: RichTextNodeViewProps) {
      void nodeProps;
      const editor = useDocumentEditor();
      return (
        <p {...props} data-host-view="" data-in-editor={editor ? 'true' : 'false'}>
          {children}
        </p>
      );
    }
    const views = { paragraph: HostParagraph };
    function Shown() {
      const [state, setState] = useState(initial);
      return (
        <>
          <button
            type="button"
            onClick={() => setState(state.apply(state.tr.insertText('Oh, ', textStart(state))))}
          >
            Change
          </button>
          <DocumentEditor
            state={state}
            onStateChange={setState}
            template={TEMPLATE}
            nodeViews={views}
            aria-label="Report"
          />
        </>
      );
    }
    const user = userEvent.setup();
    render(<Shown />);
    const drawn = () =>
      screen
        .getByRole('textbox', { name: 'Report' })
        .querySelector('.de-host-view [data-host-view]');
    await waitFor(() => expect(drawn()).toHaveTextContent('Hello'));
    const pages = screen.getByRole('textbox', { name: 'Report' });
    expect(pages).toHaveClass('ProseMirror', 'de-document-editor__content');
    expect(pages).toHaveAttribute('aria-multiline', 'true');
    expect(drawn()).toHaveAttribute('data-in-editor', 'true');
    await user.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(drawn()).toHaveTextContent('Oh, Hello'));
  });

  it('DOCE-EDITOR-1.8 leaves text typed in a host view’s own field to the field', async () => {
    function CaptionedParagraph({ nodeProps, children, ...props }: RichTextNodeViewProps) {
      void nodeProps;
      return (
        <div {...props}>
          <input aria-label="Note" />
          <p>{children}</p>
        </div>
      );
    }
    const views = { paragraph: CaptionedParagraph };
    const handle = createRef<DocumentEditorHandle>();
    render(
      <DocumentEditor
        state={initial()}
        onStateChange={() => undefined}
        template={TEMPLATE}
        nodeViews={views}
        aria-label="Report"
        handleRef={handle}
      />,
    );
    await handle.current?.whenSettled();
    // The field on the pages, not the one the measuring view draws.
    // The field on the pages, once the plain view draws them with the host views in it.
    const pages = () => screen.getByRole('textbox', { name: 'Report' });
    await waitFor(() => expect(pages().querySelector('.de-host-view input')).not.toBeNull());
    const field = within(pages()).getByRole('textbox', { name: 'Note' });
    const typed = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: 'x',
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(typed);
    const erased = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(erased);
    expect([typed.defaultPrevented, erased.defaultPrevented]).toEqual([false, false]);
    expect(handle.current?.view()?.state.doc.textContent).toBe('Hello');
  });

  it('DOCE-PAGINATION-7.19 gives the host the element ids the pages gave a new block', async () => {
    const handle = createRef<DocumentEditorHandle>();
    const held: { current: EditorState | null } = { current: null };
    function Shown() {
      const [state, setState] = useState(initial);
      useEffect(() => {
        held.current = state;
      });
      return (
        <DocumentEditor
          state={state}
          onStateChange={setState}
          template={TEMPLATE}
          aria-label="Report"
          handleRef={handle}
        />
      );
    }
    render(<Shown />);
    await handle.current?.whenSettled();
    const idsOf = (state: EditorState | null) => {
      const ids: unknown[] = [];
      state?.doc.descendants((node) => {
        if (node.type.name === 'paragraph') ids.push(node.attrs.dataId);
      });
      return ids;
    };
    let given: unknown[] = [];
    handle.current?.run((state, dispatch, view) => {
      const end = textStart(state) + 'Hello'.length + 1;
      dispatch?.(state.tr.insert(end, documentSchema.node('paragraph')));
      given = idsOf(view?.state ?? null);
      return true;
    });
    expect(given).toHaveLength(2);
    await waitFor(() => expect(idsOf(held.current)).toEqual(given));
  });

  it('DOCE-EDITOR-1.8 DOCE-PAGINATION-7.19 keeps each key typed as a suggestion before the host renders', async () => {
    const handle = createRef<DocumentEditorHandle>();
    const held: { current: EditorState | null } = { current: null };
    function Shown() {
      const [state, setState] = useState(initial);
      useEffect(() => {
        held.current = state;
      });
      return (
        <DocumentEditor
          state={state}
          onStateChange={setState}
          template={TEMPLATE}
          suggesting
          author="writer"
          aria-label="Report"
          handleRef={handle}
        />
      );
    }
    render(<Shown />);
    await handle.current?.whenSettled();
    const pages = screen.getByRole('textbox', { name: 'Report' });
    const view = handle.current?.view();
    const end = (view ? textStart(view.state) : 0) + 'Hello'.length;
    handle.current?.run((state, dispatch) => {
      dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, end)));
      return true;
    });
    // Each key comes before the host renders the one before it, as on a busy page.
    for (const data of ' at') {
      pages.dispatchEvent(
        new InputEvent('beforeinput', { inputType: 'insertText', data, cancelable: true }),
      );
      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });
    }
    await waitFor(() => expect(held.current?.doc.textContent).toContain('Hello at'));
    const suggested = held.current ? listSuggestions(held.current.doc) : [];
    expect(suggested.map(({ inserted, author }) => ({ inserted, author }))).toEqual([
      { inserted: ' at', author: 'writer' },
    ]);
  });

  it('DOCE-EDITOR-6.12 publishes the layout state and settles its pages', async () => {
    const handle = createRef<DocumentEditorHandle>();
    const { container } = render(<Harness editable layout="page" handleRef={handle} />);
    const root = container.querySelector('.de-document-editor');
    expect(root).toHaveAttribute('data-layout-state', 'pending');
    await expect(handle.current?.whenSettled()).resolves.toBe('settled');
    await waitFor(() => expect(root).toHaveAttribute('data-layout-state', 'settled'));
    // The pages' regions made read-only as the editor mounts lay them out again, measuring nothing
    // new.
    expect(handle.current?.layoutStats()).toMatchObject({ layouts: 2, blocksMeasured: 1 });
  });

  it('DOCE-EDITOR-6.12 is settled at once in the web layout', async () => {
    const handle = createRef<DocumentEditorHandle>();
    const { container } = render(<Harness editable layout="web" handleRef={handle} />);
    expect(container.querySelector('.de-document-editor')).toHaveAttribute(
      'data-layout-state',
      'settled',
    );
    await expect(handle.current?.whenSettled()).resolves.toBe('settled');
    expect(handle.current?.layoutStats()).toBeNull();
  });

  it('DOCE-EDITOR-6.1 tells the host of review-only changes, never made suggestions', async () => {
    const handle = createRef<DocumentEditorHandle>();
    const reviews: ReviewChange[] = [];
    function Reviewing() {
      const [state, setState] = useState(initial);
      return (
        <DocumentEditor
          state={state}
          onStateChange={setState}
          onReviewChange={(change) => reviews.push(change)}
          template={TEMPLATE}
          layout="web"
          suggesting
          author="writer"
          aria-label="Report"
          handleRef={handle}
        />
      );
    }
    render(<Reviewing />);
    const selectHello: Command = (state, dispatch) => {
      const from = findText(state.doc, 'Hello');
      dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, from, from + 5)));
      return true;
    };
    expect(handle.current?.run(selectHello)).toBe(true);
    expect(handle.current?.run(addCommentAnchor('t1'))).toBe(true);
    await waitFor(() => expect(reviews).toEqual([{ threads: ['t1'], suggestions: [] }]));
    const view = handle.current?.view();
    expect(view && listCommentAnchors(view.state.doc).map((anchor) => anchor.thread)).toEqual([
      't1',
    ]);
    expect(view && listSuggestions(view.state.doc)).toEqual([]);
  });

  it('DOCE-EDITOR-1.5 keeps the state it last showed while inactive', () => {
    const typed = (state: EditorState, text: string) => state.apply(state.tr.insertText(text, 1));
    const first = initial();
    const shown = (state: EditorState, active: boolean) => (
      <DocumentEditor
        state={state}
        onStateChange={() => undefined}
        template={TEMPLATE}
        layout="web"
        active={active}
        aria-label="Report"
      />
    );
    const { rerender } = render(shown(first, false));
    const document = screen.getByRole('textbox', { name: 'Report' });
    expect(document).toHaveTextContent('Hello');
    rerender(shown(typed(first, 'Say '), false));
    expect(document).toHaveTextContent(/^Hello$/);
    rerender(shown(typed(first, 'Say '), true));
    expect(document).toHaveTextContent('Say Hello');
  });

  it('DOCE-EDITOR-6.1 tells the host whether a change was remote or a repair', () => {
    const state = initial();
    expect(contentChangeCause(state.tr.insertText('A', 1))).toEqual({
      remote: false,
      repair: false,
    });
    expect(contentChangeCause(markRemote(state.tr.insertText('A', 1)))).toEqual({
      remote: true,
      repair: false,
    });
    const repair = repairElementIds(state);
    expect(repair && contentChangeCause(repair)).toEqual({ remote: false, repair: true });
  });

  it('DOCE-EDITING-1.4 repairs ids only while editable, by the repair author', async () => {
    const changes: Transaction[] = [];
    function Repairing({ editable }: { editable: boolean }) {
      const [state, setState] = useState(initial);
      return (
        <DocumentEditor
          state={state}
          onStateChange={setState}
          onContentChange={(tr) => changes.push(tr)}
          template={TEMPLATE}
          layout="web"
          editable={editable}
          repairIds={{ author: 'system' }}
          aria-label="Report"
        />
      );
    }
    const { rerender } = render(<Repairing editable={false} />);
    expect(screen.getByRole('textbox', { name: 'Report' })).toHaveTextContent('Hello');
    expect(changes).toHaveLength(0);
    rerender(<Repairing editable />);
    await waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0]?.getMeta(ELEMENT_IDS_REPAIR)).toBe(true);
    const repaired = findNode(changes[0]?.doc ?? documentSchema.topNodeType.create(), 'paragraph');
    expect(String(repaired?.attrs.dataId)).toMatch(ELEMENT_ID_PATTERN);
    expect(repaired?.attrs.dataAuthor).toBe('system');
  });

  it('DOCE-HOST-1.12 DOCE-PAGINATION-8.4 shows the host variables and page numbers', async () => {
    const variable = (key: string): StoredNode => ({ type: 'variable', attrs: { key } });
    const line = (...content: StoredNode[]) => ({ content: [{ type: 'paragraph', content }] });
    const template: TemplateFile = {
      ...TEMPLATE,
      header: line(variable('document.name')),
      footer: line(
        { type: 'text', text: 'Page ' },
        variable('page.current'),
        { type: 'text', text: ' of ' },
        variable('page.total'),
      ),
    };
    let name = 'Interface notes';
    const listeners = new Set<() => void>();
    const variables: VariablesAdapter = {
      value: (key) => (key === 'document.name' ? name : null),
      subscribe: (onChange) => {
        listeners.add(onChange);
        return () => listeners.delete(onChange);
      },
    };
    function Shown() {
      const [state, setState] = useState(initial);
      return (
        <DocumentEditor
          state={state}
          onStateChange={setState}
          template={template}
          variables={variables}
          aria-label="Report"
        />
      );
    }
    const { container, unmount } = render(<Shown />);
    const header = () => container.querySelector('.de-document-editor__content .pm-page-header');
    const footer = () => container.querySelector('.de-document-editor__content .pm-page-footer');
    await waitFor(() => expect(header()).toHaveTextContent('Interface notes'));
    expect(footer()).toHaveTextContent('Page 1 of 1');
    name = 'Timing notes';
    for (const listener of listeners) listener();
    await waitFor(() => expect(header()).toHaveTextContent('Timing notes'));
    unmount();
    expect(listeners.size).toBe(0);
  });

  it('DOCE-FOOTNOTES-2.1 numbers footnotes in each section in the web layout', async () => {
    const note = (id: string): StoredNode => ({
      type: 'footnote',
      attrs: { id },
      content: [{ type: 'text', text: id }],
    });
    const section = (...ids: string[]) => ({
      name: null,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text' }, ...ids.map(note)] }],
    });
    const file = { formatVersion: 1 as const, sections: [section('a', 'b'), section('c')] };
    const template: TemplateFile = { ...TEMPLATE, footnotes: { numbering: 'page' } };
    function Web() {
      const [state, setState] = useState(() =>
        EditorState.create({
          doc: readDocumentFile(file, documentSchema).doc,
          plugins: createDocumentEditing(documentSchema, { template: () => template }),
        }),
      );
      return (
        <DocumentEditor
          state={state}
          onStateChange={setState}
          template={template}
          layout="web"
          aria-label="Report"
        />
      );
    }
    const { container } = render(<Web />);
    const markers = () =>
      [...container.querySelectorAll('[data-footnote-number]')]
        .filter((element) => element.closest('.pm-page-content'))
        .map((element) => element.getAttribute('data-footnote-number'));
    await waitFor(() => expect(markers()).toEqual(['1', '2', '1']));
  });
});

describe('DocumentEditor host layout rules', () => {
  it('DOCE-PAGINATION-5.11 lays its pages out with the host layout rules over the library rules', async () => {
    const handle = createRef<DocumentEditorHandle>();
    const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const state = EditorState.create({
      doc: readDocumentFile(
        { formatVersion: 1, sections: [{ content: [paragraph('One'), paragraph('Two')] }] },
        documentSchema,
      ).doc,
      plugins: createDocumentEditing(documentSchema),
    });
    function Ruled() {
      const [current, setCurrent] = useState(state);
      return (
        <DocumentEditor
          state={current}
          onStateChange={setCurrent}
          template={TEMPLATE}
          layout="page"
          aria-label="Report"
          handleRef={handle}
          layoutRules={{ paragraph: { endsPage: true } }}
        />
      );
    }
    const { container } = render(<Ruled />);
    await expect(handle.current?.whenSettled()).resolves.toBe('settled');
    await waitFor(() =>
      expect(container.querySelectorAll('.de-document-editor__content .pm-page')).toHaveLength(2),
    );
  });
});

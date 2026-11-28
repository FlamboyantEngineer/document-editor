import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { Activity, createRef, StrictMode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { TEST_FONTS } from '../../../test/served-fonts.js';
import { createDocumentEditing } from '../../engine/index.js';
import type { DocumentExport, ExportRequest, FeedbackTone, HostResult } from '../../host/index.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type TemplateFile,
  type TemplatePin,
} from '../../model/index.js';
import { DocumentEditor, type DocumentEditorProps } from './document-editor.js';
import type { DocumentEditorHandle } from './editor-handle.js';

installEditorDom();

const initial = (layout: 'page' | 'web') =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Quarterly notes' }] },
              ...(layout === 'page'
                ? [
                    { type: 'pageBreak' },
                    { type: 'paragraph', content: [{ type: 'text', text: 'Distant notes' }] },
                  ]
                : []),
            ],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

// An export whose runs wait until the test ends them, recording what each was given.
function pendingExport(id: string, label: string) {
  const requests: ExportRequest[] = [];
  const endings: ((result: HostResult<void>) => void)[] = [];
  const entry: DocumentExport = {
    id,
    label,
    run: (request) => {
      requests.push(request);
      return new Promise((resolve) => endings.push(resolve));
    },
  };
  return { entry, requests, end: (result: HostResult<void>) => endings.shift()?.(result) };
}

function Harness({
  entries,
  template = BASE_TEMPLATE,
  templatePin,
  layout = 'web',
  handleRef,
}: {
  entries: readonly DocumentExport[];
  template?: TemplateFile;
  templatePin?: TemplatePin;
  layout?: 'page' | 'web';
  handleRef?: DocumentEditorProps['handleRef'];
}) {
  const [state, setState] = useState(() => initial(layout));
  const [told, setTold] = useState<string[]>([]);
  return (
    <>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={template}
        layout={layout}
        fonts={layout === 'page' ? TEST_FONTS : undefined}
        handleRef={handleRef}
        menubar
        exports={{ entries }}
        templatePin={templatePin}
        feedback={{
          notify: ({ tone, text }: { tone: FeedbackTone; text: string }) =>
            setTold((current) => [...current, `${tone}: ${text}`]),
        }}
        aria-label="Report"
      />
      <ul aria-label="Told">
        {told.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </>
  );
}

const told = () =>
  Array.from(
    screen.getByRole('list', { name: 'Told' }).querySelectorAll('li'),
    (item) => item.textContent,
  );

async function openExport(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('menuitem', { name: 'File' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Export' }));
  return screen.findByRole('menuitem', { name: label });
}

// Reports that all observed pages are outside the viewport, leaving only the caret page forced.
function stubDistantPages() {
  const report: (() => void)[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(notify: (entries: []) => void) {
        report.push(() => notify([]));
      }
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
  return () => report.forEach((notify) => notify());
}

describe('File > Export', () => {
  it('DOCE-EDITOR-6.28 DOCE-HOST-1.22 offers the host exports and runs one on the document and its snapshot', async () => {
    const user = userEvent.setup();
    const pdf = pendingExport('pdf', 'PDF');
    render(<Harness entries={[pdf.entry, pendingExport('word', 'Word').entry]} />);
    await user.click(await openExport(user, 'PDF'));
    await waitFor(() => expect(pdf.requests).toHaveLength(1));
    const [request] = pdf.requests;
    expect(JSON.stringify(request?.content)).toContain('Quarterly notes');
    expect(await request?.snapshot({ title: 'Notes' })).toContain('<title>Notes</title>');
    expect(told()).toEqual(['info: Exporting PDF…']);
    pdf.end({ ok: true, value: undefined });
    await waitFor(() =>
      expect(told()).toEqual(['info: Exporting PDF…', 'success: PDF export is ready']),
    );
  });

  it('DOCE-EDITOR-6.28 DOCE-PAGINATION-11.6 DOCE-PAGINATION-13.8 captures the drawn pages and fonts', async () => {
    const reportDistantPages = stubDistantPages();
    const user = userEvent.setup();
    const pdf = pendingExport('pdf', 'PDF');
    const handle = createRef<DocumentEditorHandle>();
    const shown = (template: TemplateFile, layout: 'page' | 'web') => (
      <Harness entries={[pdf.entry]} template={template} layout={layout} handleRef={handle} />
    );
    const { rerender } = render(shown(BASE_TEMPLATE, 'page'));
    await expect(handle.current?.whenSettled()).resolves.toBe('settled');
    const view = handle.current?.view();
    if (!view) throw new Error('The test editor has no view');
    await user.click(await openExport(user, 'PDF'));
    const [request] = pdf.requests;
    if (!request) throw new Error('The export did not start');
    const changed = {
      ...BASE_TEMPLATE,
      styles: {
        ...BASE_TEMPLATE.styles,
        paragraph: { ...BASE_TEMPLATE.styles?.paragraph, font: 'sans-serif' },
      },
    };
    rerender(shown(changed, 'page'));
    await expect(handle.current?.whenSettled()).resolves.toBe('settled');
    expect(handle.current?.view()).toBe(view);
    act(reportDistantPages);
    const lastPage = () => [...view.dom.querySelectorAll('.pm-page')].at(-1);
    expect(lastPage()).toHaveTextContent('Distant notes');
    expect(lastPage()?.querySelector('.de-forced-lines')).toBeNull();

    const existingFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    const readUnrelatedFonts = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        status: 'loading',
        get ready() {
          return readUnrelatedFonts();
        },
      },
    });
    try {
      await act(async () => {
        const snapshot = new DOMParser().parseFromString(await request.snapshot(), 'text/html');
        const css = snapshot.head.textContent;
        expect(css?.includes('--doc-paragraph-font-family: "Test Sans";')).toBe(true);
        expect(css?.includes('@font-face { font-family: "Test Sans";')).toBe(true);
        expect(readUnrelatedFonts).not.toHaveBeenCalled();
        expect([...snapshot.querySelectorAll('.de-forced-lines')].at(-1)?.textContent).toBe(
          'Distant notes',
        );
        expect(lastPage()?.querySelector('.de-forced-lines')).toBeNull();
        view.dom.dispatchEvent(new CompositionEvent('compositionstart'));
        expect(view.composing).toBe(true);
        await expect(request.snapshot({ markup: 'final' })).rejects.toThrow(
          'The document layout is unavailable.',
        );
        view.dom.dispatchEvent(new CompositionEvent('compositionend'));
      });
    } finally {
      if (existingFonts) Object.defineProperty(document, 'fonts', existingFonts);
      else Reflect.deleteProperty(document, 'fonts');
    }
    rerender(shown(changed, 'web'));
    expect(handle.current?.view()).not.toBe(view);
    await expect(request.snapshot()).rejects.toThrow('The document layout is unavailable.');
    await act(() => pdf.end({ ok: true, value: undefined }));
  });

  it('DOCE-EDITOR-6.28 hands an export the document with the template it pins', async () => {
    const user = userEvent.setup();
    const pdf = pendingExport('pdf', 'PDF');
    const pin = { id: 'report', revision: 'r3' };
    render(<Harness entries={[pdf.entry]} templatePin={pin} />);
    await user.click(await openExport(user, 'PDF'));
    await waitFor(() => expect(pdf.requests).toHaveLength(1));
    expect(pdf.requests[0]?.content.template).toEqual(pin);
  });

  it('DOCE-EDITOR-6.28 runs an export once at a time and tells the reader when it fails', async () => {
    const user = userEvent.setup();
    const pdf = pendingExport('pdf', 'PDF');
    render(<Harness entries={[pdf.entry]} />);
    await user.click(await openExport(user, 'PDF'));
    await waitFor(() => expect(pdf.requests).toHaveLength(1));
    expect(await openExport(user, 'PDF')).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Escape}{Escape}{Escape}');
    pdf.end({ ok: false, error: { kind: 'unavailable', message: 'Printer offline' } });
    await waitFor(() =>
      expect(told()).toEqual(['info: Exporting PDF…', 'error: PDF export failed: Printer offline']),
    );
    await user.click(await openExport(user, 'PDF'));
    await waitFor(() => expect(pdf.requests).toHaveLength(2));
  });

  it('DOCE-EDITOR-6.28 offers no Export without the host exports, and aborts runs on unmount', async () => {
    const user = userEvent.setup();
    const pdf = pendingExport('pdf', 'PDF');
    const { unmount } = render(<Harness entries={[pdf.entry]} />);
    await user.click(await openExport(user, 'PDF'));
    await waitFor(() => expect(pdf.requests).toHaveLength(1));
    unmount();
    expect(pdf.requests[0]?.signal.aborted).toBe(true);
    // With nothing else in it, File is left out of the menubar.
    render(<Harness entries={[]} />);
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'File' })).not.toBeInTheDocument();
  });

  it('DOCE-EDITOR-6.28 runs, deduplicates and aborts exports under root StrictMode', async () => {
    const user = userEvent.setup();
    const pdf = pendingExport('pdf', 'PDF');
    const { unmount } = render(
      <StrictMode>
        <Harness entries={[pdf.entry]} />
      </StrictMode>,
    );
    await user.click(await openExport(user, 'PDF'));
    const first = pdf.requests[0];
    expect(first?.signal.aborted).toBe(false);
    const running = await openExport(user, 'PDF');
    expect(running).toHaveAttribute('aria-disabled', 'true');
    await user.click(running);
    expect(pdf.requests).toHaveLength(1);
    await user.keyboard('{Escape}{Escape}{Escape}');

    pdf.end({ ok: true, value: undefined });
    expect(await screen.findByText('success: PDF export is ready')).toBeVisible();
    await user.click(await openExport(user, 'PDF'));
    const second = pdf.requests[1];
    expect(second?.signal.aborted).toBe(false);
    expect(second?.signal).not.toBe(first?.signal);
    unmount();
    expect(second?.signal.aborted).toBe(true);
  });

  it('DOCE-EDITOR-6.28 allows a new export after a React Activity resumes', async () => {
    const user = userEvent.setup();
    const pdf = pendingExport('pdf', 'PDF');
    const shown = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <Harness entries={[pdf.entry]} />
      </Activity>
    );
    const { rerender } = render(shown('visible'));
    await user.click(await openExport(user, 'PDF'));
    expect(pdf.requests).toHaveLength(1);
    rerender(shown('hidden'));
    expect(pdf.requests[0]?.signal.aborted).toBe(true);
    rerender(shown('visible'));

    await user.click(await openExport(user, 'PDF'));
    expect(pdf.requests).toHaveLength(2);
    expect(pdf.requests[1]?.signal.aborted).toBe(false);
    const running = await openExport(user, 'PDF');
    expect(running).toHaveAttribute('aria-disabled', 'true');

    await act(async () => pdf.end({ ok: true, value: undefined }));
    expect(running).toHaveAttribute('aria-disabled', 'true');
    await act(async () => pdf.end({ ok: true, value: undefined }));
    await waitFor(() => expect(running).not.toHaveAttribute('aria-disabled', 'true'));
  });
});

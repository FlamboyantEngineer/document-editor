import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import type { DocumentExport, ExportRequest, FeedbackTone, HostResult } from '../../host/index.js';
import { BASE_TEMPLATE, readDocumentFile, type TemplatePin } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';

installEditorDom();

const initial = () =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quarterly notes' }] }],
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
  templatePin,
}: {
  entries: readonly DocumentExport[];
  templatePin?: TemplatePin;
}) {
  const [state, setState] = useState(initial);
  const [told, setTold] = useState<string[]>([]);
  return (
    <>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={BASE_TEMPLATE}
        layout="web"
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
});

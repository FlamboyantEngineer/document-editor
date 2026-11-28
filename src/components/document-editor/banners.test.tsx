import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { deferred } from '../../../test/deferred.js';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import type { FontsAdapter, HostResult } from '../../host/index.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../../model/index.js';
import { FONT_TIMEOUT } from '../../pagination/index.js';
import type { SessionStatus } from '../../session/status.js';
import { type DocumentBanner, EDITOR_BANNERS, useReportedFonts } from './banners.js';
import { DocumentEditor, type DocumentEditorProps } from './document-editor.js';
import type { EditorSession } from './save-status-item.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

const TEMPLATE: TemplateFile = {
  ...BASE_TEMPLATE,
  sections: [{ name: 'cover', editable: false, content: [paragraph('Cover text')] }],
};

const stateWith = (cover: string) =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          { name: 'cover', content: [paragraph(cover)] },
          { name: null, content: [paragraph('Body')] },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

function Harness({
  cover = 'Cover text',
  banners,
  editable,
  panels,
  suggesting,
  template = TEMPLATE,
}: {
  cover?: string;
  template?: TemplateFile;
  banners?: readonly DocumentBanner[];
  editable?: boolean;
  panels?: DocumentEditorProps['panels'];
  suggesting?: boolean;
}) {
  const [state, setState] = useState(() => stateWith(cover));
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={template}
      layout="web"
      editable={editable}
      suggesting={suggesting}
      banners={banners}
      panels={panels}
      aria-label="Report"
    />
  );
}

installEditorDom();

describe('DocumentBanners', () => {
  it('DOCE-EDITOR-7.1 shows the host banners in a named region and dismisses them', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <Harness
        banners={[
          { id: 'locked', tone: 'info', title: 'Locked for review' },
          { id: 'offline', description: 'Working offline', onDismiss },
        ]}
      />,
    );
    const region = screen.getByRole('region', { name: 'Document notices' });
    expect(
      [...region.querySelectorAll('[data-banner]')].map((banner) =>
        banner.getAttribute('data-banner'),
      ),
    ).toEqual(['locked', 'offline']);
    expect(within(region).getByText('Locked for review')).toBeInTheDocument();
    expect(region.closest('.de-document-editor__banners')).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('DOCE-EDITOR-7.5 puts the banners over the top of the document, between the panels', () => {
    render(
      <Harness
        banners={[{ id: 'locked', title: 'Locked for review' }]}
        panels={{
          start: <aside aria-label="Outline">Outline</aside>,
          end: <aside aria-label="Details">Details</aside>,
        }}
      />,
    );
    const region = screen
      .getByRole('region', { name: 'Document notices' })
      .closest('.de-document-editor__banners');
    const center = region?.parentElement;
    expect(center).toHaveClass('de-document-editor__center');
    expect(center?.previousElementSibling).toHaveAccessibleName('Outline');
    expect(center?.parentElement?.lastElementChild).toHaveAccessibleName('Details');
    expect(region?.nextElementSibling).toContainElement(
      screen.getByRole('textbox', { name: 'Report' }),
    );
  });

  it('DOCE-EDITOR-7.1 shows no region without banners', () => {
    render(<Harness />);
    expect(screen.queryByRole('region', { name: 'Document notices' })).not.toBeInTheDocument();
  });

  it('DOCE-EDITOR-7.2 offers to bring a document out of step back in line with its template', async () => {
    const user = userEvent.setup();
    render(<Harness cover="Edited cover" />);
    const region = await screen.findByRole('region', { name: 'Document notices' });
    expect(region.querySelector('[data-banner="template-drift"]')).toBeInTheDocument();
    expect(within(region).getByText(/cover \(changed\)/)).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Update from template' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Document notices' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Cover text')).toBeInTheDocument();
    expect(EDITOR_BANNERS).toContain('template-drift');
  });

  it('DOCE-EDITOR-7.2 names the sections by their label, and shows no drift while suggesting', async () => {
    const labelled: TemplateFile = {
      ...TEMPLATE,
      sections: [
        { name: 'cover', label: 'Cover page', editable: false, content: [paragraph('Cover text')] },
      ],
    };
    const { rerender } = render(<Harness cover="Edited cover" template={labelled} />);
    const region = await screen.findByRole('region', { name: 'Document notices' });
    expect(within(region).getByText(/Cover page \(changed\)/)).toBeInTheDocument();
    rerender(<Harness cover="Edited cover" template={labelled} suggesting />);
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Document notices' })).not.toBeInTheDocument(),
    );
  });

  it('DOCE-EDITOR-7.2 leaves a read document and one in step with its template alone', async () => {
    render(<Harness cover="Edited cover" editable={false} />);
    // The check waits for the document to rest.
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(screen.queryByRole('region', { name: 'Document notices' })).not.toBeInTheDocument();
  });

  it('DOCE-EDITOR-7.6 offers a newer template version, moving to it and bringing locked sections and references in line', async () => {
    const user = userEvent.setup();
    const status: SessionStatus = { load: 'ready', save: 'idle', error: null, dirty: false };
    const newer: TemplateFile = {
      ...TEMPLATE,
      sections: [{ name: 'cover', editable: false, content: [paragraph('New cover')] }],
      references: { formats: { 'internal-heading': 'section {{ref.numbering}} {{ref.title}}' } },
    };
    // A reference to a heading, as the older revision rendered it.
    const cited: StoredNode[] = [
      {
        type: 'heading',
        attrs: { id: 'a0000001', level: 1 },
        content: [{ type: 'text', text: 'Scope' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'See ' },
          {
            type: 'text',
            text: 'Scope',
            marks: [
              {
                type: 'reference',
                attrs: { referenceType: 'internal-heading', target: 'a0000001' },
              },
            ],
          },
        ],
      },
    ];
    const initial = () =>
      EditorState.create({
        doc: readDocumentFile(
          {
            formatVersion: 1,
            sections: [
              { name: 'cover', content: [paragraph('Cover text')] },
              { name: null, content: cited },
            ],
          },
          documentSchema,
        ).doc,
        plugins: createDocumentEditing(documentSchema),
      });
    const setTemplate = vi.fn(() => Promise.resolve(true));
    const document = { pin: { id: 'article' }, templateUpdate: { revision: 'r2', sequence: 2 } };
    const session: EditorSession = {
      status: { get: () => status, subscribe: () => () => undefined },
      save: () => Promise.resolve(),
      document: { get: () => document, subscribe: () => () => undefined },
      setTemplate,
    };
    function Moving({ template }: { template: TemplateFile }) {
      const [state, setState] = useState(initial);
      return (
        <DocumentEditor
          state={state}
          onStateChange={setState}
          template={template}
          layout="web"
          session={session}
          aria-label="Report"
        />
      );
    }
    const { rerender } = render(<Moving template={TEMPLATE} />);
    const region = await screen.findByRole('region', { name: 'Document notices' });
    expect(region.querySelector('[data-banner="template-update"]')).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Use the newer version' }));
    expect(setTemplate).toHaveBeenCalledWith({ id: 'article', revision: 'r2' });
    // The session moved the document: the editor is shown the newer template.
    rerender(<Moving template={newer} />);
    expect(await screen.findByText('New cover')).toBeInTheDocument();
    expect(await screen.findByText('section 1. Scope')).toBeInTheDocument();
  });

  it('DOCE-PAGINATION-5.6 waits the host timeout for the template fonts, five seconds by default', async () => {
    const asked: number[] = [];
    const fonts: FontsAdapter = {
      load: (families, { timeout }) => {
        asked.push(timeout);
        return Promise.resolve({ ok: true, value: [...families] });
      },
    };
    const { result } = renderHook(() => useReportedFonts(fonts, 8000));
    await act(() => result.current.fonts?.load(['Geist'], { timeout: FONT_TIMEOUT }));
    const { result: plain } = renderHook(() => useReportedFonts(fonts));
    await act(() => plain.current.fonts?.load(['Geist'], { timeout: FONT_TIMEOUT }));
    expect(asked).toEqual([8000, 5000]);
  });

  it('DOCE-EDITOR-7.3 reports the template fonts that did not load', async () => {
    const fonts: FontsAdapter = {
      load: (families) => Promise.resolve({ ok: true, value: families.slice(0, 1) }),
    };
    const { result } = renderHook(() => useReportedFonts(fonts));
    await act(() => result.current.fonts?.load(['Geist', 'Serif Pro'], { timeout: 10 }));
    expect(result.current.missing).toEqual(['Serif Pro']);
    const failing: FontsAdapter = {
      load: () =>
        Promise.resolve({ ok: false, error: { kind: 'unavailable', message: 'No fonts' } }),
    };
    const { result: failed } = renderHook(() => useReportedFonts(failing));
    await act(() => failed.current.fonts?.load(['Geist'], { timeout: 10 }));
    expect(failed.current.missing).toEqual(['Geist']);
  });

  it('DOCE-PAGINATION-12.7 keeps font reports from a replaced adapter out of the editor', async () => {
    const pending = deferred<HostResult<readonly string[]>>();
    const previous: FontsAdapter = { load: () => pending.promise };
    const next: FontsAdapter = {
      load: () => {
        throw new Error('Font service unavailable');
      },
    };
    const { result, rerender } = renderHook((fonts) => useReportedFonts(fonts), {
      initialProps: previous,
    });
    const oldLoad = result.current.fonts?.load(['Old font'], { timeout: 10 });
    rerender(next);
    await act(() => result.current.fonts?.load(['New font'], { timeout: 10 }));
    expect(result.current.missing).toEqual(['New font']);
    await act(async () => {
      pending.resolve({ ok: true, value: [] });
      await oldLoad;
    });
    expect(result.current.missing).toEqual(['New font']);
  });

  it('DOCE-EDITOR-7.4 holds the banners while the reader presses in the editor', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness banners={[{ id: 'first', title: 'First' }]} />);
    const document = screen.getByText('Body');
    await user.pointer({ keys: '[MouseLeft>]', target: document });
    rerender(
      <Harness
        banners={[
          { id: 'second', title: 'Second' },
          { id: 'first', title: 'First' },
        ]}
      />,
    );
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
    await user.pointer({ keys: '[/MouseLeft]', target: document });
    expect(await screen.findByText('Second')).toBeInTheDocument();
  });
});

import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import type { FontsAdapter } from '../../host/index.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../../model/index.js';
import { type DocumentBanner, EDITOR_BANNERS, useReportedFonts } from './banners.js';
import { DocumentEditor } from './document-editor.js';

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
}: {
  cover?: string;
  banners?: readonly DocumentBanner[];
  editable?: boolean;
}) {
  const [state, setState] = useState(() => stateWith(cover));
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      editable={editable}
      banners={banners}
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
    expect(region).toHaveClass('de-document-editor__banners');
    await user.click(within(region).getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
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

  it('DOCE-EDITOR-7.2 leaves a read document and one in step with its template alone', async () => {
    render(<Harness cover="Edited cover" editable={false} />);
    // The check waits for the document to rest.
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(screen.queryByRole('region', { name: 'Document notices' })).not.toBeInTheDocument();
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

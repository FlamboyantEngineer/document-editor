import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { LOADED, saveButton, SLOW, storeOf } from '../../../test/template-workspace.js';
import { createDocumentEditing } from '../../engine/index.js';
import type { AssetAdapter } from '../../host/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from '../document-editor/document-editor.js';
import {
  TEMPLATE_PREVIEW_STATUS_BAR,
  TEMPLATE_PREVIEW_TOOLBAR,
  TEMPLATE_PREVIEW_ZOOM_LEVELS,
} from './template-preview-editor.js';
import { TemplateWorkspace } from './template-workspace.js';
import type { TemplatePreview } from './template-workspace-types.js';

const REPORT: TemplateFile = {
  formatVersion: 1,
  id: 'report',
  name: 'Report',
  sections: [
    { name: 'cover', label: 'Cover page', content: [{ type: 'paragraph' }] },
    { name: 'body' },
  ],
};

const ASSETS: AssetAdapter = {
  upload: () => Promise.resolve({ ok: false, error: { kind: 'unavailable' } }),
  search: () =>
    Promise.resolve({
      ok: true,
      value: {
        items: [
          {
            id: 'logo',
            name: 'Logo',
            url: 'logo.png',
            mediaType: 'image/png',
            width: 64,
            height: 32,
          },
        ],
      },
    }),
  resolveUrl: (id) => `${id}.png`,
};

installEditorDom();

// The parts the sections of the preview's document hold, in order.
const partsShown = () =>
  [
    ...(screen
      .queryByRole('textbox', { name: 'Template preview document' })
      ?.querySelectorAll('[data-template-part]') ?? []),
  ].map((section) => section.getAttribute('data-template-part'));

describe('the workspace’s own preview', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-3.16 DOCE-ENTRY-2.5 previews the tab shown, a section alone on its tab',
    async () => {
      const user = userEvent.setup();
      render(<TemplateWorkspace store={storeOf(REPORT)} defaultTemplateId="report" />);
      const preview = await screen.findByRole('region', { name: 'Template preview' }, LOADED);
      // The preview loads on first use, then shows the sample and each section's two parts.
      await waitFor(
        () =>
          expect(partsShown()).toEqual([
            'sample',
            'content',
            'placeholder',
            'content',
            'placeholder',
          ]),
        LOADED,
      );
      expect(
        within(preview).getByRole('textbox', { name: 'Template preview document' }),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'Cover page' }));
      await waitFor(
        () => expect(partsShown()).toEqual(['content', 'placeholder', 'sample']),
        LOADED,
      );
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.6 writes a section part edited on the preview into the draft',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT);
      const seen: { preview: TemplatePreview | null } = { preview: null };
      render(
        <TemplateWorkspace
          store={store}
          defaultTemplateId="report"
          renderPreview={(preview) => {
            seen.preview = preview;
            return null;
          }}
        />,
      );
      await waitFor(() => expect(seen.preview).not.toBeNull(), LOADED);
      const content = [{ type: 'paragraph', content: [{ type: 'text', text: 'Prepared for' }] }];
      seen.preview?.onTemplatePartChange?.({ section: 'body', part: 'placeholder', content });
      await waitFor(() => expect(saveButton()).toBeEnabled(), LOADED);
      await user.click(saveButton());
      await waitFor(async () => {
        const loaded = await store.load('report');
        expect(loaded.ok && loaded.value.template.sections?.[1]).toEqual({
          name: 'body',
          placeholder: content,
        });
      }, LOADED);
    },
    SLOW,
  );
});

// A document editor over a paragraph, as a template's own content.
function Content({ onLayoutChange }: { onLayoutChange?: () => void }) {
  const [state, setState] = useState(() =>
    EditorState.create({
      doc: readDocumentFile(
        {
          formatVersion: 1,
          sections: [{ name: 'cover', content: [{ type: 'paragraph', content: [] }] }],
        },
        documentSchema,
      ).doc,
      plugins: createDocumentEditing(documentSchema),
    }),
  );
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={REPORT}
      layout="page"
      onLayoutChange={onLayoutChange}
      onZoomChange={() => undefined}
      zoomLevels={TEMPLATE_PREVIEW_ZOOM_LEVELS}
      onTemplatePartChange={() => undefined}
      assets={ASSETS}
      toolbar={TEMPLATE_PREVIEW_TOOLBAR}
      statusBar={TEMPLATE_PREVIEW_STATUS_BAR}
      aria-label="Cover"
    />
  );
}

describe('the preview’s toolbar and status bar', () => {
  it('DOCE-TEMPLATE-EDITOR-3.17 keeps what a template’s own content takes', () => {
    const { container } = render(<Content onLayoutChange={vi.fn()} />);
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    for (const name of ['Undo', 'Redo', 'Bold', 'Bulleted list', 'Insert table', 'Page break']) {
      expect(
        within(toolbar).getByRole('button', { name: new RegExp(`^${name}`) }),
      ).toBeInTheDocument();
    }
    expect(within(toolbar).getByRole('button', { name: /^Symbol/ })).toBeInTheDocument();
    expect(
      within(toolbar).getByRole('button', { name: /^Insert image asset/ }),
    ).toBeInTheDocument();
    for (const name of ['Footnote', 'Link', 'Insert math', 'Insert code', 'Reference']) {
      expect(
        within(toolbar).queryByRole('button', { name: new RegExp(`^${name}`) }),
      ).not.toBeInTheDocument();
    }
    const items = [...container.querySelectorAll('.de-document-editor__status-item')].map((item) =>
      item.getAttribute('data-status'),
    );
    expect(items).toEqual(['layout', 'zoom']);
    expect(TEMPLATE_PREVIEW_ZOOM_LEVELS).toEqual([50, 75, 100, 125, 150]);
  });

  it(
    'DOCE-TEMPLATE-EDITOR-3.17 places one of the host’s images from the image button',
    async () => {
      const user = userEvent.setup();
      render(<Content />);
      const editor = screen.getByRole('textbox', { name: 'Cover' });
      await user.click(editor);
      await user.click(screen.getByRole('button', { name: /^Insert image asset/ }));
      const picker = await screen.findByRole('group', { name: 'Insert image asset' }, LOADED);
      await user.click(await within(picker).findByRole('row', { name: 'Logo' }, LOADED));
      await user.click(within(picker).getByRole('button', { name: 'Insert' }));
      await waitFor(
        () => expect(editor.querySelector('img[data-template-file-id="logo"]')).not.toBeNull(),
        LOADED,
      );
    },
    SLOW,
  );
});

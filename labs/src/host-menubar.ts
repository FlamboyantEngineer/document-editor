// The full editor lab's File menu, as a host adds it to the editor's menubar: saving, which the
// lab reports, and exporting the document as Markdown or as a word processing document.

import type { DocumentMenubarOptions } from '../../src/components/index.js';
import { writeDocumentFile, writeDocx, writeMarkdown } from '../../src/model/index.js';

// Hands the reader a file the browser saves.
function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** The lab's menubar options: its File menu, saving through `onSave`. */
export function hostMenubar(onSave: () => void): DocumentMenubarOptions {
  return {
    items: [
      {
        menu: 'file',
        entries: (context) => [
          { id: 'save', label: 'Save', shortcut: 'Ctrl+S', onAction: onSave },
          { type: 'separator', id: 'file-export' },
          {
            id: 'export',
            label: 'Export',
            items: [
              {
                id: 'export-markdown',
                label: 'Markdown',
                onAction: () =>
                  download(
                    'document.md',
                    writeMarkdown(writeDocumentFile(context.state.doc)),
                    'text/markdown',
                  ),
              },
              {
                id: 'export-docx',
                label: 'Word document',
                onAction: () =>
                  download(
                    'document.docx',
                    new Uint8Array(writeDocx(writeDocumentFile(context.state.doc))),
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  ),
              },
            ],
          },
        ],
      },
    ],
  };
}

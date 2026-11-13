// The full editor lab's exports, as a host gives them to File > Export: the document as Markdown
// or as a word processing document, saved by the browser, and its print snapshot, which the lab
// counts the pages of once it is ready, as a host would hand it to its PDF printer.

import type { ExportsAdapter } from '../../src/host/index.js';
import { writeDocx, writeMarkdown } from '../../src/model/index.js';

// Hands the reader a file the browser saves.
function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const DONE = { ok: true, value: undefined } as const;

/** The lab's exports; the snapshot's page count goes to `onSnapshot`. */
export function labExports(onSnapshot: (pages: number) => void): ExportsAdapter {
  return {
    entries: [
      {
        id: 'markdown',
        label: 'Markdown',
        run: ({ content }) => {
          download('document.md', writeMarkdown(content), 'text/markdown');
          return Promise.resolve(DONE);
        },
      },
      {
        id: 'docx',
        label: 'Word document',
        run: ({ content }) => {
          const type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          download('document.docx', new Uint8Array(writeDocx(content)), type);
          return Promise.resolve(DONE);
        },
      },
      {
        id: 'print',
        label: 'Print snapshot',
        run: async ({ snapshot }) => {
          const html = await snapshot({ title: 'Sample document' });
          onSnapshot((html.match(/class="pm-page[ "]/g) ?? []).length);
          return DONE;
        },
      },
    ],
  };
}

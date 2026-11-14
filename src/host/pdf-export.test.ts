import { describe, expect, it } from 'vitest';
import type { DocumentFile } from '../model/format/document-format.js';
import type { HostResult } from './adapters.js';
import type { ExportRequest } from './export-adapters.js';
import { type ExportedFile, pdfExport } from './pdf-export.js';

const CONTENT = { formatVersion: 1, sections: [] } as unknown as DocumentFile;
const PDF = new Uint8Array([37, 80, 68, 70]);
const DONE: HostResult<void> = { ok: true, value: undefined };

// An export request whose snapshot names the options it was asked with.
function request(signal = new AbortController().signal): ExportRequest {
  return {
    content: CONTENT,
    snapshot: (options) => Promise.resolve(`<title>${options?.title ?? ''}</title>`),
    signal,
  };
}

describe('the PDF export', () => {
  it('DOCE-HOST-1.26 prints the snapshot through the host and saves the PDF it answers', async () => {
    const printed: string[] = [];
    const saved: ExportedFile[] = [];
    const entry = pdfExport({
      print: (html) => {
        printed.push(html);
        return Promise.resolve({ ok: true, value: PDF });
      },
      save: (file) => {
        saved.push(file);
        return Promise.resolve(DONE);
      },
      fileName: () => 'notes.pdf',
      snapshot: { title: 'Notes' },
    });
    expect([entry.id, entry.label]).toEqual(['pdf', 'PDF']);
    expect(await entry.run(request())).toEqual(DONE);
    expect(printed).toEqual(['<title>Notes</title>']);
    expect(saved).toEqual([{ name: 'notes.pdf', type: 'application/pdf', data: PDF }]);
  });

  it('DOCE-HOST-1.26 saves nothing when printing fails or the editor unmounts', async () => {
    const saved: ExportedFile[] = [];
    const save = (file: ExportedFile) => {
      saved.push(file);
      return Promise.resolve(DONE);
    };
    const failed = { ok: false, error: { kind: 'unavailable', message: 'No printer' } } as const;
    const failing = pdfExport({ print: () => Promise.resolve(failed), save });
    expect(await failing.run(request())).toEqual(failed);
    const controller = new AbortController();
    const unmounting = pdfExport({
      print: () => {
        controller.abort();
        return Promise.resolve({ ok: true, value: PDF });
      },
      save,
    });
    expect((await unmounting.run(request(controller.signal))).ok).toBe(false);
    expect(saved).toEqual([]);
  });
});

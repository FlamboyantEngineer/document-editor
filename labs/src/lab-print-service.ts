// The import and export lab's print service, mimicked in the page as a host's server would run it:
// File > Export's PDF entry (`pdfExport`) hands it the document's print snapshot, which it prints
// with `printSnapshot` in a "headless page" that is a frame of this page: the snapshot is loaded
// in the frame, its fonts and images are waited for there, and the "PDF" is a small PDF file with
// one blank page for each page the snapshot holds. The lab saves it by listing it, and can make
// the service fail.

import { type HeadlessPage, printSnapshot } from '../../src/document/index.js';
import { type DocumentExport, type ExportedFile, pdfExport } from '../../src/host/index.js';

/** How the mimicked service behaves and reports. */
export interface LabPrintService {
  /** The frame the service loads each snapshot in. */
  frame(): HTMLIFrameElement | null;
  /** Whether the service is down, so printing fails. */
  failing(): boolean;
  /** The file the entry saved, with the pages it holds and the images that failed to load. */
  saved(file: ExportedFile, pages: number, failedImages: readonly string[]): void;
}

// A PDF file of blank A4 pages, as text.
function blankPdf(pages: number): Uint8Array {
  const count = Math.max(1, pages);
  const kids = Array.from({ length: count }, (_, index) => `${String(index + 3)} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${String(count)} >>`,
    ...Array.from(
      { length: count },
      () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>',
    ),
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${String(index + 1)} 0 obj ${object} endobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer << /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

// The frame as a headless browser's page: the run handed to `evaluate` is put in the frame as a
// script, so it reads the frame's document, fonts and images.
function framePage(frame: HTMLIFrameElement): HeadlessPage {
  const view = () => frame.contentWindow as (Window & { labRun?: () => Promise<unknown> }) | null;
  return {
    setContent: (html) =>
      new Promise((resolve) => {
        frame.addEventListener('load', () => resolve(undefined), { once: true });
        frame.srcdoc = html;
      }),
    evaluate: <T>(run: () => Promise<T>) => {
      const owner = frame.contentDocument;
      const script = owner?.createElement('script');
      if (!owner || !script) return Promise.reject(new Error('The frame has no page'));
      script.textContent = `window.labRun = ${run.toString()};`;
      owner.body.append(script);
      return (view()?.labRun?.() ??
        Promise.reject(new Error('The run did not load'))) as Promise<T>;
    },
    pdf: () =>
      Promise.resolve(blankPdf(frame.contentDocument?.querySelectorAll('.pm-page').length ?? 0)),
  };
}

/** File > Export's PDF entry, printed by the mimicked service. */
export function labPdfExport(service: LabPrintService): DocumentExport {
  let printed = { pages: 0, failedImages: [] as readonly string[] };
  return pdfExport({
    fileName: () => 'interface-notes.pdf',
    snapshot: { title: 'Interface notes' },
    print: async (html) => {
      const frame = service.frame();
      if (!frame || service.failing()) return { ok: false, error: { kind: 'unavailable' } };
      const result = await printSnapshot(framePage(frame), html, { timeout: 10_000 });
      if (!result.ok) return { ok: false, error: { kind: 'unavailable' } };
      const pages = frame.contentDocument?.querySelectorAll('.pm-page').length ?? 0;
      printed = { pages, failedImages: result.failedImages };
      return { ok: true, value: result.pdf };
    },
    save: (file) => {
      service.saved(file, printed.pages, printed.failedImages);
      return Promise.resolve({ ok: true, value: undefined });
    },
  });
}

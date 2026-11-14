// A PDF file as one of File > Export's entries: the document's print snapshot, once its pages are
// ready, goes to the host's printer, such as a server that prints it in a headless browser
// (`printSnapshot` in `./document`), and the PDF it answers goes to the host's save, such as the
// browser's download. The editor tells the reader it started, and how it ended.

import type { DocumentFile } from '../model/format/document-format.js';
import type { HostResult } from './adapters.js';
import type { DocumentExport, ExportSnapshotOptions } from './export-adapters.js';

/** A file an export hands the host to save. */
export interface ExportedFile {
  readonly name: string;
  /** Its media type, such as `application/pdf`. */
  readonly type: string;
  readonly data: Uint8Array;
}

/** How the PDF entry prints and saves. */
export interface PdfExportOptions {
  /** Prints a print snapshot to a PDF, such as on a server. */
  print(html: string, signal: AbortSignal): Promise<HostResult<Uint8Array>>;
  /** Saves the PDF, such as by the browser's download. */
  save(file: ExportedFile, signal: AbortSignal): Promise<HostResult<void>>;
  /** The entry's id; `pdf` by default. */
  readonly id?: string | undefined;
  /** How the menu names it; `PDF` by default. */
  readonly label?: string | undefined;
  /** The file's name for a document; `document.pdf` by default. */
  readonly fileName?: ((content: DocumentFile) => string) | undefined;
  /** What the snapshot holds beside the pages: its title, stylesheets and suggestions. */
  readonly snapshot?: ExportSnapshotOptions | undefined;
}

/**
 * File > Export's PDF entry: prints the document's print snapshot through the host's printer and
 * saves the PDF it answers, failing, and saving nothing, when printing fails or the editor
 * unmounts first.
 */
export function pdfExport(options: PdfExportOptions): DocumentExport {
  return {
    id: options.id ?? 'pdf',
    label: options.label ?? 'PDF',
    run: async ({ content, snapshot, signal }) => {
      const html = await snapshot(options.snapshot);
      if (signal.aborted) return { ok: false, error: { kind: 'unavailable' } };
      const printed = await options.print(html, signal);
      if (!printed.ok) return printed;
      if (signal.aborted) return { ok: false, error: { kind: 'unavailable' } };
      const name = options.fileName?.(content) ?? 'document.pdf';
      return options.save({ name, type: 'application/pdf', data: printed.value }, signal);
    },
  };
}

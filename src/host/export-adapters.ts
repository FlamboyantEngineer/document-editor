// The host's exports: the entries File > Export offers, each turning the document into a file of
// the host's, such as a PDF made from the print snapshot or a file in another format.

import type { DocumentFile } from '../model/format/document-format.js';
import type { HostResult } from './adapters.js';

/** What a print snapshot an export asks for holds beside the pages. */
export interface ExportSnapshotOptions {
  /** The snapshot's title. */
  readonly title?: string | undefined;
  /** The stylesheets that style the pages, as CSS text, inlined in order. */
  readonly styles?: readonly string[] | undefined;
  /** The stylesheets that style the pages, by address, linked in order. */
  readonly stylesheets?: readonly string[] | undefined;
  /** How suggestions print; by default as the editor shows them. */
  readonly markup?: 'all' | 'final' | 'original' | undefined;
}

/** What an export is given to make its file. */
export interface ExportRequest {
  /** The document as stored, as the editor shows it now. */
  readonly content: DocumentFile;
  /** The document's print snapshot, once its pages have settled and their images and fonts loaded. */
  snapshot(options?: ExportSnapshotOptions): Promise<string>;
  /** Aborted when the editor unmounts. */
  readonly signal: AbortSignal;
}

/** One entry of File > Export. */
export interface DocumentExport {
  readonly id: string;
  /** How the menu names it, such as `PDF`. */
  readonly label: string;
  /** Makes the export; the editor tells the reader it started, and how it ended. */
  run(request: ExportRequest): Promise<HostResult<void>>;
}

/** The exports File > Export offers. */
export interface ExportsAdapter {
  /** The entries, in the order the menu lists them. */
  readonly entries: readonly DocumentExport[];
}

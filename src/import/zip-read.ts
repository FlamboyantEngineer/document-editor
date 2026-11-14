// Reading the files of a zip archive, as the formats built on zip store them, such as a word
// processing document. Stored and deflated files are read; deflated ones through the platform's
// `DecompressionStream`, which browsers and Node both have, so no DOM and no dependency is needed.
// Sizes are checked against limits before and while a file is inflated, each file's and all the
// files' read together, so a small archive cannot expand into more memory than the caller allows.

import { importError } from './import-error.js';

/** How much an archive may hold. */
export interface ZipLimits {
  /** The most files the archive may list. */
  readonly files: number;
  /** The most bytes any one file may inflate to. */
  readonly fileBytes: number;
  /** The most bytes all the files read from the archive may inflate to together. */
  readonly totalBytes: number;
}

/** The default limits: 5000 files, 64 MB in any one file and 256 MB in all. */
export const DEFAULT_ZIP_LIMITS: ZipLimits = Object.freeze({
  files: 5000,
  fileBytes: 64 * 1024 * 1024,
  totalBytes: 256 * 1024 * 1024,
});

/** An archive's files by path, each read when asked for. */
export interface ZipArchive {
  readonly paths: readonly string[];
  /** A file's bytes; null when the archive has no such file. */
  readonly read: (path: string) => Promise<Uint8Array | null>;
}

interface Entry {
  readonly method: number;
  readonly compressed: number;
  readonly size: number;
  readonly offset: number;
}

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

// The offset of the end-of-central-directory record, searched from the end past any comment.
function endOfDirectory(view: DataView): number {
  for (let at = view.byteLength - 22; at >= Math.max(0, view.byteLength - 22 - 0xffff); at -= 1) {
    if (view.getUint32(at, true) === END_OF_DIRECTORY) return at;
  }
  throw importError('unreadable', 'The file is not a zip archive.');
}

function entriesOf(bytes: Uint8Array, limits: ZipLimits): Map<string, Entry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = endOfDirectory(view);
  const count = view.getUint16(end + 10, true);
  if (count > limits.files)
    throw importError('too-large', `The archive lists more than ${String(limits.files)} files.`);
  const decoder = new TextDecoder();
  const entries = new Map<string, Entry>();
  let at = view.getUint32(end + 16, true);
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== DIRECTORY_ENTRY) {
      throw importError('damaged', 'The archive directory is damaged.');
    }
    const nameLength = view.getUint16(at + 28, true);
    const skip = nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, {
      method: view.getUint16(at + 10, true),
      compressed: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      offset: view.getUint32(at + 42, true),
    });
    at += 46 + skip;
  }
  return entries;
}

// The bytes read from an archive so far, against its limits.
interface Budget {
  readonly limits: ZipLimits;
  used: number;
}

// Throws when a file of `size` bytes, `more` of them not yet counted, is over the budget's limits.
function checkBudget(budget: Budget, size: number, more: number): void {
  const { fileBytes, totalBytes } = budget.limits;
  if (size > fileBytes) {
    throw importError(
      'too-large',
      `A file in the archive is larger than ${String(fileBytes)} bytes.`,
    );
  }
  if (budget.used + more > totalBytes) {
    throw importError(
      'too-large',
      `The files in the archive are larger than ${String(totalBytes)} bytes together.`,
    );
  }
}

// Inflates raw deflate data, stopping once it passes the budget.
async function inflate(data: Uint8Array, budget: Budget): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // Damaged deflate data makes the stream fail with the platform's own error.
  const next = () =>
    reader.read().catch(() => {
      throw importError('damaged', 'A file in the archive is damaged.');
    });
  for (let chunk = await next(); !chunk.done; chunk = await next()) {
    total += chunk.value.length;
    try {
      checkBudget(budget, total, chunk.value.length);
    } catch (error) {
      await reader.cancel();
      throw error;
    }
    budget.used += chunk.value.length;
    chunks.push(chunk.value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

async function readEntry(bytes: Uint8Array, entry: Entry, budget: Budget): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The size the directory states, checked before inflating; inflating counts what it gives.
  checkBudget(budget, entry.size, entry.size);
  if (entry.offset + 30 > bytes.length || view.getUint32(entry.offset, true) !== LOCAL_HEADER) {
    throw importError('damaged', 'A file header in the archive is damaged.');
  }
  const start =
    entry.offset +
    30 +
    view.getUint16(entry.offset + 26, true) +
    view.getUint16(entry.offset + 28, true);
  const data = bytes.subarray(start, start + entry.compressed);
  if (entry.method === 0) {
    checkBudget(budget, data.length, data.length);
    budget.used += data.length;
    return data;
  }
  if (entry.method === 8) return inflate(data, budget);
  throw importError(
    'damaged',
    `A file in the archive uses compression method ${String(entry.method)}.`,
  );
}

/**
 * The files of a zip archive (DOCE-IMPORT-2.1): stored or deflated, read when asked for. Throws an
 * `ImportError` for bytes that are not an archive, a damaged directory or header, an unknown
 * compression method, or more files or bytes than `limits` allow; every read counts towards
 * `totalBytes`, a file read twice twice.
 */
export function readZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipArchive {
  const entries = entriesOf(bytes, limits);
  const budget: Budget = { limits, used: 0 };
  return {
    paths: [...entries.keys()],
    read: async (path) => {
      const entry = entries.get(path);
      return entry ? readEntry(bytes, entry, budget) : null;
    },
  };
}

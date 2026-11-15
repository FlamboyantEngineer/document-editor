import type { EmbedContent, EmbedSource, EmbedSourceAdapter, HostResult } from './adapters.js';
import { buildLinkedSpreadsheetTable } from './linked-spreadsheet-table.js';

/** Source selection, independent of any spreadsheet package, transport or storage. */
export interface LinkedSpreadsheetSource {
  id: string;
  sheetId: string;
  range: string;
}

/** The captured part of a linked spreadsheet insertion used by the document bridge. */
export interface LinkedSpreadsheetCapture {
  kind: 'linked-spreadsheet';
  schemaVersion: 1;
  source: { id: string; revision: string };
  sheetId: string;
  range: string;
  publication: {
    status: string;
    inputKey: string;
    revision: number;
    result?: unknown;
    cellStates?: Record<string, string> | undefined;
  };
  table: {
    kind: 'table';
    schemaVersion: 1;
    sheetId: string;
    range: string;
    rows: readonly (readonly { text: string; colspan: number; rowspan: number }[])[];
  };
}

function isReadyPublication(publication: LinkedSpreadsheetCapture['publication']): boolean {
  return (
    publication.status === 'ready' &&
    typeof publication.inputKey === 'string' &&
    publication.inputKey.length > 0 &&
    Number.isSafeInteger(publication.revision) &&
    publication.revision >= 0 &&
    Boolean(publication.result) &&
    Object.values(publication.cellStates ?? {}).every((state) => state === 'ready')
  );
}

/** Creates a persisted, locked embed from externally calculated, captured table output. */
export function createLinkedSpreadsheetEmbed(
  capture: LinkedSpreadsheetCapture,
  label = capture.sheetId,
): EmbedSource & EmbedContent {
  const { source, sheetId, range, table } = capture;
  if (
    capture.kind !== 'linked-spreadsheet' ||
    capture.schemaVersion !== 1 ||
    ![source.id, source.revision, sheetId, range].every(
      (value) => typeof value === 'string' && value.length > 0,
    ) ||
    !isReadyPublication(capture.publication) ||
    table.kind !== 'table' ||
    table.schemaVersion !== 1 ||
    table.sheetId !== sheetId ||
    table.range !== range
  ) {
    throw new TypeError('A linked spreadsheet requires a consistent ready capture.');
  }
  return {
    kind: 'spreadsheet',
    source: JSON.stringify([source.id, sheetId, range]),
    snapshot: source.revision,
    label,
    content: [buildLinkedSpreadsheetTable(table.rows)],
  };
}

/** Reads the opaque selection key carried by a spreadsheet embed. */
export function readLinkedSpreadsheetSource(embed: EmbedSource): LinkedSpreadsheetSource | null {
  if (embed.kind !== 'spreadsheet') return null;
  try {
    const value: unknown = JSON.parse(embed.source);
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      !value.every((part: unknown) => typeof part === 'string' && part.length > 0)
    )
      return null;
    const [id, sheetId, range] = value as [string, string, string];
    return { id, sheetId, range };
  } catch {
    return null;
  }
}

/** Adapts a host's authoritative capture loader to ordinary embed status and explicit refresh. */
export function createLinkedSpreadsheetAdapter(
  load: (
    source: LinkedSpreadsheetSource,
    signal?: AbortSignal,
  ) => Promise<HostResult<LinkedSpreadsheetCapture>>,
): EmbedSourceAdapter {
  const loadEmbed = async (
    embed: EmbedSource,
    signal?: AbortSignal,
  ): Promise<HostResult<EmbedContent>> => {
    const selection = readLinkedSpreadsheetSource(embed);
    if (!selection) return { ok: false, error: { kind: 'not-found' } };
    const result = await load(selection, signal);
    if (!result.ok) return result;
    try {
      const captured = createLinkedSpreadsheetEmbed(result.value);
      if (captured.source !== embed.source) return { ok: false, error: { kind: 'conflict' } };
      return { ok: true, value: captured };
    } catch {
      return {
        ok: false,
        error: { kind: 'unavailable', message: 'The spreadsheet capture is not ready.' },
      };
    }
  };
  return {
    kinds: ['spreadsheet'],
    load: loadEmbed,
    resolve: async (embeds, signal) => {
      const results = await Promise.all(embeds.map((embed) => loadEmbed(embed, signal)));
      const failure = results.find(
        (result) => !result.ok && !['not-found', 'denied'].includes(result.error.kind),
      );
      if (failure && !failure.ok) return failure;
      return {
        ok: true,
        value: results.map((result) =>
          result.ok
            ? { snapshot: result.value.snapshot, label: result.value.label }
            : result.error.kind === 'denied'
              ? ('no-access' as const)
              : null,
        ),
      };
    },
  };
}

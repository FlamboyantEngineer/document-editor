// The host's data services the host services lab embeds content from, mimicked in the page: data
// sets the host keeps (`EmbedSourceAdapter`), changed, removed or denied as another writer would;
// a linked spreadsheet whose ranges the host calculates and captures
// (`createLinkedSpreadsheetAdapter`), changed or recalculating; and the one source the embed status
// checks both through.

import {
  createLinkedSpreadsheetAdapter,
  createLinkedSpreadsheetEmbed,
  type EmbedContent,
  type EmbedSnapshot,
  type EmbedSource,
  type EmbedSourceAdapter,
  type LinkedSpreadsheetCapture,
  type LinkedSpreadsheetCell,
} from '../../src/host/index.js';
import type { StoredContent } from '../../src/model/index.js';
import { text } from './lab-document.js';

export const EMBED_KIND = 'data-set';

interface HostDataSet {
  label: string;
  revision: number;
  rows: readonly (readonly [string, string])[];
  removed: boolean;
  denied: boolean;
}

export const table = (rows: readonly (readonly [string, string])[]): StoredContent => [
  {
    type: 'table',
    content: rows.map((row, index) => ({
      type: 'tableRow',
      content: row.map((cell) => ({
        type: index === 0 ? 'tableHeader' : 'tableCell',
        content: [{ type: 'paragraph', content: cell ? [text(cell)] : [] }],
      })),
    })),
  },
];

/** The lab's data service: data sets by id, which the controls change as another writer would. */
export function createDataService(onChange: () => void) {
  const sets = new Map<string, HostDataSet>([
    [
      'limits',
      {
        label: 'Operating limits',
        revision: 1,
        rows: [
          ['Quantity', 'Limit'],
          ['Supply voltage', '28 V'],
          ['Temperature', '70 °C'],
        ],
        removed: false,
        denied: false,
      },
    ],
    [
      'timings',
      {
        label: 'Timings',
        revision: 1,
        rows: [
          ['Step', 'Duration'],
          ['Start-up', '2 s'],
        ],
        removed: false,
        denied: false,
      },
    ],
  ]);
  let failNext = false;
  const contentOf = (id: string, set: HostDataSet): EmbedContent => ({
    snapshot: `${id}@${String(set.revision)}`,
    label: set.label,
    content: table(set.rows),
  });
  const adapter: EmbedSourceAdapter = {
    kinds: [EMBED_KIND],
    resolve: (embeds) =>
      Promise.resolve({
        ok: true,
        value: embeds.map(({ source }) => {
          const set = sets.get(source);
          if (!set || set.removed) return null;
          if (set.denied) return 'no-access';
          return { snapshot: `${source}@${String(set.revision)}`, label: set.label };
        }),
      }),
    load: ({ source }) => {
      const set = sets.get(source);
      if (failNext) {
        failNext = false;
        return Promise.resolve({
          ok: false,
          error: { kind: 'unavailable', message: 'The data service is down' },
        });
      }
      if (!set || set.removed) return Promise.resolve({ ok: false, error: { kind: 'not-found' } });
      if (set.denied) return Promise.resolve({ ok: false, error: { kind: 'denied' } });
      return Promise.resolve({ ok: true, value: contentOf(source, set) });
    },
  };
  const change = (id: string, update: (set: HostDataSet) => HostDataSet) => {
    const set = sets.get(id);
    if (!set) return;
    sets.set(id, update(set));
    onChange();
  };
  return {
    adapter,
    ids: [...sets.keys()],
    describe: (id: string) => sets.get(id),
    content: (id: string) => {
      const set = sets.get(id);
      return set ? contentOf(id, set) : null;
    },
    addRow: (id: string) =>
      change(id, (set) => ({
        ...set,
        revision: set.revision + 1,
        rows: [...set.rows, [`Row ${String(set.rows.length)}`, `${String(set.revision + 1)}`]],
      })),
    toggleRemoved: (id: string) => change(id, (set) => ({ ...set, removed: !set.removed })),
    toggleDenied: (id: string) => change(id, (set) => ({ ...set, denied: !set.denied })),
    failNextLoad: () => {
      failNext = true;
    },
  };
}

// ----- A linked spreadsheet, as a host's spreadsheet service calculates it -----

/** The range of the lab's spreadsheet the document links to. */
export const SHEET = { id: 'budget', sheetId: 'Summary', range: 'A1:B4' } as const;

interface HostSheet {
  revision: number;
  rows: string[][];
  calculating: boolean;
  denied: boolean;
}

const cell = (value: string, header: boolean): LinkedSpreadsheetCell => ({
  text: value,
  colspan: 1,
  rowspan: 1,
  ...(header ? { bold: true, background: '#e0f2fe' } : {}),
});

/** The lab's spreadsheet service: one sheet whose range the controls change or recalculate. */
export function createSpreadsheetService(onChange: () => void) {
  const sheet: HostSheet = {
    revision: 1,
    rows: [
      ['Item', 'Cost'],
      ['Sensors', '1200'],
      ['Cabling', '340'],
      ['Total', '1540'],
    ],
    calculating: false,
    denied: false,
  };
  const capture = (): LinkedSpreadsheetCapture => ({
    kind: 'linked-spreadsheet',
    schemaVersion: 1,
    source: { id: SHEET.id, revision: `r${String(sheet.revision)}` },
    sheetId: SHEET.sheetId,
    range: SHEET.range,
    publication: {
      status: sheet.calculating ? 'calculating' : 'ready',
      inputKey: `inputs-${String(sheet.revision)}`,
      revision: sheet.revision,
      result: { cells: sheet.rows.length * 2 },
    },
    table: {
      kind: 'table',
      schemaVersion: 1,
      sheetId: SHEET.sheetId,
      range: SHEET.range,
      rows: sheet.rows.map((row, index) => row.map((value) => cell(value, index === 0))),
    },
  });
  const adapter = createLinkedSpreadsheetAdapter((source) => {
    if (source.id !== SHEET.id) return Promise.resolve({ ok: false, error: { kind: 'not-found' } });
    if (sheet.denied) return Promise.resolve({ ok: false, error: { kind: 'denied' } });
    return Promise.resolve({ ok: true, value: capture() });
  });
  return {
    adapter,
    describe: () => ({ ...sheet }),
    /** The range as the host captured it, ready to insert; null while it recalculates. */
    insertable: () =>
      sheet.calculating ? null : createLinkedSpreadsheetEmbed(capture(), 'Budget'),
    changeCost: () => {
      sheet.revision += 1;
      const cost = 340 + sheet.revision * 10;
      sheet.rows = [
        sheet.rows[0] ?? [],
        sheet.rows[1] ?? [],
        ['Cabling', String(cost)],
        ['Total', String(1200 + cost)],
      ];
      onChange();
    },
    toggleCalculating: () => {
      sheet.calculating = !sheet.calculating;
      onChange();
    },
    toggleDenied: () => {
      sheet.denied = !sheet.denied;
      onChange();
    },
  };
}

// ----- One source for the embed status -----

/** The adapters' kinds as one source, each embed asked of the adapter of its kind. */
export function combineSources(...adapters: readonly EmbedSourceAdapter[]): EmbedSourceAdapter {
  const of = (embed: EmbedSource) => adapters.find((each) => each.kinds.includes(embed.kind));
  return {
    kinds: adapters.flatMap((each) => each.kinds),
    load: (embed, signal) =>
      of(embed)?.load(embed, signal) ??
      Promise.resolve({ ok: false, error: { kind: 'not-found' } }),
    resolve: async (embeds, signal) => {
      const value: (EmbedSnapshot | null | 'no-access')[] = embeds.map(() => null);
      for (const adapter of adapters) {
        const mine = embeds.flatMap((embed, at) => (of(embed) === adapter ? [{ embed, at }] : []));
        if (!mine.length) continue;
        const result = await adapter.resolve(
          mine.map(({ embed }) => embed),
          signal,
        );
        if (!result.ok) return result;
        mine.forEach(({ at }, index) => {
          value[at] = result.value[index] ?? null;
        });
      }
      return { ok: true, value };
    },
  };
}

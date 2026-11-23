// How a list of contents looks by its kind, which both its node view and the layout engine read:
// its title and empty message, its levels' leaders, whether it shows pages, and the rows a block
// shows, as the layout engine lays them out (DOCE-PAGINATION-10.11).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { ContentsList } from '../layout-engine/blocks/types.js';
import {
  type ContentsKind,
  DEFAULT_CONTENTS_KINDS,
  type DocumentCatalog,
  EXTERNAL_DOCUMENT_REFERENCE_TYPE,
  resolveContentsList,
  type TemplateFile,
} from '../model/index.js';
import { type Kinds, rowsOf } from './contents-listing.js';
import type { ContentsLabels } from './contents-view.js';

/** The labels each default list shows unless a host gives its own. */
export const CONTENTS_LABELS: Readonly<
  Record<keyof typeof DEFAULT_CONTENTS_KINDS, ContentsLabels>
> = {
  toc: { title: 'Table of Contents', empty: 'No headings found.' },
  figures: { title: 'Table of Figures', empty: 'No figures found.' },
  tables: { title: 'Table of Tables', empty: 'No tables found.' },
  codeBlocks: { title: 'Table of Code Blocks', empty: 'No code listings found.' },
  equations: { title: 'Table of Equations', empty: 'No equations found.' },
  references: {
    title: 'References',
    empty: 'No references found.',
    groups: { [EXTERNAL_DOCUMENT_REFERENCE_TYPE]: 'Documents' },
  },
  abbreviations: { title: 'Abbreviations', empty: 'No abbreviations found.' },
};

/** The labels of a kind of list that neither the defaults nor the host label. */
const UNLABELLED: ContentsLabels = { title: 'Contents', empty: 'Nothing to list.' };

/** What a kind of list looks like, from the template and the labels. */
interface LookSource {
  readonly template: () => TemplateFile;
  readonly kinds: Kinds;
  readonly labels?: Readonly<Record<string, Partial<ContentsLabels>>> | undefined;
}

/** How a list block looks: its kind's settings, labels, levels' leaders and whether it shows pages. */
export function listLook({ template, kinds, labels = {} }: LookSource) {
  const defaults: Readonly<Record<string, ContentsLabels>> = CONTENTS_LABELS;
  return (node: ProseMirrorNode) => {
    const key = kinds.of(node);
    const kind = kinds.all[key];
    const list = resolveContentsList(template().styles?.contents, key);
    const label = { ...(defaults[key] ?? UNLABELLED), ...labels[key] };
    return {
      key,
      list,
      labels: list.title ? { ...label, title: list.title } : label,
      leaders: list.levels.map((level) =>
        kind?.leader === false ? null : (level.leader?.character ?? null),
      ),
      showPage: kind?.showPage !== false,
    };
  };
}

/** What a list block shows, as the layout engine lays it out: its title, empty message and rows. */
export function listOf(
  node: ProseMirrorNode,
  {
    catalog,
    kinds,
    look,
  }: { catalog: DocumentCatalog; kinds: Kinds; look: ReturnType<typeof listLook> },
): ContentsList {
  const rows = rowsOf(node, { catalog, kinds });
  const { key, labels, leaders, showPage } = look(node);
  const titled = node.attrs.showTitle !== false;
  return {
    kind: key,
    title: titled ? labels.title : null,
    empty: titled && rows.empty ? labels.empty : null,
    entries: rows.entries.map((entry) => ({
      level: entry.level,
      number: entry.number,
      text: entry.text,
      ...(entry.heading ? { heading: true } : {}),
    })),
    separator: rows.separator,
    showPage: rows.showPage && showPage,
    leaders: leaders.map((character) => character !== null),
  };
}

/** The kinds a plugin lists: the defaults and a host's, each list block naming one or `toc`. */
export function kindsOf(
  added: Readonly<Record<string, ContentsKind>> = {},
  labels: Readonly<Record<string, Partial<ContentsLabels>>> = {},
): Kinds {
  const all: Record<string, ContentsKind> = { ...DEFAULT_CONTENTS_KINDS, ...added };
  const defaults: Readonly<Record<string, ContentsLabels>> = CONTENTS_LABELS;
  return {
    all,
    of: (node) => {
      const type: unknown = node.attrs.tocType;
      return typeof type === 'string' && Object.hasOwn(all, type) ? type : 'toc';
    },
    groupTitle: (key, group) =>
      labels[key]?.groups?.[group] ?? defaults[key]?.groups?.[group] ?? null,
  };
}

/** The kinds a document lists with no host's: the defaults. */
export const DEFAULT_KINDS: Kinds = kindsOf();

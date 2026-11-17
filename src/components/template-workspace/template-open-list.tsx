// The open dialog's list: the templates the store lists in a tree of the folders the host places
// them in, pinned ones first, each with the icon the host gives it, and a search that keeps the
// templates whose name, id or folder path holds what is typed. A double click or Enter on a
// template opens it. It loads the first time the dialog opens.

import { FolderGlyph, type Key } from '@flamboyantengineer/ui-components/core';
import { SearchField } from '@flamboyantengineer/ui-components/search-field';
import { Tree } from '@flamboyantengineer/ui-components/tree';
import type { TemplateSummary } from '../../host/adapters.js';
import type { TemplateCatalog } from './template-open-dialog.js';
import { workspaceHooks } from './template-workspace-hooks.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';

/** A row of the dialog's tree: a folder, or a template. */
interface CatalogRow {
  readonly id: Key;
  readonly label: string;
  /** What the search reads: a template's name, id and folder path, or a folder's name. */
  readonly text: string;
  readonly template?: TemplateSummary | undefined;
  readonly children?: readonly CatalogRow[] | undefined;
}

const nameOf = (template: TemplateSummary) => template.name ?? template.id;
const byLabel = (one: CatalogRow, other: CatalogRow) => one.label.localeCompare(other.label);

// A folder's rows: its folders by name, then its templates by name.
function sorted(rows: readonly CatalogRow[]): CatalogRow[] {
  const folders = rows.filter((row) => !row.template).sort(byLabel);
  const templates = rows.filter((row) => row.template).sort(byLabel);
  return [
    ...folders.map((row) => ({ ...row, children: sorted(row.children ?? []) })),
    ...templates,
  ];
}

/** The tree's rows: the pinned templates, then each template in its folders. */
function catalogRows(
  templates: readonly TemplateSummary[],
  catalog: TemplateCatalog,
): CatalogRow[] {
  const pinned = new Set(catalog.pinned ?? []);
  const top: CatalogRow[] = [];
  const folders = new Map<string, { children: CatalogRow[] }>();
  const folderOf = (path: readonly string[]) => {
    let level = top;
    path.forEach((name, depth) => {
      const key = path.slice(0, depth + 1).join('/');
      let folder = folders.get(key);
      if (!folder) {
        folder = { children: [] };
        folders.set(key, folder);
        level.push({ id: `folder:${key}`, label: name, text: name, children: folder.children });
      }
      level = folder.children;
    });
    return level;
  };
  const first: CatalogRow[] = [];
  for (const template of templates) {
    const path = pinned.has(template.id) ? [] : (catalog.pathOf?.(template) ?? []);
    const text = [nameOf(template), template.id, path.join('/')].join(' ');
    const row = { id: template.id, label: nameOf(template), text, template };
    (pinned.has(template.id) ? first : folderOf(path)).push(row);
  }
  const order = catalog.pinned ?? [];
  first.sort((one, other) => order.indexOf(String(one.id)) - order.indexOf(String(other.id)));
  return [...first, ...sorted(top)];
}

interface OpenListProps {
  readonly templates: readonly TemplateSummary[];
  readonly catalog: TemplateCatalog;
  readonly labels: TemplateWorkspaceLabels;
  readonly search: string;
  readonly onSearchChange: (search: string) => void;
  /** The template selected, by id. */
  readonly selected: string | null;
  readonly onSelectedChange: (templateId: string | null) => void;
  readonly onOpen: (templateId: string) => void;
}

/** The search and the tree of templates. */
export function TemplateOpenList(props: OpenListProps) {
  const { templates, catalog, labels, search, selected } = props;
  const rows = catalogRows(templates, catalog);
  const ids = new Set(templates.map((template) => template.id));
  return (
    <div {...workspaceHooks.slot('open-dialog')}>
      <SearchField label={labels.searchTemplates} value={search} onChange={props.onSearchChange} />
      <Tree
        aria-label={labels.templates}
        items={rows}
        getTextValue={(row) => row.text}
        renderLabel={(row) => row.label}
        getIcon={(row) => (row.template ? catalog.iconOf?.(row.template) : FolderGlyph)}
        filterText={search}
        selectionMode="single"
        selectionBehavior="replace"
        selectedKeys={selected === null ? [] : [selected]}
        onSelectionChange={(keys) => {
          const key = keys === 'all' ? undefined : [...keys][0];
          props.onSelectedChange(typeof key === 'string' && ids.has(key) ? key : null);
        }}
        onAction={(key) => props.onOpen(String(key))}
        emptyMessage={labels.noTemplates}
      />
    </div>
  );
}

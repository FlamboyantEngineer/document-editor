// The dialog that opens a stored template: the templates the store lists in a tree of the folders
// the host places them in, pinned ones first, each with the icon the host gives it. A search keeps
// the templates whose name, id or folder path holds what is typed. Open opens the one selected;
// so do a double click and Enter on it.

import { Button } from '@flamboyantengineer/ui-components/button';
import { FolderGlyph, type Key } from '@flamboyantengineer/ui-components/core';
import type { IconSource } from '@flamboyantengineer/ui-components/icon';
import { Modal } from '@flamboyantengineer/ui-components/modal';
import { SearchField } from '@flamboyantengineer/ui-components/search-field';
import { Tree } from '@flamboyantengineer/ui-components/tree';
import { useState } from 'react';
import type { TemplateSummary } from '../../host/adapters.js';
import { workspaceHooks } from './template-workspace-hooks.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';

/** Where the open dialog lists the templates, and how it draws them. */
export interface TemplateCatalog {
  /** The folders a template sits in, outermost first; none lists it at the top. */
  readonly pathOf?: ((template: TemplateSummary) => readonly string[]) | undefined;
  /** The icon a template's row shows. */
  readonly iconOf?: ((template: TemplateSummary) => IconSource) | undefined;
  /** The templates listed first, above the folders, by id. */
  readonly pinned?: readonly string[] | undefined;
}

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

interface OpenDialogProps {
  readonly templates: readonly TemplateSummary[];
  readonly catalog: TemplateCatalog;
  /** Opens the template of this id. */
  readonly onOpen: (templateId: string) => void;
  readonly labels: TemplateWorkspaceLabels;
  readonly isDisabled: boolean;
}

/** The Open button and the dialog it opens. */
export function TemplateOpenDialog({
  templates,
  catalog,
  onOpen,
  labels,
  isDisabled,
}: OpenDialogProps) {
  const [isOpen, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const rows = catalogRows(templates, catalog);
  const byId = new Map(templates.map((template) => [template.id, template]));
  const open = (id: string | null) => {
    if (id === null || !byId.has(id)) return;
    setOpen(false);
    onOpen(id);
  };
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={FolderGlyph}
        label={labels.open}
        tooltip={labels.open}
        isDisabled={isDisabled}
        onPress={() => {
          setSearch('');
          setSelected(null);
          setOpen(true);
        }}
      />
      <Modal
        isOpen={isOpen}
        onOpenChange={setOpen}
        title={labels.openTitle}
        size="md"
        primaryAction={{
          label: labels.open,
          isDisabled: selected === null,
          onPress: () => open(selected),
        }}
      >
        <div {...workspaceHooks.slot('open-dialog')}>
          <SearchField label={labels.searchTemplates} value={search} onChange={setSearch} />
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
              setSelected(typeof key === 'string' && byId.has(key) ? key : null);
            }}
            onAction={(key) => open(String(key))}
            emptyMessage={labels.noTemplates}
          />
        </div>
      </Modal>
    </>
  );
}

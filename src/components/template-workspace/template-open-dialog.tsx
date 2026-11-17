// The dialog that opens a stored template: the templates the store lists in a tree of the folders
// the host places them in, pinned ones first, each with the icon the host gives it. A search keeps
// the templates whose name, id or folder path holds what is typed. Open opens the one selected;
// so do a double click and Enter on it. The list loads the first time the dialog opens.

import { Button } from '@flamboyantengineer/ui-components/button';
import { FolderGlyph } from '@flamboyantengineer/ui-components/core';
import type { IconSource } from '@flamboyantengineer/ui-components/icon';
import { Modal } from '@flamboyantengineer/ui-components/modal';
import { lazy, Suspense, useState } from 'react';
import type { TemplateSummary } from '../../host/adapters.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';

// The list loads the first time the dialog opens, so the workspace's own code does not carry its
// tree (DOCE-ENTRY-2.2).
const LazyList = /* @__PURE__ */ lazy(async () => ({
  default: (await import('./template-open-list.js')).TemplateOpenList,
}));

/** Where the open dialog lists the templates, and how it draws them. */
export interface TemplateCatalog {
  /** The folders a template sits in, outermost first; none lists it at the top. */
  readonly pathOf?: ((template: TemplateSummary) => readonly string[]) | undefined;
  /** The icon a template's row shows. */
  readonly iconOf?: ((template: TemplateSummary) => IconSource) | undefined;
  /** The templates listed first, above the folders, by id. */
  readonly pinned?: readonly string[] | undefined;
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
  const open = (id: string | null) => {
    if (id === null || !templates.some((template) => template.id === id)) return;
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
        <Suspense fallback={null}>
          <LazyList
            templates={templates}
            catalog={catalog}
            labels={labels}
            search={search}
            onSearchChange={setSearch}
            selected={selected}
            onSelectedChange={setSelected}
            onOpen={open}
          />
        </Suspense>
      </Modal>
    </>
  );
}

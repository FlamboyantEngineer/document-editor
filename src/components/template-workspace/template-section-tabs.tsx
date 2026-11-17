// The tabs of the template's scopes: the document's settings first, which cannot be removed, then a
// tab per template section by its label, or its name without one. The add button after the last
// tab appends a section and shows it, keeping focus for another; a section tab's menu renames it in
// place, inserts a section before or after it and deletes it once confirmed.

import type { Key } from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { Modal } from '@flamboyantengineer/ui-components/modal';
import { Tab, TabList } from '@flamboyantengineer/ui-components/tabs';
import { useState } from 'react';
import type { TemplateFile, TemplateSection } from '../../model/index.js';
import {
  freshSectionName,
  renameSection,
  type TemplateScope,
  withNamedSection,
  withoutSection,
  withSectionAt,
} from '../template-editor/template-editor.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';

/** The key of the document's tab: no section name has a `#`. */
const DOCUMENT_TAB = '#document';

/** The tab key of a scope. */
export const tabOf = (scope: TemplateScope): string => scope ?? DOCUMENT_TAB;

/** The scope of a tab key. */
export const scopeOf = (key: Key): TemplateScope => (key === DOCUMENT_TAB ? null : String(key));

interface SectionTabsProps {
  /** The template, with the sections it inherits listed (`withListedSections`). */
  readonly template: TemplateFile;
  readonly onChange: (template: TemplateFile) => void;
  readonly onScopeChange: (scope: TemplateScope) => void;
  /** Receives a section's old and new name once a tab renames it. */
  readonly onSectionRename?: ((from: string, to: string) => void) | undefined;
  readonly labels: TemplateWorkspaceLabels;
  readonly isDisabled: boolean;
}

const labelOf = (section: TemplateSection) => section.label || section.name;

// A tab's rename: the label it shows when the section has one, and otherwise its name, written as
// a section name (`renameSection`).
function renamed(template: TemplateFile, section: TemplateSection, text: string) {
  if (section.label) {
    const label = text.trim();
    return { template: withNamedSection(template, section.name, (each) => ({ ...each, label })) };
  }
  return renameSection(template, section.name, text);
}

/** Asks to confirm deleting a section, then deletes it and shows the document's settings. */
function DeleteSectionDialog(
  props: SectionTabsProps & { section: TemplateSection | null; onClose: () => void },
) {
  const { section, labels, onClose } = props;
  return (
    <Modal
      role="alertdialog"
      isOpen={section !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      tone="danger"
      size="sm"
      title={labels.deleteSectionTitle(section ? labelOf(section) : '')}
      description={labels.deleteSectionMessage}
      primaryAction={{
        label: labels.deleteSection,
        onPress: (close) => {
          close();
          if (!section) return;
          props.onScopeChange(null);
          props.onChange(withoutSection(props.template, section.name));
        },
      }}
    />
  );
}

/** The scope tabs' list, inside the workspace's `Tabs`, whose selection is the scope. */
export function TemplateSectionTabs(props: SectionTabsProps) {
  const { template, onChange, onScopeChange, labels, isDisabled } = props;
  const sections = template.sections ?? [];
  const [deleting, setDeleting] = useState<TemplateSection | null>(null);
  const sectionOf = (key: Key) => sections.find((section) => section.name === key);
  const insert = (at: number) => {
    const name = freshSectionName(template);
    onChange(withSectionAt(template, { name }, at));
    onScopeChange(name);
  };
  const menu = (key: Key, standard: readonly MenuEntry[]): readonly MenuEntry[] => {
    const index = sections.findIndex((section) => section.name === key);
    if (index < 0) return [];
    const rename = standard.filter((entry) => entry.id === 'rename');
    return [
      ...rename.map((entry) => ({ ...entry, label: labels.renameSection })),
      { id: 'insert-before', label: labels.insertSectionBefore, onAction: () => insert(index) },
      { id: 'insert-after', label: labels.insertSectionAfter, onAction: () => insert(index + 1) },
      { type: 'separator', id: 'rule' },
      {
        id: 'delete',
        label: labels.deleteSection,
        tone: 'danger',
        onAction: () => setDeleting(sections[index] ?? null),
      },
    ];
  };
  return (
    <>
      <TabList
        aria-label={labels.scopes}
        onAdd={isDisabled ? undefined : () => insert(sections.length)}
        onRename={(key, text) => {
          const section = sectionOf(key);
          const result = section ? renamed(template, section, text) : null;
          if (!section || !result || 'problem' in result) return;
          onChange(result.template);
          if ('name' in result && result.name !== section.name) {
            props.onSectionRename?.(section.name, result.name);
            onScopeChange(result.name);
          }
        }}
        validateName={(key, text) => {
          const section = sectionOf(key);
          const result = section ? renamed(template, section, text) : null;
          return result && 'problem' in result ? labels.sectionNameProblems[result.problem] : '';
        }}
        getMenuItems={isDisabled ? undefined : menu}
      >
        <Tab id={DOCUMENT_TAB}>{labels.documentTab}</Tab>
        {sections.map((section) => (
          <Tab key={section.name} id={section.name} textValue={labelOf(section)}>
            {labelOf(section)}
          </Tab>
        ))}
      </TabList>
      <DeleteSectionDialog {...props} section={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

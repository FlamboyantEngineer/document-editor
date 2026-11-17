// The template workspace's own text, in English by default.
import type { TemplateVersion } from '../../host/adapters.js';
import {
  DEFAULT_REVISION_LABELS,
  type RevisionLabels,
} from '../document-panels/document-panels.js';
import {
  DEFAULT_TEMPLATE_SCOPE_LABELS,
  type SectionNameProblem,
} from '../template-editor/template-editor.js';

/** The template workspace's own text. */
export interface TemplateWorkspaceLabels extends RevisionLabels {
  readonly toolbar: string;
  /** Names the band of scope tabs and template actions. */
  readonly band: string;
  /** Names the scope tabs. */
  readonly scopes: string;
  /** The document's tab. */
  readonly documentTab: string;
  readonly renameSection: string;
  readonly insertSectionBefore: string;
  readonly insertSectionAfter: string;
  readonly deleteSection: string;
  /** Asks to confirm deleting the named section. */
  readonly deleteSectionTitle: (label: string) => string;
  /** Says what deleting a section does. */
  readonly deleteSectionMessage: string;
  /** Says why a typed name cannot rename a section. */
  readonly sectionNameProblems: Readonly<Record<SectionNameProblem, string>>;
  readonly newTemplate: string;
  readonly open: string;
  readonly openTitle: string;
  /** Names the open dialog's tree of templates. */
  readonly templates: string;
  readonly searchTemplates: string;
  /** Says no template matches, or the store has none. */
  readonly noTemplates: string;
  readonly save: string;
  /** Save's name for a moment after a save. */
  readonly saved: string;
  /** Save's name for a moment after a save failed, with why. */
  readonly saveFailed: (message: string) => string;
  /** Says a template needs an id before it can be saved. */
  readonly idNeeded: string;
  /** Says the parent inherits from the template, so it cannot be saved. */
  readonly parentCycle: string;
  /** Names the side panel of the template's properties and history. */
  readonly panel: string;
  readonly properties: string;
  /** Names the document's settings in the properties. */
  readonly documentSettings: string;
  /** Names a section's settings in the properties. */
  readonly sectionSettings: string;
  /** Says a template has no saved versions before its first save. */
  readonly noHistory: string;
  /** Names the template's JSON shown in place of the preview. */
  readonly json: string;
  readonly saveAs: string;
  readonly saveAsTitle: string;
  /** Names the id field of the save-as dialog. */
  readonly copyId: string;
  /** Names the name field of the save-as dialog. */
  readonly copyName: string;
  /** The name a copy starts with. */
  readonly copyOf: (name: string) => string;
  readonly remove: string;
  readonly removeTitle: (name: string) => string;
  readonly removeMessage: string;
  readonly history: string;
  readonly preview: string;
  /** Names the document the workspace's own preview edits. */
  readonly previewDocument: string;
  /** Says another save came between opening the template and saving it. */
  readonly conflict: string;
  /** Drops the changes and opens the template as stored now. */
  readonly reload: string;
  /** Saves the changes over the template as stored now. */
  readonly overwrite: string;
  /** Says a request to the host failed, with its message. */
  readonly failed: (message: string) => string;
  /** Says an id is taken by another template. */
  readonly idTaken: (id: string) => string;
  /** Names the version shown in place of the template. */
  readonly viewing: (version: TemplateVersion) => string;
  readonly restore: string;
  /** Goes back from a version shown to the template being edited. */
  readonly backToTemplate: string;
  /** The template's unsaved changes, as the dirty guard lists them. */
  readonly unsavedChanges: (name: string) => string;
}

/** The template workspace's English text. */
export const DEFAULT_TEMPLATE_WORKSPACE_LABELS: TemplateWorkspaceLabels = {
  ...DEFAULT_REVISION_LABELS,
  toolbar: 'Template actions',
  band: 'Template',
  scopes: 'Template parts',
  documentTab: 'Document',
  renameSection: 'Rename the section',
  insertSectionBefore: 'Insert a section before',
  insertSectionAfter: 'Insert a section after',
  deleteSection: DEFAULT_TEMPLATE_SCOPE_LABELS.deleteSection,
  deleteSectionTitle: DEFAULT_TEMPLATE_SCOPE_LABELS.deleteSectionTitle,
  deleteSectionMessage: DEFAULT_TEMPLATE_SCOPE_LABELS.deleteSectionMessage,
  sectionNameProblems: DEFAULT_TEMPLATE_SCOPE_LABELS.sectionNameProblems,
  newTemplate: 'New template',
  open: 'Open',
  openTitle: 'Open a template',
  templates: 'Templates',
  searchTemplates: 'Search templates',
  noTemplates: 'No templates',
  save: 'Save',
  saved: 'Saved',
  saveFailed: (message) => `Not saved: ${message}`,
  idNeeded: 'Give the template an id to save it.',
  parentCycle: 'The parent template inherits from this one.',
  panel: 'Template panel',
  properties: 'Properties',
  documentSettings: 'Document settings',
  sectionSettings: 'Section settings',
  noHistory: 'Saved versions show here once the template is saved.',
  json: 'Template JSON',
  saveAs: 'Save as…',
  saveAsTitle: 'Save as a new template',
  copyId: 'Id',
  copyName: 'Name',
  copyOf: (name) => `Copy of ${name}`,
  remove: 'Delete',
  removeTitle: (name) => `Delete ${name}?`,
  removeMessage: 'The template and every saved version of it are deleted.',
  history: 'History',
  preview: 'Template preview',
  previewDocument: 'Template preview document',
  conflict: 'Someone else saved this template since you opened it.',
  reload: 'Reload',
  overwrite: 'Keep my changes',
  failed: (message) => `The request failed: ${message}`,
  idTaken: (id) => `A template with the id ${id} already exists.`,
  viewing: (version) => `Version ${String(version.sequence)}, read only`,
  restore: 'Restore this version',
  backToTemplate: 'Back to the template',
  unsavedChanges: (name) => `Changes to ${name}`,
};

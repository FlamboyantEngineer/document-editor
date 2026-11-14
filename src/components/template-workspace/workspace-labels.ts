// The template workspace's own text, in English by default.
import type { TemplateVersion } from '../../host/adapters.js';
import {
  DEFAULT_REVISION_LABELS,
  type RevisionLabels,
} from '../document-panels/document-panels.js';

/** The template workspace's own text. */
export interface TemplateWorkspaceLabels extends RevisionLabels {
  readonly toolbar: string;
  /** Names the template picker. */
  readonly template: string;
  /** The picker's text while no template is open. */
  readonly noTemplate: string;
  readonly newTemplate: string;
  /** The name a new template starts with. */
  readonly newTemplateName: string;
  readonly save: string;
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
  template: 'Template',
  noTemplate: 'Pick a template',
  newTemplate: 'New template',
  newTemplateName: 'New template',
  save: 'Save',
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

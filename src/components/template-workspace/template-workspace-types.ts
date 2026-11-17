// What the template workspace takes and hands its host.

import type { AvatarIdentity } from '@flamboyantengineer/ui-components/avatar';
import type { ReactNode } from 'react';
import type { RegionChange } from '../../engine/index.js';
import type {
  ScriptRunnerAdapter,
  TemplateStoreAdapter,
  VariablesAdapter,
} from '../../host/adapters.js';
import type { AssetAdapter } from '../../host/asset-adapters.js';
import type { TemplateFile, TemplatePartChange } from '../../model/index.js';
import type { DocumentLayout } from '../document-editor/document-editor.js';
import type { TemplateEditorProps, TemplateScope } from '../template-editor/template-editor.js';
import type { SaveAsFields } from './template-dialogs.js';
import type { TemplateCatalog } from './template-open-dialog.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';

/** What the host's preview of the template shown draws. */
export interface TemplatePreview {
  /** The template shown, resolved with the templates it inherits. */
  readonly template: TemplateFile;
  /** The layout the template is for (`layoutOf`). */
  readonly layout: DocumentLayout;
  /** The template section the tab shown names, or null for the document's. */
  readonly scope: TemplateScope;
  /**
   * Writes a header or footer edited on the preview's pages into the open template
   * (`withRegionChange`); absent while a saved version is shown.
   */
  readonly onRegionChange?: ((change: RegionChange) => void) | undefined;
  /**
   * Writes a section's starting content or placeholder edited in place on a preview shown in parts
   * into the open template (`withTemplatePart`); absent while a saved version is shown.
   */
  readonly onTemplatePartChange?: ((change: TemplatePartChange) => void) | undefined;
}

/** The parts of the workspace, for a host that lays them out itself (`renderLayout`). */
export interface TemplateWorkspaceParts {
  /** The scope tabs: the document's, then one per section, and the add button. */
  readonly tabs: ReactNode;
  /** The template actions. */
  readonly toolbar: ReactNode;
  /** The banners: a conflict, a failure, the version shown. */
  readonly messages: ReactNode;
  /** The preview of the tab shown. */
  readonly preview: ReactNode;
  /**
   * The tabs' panel, around everything the layout shows below the tabs and the toolbar: the
   * tabs take their tabs from what sits outside it.
   */
  readonly panel: (content: ReactNode) => ReactNode;
  /** The settings of the tab shown. */
  readonly properties: ReactNode;
  /** The saved versions. */
  readonly history: ReactNode;
}

/** What the template workspace edits, and through which store. */
export interface TemplateWorkspaceProps {
  /** Where the templates are stored. */
  readonly store: TemplateStoreAdapter;
  /** The template open at first, by id. */
  readonly defaultTemplateId?: string | null | undefined;
  /** The saved version of it shown at first, by revision. */
  readonly defaultRevision?: string | null | undefined;
  /**
   * The template open, by id, such as from the host's route: changing it opens that template once
   * unsaved changes are saved or discarded, and staying puts the open one's id back
   * (`onTemplateIdChange`). Undefined leaves the workspace to hold it.
   */
  readonly templateId?: string | null | undefined;
  /** The saved version shown, by revision, or null for the template itself. */
  readonly revision?: string | null | undefined;
  /** Called with the id of the template opened, or null once none stored is. */
  readonly onTemplateIdChange?: ((templateId: string | null) => void) | undefined;
  /** Called with the revision of the version shown, or null when back to the template. */
  readonly onRevisionChange?: ((revision: string | null) => void) | undefined;
  /** The layout a template is for: on pages, or the web layout. Defaults to pages. */
  readonly layoutOf?: ((template: TemplateFile) => DocumentLayout) | undefined;
  /**
   * Whether a template inherits nothing, not even the base template, such as a host's reserved
   * web-layout template. Its parent row is hidden and its settings are its own.
   */
  readonly isRoot?: ((template: TemplateFile) => boolean) | undefined;
  /** Whether a template's name is shown but not edited, such as a host's reserved template. */
  readonly isNameReadOnly?: ((template: TemplateFile) => boolean) | undefined;
  /**
   * Draws the template shown in place of the workspace's own preview (`TemplatePreviewEditor`),
   * such as a document editor with the template's preview document.
   */
  readonly renderPreview?: ((preview: TemplatePreview) => ReactNode) | undefined;
  /** The host's images, which the own preview's toolbar places in the template's content. */
  readonly assets?: AssetAdapter | undefined;
  /** The host's variables, which the own preview's variable menu lists. */
  readonly variables?: VariablesAdapter | undefined;
  /**
   * The host's script runner, which the own preview runs a template script with, for its preview
   * beside the script (DOCE-TEMPLATES-8.9).
   */
  readonly scriptRunner?: ScriptRunnerAdapter | undefined;
  /** How the open dialog lists the templates: their folders, icons and the pinned ones. */
  readonly catalog?: TemplateCatalog | undefined;
  /** The host's own fields in the save-as dialog, such as the copy's folder. */
  readonly saveAsFields?: SaveAsFields | undefined;
  /** Whether the toolbar offers Delete after Save. Defaults to false. */
  readonly canDelete?: boolean | undefined;
  /** Who saved a version, from its author id. */
  readonly personOf?: ((author: string) => AvatarIdentity | undefined) | undefined;
  /** Whether the side panel starts expanded. Defaults to false: a rail of its tabs. */
  readonly defaultPanelExpanded?: boolean | undefined;
  /** Where the side panel's tab is remembered, in the provider's storage. */
  readonly panelPersistKey?: string | undefined;
  /** Lays the parts out in place of the workspace's own layout, such as in a host's panels. */
  readonly renderLayout?: ((parts: TemplateWorkspaceParts) => ReactNode) | undefined;
  /** The host's own settings, kept in a template's `extensions` (DOCE-TEMPLATE-EDITOR-2.2). */
  readonly extensions?: TemplateEditorProps['extensions'];
  /** The fonts the font fields suggest. */
  readonly fonts?: readonly string[] | undefined;
  /** The host's reference types besides other documents, for the references settings. */
  readonly referenceTypes?: TemplateEditorProps['referenceTypes'];
  readonly labels?: Partial<TemplateWorkspaceLabels> | undefined;
  readonly className?: string | undefined;
}

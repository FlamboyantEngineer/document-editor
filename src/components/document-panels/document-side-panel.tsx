// A side panel beside the document: the base library's DockPanel, docked at the document's start
// or end, holding built-in panes (the outline, search and replace, the properties) and the host's
// own panes, each a tab. The document editor places it beside its scrolling pages (`panels`).

import { InfoGlyph, ListTaskGlyph, SearchGlyph } from '@flamboyantengineer/ui-components/core';
import { DockPanel, DockPanelPane } from '@flamboyantengineer/ui-components/dock-panel';
import type { IconSource } from '@flamboyantengineer/ui-components/icon';
import type { ReactNode } from 'react';
import type { TemplateFile } from '../../model/index.js';
import { type EditorContext, useDocumentEditor } from '../document-editor/document-editor.js';
import { DocumentOutline } from './document-outline.js';
import { DocumentProperties } from './document-properties.js';
import { DocumentSearchPane } from './document-search-pane.js';
import { DEFAULT_PANELS_LABELS, type DocumentPanelsLabels } from './panel-labels.js';

/** A pane a host adds to a side panel. */
export interface DocumentPane {
  /** Unique in its panel. */
  readonly id: string;
  /** Names the pane and its tab. */
  readonly label: string;
  /** The tab's icon. */
  readonly icon: IconSource;
  /** A count on the tab, such as of open items. */
  readonly count?: number | null | undefined;
  /** The pane's content, given the editor's context while it is mounted. */
  readonly render: (context: EditorContext) => ReactNode;
}

/** A built-in pane, by its id. */
export type BuiltInPane = 'outline' | 'search' | 'properties';

/** What a side panel holds and where it docks. */
export interface DocumentSidePanelProps {
  /** The edge it docks against: the document's `start` or its `end`. */
  readonly position: 'start' | 'end';
  /** Its panes, in order: built-in ones by id, and the host's. */
  readonly panes: readonly (BuiltInPane | DocumentPane)[];
  /** The template the outline and search number headings by, and the properties read pages from. */
  readonly template?: TemplateFile | undefined;
  /** Names the panel; the panels' labels by default. */
  readonly label?: string | undefined;
  readonly labels?: Partial<DocumentPanelsLabels> | undefined;
  /** Saves the panel's selected pane, expanded state and size under this key. */
  readonly persistKey?: string | undefined;
  /** Whether the panel starts expanded. Defaults to true. */
  readonly defaultExpanded?: boolean | undefined;
  /** Its width at first, in pixels. */
  readonly defaultSize?: number | undefined;
  readonly className?: string | undefined;
}

// A built-in pane as a host pane.
function builtIn(
  id: BuiltInPane,
  template: TemplateFile | undefined,
  labels: DocumentPanelsLabels,
): DocumentPane {
  switch (id) {
    case 'outline':
      return {
        id,
        label: labels.outline,
        icon: ListTaskGlyph,
        render: (context) => (
          <DocumentOutline context={context} template={template} aria-label={labels.outline} />
        ),
      };
    case 'search':
      return {
        id,
        label: labels.search,
        icon: SearchGlyph,
        render: (context) => <DocumentSearchPane context={context} template={template} />,
      };
    case 'properties':
      return {
        id,
        label: labels.properties,
        icon: InfoGlyph,
        render: (context) => (
          <DocumentProperties context={context} template={template} labels={labels} />
        ),
      };
  }
}

/** A side panel of panes beside the document, inside the editor or given its context. */
export function DocumentSidePanel(props: DocumentSidePanelProps) {
  const context = useDocumentEditor();
  if (!context) return null;
  const labels = { ...DEFAULT_PANELS_LABELS, ...props.labels };
  const panes = props.panes.map((pane) =>
    typeof pane === 'string' ? builtIn(pane, props.template, labels) : pane,
  );
  return (
    <DockPanel
      className={props.className}
      label={props.label ?? (props.position === 'start' ? labels.startPanel : labels.endPanel)}
      position={props.position}
      persistKey={props.persistKey}
      defaultExpanded={props.defaultExpanded}
      defaultSize={props.defaultSize ?? 280}
      minSize={200}
      minMainSize={480}
    >
      {panes.map((pane) => (
        <DockPanelPane
          key={pane.id}
          id={pane.id}
          label={pane.label}
          icon={pane.icon}
          count={pane.count}
        >
          {pane.render(context)}
        </DockPanelPane>
      ))}
    </DockPanel>
  );
}

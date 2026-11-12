// A side panel beside the document: the base library's DockPanel, docked at the document's start
// or end, holding built-in panes (the outline, search and replace, the properties, the comments and
// the contributors) and the host's own panes, each a tab. The document editor places it beside its
// scrolling pages (`panels`). Its selected pane, expanded state and size are each controlled or
// held by the panel; the editor's handle reveals a pane in it (`revealPane`).

import {
  booleanCodec,
  type Key,
  keyCodec,
  usePersistentState,
} from '@flamboyantengineer/ui-components/core';
import { DockPanel, DockPanelPane } from '@flamboyantengineer/ui-components/dock-panel';
import type { IconSource } from '@flamboyantengineer/ui-components/icon';
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import type { IdentityAdapter } from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import { SharedCommentThreadsContext } from '../document-comments/document-comments.js';
import { type EditorContext, useDocumentEditor } from '../document-editor/document-editor.js';
import { builtInPane } from './built-in-panes.js';
import { type RevealPaneOptions, useEditorPanesContext } from './document-panels.js';
import type { DocumentPropertiesProps } from './document-properties.js';
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
export type BuiltInPane = 'outline' | 'search' | 'properties' | 'comments' | 'contributors';

/** What a side panel holds and where it docks. */
export interface DocumentSidePanelProps {
  /** The edge it docks against: the document's `start` or its `end`. */
  readonly position: 'start' | 'end';
  /** Its panes, in order: built-in ones by id, and the host's. */
  readonly panes: readonly (BuiltInPane | DocumentPane)[];
  /** The template the outline and search number headings by, and the properties read pages from. */
  readonly template?: TemplateFile | undefined;
  /** The properties pane's sections and the host's additions to them. */
  readonly properties?: Pick<DocumentPropertiesProps, 'sections' | 'extend'> | undefined;
  /** Names the contributors; the editor's comment identity by default. */
  readonly identity?: IdentityAdapter | undefined;
  /** Shows or hides authorship from the contributors pane (the editor's `authorship`). */
  readonly onAuthorshipChange?: ((shown: boolean) => void) | undefined;
  /** Names the panel; the panels' labels by default. */
  readonly label?: string | undefined;
  readonly labels?: Partial<DocumentPanelsLabels> | undefined;
  /** The selected pane's id (controlled). */
  readonly selectedPane?: string | undefined;
  /** The pane selected at first when uncontrolled; the first pane by default. */
  readonly defaultSelectedPane?: string | undefined;
  /** Receives the id of each pane a tab, a launcher or `revealPane` selects. */
  readonly onSelectedPaneChange?: ((paneId: string) => void) | undefined;
  /** Whether the selected pane shows (controlled). */
  readonly isExpanded?: boolean | undefined;
  /** Whether the panel starts expanded when uncontrolled. Defaults to true. */
  readonly defaultExpanded?: boolean | undefined;
  /** Receives each expanded state the toggle, a launcher or `revealPane` asks for. */
  readonly onExpandedChange?: ((isExpanded: boolean) => void) | undefined;
  /** Its width, in pixels (controlled). */
  readonly size?: number | undefined;
  /** Its width at first when uncontrolled, in pixels. Defaults to 280. */
  readonly defaultSize?: number | undefined;
  /** Receives the width a resize ends at. */
  readonly onSizeChange?: ((size: number) => void) | undefined;
  /** Its narrowest width, in pixels. Defaults to 200. */
  readonly minSize?: number | undefined;
  /** Its widest width, in pixels. Defaults to 640. */
  readonly maxSize?: number | undefined;
  /** Saves the panel's selected pane, expanded state and size under this key. */
  readonly persistKey?: string | undefined;
  readonly className?: string | undefined;
}

const hooks = createHooks('document-side-panel', ['pane']);

const FOCUSABLE =
  'input:not([disabled]), textarea, select, button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

const valueKey = (persistKey: string | undefined, name: string) =>
  persistKey === undefined ? undefined : `${persistKey}:${name}`;

// The selected pane and expanded state, each controlled or held (and saved) by the panel, which a
// reveal sets as a tab or a launcher would.
function usePanelState(props: DocumentSidePanelProps, firstPane: string | undefined) {
  const [ownPane, setOwnPane] = usePersistentState<Key | null>(
    valueKey(props.persistKey, 'selected'),
    props.defaultSelectedPane ?? null,
    { codec: keyCodec },
  );
  const [ownExpanded, setOwnExpanded] = usePersistentState(
    valueKey(props.persistKey, 'expanded'),
    props.defaultExpanded ?? true,
    { codec: booleanCodec },
  );
  const selectedPane = props.selectedPane ?? (ownPane === null ? firstPane : String(ownPane));
  const isExpanded = props.isExpanded ?? ownExpanded;
  const select = (paneId: string) => {
    setOwnPane(paneId);
    props.onSelectedPaneChange?.(paneId);
  };
  const expand = (next: boolean) => {
    setOwnExpanded(next);
    props.onExpandedChange?.(next);
  };
  return { selectedPane, isExpanded, select, expand };
}

// Registers the panel with the editor's handle, and moves focus into a pane it revealed once the
// pane shows.
function useRevealedPanes(
  paneIds: readonly string[],
  { select, expand, selectedPane, isExpanded }: ReturnType<typeof usePanelState>,
) {
  const panes = useEditorPanesContext();
  const panel = useRef<HTMLElement>(null);
  const [focusing, setFocusing] = useState<string | null>(null);
  const latest = useRef({ paneIds, select, expand });
  useEffect(() => {
    latest.current = { paneIds, select, expand };
  });
  useEffect(
    () =>
      panes?.add({
        has: (paneId) => latest.current.paneIds.includes(paneId),
        reveal: (paneId, options: RevealPaneOptions) => {
          latest.current.select(paneId);
          latest.current.expand(true);
          if (options.focus ?? true) setFocusing(paneId);
        },
      }),
    [panes],
  );
  useEffect(() => {
    if (focusing === null) return;
    const pane = panel.current?.querySelector<HTMLElement>(`[data-pane="${CSS.escape(focusing)}"]`);
    if (!pane || pane.closest('[hidden], [inert]')) return;
    (pane.querySelector<HTMLElement>(FOCUSABLE) ?? pane).focus();
    // Focus moves once the pane shows, after the panel commits it; the next reveal asks again.
    setFocusing(null);
  }, [focusing, selectedPane, isExpanded]);
  return panel;
}

/** A side panel of panes beside the document, inside the editor or given its context. */
export function DocumentSidePanel(props: DocumentSidePanelProps) {
  const context = useDocumentEditor();
  const editorPanes = useEditorPanesContext();
  const threads = useContext(SharedCommentThreadsContext);
  const labels = { ...DEFAULT_PANELS_LABELS, ...props.labels };
  const sources = { props, labels, comments: editorPanes?.comments, threads };
  const panes = props.panes.flatMap((pane) => {
    const shown = typeof pane === 'string' ? builtInPane(pane, sources) : pane;
    return shown ? [shown] : [];
  });
  const state = usePanelState(props, panes[0]?.id);
  const panel = useRevealedPanes(
    panes.map((pane) => pane.id),
    state,
  );
  if (!context) return null;
  return (
    <DockPanel
      ref={panel}
      {...hooks.root({ className: props.className })}
      label={props.label ?? (props.position === 'start' ? labels.startPanel : labels.endPanel)}
      position={props.position}
      persistKey={props.persistKey}
      selectedKey={state.selectedPane}
      onSelectionChange={(key) => state.select(String(key))}
      isExpanded={state.isExpanded}
      onExpandedChange={state.expand}
      size={props.size}
      defaultSize={props.defaultSize ?? 280}
      onSizeChangeEnd={props.onSizeChange}
      minSize={props.minSize ?? 200}
      maxSize={props.maxSize}
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
          <div {...hooks.slot('pane', { pane: pane.id })} tabIndex={-1}>
            {pane.render(context)}
          </div>
        </DockPanelPane>
      ))}
    </DockPanel>
  );
}

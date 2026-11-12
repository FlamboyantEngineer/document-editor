// The editor's status bar: the page in view, the words of the document or the selection, the
// proofing issues when the document is proofed, the other people in it, whether the writer is
// editing, suggesting, commenting or reading, where the session's room connection is and where its
// changes stand at its start;
// the layout switch and the zoom at its end. The host rearranges the items and adds its own.

import { StatusBar } from '@flamboyantengineer/ui-components/layout';
import { ZoomControl } from '@flamboyantengineer/ui-components/zoom-control';
import type { ReactNode } from 'react';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { ConnectionStatusItem, type EditorSession, SaveStatusItem } from './save-status-item.js';
import { LayoutToggle } from './status-controls.js';
import {
  DocumentModeStatus,
  DocumentPageStatus,
  DocumentPresence,
  DocumentProofingLanguage,
  DocumentProofingStatus,
  DocumentWordStatus,
} from './status-items.js';
import type { DocumentLayout } from './use-document-layout.js';

// The status bar's slots, in the editor's hooks.
const hooks = createHooks('document-editor', ['status-start', 'status-end', 'status-item', 'zoom']);

/** The document's zoom, the levels the reader steps through and how they change it. */
export interface EditorZoom {
  readonly value: number;
  readonly onChange: (zoom: number) => void;
  /** In percent, ascending. */
  readonly levels: readonly number[];
}

/** The zoom levels the reader steps through by default, in percent. */
export const ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150, 200] as const;

/** An item of the status bar: the editor's (`STATUS_BAR_ITEMS`) or the host's. */
export interface StatusBarItem {
  /** What it reports, published as `data-status`. */
  readonly id: string;
  /** The end of the bar it sits at. */
  readonly side: 'start' | 'end';
  readonly content: ReactNode;
}

/** How the host shapes the status bar. */
export interface DocumentStatusBarOptions {
  /**
   * Rearranges the editor's items: reorders them, drops them, moves them to the other end or adds
   * the host's own, such as the document's state.
   */
  readonly arrange?: ((items: readonly StatusBarItem[]) => readonly StatusBarItem[]) | undefined;
}

/** The editor's status items, in the order the bar shows them. */
export const STATUS_BAR_ITEMS = [
  'page',
  'words',
  'proofing',
  'presence',
  'mode',
  'connection',
  'save',
  'layout',
  'zoom',
] as const;

interface DocumentStatusBarProps {
  labels: DocumentEditorLabels;
  layout: DocumentLayout;
  /** How the host shapes the bar. */
  options: DocumentStatusBarOptions;
  /** The document's session, whose save status the bar shows. */
  session?: EditorSession | undefined;
  /** The document's zoom and how the reader changes it, when they can. */
  zoom?: EditorZoom | null;
  /** Switches the layout, which the bar then offers. */
  onLayoutChange?: ((layout: DocumentLayout) => void) | undefined;
  className?: string | undefined;
}

// The editor's own items, those its props leave out aside.
function editorItems({
  labels,
  layout,
  session,
  zoom,
  onLayoutChange,
}: DocumentStatusBarProps): StatusBarItem[] {
  const items: StatusBarItem[] = [
    { id: 'page', side: 'start', content: <DocumentPageStatus /> },
    { id: 'words', side: 'start', content: <DocumentWordStatus /> },
    {
      id: 'proofing',
      side: 'start',
      content: (
        <>
          <DocumentProofingLanguage />
          <DocumentProofingStatus />
        </>
      ),
    },
    { id: 'presence', side: 'start', content: <DocumentPresence /> },
    { id: 'mode', side: 'start', content: <DocumentModeStatus /> },
  ];
  if (session?.connection) {
    const content = <ConnectionStatusItem connection={session.connection} />;
    items.push({ id: 'connection', side: 'start', content });
  }
  if (session)
    items.push({ id: 'save', side: 'start', content: <SaveStatusItem session={session} /> });
  if (onLayoutChange) {
    items.push({
      id: 'layout',
      side: 'end',
      content: <LayoutToggle layout={layout} labels={labels} onChange={onLayoutChange} />,
    });
  }
  if (zoom) {
    items.push({
      id: 'zoom',
      side: 'end',
      content: (
        <ZoomControl
          {...hooks.slot('zoom')}
          aria-label={labels.zoom}
          levels={zoom.levels}
          value={zoom.value}
          resetValue={100}
          onChange={zoom.onChange}
        />
      ),
    });
  }
  return items;
}

// The items at one end of the bar.
function itemsAt(items: readonly StatusBarItem[], side: StatusBarItem['side']) {
  return items
    .filter((item) => item.side === side)
    .map((item) => (
      <span key={item.id} {...hooks.slot('status-item', { status: item.id })}>
        {item.content}
      </span>
    ));
}

/** The editor's status bar, reporting on the editor it is in. */
export function DocumentStatusBar(props: DocumentStatusBarProps) {
  const { options, labels, className } = props;
  const builtIn = editorItems(props);
  const items = options.arrange ? options.arrange(builtIn) : builtIn;
  return (
    <StatusBar className={className} aria-label={labels.statusBar}>
      <span {...hooks.slot('status-start')}>{itemsAt(items, 'start')}</span>
      <span {...hooks.slot('status-end')}>{itemsAt(items, 'end')}</span>
    </StatusBar>
  );
}

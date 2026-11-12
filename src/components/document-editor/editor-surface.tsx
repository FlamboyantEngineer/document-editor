// The editor's surface around its engine: the chrome above the document, the banners, the document
// between the panels beside it in its scrolling frame, and the chrome below it.

import { ScrollRegion } from '@flamboyantengineer/ui-components/scroll-region';
import type { ReactNode, RefObject } from 'react';
import { createHooks } from '../../utils/hooks.js';
import { DocumentBanners } from './banners.js';
import type { DocumentEditorProps } from './document-editor.js';
import type { FindRequest } from './document-find-bar.js';
import { BottomChrome, type ChromeProps, TopChrome } from './editor-chrome.js';
import type { ObjectDialog } from './editor-context.js';

const hooks = createHooks('document-editor', ['workspace', 'viewport']);

/** What the surface shows around the document. */
export interface EditorSurfaceProps {
  readonly chrome: ChromeProps;
  readonly root: RefObject<HTMLElement | null>;
  readonly findRequest: FindRequest | null;
  readonly onFindClose: () => void;
  readonly openDialog: (dialog: ObjectDialog) => void;
  /** The template's font families that did not load. */
  readonly missingFonts: readonly string[];
  /** The document with its handles. */
  readonly children: ReactNode;
}

// The document between the panels beside it, when there are any.
function Workspace({
  panels,
  children,
}: {
  panels: DocumentEditorProps['panels'];
  children: ReactNode;
}) {
  if (!panels?.start && !panels?.end) return children;
  return (
    <div {...hooks.slot('workspace')}>
      {panels.start}
      {children}
      {panels.end}
    </div>
  );
}

/** The chrome, the banners and the document, in its frame while the editor scrolls it. */
export function EditorSurface({
  chrome,
  root,
  findRequest,
  onFindClose,
  openDialog,
  missingFonts,
  children,
}: EditorSurfaceProps) {
  const { props, context, view } = chrome;
  return (
    <>
      <TopChrome {...chrome} findRequest={findRequest} onFindClose={onFindClose} />
      <DocumentBanners
        root={root}
        view={view}
        state={context.state}
        template={props.template}
        editable={context.editable}
        labels={context.labels}
        banners={props.banners}
        missingFonts={missingFonts}
      />
      <Workspace panels={props.panels}>
        {props.scrollable ? (
          <ScrollRegion {...hooks.slot('viewport')} axis="both" scrollbar="overlay" tabIndex={-1}>
            {children}
          </ScrollRegion>
        ) : (
          children
        )}
      </Workspace>
      <BottomChrome {...chrome} openDialog={openDialog} />
    </>
  );
}

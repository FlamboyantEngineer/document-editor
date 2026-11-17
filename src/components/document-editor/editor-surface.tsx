// The editor's surface around its engine: the chrome above the document, the banners, the document
// between the panels beside it in its named scrolling frame, and the chrome below it, all inside
// the editor's live regions (`Announcer`).

import { Announcer } from '@flamboyantengineer/ui-components/announcer';
import { ScrollRegion } from '@flamboyantengineer/ui-components/scroll-region';
import { type ReactNode, type RefObject, useState } from 'react';
import { createHooks } from '../../utils/hooks.js';
import { DocumentBanners } from './banners.js';
import { DebugPane, debugPaneView } from './debug-pane.js';
import type { DocumentEditorProps } from './document-editor.js';
import {
  type BottomChromeProps,
  type ChromeProps,
  EditorContextMenu,
  EditorTypedMenus,
  FollowingBottomChrome,
  FollowingTopChrome,
  type TopChromeProps,
} from './editor-chrome.js';
import type { ObjectDialog } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { type DocumentOverviewOptions, useDocumentOverview } from './editor-overview.js';
import { type FirstLayout, FirstLayoutCover } from './first-layout.js';
import { debugParts } from './root-data.js';

const hooks = createHooks('document-editor', ['workspace', 'center', 'viewport', 'lead']);

const NO_FONTS: readonly string[] = [];

const NO_OVERVIEW_OPTIONS: DocumentOverviewOptions = {};

/** What the surface shows around the document. */
interface EditorSurfaceProps {
  readonly chrome: ChromeProps;
  /** What the chrome above and below the document follows, deferred there (DOCE-EDITOR-1.7). */
  readonly following: { readonly top: TopChromeProps; readonly bottom: BottomChromeProps };
  readonly root: RefObject<HTMLElement | null>;
  readonly openDialog: (dialog: ObjectDialog) => void;
  /** The template's font families that did not load. */
  readonly missingFonts: readonly string[];
  /** Where the pages stand against their first layout. */
  readonly firstLayout: FirstLayout;
  /** Where the pages are measured, in page layout; the debugging pane holds its element. */
  readonly measureIn: RefObject<HTMLDivElement | null> | null;
  /** The document with its handles. */
  readonly children: ReactNode;
}

// The document between the panels beside it. The element is there without panels too (`data-panels`
// tells when it holds one), so a panel the host shows or hides leaves the document where it is in
// the tree: its view, its focus and the scroll position stay. While the debugging pane shows, it
// stands in for the end panel, which comes back as it was when the pane goes. The banners float
// over the top of the document, between the panels, so coming and going they move nothing.
function Workspace({
  panels,
  debug,
  banners,
  children,
}: {
  panels: DocumentEditorProps['panels'];
  debug: { readonly pane: ReactNode; readonly isShown: boolean };
  banners: ReactNode;
  children: ReactNode;
}) {
  const end = debug.isShown ? null : panels?.end;
  const held = Boolean(panels?.start) || Boolean(end) || debug.isShown;
  return (
    <div {...hooks.slot('workspace', { panels: held })}>
      {panels?.start}
      <div {...hooks.slot('center')}>
        {banners}
        {children}
      </div>
      {debug.pane}
      {end}
    </div>
  );
}

// The host's lead before the document, then its placeholder while the pages await their first
// layout or the error when that layout failed, before the document they stand in for.
function SurfaceContent({
  props,
  firstLayout,
  failedText,
  children,
}: {
  props: DocumentEditorProps;
  firstLayout: FirstLayout;
  failedText: string;
  children: ReactNode;
}) {
  return (
    <>
      {props.lead ? <div {...hooks.slot('lead')}>{props.lead}</div> : null}
      <FirstLayoutCover
        firstLayout={firstLayout}
        placeholder={props.placeholder}
        failedText={failedText}
      />
      {children}
    </>
  );
}

// Why the pages are not shown: the template fonts that did not load, else a failed layout.
const failedText = (labels: DocumentEditorLabels, missingFonts: readonly string[]) =>
  missingFonts.length > 0 ? labels.fontsFailed(missingFonts) : labels.layoutFailed;

// The host's banners and the editor's own, over the document.
function EditorBanners({
  chrome: { props, context, view },
  root,
  missingFonts,
}: Pick<EditorSurfaceProps, 'chrome' | 'root' | 'missingFonts'>) {
  return (
    <DocumentBanners
      root={root}
      view={view}
      state={context.state}
      template={props.template}
      // A suggesting writer cannot bring the template's sections back, so no drift shows.
      editable={context.editable && !(props.suggesting ?? false)}
      labels={context.labels}
      banners={props.banners}
      missingFonts={missingFonts}
      session={props.session}
    />
  );
}

/** The chrome, the banners and the document, in its frame while the editor scrolls it. */
export function EditorSurface({
  chrome,
  following,
  root,
  openDialog,
  missingFonts,
  firstLayout,
  measureIn,
  children,
}: EditorSurfaceProps) {
  const { props, context, view } = chrome;
  const shown = debugPaneView(debugParts(props.debug), measureIn !== null);
  const pane = (
    <DebugPane
      shown={shown}
      view={view}
      pages={chrome.pages}
      labels={context.labels}
      measureIn={measureIn}
    />
  );
  const [region, setRegion] = useState<HTMLDivElement | null>(null);
  const overviewLayers = useDocumentOverview(
    region,
    view,
    props.scrollable && props.overview
      ? props.overview === true
        ? NO_OVERVIEW_OPTIONS
        : props.overview
      : null,
  );
  const content = (
    <SurfaceContent
      props={props}
      firstLayout={firstLayout}
      failedText={failedText(context.labels, missingFonts)}
    >
      {children}
    </SurfaceContent>
  );
  return (
    <Announcer>
      <FollowingTopChrome {...following.top} />
      <Workspace
        panels={props.panels}
        debug={{ pane, isShown: shown !== null }}
        banners={
          <EditorBanners
            chrome={chrome}
            root={root}
            missingFonts={firstLayout === 'shown' ? missingFonts : NO_FONTS}
          />
        }
      >
        {props.scrollable ? (
          <>
            <ScrollRegion
              {...hooks.slot('viewport')}
              ref={setRegion}
              role="region"
              aria-label={context.labels.viewport}
              axis="both"
              scrollbar={overviewLayers ? 'native' : 'overlay'}
              overviewLayers={overviewLayers}
              tabIndex={0}
            >
              {content}
            </ScrollRegion>
          </>
        ) : (
          content
        )}
      </Workspace>
      <FollowingBottomChrome {...following.bottom} />
      <EditorContextMenu {...chrome} openDialog={openDialog} />
      <EditorTypedMenus {...chrome} />
    </Announcer>
  );
}

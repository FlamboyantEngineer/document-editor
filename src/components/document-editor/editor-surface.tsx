// The editor's surface around its engine: the chrome above the document, the banners, the document
// between the panels beside it in its named scrolling frame, and the chrome below it, all inside
// the editor's live regions (`Announcer`).

import { Announcer } from '@flamboyantengineer/ui-components/announcer';
import { ScrollRegion } from '@flamboyantengineer/ui-components/scroll-region';
import { type ReactNode, type RefObject, useState } from 'react';
import type { LayoutState } from '../../pagination/index.js';
import { createHooks } from '../../utils/hooks.js';
import { DocumentBanners } from './banners.js';
import type { DocumentEditorProps } from './document-editor.js';
import {
  type BottomChromeProps,
  type ChromeProps,
  EditorContextMenu,
  FollowingBottomChrome,
  FollowingTopChrome,
  type TopChromeProps,
} from './editor-chrome.js';
import type { ObjectDialog } from './editor-context.js';
import { DocumentOverview, type DocumentOverviewOptions } from './editor-overview.js';

const hooks = createHooks('document-editor', ['workspace', 'viewport', 'lead', 'placeholder']);

const NO_OVERVIEW_OPTIONS: DocumentOverviewOptions = {};

/** What the surface shows around the document. */
export interface EditorSurfaceProps {
  readonly chrome: ChromeProps;
  /** What the chrome above and below the document follows, deferred there (DOCE-EDITOR-1.7). */
  readonly following: { readonly top: TopChromeProps; readonly bottom: BottomChromeProps };
  readonly root: RefObject<HTMLElement | null>;
  readonly openDialog: (dialog: ObjectDialog) => void;
  /** The template's font families that did not load. */
  readonly missingFonts: readonly string[];
  readonly layoutState: LayoutState;
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

// Whether the pages have yet to be laid out for the first time; once they have, they stay shown
// through every later layout.
function useAwaitingFirstLayout(isPaged: boolean, layoutState: LayoutState): boolean {
  const [laidOut, setLaidOut] = useState(false);
  if (!laidOut && layoutState !== 'pending') setLaidOut(true);
  return isPaged && !laidOut && layoutState === 'pending';
}

// The host's lead before the document, and its placeholder while the pages await their first
// layout, before the document it stands in for.
function SurfaceContent({
  props,
  isAwaiting,
  children,
}: {
  props: DocumentEditorProps;
  isAwaiting: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {props.lead ? <div {...hooks.slot('lead')}>{props.lead}</div> : null}
      {isAwaiting && props.placeholder ? (
        <div {...hooks.slot('placeholder')} role="status" aria-busy="true">
          {props.placeholder}
        </div>
      ) : null}
      {children}
    </>
  );
}

/** The chrome, the banners and the document, in its frame while the editor scrolls it. */
export function EditorSurface({
  chrome,
  following,
  root,
  openDialog,
  missingFonts,
  layoutState,
  children,
}: EditorSurfaceProps) {
  const { props, context, view } = chrome;
  const isAwaiting = useAwaitingFirstLayout((props.layout ?? 'page') === 'page', layoutState);
  const [region, setRegion] = useState<HTMLDivElement | null>(null);
  const content = (
    <SurfaceContent props={props} isAwaiting={isAwaiting}>
      {children}
    </SurfaceContent>
  );
  return (
    <Announcer>
      <FollowingTopChrome {...following.top} />
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
          <>
            <ScrollRegion
              {...hooks.slot('viewport')}
              ref={setRegion}
              role="region"
              aria-label={context.labels.viewport}
              axis="both"
              scrollbar="overlay"
              tabIndex={0}
            >
              {content}
            </ScrollRegion>
            {props.overview && region ? (
              <DocumentOverview
                region={region}
                view={view}
                options={props.overview === true ? NO_OVERVIEW_OPTIONS : props.overview}
              />
            ) : null}
          </>
        ) : (
          content
        )}
      </Workspace>
      <FollowingBottomChrome {...following.bottom} />
      <EditorContextMenu {...chrome} openDialog={openDialog} />
    </Announcer>
  );
}

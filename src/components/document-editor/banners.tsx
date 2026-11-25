// The editor's banner region, floating over the top of the document between the panels: the host's
// banners, then the editor's own, telling the writer a change suggest mode could not record, that
// the document's scripts are running or failed,
// that the document is out of step with its template, which of the template's fonts did not
// load and that the pages cannot be laid out. The region scrolls on its own, so a long stack
// never pushes the document; banners that come or go while the reader drags, selects or resizes
// wait for the gesture to end, so nothing changes under the pointer.

import { Banner } from '@flamboyantengineer/ui-components/banner';
import { Button } from '@flamboyantengineer/ui-components/button';
import type { Tone } from '@flamboyantengineer/ui-components/core';
import { ScrollRegion } from '@flamboyantengineer/ui-components/scroll-region';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { scriptsState } from '../../engine/script-state.js';
import { suggestionRefusalOf } from '../../engine/suggestion-refusal.js';
import {
  type SectionDrift,
  syncTemplateSections,
  templateSectionDrift,
} from '../../engine/template-sync.js';
import type { FontsAdapter } from '../../host/index.js';
import { findTemplateSection, type TemplateFile } from '../../model/index.js';
import type { BrowserLayoutReason } from '../../pagination/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { EditorSession } from './save-status-item.js';
import { runCommand } from './table-actions.js';
import { useTemplateUpdateBanner } from './template-update-banner.js';

/** A banner the host shows above the document. */
export interface DocumentBanner {
  /** Tells the banners apart, published as `data-banner`. */
  readonly id: string;
  /** Defaults to `neutral`; `danger` interrupts a screen reader. */
  readonly tone?: Tone | undefined;
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  /** Controls for the reader's next step. */
  readonly actions?: ReactNode;
  /** Offers to dismiss the banner, which the host then stops passing. */
  readonly onDismiss?: (() => void) | undefined;
  /** Work is in progress: the banner shows a busy indicator. */
  readonly isPending?: boolean | undefined;
}

/** The editor's own banners, published as `data-banner`. */
export const EDITOR_BANNERS = [
  'suggestion-refused',
  'scripts-running',
  'script-error',
  'template-update',
  'template-drift',
  'fonts-missing',
  'pages-unavailable',
] as const;

const hooks = createHooks('document-editor', ['banners']);

// How long the document rests before the editor checks it against its template again, since the
// check reads every section the writer cannot edit.
const DRIFT_DELAY = 500;

// The banners shown: the latest, or those shown when a gesture began, until it ends.
function useHeldDuringGesture(
  root: RefObject<HTMLElement | null>,
  banners: readonly DocumentBanner[],
): readonly DocumentBanner[] {
  const [held, setHeld] = useState<readonly DocumentBanner[] | null>(null);
  const latest = useRef(banners);
  useEffect(() => {
    latest.current = banners;
  });
  useEffect(() => {
    const element = root.current;
    const owner = element?.ownerDocument.defaultView;
    if (!element || !owner) return undefined;
    const hold = () => setHeld(latest.current);
    const release = () => setHeld(null);
    element.addEventListener('pointerdown', hold);
    owner.addEventListener('pointerup', release);
    owner.addEventListener('pointercancel', release);
    return () => {
      element.removeEventListener('pointerdown', hold);
      owner.removeEventListener('pointerup', release);
      owner.removeEventListener('pointercancel', release);
    };
  }, [root]);
  return held ?? banners;
}

/**
 * The sections of an editable document out of step with its template, checked once the document
 * has rested.
 */
function useTemplateDrift(state: EditorState, template: TemplateFile, isEnabled: boolean) {
  const [drift, setDrift] = useState<readonly SectionDrift[]>([]);
  const { doc } = state;
  useEffect(() => {
    if (!isEnabled) return undefined;
    const timer = setTimeout(() => setDrift(templateSectionDrift(doc, template)), DRIFT_DELAY);
    return () => clearTimeout(timer);
  }, [doc, template, isEnabled]);
  return isEnabled ? drift : [];
}

/**
 * The host's fonts, reporting the families the editor asked for that did not load, and the families
 * that did not; with `timeout`, each load waits that long instead of the editor's default.
 */
export function useReportedFonts(fonts: FontsAdapter | undefined, timeout?: number) {
  const [missing, setMissing] = useState<readonly string[]>([]);
  const reported = useMemo<FontsAdapter | undefined>(
    () =>
      fonts && {
        // The font files and shaper of Pretext layout pass through unchanged (DOCE-HOST-1.14.1).
        ...(fonts.files ? { files: fonts.files.bind(fonts) } : {}),
        ...(fonts.shaper ? { shaper: fonts.shaper.bind(fonts) } : {}),
        async load(families, options) {
          const result = await fonts.load(families, {
            ...options,
            timeout: timeout ?? options.timeout,
          });
          const loaded = new Set(result.ok ? result.value : []);
          setMissing(families.filter((family) => !loaded.has(family)));
          return result;
        },
      },
    [fonts, timeout],
  );
  return { fonts: reported, missing };
}

interface DocumentBannersProps {
  readonly root: RefObject<HTMLElement | null>;
  readonly view: EditorView | null;
  readonly state: EditorState;
  readonly template: TemplateFile;
  readonly editable: boolean;
  readonly labels: DocumentEditorLabels;
  /** The host's banners, before the editor's. */
  readonly banners: readonly DocumentBanner[] | undefined;
  /** The template's font families that did not load. */
  readonly missingFonts: readonly string[];
  /** Why the pages cannot be laid out, so the document shows unpaged; null while they can. */
  readonly pagesUnavailable?: BrowserLayoutReason | null | undefined;
  /** The document's session, whose newer template revision the editor offers. */
  readonly session?: EditorSession | undefined;
}

// The scripts' banners: one while scripts run, with a busy indicator, and one after a run failed,
// with the first failure's message, until the failed blocks run again or the reader dismisses it.
// Both go with the document: a state of another document has neither.
function scriptBanners(
  state: EditorState,
  { labels, dismissed, dismiss }: BannerDismissal & { labels: DocumentEditorLabels },
): DocumentBanner[] {
  const { running, failed } = scriptsState(state);
  const banners: DocumentBanner[] = [];
  if (running.size > 0) {
    banners.push({ id: 'scripts-running', isPending: true, title: labels.scriptsRunning });
  }
  const [first] = failed.values();
  const key = `script-error:${[...failed].join('\n')}`;
  if (first !== undefined && !dismissed.has(key)) {
    banners.push({
      id: 'script-error',
      tone: 'warning',
      title: labels.scriptFailed(first, failed.size),
      onDismiss: dismiss(key),
    });
  }
  return banners;
}

// The change suggest mode could not record, and why, until the writer changes the document or
// dismisses it.
function refusalBanner(
  state: EditorState,
  { labels, dismissed, dismiss }: BannerDismissal & { labels: DocumentEditorLabels },
): DocumentBanner[] {
  const refusal = suggestionRefusalOf(state);
  const key = `suggestion-refused:${String(refusal?.count)}`;
  if (!refusal || dismissed.has(key)) return [];
  return [
    {
      id: 'suggestion-refused',
      tone: 'warning',
      title: labels.suggestionRefused,
      description: labels.suggestionRefusedDetail(refusal.reason),
      onDismiss: dismiss(key),
    },
  ];
}

// Pages that cannot be laid out, as without the fonts the host serves (DOCE-HOST-1.14.1): an error
// that stays while the document shows unpaged.
function unavailableBanner(
  reason: BrowserLayoutReason | null | undefined,
  labels: DocumentEditorLabels,
): DocumentBanner[] {
  if (!reason) return [];
  return [
    {
      id: 'pages-unavailable',
      tone: 'danger',
      title: labels.pagesUnavailable,
      description: labels.pagesUnavailableDetail(reason),
    },
  ];
}

interface BannerDismissal {
  readonly dismissed: ReadonlySet<string>;
  readonly dismiss: (key: string) => () => void;
}

// The editor's own banners, until the reader dismisses each.
function useEditorBanners(props: DocumentBannersProps): DocumentBanner[] {
  const { view, state, template, editable, labels, missingFonts } = props;
  const drift = useTemplateDrift(state, template, editable);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const dismiss = (key: string) => () => setDismissed((current) => new Set([...current, key]));
  const driftKey = `template-drift:${JSON.stringify(drift)}`;
  const fontsKey = `fonts-missing:${missingFonts.join('\n')}`;
  const update = useTemplateUpdateBanner(props);
  const own: DocumentBanner[] = [
    ...unavailableBanner(props.pagesUnavailable, labels),
    ...refusalBanner(state, { labels, dismissed, dismiss }),
    ...scriptBanners(state, { labels, dismissed, dismiss }),
    ...(update ? [update] : []),
  ];
  if (drift.length > 0 && !dismissed.has(driftKey)) {
    own.push({
      id: 'template-drift',
      tone: 'warning',
      title: labels.templateDrift,
      description: labels.templateDriftDetail(
        drift,
        (name) => findTemplateSection(template, name)?.label || name,
      ),
      actions: (
        <Button
          size="sm"
          isDisabled={!view}
          onPress={() => {
            if (view) runCommand(view, syncTemplateSections(template));
          }}
        >
          {labels.updateFromTemplate}
        </Button>
      ),
      onDismiss: dismiss(driftKey),
    });
  }
  if (missingFonts.length > 0 && !dismissed.has(fontsKey)) {
    own.push({
      id: 'fonts-missing',
      tone: 'warning',
      title: labels.fontsMissing,
      description: labels.fontsMissingDetail(missingFonts),
      onDismiss: dismiss(fontsKey),
    });
  }
  return own;
}

/**
 * The host's banners and the editor's own, over the top of the document in a region that scrolls on
 * its own; nothing while there are none.
 */
export function DocumentBanners(props: DocumentBannersProps) {
  const own = useEditorBanners(props);
  const shown = useHeldDuringGesture(props.root, [...(props.banners ?? []), ...own]);
  if (shown.length === 0) return null;
  return (
    <ScrollRegion
      {...hooks.slot('banners')}
      role="region"
      aria-label={props.labels.banners}
      grow={false}
      tabIndex={0}
    >
      {shown.map(({ id, ...banner }) => (
        <Banner key={id} data-banner={id} {...banner} />
      ))}
    </ScrollRegion>
  );
}

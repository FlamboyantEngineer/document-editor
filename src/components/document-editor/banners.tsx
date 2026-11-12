// The editor's banner region, between its toolbar and the document: the host's banners, then the
// editor's own, telling the writer the document is out of step with its template and which of the
// template's fonts did not load. Banners that come or go while the reader drags, selects or resizes
// wait for the gesture to end, so the document does not jump under the pointer.

import { Banner } from '@flamboyantengineer/ui-components/banner';
import { Button } from '@flamboyantengineer/ui-components/button';
import type { Tone } from '@flamboyantengineer/ui-components/core';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  type SectionDrift,
  syncTemplateSections,
  templateSectionDrift,
} from '../../engine/template-sync.js';
import type { FontsAdapter } from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { runCommand } from './table-actions.js';

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
}

/** The editor's own banners, published as `data-banner`. */
export const EDITOR_BANNERS = ['template-drift', 'fonts-missing'] as const;

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
 * that did not.
 */
export function useReportedFonts(fonts: FontsAdapter | undefined) {
  const [missing, setMissing] = useState<readonly string[]>([]);
  const reported = useMemo<FontsAdapter | undefined>(
    () =>
      fonts && {
        async load(families, options) {
          const result = await fonts.load(families, options);
          const loaded = new Set(result.ok ? result.value : []);
          setMissing(families.filter((family) => !loaded.has(family)));
          return result;
        },
      },
    [fonts],
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
}

// The editor's own banners, until the reader dismisses each.
function useEditorBanners(props: DocumentBannersProps): DocumentBanner[] {
  const { view, state, template, editable, labels, missingFonts } = props;
  const drift = useTemplateDrift(state, template, editable);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const dismiss = (key: string) => () => setDismissed((current) => new Set([...current, key]));
  const driftKey = `template-drift:${JSON.stringify(drift)}`;
  const fontsKey = `fonts-missing:${missingFonts.join('\n')}`;
  const own: DocumentBanner[] = [];
  if (drift.length > 0 && !dismissed.has(driftKey)) {
    own.push({
      id: 'template-drift',
      tone: 'warning',
      title: labels.templateDrift,
      description: labels.templateDriftDetail(drift),
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

/** The host's banners and the editor's own, above the document; nothing while there are none. */
export function DocumentBanners(props: DocumentBannersProps) {
  const own = useEditorBanners(props);
  const shown = useHeldDuringGesture(props.root, [...(props.banners ?? []), ...own]);
  if (shown.length === 0) return null;
  return (
    <section {...hooks.slot('banners')} aria-label={props.labels.banners}>
      {shown.map(({ id, ...banner }) => (
        <Banner key={id} data-banner={id} {...banner} />
      ))}
    </section>
  );
}

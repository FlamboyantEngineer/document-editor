// Keeps a document editor's state in its layout. Each section is shown in its template section's
// scope, and its changes from an older version, when there is one, are shown on it. On pages, a
// projection measures the document in a hidden view inside the editor and lays it out after every
// change, each section on pages of its own size; in the web layout each section is one page, so
// leaving the pages joins them back.

import type {
  RichTextNodeViewProps,
  RichTextStateUpdate,
} from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState, Plugin, Transaction } from 'prosemirror-state';
import { type ComponentType, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CompareSuggestions,
  contentsKey,
  documentSectionsKey,
  refreshVersionChanges,
  type RegionChange,
  renumberFootnotes,
  unpagedNumbering,
  type VersionChangeDisplay,
} from '../../engine/index.js';
import type {
  FontsAdapter,
  GlossaryAdapter,
  ReferenceSourceAdapter,
  ScriptRunnerAdapter,
  TelemetryAdapter,
  VariablesAdapter,
} from '../../host/index.js';
import {
  type FragmentRules,
  joinDocumentPages,
  type LayoutRules,
  resolveFootnoteSettings,
  type TemplateFile,
  type TemplatePartChange,
} from '../../model/index.js';
import {
  type CanonicalChange,
  type CanonicalTaken,
  type LayoutState,
  pageDebugKey,
  type PageDebugParts,
  type TextLayoutMode,
} from '../../pagination/index.js';
import type { DocumentEditorDebug } from './document-editor.js';
import { type EditorContentsOptions, lackedPlugins } from './editor-contents.js';
import type { DocumentMarkup } from './editor-context.js';
import { useLayoutMarkup } from './layout-markup.js';
import { layoutOwnPlugins } from './layout-own-plugins.js';
import { type LayoutProgress, useLayoutProgress } from './layout-progress.js';
import {
  fragmentRulesOf,
  type LayoutRunner,
  type PagingRefs,
  type Redraw,
  sameRules,
  startPaging,
} from './start-paging.js';
import type { PagedEditor } from './use-paged-projection.js';
import type { PagesFontsState } from './use-pages-fonts.js';

/** How a document is shown: on pages, or as one page per section that fills its surface. */
export type DocumentLayout = 'page' | 'web';

// Editing the regions in place, or no longer, sets them again: editable or read-only.
function useRegionsEditable(
  editable: string,
  onStateChange: (update: RichTextStateUpdate) => void,
) {
  const latest = useRef(onStateChange);
  useEffect(() => {
    latest.current = onStateChange;
  });
  useEffect(() => {
    latest.current((state) =>
      state.apply(state.tr.setMeta(documentSectionsKey, true).setMeta('addToHistory', false)),
    );
  }, [editable]);
}

// Showing or hiding the layout for debugging draws the pages again.
function useLayoutDebug(
  debug: PageDebugParts | undefined,
  onStateChange: (update: RichTextStateUpdate) => void,
  redraw: RefObject<Redraw | null>,
) {
  const latest = useRef(onStateChange);
  useEffect(() => {
    latest.current = onStateChange;
  });
  const shown = `${String(debug?.pages ?? false)} ${String(debug?.blocks ?? false)}`;
  useEffect(() => {
    latest.current((state) => state.apply(state.tr.setMeta(pageDebugKey, true)));
    redraw.current?.(pageDebugKey);
  }, [shown, redraw]);
}

// Whether each scope of the template repeats a table's header rows on its pages: the template's,
// then each section's, for the pages to start over when any changes (DOCE-PAGINATION-4.5).
const repeatHeaderKey = (template: TemplateFile) =>
  [template, ...(template.sections ?? [])]
    .map((scope) => String(scope.styles?.table?.repeatHeader ?? ''))
    .join(' ');

/** What the layout hook reads. */
export interface DocumentLayoutOptions {
  readonly layout: DocumentLayout;
  readonly template: TemplateFile;
  /** How suggestions show; the engine lays out none it hides (DOCE-PAGINATION-11.12). */
  readonly markup?: DocumentMarkup | undefined;
  /** The pages' text layout and served fonts (`usePagesFonts`). */
  readonly text: PagesFontsState;
  readonly state: EditorState;
  readonly onStateChange: (update: RichTextStateUpdate) => void;
  /** The older version the document is compared with, and how its changes show. */
  readonly compare: DocumentComparison | null;
  /** Shows the pages' layout for debugging (DOCE-PAGINATION-7.4), and takes its trace. */
  readonly debug?: DocumentEditorDebug | undefined;
  /** Tells of each change of the layout state; the web layout is always settled. */
  readonly onLayoutStateChange?: ((state: LayoutState) => void) | undefined;
  /**
   * The host's layout rules by node type, over the library's (`createLayoutRules`), read as each
   * section lays out: how its blocks split and keep together (DOCE-PAGINATION-1.7).
   */
  readonly layoutRules?: LayoutRules | undefined;
  /**
   * The host's fragment rules by node type, over `FRAGMENT_RULES`, read when the pages mount: how
   * its fragments join.
   */
  readonly fragmentRules?: FragmentRules | undefined;
  /** The host's font faces, which the pages wait for (DOCE-PAGINATION-5.6). */
  readonly fonts?: FontsAdapter | undefined;
  /** How the pages lay text out: measured in the DOM, or by the layout engine (DOCE-PAGINATION-11). */
  readonly textLayout?: TextLayoutMode | undefined;
  /** Edits the pages' headers and footers in place, handing each edit here. */
  readonly onRegionChange?: ((change: RegionChange) => void) | undefined;
  /** Edits a template's section content and placeholders in place, handing each edit here. */
  readonly onTemplatePartChange?: ((change: TemplatePartChange) => void) | undefined;
  /** Runs the previews of the template's script blocks while its content is edited in place. */
  readonly scriptRunner?: ScriptRunnerAdapter | undefined;
  /**
   * The host's variables, whose texts the document stores for the variables a writer adds
   * (`createDocumentValues`).
   */
  readonly variables?: VariablesAdapter | undefined;
  /** The host's telemetry, told of a template block two editors render otherwise. */
  readonly telemetry?: TelemetryAdapter | undefined;
  /**
   * The host's React node views, whose nodes the layout engine sizes by the host's rules, never as
   * text, read when the pages mount.
   */
  readonly nodeViews?: Readonly<Record<string, ComponentType<RichTextNodeViewProps>>> | undefined;
  /**
   * Takes each canonical transaction input on the projection's pages makes; gives what another
   * transaction taken in its place made (`CanonicalTaken`).
   */
  readonly onCanonical?:
    ((tr: Transaction, made: CanonicalChange) => CanonicalTaken | undefined) | undefined;
  /** Told of each layout of the projection's pages. */
  readonly onLayout?: ((tr: Transaction) => void) | undefined;
  /** The kinds of list and labels of the lists of contents the editor draws, when it draws them. */
  readonly contents?: EditorContentsOptions | undefined;
  /** Where a list of references links each cited document. */
  readonly referenceSource?: ReferenceSourceAdapter | undefined;
  /** The glossary the abbreviations a writer adds are refreshed from. */
  readonly glossary?: Pick<GlossaryAdapter, 'resolve'> | undefined;
  /** Whether the writer edits, and edits directly rather than suggesting. */
  readonly editable?: boolean | undefined;
  readonly suggesting?: boolean | undefined;
}

/** An older version to show a document's changes from, as change bars or marked in place. */
export interface DocumentComparison {
  /** The older version, or `opened` for the document as the editor opened it. */
  readonly previous: ProseMirrorNode | 'opened';
  /** Defaults to markup. */
  readonly display?: VersionChangeDisplay | undefined;
  /** Whether the document's suggestions count as rejected (the default) or as accepted. */
  readonly suggestions?: CompareSuggestions | undefined;
  /**
   * Whether a block whose only change is in what the document generates (a reference's text, a
   * variable's value, a script's output) shows as modified. Defaults to false.
   */
  readonly generated?: boolean | undefined;
  /** The element ids compared, a heading for its headed section; the others are marked outside. */
  readonly scope?: readonly string[] | undefined;
}

// A state with its sections shown in the template again and its footnotes numbered for it, out of
// the history.
const restyleSections = (template: TemplateFile) => (state: EditorState) =>
  state.apply(
    renumberFootnotes(state.tr, unpagedNumbering(template))
      .setMeta(documentSectionsKey, true)
      .setMeta(contentsKey, true)
      .setMeta('addToHistory', false),
  );

// A state compared with the older version again, out of the history.
const recompare = (state: EditorState) => state.apply(refreshVersionChanges(state.tr));

// The pages laid out again when the host hands in other layout rules, so every section, not only
// those that change next, takes them; rules passed inline with the same entries change nothing.
function useHostRules(layoutRules: LayoutRules | undefined, refresh: PagingRefs['refresh']) {
  const seen = useRef(layoutRules);
  useEffect(() => {
    if (sameRules(seen.current, layoutRules)) return;
    seen.current = layoutRules;
    refresh.current?.();
  }, [layoutRules, refresh]);
}

// A state with each section's pages joined into one and its footnotes numbered again, out of the
// history.
function joinPages(state: EditorState, rules: FragmentRules): EditorState {
  const join = joinDocumentPages(state.doc, rules);
  const tr = renumberFootnotes(state.tr);
  for (const step of join.steps) tr.step(step);
  return state.apply(tr.setMeta('addToHistory', false));
}

// A new state the host hands in, such as another document, takes the layout's plugins again.
function useLayoutPlugins(options: DocumentLayoutOptions, own: RefObject<readonly Plugin[]>) {
  const { plugins } = options.state;
  const { onStateChange } = options;
  const latestTemplate = useRef(options.template);
  useEffect(() => {
    latestTemplate.current = options.template;
  });
  useEffect(() => {
    const layoutPlugins = own.current;
    if (layoutPlugins.every((plugin) => plugins.includes(plugin))) return;
    onStateChange((state) => {
      const absent = lackedPlugins(state, layoutPlugins);
      if (absent.length === 0) return state;
      const plugged = state.reconfigure({ plugins: [...state.plugins, ...absent] });
      return restyleSections(latestTemplate.current)(plugged);
    });
  }, [plugins, onStateChange, own]);
}

/**
 * Shows each section in its template section's scope, lays the document out on a paged projection
 * in page layout, in the document of the element `root` holds, and joins its pages in the web
 * layout. A new template restyles the sections and lays the pages out again.
 */
export function useDocumentLayout(
  root: RefObject<HTMLElement | null>,
  options: DocumentLayoutOptions,
): LayoutProgress & { readonly paged: PagedEditor | null; readonly text: PagesFontsState } {
  const { layout, template } = options;
  // The template's settings that change how the pages are laid out: the pagination starts over
  // when they do.
  const repeatHeaders = repeatHeaderKey(template);
  const footnoteNumbering = resolveFootnoteSettings(template, null).numbering ?? 'document';
  // The layout engine lays the pages' text out only with the fonts the host serves.
  const { text } = options;
  const { textLayout, fonts: servedFonts } = text;
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const refresh = useRef<(() => void) | null>(null);
  const redraw = useRef<Redraw | null>(null);
  const ownPlugins = useRef<readonly Plugin[]>([]);
  const active = useRef<LayoutRunner | null>(null);
  const [paged, setPaged] = useState<PagedEditor | null>(null);
  const markup = useLayoutMarkup(options.markup, latest, active);
  useEffect(() => {
    const own = layoutOwnPlugins(latest);
    ownPlugins.current = own;
    const { onStateChange } = latest.current;
    onStateChange((state) =>
      restyleSections(latest.current.template)(
        state.reconfigure({ plugins: [...state.plugins, ...lackedPlugins(state, own)] }),
      ),
    );
    return () => {
      ownPlugins.current = [];
      onStateChange((state) =>
        state.reconfigure({ plugins: state.plugins.filter((plugin) => !own.includes(plugin)) }),
      );
    };
  }, []);

  // A projection's pages hold nodes of the document's schema, so a document of another schema, as
  // a host opening another document may hand in, starts them over.
  const { schema } = options.state;
  useEffect(() => {
    const element = root.current;
    if (layout !== 'page' || !element) {
      latest.current.onStateChange((state) => joinPages(state, fragmentRulesOf(latest.current)));
      latest.current.onLayoutStateChange?.('settled');
      return undefined;
    }
    return startPaging(element, latest, {
      settings: { footnoteNumbering, textLayout, fonts: servedFonts, markup: markup.now },
      refs: { refresh, redraw, active, ownPlugins },
      setPaged,
    });
  }, [layout, root, repeatHeaders, footnoteNumbering, textLayout, servedFonts, schema, markup]);

  useLayoutPlugins(options, ownPlugins);

  useEffect(() => {
    latest.current.onStateChange(restyleSections(template));
    refresh.current?.();
  }, [template]);

  const { previous, display, suggestions, generated, scope } = options.compare ?? {};
  const scopeKey = scope?.join(' ');
  useEffect(() => {
    latest.current.onStateChange(recompare);
    refresh.current?.();
  }, [previous, display, suggestions, generated, scopeKey]);
  useHostRules(options.layoutRules, refresh);
  useLayoutDebug(options.debug, options.onStateChange, redraw);
  useRegionsEditable(
    `${String(Boolean(options.onRegionChange))} ${String(Boolean(options.onTemplatePartChange))}`,
    options.onStateChange,
  );
  const progress = useLayoutProgress(active, latest, markup.inMarkup);
  return useMemo(() => ({ ...progress, paged, text }), [progress, paged, text]);
}

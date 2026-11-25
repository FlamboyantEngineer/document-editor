// The served fonts an editor's pages lay their text out with on the layout engine
// (DOCE-HOST-1.14.1): the shaper and the template's faces asked for once, their faces drawn on the
// pages until the editor goes, the template the pages are drawn in with the served family for each
// generic keyword (DOCE-PAGINATION-12.5), and, when the host serves neither, the reason, with the
// document shown in the web layout in fallback fonts instead of pages.

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FontsAdapter } from '../../host/adapters.js';
import type { FontFiles } from '../../host/font-files.js';
import type { TemplateFile } from '../../model/index.js';
import { firstFamily } from '../../model/templates/template-css-values.js';
import {
  type BrowserLayoutReason,
  loadPagesFonts,
  PAGE_GENERICS,
  type PagesFonts,
  renameTemplateFonts,
  servedFamiliesOnly,
  type ServedFonts,
  servedTemplate,
  templateFontFamilies,
  type TextLayoutMode,
} from '../../pagination/index.js';
import { useReportedFonts } from './banners.js';

/** The pages' text layout, the served fonts it measures with, and why it is the browser's. */
export interface PagesFontsState {
  readonly textLayout: TextLayoutMode;
  /** Why the pages cannot be laid out, so the document shows in the web layout instead. */
  readonly reason: BrowserLayoutReason | null;
  /**
   * The served fonts, read as the pages start; a new reader for each fonts adapter, so the pages
   * start over with the adapter the editor has now (DOCE-PAGINATION-12.7).
   */
  readonly fonts: () => PromiseLike<PagesFonts> | null;
  /** The faces under the families the pages draw them in, for a snapshot of the pages. */
  readonly drawnFiles: () => FontFiles | null;
  /** The template's families no host file serves, drawn in the served body family instead. */
  readonly unserved: readonly string[];
}

interface PagesFontsProps {
  readonly fonts?: FontsAdapter | undefined;
  readonly template: TemplateFile;
  readonly layout?: 'page' | 'web' | undefined;
}

// What the pages draw with once the served fonts loaded: the served family each generic keyword
// stands for, and the family each served family is drawn under (DOCE-PAGINATION-12.8).
interface Drawn {
  readonly generics: Readonly<Record<string, string>>;
  readonly fonts: ServedFonts | null;
}

const NONE: Drawn = { generics: {}, fonts: null };
const NO_FAMILIES: readonly string[] = [];

// The served family a font no host file serves is drawn in: the template's body family, or the one
// the host serves for a generic keyword.
function fallbackFamily(template: TemplateFile, drawn: Drawn, fonts: ServedFonts): string | null {
  const body = template.styles?.paragraph?.font;
  const candidates = [body, ...PAGE_GENERICS.map((generic) => drawn.generics[generic])];
  return candidates.find((family) => family && fonts.isFontServed(firstFamily(family))) ?? null;
}

// The template the pages are drawn and laid out in: each generic as its served family, each font
// no host file serves as the served body family, and each served family under the family the
// editor draws it in; with the families no host file serves.
function drawnTemplate(
  template: TemplateFile,
  drawn: Drawn,
): { readonly template: TemplateFile; readonly unserved: readonly string[] } {
  const served = servedTemplate(template, drawn.generics);
  const fonts = drawn.fonts;
  if (!fonts) return { template: served, unserved: [] };
  const fallback = fallbackFamily(served, drawn, fonts);
  const only = fallback
    ? servedFamiliesOnly(served, { isServed: (family) => fonts.isFontServed(family), fallback })
    : { template: served, unserved: [] };
  const renamed = renameTemplateFonts(only.template, (font) => fonts.drawnFamily(font));
  return { template: renamed, unserved: only.unserved };
}

/**
 * Loads the pages' served fonts while the page layout lays its text out with the engine, and gives
 * the template the pages are drawn and laid out in.
 */
function usePagesFonts(
  props: PagesFontsProps,
  measureIn: RefObject<HTMLElement | null>,
): { readonly text: PagesFontsState; readonly template: TemplateFile } {
  const asked = (props.layout ?? 'page') === 'page';
  const [reason, setReason] = useState<BrowserLayoutReason | null>(null);
  const [drawn, setDrawn] = useState(NONE);
  const loading = useRef<{ fonts: FontsAdapter | undefined; promise: Promise<PagesFonts> } | null>(
    null,
  );
  const latestTemplate = useRef(props.template);
  useEffect(() => {
    latestTemplate.current = props.template;
  });
  const { fonts } = props;
  useEffect(() => {
    const doc = measureIn.current?.ownerDocument;
    if (!asked || !doc) return undefined;
    const controller = new AbortController();
    const families = [
      ...new Set([...templateFontFamilies(latestTemplate.current), ...PAGE_GENERICS]),
    ];
    const promise = loadPagesFonts(fonts, families, { doc, signal: controller.signal });
    const current = { fonts, promise };
    loading.current = current;
    void promise.then((loaded) => {
      if (controller.signal.aborted) return;
      if (loaded.phase === 'browser') setReason(loaded.reason);
      else setDrawn({ generics: { ...loaded.generics }, fonts: loaded });
    });
    return () => {
      controller.abort();
      if (loading.current === current) loading.current = null;
      setReason(null);
      setDrawn(NONE);
      void promise.then((loaded) => {
        if (loaded.phase === 'pretext') loaded.destroy();
      });
    };
  }, [asked, fonts, measureIn]);
  // A family the template newly names is asked of the host before it is drawn in the body family:
  // once its faces arrive, the template is drawn again with it (DOCE-PAGINATION-12.5).
  const served = drawn.fonts;
  // The template whose families were last asked for, settled or not: until then, the
  // missing-fonts banner names none of its families.
  const [settledFor, setSettledFor] = useState<TemplateFile | null>(null);
  useEffect(() => {
    if (!served) return;
    const template = props.template;
    void served.add(templateFontFamilies(template)).then((added) => {
      setSettledFor(template);
      if (!added) return;
      setDrawn((current) =>
        current.fonts === served ? { generics: { ...served.generics }, fonts: served } : current,
      );
    });
  }, [served, props.template]);
  const textLayout: TextLayoutMode = asked && !reason ? 'pretext' : 'dom';
  const shown = asked ? reason : null;
  const shownTemplate = useMemo(
    () =>
      asked ? drawnTemplate(props.template, drawn) : { template: props.template, unserved: [] },
    [asked, props.template, drawn],
  );
  const { template } = shownTemplate;
  const unserved = settledFor === props.template ? shownTemplate.unserved : NO_FAMILIES;
  // The served fonts are read through a ref, so a new template never starts the pages over; a new
  // adapter does, through a new reader (DOCE-PAGINATION-12.7).
  const read = useCallback(() => {
    const current = loading.current;
    return current && current.fonts === fonts ? current.promise : null;
  }, [fonts]);
  const drawnFiles = useCallback(() => drawn.fonts?.drawnFiles() ?? null, [drawn]);
  const text = useMemo(
    () => ({ textLayout, reason: shown, fonts: read, drawnFiles, unserved }),
    [textLayout, shown, read, drawnFiles, unserved],
  );
  return { text, template };
}

/**
 * The editor's props as its pages are drawn, with the template in its served families, and in the
 * web layout when the pages cannot be laid out without the fonts the host serves; the host's fonts,
 * reported as they load; and the pages' text layout.
 */
export function useShownFonts<Props extends PagesFontsProps & { fontTimeout?: number | undefined }>(
  props: Props,
  measureIn: RefObject<HTMLElement | null>,
) {
  const reported = useReportedFonts(props.fonts, props.fontTimeout);
  const { text, template } = usePagesFonts({ ...props, fonts: reported.fonts }, measureIn);
  const unpaged = text.reason ? { layout: 'web' as const } : {};
  const shown =
    template === props.template && !text.reason ? props : { ...props, template, ...unpaged };
  return { props: shown, reported, text };
}

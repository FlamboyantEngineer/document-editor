// The served fonts of an editor whose pages lay their text out with the layout engine
// (`textLayout: 'pretext'`, DOCE-HOST-1.14.1): the shaper and the template's faces asked for once,
// their faces drawn on the pages until the editor goes, the template the pages are drawn in with
// the served family for each generic keyword (DOCE-PAGINATION-12.5), and the browser's layout,
// with its reason, when the host serves neither.

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FontsAdapter } from '../../host/adapters.js';
import type { FontFiles } from '../../host/font-files.js';
import type { TemplateFile } from '../../model/index.js';
import {
  type BrowserLayoutReason,
  loadPagesFonts,
  PAGE_GENERICS,
  type PagesFonts,
  renameTemplateFonts,
  type ServedFonts,
  servedTemplate,
  templateFontFamilies,
  type TextLayoutMode,
} from '../../pagination/index.js';
import { useReportedFonts } from './banners.js';

/** The pages' text layout, the served fonts it measures with, and why it is the browser's. */
export interface PagesFontsState {
  readonly textLayout: TextLayoutMode;
  /** Why the browser lays the pages out though `textLayout: 'pretext'` was asked for. */
  readonly reason: BrowserLayoutReason | null;
  /**
   * The served fonts, read as the pages start; a new reader for each fonts adapter, so the pages
   * start over with the adapter the editor has now (DOCE-PAGINATION-12.7).
   */
  readonly fonts: () => PromiseLike<PagesFonts> | null;
  /** The faces under the families the pages draw them in, for a snapshot of the pages. */
  readonly drawnFiles: () => FontFiles | null;
}

interface PagesFontsProps {
  readonly fonts?: FontsAdapter | undefined;
  readonly template: TemplateFile;
  readonly textLayout?: TextLayoutMode | undefined;
  readonly layout?: 'page' | 'web' | undefined;
}

// What the pages draw with once the served fonts loaded: the served family each generic keyword
// stands for, and the family each served family is drawn under (DOCE-PAGINATION-12.8).
interface Drawn {
  readonly generics: Readonly<Record<string, string>>;
  readonly fonts: ServedFonts | null;
}

const NONE: Drawn = { generics: {}, fonts: null };

// The template the pages are drawn and laid out in: each generic as its served family, and each
// served family under the family the editor draws it in.
function drawnTemplate(template: TemplateFile, drawn: Drawn): TemplateFile {
  const served = servedTemplate(template, drawn.generics);
  const fonts = drawn.fonts;
  if (!fonts) return served;
  return renameTemplateFonts(served, (font) => fonts.drawnFamily(font));
}

/**
 * Loads the pages' served fonts while the page layout lays its text out with the engine, and gives
 * the template the pages are drawn and laid out in.
 */
function usePagesFonts(
  props: PagesFontsProps,
  measureIn: RefObject<HTMLElement | null>,
): { readonly text: PagesFontsState; readonly template: TemplateFile } {
  const asked = (props.layout ?? 'page') === 'page' && props.textLayout === 'pretext';
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
  const textLayout: TextLayoutMode = asked && !reason ? 'pretext' : 'dom';
  const shown = asked ? reason : null;
  const template = useMemo(
    () => (asked ? drawnTemplate(props.template, drawn) : props.template),
    [asked, props.template, drawn],
  );
  // The served fonts are read through a ref, so a new template never starts the pages over; a new
  // adapter does, through a new reader (DOCE-PAGINATION-12.7).
  const read = useCallback(() => {
    const current = loading.current;
    return current && current.fonts === fonts ? current.promise : null;
  }, [fonts]);
  const drawnFiles = useCallback(() => drawn.fonts?.drawnFiles() ?? null, [drawn]);
  const text = useMemo(
    () => ({ textLayout, reason: shown, fonts: read, drawnFiles }),
    [textLayout, shown, read, drawnFiles],
  );
  return { text, template };
}

/**
 * The editor's props as its pages are drawn, with the template in its served families; the host's
 * fonts, reported as they load; and the pages' text layout.
 */
export function useShownFonts<Props extends PagesFontsProps & { fontTimeout?: number | undefined }>(
  props: Props,
  measureIn: RefObject<HTMLElement | null>,
) {
  const reported = useReportedFonts(props.fonts, props.fontTimeout);
  const { text, template } = usePagesFonts({ ...props, fonts: reported.fonts }, measureIn);
  const shown = template === props.template ? props : { ...props, template };
  return { props: shown, reported, text };
}

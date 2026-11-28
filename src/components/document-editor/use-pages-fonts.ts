// The pages lay out with the host's shaper and font faces (DOCE-HOST-1.14.1) and draw with the same
// faces. The template takes each generic's served family (DOCE-PAGINATION-12.5). If the shaper or
// faces are unavailable, the editor shows the reason and uses the web layout.

import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FontsAdapter } from '../../host/adapters.js';
import type { FontFiles } from '../../host/font-files.js';
import type { TemplateFile } from '../../model/index.js';
import {
  type BrowserLayoutReason,
  loadPagesFonts,
  PAGE_GENERICS,
  type PagesFonts,
  resolveServedTemplate,
  type ServedFonts,
  templateFontFamilies,
} from '../../pagination/index.js';
import { retryDelay } from '../../pagination/served-fonts.js';
import { aliasTemplateFonts } from '../../pagination/served-template.js';
import { familyKey } from '../../utils/font-keys.js';
import { useReportedFonts } from './banners.js';

/** The served fonts the pages are laid out with, or why they cannot be. */
export interface PagesFontsState {
  /** Why the pages cannot be laid out, so the document shows in the web layout instead. */
  readonly reason: BrowserLayoutReason | null;
  /** Whether the current template's served font requests are still pending. */
  readonly isPending: boolean;
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

// The served faces and generic mappings adopted after loading, and the aliases for drawing them.
interface Drawn {
  readonly drawing: ReturnType<ServedFonts['drawing']> | null;
  readonly fonts: ServedFonts | null;
}

const NONE: Drawn = { drawing: null, fonts: null };

// The served fonts being loaded for a fonts adapter.
interface Loading {
  readonly fonts: FontsAdapter | undefined;
  readonly promise: Promise<PagesFonts>;
}

// What a load of the served fonts shows as it goes.
interface LoadShown {
  /** A load has started; the pages read its fonts. */
  readonly loading: (current: Loading) => void;
  /** The pages cannot be laid out, for now or for good. */
  readonly unavailable: (reason: BrowserLayoutReason) => void;
  /** The served fonts arrived, or a family asked for again brought faces in. */
  readonly served: (fonts: ServedFonts) => void;
}

function sameFamilies(a: readonly string[], b: readonly string[]): boolean {
  const first = new Set(a.map(familyKey));
  const second = new Set(b.map(familyKey));
  return first.size === second.size && [...first].every((family) => second.has(family));
}

// Loads the served fonts for an adapter. A first load whose request failed or timed out is made
// again a second later, then twice as long after each next failure, at most a minute, with the
// web layout shown meanwhile (DOCE-PAGINATION-12.5); faces a family asked for again brings in are
// drawn. A load with no usable faces can succeed with different families.
function keepLoading(
  fonts: FontsAdapter | undefined,
  currentFamilies: () => readonly string[],
  { doc, shown }: { doc: Document; shown: LoadShown },
) {
  const controller = new AbortController();
  const { signal } = controller;
  let served: ServedFonts | null = null;
  let noFaces: readonly string[] | null = null;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const retried = () => {
    if (served && !signal.aborted) shown.served(served);
  };
  const attempt = (families = currentFamilies()): Promise<PagesFonts> => {
    noFaces = null;
    const promise = loadPagesFonts(fonts, families, { doc, signal, retried }).then((loaded) => {
      if (signal.aborted) {
        if (loaded.phase === 'pretext') loaded.destroy();
        return loaded;
      }
      if (loaded.phase === 'pretext') {
        served = loaded;
        shown.served(loaded);
        return loaded;
      }
      if (!loaded.retry && loaded.reason === 'no-faces') {
        noFaces = families;
        const next = templateChanged();
        // An existing projection may already be waiting on this load. It needs the current
        // template's result if the old template's failure never reaches the screen.
        if (next) return next;
      }
      shown.unavailable(loaded.reason);
      if (loaded.retry) {
        failures += 1;
        timer = setTimeout(() => void attempt(), retryDelay(failures));
      }
      return loaded;
    });
    shown.loading({ fonts, promise });
    return promise;
  };
  const templateChanged = () => {
    if (!noFaces) return undefined;
    const families = currentFamilies();
    if (sameFamilies(noFaces, families)) return undefined;
    failures = 0;
    return attempt(families);
  };
  void attempt();
  return {
    templateChanged,
    stop() {
      controller.abort();
      clearTimeout(timer);
      served?.destroy();
    },
  };
}
const NO_FAMILIES: readonly string[] = [];

// The template the pages are drawn and laid out in: each generic as its served family, each font
// no host file serves as the served body family, and each served family under the family the
// editor draws it in; with the families no host file serves.
function drawnTemplate(template: TemplateFile, drawn: Drawn) {
  const { drawing } = drawn;
  const { template: portableTemplate, unserved } = resolveServedTemplate(
    template,
    drawing?.files ?? null,
  );
  return {
    template: drawing
      ? aliasTemplateFonts(portableTemplate, drawing.drawnFamily)
      : portableTemplate,
    unserved,
  };
}

// The proposed fallback is drawn while the request is pending. Only the current template's
// completed requests can make its missing families available to the banner.
function useSettledTemplateFonts(
  template: TemplateFile,
  served: ServedFonts | null,
  setDrawn: Dispatch<SetStateAction<Drawn>>,
): boolean {
  const [settledFor, setSettledFor] = useState<{
    template: TemplateFile;
    fonts: ServedFonts;
  } | null>(null);
  useEffect(() => {
    if (!served) return undefined;
    let active = true;
    void served.add(templateFontFamilies(template)).then((added) => {
      if (active) setSettledFor({ template, fonts: served });
      // A previous template can still bring in generic mappings the current one uses.
      if (added) {
        const drawing = served.drawing();
        setDrawn((current) => (current.fonts === served ? { drawing, fonts: served } : current));
      }
    });
    return () => {
      active = false;
    };
  }, [served, template, setDrawn]);
  return settledFor?.template === template && settledFor.fonts === served;
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
  const loading = useRef<Loading | null>(null);
  const fontLoad = useRef<ReturnType<typeof keepLoading> | null>(null);
  const latestTemplate = useRef(props.template);
  useLayoutEffect(() => {
    latestTemplate.current = props.template;
  }, [props.template]);
  const { fonts } = props;
  useEffect(() => {
    const doc = measureIn.current?.ownerDocument;
    if (!asked || !doc) return undefined;
    const families = () => [
      ...new Set([...templateFontFamilies(latestTemplate.current), ...PAGE_GENERICS]),
    ];
    let latest: Loading | null = null;
    const load = keepLoading(fonts, families, {
      doc,
      shown: {
        loading(current) {
          latest = current;
          loading.current = current;
        },
        unavailable: setReason,
        served(loaded) {
          setReason(null);
          setDrawn({ drawing: loaded.drawing(), fonts: loaded });
        },
      },
    });
    fontLoad.current = load;
    return () => {
      fontLoad.current = null;
      if (loading.current === latest) loading.current = null;
      setReason(null);
      setDrawn(NONE);
      load.stop();
    };
  }, [asked, fonts, measureIn]);
  useEffect(() => {
    void fontLoad.current?.templateChanged();
  }, [props.template]);
  useEffect(() => drawn.drawing?.adopt(), [drawn]);
  const settled = useSettledTemplateFonts(props.template, drawn.fonts, setDrawn);
  const isPending = asked && !reason && !settled;
  const shown = asked ? reason : null;
  const shownTemplate = useMemo(
    () =>
      asked
        ? drawnTemplate(props.template, drawn)
        : { template: props.template, unserved: NO_FAMILIES },
    [asked, props.template, drawn],
  );
  const { template } = shownTemplate;
  const unserved = settled ? shownTemplate.unserved : NO_FAMILIES;
  // A stable reader lets a working projection add families after a template change. A new adapter
  // starts the pages over with a new reader (DOCE-PAGINATION-12.7).
  const read = useCallback(() => {
    const current = loading.current;
    return current && current.fonts === fonts ? current.promise : null;
  }, [fonts]);
  const drawnFiles = useCallback(() => drawn.drawing?.drawnFiles() ?? null, [drawn]);
  const text = useMemo(
    () => ({ reason: shown, isPending, fonts: read, drawnFiles, unserved }),
    [shown, isPending, read, drawnFiles, unserved],
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

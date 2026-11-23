// Holds a projection's text layout engine behind the `textLayout: 'pretext'` option: the engine
// module loads on first use, so an editor without the option never loads the layout engine, and
// the engine is made again for each template the pages are laid out with, when code's line
// numbers are turned on or off, and when the language the pages are drawn in changes. It
// measures with the fonts the host serves (DOCE-HOST-1.14.1), and asks for a family a new
// template names.

import type { EditorView } from 'prosemirror-view';
import type { TemplateFile } from '../model/index.js';
import { templateFontFamilies } from './fonts.js';
import type { PagesFonts } from './served-fonts.js';
import type { createPagesTextEngine, forgetFontWidths } from './text-engine.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** How a projection lays its text out with the layout engine. */
export interface TextLayoutSetting {
  /** The template the pages are laid out with now. */
  readonly template: () => TemplateFile;
  /** Whether code blocks are drawn with a gutter of line numbers now; none when not given. */
  readonly codeLineNumbers?: (() => boolean) | undefined;
  /** The node types the host draws with node views of its own. */
  readonly hostViews?: readonly string[] | undefined;
  /** The served fonts the text is measured with; no engine is made without them. */
  readonly fonts: PromiseLike<PagesFonts>;
}

/** A projection's text layout engine, once loaded. */
export interface TextEngineHolder {
  /** The engine for the template now; null until its module has loaded. */
  engine(): PagesTextEngine | null;
  /** Moves whenever the engine's lines may have changed: made again, or atoms settled. */
  version(): number;
  /** Settles once the engine's module has loaded. */
  readonly loaded: Promise<unknown>;
  /** Makes the engine again, so its atoms are measured again, as after the screen changed. */
  remeasure(): void;
  destroy(): void;
}

// The language an element's text is drawn in: its own or its nearest ancestor's `lang`, empty for
// none, as the browser reads it.
const languageOf = (element: Element) => element.closest('[lang]')?.getAttribute('lang') ?? '';

interface EngineModule {
  readonly createPagesTextEngine: typeof createPagesTextEngine;
  readonly forgetFontWidths: typeof forgetFontWidths;
}

/**
 * Loads and holds a text layout engine; `changed` is told when its atoms' sizes settle or font
 * faces load in the measuring document, which makes the engine again: widths measured before a
 * face loaded were measured in a fallback font.
 */
export function holdTextEngine(options: {
  readonly setting: TextLayoutSetting;
  readonly measureIn: HTMLElement;
  readonly changed: () => void;
  /** The view that measures the pages, which atoms are measured as drawn in. */
  readonly view?: (() => EditorView | null) | undefined;
}): TextEngineHolder {
  let made: EngineModule | null = null;
  let fonts: PagesFonts | null = null;
  let current: PagesTextEngine | null = null;
  let numbered = false;
  let spoken = '';
  let version = 0;
  let destroyed = false;
  const loaded = Promise.all([import('./text-engine.js'), options.setting.fonts]).then(
    ([module, served]) => {
      made = module;
      fonts = served;
    },
  );
  const settled = () => {
    version += 1;
    options.changed();
  };
  const drop = () => {
    current?.destroy();
    current = null;
  };
  // The engine measures again once the faces of a family the template names newly arrive.
  const askFor = (template: TemplateFile) => {
    if (fonts?.phase !== 'pretext') return;
    void fonts.add(templateFontFamilies(template)).then((added) => {
      if (!added || destroyed) return;
      drop();
      settled();
    });
  };
  // A face loading in the measuring document may change what atoms measure as drawn, so the
  // engine is made again; its text widths still come from the served files.
  const faces = options.measureIn.ownerDocument.fonts as FontFaceSet | undefined;
  const onFonts = () => {
    if (!made || destroyed || !current) return;
    drop();
    made.forgetFontWidths();
    settled();
  };
  faces?.addEventListener('loadingdone', onFonts);
  return {
    engine() {
      if (!made || destroyed || fonts?.phase !== 'pretext') return null;
      const template = options.setting.template();
      const codeLineNumbers = options.setting.codeLineNumbers?.() ?? false;
      const language = languageOf(options.measureIn);
      if (current?.template === template && numbered === codeLineNumbers && language === spoken)
        return current;
      numbered = codeLineNumbers;
      spoken = language;
      current?.destroy();
      version += 1;
      askFor(template);
      current = made.createPagesTextEngine({
        template,
        codeLineNumbers,
        language,
        measureIn: options.measureIn,
        onAtomsSettled: settled,
        view: options.view,
        hostViews: options.setting.hostViews,
        measureContext: fonts.measureContext,
        isFontServed: (family) => fonts?.phase === 'pretext' && fonts.isFontServed(family),
        reserve: fonts.reserve,
        fonts: fonts.files,
      });
      return current;
    },
    version: () => version,
    loaded,
    remeasure: drop,
    destroy() {
      destroyed = true;
      faces?.removeEventListener('loadingdone', onFonts);
      drop();
    },
  };
}
